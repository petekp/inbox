// The most characters each text field the user reads may have. A call with a longer one is refused rather than cut, so
// a row never shows text cut off mid-thought, and the agent shortens it in its next call.

type Limits = Readonly<Record<string, number>>

/** The fields of a `record` call the user reads. */
export const RECORD_LIMITS = {
  ask: 200,
  context: 200,
  options: 60,
  option_notes: 120,
  why: 120,
  steps: 4000,
  title: 120,
  detail: 600,
  path: 300,
} as const satisfies Limits

/** The fields of a `close` call the user reads as the row's outcome. */
export const CLOSE_LIMITS = { answer: 80, reason: 80 } as const satisfies Limits

/** The fields of an `order_prs` call the user reads on the PRs tab. */
export const ORDER_LIMITS = { label: 40, why: 300 } as const satisfies Limits

type RecordField = keyof typeof RECORD_LIMITS

/** The fields a `record` call of its kind keeps. `why` is kept only with a `rec`. */
export function recordFields(input: Record<string, unknown>): RecordField[] {
  if (input.kind === 'finding') return ['title', 'detail', 'path']
  if (input.kind === 'task') return ['ask', 'options', 'steps']
  const hasRec = typeof input.rec === 'string' && input.rec.trim() !== ''

  return ['ask', 'context', 'options', 'option_notes', ...(hasRec ? (['why'] as const) : []), 'steps']
}

/**
 * Why a call is refused when one of `fields` in `input` has more characters than `limits` allows, or '' when each fits.
 * A list field is measured item by item.
 */
export function tooLongText<L extends Limits>(
  input: Record<string, unknown>,
  limits: L,
  fields: readonly (keyof L & string)[] = Object.keys(limits),
): string {
  for (const field of fields) {
    const max = limits[field] ?? Infinity
    const value = input[field]
    const values = Array.isArray(value) ? value : [value]
    const lengths = values.map(v => (typeof v === 'string' ? v.trim().length : 0))
    const at = lengths.findIndex(n => n > max)
    if (at < 0) continue
    const name = Array.isArray(value) ? `item ${at + 1} of ${field}` : field

    return `${name} has ${lengths[at]} characters, more than the ${max} the user's row shows. Shorten it and try again.`
  }

  return ''
}
