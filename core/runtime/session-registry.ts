import type { Session } from '../../types'
import type { HerdrTarget } from '../remote/herdr'
import type { ClientId } from '../domain/client-features'
import { inboxStateFolder } from '../domain/question-history'
import { sessionFile } from '../view/session-files'
import type { SessionView } from '../view/session-view'

/**
 * What a host says about one of its sessions, for a reader that lists the sessions on this machine. A host writes it
 * inside Herdr or not. An entry whose `pid` no longer runs is for a session that ended.
 */
export type RegistryEntry = {
  format: 1
  host: ClientId
  sessionId: string
  agent: string
  /** Null until a host names a source for a session's title. */
  title: null
  projectFolder: string | null
  pid: number
  startedAt: number
  writtenAt: number
  isTurnRunning: boolean
  counts: { needsYou: number; findings: number; prs: number }
  version: string | null
  /** The Herdr app terminal the session runs in, or null outside one. */
  herdr: { terminal: string; appHome: string | null } | null
}

/** What the host knows about a session beyond its saved state. */
type RegistrySource = Pick<RegistryEntry, 'host' | 'sessionId' | 'agent' | 'projectFolder' | 'version' | 'herdr'>

/** The file calls a registry write makes. */
export type RegistryFiles = {
  /** The file names in `folder`, or none when it does not exist. */
  list(folder: string): Promise<string[]>
  /** The file's text, or null when it does not exist. */
  read(path: string): Promise<string | null>
  /** Writes a new file at `path` that only its owner can read, after making its folder readable by its owner only. */
  write(path: string, text: string): Promise<void>
  /** Moves the file at `from` over the one at `to` in one step. */
  move(from: string, to: string): Promise<void>
  remove(path: string): Promise<void>
  /** The pids among `pids` whose process runs, or null when that cannot be told. */
  livePids(pids: number[]): Promise<ReadonlySet<number> | null>
  log(text: string): void
}

/** The registry folder: `$XDG_STATE_HOME/inbox/registry`, else `~/.local/state/inbox/registry`. Null with neither. */
export function registryFolder(env: Readonly<Record<string, string | undefined>>): string | null {
  const inbox = inboxStateFolder(env)

  return inbox ? `${inbox}/registry` : null
}

/** The Herdr app terminal `target` names, as an entry gives it. */
export function registryHerdr(target: HerdrTarget | null): RegistryEntry['herdr'] {
  return target?.kind === 'terminal' ? { terminal: target.terminal, appHome: target.appHome } : null
}

const fileName = (host: ClientId, sessionId: string) => `${host}-${sessionFile(sessionId)}`

function entryOf(text: string | null): RegistryEntry | null {
  try {
    const value = text === null ? null : (JSON.parse(text) as Partial<RegistryEntry> | null)
    return value?.format === 1 && Number.isInteger(value.pid) && Number.isFinite(value.startedAt)
      ? (value as RegistryEntry)
      : null
  } catch {
    return null
  }
}

/**
 * Writes the registry entry of `source`'s session, when it differs from the saved one besides `writtenAt`, then removes the
 * entries of the same host whose process has ended. `pid` is the process whose exit ends the session; null keeps
 * the one the entry has, and writes nothing when there is no entry. A failure is logged.
 */
export async function writeRegistryEntry(
  files: RegistryFiles,
  folder: string,
  source: RegistrySource,
  s: Session,
  view: SessionView,
  now: number,
  pid: number | null,
): Promise<void> {
  try {
    const path = `${folder}/${fileName(source.host, source.sessionId)}`
    const kept = entryOf(await files.read(path))
    const owner = pid ?? kept?.pid
    if (owner === undefined) return
    const fields = {
      format: 1 as const,
      ...source,
      title: null,
      pid: owner,
      startedAt: kept && kept.pid === owner ? kept.startedAt : now,
      isTurnRunning: s.presence.isTurnRunning,
      counts: { needsYou: view.needsYou.count, findings: view.findings.count, prs: view.prs.count },
    }
    const isUnchanged =
      kept && JSON.stringify({ ...kept, writtenAt: 0 }) === JSON.stringify({ ...fields, writtenAt: 0 })
    if (isUnchanged) return
    const entry: RegistryEntry = { ...fields, writtenAt: now }
    await replaceFile(files, path, JSON.stringify(entry), now)
    await pruneEnded(files, folder, source.host, path)
  } catch (error) {
    files.log(
      `inbox: the session registry entry could not be written: ${error instanceof Error ? error.message : error}`,
    )
  }
}

/**
 * Writes `text` to a temporary file beside `path`, then moves it over `path`, so a reader never sees a part-written
 * entry. A failed write or move removes the temporary file and rejects. A temporary name never ends in `.json`.
 */
async function replaceFile(files: RegistryFiles, path: string, text: string, now: number) {
  const temporary = `${path}.${now}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    await files.write(temporary, text)
    await files.move(temporary, path)
  } catch (error) {
    await files.remove(temporary).catch(() => undefined)
    throw error
  }
}

/** Removes the entries of `host` besides `own` whose process has ended. Keeps every one when that cannot be told. */
async function pruneEnded(files: RegistryFiles, folder: string, host: ClientId, own: string) {
  const paths = (await files.list(folder))
    .filter(name => name.startsWith(`${host}-`) && name.endsWith('.json'))
    .map(name => `${folder}/${name}`)
    .filter(path => path !== own)
  const entries = await Promise.all(paths.map(async path => ({ path, entry: entryOf(await files.read(path)) })))
  const owned = entries.flatMap(({ path, entry }) => (entry ? [{ path, pid: entry.pid }] : []))
  if (owned.length === 0) return
  const live = await files.livePids([...new Set(owned.map(e => e.pid))])
  if (!live) return
  await Promise.all(owned.filter(e => !live.has(e.pid)).map(e => files.remove(e.path)))
}

/** Removes the registry entry of `host`'s session `sessionId`, as the session ends. A failure is logged. */
export async function removeRegistryEntry(
  files: RegistryFiles,
  folder: string,
  host: ClientId,
  sessionId: string,
): Promise<void> {
  await files
    .remove(`${folder}/${fileName(host, sessionId)}`)
    .catch((error: unknown) =>
      files.log(
        `inbox: the session registry entry could not be removed: ${error instanceof Error ? error.message : error}`,
      ),
    )
}
