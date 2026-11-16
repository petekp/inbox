import type { SessionStatus, TaskHistoryEvent, TaskNode, TaskTree } from '../types'

export const TASK_HISTORY_LIMIT = 100
export const TASK_NOTES_LIMIT = 40
export const TASK_NOTE_LENGTH = 2000
export const TASK_HISTORY_DETAIL_LENGTH = 2000
const TASK_HISTORY_SOURCE_LENGTH = 100

type TaskTreeError = 'duplicate-id' | 'unknown-task' | 'unknown-parent' | 'cycle' | 'limit' | 'invalid-weight'

type TaskTreeResult = { ok: true; tree: TaskTree } | { ok: false; reason: TaskTreeError }

const failed = (reason: TaskTreeError): TaskTreeResult => ({ ok: false, reason })
const succeeded = (tree: TaskTree): TaskTreeResult => ({ ok: true, tree })

function hasTask(tree: TaskTree, id: string): boolean {
  return tree.some(task => task.id === id)
}

function boundedHistory(history: TaskHistoryEvent[], event: TaskHistoryEvent): TaskHistoryEvent[] {
  return [...history, event].slice(-TASK_HISTORY_LIMIT)
}

function eventIsValid(event: TaskHistoryEvent): boolean {
  return (
    Number.isFinite(event.at) &&
    event.source.length > 0 &&
    event.source.length <= TASK_HISTORY_SOURCE_LENGTH &&
    (event.detail === undefined || event.detail.length <= TASK_HISTORY_DETAIL_LENGTH)
  )
}

function notesAreValid(notes: string[]): boolean {
  return notes.length <= TASK_NOTES_LIMIT && notes.every(note => note.length <= TASK_NOTE_LENGTH)
}

function notesOf(notes: string[]): string[] {
  return notes.slice(0, TASK_NOTES_LIMIT).map(note => note.slice(0, TASK_NOTE_LENGTH))
}

function hasValidWeight(weight: number): boolean {
  return Number.isFinite(weight) && weight > 0
}

/** Adds a node without changing the input tree. The node id, parent and source are supplied by the caller. */
export function createTask(tree: TaskTree, node: TaskNode, source: string): TaskTreeResult {
  if (hasTask(tree, node.id)) return failed('duplicate-id')
  if (node.parentId !== null && !hasTask(tree, node.parentId)) return failed('unknown-parent')
  if (!hasValidWeight(node.weight)) return failed('invalid-weight')
  if (!notesAreValid(node.notes) || node.history.length > TASK_HISTORY_LIMIT || !node.history.every(eventIsValid)) {
    return failed('limit')
  }
  const event: TaskHistoryEvent = { at: node.createdAt, source, kind: 'created' }
  if (!eventIsValid(event)) return failed('limit')

  return succeeded([...tree, { ...node, notes: [...node.notes], history: boundedHistory(node.history, event) }])
}

/** Updates task facts and records the update time and source. */
export function updateTask(
  tree: TaskTree,
  id: string,
  changes: Partial<Pick<TaskNode, 'status' | 'weight' | 'title' | 'detail' | 'goalId' | 'streamId' | 'mergedIntoId'>>,
  at: number,
  source: string,
): TaskTreeResult {
  const task = tree.find(node => node.id === id)
  if (!task) return failed('unknown-task')
  if (changes.weight !== undefined && !hasValidWeight(changes.weight)) return failed('invalid-weight')
  const event: TaskHistoryEvent = { at, source, kind: 'updated' }
  if (!eventIsValid(event)) return failed('limit')

  return succeeded(
    tree.map(node =>
      node.id === id ? { ...node, ...changes, updatedAt: at, history: boundedHistory(node.history, event) } : node,
    ),
  )
}

/** Moves a node under another node, refusing a missing parent or a cycle. */
export function moveTask(
  tree: TaskTree,
  id: string,
  parentId: string | null,
  at: number,
  source: string,
): TaskTreeResult {
  const task = tree.find(node => node.id === id)
  if (!task) return failed('unknown-task')
  if (parentId !== null && !hasTask(tree, parentId)) return failed('unknown-parent')
  if (parentId === id) return failed('cycle')

  let ancestor = parentId
  const visited = new Set<string>()
  while (ancestor !== null) {
    if (ancestor === id || visited.has(ancestor)) return failed('cycle')
    visited.add(ancestor)
    ancestor = tree.find(node => node.id === ancestor)?.parentId ?? null
  }

  const event: TaskHistoryEvent = { at, source, kind: 'moved' }
  if (!eventIsValid(event)) return failed('limit')

  return succeeded(
    tree.map(node =>
      node.id === id ? { ...node, parentId, updatedAt: at, history: boundedHistory(node.history, event) } : node,
    ),
  )
}

/** Marks a task done and records when and where it was completed. */
export function completeTask(tree: TaskTree, id: string, at: number, source: string): TaskTreeResult {
  const task = tree.find(node => node.id === id)
  if (!task) return failed('unknown-task')
  const event: TaskHistoryEvent = { at, source, kind: 'completed' }
  if (!eventIsValid(event)) return failed('limit')

  return succeeded(
    tree.map(node =>
      node.id === id ? { ...node, status: 'done', updatedAt: at, history: boundedHistory(node.history, event) } : node,
    ),
  )
}

/** Adds a bounded note and records it in the task history. */
export function addTaskNote(tree: TaskTree, id: string, note: string, at: number, source: string): TaskTreeResult {
  const task = tree.find(node => node.id === id)
  if (!task) return failed('unknown-task')
  if (task.notes.length >= TASK_NOTES_LIMIT || note.length > TASK_NOTE_LENGTH) return failed('limit')
  const event: TaskHistoryEvent = { at, source, kind: 'note', detail: note }
  if (!eventIsValid(event)) return failed('limit')

  return succeeded(
    tree.map(node =>
      node.id === id
        ? { ...node, notes: [...node.notes, note], updatedAt: at, history: boundedHistory(node.history, event) }
        : node,
    ),
  )
}

/** Appends a bounded fact while retaining only the newest history events. */
export function appendTaskHistory(tree: TaskTree, id: string, event: TaskHistoryEvent): TaskTreeResult {
  const task = tree.find(node => node.id === id)
  if (!task) return failed('unknown-task')
  if (!eventIsValid(event)) return failed('limit')

  return succeeded(
    tree.map(node =>
      node.id === id
        ? { ...node, history: boundedHistory(node.history, event), updatedAt: Math.max(node.updatedAt, event.at) }
        : node,
    ),
  )
}

/** Computes the weighted share of completed root work. Parent weights weight their child group; progress is never saved. */
export function weightedTaskProgress(tree: TaskTree): number {
  const children = new Map<string | null, TaskNode[]>()
  for (const task of tree) children.set(task.parentId, [...(children.get(task.parentId) ?? []), task])

  const progress = (task: TaskNode, seen: Set<string>): number => {
    if (task.status === 'done') return 1
    if (task.status === 'dropped' || seen.has(task.id)) return 0
    const descendants = children.get(task.id) ?? []
    if (descendants.length === 0) return 0
    const path = new Set(seen).add(task.id)
    return weightedAverage(descendants.map(child => [progress(child, path), child.weight]))
  }

  return weightedAverage((children.get(null) ?? []).map(task => [progress(task, new Set()), task.weight]))
}

function weightedAverage(values: [number, number][]): number {
  const total = values.reduce((sum, [, weight]) => sum + weight, 0)
  return total === 0 ? 0 : values.reduce((sum, [value, weight]) => sum + value * weight, 0) / total
}

/** Converts the current Status work rows once, retaining source order and their explicit goal links. */
export function taskTreeFromStatus(status: SessionStatus | null): TaskTree {
  if (!status) return []
  const goalId = status.goal && !status.goal.isAwaitingMilestones ? `goal-${status.goal.setAt}` : undefined
  const milestones = status.milestones.map(milestone => {
    const node: TaskNode = {
      id: milestone.id,
      parentId: null,
      status: milestone.status,
      weight: 1,
      title: milestone.name,
      detail: milestone.text,
      notes: notesOf(milestone.was ? [milestone.was] : []),
      createdAt: milestone.changedAt,
      updatedAt: milestone.closedAt ?? milestone.changedAt,
      history: [{ at: milestone.changedAt, source: 'status', kind: 'imported' }],
      ...(goalId ? { goalId } : {}),
    }
    if (milestone.closedAt !== null) {
      node.history = [
        ...node.history,
        {
          at: milestone.closedAt,
          source: 'status',
          kind: milestone.status === 'done' ? 'completed' : 'updated',
          detail: milestone.status,
        },
      ]
    }
    return node
  })
  const milestoneIds = new Set(milestones.map(node => node.id))
  const subjectIds = new Set(status.subjects.map(subject => subject.id))
  const subjects = status.subjects.map(subject => {
    const served = status.serves[subject.id]
    const milestoneId = typeof served === 'string' && served !== 'none' && milestoneIds.has(served) ? served : null
    const mergedIntoId = subject.into && subjectIds.has(subject.into) ? subject.into : undefined
    const parentId = milestoneId
    const notes = notesOf([subject.was, subject.merged].filter((note): note is string => note !== null))
    const node: TaskNode = {
      id: subject.id,
      parentId,
      status: subject.status,
      weight: 1,
      title: subject.name,
      detail: subject.text,
      notes,
      createdAt: subject.createdAt,
      updatedAt: subject.closedAt ?? subject.changedAt,
      history: [
        { at: subject.createdAt, source: 'status', kind: 'created' },
        { at: subject.changedAt, source: 'status', kind: 'imported' },
      ],
      ...(goalId && milestoneId ? { goalId } : {}),
      ...(mergedIntoId ? { mergedIntoId } : {}),
    }
    if (subject.closedAt !== null) {
      node.history = [
        ...node.history,
        {
          at: subject.closedAt,
          source: 'status',
          kind: subject.status === 'done' ? 'completed' : 'updated',
          detail: subject.status,
        },
      ]
    }
    return node
  })

  return [...milestones, ...subjects]
}
