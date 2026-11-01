import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { KEPT_SESSIONS } from '../../hooks/ledger'
import {
  emptySession,
  isSessionFile,
  missingAsNull,
  sessionFile,
  staleSessionFiles,
  upgradeSession,
} from '../../hooks/session-files'
import { pruned } from '../../hooks/session-presses'
import type { Session } from '../../types'
import type { SavedSession } from '../../hooks/session-files'
import { exclusiveKeys } from '../../hooks/session-host'
import { checkVersion, SESSION_VERSION } from '../../hooks/session-version'

export type OmpState = Session & {
  version: typeof SESSION_VERSION
  sessionId: string
}

export function emptyState(sessionId: string): OmpState {
  return { version: SESSION_VERSION, sessionId, ...emptySession() }
}

export function statePath(dir: string, sessionId: string): string {
  return join(dir, 'sessions', sessionFile(sessionId))
}

type Saved = SavedSession & Partial<Pick<OmpState, 'version' | 'sessionId'>>

/** State saved by an earlier build, with any field it lacks filled in. */
function upgraded(saved: Saved, sessionId: string): OmpState {
  checkVersion(saved)
  return { version: SESSION_VERSION, sessionId, ...upgradeSession(saved) }
}

async function readSaved(dir: string, sessionId: string): Promise<{ state: OmpState; isSaved: boolean }> {
  const saved = await readFile(statePath(dir, sessionId), 'utf8').catch(missingAsNull)

  return saved === null
    ? { state: emptyState(sessionId), isSaved: false }
    : { state: upgraded(JSON.parse(saved), sessionId), isSaved: true }
}

/** A session's saved state. A missing file is a new session; a file that cannot be read or converted throws. */
export async function readState(dir: string, sessionId: string): Promise<OmpState> {
  return (await readSaved(dir, sessionId)).state
}

const updateTails = new Map<string, Promise<void>>()
const exclusiveRuns = exclusiveKeys()
const madeFolders = new Set<string>()
let tmpCount = 0

/** Runs `fn` after every earlier call with the same key has settled. A failure does not block later calls. */
function inTurn<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const run = (updateTails.get(key) ?? Promise.resolve()).then(fn)
  const tail = run.then(
    () => {},
    () => {},
  )
  updateTails.set(key, tail)
  void tail.then(() => {
    if (updateTails.get(key) === tail) updateTails.delete(key)
  })

  return run
}

/** Changes a session in turn with every other change to it in this process. Every save prunes it with `pruned`. */
export async function updateState(
  dir: string,
  sessionId: string,
  change: (s: OmpState) => OmpState | Promise<OmpState>,
): Promise<OmpState> {
  const path = statePath(dir, sessionId)

  return inTurn(path, async () => {
    const { state: current, isSaved } = await readSaved(dir, sessionId)
    const changed = await change(current)
    if (isSaved && changed === current) return current
    const next = pruned(changed)
    const folder = join(dir, 'sessions')
    if (!madeFolders.has(folder)) {
      await mkdir(folder, { recursive: true })
      madeFolders.add(folder)
    }
    const tmp = `${path}.${process.pid}-${++tmpCount}.tmp`
    await writeFile(tmp, JSON.stringify(next))
    await rename(tmp, path)

    return next
  })
}

/** Runs `fn` unless another run already holds the session's per-reply update in this process. */
export function exclusiveRun<T>(dir: string, sessionId: string, fn: () => Promise<T>) {
  return exclusiveRuns.run(statePath(dir, sessionId), fn)
}

/**
 * Deletes the oldest saved sessions beyond the newest `KEPT_SESSIONS`, ranked by when the file was last saved.
 * Only readable files of a version this build supports count and can go, and the `keep` session never does. A file
 * that is changing or updating in this process, or that was saved again since the ranking, stays.
 */
export async function pruneSessions(dir: string, keep: string): Promise<void> {
  const folder = join(dir, 'sessions')
  const names = (await readdir(folder).catch(() => [])).filter(isSessionFile)
  if (names.length <= KEPT_SESSIONS) return
  const readable = await Promise.all(
    names.map(async name => {
      const path = join(folder, name)
      try {
        const { mtimeMs } = await stat(path)
        upgraded(JSON.parse(await readFile(path, 'utf8')), name.slice(0, -'.json'.length))
        return { name, path, mtimeMs }
      } catch {
        return null
      }
    }),
  )
  for (const { path, mtimeMs } of staleSessionFiles(
    readable.filter(f => f !== null),
    keep,
  )) {
    if (updateTails.has(path) || exclusiveRuns.isHeld(path)) continue
    try {
      if ((await stat(path)).mtimeMs === mtimeMs) await unlink(path)
    } catch {
      continue
    }
  }
}
