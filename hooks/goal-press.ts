import type { LastAction, Ledger } from '../types'
import type { PressResult } from './press-reducer'
import type { RowPress } from './presses'
import { declineProposedGoal, setTypedGoal, useProposedGoal } from './status-goal-ops'
import { EMPTY_SESSION_STATUS } from './status-limits'

/**
 * A press on the Status page's goal: Set as goal or Not now on a proposal, or a goal the person typed. Each changes
 * the saved Status at once and sends nothing. A typed goal that rewords the goal keeps its milestones. A goal typed
 * before the first Status starts one.
 */
export function goalPressed(
  ledger: Ledger,
  p: RowPress,
  record: (kind: LastAction['kind']) => LastAction,
  now: number,
): PressResult {
  const o = ledger.overview ?? EMPTY_SESSION_STATUS
  const unchanged: PressResult = { ledger, last: null, effects: [] }
  if (p.action === 'use-goal' || p.action === 'decline-goal') {
    if (o.proposedGoal === null) return { stale: true }
    const overview = p.action === 'use-goal' ? useProposedGoal(o, now) : declineProposedGoal(o)

    return { ledger: { ...ledger, overview }, last: record('mark'), effects: [] }
  }
  if (p.action !== 'type') return { stale: true }
  const typed = setTypedGoal(o, p.text, now)
  if (typed.status === o) return unchanged

  return { ledger: { ...ledger, overview: typed.status }, last: record('mark'), effects: [] }
}
