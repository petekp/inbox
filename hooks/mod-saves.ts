import type { EngineInterface } from 'claude-code'
import type { Session } from '../types'
import { KEPT_SESSIONS } from './ledger'
import { type Changed, type ModSession, type Owner, type SavedRecord, sessionKey } from './mod-sessions'
import { sessionState } from './mod-state'
import { emptySession, upgradeSession } from './session-files'
import { pruned } from './session-presses'
import { SESSION_VERSION } from './session-version'

/**
 * What the engine's store throws when another process holds the lock on its file. Only `set` and `delete` take the
 * lock, and the engine retries it for under a second before throwing.
 */
const LOCK_HELD = 'Lock file is already being held'
/** The waits before each retry of a store write that met a held lock, about two seconds in all. */
const LOCK_RETRY_WAITS_MS = [100, 200, 300, 500, 900]

const isLockHeld = (error: unknown) => error instanceof Error && error.message.includes(LOCK_HELD)

const savesBySession = new Map<string, Promise<void>>()
const prunedSaves = new Set<string>()
const savedRevisions = new Map<string, number>()

function track(id: string, write: Promise<void>) {
  savesBySession.set(id, write)
  void write
    .finally(() => {
      if (savesBySession.get(id) === write) savesBySession.delete(id)
    })
    .catch(() => undefined)
}

/** The engine calls a save makes: the store, the clock and the debug log. */
export type SaveEngine = {
  store: EngineInterface['store']
  sleep: (ms: number) => Promise<void>
  now: () => Promise<number>
  log: (text: string) => void
}

/**
 * Changes a conversation's saved session, after its pending saves, and prunes it with `pruned`. The pane draws another
 * conversation, so this one holds no rows and has no showing. A session the store cannot read stays as it is.
 */
export async function changeSaved(
  e: SaveEngine,
  id: string,
  change: (s: Session) => Session | Promise<Session>,
): Promise<Changed> {
  sessionState.savedWrites++
  // The read, the change and the write run in the save queue, so two changes to one saved session cannot both
  // start from the same read.
  // A retry reads again, so it cannot write over a save another process made meanwhile. No drawn copy holds this
  // change, so it waits for a held lock to free rather than give up.
  const changed = sessionState.saving.then(() =>
    untilLockFrees(e, id, async (): Promise<Changed> => {
      const saved = await readSaved(e, id)
      if (!saved?.session) return { before: emptySession(), after: emptySession(), isDrawn: false }
      const before = upgradeSession(saved.session)
      const result = await change(before)
      if (result === before) return { before, after: before, isDrawn: false }
      const after = pruned({ ...result, heldRows: [], shownSince: null })
      await e.store.set(sessionKey(id), { version: SESSION_VERSION, savedAt: saved.session.savedAt, ...after })

      return { before, after, isDrawn: false }
    }),
  )
  const write = changed.then(() => undefined)
  sessionState.saving = write.catch(() => undefined)
  track(id, write)

  return changed
}

/** Runs `write`, and again after each wait in `LOCK_RETRY_WAITS_MS` while the store's lock is held. */
async function whileLockHeld<T>(e: SaveEngine, write: () => Promise<T>): Promise<T> {
  for (const ms of LOCK_RETRY_WAITS_MS) {
    try {
      return await write()
    } catch (error) {
      if (!isLockHeld(error)) throw error
      await e.sleep(ms)
    }
  }
  return write()
}

/**
 * Runs `write` as `whileLockHeld` does, then after each further wait of the longest one until the store's lock frees.
 * Logs once when the lock outlasts `LOCK_RETRY_WAITS_MS`.
 */
async function untilLockFrees<T>(e: SaveEngine, id: string, write: () => Promise<T>): Promise<T> {
  try {
    return await whileLockHeld(e, write)
  } catch (error) {
    if (!isLockHeld(error)) throw error
    e.log(`inbox: saving session ${id} waits for the store lock: ${errorText(error)}`)
  }
  const waitMs = Math.max(...LOCK_RETRY_WAITS_MS)
  for (;;) {
    await e.sleep(waitMs)
    try {
      return await write()
    } catch (error) {
      if (!isLockHeld(error)) throw error
    }
  }
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function logSaveFailure(e: SaveEngine, id: string, error: unknown) {
  e.log(`inbox: saving session ${id} failed: ${errorText(error)}`)
}

/**
 * Saves a conversation's session, once every earlier save has landed. A save older than one already resolved is
 * skipped. The first save of each conversation also deletes the oldest saved sessions beyond the newest `KEPT_SESSIONS`.
 */
export function save(e: SaveEngine, owner: Owner, s: ModSession): Promise<void> {
  const key = sessionKey(owner.id)
  const generation = `${owner.id}:${owner.generation}`
  savedRevisions.set(generation, Math.max(savedRevisions.get(generation) ?? 0, s.revision))
  const { revision: _revision, ...session } = s
  const setAndPrune = Promise.all([sessionState.saving, e.now()]).then(async ([, savedAt]) => {
    if (s.revision < (savedRevisions.get(generation) ?? 0)) return
    await whileLockHeld(e, () => e.store.set(key, { version: SESSION_VERSION, savedAt, ...session }))
    if (prunedSaves.has(generation)) return
    const keys = await e.store.keys()
    const sessions = keys.filter(k => k.startsWith('s:'))
    const ages = await Promise.all(
      sessions.map(async candidate => {
        try {
          const saved = (await e.store.get(candidate)) as SavedRecord | undefined
          return saved && Number.isFinite(saved.savedAt) && saved.ledger && typeof saved.ledger === 'object'
            ? { key: candidate, savedAt: saved.savedAt }
            : null
        } catch {
          return null
        }
      }),
    )
    const stale = ages
      .filter((entry): entry is { key: string; savedAt: number } => entry !== null && entry.key !== key)
      .sort((a, b) => a.savedAt - b.savedAt || a.key.localeCompare(b.key))
      .slice(0, Math.max(0, sessions.length - KEPT_SESSIONS))
      .map(entry => entry.key)
    // `p:` keys held the last-session offer, which earlier builds saved per folder.
    await Promise.all(
      [...stale, ...keys.filter(k => k.startsWith('p:'))].map(old => whileLockHeld(e, () => e.store.delete(old))),
    )
    prunedSaves.add(generation)
  })
  const write = setAndPrune.catch((error: unknown) => {
    // The session stays drawn, and the conversation's next save writes it whole.
    if (!isLockHeld(error)) throw error
    logSaveFailure(e, owner.id, error)
  })
  sessionState.saving = write.catch(() => undefined)
  track(owner.id, write)

  return write
}

/** A conversation's saved session, or `{ session: undefined }` when none is saved. Null when the store cannot read it. */
export async function readSaved(e: SaveEngine, id: string): Promise<{ session: SavedRecord | undefined } | null> {
  try {
    return { session: (await e.store.get(sessionKey(id))) as SavedRecord | undefined }
  } catch {
    return null
  }
}

/** A conversation's saved session, once its pending saves have landed. */
export async function readSettled(e: SaveEngine, id: string) {
  await savesBySession.get(id)?.catch(() => undefined)

  return readSaved(e, id)
}
