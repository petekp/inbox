import { answerIndex, rankedEarlier } from '../hooks/earlier-answers'
import type { AnswerDoc } from '../hooks/earlier-answers'
import { RECORD_MATCHES } from '../hooks/history-store'

/** An answer the person gave before, in a case's invented question history. */
export type CaseAnswer = { ask: string; answer: string; daysAgo: number; repo: string | null }

const DAY_MS = 24 * 60 * 60_000

/**
 * The earlier answers the `record` answer lists for a call in a case, ranked from the case's history as
 * `hooks/history-store.ts:recordMatches` ranks the person's. The case's history lists at once: it has no measurement
 * weeks to wait out.
 */
export function caseEarlier(history: readonly CaseAnswer[], input: Record<string, unknown>, now: number): AnswerDoc[] {
  const ask = typeof input.ask === 'string' ? input.ask.trim() : ''
  if (history.length === 0 || input.kind !== 'question' || ask === '') return []
  const options = Array.isArray(input.options) ? input.options.filter(o => typeof o === 'string') : []
  const docs = history.map((h, n) => ({
    key: `case:${n}`,
    ask: h.ask,
    answer: h.answer,
    at: now - h.daysAgo * DAY_MS,
    repo: h.repo,
  }))

  return rankedEarlier(answerIndex(docs), { ask, options }, '', RECORD_MATCHES).map(m => m.doc)
}
