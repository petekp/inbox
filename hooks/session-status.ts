import { linkDialogs } from './dialogs'
import { isBlankLedger } from './ledger'
import { applyUpdate } from './ledger-update'
import type { Update } from './reply-parse'
import { lookEnded, lookStarted } from './status-children'
import type { ShownRows } from './status-children'
import { applyStatus } from './status-ops'
import type { StatusAnswer } from './status'
import type { Ledger, SessionStatus, StatusFailure, Session } from '../types'

/**
 * Whether a Status call made for `appliedAfter` applied turns may still write. It may not when the session now has
 * fewer applied turns, since it was replaced by one that never applied that update, or when a call made for more
 * turns already wrote, since Codex update processes can run their Status calls in either order.
 */
export function isStatusCallCurrent(s: Session, appliedAfter: number): boolean {
  return s.presence.turnsApplied >= appliedAfter && s.overviewTurn <= appliedAfter
}

/**
 * Writes the Status call's answer for an update that is already applied. `appliedAfter` is the session's
 * `turnsApplied` when the update landed. The answer is dropped unless `isStatusCallCurrent`. A saved failure stays
 * until a catch-up call writes, since only a catch-up reads the exchange the failed call missed.
 */
export function appliedStatus<S extends Session>(
  s: S,
  answer: StatusAnswer,
  appliedAfter: number,
  now: number,
  readSetAt: number | null = s.ledger.overview?.goal?.setAt ?? null,
  isCatchUp = false,
): S {
  if (!isStatusCallCurrent(s, appliedAfter)) return s

  return {
    ...s,
    ledger: {
      ...s.ledger,
      overview: applyStatus(s.ledger.overview, answer, now, new Set(s.ledger.items.map(i => i.id)), readSetAt),
    },
    overviewFailure: isCatchUp ? null : s.overviewFailure,
    lastOverviewCallAt: now,
    overviewTurn: appliedAfter,
  }
}

/** How much of a refused Status answer a failure keeps. */
const REFUSED_ANSWER_CHARS = 500

/**
 * Saves why the Status call for an applied update wrote nothing: `text` is its last answer, or null when it gave
 * none. `appliedAfter` drops the failure as `appliedStatus` drops an answer. A failed catch-up adds one to the
 * standing failure's `catchUpsFailed`.
 */
export function failedStatus<S extends Session>(
  s: S,
  text: string | null,
  appliedAfter: number,
  now: number,
  isCatchUp = false,
): S {
  if (!isStatusCallCurrent(s, appliedAfter)) return s
  const before = s.overviewFailure
  const tries = isCatchUp
    ? { catchUpsFailed: (before?.catchUpsFailed ?? 0) + 1, catchUpTurn: s.presence.turnsStarted }
    : before?.catchUpsFailed
      ? { catchUpsFailed: before.catchUpsFailed, catchUpTurn: before.catchUpTurn ?? 0 }
      : {}
  const failure: StatusFailure =
    text === null
      ? { at: now, cause: 'no-answer', answer: null, ...tries }
      : { at: now, cause: 'refused', answer: text.slice(0, REFUSED_ANSWER_CHARS), ...tries }

  return { ...s, overviewFailure: failure, lastOverviewCallAt: now, overviewTurn: appliedAfter }
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
 * Whether the ledger or the Status may have missed a turn: a failed or behind update, turns that started with no
 * exchange waiting, or a failed Status call while a new exchange waits. Not while a turn runs, since that turn has not
 * ended yet. A Status failure catches up at the next reply. After each failed catch-up, the next waits twice as many
 * turns: 2, then 4, then 8.
 */
export function needsCatchUp(s: Session): boolean {
  const { presence } = s
  const hasUnappliedTurn =
    s.pending.length === 0 && s.turn.person === null && presence.turnsStarted > presence.turnsApplied
  const failure = s.overviewFailure
  const isStatusCatchUpDue =
    failure !== null &&
    (!failure.catchUpsFailed || presence.turnsStarted - (failure.catchUpTurn ?? 0) >= 2 ** failure.catchUpsFailed)
  const hasMissedStatus = isStatusCatchUpDue && (s.pending.length > 0 || hasUnappliedTurn)

  return presence.ledgerState !== 'current' || hasUnappliedTurn || hasMissedStatus
}

/** Whether a host that cannot read the whole conversation still has something to run: an exchange, or a ledger that is not current. */
export function needsUpdate(s: Session): boolean {
  return s.pending.length > 0 || s.presence.ledgerState !== 'current'
}

/** The Status tab is shown: a look starts. */
function lookStartedOn<S extends { ledger: Ledger }>(s: S, now: number): S {
  return statusChanged(s, o => lookStarted(o, now))
}

/** The Status tab stopped being shown at `at`: the look ends, and counts the subjects `shown` names as seen. */
export function lookEndedOn<S extends { ledger: Ledger }>(s: S, at: number, shown: ShownRows): S {
  return statusChanged(s, o => lookEnded(o, at, shown))
}

/** The session with its Status after `change`, or the same session when the Status did not change. */
export function statusChanged<S extends { ledger: Ledger }>(
  s: S,
  change: (o: SessionStatus | null) => SessionStatus | null,
): S {
  const overview = change(s.ledger.overview)

  return overview === s.ledger.overview ? s : { ...s, ledger: { ...s.ledger, overview } }
}

/** Starts a look while the Status is shown, and ends it otherwise, with the rows `shown` says it showed. */
export function withLook<S extends { ledger: Ledger }>(s: S, isStatusShown: boolean, now: number, shown: ShownRows): S {
  return isStatusShown ? lookStartedOn(s, now) : lookEndedOn(s, now, shown)
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
      failedAttempts: parsed ? 0 : s.presence.failedAttempts + 1,
      isConversationUnreadable: false,
      turnsApplied: Math.max(s.presence.turnsApplied, begun.presence.turnsStarted),
    },
  })
}
