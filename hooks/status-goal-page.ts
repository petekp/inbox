import type { Item, SessionStatus, TaskTree } from '../types'
import { isGoalMet, tasksForGoal } from './status-goal-gate'
import type { StatusRow } from './status-page'
import type { StatusTone } from './help'

export type MilestoneRow = {
  id: string
  mark: string
  tone: StatusTone
  name: string
  text: string | null
  stall: { text: string; tone: 'needsYou' } | null
  was: string | null
  ask: { id: string; kind: Item['kind'] } | null
  rows: StatusRow[]
}

export type GoalBlock = {
  label: string
  text: string
  count: string | null
  isMet: boolean
  was: string | null
  now: string | null
  awaiting: string | null
  milestones: MilestoneRow[]
}

export type GoalParts = { goal: GoalBlock | null; canRestoreGoal: boolean }

export const GOAL_HEADING = 'Goal'
export const NO_GOAL_TEXT = "No goal yet. The inbox sets one when the work shows where it's headed."

export function oldestAsk(
  items: readonly Item[],
  links: Readonly<Record<string, readonly string[]>>,
  id: string,
): { id: string; kind: Item['kind'] } | null {
  const oldest = items
    .filter(item => links[item.id]?.includes(id))
    .sort((a, b) => (a.at ?? -Infinity) - (b.at ?? -Infinity))[0]

  return oldest ? { id: oldest.id, kind: oldest.kind } : null
}

export function goalPage(o: SessionStatus | null, _items: readonly Item[], tree: TaskTree): GoalParts {
  const goal = o?.goal ?? null
  if (o === null || goal === null) return { goal: null, canRestoreGoal: o?.goalRemoved != null }
  const linked = tasksForGoal(tree, goal)
  const isMet = isGoalMet(goal, tree)
  const awaiting = linked.length === 0
  const done = linked.filter(task => task.status === 'done').length
  const was = goal.was !== null && (o.lastLookAt === null || goal.setAt > o.lastLookAt) ? goal.was : null

  return {
    goal: {
      label: isMet ? 'Goal met' : GOAL_HEADING,
      text: goal.text,
      count:
        isMet || awaiting ? null : `${done} of ${linked.filter(task => task.status !== 'dropped').length} tasks done`,
      isMet,
      was,
      now: o.head ? `Now: ${o.head.description || o.head.title}` : null,
      awaiting: awaiting ? 'No tasks linked yet' : null,
      milestones: [],
    },
    canRestoreGoal: false,
  }
}
