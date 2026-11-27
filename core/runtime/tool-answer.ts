import type { Ledger } from '../../types'

/**
 * A `record`, `close` or `order_prs` call's answer. `result` is the text the agent reads back. `personLine` is the line
 * the person sees under the call in the conversation, or null when the call changed nothing in the inbox.
 */
export type ToolAnswer = { ledger: Ledger; result: string; personLine: string | null }

export function unchanged(ledger: Ledger, result: string): ToolAnswer {
  return { ledger, result, personLine: null }
}

export function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
