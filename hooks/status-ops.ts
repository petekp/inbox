import type { SessionStatus, TaskTree } from '../types'
import { EMPTY_SESSION_STATUS, clipWords, DESCRIPTION_KEPT, isNumberOnly, NAME_KEPT } from './status-limits'
import type { Op, StatusAnswer } from './status'
import { applyGoalOp, hasSameWords, settleGoal } from './status-goal-ops'

const linksWith = (ids: readonly string[], id: string): string[] => (ids.includes(id) ? [...ids] : [...ids, id])

export function applyOps(
  last: SessionStatus | null,
  ops: Op[],
  now: number,
  askIds: ReadonlySet<string>,
  tree: TaskTree = [],
): SessionStatus {
  let o: SessionStatus = {
    ...(last ?? EMPTY_SESSION_STATUS),
    children: (last?.children ?? []).map(child => ({ ...child })),
    askSubjects: Object.fromEntries(Object.entries(last?.askSubjects ?? {}).filter(([ask]) => askIds.has(ask))),
    goalRefused: null,
  }
  const taskIds = new Set(tree.map(task => task.id))
  const findTask = (id: string) => taskIds.has(id)
  const start = last ?? o
  for (const op of ops) {
    if (op.kind === 'none') continue
    if (op.kind === 'goal' || op.kind === 'retire') {
      o = applyGoalOp(o, op, now, tree, start)
    } else if (op.kind === 'head') {
      if (!isNumberOnly(op.title)) {
        const title = clipWords(op.title, NAME_KEPT)
        const description = clipWords(op.description, DESCRIPTION_KEPT)
        if (!o.head || !hasSameWords(o.head.title, title) || o.head.description !== description)
          o = { ...o, head: { title, description } }
      }
    } else {
      const task = findTask(op.taskId) ? op.taskId : null
      if (task === null) continue
      const child = o.children.find(item => item.id === op.ref)
      if (child) child.subjectId = task
      else if (askIds.has(op.ref)) o.askSubjects[op.ref] = linksWith(o.askSubjects[op.ref] ?? [], task)
    }
  }

  return settleGoal(o, tree, now)
}

export function applyStatus(
  last: SessionStatus | null,
  answer: StatusAnswer,
  now: number,
  askIds: ReadonlySet<string>,
  readSetAt: number | null = last?.goal?.setAt ?? null,
  taskTree: TaskTree = [],
): SessionStatus | null {
  const read = last?.goalRefused ? { ...last, goalRefused: null } : last
  const o = answer.kind === 'ops' ? applyOps(last, answer.ops, now, askIds, taskTree) : read
  if (o === null) return null
  const settled = settleGoal(o, taskTree, now)
  const isRemovedRead = settled.goalRemoved !== null && settled.goalRemoved.goal.setAt === readSetAt

  return settled.goalRemoved === null || isRemovedRead ? settled : { ...settled, goalRemoved: null }
}
