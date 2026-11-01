import type { Milestone, ProposedGoal, SessionStatus, StatusGoal } from '../types'
import { DECLINED_KEPT, MILESTONES_MAX, STATUSES } from './status-limits'

type GoalFields = Pick<
  SessionStatus,
  'goal' | 'proposedGoal' | 'declinedGoals' | 'milestones' | 'nextMilestoneId' | 'serves'
>

function time(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * The goal a saved Status holds. Only an object is a goal: an earlier build saved a string `goal` that the model
 * wrote, and that loads as the head, never as a goal.
 */
function goalOf(saved: unknown): StatusGoal | null {
  const g = saved as Partial<Record<keyof StatusGoal, unknown>> | null
  const text = nonEmpty(g?.text)
  const setAt = time(g?.setAt)
  if (typeof saved !== 'object' || text === null || setAt === null) return null

  return {
    text,
    setAt,
    metAt: time(g?.metAt),
    was: nonEmpty(g?.was),
    isAwaitingMilestones: g?.isAwaitingMilestones === true,
  }
}

function proposedOf(saved: unknown): ProposedGoal | null {
  const p = saved as Partial<Record<keyof ProposedGoal, unknown>> | null
  const text = nonEmpty(p?.text)
  const at = time(p?.at)
  if (typeof saved !== 'object' || text === null || at === null) return null
  const milestones = (Array.isArray(p?.milestones) ? p.milestones : []).flatMap((raw: unknown) => {
    const m = raw as { name?: unknown; status?: unknown } | null
    const name = nonEmpty(m?.name)
    const status = STATUSES.find(x => x === m?.status)
    return name && status ? [{ name, status }] : []
  })

  return { text, milestones: milestones.slice(0, MILESTONES_MAX), at }
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
    closedAt: time(m.closedAt),
  }
}

/**
 * The goal's fields of a saved Status, with anything wrongly shaped left out. A Status saved before the goal loads
 * with none, so its page shows as before, with Set a goal. A link to a subject or milestone the Status no longer
 * holds is dropped.
 */
export function goalFields(o: Record<string, unknown>, subjectIds: ReadonlySet<string>): GoalFields {
  const milestones = (Array.isArray(o.milestones) ? o.milestones : [])
    .map(milestoneOf)
    .filter((m): m is Milestone => m !== null)
  const milestoneIds = new Set(milestones.map(m => m.id))
  const savedServes = typeof o.serves === 'object' && o.serves !== null ? Object.entries(o.serves) : []
  const serves = Object.fromEntries(
    savedServes.filter(
      (e): e is [string, string] =>
        subjectIds.has(e[0]) && typeof e[1] === 'string' && (e[1] === 'none' || milestoneIds.has(e[1])),
    ),
  )
  const declined = Array.isArray(o.declinedGoals)
    ? o.declinedGoals.filter((d): d is string => typeof d === 'string')
    : []

  return {
    goal: goalOf(o.goal),
    proposedGoal: proposedOf(o.proposedGoal),
    declinedGoals: declined.slice(-DECLINED_KEPT),
    milestones,
    nextMilestoneId: Math.max(time(o.nextMilestoneId) ?? 1, milestones.length + 1),
    serves,
  }
}
