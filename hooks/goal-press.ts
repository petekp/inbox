import type { LastAction, Ledger } from '../types'
import type { PressResult } from './press-reducer'
import type { RowPress } from './presses'
import { declineProposedGoal, setTypedGoal, useProposedGoal } from './status-goal-ops'

/**
 * A press on the Status page's goal: Use this goal or Not now on a proposal, or a goal the person typed. Each changes
 * the saved Status at once and sends nothing. A typed goal that rewords the goal keeps its milestones.
 */
export function goalPressed(
  ledger: Ledger,
  p: RowPress,
  record: (kind: LastAction['kind']) => LastAction,
  now: number,
): PressResult {
  const o = ledger.overview
  const unchanged: PressResult = { ledger, last: null, effects: [] }
  if (o === null) return { stale: true }
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
