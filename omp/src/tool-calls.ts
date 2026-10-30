import { toolActivity } from '../../hooks/model-text'
import type { DialogOutcome } from '../../hooks/model-text'

/** The activity line for an omp tool call, through the names the shared `toolActivity` knows. */
export function activityOf(tool: string, input: Record<string, unknown>): string | null {
  switch (tool) {
    case 'bash':
      return toolActivity('Bash', { command: input.command, run_in_background: input.async === true })
    case 'edit':
    case 'write':
      return toolActivity('Edit', { file_path: input.path ?? input.file_path })
  }

  return null
}

/** How an `ask` dialog ended, from its tool result. */
export function askOutcome(event: {
  content: { type: string; text?: string }[]
  isError: boolean
  details?: unknown
}): DialogOutcome {
  const details = (event.details ?? {}) as { timedOut?: boolean; chatRedirect?: boolean }
  const answer = event.content.flatMap(b => (b.type === 'text' && b.text ? [b.text] : [])).join('\n')
  if (event.isError || details.chatRedirect || answer === '') return { kind: 'dismissed' }

  return { kind: details.timedOut ? 'timed-out' : 'answered', answer }
}

/** Whether a message is the result of an ask dialog the person dismissed. */
export function isDismissedAsk(message: unknown): boolean {
  const m = message as { role?: unknown; toolName?: unknown; content?: unknown; isError?: unknown; details?: unknown }

  return (
    m?.role === 'toolResult' &&
    m.toolName === 'ask' &&
    Array.isArray(m.content) &&
    askOutcome({ content: m.content, isError: m.isError === true, details: m.details }).kind === 'dismissed'
  )
}
