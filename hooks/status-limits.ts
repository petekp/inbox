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
/** The most milestones a goal keeps, and the fewest a proposal needs. */
export const MILESTONES_MAX = 5
export const MILESTONES_MIN = 2
/** How many declined goals the call is told not to propose again. */
export const DECLINED_KEPT = 10
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
  look: null,
  goal: null,
  proposedGoal: null,
  declinedGoals: [],
  milestones: [],
  nextMilestoneId: 1,
  serves: {},
}

export type OpenStatus = Exclude<SubjectStatus, 'done' | 'dropped'>

export const OPEN_STATUSES: readonly OpenStatus[] = ['working', 'queued', 'waits-on-other']

export const STATUSES: readonly SubjectStatus[] = [...OPEN_STATUSES, 'done', 'dropped']

/** The first `limit` words of `text`, with an ellipsis when words were cut. */
export function clipWords(text: string, limit: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)

  return words.length <= limit ? words.join(' ') : `${words.slice(0, limit).join(' ')}…`
}

export function words(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}#.]+/gu) ?? []).filter(w => !STOP_WORDS.has(w)))
}

export function nameKey(name: string): string {
  return [...words(name)].sort().join(' ')
}

export function isOpen(s: Pick<Subject, 'status'>): boolean {
  return s.status !== 'done' && s.status !== 'dropped'
}
