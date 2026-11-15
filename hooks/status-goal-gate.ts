import type { GoalRefusal, Milestone, SessionStatus, StatusGoal, Subject } from '../types'
import { GOAL_LEFT_MS, isOpen, nameKey } from './status-limits'

/** The subjects linked to one of the goal's open milestones: the work the goal still holds. A done milestone holds nothing. */
export function heldSubjects(o: SessionStatus): Subject[] {
  const open = new Set(o.milestones.filter(isOpen).map(m => m.id))

  return o.subjects.filter(s => open.has(o.serves[s.id] ?? ''))
}

/**
 * When the goal last moved forward: when it was set, a milestone that is not dropped changed, or a subject linked to
 * such a milestone was done. Dropping work is not progress, so a goal whose last work was dropped counts from its last
 * real step. Nor is a NEXT line's reorder, which leaves `changedAt` as it was.
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
 * answer closes the last open one, before `settleGoal` writes the time. A goal that still waits for its milestones is
 * not met, since the milestones it carries are the goal's before it.
 */
function isGoalMet(o: SessionStatus): boolean {
  const g = o.goal
  if (g === null || g.isAwaitingMilestones) return false
  const kept = o.milestones.filter(m => m.status !== 'dropped')

  return g.metAt != null || (kept.length > 0 && kept.every(m => m.status === 'done'))
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
 * The open subjects a GOAL line that revises the goal leaves with no place, or null when the line does not revise it. A
 * line revises the inferred goal the answer found when the person cut part of its outcome. It cuts a milestone that was
 * open when the answer started and that the answer did not finish, by leaving it out or naming it dropped. It names
 * again, with an open status, a milestone that holds open work, and that work moves with it. Each other open subject
 * the goal holds needs a SERVES line in `placed`, the answer's SERVES lines by subject id. The line goes to -, or to an
 * open milestone of the goal that the GOAL line names again with an open status. A milestone new to the goal is no
 * place. The revision applies only when no subject is left with no place. So a rewording or an added milestone that
 * cuts nothing is not a revision. A milestone named in other words counts as cut, so its work must go to Other work.
 */
export function goalRevision(
  o: SessionStatus,
  start: SessionStatus,
  named: readonly Pick<Milestone, 'name' | 'status'>[],
  placed: ReadonlyMap<string, string | null>,
): Subject[] | null {
  const g = o.goal
  const isFound = g !== null && g.setAt === start.goal?.setAt
  if (!isFound || g.source !== 'inferred' || g.isAwaitingMilestones || isGoalMet(o)) return null
  const keys = (status: (m: Pick<Milestone, 'status'>) => boolean) =>
    new Set(named.filter(status).map(m => nameKey(m.name)))
  const kept = keys(isOpen)
  const carried = new Set(
    o.milestones
      .filter(isOpen)
      .map(m => nameKey(m.name))
      .filter(key => kept.has(key)),
  )
  const finished = keys(m => m.status === 'done')
  const byId = new Map(o.milestones.map(m => [m.id, m]))
  const isCut = (m: Milestone) =>
    isOpen(m) && byId.get(m.id)?.status !== 'done' && !kept.has(nameKey(m.name)) && !finished.has(nameKey(m.name))
  const isCarried = (s: Subject) => carried.has(nameKey(byId.get(o.serves[s.id] ?? '')?.name ?? ''))
  const held = heldSubjects(o).filter(isOpen)
  if (!start.milestones.some(isCut) || !held.some(isCarried)) return null

  const isPlaced = (s: Subject) => {
    const to = placed.get(s.id)
    return to === null || (to !== undefined && carried.has(nameKey(to)))
  }

  return held.filter(s => !isCarried(s) && !isPlaced(s))
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
