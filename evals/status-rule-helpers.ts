import type { Milestone, SessionStatus, Subject } from '../types'
import type { Piece } from './status-facts'

/** A word that names a time, which code writes and the model never does. */
export const TIME_WORDS =
  /\b(today|yesterday|tonight|tomorrow|this (morning|afternoon|evening|week)|last night|ago|just now|earlier today|\d+\s*(m|h|d|min|mins|minutes?|hours?|days?))\b/i

/** A date: a month or weekday name, or a day of the month, as in "by the 14th". */
export const DATE_WORDS =
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|\bby the \d{1,2}(?:st|nd|rd|th)\b/

/**
 * What names a thing the work handled rather than where it stands: a command, a path, a commit hash, a ticket or PR
 * number, or a count of things run. Activity in plain words is the judge's to grade.
 */
export const ID_PATTERNS: RegExp[] = [
  /`/,
  /\b[\w-]+\.(?:ts|tsx|js|jsx|json|md|mjs|swift|py|rs|go|sh|css|html)\b/i,
  /\b[0-9a-f]{7,40}\b/,
  /(?:^|\s)#\d+\b|\b[A-Z]{2,}-\d+\b/,
  /\b\d+\s+(?:[\p{L}-]+\s+){0,2}(?:tests?|files?|commits?|lines?|calls?|checks?)\b/iu,
  /\b(?:npm|git) /i,
]

export const STATUS_WORDS = /\b(ready|merged|passes|passing|waiting|shipped|published|done|blocked)\b/i
export const DECISION_WORDS = /\b(needs? your|your (call|decision|answer|input)|decide|waiting on you|awaiting)\b/i
export const NUMBERED = /#\d+\b/g

export const shownOf = (o: SessionStatus | null) => (o?.subjects ?? []).filter(s => s.into === null)

export const subjectsFor = (p: Pick<Piece, 'match'>, o: SessionStatus | null) =>
  shownOf(o).filter(s => new RegExp(p.match, 'i').test(s.name))

export const label = (s: Subject) => `"${s.name}: ${s.text}"`

export const SMALL_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'its'])

/** The words that tell two names apart: words of three letters or more but a few small ones, and every word with a number. */
export function keyWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}.#]+/gu) ?? []

  return new Set(words.filter(w => (w.length >= 3 && !SMALL_WORDS.has(w)) || /\d/.test(w)))
}

export const WORD = /[\p{L}\p{N}]+/gu
export const restateWords = (text: string) => new Set((text.toLowerCase().match(WORD) ?? []).filter(w => w.length > 3))

/** Whether `text` has most of the key words of `other`, as a restatement does. */
export function restatesText(text: string, other: string): boolean {
  const mine = restateWords(text)
  const theirs = [...restateWords(other)]

  return theirs.length >= 3 && theirs.filter(w => mine.has(w)).length / theirs.length >= 0.7
}

export function headWords(o: SessionStatus | null): string {
  return o?.head ? `${o.head.title} ${o.head.description}` : ''
}

/** The goal's milestones, once a goal is set and has them. */
export const milestonesOf = (o: SessionStatus | null): Milestone[] =>
  o?.goal && !o.goal.isAwaitingMilestones ? o.milestones : []

/** Every milestone name the page shows: the goal's, then the proposal's. */
export const milestoneNames = (o: SessionStatus | null): string[] => [
  ...milestonesOf(o).map(m => m.name),
  ...(o?.proposedGoal?.milestones.map(m => m.name) ?? []),
]

export function modelTexts(o: SessionStatus | null): string[] {
  const head = o?.head ? [o.head.title, o.head.description] : []
  const goal = [o?.goal?.text ?? '', o?.proposedGoal?.text ?? '', ...milestoneNames(o)]
  const milestones = milestonesOf(o).flatMap(m => [m.text, m.was ?? ''])

  return [...head, ...goal, ...milestones, ...shownOf(o).flatMap(s => [s.name, s.text, s.was ?? ''])].filter(Boolean)
}

/** Whether a running child's label reads as words, not as a handle. */
export function isPlainLabel(name: string, ref: string): boolean {
  const handle = ref.replace(/^herdr:/, '')
  const words = name.trim().split(/\s+/)

  return name !== handle && !/\w[-_]\w/.test(name) && words.length >= 2
}
