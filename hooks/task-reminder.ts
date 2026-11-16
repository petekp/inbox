import type { Session } from '../types'

export const TASK_REMINDER_THRESHOLD = 24
export const TASK_REMINDER_TEXT =
  'You have made 24 tool calls since this turn began or your last tasks call. Update your task tree if your plan or progress changed.'

export type TaskReminderState = { callsSinceTasks: number; hasUsedTasks: boolean }

export const NO_TASK_REMINDER: TaskReminderState = { callsSinceTasks: 0, hasUsedTasks: false }

export function taskReminderState(value: unknown): TaskReminderState {
  if (!value || typeof value !== 'object') return NO_TASK_REMINDER
  const saved = value as Partial<TaskReminderState>

  return {
    callsSinceTasks:
      typeof saved.callsSinceTasks === 'number' && Number.isSafeInteger(saved.callsSinceTasks)
        ? Math.max(0, Math.min(TASK_REMINDER_THRESHOLD, saved.callsSinceTasks))
        : 0,
    hasUsedTasks: saved.hasUsedTasks === true,
  }
}

export function resetTaskReminderTurn(state: TaskReminderState): TaskReminderState {
  return state.callsSinceTasks === 0 ? state : { ...state, callsSinceTasks: 0 }
}

export function taskReminderAfterToolCall(
  state: TaskReminderState,
  options: { isMainAgent: boolean; isTasksCall: boolean; hasTaskTree: boolean },
): { state: TaskReminderState; reminder: string | null } {
  if (!options.isMainAgent) return { state, reminder: null }
  if (options.isTasksCall) return { state: { callsSinceTasks: 0, hasUsedTasks: true }, reminder: null }

  const callsSinceTasks = Math.min(TASK_REMINDER_THRESHOLD, state.callsSinceTasks + 1)
  const shouldRemind = callsSinceTasks === TASK_REMINDER_THRESHOLD && (options.hasTaskTree || state.hasUsedTasks)

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
    hasTaskTree: session.taskTree.length > 0,
  })

  return {
    session: counted.state === session.taskReminder ? session : { ...session, taskReminder: counted.state },
    reminder: counted.reminder,
  }
}
