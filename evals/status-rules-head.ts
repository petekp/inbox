import { NAME_WORDS } from '../hooks/status-limits'
import { isOpenPiece } from './status-facts'
import { headOffFocus, headWords, isAnswerWritten, isTitleKept, STATUS_WORDS, WORD } from './status-rule-helpers'
import type { Rule } from './status-rules'

/** Words that put work after the work the session is doing now, as "then shipping 2.5" does. */
const QUEUED_WORK = /\b(then|afterwards?|after that|followed by)\b/i

/** The rules for the head: its words, its focus and its title. */
export const HEAD_RULES: Rule[] = [
  {
    id: 'head-no-status',
    reads: 'answer',
    property: 1,
    text: 'The head holds no status word.',
    failures: ({ result }) => {
      const head = headWords(result.session.ledger.overview)
      return STATUS_WORDS.test(head) ? [`status word in the head: "${head}"`] : []
    },
  },
  {
    id: 'head-follows',
    reads: 'facts',
    property: 1,
    text: 'The head names the focus in the facts, and its title no longer names finished work the focus moved on from. It changes where the focus moved, and holds where it did not, unless it was off the focus before. Filling or clearing the description under the same title holds.',
    failures: ({ result, before }) => {
      const now = result.session.ledger.overview?.head ?? null
      const earlier = before.overview?.head ?? null
      const head = headWords(result.session.ledger.overview)
      const last = headWords(before.overview)
      const isFocusSame = result.facts.focusMatch === before.facts.focusMatch
      const isDescriptionFilled = earlier?.description === '' && now?.title === earlier.title
      const isDescriptionCleared = now?.description === '' && now.title === earlier?.title
      const off = headOffFocus(result.session.ledger.overview, result.facts)
      if (off !== null) return [off]
      const wasOff = last !== '' && headOffFocus(before.overview, before.facts) !== null
      const isMoved = head !== last && !isDescriptionFilled && !isDescriptionCleared
      return isFocusSame && last !== '' && isMoved && !wasOff ? [`the head moved from "${last}" to "${head}"`] : []
    },
  },
  {
    id: 'head-title-kept',
    reads: 'facts',
    property: 1,
    text: 'A head title that names the whole focus in the facts stays on it while the facts keep that title, so it is never retitled to a piece of the work.',
    opportunity: ({ result, before }) => isTitleKept(result, before) && isAnswerWritten(result),
    failures: ({ result, before }) => {
      const pattern = result.facts.titleMatch
      if (!pattern || pattern !== before.facts.titleMatch) return []
      const isWhole = (title: string) => new RegExp(pattern, 'i').test(title)
      const was = before.overview?.head?.title ?? ''
      const now = result.session.ledger.overview?.head?.title ?? ''
      return isWhole(was) && !isWhole(now)
        ? [`the head's title moved from "${was}" to "${now}", off the whole focus`]
        : []
    },
  },
  {
    id: 'head-title',
    reads: 'answer',
    property: 1,
    text: 'The head is a title of at most 3 words, with no "…" or question mark, and a description that does not repeat it. While no subject is working or waiting, it may have no description.',
    failures: ({ result }) => {
      const head = result.page.head
      if (head === null) return ['the page has no head']
      const isWorkUnderWay = (result.session.ledger.overview?.subjects ?? []).some(
        s => s.status === 'working' || s.status === 'waits-on-other',
      )
      const titleWords = new Set(head.title.toLowerCase().match(WORD) ?? [])
      const descriptionWords = head.description?.toLowerCase().match(WORD) ?? []
      const isTitleLong = head.title.trim().split(/\s+/).length > NAME_WORDS
      return [
        ...(isTitleLong || /…|\?/.test(head.title) ? [`title: "${head.title}"`] : []),
        ...(descriptionWords.length === 0 && isWorkUnderWay ? ['the head has no description'] : []),
        ...(descriptionWords.length > 0 && descriptionWords.every(w => titleWords.has(w))
          ? [`the description repeats the title: "${head.description}"`]
          : []),
      ]
    },
  },
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
  {
    id: 'head-no-finished',
    reads: 'facts',
    property: 1,
    text: "Once no piece is working or waiting, the head's description names no finished piece.",
    failures: ({ result }) => {
      const description = result.session.ledger.overview?.head?.description ?? ''
      const pieces = result.facts.pieces
      const isWorkUnderWay = pieces.some(p => p.state === 'working' || p.state === 'waits-on-other')
      if (isWorkUnderWay || description === '') return []
      return pieces
        .filter(p => !isOpenPiece(p) && new RegExp(p.match, 'i').test(description))
        .map(p => `the head names finished ${p.id}: "${description}"`)
    },
  },
]
