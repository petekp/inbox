import type { ApiError, Stop } from '../../types'

/** An API error's cause from the host's word for it. Another word or code is kept as the cause's text. */
function apiErrorOf(detail: string): ApiError {
  if (detail === 'rate_limit') return { cause: 'rate-limit', text: null }
  if (detail === 'overloaded') return { cause: 'overloaded', text: null }

  return { cause: 'other', text: detail || null }
}

/** A stop with its `apiError`, read from `detail` when it has none, as a stop saved before `apiError` existed. */
export function withApiError(stop: Omit<Stop, 'apiError'> & { apiError?: ApiError | null }): Stop {
  const apiError =
    stop.apiError === undefined ? (stop.kind === 'api-error' ? apiErrorOf(stop.detail) : null) : stop.apiError

  return { ...stop, apiError }
}
