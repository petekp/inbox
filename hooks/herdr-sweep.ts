import type { Run } from './gh'
import { HERDR_FORMAT, publishedSessionsFolder, SESSION_LABEL } from './herdr'
import { unpublishSession } from './herdr-app'
import { modTemporaryWrittenAt } from './herdr-install'
import type { PublishFiles } from './herdr-app'
import { isSessionFile } from './session-files'

/** How old a published session must be before a sweep may remove it. */
export const SWEEP_AFTER_MS = 24 * 60 * 60 * 1000

const HC_TIMEOUT_MS = 5000

/** One `terminal.list` call of herdr-core's API, which answers every live terminal with its labels. */
const LIST_REQUEST = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'terminal.list', params: {} })

type Listed = { address?: unknown; labels?: unknown }

/**
 * The sessions that live terminals' `inbox.session` labels name, in what `hc connect` printed. Null unless the list
 * holds `ownTerminal` and gives every terminal a `labels` object, since a list from another herdr-core, or one without
 * labels, would make live sessions look unnamed.
 */
function labelledIn(stdout: string, ownTerminal: string): Set<string> | null {
  for (const line of stdout.split('\n')) {
    try {
      const terminals: unknown = (JSON.parse(line) as { result?: { terminals?: unknown } } | null)?.result?.terminals
      if (!Array.isArray(terminals)) continue
      const listed = terminals as (Listed | null)[]
      const isEveryLabelled = listed.every(t => typeof t?.labels === 'object' && t.labels !== null)
      const isOwnListed = listed.some(t => t?.address === ownTerminal)
      if (!isEveryLabelled || !isOwnListed) return null
      const named = listed.map(t => (t!.labels as Record<string, unknown>)[SESSION_LABEL])

      return new Set(named.filter((id): id is string => typeof id === 'string' && id !== ''))
    } catch {
      continue
    }
  }

  return null
}

/**
 * The sessions that live terminals' `inbox.session` labels name. `hc ls` prints no labels, so this sends one
 * `terminal.list` request to `hc connect`, through `sh` since a host's `run` passes no input. It tries each `hc` in
 * turn, and resolves null when none answers with a list that holds `ownTerminal` and every terminal's labels.
 */
export async function labelledSessions(
  run: Run,
  hcs: readonly string[],
  ownTerminal: string,
): Promise<Set<string> | null> {
  for (const hc of hcs) {
    const r = await run(['/bin/sh', '-c', 'printf "%s\\n" "$1" | "$0" connect', hc, LIST_REQUEST], {
      cwd: '/',
      timeoutMs: HC_TIMEOUT_MS,
    }).catch(() => null)
    const labelled = r?.code === 0 ? labelledIn(r.stdout, ownTerminal) : null
    if (labelled) return labelled
  }

  return null
}

/** Where and when a host wrote `text`, a session the inbox published for `sessionId`, or null when it is not one. */
function published(text: string | null, sessionId: string): { terminal: unknown; writtenAt: number } | null {
  try {
    const e = JSON.parse(text ?? '') as {
      format?: unknown
      sessionId?: unknown
      terminal?: unknown
      writtenAt?: unknown
    } | null
    const isEnvelope =
      Number.isInteger(e?.format) &&
      (e!.format as number) >= 1 &&
      (e!.format as number) <= HERDR_FORMAT &&
      e!.sessionId === sessionId

    return isEnvelope && typeof e!.writtenAt === 'number' && Number.isFinite(e!.writtenAt)
      ? { terminal: e!.terminal, writtenAt: e!.writtenAt }
      : null
  } catch {
    return null
  }
}

/** The file calls a sweep needs. `list` gives the names of a folder's files and folders. */
export type SweepFiles = Pick<PublishFiles, 'remove' | 'removeFolder'> & {
  list: (folder: string) => Promise<readonly string[]>
  read: (path: string) => Promise<string>
}

/**
 * Removes each published session that no name in `labelled` names and that was written over `SWEEP_AFTER_MS` before
 * `now`, with its press folder. The Herdr look finds a session only through a terminal's label, so it can no longer
 * show these. A session published from `ownTerminal` stays, since the host starting there may not have labelled it
 * yet. A file that is not a session the inbox published, in a format this build knows, stays. Resolves with the ids
 * it removed.
 */
export async function sweepPublished(
  files: SweepFiles,
  appHome: string,
  labelled: ReadonlySet<string>,
  ownTerminal: string,
  now: number,
): Promise<string[]> {
  const folder = publishedSessionsFolder(appHome)
  const names = (await files.list(folder).catch(() => [])).filter(isSessionFile)
  const removed: string[] = []
  for (const name of names) {
    const id = name.slice(0, -'.json'.length)
    if (labelled.has(id)) continue
    const session = published(await files.read(`${folder}/${name}`).catch(() => null), id)
    if (!session || session.terminal === ownTerminal || now - session.writtenAt < SWEEP_AFTER_MS) continue
    await unpublishSession(files, appHome, id)
    removed.push(id)
  }

  return removed
}

/**
 * Removes each temporary file or folder an install, update or answer left in `<app home>/inbox/` over
 * `SWEEP_AFTER_MS` before `now`, as when its host stopped mid-write. Resolves with how many it removed.
 */
export async function sweepModTemporaries(files: SweepFiles, appHome: string, now: number): Promise<number> {
  const folder = `${appHome}/inbox`
  const names = await files.list(folder).catch(() => [])
  const stale = names.filter(name => {
    const at = modTemporaryWrittenAt(name)

    return at !== null && now - at >= SWEEP_AFTER_MS
  })
  for (const name of stale) await files.removeFolder(`${folder}/${name}`)

  return stale.length
}
