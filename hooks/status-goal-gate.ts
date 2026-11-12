import type { GoalRefusal, SessionStatus, StatusGoal, Subject } from '../types'
import { GOAL_LEFT_MS, isOpen } from './status-limits'

/** The subjects linked to one of the goal's open milestones: the work the goal still holds. A done milestone holds nothing. */
export function heldSubjects(o: SessionStatus): Subject[] {
  const open = new Set(o.milestones.filter(isOpen).map(m => m.id))

  return o.subjects.filter(s => open.has(o.serves[s.id] ?? ''))
}

/**
 * When the goal last moved forward: when it was set, a milestone that is not dropped changed, or a subject linked to
 * such a milestone was done. Dropping work is not progress, so a goal whose last work was dropped counts from its last
 * real step.
 */
export function lastProgressAt(o: SessionStatus, g: StatusGoal): number {
  const kept = o.milestones.filter(m => m.status !== 'dropped')
  const ids = new Set(kept.map(m => m.id))
  const done = o.subjects.flatMap(s =>
    s.status === 'done' && s.closedAt !== null && ids.has(o.serves[s.id] ?? '') ? [s.closedAt] : [],
  )

  return Math.max(g.setAt, ...kept.map(m => m.changedAt), ...done)
}

/**
 * Whether the goal is met: it holds its met time, or every milestone it keeps is done, as after a DROP in the same
 * answer closes the last open one, before `settleGoal` writes the time.
 */
function isGoalMet(o: SessionStatus): boolean {
  const kept = o.milestones.filter(m => m.status !== 'dropped')

  return o.goal?.metAt != null || (kept.length > 0 && kept.every(m => m.status === 'done'))
}

/**
 * How long the work has left the goal, in ms, or null while it has not. The work has left an inferred goal that is not
 * met when none of the work it holds is open and it has not moved forward for `GOAL_LEFT_MS`, so a goal between
 * milestones, or one just set, stays. A goal whose milestones are all done is met, whether or not a saved copy holds
 * its met time. A typed goal is the person's until it is met. The Status call reads this time, and a GOAL or RETIRE
 * line may replace or clear the goal while it is set.
 */
export function goalLeftFor(o: SessionStatus, now: number): number | null {
  const g = o.goal
  if (g === null || isGoalMet(o) || g.source !== 'inferred' || heldSubjects(o).some(isOpen)) return null
  const left = now - lastProgressAt(o, g)

  return left >= GOAL_LEFT_MS ? left : null
}

/**
 * Whether the session holds open work for a new goal: an open subject the current goal does not hold, once the answer's
 * subject lines apply. So a fix the same answer finished gets no goal.
 */
export function hasWorkForGoal(o: SessionStatus): boolean {
  const held = new Set(heldSubjects(o).map(s => s.id))

  return o.subjects.some(s => isOpen(s) && !held.has(s.id))
}

/**
 * Why a GOAL or RETIRE line may not replace or clear the goal as `o` stands, or null when it may: a GOAL while none is
 * set or once the goal is met, and either once the work has left it.
 */
function refusalOf(o: SessionStatus, kind: GoalRefusal['line'], now: number): GoalRefusal['why'] | null {
  const g = o.goal
  if (g === null || isGoalMet(o)) return kind === 'goal' ? null : 'met'
  if (g.source === 'typed') return 'typed'
  if (heldSubjects(o).some(isOpen)) return 'work-open'

  return goalLeftFor(o, now) === null ? 'moved' : null
}

/**
 * Why a GOAL or RETIRE line may not replace or clear the goal, or null when it may. The page is read as the answer's
 * earlier lines left it, in `o`, and as the answer found it, in `start`, so a DROP or DONE line in the same answer
 * never closes a gate that was open. A goal the same answer set is read only as it stands, so a RETIRE after it never
 * clears it.
 */
export function goalRefusal(
  o: SessionStatus,
  start: SessionStatus,
  kind: GoalRefusal['line'],
  now: number,
): GoalRefusal['why'] | null {
  const why = refusalOf(o, kind, now)
  const isSameGoal = o.goal?.setAt === start.goal?.setAt
  if (why === null || start === o || !isSameGoal) return why

  return refusalOf(start, kind, now) === null ? null : why
}
