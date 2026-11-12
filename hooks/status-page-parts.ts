import type { Child, Item, Subject } from '../types'
import { HELD_MARK, IDLE_MARK, SUBJECT_MARKS } from './help'
import type { StatusTone } from './help'
import { IDLE_AFTER_MS, isOpen } from './status-limits'
import type { StatusBranch, StatusCount, StatusRow, StatusRowParts, StatusStall } from './status-page'

/** The most children drawn under one subject; the rest fold into "+ N more running". */
export const CHILD_ROWS = 3

const CHILD_MARK: { mark: string; tone: StatusTone } = { mark: SUBJECT_MARKS.working.mark, tone: null }

/** The words a `counts` row gives each mark. */
const COUNT_WORDS: Record<'working' | 'waits-on-other', string> = {
  working: 'working',
  'waits-on-other': 'waiting',
}

/** Open subjects folded into one count for each status that is under way, in the page's order of marks. Queued work gets no count. */
export function countsByMark(folded: Subject[]): StatusCount[] {
  return (['working', 'waits-on-other'] as const).flatMap(status => {
    const n = folded.filter(x => x.status === status).length
    return n === 0 ? [] : [{ ...SUBJECT_MARKS[status], text: `${n} ${COUNT_WORDS[status]}` }]
  })
}

/** Whether `c` is a delegate that finished after the person last looked, so the page still shows it. */
export function isFinishedUnseen(c: Child, lastLookAt: number | null): boolean {
  return c.delegateState === 'finished' && c.endedAt !== null && (lastLookAt === null || c.endedAt > lastLookAt)
}

const DAY_MS = 24 * 60 * 60_000

/**
 * A subject's stall word: "waiting" while an ask holds it up, else how long it has gone without a change, in whole
 * days, once it is open past `IDLE_AFTER_MS` with no child of it running.
 */
function subjectStall(x: Subject, isHeld: boolean, isWorkRunning: boolean, now: number): StatusStall | null {
  if (isHeld) return { text: 'waiting', tone: 'needsYou' }
  const idleMs = now - x.changedAt
  const isIdle = isOpen(x) && !isWorkRunning && idleMs >= IDLE_AFTER_MS

  return isIdle ? { text: `idle ${Math.floor(idleMs / DAY_MS)}d`, tone: 'muted' } : null
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
  now: number
}

/**
 * A part of the list at `depth`: its subjects in order, with their children one step in under them. `afterOpen`
 * follows the open subjects, and `afterClosed` the closed ones, which come last.
 */
export function partRows(
  shown: Subject[],
  c: ListContext,
  depth: number,
  afterOpen: StatusRowParts[] = [],
  afterClosed: StatusRowParts[] = [],
): StatusRowParts[] {
  const rows: StatusRowParts[] = []
  const firstClosed = shown.findIndex(x => !isOpen(x))
  for (const [i, x] of shown.entries()) {
    if (i === firstClosed) rows.push(...afterOpen)
    const under = c.running.filter(ch => ch.subjectId === x.id)
    const shownUnder = under.slice(0, CHILD_ROWS)
    const isMore = under.length > CHILD_ROWS
    const isRunning = x.status === 'working' && !c.isHeld(x) && (c.isTurnRunning || under.some(isChildWorking))
    const isIdle = x.status === 'working' && !isRunning
    const isWorkRunning = isRunning || under.some(ch => ch.endedAt === null)
    rows.push({
      kind: 'subject',
      id: x.id,
      depth,
      ...(c.isHeld(x) ? HELD_MARK : isIdle ? IDLE_MARK : SUBJECT_MARKS[x.status]),
      isRunning,
      name: x.name,
      text: c.isNew(x) || isOpen(x) ? x.text || null : null,
      stall: subjectStall(x, c.isHeld(x), isWorkRunning, c.now),
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
  if (firstClosed === -1) rows.push(...afterOpen)
  rows.push(...afterClosed)

  return rows
}

/** The rows of one list with its last row marked. */
export function endedList(rows: StatusRowParts[]): StatusRow[] {
  return rows.map((r, n) => ({ ...r, isLast: n === rows.length - 1 }))
}

/**
 * `rows` as a look draws them: each done fold that `isUnfolded` names by id followed by the finished rows it holds. The
 * last row drawn ends the list.
 */
export function unfoldedRows(rows: StatusRow[], isUnfolded: (id: string) => boolean): StatusRow[] {
  return rows.flatMap(r =>
    r.kind === 'done-fold' && isUnfolded(r.id)
      ? [{ ...r, isLast: false }, ...r.rows.map((x, n) => ({ ...x, isLast: r.isLast && n === r.rows.length - 1 }))]
      : [r],
  )
}
