import type { SessionMessage } from 'claude-code'
import type { Stop } from '../types'
import { dialogActivity, dialogQuestions, toolActivity } from './catch-up-text'
import type { DialogOutcome } from './catch-up-text'
import { flattenConversation } from './conversation'
import type { Turn } from './conversation'
import { clip } from './text'

const NL = '\n'

export function dialogOutcome(ran: { text?: string; isError?: true; deny?: string; result?: unknown }): DialogOutcome {
  if (ran.isError || typeof ran.deny === 'string') return { kind: 'dismissed' }
  const answer = ran.text ?? ''
  const fields = ran.result && typeof ran.result === 'object' ? (ran.result as { afkTimeoutMs?: unknown }) : {}

  return typeof fields.afkTimeoutMs === 'number' ? { kind: 'timed-out', answer } : { kind: 'answered', answer }
}

/**
 * The tool the Claude desktop app gives the agent to end a turn. With a question, the app draws a box under the
 * reply: the recap, the question, and up to two buttons. The agent writes nothing after it, so the question is
 * often in the box alone.
 */
export const TURN_BOX_TOOL = 'mcp__ccd_turn__wrap_up'

const BOX_BUTTONS = 2

/**
 * What the app's box shows the person, as text that ends the reply, or null when it shows no question. It reads the
 * fields the app reads: `recap`, `ask` and `actions`, or their `next_` forms. An action names an app button, such as
 * `create_pr`, or has its own `label`.
 */
export function turnBoxText(input: Record<string, unknown>): string | null {
  const field = (...keys: string[]) =>
    keys
      .map(k => input[k])
      .find((v): v is string => typeof v === 'string' && v.trim() !== '')
      ?.trim()
  const ask = field('ask', 'next_ask', 'next_brief')
  if (!ask) return null
  const actions = input.actions ?? input.next_actions
  const buttons = (Array.isArray(actions) ? actions : [])
    .map(a => {
      const action = (a ?? {}) as Record<string, unknown>
      if (typeof action.action === 'string') return action.action.replaceAll('_', ' ')

      return typeof action.label === 'string' ? action.label.trim() : ''
    })
    .filter(Boolean)
    .slice(0, BOX_BUTTONS)
  const recap = field('recap', 'next_recap', 'outcome')

  return [recap, buttons.length > 0 ? `${ask}${NL}Options: ${buttons.join(' / ')}` : ask].filter(Boolean).join(NL + NL)
}

/** The mod's conversation as turns. A shell or slash command row is already its line, so it is not cut. */
function transcriptTurns(messages: SessionMessage[]): Turn[] {
  return messages.map((m): Turn => {
    const text = m.text.trim()
    if (m.role === 'user') {
      const row = readCommandRow(text)
      if (!row) return { role: 'person', text, activity: [] }

      return { role: 'person', text: commandRowLine(row) ?? '', activity: [], isVerbatim: true }
    }
    const activity = m.toolUses.flatMap(use => {
      const line =
        use.tool === 'AskUserQuestion'
          ? dialogActivity(dialogQuestions(use.input.questions), dialogOutcome(use))
          : toolActivity(use.tool, use.input)

      return line ? [line] : []
    })

    return { role: 'agent', text, activity }
  })
}

export function transcriptText(messages: SessionMessage[]): string {
  return flattenConversation(transcriptTurns(messages))
}

type CommandRow =
  | { kind: 'shell'; command: string }
  | { kind: 'output'; stdout: string; stderr: string }
  | { kind: 'slash'; name: string; args: string }

export function readCommandRow(text: string): CommandRow | null {
  const input = text.match(/^<bash-input>([\s\S]*)<\/bash-input>$/)
  if (input) return { kind: 'shell', command: (input[1] ?? '').trim() }
  const output = text.match(/<bash-stdout>([\s\S]*?)<\/bash-stdout><bash-stderr>([\s\S]*?)<\/bash-stderr>/)
  if (output) return { kind: 'output', stdout: (output[1] ?? '').trim(), stderr: (output[2] ?? '').trim() }
  const name = text.match(/<command-name>\/?([^<\s]+)<\/command-name>/)
  if (name)
    return {
      kind: 'slash',
      name: name[1] ?? '',
      args: (text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] ?? '').trim(),
    }

  return null
}

const QUIET_COMMANDS = new Set(['inbox', 'clear'])

export function commandRowLine(row: CommandRow): string | null {
  if (row.kind === 'shell') return `$ ${row.command}`
  if (row.kind === 'slash') return QUIET_COMMANDS.has(row.name) ? null : `/${row.name} ${row.args}`.trim()
  const output = [row.stdout, row.stderr].filter(Boolean).join(NL)

  return output ? `output: ${clip(output, 600)}` : null
}

export function stopKindOf(error: string, message: string): Stop['kind'] {
  if (error === 'rate_limit') return /\bhit your\b.*\blimit\b/i.test(message) ? 'usage-limit' : 'api-error'
  switch (error) {
    case 'authentication_failed':
    case 'oauth_org_not_allowed':
    case 'verification_required':
    case 'cloud_credential_error':
      return 'sign-in'
    case 'billing_error':
    case 'account_on_hold':
      return 'billing'
    default:
      return 'api-error'
  }
}

const SIGN_IN_MESSAGE =
  /\/login\b|invalid api key|invalid auth token|not logged in|authentication (?:required|failed)|login expired|sign in again/i
const BILLING_MESSAGE = /credit balance (?:is )?too low|account is on hold|out of (?:usage )?credits|billing/i

/** The stop an API error's text describes, for an error Claude Code gave no code for. */
export function stopOfMessage(message: string): Pick<Stop, 'kind' | 'detail' | 'resets'> {
  if (/\bhit your\b.*\blimit\b/i.test(message))
    return { kind: 'usage-limit', detail: 'rate_limit', resets: resetTime(message) }
  if (BILLING_MESSAGE.test(message)) return { kind: 'billing', detail: 'billing_error', resets: null }
  if (SIGN_IN_MESSAGE.test(message)) return { kind: 'sign-in', detail: 'authentication_failed', resets: null }
  if (/overloaded/i.test(message)) return { kind: 'api-error', detail: 'overloaded', resets: null }
  if (/rate.?limit|temporarily limiting requests|request rejected \(429\)/i.test(message))
    return { kind: 'api-error', detail: 'rate_limit', resets: null }

  return { kind: 'api-error', detail: 'unknown', resets: null }
}

export function resetTime(message: string): string | null {
  return message.match(/\bresets\s+(?:at\s+)?([^·(\n]+?)\s*(?:\(|·|$)/i)?.[1]?.trim() ?? null
}
