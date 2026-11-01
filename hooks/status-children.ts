import type { Child, Item, SessionStatus, Subject } from '../types'
import {
  ASK_READ_WORDS,
  CHILD_KEPT_MS,
  CHILDREN_KEPT,
  clipWords,
  EMPTY_SESSION_STATUS,
  FINISHED_READ,
  isOpen,
  NL,
} from './status-limits'

export function isChildRunning(c: Pick<Child, 'startedAt' | 'endedAt'>, now: number): boolean {
  return c.startedAt <= now && (c.endedAt === null || c.endedAt > now)
}

/** What a host reports about a child: everything but the id and the link, which the Status owns. A delegate's state is null until reported. */
type ChildReport = Omit<Child, 'id' | 'subjectId' | 'delegateState'> & Partial<Pick<Child, 'delegateState'>>

/**
 * Adds a child the host reports, or updates the one it holds with the same `ref`. A delegate prompted again keeps its
 * id and link. Children that ended more than `CHILD_KEPT_MS` before `now` are let go.
 */
export function withChild(last: SessionStatus | null, c: ChildReport, now: number): SessionStatus {
  const o = last ?? EMPTY_SESSION_STATUS
  const kept = o.children.filter(x => x.ref === c.ref || x.endedAt === null || now - x.endedAt < CHILD_KEPT_MS)
  const known = kept.find(x => x.ref === c.ref)
  if (known) return { ...o, children: kept.map(x => (x === known ? { ...x, ...c } : x)) }

  return {
    ...o,
    nextChildId: o.nextChildId + 1,
    children: [...kept, { delegateState: null, ...c, id: `c${o.nextChildId}`, subjectId: null }].slice(-CHILDREN_KEPT),
  }
}

/** The child with `ref` after `change`, or the Status unchanged when it holds none. */
function changedChild(
  o: SessionStatus | null,
  ref: string,
  change: (c: Child) => Partial<ChildReport>,
): SessionStatus | null {
  const known = o?.children.find(c => c.ref === ref)
  if (!o || !known) return o

  return { ...o, children: o.children.map(c => (c === known ? { ...c, ...change(c) } : c)) }
}

/** The child with `ref` ended at `at`. */
export function childEnded(o: SessionStatus | null, ref: string, at: number): SessionStatus | null {
  return changedChild(o, ref, c => ({ endedAt: c.endedAt ?? at }))
}

/**
 * The subject with `id` changed at `at`, as when a child under it finished, so it shows above the look line again. Its
 * was and merged lines go once the person has seen them, as for a change the Status call makes.
 */
export function subjectTouched(o: SessionStatus, id: string | null, at: number): SessionStatus {
  const isSeen = (s: Subject) => o.lastLookAt !== null && s.changedAt <= o.lastLookAt
  const touched = (s: Subject): Subject =>
    isSeen(s) ? { ...s, was: null, merged: null, changedAt: at } : { ...s, changedAt: at }

  return id === null ? o : { ...o, subjects: o.subjects.map(s => (s.id === id ? touched(s) : s)) }
}

/** The child with `ref` did something at `at`. Only a kind the host reports activity for has a time to move. */
export function childActive(o: SessionStatus | null, ref: string, at: number): SessionStatus | null {
  return changedChild(o, ref, c => ({ lastActivityAt: Math.max(c.lastActivityAt ?? at, at) }))
}

/** The subjects as the call reads them: open ones with ids, and finished names it must not add again. */
export function subjectsText(o: SessionStatus | null): { open: string; finished: string } {
  const subjects = o?.subjects ?? []
  const serves = (id: string) => (o?.goal ? ` | ${servesText(o, id)}` : '')
  const open = subjects.filter(isOpen).map(s => `${s.id} | ${s.status} | ${s.name} | ${s.text || '-'}${serves(s.id)}`)
  const finished = subjects
    .filter(s => !isOpen(s))
    .slice(-FINISHED_READ)
    .map(s => `${s.id} | ${s.status} | ${s.name}`)

  return { open: open.join(NL) || '(none yet)', finished: finished.join(NL) }
}

/** How a subject's link reads in <subjects> while a goal is set: its milestone, - for none, or ? when not linked yet. */
function servesText(o: SessionStatus, subjectId: string): string {
  const to = o.serves[subjectId]

  return to === undefined ? '?' : to === 'none' ? '-' : to
}

/** The open asks as the call reads them, each with the subject it holds up. */
export function asksText(o: SessionStatus | null, asks: readonly Pick<Item, 'id' | 'ask'>[]): string {
  return asks.map(a => `${a.id} | ${clipWords(a.ask, ASK_READ_WORDS)} | ${o?.askSubjects[a.id] ?? '-'}`).join(NL)
}

/** The running children as the call reads them. */
export function runningText(o: SessionStatus | null, now: number): string {
  return (o?.children ?? [])
    .filter(c => isChildRunning(c, now))
    .map(c => `${c.id} | ${c.kind} | ${c.name} | ${c.subjectId ?? '-'}`)
    .join(NL)
}

/** The Status tab is shown. The look line stays where it was until the look ends, so the page keeps its order. */
export function lookStarted(o: SessionStatus | null, now: number): SessionStatus | null {
  return o === null || o.look !== null ? o : { ...o, look: { startedAt: now } }
}

/** How long the Status must show before it counts as a look, so a pass through the tab keeps the look line. */
export const LOOK_MIN_MS = 5_000

/** The Status tab is no longer shown, at `at`. A look shorter than `LOOK_MIN_MS` leaves the look line where it was. */
export function lookEnded(o: SessionStatus | null, at: number): SessionStatus | null {
  if (o === null || o.look === null) return o
  const isLongEnough = at - o.look.startedAt >= LOOK_MIN_MS

  return { ...o, lastLookAt: isLongEnough ? at : o.lastLookAt, look: null }
}
