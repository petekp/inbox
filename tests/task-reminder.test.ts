import { expect, test } from 'claude-code/testing'

import {
  NO_TASK_REMINDER,
  TASK_REMINDER_TEXT,
  TASK_REMINDER_THRESHOLD,
  taskReminderAfterToolCall,
  taskReminderSession,
  taskReminderState,
} from '../hooks/task-reminder'
import { emptySession, upgradeSession } from '../hooks/session-files'
import { startTurn } from '../hooks/session-turns'
import type { SavedSession } from '../hooks/session-files'
import type { TaskReminderState } from '../hooks/task-reminder'

function call(state: TaskReminderState, options = { isMainAgent: true, isTasksCall: false }) {
  return taskReminderAfterToolCall(state, options)
}

test('the task reminder counts across short prompts with no task tree', () => {
  let session = emptySession()
  const reminders: number[] = []
  let calls = 0

  for (let prompt = 0; prompt < 12; prompt++) {
    session = startTurn(session)
    for (let n = 0; n < 2; n++) {
      calls++
      const result = taskReminderSession(session, true, false)
      session = result.session
      if (result.reminder) reminders.push(calls)
      if (calls < TASK_REMINDER_THRESHOLD) expect(result.reminder).toBeNull()
    }
  }

  expect(reminders).toEqual([24])
  expect(session.taskReminder).toEqual(NO_TASK_REMINDER)

  for (let n = 1; n <= TASK_REMINDER_THRESHOLD; n++) {
    const result = taskReminderSession(session, true, false)
    session = result.session
    expect(result.reminder).toBe(n === TASK_REMINDER_THRESHOLD ? TASK_REMINDER_TEXT : null)
  }
})

test('a tasks call resets the count, and subagent calls do not count', () => {
  const beforeTasks = { callsSinceTasks: 17 }
  const afterTasks = call(beforeTasks, { isMainAgent: true, isTasksCall: true }).state
  expect(afterTasks).toEqual(NO_TASK_REMINDER)

  const subagent = call({ callsSinceTasks: 9 }, { isMainAgent: false, isTasksCall: false })
  expect(subagent).toEqual({ state: { callsSinceTasks: 9 }, reminder: null })
})

test('saved reminder state drops the old flag and defaults absent or invalid counts to zero', () => {
  expect(taskReminderState({ callsSinceTasks: 99, hasUsedTasks: true })).toEqual({ callsSinceTasks: 24 })
  expect(taskReminderState({ callsSinceTasks: -1, hasUsedTasks: true })).toEqual(NO_TASK_REMINDER)
  expect(taskReminderState({ hasUsedTasks: true })).toEqual(NO_TASK_REMINDER)
  expect(
    upgradeSession({ taskReminder: { callsSinceTasks: 7, hasUsedTasks: true } } as SavedSession).taskReminder,
  ).toEqual({ callsSinceTasks: 7 })
  expect(upgradeSession({ taskReminder: { hasUsedTasks: true } } as unknown as SavedSession).taskReminder).toEqual(
    NO_TASK_REMINDER,
  )
})

test('the session adapter saves the reminder count after a reminder', () => {
  const session = { ...emptySession(), taskReminder: { callsSinceTasks: 23 } }
  const result = taskReminderSession(session, true, false)

  expect(result.reminder).toBe(TASK_REMINDER_TEXT)
  expect(result.session.taskReminder).toEqual(NO_TASK_REMINDER)
  expect(result.session).not.toBe(session)
})
