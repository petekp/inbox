import type { Session } from '../types'

export const TASK_REMINDER_THRESHOLD = 24
export const TASK_REMINDER_TEXT =
  'You have made 24 tool calls across turns without calling tasks. Create a task tree if you do not have one, or update it if your plan or progress changed.'

export type TaskReminderState = { callsSinceTasks: number }

export const NO_TASK_REMINDER: TaskReminderState = { callsSinceTasks: 0 }

export function taskReminderState(value: unknown): TaskReminderState {
  if (!value || typeof value !== 'object') return NO_TASK_REMINDER
  const saved = value as Partial<TaskReminderState>

  return {
    callsSinceTasks:
      typeof saved.callsSinceTasks === 'number' && Number.isSafeInteger(saved.callsSinceTasks)
        ? Math.max(0, Math.min(TASK_REMINDER_THRESHOLD, saved.callsSinceTasks))
        : 0,
  }
}

export function taskReminderAfterToolCall(
  state: TaskReminderState,
  options: { isMainAgent: boolean; isTasksCall: boolean },
): { state: TaskReminderState; reminder: string | null } {
  if (!options.isMainAgent) return { state, reminder: null }
  if (options.isTasksCall) return { state: NO_TASK_REMINDER, reminder: null }

  const callsSinceTasks = Math.min(TASK_REMINDER_THRESHOLD, state.callsSinceTasks + 1)
  const shouldRemind = callsSinceTasks === TASK_REMINDER_THRESHOLD

  return {
    state: { ...state, callsSinceTasks: shouldRemind ? 0 : callsSinceTasks },
    reminder: shouldRemind ? TASK_REMINDER_TEXT : null,
  }
}

export function taskReminderSession(
  session: Session,
  isMainAgent: boolean,
  isTasksCall: boolean,
): { session: Session; reminder: string | null } {
  const counted = taskReminderAfterToolCall(session.taskReminder, {
    isMainAgent,
    isTasksCall,
  })

  return {
    session: counted.state === session.taskReminder ? session : { ...session, taskReminder: counted.state },
    reminder: counted.reminder,
  }
}
