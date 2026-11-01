import type { Away, DemoCopy, LastAction, Session } from '../types'
import { emptySession, type SavedSession } from './session-files'
import { exclusiveKeys, orderedKeys } from './session-host'
import { withDemoPresence } from './demo'

/** The drawn conversation's session. `revision` counts its writes, so a write computed from an older one is retried. */
export type ModSession = Session & { revision: number }

export const NO_SESSION: ModSession = { ...emptySession(), revision: 0 }
export const PRESENT: Away = { lastActiveAt: 0, isAway: false, minute: 0 }
/** The mod can always read the whole conversation: from a fork of it, or from the transcript. */
export const CAN_CATCH_UP = true
export const READ_FAILED_TEXT = 'Could not read the inbox.'
export const PR_POLL_MS = 2 * 60_000
export const AWAY_MS = 15 * 60_000
/** The conversations whose Status calls run one after another. They do not hold `queue`, so a ledger call never waits for one. */
export const resultsOrder = orderedKeys()

/** The conversation the session runs. /clear, /resume and /branch move it to another id, and each move is a new generation. */
export const conversation = { id: '', root: '', generation: 0 }

export type Owner = { id: string; generation: number }

export function currentOwner(): Owner {
  return { id: conversation.id, generation: conversation.generation }
}

export function isCurrent(owner: Owner): boolean {
  return owner.id === conversation.id && owner.generation === conversation.generation
}

export const MAX_TRIES = 20

/** A session change that landed: the session it read and the one it wrote, and whether that session is the drawn one. */
export type Changed = { before: Session; after: Session; isDrawn: boolean }

export type SavedRecord = SavedSession & { savedAt: number }

export const sessionKey = (id: string) => `s:${id}`

/**
 * What the engine's store throws when another process holds the lock on its file. Only `set` and `delete` take the
 * lock, and the engine retries it for under a second before throwing.
 */
const LOCK_HELD = 'Lock file is already being held'
/** The waits before each retry of a store write that met a held lock, about two seconds in all. */
export const LOCK_RETRY_WAITS_MS = [100, 200, 300, 500, 900]

export const isLockHeld = (error: unknown) => error instanceof Error && error.message.includes(LOCK_HELD)

export const savesBySession = new Map<string, Promise<void>>()
export const prunedSaves = new Set<string>()
export const savedRevisions = new Map<string, number>()

export function track(id: string, write: Promise<void>) {
  savesBySession.set(id, write)
  void write
    .finally(() => {
      if (savesBySession.get(id) === write) savesBySession.delete(id)
    })
    .catch(() => undefined)
}

/** The conversations whose per-reply update runs now. */
export const updating = exclusiveKeys()

/**
 * The session a look draws: `session`, with the ledger, PR views, presses and turn counts of the sample while it shows,
 * and the sample's place and presence.
 */
export function drawnSession(
  session: Session,
  drawn: Pick<DemoCopy, 'ledger' | 'stop' | 'prViews' | 'lastActions' | 'turns'>,
  isDemo: boolean,
  now: number,
): Session {
  const { ledger, stop, prViews, lastActions, turns } = drawn
  const s = { ...session, ledger, stop, prViews, lastActions, presence: { ...session.presence, ...turns } }

  return isDemo ? withDemoPresence(s, now) : s
}

/** The `CLAUDE_CODE_ENTRYPOINT` values the desktop app gives the Claude Code sessions it starts. */
export const DESKTOP_APP_ENTRYPOINTS = ['claude-desktop', 'claude-desktop-3p']

/** An update a reload cut off reads as failed, so the next one catches up. */
export function cutOffUpdate<S extends Session>(s: S): S {
  return s.presence.isUpdating ? { ...s, presence: { ...s.presence, isUpdating: false, ledgerState: 'failed' } } : s
}

/** Row presses keep only their PR records, whose rows outlive a conversation's items. */
export function withoutRowActions(lastActions: Record<string, LastAction>): Record<string, LastAction> {
  return Object.fromEntries(Object.entries(lastActions).filter(([k]) => !/^[if]\d+$/.test(k)))
}
