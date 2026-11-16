import type { GoalRefusal, SessionStatus, StatusGoal, TaskTree } from '../types'
import type { Op } from './status'
import { goalRefusal, tasksForGoal } from './status-goal-gate'
import { clipWords, DESCRIPTION_KEPT, nameKey, REMOVED_KEPT, stems, words } from './status-limits'

const RESTATED_SHARE = 0.8

export function restatesGoal(text: string, goal: string): boolean {
  const own = [...stems(text)],
    theirs = stems(goal)
  const shared = own.filter(word => theirs.has(word)).length,
    hasNewNumber = own.some(word => /\d/.test(word) && !theirs.has(word))
  return own.length > 0 && !hasNewNumber && shared >= RESTATED_SHARE * own.length
}

export function hasSameWords(a: string, b: string): boolean {
  const [x, y] = [words(a), words(b)]
  return x.size === y.size && [...x].every(word => y.has(word))
}

function setGoal(o: SessionStatus, text: string, now: number, source: StatusGoal['source']): SessionStatus {
  return {
    ...o,
    goal: { text, setAt: now, metAt: null, was: o.goal?.text ?? null, isAwaitingMilestones: true, source },
    goalRemoved: null,
    goalRefused: null,
  }
}

function goalLineRefusal(o: SessionStatus, op: Extract<Op, { kind: 'goal' }>): GoalRefusal['why'] | null {
  const text = clipWords(op.text, DESCRIPTION_KEPT)
  return [o.goal?.text, o.goal?.was, ...o.removedGoals].some(old => old != null && restatesGoal(text, old))
    ? 'restates'
    : null
}

export function applyGoalOp(
  o: SessionStatus,
  op: Extract<Op, { kind: 'goal' | 'retire' }>,
  now: number,
  tree: TaskTree,
  start: SessionStatus = o,
): SessionStatus {
  const why = op.kind === 'goal' ? goalLineRefusal(o, op) : null
  const refused = why ?? goalRefusal(o, start, tree, op.kind, now)
  if (refused !== null) return { ...o, goalRefused: { line: op.kind, why: refused } }
  if (op.kind === 'retire') return { ...o, goal: null, goalRefused: null }

  return setGoal(o, clipWords(op.text, DESCRIPTION_KEPT), now, 'inferred')
}

export function removeGoal(o: SessionStatus): SessionStatus {
  const goal = o.goal
  if (goal === null) return o
  const removedGoals = [...o.removedGoals.filter(key => key !== nameKey(goal.text)), nameKey(goal.text)]
  const goalRemoved = { goal, milestones: o.milestones, serves: o.serves, askSubjects: o.askSubjects }

  return { ...o, goal: null, goalRefused: null, removedGoals: removedGoals.slice(-REMOVED_KEPT), goalRemoved }
}

export function restoreGoal(o: SessionStatus): SessionStatus {
  const removed = o.goalRemoved
  if (removed === null || o.goal !== null) return o
  return {
    ...o,
    goal: removed.goal,
    removedGoals: o.removedGoals.filter(key => key !== nameKey(removed.goal.text)),
    goalRemoved: null,
  }
}

export function settleGoal(saved: SessionStatus, tree: TaskTree, now: number): SessionStatus {
  const goal = saved.goal
  if (goal === null) return saved
  const linked = tasksForGoal(tree, goal)
  const awaiting = linked.length === 0
  const was = saved.lastLookAt !== null && goal.setAt <= saved.lastLookAt ? null : goal.was
  const metAt =
    linked.length > 0 && linked.every(task => task.status === 'done' || task.status === 'dropped')
      ? (goal.metAt ?? now)
      : null
  if (awaiting === goal.isAwaitingMilestones && metAt === goal.metAt && was === goal.was) return saved
  return { ...saved, goal: { ...goal, isAwaitingMilestones: awaiting, metAt, was } }
}

export function setTypedGoal(o: SessionStatus, text: string, now: number): SessionStatus {
  const typed = clipWords(text, DESCRIPTION_KEPT)
  if (typed === '') return o
  const same = o.goal !== null && o.goal.metAt === null && hasSameWords(o.goal.text, typed)
  if (same) return { ...o, goal: { ...o.goal!, text: typed, source: 'typed' } }
  return setGoal(o, typed, now, 'typed')
}
