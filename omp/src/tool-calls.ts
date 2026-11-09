import { dialogQuestions, toolActivity } from '../../hooks/catch-up-text'
import type { DialogOutcome } from '../../hooks/catch-up-text'
import type { DialogQuestion } from '../../types'
import { formQuestions } from './ask-form'

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

/**
 * The questions of an `ask` call. omp 18.18.2 and older take `questions[]`, which saved sessions still hold. omp
 * 18.18.3 and later take one HTML form as `html`.
 */
export function askQuestions(input: Record<string, unknown>): DialogQuestion[] {
  if (Array.isArray(input.questions)) return dialogQuestions(input.questions)

  return typeof input.html === 'string' ? dialogQuestions(formQuestions(input.html)) : []
}

/**
 * The answers of a submitted form, from omp 18.18.3's `details.answers`, in the `"question"="answer"` form Claude's
 * dialog tool gives. Null when the details hold no answered field.
 */
function formAnswerText(answers: unknown): string | null {
  const answered = (Array.isArray(answers) ? answers : []).flatMap((a: { question?: unknown; answer?: unknown }) =>
    typeof a?.question === 'string' && typeof a.answer === 'string' && a.answer.trim() !== ''
      ? [`"${a.question}"="${a.answer.trim()}"`]
      : [],
  )

  return answered.length > 0 ? answered.join(', ') : null
}

/** How an `ask` dialog ended, from its tool result. A cancel is an error result, or one with no text. */
export function askOutcome(event: {
  content: { type: string; text?: string }[]
  isError: boolean
  details?: unknown
}): DialogOutcome {
  const details = (event.details ?? {}) as { timedOut?: unknown; answers?: unknown }
  const text = event.content.flatMap(b => (b.type === 'text' && b.text ? [b.text] : [])).join('\n')
  if (event.isError || text === '') return { kind: 'dismissed' }
  const answer = formAnswerText(details.answers) ?? text

  return { kind: details.timedOut === true ? 'timed-out' : 'answered', answer }
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
