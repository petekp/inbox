import type { TaskFactWarning, TaskPrState, TaskTree } from '../types'
import { completeTask } from './task-tree'

const MERGED_WARNING: TaskFactWarning['message'] = 'PR merged, task still open'
const CLOSED_WARNING: TaskFactWarning['message'] = 'PR closed without merge'

/** Applies GitHub PR facts to the task tree and derives warnings for the current tree and facts. */
export function applyTaskPrFacts(
  tree: TaskTree,
  states: Record<string, TaskPrState>,
  at: number,
): { tree: TaskTree; warnings: TaskFactWarning[] } {
  let next = tree
  const warnings: TaskFactWarning[] = []
  for (const task of tree) {
    const pr = task.links?.pr
    const state = pr ? states[pr] : undefined
    if (!pr || !state || task.status === 'done' || task.status === 'dropped') continue
    if (state === 'CLOSED') {
      warnings.push({ taskId: task.id, pr, message: CLOSED_WARNING })
      continue
    }
    if (state !== 'MERGED') continue
    if (task.prMergedApplied === pr) continue
    if (task.history.some(event => event.source === 'pr' && event.kind === 'completed' && event.detail === pr)) continue
    if (tree.some(child => child.parentId === task.id && child.status !== 'done' && child.status !== 'dropped')) {
      warnings.push({ taskId: task.id, pr, message: MERGED_WARNING })
      continue
    }
    const completed = completeTask(next, task.id, at, 'pr', pr)
    if (completed.ok) next = completed.tree.map(node => (node.id === task.id ? { ...node, prMergedApplied: pr } : node))
  }

  return { tree: next, warnings }
}
