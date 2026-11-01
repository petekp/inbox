import { linkDialogs } from './dialogs'
import { isBlankLedger } from './ledger'
import { applyUpdate } from './ledger-update'
import type { Update } from './reply-parse'
import { lookEnded, lookStarted } from './status-children'
import { applyStatus } from './status-ops'
import type { StatusAnswer } from './status'
import type { Ledger, SessionStatus, StatusFailure, Session } from '../types'

/**
 * Writes the Status call's answer for an update that is already applied. `appliedAfter` is the session's
 * `turnsApplied` when the update landed. The answer is dropped when the session now has fewer applied turns than that:
 * it was replaced by one that never applied this update.
 */
export function appliedStatus<S extends Session>(
  s: S,
  answer: StatusAnswer,
  appliedAfter: number,
  now: number,
  readSetAt: number | null = s.ledger.overview?.goal?.setAt ?? null,
): S {
  if (s.presence.turnsApplied < appliedAfter) return s

  return {
    ...s,
    ledger: {
      ...s.ledger,
      overview: applyStatus(s.ledger.overview, answer, now, new Set(s.ledger.items.map(i => i.id)), readSetAt),
    },
    overviewFailure: null,
    lastOverviewCallAt: now,
  }
}

/** How much of a refused Status answer a failure keeps. */
const REFUSED_ANSWER_CHARS = 500

/**
 * Saves why the Status call for an applied update wrote nothing: `text` is its last answer, or null when it gave
 * none. `appliedAfter` drops the failure as `appliedStatus` drops an answer.
 */
export function failedStatus<S extends Session>(s: S, text: string | null, appliedAfter: number, now: number): S {
  if (s.presence.turnsApplied < appliedAfter) return s
  const failure: StatusFailure =
    text === null
      ? { at: now, cause: 'no-answer', answer: null }
      : { at: now, cause: 'refused', answer: text.slice(0, REFUSED_ANSWER_CHARS) }

  return { ...s, overviewFailure: failure, lastOverviewCallAt: now }
}

/** How long a running turn goes between Status calls. */
export const STATUS_REFRESH_MS = 10 * 60_000

/**
 * The session with a Status call claimed for the running turn, when `STATUS_REFRESH_MS` has passed since the
 * last Status call and since the turn started. Unchanged otherwise, so a host that gets a new session back runs the
 * call, and two events in a row claim it once.
 */
export function claimedStatusRefresh<S extends Session>(s: S, now: number): S {
  const { isTurnRunning, turnStartedAt } = s.presence
  const times = [s.lastOverviewCallAt, turnStartedAt].filter((t): t is number => t !== null)
  const isDue = isTurnRunning && times.length > 0 && now - Math.max(...times) >= STATUS_REFRESH_MS

  return isDue ? { ...s, lastOverviewCallAt: now } : s
}

/**
 * Whether the ledger may have missed a turn: a failed or behind update, or turns that started with no exchange
 * waiting. Not while a turn runs, since that turn has not ended yet.
 */
export function needsCatchUp(s: Session): boolean {
  const { presence } = s
  const hasUnappliedTurn =
    s.pending.length === 0 && s.turn.person === null && presence.turnsStarted > presence.turnsApplied

  return presence.ledgerState !== 'current' || hasUnappliedTurn
}

/** Whether a host that cannot read the whole conversation still has something to run: an exchange, or a ledger that is not current. */
export function needsUpdate(s: Session): boolean {
  return s.pending.length > 0 || s.presence.ledgerState !== 'current'
}

/** The Status tab is shown: a look starts. */
function lookStartedOn<S extends { ledger: Ledger }>(s: S, now: number): S {
  return statusChanged(s, o => lookStarted(o, now))
}

/** The Status tab stopped being shown at `at`: the look ends. */
export function lookEndedOn<S extends { ledger: Ledger }>(s: S, at: number): S {
  return statusChanged(s, o => lookEnded(o, at))
}

/** The session with its Status after `change`, or the same session when the Status did not change. */
export function statusChanged<S extends { ledger: Ledger }>(
  s: S,
  change: (o: SessionStatus | null) => SessionStatus | null,
): S {
  const overview = change(s.ledger.overview)

  return overview === s.ledger.overview ? s : { ...s, ledger: { ...s.ledger, overview } }
}

/** Starts a look while the Status is shown, and ends it otherwise. */
export function withLook<S extends { ledger: Ledger }>(s: S, isStatusShown: boolean, now: number): S {
  return isStatusShown ? lookStartedOn(s, now) : lookEndedOn(s, now)
}

/** Whether the session has anything recorded: an applied update, an item, a finding or a Status. */
export function hasLedger(s: Session): boolean {
  return !isBlankLedger(s.ledger)
}

/**
 * A forked conversation continues its parent's ledger: items, findings, Status and closed records, and the agent's task list. It takes
 * nothing else, since presses, queued messages, the stop and the running turn belong to the parent. A fork that
 * already has turns or a Status keeps its own.
 */
export function forkedFrom<S extends Session>(child: S, parent: Session): S {
  if (!isBlankLedger(child.ledger)) return child

  return { ...child, ledger: parent.ledger, hostTasks: parent.hostTasks }
}

/** Whether the inbox has recorded nothing of the session: no turn counted, no exchange waiting, an empty ledger. */
export function isUnseen(s: Session): boolean {
  const { ledger } = s

  return (
    s.presence.turnsStarted === 0 &&
    s.presence.ledgerState === 'current' &&
    s.pending.length === 0 &&
    isBlankLedger(ledger)
  )
}

/** The pending exchange `p` stands for, which a catch-up that began with it covers. */
const pendingKey = (p: Session['pending'][number]) => `${p.turnsStarted}:${p.ex.turn}`

/**
 * Applies the model's answer to a catch-up over the whole conversation. `begun` is the session when the catch-up
 * began. The answer covers the exchanges pending then and the turns started then, whether or not it applied, so
 * an exchange that ended during the catch-up still waits. A catch-up that applied clears `failed`, including the
 * warning for a dropped reply.
 */
export function appliedCatchUp<S extends Session>(s: S, begun: Session, parsed: Update | null, now: number): S {
  const covered = new Set(begun.pending.map(pendingKey))

  return linkDialogs({
    ...s,
    ledger: parsed ? applyUpdate(s.ledger, parsed, now, s.ledger.turn, now) : s.ledger,
    pending: s.pending.filter(p => !covered.has(pendingKey(p))),
    presence: {
      ...s.presence,
      ledgerState: parsed ? 'current' : 'failed',
      hasDroppedReply: parsed ? false : s.presence.hasDroppedReply,
      turnsApplied: Math.max(s.presence.turnsApplied, begun.presence.turnsStarted),
    },
  })
}
