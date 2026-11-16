import { expect, test } from 'claude-code/testing'

import {
  NO_TASK_REMINDER,
  TASK_REMINDER_TEXT,
  TASK_REMINDER_THRESHOLD,
  resetTaskReminderTurn,
  taskReminderAfterToolCall,
  taskReminderSession,
  taskReminderState,
} from '../hooks/task-reminder'
import { emptySession } from '../hooks/session-files'
import type { TaskReminderState } from '../hooks/task-reminder'

function call(state: TaskReminderState, options = { isMainAgent: true, isTasksCall: false, hasTaskTree: true }) {
  return taskReminderAfterToolCall(state, options)
}

test('the task reminder waits for 24 main-agent calls, then resets its count', () => {
  let state = NO_TASK_REMINDER
  for (let n = 0; n < TASK_REMINDER_THRESHOLD - 1; n++) {
    const result = call(state)
    state = result.state
    expect(result.reminder).toBeNull()
  }

  expect(state.callsSinceTasks).toBe(23)
  const result = call(state)
  expect(result.reminder).toBe(TASK_REMINDER_TEXT)
  expect(result.state.callsSinceTasks).toBe(0)
})

test('a tasks call and a new turn reset calls, while tasks use stays remembered', () => {
  const afterTasks = call(
    { callsSinceTasks: 17, hasUsedTasks: false },
    { isMainAgent: true, isTasksCall: true, hasTaskTree: false },
  ).state
  expect(afterTasks).toEqual({ callsSinceTasks: 0, hasUsedTasks: true })
  expect(resetTaskReminderTurn({ ...afterTasks, callsSinceTasks: 9 })).toEqual(afterTasks)
})

test('subagent calls do not count, and a session without a task tree gets no reminder', () => {
  const state = { callsSinceTasks: 23, hasUsedTasks: false }
  expect(taskReminderAfterToolCall(state, { isMainAgent: false, isTasksCall: false, hasTaskTree: true })).toEqual({
    state,
    reminder: null,
  })
  expect(call(state, { isMainAgent: true, isTasksCall: false, hasTaskTree: false })).toEqual({
    state: { callsSinceTasks: 24, hasUsedTasks: false },
    reminder: null,
  })
})

test('saved reminder state is bounded and defaults safely', () => {
  expect(taskReminderState({ callsSinceTasks: 99, hasUsedTasks: true })).toEqual({
    callsSinceTasks: 24,
    hasUsedTasks: true,
  })
  expect(taskReminderState({ callsSinceTasks: -1, hasUsedTasks: 'yes' })).toEqual(NO_TASK_REMINDER)
})

test('the session adapter saves the reminder counter with the task call result', () => {
  const session = { ...emptySession(), taskReminder: { callsSinceTasks: 23, hasUsedTasks: true } }
  const result = taskReminderSession(session, true, false)

  expect(result.reminder).toBe(TASK_REMINDER_TEXT)
  expect(result.session.taskReminder).toEqual({ callsSinceTasks: 0, hasUsedTasks: true })
  expect(result.session).not.toBe(session)
})
