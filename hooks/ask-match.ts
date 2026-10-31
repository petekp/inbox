import type { Closed, Item } from '../types'
import type { Update } from './reply-parse'

export function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

/**
 * The option a recommendation names: the one whose words all appear in it,
 * the longest when several do. "Symlink into a PATH folder" names "Symlink
 * into PATH".
 */
export function recommendedOption(options: string[], rec: string | null): string | null {
  if (!rec) return null
  const named = new Set(words(rec))
  let best: string | null = null
  for (const option of options) {
    const w = words(option)
    if (w.length > words(best ?? '').length && w.every(x => named.has(x))) best = option
  }
  const label = (text: string) => text.match(/^\s*\(?([a-z]|\d{1,2})\s*[:.)]/i)?.[1]?.toLowerCase()
  const byLabel = /^\s*(?:option\s+)?([a-z]|\d{1,2})\s*[.!]?\s*$/i.exec(rec)?.[1]?.toLowerCase()

  return best ?? (byLabel ? (options.find(o => label(o) === byLabel) ?? null) : null)
}

const FILLER = new Set([
  'the',
  'and',
  'for',
  'with',
  'use',
  'into',
  'from',
  'that',
  'this',
  'your',
  'you',
  'should',
  'make',
  'add',
  'all',
])

export function keyWords(text: string): Set<string> {
  return new Set(words(text).filter(w => /\p{N}/u.test(w) || (w.length > 2 && !FILLER.has(w))))
}

export function restates(a: string, b: string): boolean {
  const x = keyWords(a)
  const y = keyWords(b)
  const fewer = Math.min(x.size, y.size)
  const shared = [...x].filter(w => y.has(w)).length
  const numbers = (words: Set<string>) =>
    [...words]
      .filter(w => /\p{N}/u.test(w))
      .sort()
      .join(' ')
  if (numbers(x) !== '' && numbers(y) !== '' && numbers(x) !== numbers(y)) return false

  return fewer >= 2 ? shared / fewer >= 0.7 : sameAsk(a, b)
}

/**
 * Key words that fit an ask or a finding about anything, so they never tell two apart: question words, verbs of
 * choosing, auxiliaries, words that point at the thing in context, and adverbs of time.
 */
const GENERIC = new Set([
  'which',
  'what',
  'how',
  'when',
  'where',
  'whether',
  'why',
  'who',
  'pick',
  'choose',
  'select',
  'prefer',
  'want',
  'decide',
  'need',
  'like',
  'are',
  'was',
  'were',
  'been',
  'being',
  'can',
  'could',
  'would',
  'will',
  'shall',
  'might',
  'must',
  'does',
  'did',
  'has',
  'have',
  'had',
  'new',
  'current',
  'existing',
  'its',
  'our',
  'their',
  'now',
  'still',
  'also',
  'just',
  'again',
  'already',
  'instead',
  'yet',
])

/**
 * Whether `b` repeats `a` with no subject of its own: it restates `a`, and one of the two has no key word the other
 * lacks, apart from GENERIC words. "Which test runner should we choose?" repeats "Which test runner should we pick?",
 * and "Add a feature flag to the cache before merging?" repeats "Should I add a feature flag for the new cache?". But
 * "package.json has no engines field" does not repeat "package.json has no license field".
 */
export function repeatsSubject(a: string, b: string): boolean {
  const x = keyWords(a)
  const y = keyWords(b)
  const within = (inner: Set<string>, outer: Set<string>) => [...inner].every(w => GENERIC.has(w) || outer.has(w))

  return sameAsk(a, b) || (restates(a, b) && (within(x, y) || within(y, x)))
}

export function sameAsk(a: string, b: string): boolean {
  const norm = (s: string) => words(s).join(' ')

  return norm(a) !== '' && norm(a) === norm(b)
}

/**
 * The open item `a` repeats. Items in `sameBatch` came from the same writer and turn as `a` and count as distinct
 * asks, so they match only on the same words or label: "Which license do you prefer?" and "Which Node version do you
 * prefer?" from one dialog are two questions.
 */
export function matchOpen(
  items: Pick<Item, 'id' | 'kind' | 'ask'>[],
  a: Update['added'][number],
  sameBatch: ReadonlySet<string> = new Set(),
): number {
  return items.findIndex(
    i =>
      i.id === a.label ||
      sameAsk(i.ask, a.ask) ||
      (!sameBatch.has(i.id) && i.kind === a.kind && restates(i.ask, a.ask)),
  )
}

/**
 * An ask closed this turn repeats on its label too. An expired one from before can be asked again, as in addAgentItem.
 * An ask closed before the prompt repeats a settled item as `repeatsSettled` says.
 */
export function repeatsClosed(closed: Closed[], a: Update['added'][number], since: number): boolean {
  const recent = closed.filter(c => c.at >= since && !isAskedForChoices(c))
  const settled = closed.filter(c => c.at < since && c.how !== 'expired')

  return (
    matchOpen(recent, a) >= 0 ||
    (a.label !== null && recent.some(c => c.label === a.label)) ||
    settled.some(c => repeatsSettled(c, a))
  )
}

/** The answer the inbox model offers when an ask names no choices. It asks for the same question again, with them. */
export const LIST_CHOICES = 'List the choices'

export function isAskedForChoices(c: Closed): boolean {
  return c.how === 'answered' && c.outcome.trim().toLowerCase() === LIST_CHOICES.toLowerCase()
}

/**
 * An answered question repeats only in the same words or label: a follow-up shares its words but asks something new,
 * as "Which cache size should the product API use?" after "Which cache should the product API use?". A dismissed or
 * handled item repeats in other words too, as `repeatsSubject` says: "Which engines should package.json use?" does not
 * repeat "Which license should package.json use?". A question answered with LIST_CHOICES repeats nothing.
 */
export function repeatsSettled(c: Closed, a: Update['added'][number]): boolean {
  if (isAskedForChoices(c)) return false
  if (c.how === 'answered') return c.id === a.label || sameAsk(c.ask, a.ask)

  return c.id === a.label || sameAsk(c.ask, a.ask) || (c.kind === a.kind && repeatsSubject(c.ask, a.ask))
}
