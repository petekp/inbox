import type { Session, SessionStatus } from '../types'
import type { StatusExchange } from './status-records'
import { duration } from './text'

/** How many Status calls after replies with agent activity may change nothing on the page before it says it is stale. */
const STALE_AFTER_CALLS = 5

const STATUS_FAILED =
  "The inbox couldn't update this page from one of the agent's replies. What changed in that reply may be missing. It will read the whole conversation to fix this after the next reply. If that fails, it waits longer before each new try."

/** What the page says from a Status, without code's times, children or links. */
function pageWords(o: SessionStatus | null): string {
  if (o === null) return ''
  const subjects = o.subjects.map(s => [s.id, s.status, s.name, s.text])
  const milestones = o.milestones.map(m => [m.id, m.status, m.text])

  return JSON.stringify([o.head, subjects, o.goal?.text, o.goal?.metAt, milestones, o.suggestedGoal])
}

/**
 * Whether the call read a reply after which the agent had done something. A call during a turn reads work that has not
 * finished, so a page that holds still then is not behind. A catch-up reads a whole conversation, not one exchange.
 */
export function isActiveReply(read: StatusExchange): boolean {
  return read.kind === 'reply' && read.exchange.activity.length > 0
}

/**
 * `after`, the Status a call or a press wrote over `before`, with when the page last changed and how many calls since
 * then read an active reply and changed nothing.
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
