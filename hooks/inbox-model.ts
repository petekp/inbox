import type { ModelCompleteResult } from 'claude-code'
import type { CallReport } from './session-host'

/** The model the mod's ledger and Status calls ask. */
export const MODEL = 'sonnet'

/**
 * A call's report for its record, for a call that asked for `model`, or null when the call runs on the conversation's
 * model, as a fork does. The engine does not say which model answered.
 */
export function callReport(r: ModelCompleteResult, model: string | null): CallReport {
  if (r.isAnswered) return { model }
  const error = r.reason === 'api-error' ? `api-error ${r.status ?? 'with no response'}: ${r.error}` : r.reason

  return { model, error, cause: r.reason === 'empty-reply' ? 'no-reply' : 'error' }
}
