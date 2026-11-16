import {
  addTaskNote,
  completeTask,
  createTask,
  moveTask,
  TASK_DEPTH_LIMIT,
  TASK_HISTORY_DETAIL_LENGTH,
  TASK_NODE_LIMIT,
  TASK_NOTE_LENGTH,
  TASK_TITLE_LENGTH,
  TASK_WEIGHT_MAX,
  TASK_WEIGHT_MIN,
  updateTask,
} from './task-tree'
import type { TaskNode, TaskStatus, TaskTree } from '../types'

const TASK_ID_LENGTH = 100
const TASK_STATUSES: readonly TaskStatus[] = ['working', 'queued', 'waits-on-other', 'done', 'dropped']

type TaskTreeError = 'duplicate-id' | 'unknown-task' | 'unknown-parent' | 'cycle' | 'limit' | 'invalid-weight'
type TaskTreeResult = { ok: true; tree: TaskTree } | { ok: false; reason: TaskTreeError }

function taskId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function taskText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function failure(tree: TaskTree, result: TaskTreeResult, id: string): TaskToolAnswer {
  if (result.ok)
    return { taskTree: result.tree, result: `Task saved: ${JSON.stringify(result.tree.find(task => task.id === id))}` }
  const detail: Record<TaskTreeError, string> = {
    'duplicate-id': `task_id "${id}" already exists; choose a new id.`,
    'unknown-task': `task_id "${id}" is not in this session's task tree; use an existing id or add it first.`,
    'unknown-parent': "parent_id is not in this session's task tree; use an existing task id or null for the root.",
    cycle: "this move would create a cycle; choose a parent outside the task's descendants or null for the root.",
    limit: `this change exceeds a task-tree limit (${TASK_NODE_LIMIT} tasks, ${TASK_DEPTH_LIMIT} levels, or a field/history limit); reduce it or choose another parent.`,
    'invalid-weight': `weight must be a finite number from ${TASK_WEIGHT_MIN} to ${TASK_WEIGHT_MAX}.`,
  }
  return { taskTree: tree, result: `Not saved: ${detail[result.reason]}` }
}

type TaskToolAnswer = { taskTree: TaskTree; result: string }

/** Applies a task tool call and returns its normalized result for the calling agent. */
export function taskTreeAnswer(tree: TaskTree, input: Record<string, unknown>, now: number): TaskToolAnswer {
  const operation = input.operation
  if (!['add', 'update', 'move', 'complete', 'note'].includes(String(operation)))
    return { taskTree: tree, result: 'Not saved: operation must be add, update, move, complete or note.' }

  const id = taskId(input.task_id)
  if (!id || id.length > TASK_ID_LENGTH)
    return { taskTree: tree, result: `Not saved: task_id must be 1–${TASK_ID_LENGTH} characters.` }

  let result: TaskTreeResult
  if (operation === 'add') {
    const title = taskText(input.title)
    if (!title) return { taskTree: tree, result: 'Not saved: add needs a non-empty title.' }
    if (title.length > TASK_TITLE_LENGTH)
      return { taskTree: tree, result: `Not saved: title must be at most ${TASK_TITLE_LENGTH} characters.` }
    const detail = taskText(input.detail)
    if (detail.length > TASK_HISTORY_DETAIL_LENGTH)
      return { taskTree: tree, result: `Not saved: detail must be at most ${TASK_HISTORY_DETAIL_LENGTH} characters.` }
    const status = input.status === undefined ? 'queued' : input.status
    if (typeof status !== 'string' || !TASK_STATUSES.includes(status as TaskStatus))
      return { taskTree: tree, result: `Not saved: status must be ${TASK_STATUSES.join(', ')}.` }
    const weight = input.weight === undefined ? 1 : input.weight
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < TASK_WEIGHT_MIN || weight > TASK_WEIGHT_MAX)
      return {
        taskTree: tree,
        result: `Not saved: weight must be a finite number from ${TASK_WEIGHT_MIN} to ${TASK_WEIGHT_MAX}.`,
      }
    const parent = input.parent_id === undefined ? null : input.parent_id
    if (parent !== null && (typeof parent !== 'string' || !parent.trim() || parent.length > TASK_ID_LENGTH))
      return {
        taskTree: tree,
        result: `Not saved: parent_id must be an existing task id up to ${TASK_ID_LENGTH} characters, or null.`,
      }
    const node: TaskNode = {
      id,
      parentId: typeof parent === 'string' ? parent.trim() : null,
      status: status as TaskStatus,
      weight,
      title,
      detail,
      notes: [],
      createdAt: now,
      updatedAt: now,
      history: [],
    }
    result = createTask(tree, node, 'agent')
  } else if (operation === 'update') {
    const changes: Partial<Pick<TaskNode, 'title' | 'detail' | 'status' | 'weight'>> = {}
    if (input.title !== undefined) {
      const title = taskText(input.title)
      if (!title) return { taskTree: tree, result: 'Not saved: title must not be empty.' }
      if (title.length > TASK_TITLE_LENGTH)
        return { taskTree: tree, result: `Not saved: title must be at most ${TASK_TITLE_LENGTH} characters.` }
      changes.title = title
    }
    if (input.detail !== undefined) {
      const detail = taskText(input.detail)
      if (detail.length > TASK_HISTORY_DETAIL_LENGTH)
        return { taskTree: tree, result: `Not saved: detail must be at most ${TASK_HISTORY_DETAIL_LENGTH} characters.` }
      changes.detail = detail
    }
    if (input.status !== undefined) {
      if (typeof input.status !== 'string' || !TASK_STATUSES.includes(input.status as TaskStatus))
        return { taskTree: tree, result: `Not saved: status must be ${TASK_STATUSES.join(', ')}.` }
      changes.status = input.status as TaskStatus
    }
    if (input.weight !== undefined) {
      if (
        typeof input.weight !== 'number' ||
        !Number.isFinite(input.weight) ||
        input.weight < TASK_WEIGHT_MIN ||
        input.weight > TASK_WEIGHT_MAX
      )
        return {
          taskTree: tree,
          result: `Not saved: weight must be a finite number from ${TASK_WEIGHT_MIN} to ${TASK_WEIGHT_MAX}.`,
        }
      changes.weight = input.weight
    }
    if (Object.keys(changes).length === 0)
      return { taskTree: tree, result: 'Not saved: update needs title, detail, status or weight to change.' }
    result = updateTask(tree, id, changes, now, 'agent')
  } else if (operation === 'move') {
    const parent = input.parent_id
    if (parent !== null && (typeof parent !== 'string' || !parent.trim() || parent.length > TASK_ID_LENGTH))
      return {
        taskTree: tree,
        result: `Not saved: move needs an existing parent_id up to ${TASK_ID_LENGTH} characters, or null for the root.`,
      }
    result = moveTask(tree, id, typeof parent === 'string' ? parent.trim() : null, now, 'agent')
  } else if (operation === 'complete') {
    result = completeTask(tree, id, now, 'agent')
  } else {
    const note = taskText(input.note)
    if (!note) return { taskTree: tree, result: 'Not saved: note needs non-empty text.' }
    if (note.length > TASK_NOTE_LENGTH)
      return { taskTree: tree, result: `Not saved: note must be at most ${TASK_NOTE_LENGTH} characters.` }
    result = addTaskNote(tree, id, note, now, 'agent')
  }
  return failure(tree, result, id)
}
