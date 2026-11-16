import type {
  TaskFactWarning,
  TaskOwner,
  TaskOwnerFact,
  TaskOwnerFacts,
  TaskOwnerState,
  TaskPrState,
  TaskProgressSegments,
  TaskTree,
} from '../types'
import { completeTask } from './task-tree'
import { weightedTaskProgressSegments } from './task-tree'

const MERGED_WARNING = 'PR merged, task still open' as const
const CLOSED_WARNING = 'PR closed without merge' as const
const OWNER_IDLE_WARNING = 'Owner idle 15m+' as const
const OWNER_FINISHED_WARNING = 'Owner finished, task open' as const
const OWNER_IDLE_AFTER_MS = 15 * 60_000

export function taskOwnerKey(owner: TaskOwner): string {
  return JSON.stringify([owner.machine, owner.agent])
}

/** Updates a sampled owner fact, retaining the first observation time while its non-working state continues. */
export function observedTaskOwnerFact(
  previous: TaskOwnerFact | undefined,
  state: TaskOwnerState,
  at: number,
): TaskOwnerFact {
  const since = state !== 'working' && previous?.state === state ? previous.since : at

  return { state, since }
}

/** Derives owner warnings, stalled markers, and state segments without changing task status. */
export function applyTaskOwnerFacts(
  tree: TaskTree,
  facts: TaskOwnerFacts,
  at: number,
): { stalledSince: Record<string, number>; warnings: TaskFactWarning[]; segments: TaskProgressSegments } {
  const stalledSince: Record<string, number> = {}
  const warnings: TaskFactWarning[] = []
  for (const task of tree) {
    const owner = task.links?.owner
    const fact = owner ? facts[taskOwnerKey(owner)] : undefined
    if (task.status !== 'working' || !owner || !fact || fact.state === 'working') continue
    stalledSince[task.id] = fact.since
    if (at - fact.since >= OWNER_IDLE_AFTER_MS) warnings.push({ taskId: task.id, owner, message: OWNER_IDLE_WARNING })
    if (fact.state === 'done' || fact.state === 'idle')
      warnings.push({ taskId: task.id, owner, message: OWNER_FINISHED_WARNING })
  }
  const segments = weightedTaskProgressSegments(tree, new Set(Object.keys(stalledSince)))

  return { stalledSince, warnings, segments }
}

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
