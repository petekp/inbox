import type { LastAction, Ledger, SessionStatus } from '../../types'
import type { PressResult } from '../view/press-reducer'
import type { RowPress } from './presses'
import { withChangeNoted } from './status-freshness'
import { removeGoal, restoreGoal, setTypedGoal } from './status-goal-ops'
import { EMPTY_SESSION_STATUS } from './status-limits'
import { takeSuggestedGoal } from './status-suggest'

/**
 * A press on the Status page's goal: Remove goal, its Undo, Set on the suggested goal, or a goal the person typed. Each
 * changes the saved Status at once and sends nothing, and counts as a change to the page, so the stale line clears. A typed goal that rewords the goal keeps its milestones. A goal
 * typed before the first Status starts one.
 */
export function goalPressed(
  ledger: Ledger,
  p: RowPress,
  record: (kind: LastAction['kind']) => LastAction,
  now: number,
): PressResult {
  const o = ledger.overview ?? EMPTY_SESSION_STATUS
  const unchanged: PressResult = { ledger, last: null, effects: [] }
  const changed = (to: SessionStatus): PressResult => ({
    ledger: { ...ledger, overview: withChangeNoted(o, to, false, now) },
    last: record('mark'),
    effects: [],
  })
  if (p.action === 'remove-goal') {
    if (o.goal === null) return { stale: true }

    return changed(removeGoal(o))
  }
  if (p.action === 'restore-goal') {
    const restored = restoreGoal(o)
    if (restored === o) return { stale: true }

    return changed(restored)
  }
  if (p.action === 'take-goal') {
    const taken = takeSuggestedGoal(o, now)
    if (taken === o) return { stale: true }

    return changed(taken)
  }
  if (p.action !== 'type') return { stale: true }
  const typed = setTypedGoal(o, p.text, now)
  if (typed === o) return unchanged

  return changed(typed)
}
