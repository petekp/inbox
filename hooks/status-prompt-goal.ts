import type { GoalRefusal, SessionStatus, TaskTree } from '../types'
import { NL } from './ledger-prompt'
import { goalLeftFor, goalTaskId, isGoalMet, lastProgressAt, tasksForGoal } from './status-goal-gate'
import { duration } from './text'

export const GOAL_LINES = `GOAL: outcome
RETIRE: why the goal no longer fits the work
LINK: ask or running child id | task id
GOAL sets only the session outcome. Task status, details and links come from the task tree and are never changed here.`

export const GOAL_INPUT = `- <goal>: the outcome, its stable task-link id, and whether it is typed, met, awaiting linked tasks, or has had no linked work for a time. It may also say why code did not apply the last GOAL or RETIRE line; fix that cause before writing that line again.
- <removed>: goals the person removed, as their key words, one per line.`

export const GOAL_PARTS = {
  'goal-when-clear': `Write GOAL only when the task tree and exchange support one checkable outcome for the session. Never invent an outcome from a summary of finished work.`,
  'goal-finish-line': `A goal has a finish line someone could check as met or not, such as "2.5 in the store" or "the import ready to demo". A direction such as "make search faster" is not a goal.`,
  'goal-wait': `When the next outcome is not clear, write no GOAL and wait. Keep a met goal if it still fits; RETIRE it when it no longer fits and no next outcome is clear.`,
  'goal-not-again': `Never write the goal in <goal> or one in <removed> again, in the same words or other words. A goal the person removed stays removed until they type it.`,
  'goal-typed-kept': `A goal marked typed belongs to the person. Never reword, replace or retire it before its linked task tree is met.`,
  'goal-outcome-happened': `The task tree is the source of task status. Do not mark a goal met from prose; task updates are made through the tasks tool.`,
  'goal-work-left': `Do not replace an unmet goal while one of its linked tasks is open. Once work is met, write GOAL for a clear next outcome, or RETIRE when the goal no longer fits and none is clear.`,
  'task-links': `Write LINK only to connect an open ask or a live child to a task already listed in <task tree>. Use its exact task id. Never create, close, rename or relink a task here.`,
} as const

export type GoalPartId = keyof typeof GOAL_PARTS

export function goalRules(without: readonly GoalPartId[] = []): string {
  return Object.entries(GOAL_PARTS)
    .filter(([id]) => !without.includes(id as GoalPartId))
    .map(([, rule]) => `- ${rule}`)
    .join(NL)
}

function refusedLine(o: SessionStatus, tree: TaskTree, now: number): string | null {
  const refusal = o.goalRefused
  const goal = o.goal
  if (refusal === null || goal === null) return null
  const line = refusal.line.toUpperCase()
  const linked = tasksForGoal(tree, goal)
  const text: Record<GoalRefusal['why'], () => string | null> = {
    typed: () => 'the person typed this goal, so it belongs to them until its task tree is met.',
    met: () => 'the goal is met. It stays until GOAL sets the next one.',
    'work-open': () => {
      const open = linked.filter(task => task.status !== 'done' && task.status !== 'dropped')
      return open.length === 0
        ? null
        : `the goal's linked work is still open: ${open.map(task => task.title).join(', ')}. Update task status with the tasks tool before writing ${line} again.`
    },
    moved: () =>
      goalLeftFor(o, tree, now) !== null
        ? null
        : `the work has not left the goal: its task tree changed ${duration(now - lastProgressAt(goal, tree))} ago.`,
    'no-work': () => 'no open task is outside the current goal, so there is no work for a new one.',
    restates: () => 'it restates the goal, the goal before it, or a removed goal.',
    'few-milestones': () => null,
  }
  const reason = text[refusal.why]()

  return reason === null ? null : `${line} refused: ${reason}`
}

export function goalBlocks(o: SessionStatus | null, tree: TaskTree = [], now = 0): string[] {
  if (o === null) return []
  const goal = o.goal
  if (goal === null)
    return o.removedGoals.length === 0 ? [] : [`<removed>${NL}${o.removedGoals.join(NL)}${NL}</removed>`]
  const left = goalLeftFor(o, tree, now)
  const status = isGoalMet(goal, tree) ? 'met' : tasksForGoal(tree, goal).length === 0 ? 'awaiting tasks' : 'active'
  const marks = [
    ...(goal.source === 'typed' ? ['typed'] : []),
    status,
    ...(left === null ? [] : [`no work for ${duration(left)}`]),
  ]
  const refusal = refusedLine(o, tree, now)
  const details = [`${goal.text} | ${goalTaskId(goal)} | ${marks.join(', ')}`]
  if (refusal !== null) details.push(refusal)

  return [
    `<goal>${NL}${details.join(NL)}${NL}</goal>`,
    ...(o.removedGoals.length === 0 ? [] : [`<removed>${NL}${o.removedGoals.join(NL)}${NL}</removed>`]),
  ]
}
