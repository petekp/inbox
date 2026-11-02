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
  after: (ms: number, fn: () => void) => { cancel: () => void }
  log: (text: string) => void
}

type Change = (s: Session) => Session | Promise<Session>

/** The wait before each background try of a held change. */
const HELD_RETRY_MS = 5_000
/** How long held changes keep trying before they are dropped. */
const HELD_CAP_MS = 10 * 60_000

/**
 * The changes to a conversation off screen that met a held lock through every retry, oldest first, and when the first
 * was held. Every read of the saved session runs them on what the store holds, and every write writes them too.
 */
const held = new Map<string, { changes: Change[]; since: number; timer: { cancel: () => void } }>()

/** For saving: the pane draws another conversation, so this one holds no rows and has no showing. */
const forSaving = (s: Session): Session => pruned({ ...s, heldRows: [], shownSince: null })

/**
 * `id`'s saved session with `changes` run on it, oldest first. Undefined when none is saved, and null when the store
 * cannot read it.
 */
async function readChanged(e: SaveEngine, id: string, changes: Change[]) {
  const saved = await readSaved(e, id)
  if (!saved) return null
  if (!saved.session) return undefined
  let session = upgradeSession(saved.session)
  for (const change of changes) session = await change(session)

  return { savedAt: saved.session.savedAt, session: changes.length > 0 ? forSaving(session) : session }
}

function writeSaved(e: SaveEngine, id: string, savedAt: number, s: Session) {
  return e.store.set(sessionKey(id), { version: SESSION_VERSION, savedAt, ...s })
}

/**
 * Changes a conversation's saved session, after its pending saves and its held changes, and prunes it with `pruned`. A
 * session the store cannot read stays as it is. A change that meets a held lock through every retry is held, and the
 * result says what it will write.
 */
export function changeSaved(e: SaveEngine, id: string, change: Change): Promise<Changed> {
  sessionState.savedWrites++
  // The read, the change and the write run in the save queue, so two changes to one saved session cannot both
  // start from the same read.
  // A retry reads again, so it cannot write over a save another process made meanwhile.
  const changed = sessionState.saving.then(async (): Promise<Changed> => {
    const earlier = [...(held.get(id)?.changes ?? [])]
    let result: Changed = { before: emptySession(), after: emptySession(), isDrawn: false }
    try {
      await whileLockHeld(e, async () => {
        const read = await readChanged(e, id, earlier)
        if (!read) return
        const after = await change(read.session)
        result = { before: read.session, after: after === read.session ? after : forSaving(after), isDrawn: false }
        if (result.after !== read.session || earlier.length > 0) await writeSaved(e, id, read.savedAt, result.after)
        landed(id, earlier)
      })
    } catch (error) {
      if (!isLockHeld(error)) throw error
      await hold(e, id, change, error)
    }

    return result
  })
  const write = changed.then(() => undefined)
  sessionState.saving = write.catch(() => undefined)
  track(id, write)

  return changed
}

/** Holds `change` for `id`, and starts the background tries when it is the first. */
async function hold(e: SaveEngine, id: string, change: Change, error: unknown) {
  const entry = held.get(id)
  if (entry) {
    entry.changes.push(change)
    return
  }
  const since = await e.now()
  held.set(id, { changes: [change], since, timer: e.after(HELD_RETRY_MS, () => retryHeld(e, id)) })
  e.log(`inbox: saving session ${id} waits for the store lock, and tries again in the background: ${errorText(error)}`)
}

/** Forgets `changes` once a write has landed them, unless the drawn session took them first. */
function landed(id: string, changes: Change[]) {
  const entry = held.get(id)
  if (!entry || changes.length === 0 || changes.some((c, i) => entry.changes[i] !== c)) return
  entry.changes.splice(0, changes.length)
  if (entry.changes.length > 0) return
  entry.timer.cancel()
  held.delete(id)
}

/**
 * Drops `id`'s held changes, since the conversation is drawn again and its session, read with `readSettled`, holds
 * them. Its next save writes them.
 */
export function dropHeld(id: string) {
  held.get(id)?.timer.cancel()
  held.delete(id)
}

/** Tries once, in the save queue, to write `id`'s held changes. A failure tries again later, until `HELD_CAP_MS`. */
function retryHeld(e: SaveEngine, id: string) {
  const tried = sessionState.saving.then(async () => {
    const entry = held.get(id)
    if (!entry) return
    const changes = [...entry.changes]
    let failure: unknown = 'the store could not read the session'
    try {
      const read = await readChanged(e, id, changes)
      if (read !== null) {
        if (read) await writeSaved(e, id, read.savedAt, read.session)
        landed(id, changes)
        return
      }
    } catch (error) {
      failure = error
    }
    if (held.get(id) !== entry) return
    if ((await e.now()) - entry.since < HELD_CAP_MS) {
      entry.timer = e.after(HELD_RETRY_MS, () => retryHeld(e, id))
      return
    }
    held.delete(id)
    e.log(`inbox: saving session ${id} failed after ${HELD_CAP_MS / 60_000} minutes: ${errorText(failure)}`)
  })
  const write = tried.catch(() => undefined)
  sessionState.saving = write
  track(id, write)
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

/** A conversation's saved session, once its pending saves have landed, with its held changes run on it. */
export async function readSettled(e: SaveEngine, id: string): Promise<{ session: SavedRecord | undefined } | null> {
  await savesBySession.get(id)?.catch(() => undefined)
  const changes = held.get(id)?.changes ?? []
  if (changes.length === 0) return readSaved(e, id)
  const read = await readChanged(e, id, [...changes])

  return read === null ? null : { session: read && { savedAt: read.savedAt, ...read.session } }
}
