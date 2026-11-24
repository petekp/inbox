import { agoText } from './earlier-answers'
import type { AnswerDoc } from './earlier-answers'
import { clipLabel } from './text'

/** The most characters an earlier ask or answer keeps in the `record` answer. */
const MATCH_TEXT_CHARS = 200

/**
 * What the `record` answer adds after a new question when the person answered questions like it before: each earlier
 * answer with its age and repository. The agent closes the question when one settles it, so the person is not asked
 * again. The question is already recorded, so a near miss the agent leaves open loses nothing.
 */
export function earlierAnswersText(id: string, earlier: readonly AnswerDoc[], now: number): string {
  if (earlier.length === 0) return ''
  const lines = earlier.map(doc => {
    const where = doc.repo ? `, in ${doc.repo}` : ''

    return `- ${agoText(now - doc.at)}${where}: "${clipLabel(doc.ask, MATCH_TEXT_CHARS)}" They answered "${clipLabel(doc.answer, MATCH_TEXT_CHARS)}".`
  })

  return [
    '',
    `The user answered similar questions before. If one settles this exact question, close ${id} with the reason "answered before: <their answer>" and act on that answer. If it answers an earlier step or a different case, or put the decision off, leave ${id} open.`,
    ...lines,
  ].join('\n')
}
