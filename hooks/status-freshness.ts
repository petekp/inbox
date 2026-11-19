import type { Session, SessionStatus } from '../types'
import type { StatusExchange } from './status-records'
import { duration } from './text'

/**
 * How many Status calls after exchanges with agent activity may change nothing on the page before it says it is
 * stale. In the saved call records, 0.7% of calls reached 5, in 2% of sessions, and the change that ended such a run
 * was no larger than after a short one, so the page was behind rather than waiting for a big change.
 */
export const STALE_AFTER_CALLS = 5

const STATUS_FAILED =
  "The inbox couldn't update this page from one of the agent's replies. What changed in that reply may be missing. It will read the whole conversation to fix this after the next reply. If that fails, it waits longer before each new try."

/** What the page says from a Status, without code's times, children or links. */
function pageWords(o: SessionStatus | null): string {
  if (o === null) return ''
  const subjects = o.subjects.map(s => [s.id, s.status, s.name, s.text])
  const milestones = o.milestones.map(m => [m.id, m.status, m.text])

  return JSON.stringify([o.head, subjects, o.goal?.text, o.goal?.metAt, milestones, o.suggestedGoal])
}

/** Whether the agent did anything in the exchange the call read. A catch-up reads a whole conversation, not one exchange. */
export function isActiveExchange(read: StatusExchange): boolean {
  if (read.kind === 'reply') return read.exchange.activity.length > 0
  return read.kind === 'mid-turn' && read.turn.activity.length > 0
}

/**
 * `after`, the Status a call wrote over `before`, with when the page last changed and how many calls since then read
 * agent activity and changed nothing.
 */
export function withChangeNoted(
  before: SessionStatus | null,
  after: SessionStatus | null,
  isActive: boolean,
  now: number,
): SessionStatus | null {
  if (after === null) return null
  if (pageWords(before) !== pageWords(after)) return { ...after, changedAt: now, quietCalls: 0 }

  return isActive ? { ...after, quietCalls: after.quietCalls + 1 } : after
}

/** The line under the tabs on the Status tab: why the page may be missing changes, or null when it is current. */
export function statusPageLine(
  s: { ledger: { overview: SessionStatus | null }; overviewFailure?: Session['overviewFailure'] },
  now: number,
): { error: string | null; stale: string | null } {
  const o = s.ledger.overview
  const isStale = o !== null && o.changedAt !== null && o.quietCalls >= STALE_AFTER_CALLS

  return {
    error: s.overviewFailure ? STATUS_FAILED : null,
    stale: isStale ? `Not updated in ${duration(now - o.changedAt!)}` : null,
  }
}
