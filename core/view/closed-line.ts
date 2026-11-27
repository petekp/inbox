import type { Closed } from '../../types'
import type { RowPress } from '../domain/presses'
import { canUndoRefused, refusalOf, ROW_COPY, sessionKeyOf, settledLabel } from './rows'
import type { ClosedDelivery, ResultMark, SessionKey } from './rows'

/**
 * A Closed line's buttons. Its press is Undo after its notification was refused, else Reopen on a row the person
 * dismissed, which stays reachable for the rest of the session. Reopening loses nothing, since a dismissal sent nothing.
 * A look that passes `canShowSession` draws `sessionKey` before the press, as `sessionKeyOf` gives it.
 */
export function closedLinePlan(
  d: { id: string; how: Closed['how']; canRestore?: boolean; delivery: ClosedDelivery },
  canShowSession = false,
): { action: { label: string; press: RowPress } | null; sessionKey: SessionKey | null } {
  const sessionKey = sessionKeyOf(refusalOf(d.delivery), canShowSession)
  if (d.canRestore === false) return { action: null, sessionKey }
  if (canUndoRefused(d.delivery))
    return { action: { label: ROW_COPY.undo, press: { id: d.id, action: 'undo' } }, sessionKey }
  const reopen = { label: ROW_COPY.reopen, press: { id: d.id, action: 'undo' as const } }

  return { action: d.how === 'dismissed' ? reopen : null, sessionKey }
}

/** A Closed entry as the view lists it: a question or task (`ask`, `at`) or a finding (`title`, `closedAt`). */
type ClosedEntry = Pick<Closed, 'how'> & {
  id: string
  canRestore?: boolean
  delivery: ClosedDelivery
  outcomeLabel: string
  mark: ResultMark
} & ({ ask: string; at: number } | { title: string; closedAt: number })

/**
 * A Closed line as every look draws it: its title and age's start, its mark, its outcome with its message's step, and
 * its buttons from `closedLinePlan`. `isUndoOfRefusal` tells a look that draws Undo apart from Reopen.
 */
export type ClosedLineView = {
  id: string
  title: string
  at: number
  mark: ResultMark
  outcome: string
  action: { label: string; press: RowPress } | null
  isUndoOfRefusal: boolean
  sessionKey: SessionKey | null
}

export function closedLineView(d: ClosedEntry, canShowSession = false): ClosedLineView {
  const { action, sessionKey } = closedLinePlan(d, canShowSession)

  return {
    id: d.id,
    title: 'ask' in d ? d.ask : d.title,
    at: 'ask' in d ? d.at : d.closedAt,
    mark: d.mark,
    outcome: settledLabel(d.outcomeLabel, d.delivery),
    action,
    isUndoOfRefusal: canUndoRefused(d.delivery),
    sessionKey,
  }
}
