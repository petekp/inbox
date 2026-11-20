import type { Child, Item, SessionStatus, Subject } from '../types'
import {
  ASK_READ_WORDS,
  CHILD_KEPT_MS,
  CHILDREN_KEPT,
  clipWords,
  EMPTY_SESSION_STATUS,
  FINISHED_READ,
  IDLE_AFTER_MS,
  isOpen,
  isUnderWay,
  NL,
} from './status-limits'
import { ago, duration } from './text'

/** The mark on a line in <finished> for a subject that closed since the person last looked. Only such a subject may reopen. */
export const NOT_SEEN = 'not seen yet'

export function isChildRunning(c: Pick<Child, 'startedAt' | 'endedAt'>, now: number): boolean {
  return c.startedAt <= now && (c.endedAt === null || c.endedAt > now)
}

/** Whether `c` is a delegate that finished after `at`, or at any time when `at` is null. */
function isFinishedAfter(c: Child, at: number | null): boolean {
  return c.delegateState === 'finished' && c.endedAt !== null && (at === null || c.endedAt > at)
}

/**
 * Whether `c` is a delegate that finished before the person's last look, within `CHILD_KEPT_MS`. The page then draws
 * no row of its own for it in real time, and a done fold keeps it reachable.
 */
export function isChildSettled(c: Child, now: number, lastLookAt: number | null): boolean {
  return (
    c.delegateState === 'finished' &&
    c.endedAt !== null &&
    lastLookAt !== null &&
    c.endedAt <= lastLookAt &&
    now - c.endedAt < CHILD_KEPT_MS
  )
}

/** Whether the page draws a row for `c`: it runs, or it is a delegate that finished after the person last looked. */
export function isChildShown(c: Child, now: number, lastLookAt: number | null): boolean {
  return isChildRunning(c, now) || isFinishedAfter(c, lastLookAt)
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
 * The subject with `id` changed at `at`, as when a child under it finished, so it counts as unseen again. Its was and
 * merged lines go once the person has seen them, as for a change the Status call makes.
 */
export function subjectTouched(o: SessionStatus, id: string | null, at: number): SessionStatus {
  const touched = (s: Subject): Subject =>
    isSubjectSeen(o, s) ? { ...s, was: null, merged: null, changedAt: at } : { ...s, changedAt: at }

  return id === null ? o : { ...o, subjects: o.subjects.map(s => (s.id === id ? touched(s) : s)) }
}

/** The child with `ref` did something at `at`. Only a kind the host reports activity for has a time to move. */
export function childActive(o: SessionStatus | null, ref: string, at: number): SessionStatus | null {
  return changedChild(o, ref, c => ({ lastActivityAt: Math.max(c.lastActivityAt ?? at, at) }))
}

/**
 * The subjects as the call reads them at `now`: open ones with ids and how long ago each last changed, and finished
 * names it must not add again, each marked `NOT_SEEN` when it closed since the person last looked.
 */
export function subjectsText(o: SessionStatus | null, now: number): { open: string; finished: string } {
  const subjects = o?.subjects ?? []
  const serves = (id: string) => (o?.goal ? ` | ${servesText(o, id)}` : '')
  const open = subjects
    .filter(isOpen)
    .map(s => `${s.id} | ${s.status} | ${s.name} | ${s.text || '-'} | ${ago(now - s.changedAt)}${serves(s.id)}`)
  const finished = subjects
    .filter(s => !isOpen(s))
    .slice(-FINISHED_READ)
    .map(s => `${s.id} | ${s.status} | ${s.name}${o !== null && isSubjectSeen(o, s) ? '' : ` | ${NOT_SEEN}`}`)

  return { open: open.join(NL) || '(none yet)', finished: finished.join(NL) }
}

/**
 * The subjects under way, working or waiting on something, that have not changed for `IDLE_AFTER_MS` or more at `now`,
 * that no ask in `asks` holds up and that no running child works for. The Status call reads them to close each, or to
 * say it still goes on.
 */
export function idleSubjects(o: SessionStatus | null, asks: readonly Pick<Item, 'id'>[], now: number): Subject[] {
  const held = new Set(asks.flatMap(a => o?.askSubjects[a.id] ?? []))
  const isWorkedOn = (s: Subject) => (o?.children ?? []).some(c => c.subjectId === s.id && isChildRunning(c, now))

  return (o?.subjects ?? []).filter(
    s => isUnderWay(s) && now - s.changedAt >= IDLE_AFTER_MS && !held.has(s.id) && !isWorkedOn(s),
  )
}

/** The idle subjects as the call reads them: each with how long it has gone without a change. */
export function idleText(o: SessionStatus | null, asks: readonly Pick<Item, 'id'>[], now: number): string {
  return idleSubjects(o, asks, now)
    .map(s => `${s.id} | ${s.status} | ${s.name} | ${duration(now - s.changedAt)}`)
    .join(NL)
}

/** How a subject's link reads in <subjects> while a goal is set: its milestone, - for none, or ? when not linked yet. */
function servesText(o: SessionStatus, subjectId: string): string {
  const to = o.serves[subjectId]

  return to === undefined ? '?' : to === 'none' ? '-' : to
}

/** The open asks as the call reads them, each with the subjects it holds up and, when the agent gave one, why it asked. */
export function asksText(o: SessionStatus | null, asks: readonly Pick<Item, 'id' | 'ask' | 'context'>[]): string {
  return asks
    .map(a => {
      const held = `${a.id} | ${clipWords(a.ask, ASK_READ_WORDS)} | ${o?.askSubjects[a.id]?.join(', ') || '-'}`
      const why = a.context ? clipWords(a.context.replaceAll('|', '/'), ASK_READ_WORDS) : ''
      return why === '' ? held : `${held} | ${why}`
    })
    .join(NL)
}

/**
 * The children as the call reads them: each running one, and each delegate that finished since the last call read the
 * Status, while its subject is open. A finished delegate whose subject closed gives the call nothing to change.
 */
export function runningText(o: SessionStatus | null, now: number): string {
  const isSubjectOpen = (id: string | null) => id === null || (o?.subjects.some(s => s.id === id && isOpen(s)) ?? false)
  const isFinishNew = (c: Child) => isFinishedAfter(c, o?.lastCallReadAt ?? null) && isSubjectOpen(c.subjectId)
  const state = (c: Child) =>
    !isChildRunning(c, now) ? 'finished' : c.delegateState === 'blocked' ? 'blocked' : 'running'

  return (o?.children ?? [])
    .filter(c => isChildRunning(c, now) || isFinishNew(c))
    .map(c => `${c.id} | ${c.kind} | ${c.name} | ${c.subjectId ?? '-'} | ${state(c)}`)
    .join(NL)
}

/** The Status tab is shown. The last look's time stays as it was until the look ends, so the page holds still. */
export function lookStarted(o: SessionStatus | null, now: number): SessionStatus | null {
  return o === null || o.look !== null ? o : { ...o, look: { startedAt: now } }
}

/** How long the Status must show before it counts as a look, so a pass through the tab counts nothing as seen. */
export const LOOK_MIN_MS = 5_000

/**
 * When the person last saw the subject with `id`: when the last look ended, or earlier for a subject that look did not
 * show. Null when they never saw it.
 */
function subjectSeenAt(o: SessionStatus, id: string): number | null {
  return id in o.missedInLastLook ? (o.missedInLastLook[id] ?? null) : o.lastLookAt
}

/** Whether the person has seen `s` since it last changed. */
export function isSubjectSeen(o: SessionStatus, s: Pick<Subject, 'id' | 'changedAt'>): boolean {
  const seenAt = subjectSeenAt(o, s.id)

  return seenAt !== null && s.changedAt <= seenAt
}

/**
 * What a look showed: when each row was last on screen during it, by the row's id, or `all` for a look that showed
 * every subject, as the desktop pane counts it.
 */
export type ShownRows = Record<string, number> | 'all'

/**
 * The Status tab is no longer shown, at `at`. A look shorter than `LOOK_MIN_MS` counts nothing as seen. A longer
 * one counts each subject as seen when `shown` says its row was on screen at any point after the subject last
 * changed, even for a moment during a scroll. Every other subject keeps when the person last saw it. The look counts
 * as seeing the Status as it stood at `seenUpTo`, which is `at` unless the look drew an older Status.
 */
export function lookEnded(
  o: SessionStatus | null,
  at: number,
  shown: ShownRows,
  seenUpTo: number = at,
): SessionStatus | null {
  if (o === null || o.look === null) return o
  const isLongEnough = at - o.look.startedAt >= LOOK_MIN_MS
  if (!isLongEnough) return { ...o, look: null }
  const isShown = (s: Subject) => shown === 'all' || (shown[s.id] ?? -Infinity) >= s.changedAt
  const missed = o.subjects.filter(s => s.into === null && !isShown(s)).map(s => [s.id, subjectSeenAt(o, s.id)])

  return { ...o, lastLookAt: seenUpTo, missedInLastLook: Object.fromEntries(missed), look: null }
}

/**
 * A look that another program drew and reported once it ended: when it ran, when each row was last on screen, and
 * when this host wrote the last Status the look drew. No change after that write counts as seen.
 */
export type ReportedLook = { startedAt: number; endedAt: number; shown: Record<string, number>; drawnWrittenAt: number }

/**
 * Counts a reported look as `lookEnded` counts a look, and keeps the look this host has in progress. The look saw the
 * Status as it stood when it ended or when its last drawn Status was written, whichever came first. A look that saw it
 * only as it stood by `lastLookAt` leaves `lastLookAt` where it is: it moves each subject the last look missed up to
 * that time, when it showed the subject after the subject last changed.
 */
export function lookReported(o: SessionStatus | null, look: ReportedLook): SessionStatus | null {
  if (o === null) return o
  const { startedAt, endedAt, shown } = look
  const seenUpTo = Math.min(endedAt, look.drawnWrittenAt)
  const isLate = o.lastLookAt !== null && seenUpTo <= o.lastLookAt
  if (!isLate) {
    const ended = lookEnded({ ...o, look: { startedAt } }, endedAt, shown, seenUpTo)
    return ended && { ...ended, look: o.look }
  }
  if (endedAt - startedAt < LOOK_MIN_MS) return o
  const isShown = (s: Subject) => (shown[s.id] ?? -Infinity) >= s.changedAt
  const raised = o.subjects.filter(
    s => s.id in o.missedInLastLook && (o.missedInLastLook[s.id] ?? -Infinity) < seenUpTo && isShown(s),
  )
  if (raised.length === 0) return o

  return { ...o, missedInLastLook: { ...o.missedInLastLook, ...Object.fromEntries(raised.map(s => [s.id, seenUpTo])) } }
}
