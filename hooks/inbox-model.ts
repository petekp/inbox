import type { EngineInterface } from 'claude-code'
import type { CallReport } from './session-host'

/** The model the mod's ledger and Status calls ask. */
export const MODEL = 'sonnet'

export type ModelResult = Awaited<ReturnType<EngineInterface['model']['fork']>>

/** A call's report for its record. The engine does not say which model answered. */
export function callReport(r: ModelResult): CallReport {
  if (r.isAnswered) return { model: MODEL }
  const error = r.reason === 'api-error' ? `api-error ${r.status ?? 'with no response'}: ${r.error}` : r.reason

  return { model: MODEL, error }
}
