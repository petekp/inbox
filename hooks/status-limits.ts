import type { SessionStatus, Subject, SubjectStatus } from '../types'

/** The most words the call may write in a subject's name and where it stands, and in the head's description. The head's title is a name. */
export const NAME_WORDS = 3
export const TEXT_WORDS = 4
export const DESCRIPTION_WORDS = 8
/**
 * The most open subjects the call keeps. The Status page folds the open subjects past it into "N more", except held
 * ones, ones changed since the last look and ones with a child row under them.
 */
export const OPEN_SUBJECTS = 6
/** Limits code holds an answer to when the call writes past the words it was asked for. */
export const NAME_KEPT = 20
export const TEXT_KEPT = 12
export const DESCRIPTION_KEPT = 14
/** The words of each ask the call reads. */
export const ASK_READ_WORDS = 30
/** Finished subjects the call reads, so it does not add one again. */
export const FINISHED_READ = 10
/** The most milestones a goal keeps, and the fewest a GOAL line needs. */
export const MILESTONES_MAX = 5
export const MILESTONES_MIN = 2
/** How long an inferred goal with no open linked work goes without moving forward before the work counts as having left it. */
export const GOAL_LEFT_MS = 30 * 60_000
/** How many removed goals the call is told not to set again. */
export const REMOVED_KEPT = 10
/** How long an open subject goes without a change before its row says how long it has been idle, as "idle 2d". */
export const IDLE_AFTER_MS = 24 * 60 * 60_000
/** How long an ended child stays saved, so a delegate prompted again keeps its link. */
export const CHILD_KEPT_MS = 24 * 60 * 60_000
export const CHILDREN_KEPT = 50
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'for',
  'to',
  'in',
  'on',
  'and',
  'or',
  'is',
  'it',
  'its',
  'now',
  'be',
  'by',
  'at',
  'with',
])

export const NL = '\n'

export const EMPTY_SESSION_STATUS: SessionStatus = {
  head: null,
  subjects: [],
  children: [],
  askSubjects: {},
  nextId: 1,
  nextChildId: 1,
  lastLookAt: null,
  missedInLastLook: {},
  look: null,
  goal: null,
  removedGoals: [],
  goalRemoved: null,
  milestones: [],
  nextMilestoneId: 1,
  serves: {},
  goalRefused: null,
}

export type OpenStatus = Exclude<SubjectStatus, 'done' | 'dropped'>

export const OPEN_STATUSES: readonly OpenStatus[] = ['working', 'queued', 'waits-on-other']

export const STATUSES: readonly SubjectStatus[] = [...OPEN_STATUSES, 'done', 'dropped']

/** The first `limit` words of `text`, with an ellipsis when words were cut. */
export function clipWords(text: string, limit: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)

  return words.length <= limit ? words.join(' ') : `${words.slice(0, limit).join(' ')}…`
}

/** The content words of `text`, lower case. A dot inside a word stays, as in "1.4.2" or "file.ts", and one at either end goes. */
export function words(text: string): Set<string> {
  const matches = text.toLowerCase().match(/[\p{L}\p{N}#.]+/gu) ?? []

  return new Set(matches.map(w => w.replace(/^\.+|\.+$/g, '')).filter(w => w !== '' && !STOP_WORDS.has(w)))
}

/** The words that only say what kind of number follows, as in "PR 3655" or "issue #12". */
const NUMBER_KINDS = new Set(['pr', 'prs', 'pull', 'request', 'issue', 'issues', 'ticket', 'gh'])

/**
 * Whether `name` is only a PR or issue number, as "#3655", "PR 3655", "PR3655" or "issue 12": it names no work. A
 * bare number, as "502", may name work, so it needs a # or a kind word.
 */
export function isNumberOnly(name: string): boolean {
  const all = [...words(name)]
  const isTagged = (w: string) => /^(#|pr|gh-?)\d+$/.test(w)
  const isBare = (w: string) => /^\d+$/.test(w)
  const hasKind = all.some(w => NUMBER_KINDS.has(w))
  const isNumber = (w: string) => isTagged(w) || (hasKind && isBare(w))

  return all.some(isNumber) && all.every(w => isNumber(w) || NUMBER_KINDS.has(w))
}

/** A word that names a version, as "2.5", "0.3.0" or "v1.2". */
const VERSION = /^v?\d+(\.\d+)+$/

/** Whether `name` and `other` each name a version and share none, as "2.6 beta" and "2.5 published" do. */
export function namesOtherVersion(name: string, other: string): boolean {
  const versions = (text: string) => [...words(text)].filter(w => VERSION.test(w)).map(w => w.replace(/^v/, ''))
  const mine = versions(name)
  const theirs = new Set(versions(other))

  return mine.length > 0 && theirs.size > 0 && !mine.some(v => theirs.has(v))
}

export function nameKey(name: string): string {
  return [...words(name)].sort().join(' ')
}

const SUFFIXES = ['ing', 'ed', 'es', 's']

/** A word cut to a rough stem, so "ship", "ships", "shipped" and "shipping" match. A word with a digit stays whole. */
export function stem(word: string): string {
  if (/\d/.test(word)) return word
  const suffix = SUFFIXES.find(s => word.endsWith(s) && word.length - s.length >= 3) ?? ''
  const cut = word.slice(0, word.length - suffix.length)
  const base = cut.length > 3 && cut.endsWith('e') ? cut.slice(0, -1) : cut

  return base.replace(/([b-df-hj-np-tv-z])\1$/, '$1')
}

export function stems(text: string): Set<string> {
  return new Set([...words(text)].map(stem))
}

export function isOpen(s: Pick<Subject, 'status'>): boolean {
  return s.status !== 'done' && s.status !== 'dropped'
}
