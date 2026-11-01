import type { SessionStatus, Subject } from '../types'
import type { Piece } from './status-facts'

/** A word that names a time, which code writes and the model never does. */
export const TIME_WORDS =
  /\b(today|yesterday|tonight|tomorrow|this (morning|afternoon|evening|week)|last night|ago|just now|earlier today|\d+\s*(m|h|d|min|mins|minutes?|hours?|days?))\b/i

/** What an event list is made of: a command, a path, a commit, a ticket, a count of things run, or a process step. */
export const EVENT_PATTERNS: RegExp[] = [
  /`/,
  /\b[\w-]+\.(?:ts|tsx|js|jsx|json|md|mjs|swift|py|rs|go|sh|css|html)\b/i,
  /\b[0-9a-f]{7,40}\b/,
  /(?:^|\s)#\d+\b|\b[A-Z]{2,}-\d+\b/,
  /\b\d+\s+(?:[\p{L}-]+\s+){0,2}(?:tests?|files?|commits?|lines?|calls?|ms|seconds?|minutes?|checks?)\b/iu,
  /\bcommit(?:s|ted|ting)?\b/i,
  /^(?:ran|run|edited|editing|opened|searched|grepped|installed|executed|called)\b/i,
  /\b(?:tests? (?:ran|run|pass(?:ing|es)?)|tool call|npm |git )\b/i,
  /\b(?:pushed|merged|tested|rebuilt|restarted)\b/i,
  /\b(?:running|in progress)\b|(?<!\bnot )\bstarted\b/i,
]

export const STATUS_WORDS = /\b(ready|merged|passes|passing|waiting|shipped|published|done|blocked)\b/i
export const OVER_WORDS = /\b(published|merged|shipped|released|done)\b/i
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

export function modelTexts(o: SessionStatus | null): string[] {
  const head = o?.head ? [o.head.title, o.head.description] : []

  return [...head, ...shownOf(o).flatMap(s => [s.name, s.text, s.was ?? ''])].filter(Boolean)
}

/** Whether a running child's label reads as words, not as a handle. */
export function isPlainLabel(name: string, ref: string): boolean {
  const handle = ref.replace(/^herdr:/, '')
  const words = name.trim().split(/\s+/)

  return name !== handle && !/\w[-_]\w/.test(name) && words.length >= 2
}
