import type { Child, Item, Subject } from '../types'
import { HELD_MARK, IDLE_MARK, SUBJECT_MARKS } from './help'
import type { StatusTone } from './help'
import { IDLE_AFTER_MS, isOpen } from './status-limits'
import type { StatusBranch, StatusCount, StatusRow, StatusStall } from './status-page'

/**
 * The most names a line of names shows, such as a named fold; it counts the rest as "+N more". Two names of up to
 * `NAME_KEPT` characters, a named fold's prefix and the count wrap to at most `STATUS_TEXT_LINES` lines in 31 cells, the
 * text width at the narrowest terminal dock, so omp, which cuts a row's text past that many lines, shows the whole line
 * there too.
 */
const LISTED_NAMES = 2
/** What ends a line of names that holds more names than it shows. */
export const namedFoldMore = (n: number) => `+${n} more`

/** The first `LISTED_NAMES` of `names`, joined by commas, then the count of the rest as "+N more". */
export function namedList(names: readonly string[]): string {
  const hidden = names.length - LISTED_NAMES

  return [...names.slice(0, LISTED_NAMES), ...(hidden > 0 ? [namedFoldMore(hidden)] : [])].join(', ')
}

/** The most children drawn under one subject; the rest fold into "+ N more running". */
export const CHILD_ROWS = 3

const CHILD_MARK: { mark: string; tone: StatusTone } = SUBJECT_MARKS.working

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

const DAY_MS = 24 * 60 * 60_000

/**
 * A subject's stall word: "waiting" while an ask holds it up and says nothing, else how long it has gone without a change, in whole
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
 * A delegate's stall word, from what Herdr shows: "waiting" at a question or an approval, in the needs-you tone. Other
 * work shows none: its moving mark shows it runs, and a finished delegate's ✓ shows it finished.
 */
function childStall(c: Child): StatusStall | null {
  if (c.delegateState === 'blocked') return { text: 'waiting', tone: 'needsYou' }

  return null
}

/** A name as `isNamedLikeSubject` compares it: lower case, with no spaces, hyphens or underscores. */
const comparableName = (name: string) => name.toLowerCase().replace(/[\s\-_]+/g, '')

/**
 * Whether `c` is the only child of `x` and has the same name, so the subject's row says what the session says and
 * draws no row for it.
 */
function isNamedLikeSubject(x: Subject, under: readonly Child[]): boolean {
  return under.length === 1 && comparableName(under[0]!.name) === comparableName(x.name)
}

/**
 * What the one child that is named like its subject gives the subject's row: a moving mark while it works, the
 * needs-you mark and "waiting" while it is blocked, and ✓ once it finished, unless an open ask holds the subject up,
 * which keeps its own mark and words.
 */
function carriedByChild(
  c: Child,
  isHeld: boolean,
): Pick<StatusRow & { kind: 'subject' }, 'mark' | 'tone' | 'isRunning' | 'stall'> | null {
  if (c.delegateState === 'blocked') return { ...HELD_MARK, isRunning: false, stall: childStall(c) }
  if (c.delegateState === 'finished' && !isHeld) return { ...SUBJECT_MARKS.done, isRunning: false, stall: null }
  if (isChildWorking(c) && !isHeld) return { ...SUBJECT_MARKS.working, isRunning: true, stall: null }

  return null
}

export function childRow(c: Child, branch: StatusBranch | null, depth: number): StatusRow {
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

/** The words of the item `ask` names, on one line, or null when it names none or has no words. */
function askWords(items: readonly Item[], ask: { id: string } | null): string | null {
  const words = items
    .find(i => i.id === ask?.id)
    ?.ask.replace(/\s+/g, ' ')
    .trim()

  return words || null
}

/** What every part of the list reads to place and draw a subject. */
export type ListContext = {
  isNew: (x: Subject) => boolean
  isHeld: (x: Subject) => boolean
  oldestAskOf: (x: Subject) => { id: string; kind: Item['kind'] } | null
  items: readonly Item[]
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
  afterOpen: StatusRow[] = [],
  afterClosed: StatusRow[] = [],
): StatusRow[] {
  const rows: StatusRow[] = []
  const firstClosed = shown.findIndex(x => !isOpen(x))
  for (const [i, x] of shown.entries()) {
    if (i === firstClosed) rows.push(...afterOpen)
    const under = c.running.filter(ch => ch.subjectId === x.id)
    const shownUnder = under.slice(0, CHILD_ROWS)
    const isMore = under.length > CHILD_ROWS
    const isRunning = x.status === 'working' && !c.isHeld(x) && (c.isTurnRunning || under.some(isChildWorking))
    const isIdle = x.status === 'working' && !isRunning
    const isWorkRunning = isRunning || under.some(ch => ch.endedAt === null)
    const lone = isOpen(x) && isNamedLikeSubject(x, under) ? under[0]! : null
    const carried = lone ? carriedByChild(lone, c.isHeld(x)) : null
    const waitsOn = askWords(c.items, c.oldestAskOf(x))
    const ownStall = subjectStall(x, c.isHeld(x), isWorkRunning, c.now)
    rows.push({
      kind: 'subject',
      id: x.id,
      depth,
      ...(c.isHeld(x) ? HELD_MARK : isIdle ? IDLE_MARK : SUBJECT_MARKS[x.status]),
      isRunning,
      ...carried,
      name: x.name,
      text: c.isNew(x) || isOpen(x) ? x.text || null : null,
      stall: waitsOn === null ? (carried ? carried.stall : ownStall) : null,
      waitsOn,
      merged: c.isNew(x) ? x.merged : null,
      was: c.isNew(x) ? x.was : null,
      hasChildren: under.length > 0 && lone === null,
      foldCount: lone === null ? under.length : 0,
      ask: c.oldestAskOf(x),
    })
    if (lone === null)
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
