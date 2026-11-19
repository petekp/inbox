import type { Rule } from './status-rules'

/** Words that put work after the work the session is doing now, as "then shipping 2.5" does. */
const QUEUED_WORK = /\b(then|afterwards?|after that|followed by)\b/i

/** The rules for the head beyond its focus and title. */
export const HEAD_RULES: Rule[] = [
  {
    id: 'head-no-queued',
    reads: 'answer',
    property: 1,
    text: 'A head description the step wrote says what the session is doing now, and adds no work that comes after it.',
    failures: ({ result, before }) => {
      const description = result.session.ledger.overview?.head?.description ?? ''
      const isWritten = description !== (before.overview?.head?.description ?? '')
      return isWritten && QUEUED_WORK.test(description) ? [`the head adds queued work: "${description}"`] : []
    },
  },
]
