import { parseStatus } from '../hooks/status'
import { isOpen } from '../hooks/status-limits'
import type { Milestone, SessionStatus, Subject } from '../types'
import type { Facts, Piece } from './status-facts'
import type { StepResult } from './status-replay'

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

const SMALL_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'its'])

/** The words that tell two names apart: words of three letters or more but a few small ones, and every word with a number. */
export function keyWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}.#]+/gu) ?? []

  return new Set(words.filter(w => (w.length >= 3 && !SMALL_WORDS.has(w)) || /\d/.test(w)))
}

export const WORD = /[\p{L}\p{N}]+/gu
const restateWords = (text: string) => new Set((text.toLowerCase().match(WORD) ?? []).filter(w => w.length > 3))

/** Whether `text` has most of the key words of `other`, as a restatement does. */
export function restatesText(text: string, other: string): boolean {
  const mine = restateWords(text)
  const theirs = [...restateWords(other)]

  return theirs.length >= 3 && theirs.filter(w => mine.has(w)).length / theirs.length >= 0.7
}

export function headWords(o: SessionStatus | null): string {
  return o?.head ? `${o.head.title} ${o.head.description}` : ''
}

/**
 * Why the head is off the focus in `facts`: it is not about the focus, or the part the page shows names finished work
 * the focus moved on from. While a goal is set, the page shows the description. Null when the head is on the focus.
 */
export function headOffFocus(o: SessionStatus | null, { focusMatch, pastMatch }: Facts): string | null {
  const head = headWords(o)
  if (!new RegExp(focusMatch, 'i').test(head)) return `the head "${head}" is not about /${focusMatch}/`
  const shown = o?.goal ? o.head?.description || o.head?.title || '' : (o?.head?.title ?? '')
  const isPastShown = !!pastMatch && !!o?.head && new RegExp(pastMatch, 'i').test(shown)

  return isPastShown ? `the head "${shown}" still names /${pastMatch}/` : null
}

/** Whether the Status answer the host applied at this step wrote a change. */
export function isAnswerWritten(result: StepResult): boolean {
  const call = result.calls.find(c => c.kind === 'status')

  return call !== undefined && call.overLimit === null && parseStatus(call.answers.at(-1) ?? null)?.kind === 'ops'
}

/** Whether the facts keep the title pattern they had before the step, and the head's title matched it then. */
export function isTitleKept(result: StepResult, before: { overview: SessionStatus | null; facts: Facts }): boolean {
  const pattern = result.facts.titleMatch

  return (
    !!pattern &&
    pattern === before.facts.titleMatch &&
    new RegExp(pattern, 'i').test(before.overview?.head?.title ?? '')
  )
}

/** The goal's milestones, once a goal is set and has them. */
export const milestonesOf = (o: SessionStatus | null): Milestone[] =>
  o?.goal && !o.goal.isAwaitingMilestones ? o.milestones : []

/**
 * The page's milestones that stand for one of the facts' milestones: those its pattern names, else those that hold the
 * subject of a piece that serves it. The model plans its own milestones, so it may name or group the outcomes its own way.
 */
export function milestonesFor(m: { id: string; match: string }, facts: Pick<Facts, 'pieces'>, o: SessionStatus | null) {
  const named = milestonesOf(o).filter(x => new RegExp(m.match, 'i').test(x.name))
  if (named.length > 0 || !o) return named
  const serving = facts.pieces.filter(p => p.serves === m.id || p.servesAlso === m.id)
  const held = new Set(serving.flatMap(p => subjectsFor(p, o)).map(s => o.serves[s.id]))

  return milestonesOf(o).filter(x => held.has(x.id))
}

/**
 * The open milestones a piece with no open subject is drawn as, when it is the whole of the milestone it serves: the
 * only piece that serves it.
 */
export function milestonesAsPiece(p: Piece, facts: Pick<Facts, 'pieces' | 'goal'>, o: SessionStatus | null) {
  const m = facts.goal?.milestones.find(x => x.id === p.serves)
  const isWhole = facts.pieces.every(x => x.id === p.id || (x.serves !== p.serves && x.servesAlso !== p.serves))
  if (!m || !isWhole || subjectsFor(p, o).some(isOpen)) return []

  return milestonesFor(m, facts, o).filter(isOpen)
}

/** Every milestone name the page shows. */
export const milestoneNames = (o: SessionStatus | null): string[] => milestonesOf(o).map(m => m.name)

export function modelTexts(o: SessionStatus | null): string[] {
  const head = o?.head ? [o.head.title, o.head.description] : []
  const goal = [o?.goal?.text ?? '', ...milestoneNames(o)]
  const milestones = milestonesOf(o).flatMap(m => [m.text, m.was ?? ''])

  return [...head, ...goal, ...milestones, ...shownOf(o).flatMap(s => [s.name, s.text, s.was ?? ''])].filter(Boolean)
}

/** Whether a running child's label reads as words, not as a handle. */
export function isPlainLabel(name: string, ref: string): boolean {
  const handle = ref.replace(/^herdr:/, '')
  const words = name.trim().split(/\s+/)

  return name !== handle && !/\w[-_]\w/.test(name) && words.length >= 2
}
