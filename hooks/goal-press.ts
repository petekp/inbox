import type { LastAction, Ledger } from '../types'
import type { PressResult } from './press-reducer'
import type { RowPress } from './presses'
import { removeGoal, restoreGoal, setTypedGoal } from './status-goal-ops'
import { EMPTY_SESSION_STATUS } from './status-limits'

/**
 * A press on the Status page's goal: Remove goal, its Undo, or a goal the person typed. Each changes the saved Status at once
 * and sends nothing. A typed goal that rewords the goal keeps its milestones. A goal typed
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
  if (p.action === 'remove-goal') {
    if (o.goal === null) return { stale: true }

    return { ledger: { ...ledger, overview: removeGoal(o) }, last: record('mark'), effects: [] }
  }
  if (p.action === 'restore-goal') {
    const restored = restoreGoal(o)
    if (restored === o) return { stale: true }

    return { ledger: { ...ledger, overview: restored }, last: record('mark'), effects: [] }
  }
  if (p.action !== 'type') return { stale: true }
  const typed = setTypedGoal(o, p.text, now)
  if (typed === o) return unchanged

  return { ledger: { ...ledger, overview: typed }, last: record('mark'), effects: [] }
}
