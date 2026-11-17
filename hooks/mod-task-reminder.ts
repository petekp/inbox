import type { Session } from '../types'
import { noteRanCall } from './mod-records'
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

function withHookReminder<T extends { additionalContext?: string[] }>(result: T, reminder: string | null): T {
  if (!reminder) return result

  return {
    ...result,
    additionalContext: [...(result.additionalContext ?? []), reminder],
  }
}

export async function postToolReminder<
  E extends { tool_use_id: string; tool_name: string; agent_id?: string },
  T extends { additionalContext?: string[] },
>(e: E, next: (event: E) => Promise<T>, write: Write, enabled: boolean): Promise<T> {
  if (enabled) noteRanCall(e.tool_use_id, e.tool_name)
  const result = await next(e)
  const isInboxTool = [
    'mcp__inbox__record',
    'mcp__inbox__close',
    'mcp__inbox__order_prs',
    'mcp__inbox__tasks',
  ].includes(e.tool_name)
  const reminder = enabled && !isInboxTool ? await noteTaskReminderAfterCall(write, !e.agent_id, false) : null
  return withHookReminder(result, reminder)
}

export function withToolCallReminder<T extends { text?: string }>(result: T, reminder: string | null): T {
  if (!reminder) return result

  return {
    ...result,
    text: result.text ? `${result.text}\n\n${reminder}` : reminder,
  }
}

export function isDeniedToolCall(result: { deny?: string; isError?: true; text?: string }): boolean {
  return (
    typeof result.deny === 'string' ||
    (result.isError === true &&
      result.text?.startsWith('Permission to use ') === true &&
      result.text.endsWith(' has been denied.'))
  )
}
