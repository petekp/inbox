import type { Earlier, Item } from '../../types'
import { clipLabel } from './text'

/** An answer the person gave to an earlier question. `key` names the question across hosts and sessions. */
export type AnswerDoc = { key: string; ask: string; answer: string; at: number; repo: string | null }

/** BM25 over each earlier question's ask and answer. */
export type AnswerIndex = {
  docs: AnswerDoc[]
  lengths: number[]
  postings: Map<string, [doc: number, count: number][]>
  averageLength: number
}

const K1 = 1.2
const B = 0.75
/**
 * The least share of the best score a question could reach that a match needs before the row or the `record` answer
 * shows it. Set on the measurement behind docs/plans/repeated-questions.md, where it shows the line on about a quarter
 * of question rows whether the history is weeks or days old.
 */
const RELATIVE_FLOOR = 0.22
/** The most characters an earlier ask or answer keeps on an item, since closed records copy the item. */
const EARLIER_TEXT_CHARS = 200

const STOP_WORDS = new Set(
  `a an the and or of to in on for with at by from into onto is are was were be been being it its this that these
those i you we he she they me my your our their them as if then than so do does did done can could should would will
shall may might must not no yes now still also just again already instead yet any all some each per via up out over
about after before when while which what who whom why how where whether there here let lets get got have has had
pr prs`.split(/\s+/),
)

function searchTerms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    w => !STOP_WORDS.has(w) && (w.length > 1 || /\d/.test(w)),
  )
}

export function answerIndex(docs: AnswerDoc[]): AnswerIndex {
  const postings = new Map<string, [number, number][]>()
  const lengths = docs.map((d, n) => {
    const terms = searchTerms(`${d.ask} ${d.answer}`)
    const counts = new Map<string, number>()
    for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1)
    for (const [t, count] of counts) {
      const list = postings.get(t)
      if (list) list.push([n, count])
      else postings.set(t, [[n, count]])
    }
    return terms.length
  })
  const total = lengths.reduce((sum, l) => sum + l, 0)

  return { docs, lengths, postings, averageLength: docs.length > 0 ? total / docs.length : 0 }
}

/**
 * The earlier answers that best match `question`'s ask and options, best first, at most `top`, each with its score as
 * a share of the best score the question could reach: each of its terms the history holds at full weight. Only matches
 * that reach `RELATIVE_FLOOR` count. `skip` is the key of the question itself, whose own answer never counts.
 */
export function rankedEarlier(
  index: AnswerIndex,
  question: Pick<Item, 'ask' | 'options'>,
  skip: string,
  top: number,
): { doc: AnswerDoc; score: number }[] {
  const n = index.docs.length
  const scores = new Map<number, number>()
  let reachable = 0
  for (const term of new Set(searchTerms([question.ask, ...question.options].join(' ')))) {
    const posted = index.postings.get(term)
    if (!posted) continue
    const weight = Math.log(1 + (n - posted.length + 0.5) / (posted.length + 0.5))
    reachable += weight * (K1 + 1)
    for (const [doc, count] of posted) {
      const norm = 1 - B + (B * index.lengths[doc]!) / index.averageLength
      scores.set(doc, (scores.get(doc) ?? 0) + (weight * count * (K1 + 1)) / (count + K1 * norm))
    }
  }
  if (reachable === 0) return []

  return [...scores]
    .flatMap(([i, score]) => {
      const doc = index.docs[i]
      return doc && doc.key !== skip ? [{ doc, score: score / reachable }] : []
    })
    .toSorted((a, b) => b.score - a.score)
    .slice(0, top)
    .filter(match => match.score >= RELATIVE_FLOOR)
}

/** The best of `rankedEarlier`, or null when none reaches the floor. */
export function bestEarlier(
  index: AnswerIndex,
  question: Pick<Item, 'ask' | 'options'>,
  skip: string,
): { doc: AnswerDoc; score: number } | null {
  return rankedEarlier(index, question, skip, 1)[0] ?? null
}

/** The match as an item keeps it. */
export function earlierOf(match: { doc: AnswerDoc; score: number }, isShown: boolean): Earlier {
  const { doc } = match

  return {
    ask: clipLabel(doc.ask, EARLIER_TEXT_CHARS),
    answer: clipLabel(doc.answer, EARLIER_TEXT_CHARS),
    at: doc.at,
    repo: doc.repo,
    score: Math.round(match.score * 1000) / 1000,
    isShown,
  }
}

const DAY_MS = 24 * 60 * 60_000

export function agoText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return minutes === 1 ? 'a minute ago' : `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  const days = Math.round(ms / DAY_MS)

  return days === 1 ? 'yesterday' : `${days} days ago`
}

/**
 * The open row's line about its earlier answer, as "You answered Flick 3 days ago, in glasses-app, to "Which gesture
 * should clear a glance?"". A look draws `answer` as it draws an option's label, and the rest muted.
 */
export type EarlierLine = { lead: string; answer: string; rest: string }

export function earlierLineOf(earlier: Earlier | undefined, now: number): EarlierLine | null {
  if (!earlier?.isShown) return null
  const where = earlier.repo ? `, in ${earlier.repo},` : ''

  return {
    lead: 'You answered ',
    answer: earlier.answer,
    rest: ` ${agoText(now - earlier.at)}${where} to “${earlier.ask}”`,
  }
}

/** The line as one string, for a look that draws it in one tone. */
export function earlierLineText(line: EarlierLine): string {
  return `${line.lead}${line.answer}${line.rest}`
}
