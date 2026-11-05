import type { GoalRemoved, Milestone, SessionStatus, StatusGoal } from '../types'
import { nameKey, REMOVED_KEPT, STATUSES } from './status-limits'

type GoalFields = Pick<
  SessionStatus,
  'goal' | 'removedGoals' | 'goalRemoved' | 'milestones' | 'nextMilestoneId' | 'serves'
>

function time(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * The goal a saved Status holds. Only an object is a goal: an earlier build saved a string `goal` that the model
 * wrote, and that loads as the head, never as a goal. A goal saved before goals had a source loads as inferred, since
 * most came from the call's proposals, except one waiting for its milestones: only a typed goal waits.
 */
function goalOf(saved: unknown): StatusGoal | null {
  const g = saved as Partial<Record<keyof StatusGoal, unknown>> | null
  const text = nonEmpty(g?.text)
  const setAt = time(g?.setAt)
  if (typeof saved !== 'object' || text === null || setAt === null) return null

  const isAwaitingMilestones = g?.isAwaitingMilestones === true
  const isTyped = g?.source === 'typed' || (g?.source !== 'inferred' && isAwaitingMilestones)

  return {
    text,
    setAt,
    metAt: time(g?.metAt),
    was: nonEmpty(g?.was),
    isAwaitingMilestones,
    source: isTyped ? 'typed' : 'inferred',
  }
}

function milestoneOf(saved: unknown): Milestone | null {
  const m = saved as Partial<Record<keyof Milestone, unknown>> | null
  const status = STATUSES.find(x => x === m?.status)
  const changedAt = time(m?.changedAt)
  if (!m || typeof m.id !== 'string' || typeof m.name !== 'string' || !status || changedAt === null) return null

  return {
    id: m.id,
    name: m.name,
    status,
    text: typeof m.text === 'string' ? m.text : '',
    was: nonEmpty(m.was),
    changedAt,
    closedAt: time(m.closedAt) ?? (status === 'done' || status === 'dropped' ? changedAt : null),
  }
}

function milestonesOf(saved: unknown): Milestone[] {
  return (Array.isArray(saved) ? saved : []).map(milestoneOf).filter((m): m is Milestone => m !== null)
}

const isStringRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A removed goal Undo can bring back, or null when it is missing or wrongly shaped. */
function goalRemovedOf(saved: unknown): GoalRemoved | null {
  const r = saved as Partial<Record<keyof GoalRemoved, unknown>> | null
  const goal = goalOf(r?.goal)
  if (goal === null || !isStringRecord(r?.serves) || !isStringRecord(r?.askSubjects)) return null
  const serves = Object.entries(r.serves).filter((e): e is [string, string] => typeof e[1] === 'string')
  const asks = Object.entries(r.askSubjects).filter(
    (e): e is [string, string[]] => Array.isArray(e[1]) && e[1].every(x => typeof x === 'string'),
  )

  return {
    goal,
    milestones: milestonesOf(r.milestones),
    serves: Object.fromEntries(serves),
    askSubjects: Object.fromEntries(asks),
  }
}

/** The ids of the milestones a saved Status holds that are dropped. An earlier build kept links to them. */
export function droppedMilestoneIds(milestones: readonly Milestone[]): Set<string> {
  return new Set(milestones.filter(m => m.status === 'dropped').map(m => m.id))
}

/**
 * The goal's fields of a saved Status, with anything wrongly shaped left out. A Status saved before the goal loads
 * with none, so its page shows as before, with New. A link to a subject or milestone the Status no longer
 * holds, or to a dropped milestone, is dropped. A removed goal's key is made again with the current `nameKey`, since
 * an earlier build kept a trailing period in it. A saved proposal is dropped, and the goals the person declined load as
 * removed goals: the closest thing to a declined proposal now that the call sets goals itself.
 */
export function goalFields(o: Record<string, unknown>, subjectIds: ReadonlySet<string>): GoalFields {
  const milestones = milestonesOf(o.milestones)
  const dropped = droppedMilestoneIds(milestones)
  const liveIds = new Set(milestones.filter(m => !dropped.has(m.id)).map(m => m.id))
  const savedServes = typeof o.serves === 'object' && o.serves !== null ? Object.entries(o.serves) : []
  const serves = Object.fromEntries(
    savedServes.filter(
      (e): e is [string, string] =>
        subjectIds.has(e[0]) && typeof e[1] === 'string' && (e[1] === 'none' || liveIds.has(e[1])),
    ),
  )
  const saved = [
    ...(Array.isArray(o.declinedGoals) ? o.declinedGoals : []),
    ...(Array.isArray(o.removedGoals) ? o.removedGoals : []),
  ]
  const keys = saved.flatMap((d: unknown) => (typeof d === 'string' ? [nameKey(d)] : []))
  const removed = [...new Set(keys)].filter(key => key !== '')

  return {
    goal: goalOf(o.goal),
    removedGoals: removed.slice(-REMOVED_KEPT),
    goalRemoved: goalRemovedOf(o.goalRemoved),
    milestones,
    nextMilestoneId: Math.max(time(o.nextMilestoneId) ?? 1, milestones.length + 1),
    serves,
  }
}
