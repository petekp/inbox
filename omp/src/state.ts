import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { KEPT_SESSIONS } from '../../core/domain/ledger'
import {
  emptySession,
  isSessionFile,
  missingAsNull,
  sessionFile,
  staleSessionFiles,
  upgradeSession,
} from '../../core/view/session-files'
import { pruned } from '../../core/runtime/session-presses'
import { memoryViewerStores } from '../../core/runtime/remote-viewers'
import type { AnswerDoc } from '../../core/domain/earlier-answers'
import { historyStep, recordMatches } from '../../core/runtime/history-store'
import type { HistoryPlace } from '../../core/runtime/history-store'
import type { Session } from '../../types'
import type { SavedSession } from '../../core/view/session-files'
import { exclusiveKeys } from '../../core/runtime/session-host'
import { checkVersion, SESSION_VERSION } from '../../core/domain/session-version'
import { freshUi } from '../../core/view/ui-controller-types'
import type { UiState } from '../../core/view/ui-controller-types'
import { OMP_LOOK } from './panel'

export type OmpState = Session & {
  version: typeof SESSION_VERSION
  sessionId: string
  /** The panel's state from the shared controller, which a later panel starts from: its drafts, cursors and folds. */
  ui: UiState | null
}

export function emptyState(sessionId: string): OmpState {
  return { version: SESSION_VERSION, sessionId, ...emptySession(), ui: null }
}

export function statePath(dir: string, sessionId: string): string {
  return join(dir, 'sessions', sessionFile(sessionId))
}

type Saved = SavedSession & Partial<Pick<OmpState, 'version' | 'sessionId'>> & { ui?: Partial<UiState> | null }

/** State saved by an earlier build, with any field it lacks filled in. A build before the shared controller saved no `ui`. */
function upgraded(saved: Saved, sessionId: string): OmpState {
  checkVersion(saved)
  const ui = saved.ui ? { ...freshUi(OMP_LOOK), ...saved.ui, config: OMP_LOOK } : null

  return { version: SESSION_VERSION, sessionId, ...upgradeSession(saved), ui }
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

/** The viewer leases of the Herdr looks that show a session, kept in this process and out of its saved state. */
export const viewerLeases = memoryViewerStores()

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

let questionHistory: HistoryPlace | null = null

/**
 * Turns on the question history for this process's saves: each save then searches it for the questions it adds and
 * records the questions it closes. Only the entry points turn it on, so a test never reaches the person's history.
 */
export function useQuestionHistory(place: HistoryPlace | null): void {
  questionHistory = place
}

/** The earlier answers the `record` answer lists for a call, from this process's question history. */
export function recordMatchesNow(input: Record<string, unknown>, now: number): Promise<AnswerDoc[]> {
  return recordMatches(questionHistory, input, now)
}

/** Changes a session in turn with every other change to it in this process. Every save prunes it with `pruned`. */
export async function updateState(
  dir: string,
  sessionId: string,
  change: (s: OmpState) => OmpState | Promise<OmpState>,
  now: () => number = Date.now,
): Promise<OmpState> {
  const path = statePath(dir, sessionId)

  return inTurn(path, async () => {
    const { state: current, isSaved } = await readSaved(dir, sessionId)
    const changed = await historyStep(questionHistory, sessionId, current, await change(current), Date.now())
    if (isSaved && changed === current) return current
    const next = pruned(changed, now(), viewerLeases.peek(sessionId))
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
