import type { Turn } from '../../hooks/conversation'
import { dialogActivity, dialogQuestions } from '../../hooks/catch-up-text'
import { clip } from '../../hooks/text'
import { activityOf, askOutcome } from './tool-calls'
import type { Stop } from '../../types'
import type { HostDeps } from './host'

/** The text blocks of a message's content, joined. */
export function textOfBlocks(content: unknown): string {
  if (!Array.isArray(content)) return ''

  return content
    .flatMap((b: { type?: unknown; text?: unknown }) =>
      b.type === 'text' && typeof b.text === 'string' ? [b.text] : [],
    )
    .join('\n')
}

export type Reply = {
  role?: unknown
  content?: unknown
  stopReason?: unknown
  errorMessage?: unknown
  errorStatus?: unknown
}

export function lastAssistant(messages: readonly unknown[]): Reply | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as Reply | undefined
    if (m?.role === 'assistant' && Array.isArray(m.content)) return m
  }

  return null
}

function apiErrorDetail(status: number | undefined, message: string): string {
  if (status === 429) return 'rate_limit'
  if (status === 503 || status === 529) return 'overloaded'
  if (status !== undefined) return String(status)

  return clip(message.split('\n')[0]?.trim() || 'no status', 60)
}

/** Why a turn stopped, from its last assistant message. Null when the turn did not end on an error. */
export async function stopOf(
  reply: Reply | null,
  isUsageLimit: HostDeps['isUsageLimit'],
  at: number,
): Promise<Stop | null> {
  if (reply?.stopReason !== 'error') return null
  const message = typeof reply.errorMessage === 'string' ? reply.errorMessage : ''
  const status = typeof reply.errorStatus === 'number' ? reply.errorStatus : undefined
  const detail = status === undefined ? '' : String(status)
  if (await isUsageLimit(status, message).catch(() => false)) return { kind: 'usage-limit', detail, resets: null, at }
  if (status === 401 || status === 403) return { kind: 'sign-in', detail, resets: null, at }

  return { kind: 'api-error', detail: apiErrorDetail(status, message), resets: null, at }
}

/** The text of a user message. */
export function userText(content: unknown): string {
  return typeof content === 'string' ? content : textOfBlocks(content)
}

type Entry = { type?: unknown; message?: unknown }

type Message = {
  role?: unknown
  content?: unknown
  synthetic?: unknown
  command?: unknown
  toolCallId?: unknown
  isError?: unknown
  details?: unknown
}

/** The conversation of a session branch as turns, from the last `/clear` on. omp's own `/new` starts another session. */
export function conversationOf(entries: readonly unknown[]): Turn[] {
  const path = entries as Entry[]
  const messages = path
    .slice(path.findLastIndex(e => e.type === 'reset_boundary') + 1)
    .flatMap(e => (e.type === 'message' && e.message ? [e.message as Message] : []))
  const results = new Map(
    messages.flatMap(m => (m.role === 'toolResult' && typeof m.toolCallId === 'string' ? [[m.toolCallId, m]] : [])),
  )

  return messages.flatMap((m): Turn[] => {
    if (m.role === 'user' && m.synthetic !== true) return [{ role: 'person', text: userText(m.content), activity: [] }]
    if (m.role === 'bashExecution' && typeof m.command === 'string')
      return [{ role: 'person', text: `$ ${m.command}`, activity: [] }]
    if (m.role !== 'assistant' || !Array.isArray(m.content)) return []
    const activity = m.content.flatMap(
      (block: { type?: unknown; id?: unknown; name?: unknown; arguments?: unknown }) => {
        if (block.type !== 'toolCall' || typeof block.name !== 'string') return []
        const input = (block.arguments ?? {}) as Record<string, unknown>
        const result = typeof block.id === 'string' ? results.get(block.id) : undefined
        const line =
          block.name === 'ask'
            ? dialogActivity(
                dialogQuestions(input.questions),
                result
                  ? askOutcome({ ...result, content: result.content as never, isError: result.isError === true })
                  : { kind: 'open' },
              )
            : activityOf(block.name, input)

        return line ? [line] : []
      },
    )

    return [{ role: 'agent', text: textOfBlocks(m.content), activity }]
  })
}

/** A `record` or `close` result's details, which omp keeps out of the model's context. */
export type ToolDetails = { personLine: string | null }

/**
 * The line drawn under a `record` or `close` call: its person line, else the error when the call failed, else
 * nothing. A call saved before results carried details draws nothing.
 */
export function shownLine(result: {
  content: readonly { type: string; text?: string }[]
  details?: unknown
  isError?: boolean
}): string | null {
  if (result.isError) return textOfBlocks(result.content).trim() || null
  const details = result.details as Partial<ToolDetails> | null | undefined

  return typeof details?.personLine === 'string' ? details.personLine : null
}
