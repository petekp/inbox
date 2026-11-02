import type { Child, Item, Subject } from '../types'
import { HELD_MARK, IDLE_MARK, SUBJECT_MARKS } from './help'
import type { StatusTone } from './help'
import { isOpen } from './status-limits'
import type { StatusBranch, StatusCount, StatusRow, StatusRowParts, StatusStall } from './status-page'

/** The most children drawn under one subject; the rest fold into "+ N more running". */
export const CHILD_ROWS = 3

const CHILD_MARK: { mark: string; tone: StatusTone } = { mark: SUBJECT_MARKS.working.mark, tone: null }

/** The words a `counts` row gives each mark. */
const COUNT_WORDS: Record<'working' | 'waits-on-other' | 'queued' | 'done', string> = {
  working: 'working',
  'waits-on-other': 'waiting',
  queued: 'queued',
  done: 'done',
}

/** Subjects folded into one count for each status, in the page's order of marks. */
export function countsByMark(folded: Subject[]): StatusCount[] {
  return (['working', 'waits-on-other', 'queued', 'done'] as const).flatMap(status => {
    const n = folded.filter(x => x.status === status).length
    return n === 0 ? [] : [{ ...SUBJECT_MARKS[status], text: `${n} ${COUNT_WORDS[status]}` }]
  })
}

/** Whether `c` is a delegate that finished after the person last looked, so the page still shows it. */
export function isFinishedUnseen(c: Child, lastLookAt: number | null): boolean {
  return c.delegateState === 'finished' && c.endedAt !== null && (lastLookAt === null || c.endedAt > lastLookAt)
}

/** Whether `c` runs and waits on no one: not a delegate at a question or an approval, and not one that finished. */
function isChildWorking(c: Child): boolean {
  return c.endedAt === null && c.delegateState !== 'blocked'
}

/**
 * A delegate's stall word, from what Herdr shows: "waiting" at a question or an approval, in the needs-you tone, and
 * "finished", in the done tone. Other work shows none, since its moving mark shows it runs.
 */
function childStall(c: Child): StatusStall | null {
  if (c.delegateState === 'finished') return { text: 'finished', tone: 'done' }
  if (c.delegateState === 'blocked') return { text: 'waiting', tone: 'needsYou' }

  return null
}

export function childRow(c: Child, branch: StatusBranch | null, depth: number): StatusRowParts {
  const marks =
    c.delegateState === 'finished' ? SUBJECT_MARKS.done : c.delegateState === 'blocked' ? HELD_MARK : CHILD_MARK

  return {
    kind: 'child',
    id: c.id,
    depth,
    ...marks,
    isRunning: isChildWorking(c),
    name: c.name,
    stall: childStall(c),
    branch,
  }
}

/** What every part of the list reads to place and draw a subject. */
export type ListContext = {
  isNew: (x: Subject) => boolean
  isHeld: (x: Subject) => boolean
  oldestAskOf: (x: Subject) => { id: string; kind: Item['kind'] } | null
  running: Child[]
  isTurnRunning: boolean
  /** The id of the part's look line, or null while the person has never looked. */
  lookId: string | null
  lookText: string
  /**
   * Whether the look line ends a part whose rows all changed. It does in a part folds can follow. Under a milestone it
   * only splits changed rows from seen ones, so a page of busy milestones does not draw a look line under each.
   */
  isLookAtEnd: boolean
}

/**
 * A part of the list at `depth`: its subjects in order, with their children one step in under them and the look line
 * between them.
 */
export function partRows(shown: Subject[], c: ListContext, depth: number): StatusRowParts[] {
  const rows: StatusRowParts[] = []
  const lookRow: StatusRowParts | null =
    c.lookId === null ? null : { kind: 'look', id: c.lookId, depth, text: c.lookText }
  const firstSeen = shown.findIndex(x => !c.isNew(x))
  for (const [i, x] of shown.entries()) {
    const hasNewAbove = i > 0
    if (lookRow && i === firstSeen && hasNewAbove) rows.push(lookRow)
    const under = c.running.filter(ch => ch.subjectId === x.id)
    const shownUnder = under.slice(0, CHILD_ROWS)
    const isMore = under.length > CHILD_ROWS
    const isRunning = x.status === 'working' && !c.isHeld(x) && (c.isTurnRunning || under.some(isChildWorking))
    const isIdle = x.status === 'working' && !isRunning
    rows.push({
      kind: 'subject',
      id: x.id,
      depth,
      ...(c.isHeld(x) ? HELD_MARK : isIdle ? IDLE_MARK : SUBJECT_MARKS[x.status]),
      isRunning,
      name: x.name,
      text: c.isNew(x) || isOpen(x) ? x.text || null : null,
      stall: c.isHeld(x) ? { text: 'waiting', tone: 'needsYou' } : null,
      merged: c.isNew(x) ? x.merged : null,
      was: c.isNew(x) ? x.was : null,
      hasChildren: under.length > 0,
      ask: c.oldestAskOf(x),
    })
    rows.push(
      ...shownUnder.map((ch, n) => childRow(ch, n === shownUnder.length - 1 && !isMore ? 'last' : 'mid', depth + 1)),
    )
    const hidden = under.slice(CHILD_ROWS)
    const isEveryHiddenRunning = hidden.every(ch => ch.delegateState !== 'finished')
    if (isMore)
      rows.push({
        kind: 'more',
        id: `${x.id}-more`,
        depth: depth + 1,
        text: `+ ${hidden.length} more${isEveryHiddenRunning ? ' running' : ''}`,
        branch: 'last',
      })
  }
  const isEveryShownNew = firstSeen === -1
  if (lookRow && c.isLookAtEnd && isEveryShownNew && shown.length > 0) rows.push(lookRow)

  return rows
}

/** Whether `row` starts an item after another, with no look line between them. */
function isItemAfterItem(row: StatusRowParts, prev: StatusRowParts | undefined): boolean {
  const isUnderSubject = row.kind === 'more' || (row.kind === 'child' && row.branch !== null)

  const isLine = (r: StatusRowParts) => r.kind === 'look' || r.kind === 'part'

  return prev !== undefined && !isLine(prev) && !isLine(row) && !isUnderSubject
}

/**
 * The rows of one list with their rules and their end marked. The list under a milestone draws no rules, as the
 * milestones above it draw none: its step in sets it apart.
 */
export function ruledRows(rows: StatusRowParts[], isRuled: boolean): StatusRow[] {
  return rows.map((r, n) => ({
    ...r,
    isRuledAbove: isRuled && isItemAfterItem(r, rows[n - 1]),
    isLast: n === rows.length - 1,
  }))
}
