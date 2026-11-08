import type { Session } from '../types'
import { KEPT_SESSIONS } from './ledger'
import { dropUnreadSharedViews } from './mod-pr-shared'
import { type Changed, type ModSession, type Owner, type SavedRecord, sessionKey } from './mod-sessions'
import { sessionState } from './mod-state'
import { isLockHeld, isStoreFull, whileLockHeld } from './mod-store'
import { emptySession, upgradeSession } from './session-files'
import { pruned } from './session-presses'
import { SESSION_VERSION } from './session-version'

const savesBySession = new Map<string, Promise<void>>()
const prunedSaves = new Set<string>()
const savedRevisions = new Map<string, number>()
/** The conversations whose last save the store refused as full, so the drawn session is newer than the saved one. */
const refusedAsFull = new Set<string>()

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
  store: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<void>
    keys: () => Promise<string[]>
  }
  sleep: (ms: number) => Promise<void>
  now: () => Promise<number>
  after: (ms: number, fn: () => void) => { cancel: () => void }
  log: (text: string) => void
}

/**
 * A change to a saved session. It runs on the newest session each time its write is tried, and the last run's result
 * is what is written and returned. It never runs again once its write lands or is held.
 */
type Change = (s: Session) => Session | Promise<Session>

/** The wait before each background try of a held session. */
const HELD_RETRY_MS = 5_000
/** How long a held session keeps trying before it is dropped. */
const HELD_CAP_MS = 10 * 60_000

type Timer = { cancel: () => void }
/** A conversation's session that met a held lock through every retry, as its last change left it. */
type Held = { session: Session; savedAt: number; since: number; timer: Timer }

/** Each conversation off screen whose session is held. Every write and read of that session starts from it. */
const held = new Map<string, Held>()

/** For saving: the pane draws another conversation, so this one holds no rows and has no showing. */
const forSaving = (s: Session): Session => pruned({ ...s, heldRows: [], shownSince: null })

/**
 * Whether the store holds a newer save of `kept`'s conversation than the one it was changed from. Only a save of the
 * drawn session stamps a new `savedAt`, here or in another process.
 */
const isOvertaken = (kept: Held, saved: { session: SavedRecord | undefined }) => saved.session?.savedAt !== kept.savedAt

/** Drops `id`'s held session, since a newer save of the conversation landed. */
function dropOvertaken(e: SaveEngine, id: string) {
  dropHeldNow(id)
  e.log(`inbox: dropped the held session ${id}, since a newer save of it landed`)
}

/**
 * `id`'s session to change: the held one, unless a newer save of it landed, else the store's. Undefined when none is
 * saved, null when the store cannot read it and nothing is held.
 */
async function sessionToChange(e: SaveEngine, id: string) {
  const saved = await readSaved(e, id)
  const kept = held.get(id)
  if (kept && (!saved || !isOvertaken(kept, saved))) return { session: kept.session, savedAt: kept.savedAt }
  if (kept) dropOvertaken(e, id)
  if (!saved) return null

  return saved.session && { session: upgradeSession(saved.session), savedAt: saved.session.savedAt }
}

function writeSaved(e: SaveEngine, id: string, savedAt: number, s: Session) {
  return setMakingRoom(e, sessionKey(id), { version: SESSION_VERSION, savedAt, ...s }, write => write())
}

/**
 * Sets `key` through `tries`. When the store refuses the set as full, drops the shared PR views no fetch reads and
 * tries once more.
 */
async function setMakingRoom(
  e: SaveEngine,
  key: string,
  value: unknown,
  tries: (write: () => Promise<void>) => Promise<void>,
) {
  const set = () => tries(() => e.store.set(key, value))
  try {
    await set()
  } catch (error) {
    if (!isStoreFull(error) || !(await dropUnreadSharedViews(e))) throw error
    await set()
  }
}

/**
 * Changes a conversation's saved session, after its pending saves, and prunes it with `pruned`. A session the store
 * cannot read stays as it is. A write that meets a held lock through every retry holds the changed session, and the
 * result is what it will write.
 */
export function changeSaved(e: SaveEngine, id: string, change: Change): Promise<Changed> {
  sessionState.savedWrites++
  // The read, the change and the write run in the save queue, so two changes to one saved session cannot both
  // start from the same read.
  // A retry reads again, so it cannot write over a save another process made meanwhile.
  // While a session is held the lock was last seen held, so a write tries once and the timer tries again.
  const changed = sessionState.saving.then(async (): Promise<Changed> => {
    const nothing = (): Changed => ({ before: emptySession(), after: emptySession(), isDrawn: false })
    let result = nothing()
    let unwritten: { session: Session; savedAt: number } | null = null
    const tries = held.has(id)
      ? <T>(write: () => Promise<T>) => write()
      : <T>(write: () => Promise<T>) => whileLockHeld(e, write)
    try {
      await tries(async () => {
        result = nothing()
        unwritten = null
        const read = await sessionToChange(e, id)
        if (!read) return
        const after = await change(read.session)
        result = { before: read.session, after: after === read.session ? after : forSaving(after), isDrawn: false }
        if (result.after === read.session) return
        unwritten = { session: result.after, savedAt: read.savedAt }
        await writeSaved(e, id, read.savedAt, result.after)
        dropHeldNow(id)
      })
    } catch (error) {
      if (!isLockHeld(error)) throw error
      const toHold = unwritten as { session: Session; savedAt: number } | null
      if (toHold) await hold(e, id, toHold, error)
    }

    return result
  })
  const write = changed.then(() => undefined)
  sessionState.saving = write.catch(() => undefined)
  track(id, write)

  return changed
}

/** Holds `id`'s changed session, and starts the background tries when nothing was held. */
async function hold(e: SaveEngine, id: string, changed: { session: Session; savedAt: number }, error: unknown) {
  const kept = held.get(id)
  if (kept) {
    kept.session = changed.session
    return
  }
  const entry: Held = { ...changed, since: await e.now(), timer: { cancel: () => undefined } }
  entry.timer = e.after(HELD_RETRY_MS, () => retryHeld(e, id, entry))
  held.set(id, entry)
  e.log(`inbox: saving session ${id} waits for the store lock, and tries again in the background: ${errorText(error)}`)
}

function dropHeldNow(id: string) {
  held.get(id)?.timer.cancel()
  held.delete(id)
}

/** Tries once, in the save queue, to write `entry`. A failure tries again later, until `HELD_CAP_MS`. */
function retryHeld(e: SaveEngine, id: string, entry: Held) {
  const tried = sessionState.saving.then(async () => {
    if (held.get(id) !== entry) return
    try {
      const saved = await readSaved(e, id)
      if (!saved) throw new Error('the store could not read the session')
      if (isOvertaken(entry, saved)) return dropOvertaken(e, id)
      await writeSaved(e, id, entry.savedAt, entry.session)
      dropHeldNow(id)
      return
    } catch (error) {
      if ((await e.now()) - entry.since < HELD_CAP_MS) {
        entry.timer.cancel()
        entry.timer = e.after(HELD_RETRY_MS, () => retryHeld(e, id, entry))
        return
      }
      held.delete(id)
      e.log(`inbox: saving session ${id} failed after ${HELD_CAP_MS / 60_000} minutes: ${errorText(error)}`)
    }
  })
  const write = tried.catch(() => undefined)
  sessionState.saving = write
  track(id, write)
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

function logSaveFailure(e: SaveEngine, id: string, error: unknown) {
  e.log(`inbox: saving session ${id} failed: ${errorText(error)}`)
}

/**
 * Saves a conversation's session, once every earlier save has landed. A save older than one already resolved is
 * skipped. The first save of each conversation also deletes the oldest saved sessions beyond the newest `KEPT_SESSIONS`.
 * A save the store refuses as full, even once the shared PR views no fetch reads are gone, is logged and leaves
 * `isLastSaveRefused` true, so the drawn session goes on and its next save writes it whole.
 */
export function save(e: SaveEngine, owner: Owner, s: ModSession): Promise<void> {
  const key = sessionKey(owner.id)
  const generation = `${owner.id}:${owner.generation}`
  savedRevisions.set(generation, Math.max(savedRevisions.get(generation) ?? 0, s.revision))
  const { revision: _revision, ...session } = s
  const setAndPrune = Promise.all([sessionState.saving, e.now()]).then(async ([, savedAt]) => {
    if (s.revision < (savedRevisions.get(generation) ?? 0)) return
    await setMakingRoom(e, key, { version: SESSION_VERSION, savedAt, ...session }, write => whileLockHeld(e, write))
    refusedAsFull.delete(owner.id)
    // The drawn session was read with any held session of this conversation, so this save holds it too.
    dropHeldNow(owner.id)
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
    if (isStoreFull(error)) refusedAsFull.add(owner.id)
    else if (!isLockHeld(error)) throw error
    logSaveFailure(e, owner.id, error)
  })
  sessionState.saving = write.catch(() => undefined)
  track(owner.id, write)

  return write
}

/** Whether the store refused the conversation's last save as full, so a restart would lose its newest changes. */
export const isLastSaveRefused = (id: string) => refusedAsFull.has(id)

/** A conversation's saved session, or `{ session: undefined }` when none is saved. Null when the store cannot read it. */
export async function readSaved(e: SaveEngine, id: string): Promise<{ session: SavedRecord | undefined } | null> {
  try {
    return { session: (await e.store.get(sessionKey(id))) as SavedRecord | undefined }
  } catch {
    return null
  }
}

/**
 * A conversation's saved session, once its pending saves have landed. A held session is read as it will be saved,
 * unless a newer save of the conversation landed.
 */
export async function readSettled(e: SaveEngine, id: string): Promise<{ session: SavedRecord | undefined } | null> {
  await savesBySession.get(id)?.catch(() => undefined)
  const saved = await readSaved(e, id)
  const kept = held.get(id)

  return kept && (!saved || !isOvertaken(kept, saved)) ? { session: { savedAt: kept.savedAt, ...kept.session } } : saved
}
