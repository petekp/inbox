import type { Session } from '../types'
import { taskReminderSession } from './task-reminder'

type Write = (change: (s: Session) => Session) => Promise<Session>

export async function noteTaskReminderAfterCall(
  write: Write,
  isMainAgent: boolean,
  isTasksCall: boolean,
): Promise<string | null> {
  if (!isMainAgent) return null
  let reminder: string | null = null
  await write(s => {
    const counted = taskReminderSession(s, true, isTasksCall)
    reminder = counted.reminder
    return counted.session
  }).catch(() => undefined)

  return reminder
}

export function withHookReminder<T extends { additionalContext?: string[] }>(result: T, reminder: string | null): T {
  if (!reminder) return result

  return {
    ...result,
    additionalContext: [...(result.additionalContext ?? []), reminder],
  }
}
