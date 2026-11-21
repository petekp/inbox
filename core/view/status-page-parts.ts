import type { Child, Item, Subject } from '../../types'
import { HELD_MARK, IDLE_MARK, SUBJECT_MARKS } from './help'
import type { StatusTone } from './help'
import { IDLE_AFTER_MS, isOpen } from '../domain/status-limits'
import { ago, cutAtPhrase, duration } from '../domain/text'
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

/** What a named fold says before the names it holds. Each closed status gets its own fold, in this order. */
export const NAMED_FOLD_TEXT = { done: 'Done: ', dropped: 'Dropped: ' } as const

/** A part's closed work past its rows that the person has not seen, named in one fold for each closed status. */
export const namedFolds = (prefix: string, named: Subject[], depth: number): StatusRow[] =>
  (['done', 'dropped'] as const).flatMap(status => {
    const closed = named.filter(x => x.status === status)
    return closed.length === 0
      ? []
      : [
          {
            kind: 'fold' as const,
            id: `${prefix}also-${status}`,
            depth,
            ...SUBJECT_MARKS[status],
            text: `${NAMED_FOLD_TEXT[status]}${namedList(closed.map(x => x.name))}`,
            subjectIds: closed.map(x => x.id),
          },
        ]
  })

/**
 * A part of the list's subjects: those it draws, the work that closed since the last look past its rows, which a fold
 * names, and those it folds into a count.
 */
export type PartSplit = {
  shown: Subject[]
  newClosed: Subject[]
  named: Subject[]
  foldedOpen: Subject[]
  foldedDone: Subject[]
}

/** The most children drawn under one subject; the rest fold into "+ N more running". */
export const CHILD_ROWS = 3

const CHILD_MARK: { mark: string; tone: StatusTone } = SUBJECT_MARKS.working

/** The words a `counts` row gives each mark. */
const COUNT_WORDS: Record<'working' | 'waits-on-other', string> = {
  working: 'working',
  'waits-on-other': 'waiting',
}

/** The statuses a `counts` row counts, in the page's order of marks. Queued work gets no count. */
const COUNTED_STATUSES = ['working', 'waits-on-other'] as const

/** Whether the counts row counts `x`, and lists it once unfolded. */
export const isCounted = (x: Subject) => COUNTED_STATUSES.some(status => status === x.status)

/** Open subjects folded into one count for each status that is under way. */
export function countsByMark(folded: Subject[]): StatusCount[] {
  return COUNTED_STATUSES.flatMap(status => {
    const n = folded.filter(x => x.status === status).length
    return n === 0 ? [] : [{ ...SUBJECT_MARKS[status], text: `${n} ${COUNT_WORDS[status]}` }]
  })
}

const MERGED_PREFIX = 'merged in: '

/**
 * A subject's merged line, as "merged in: Sync retry", cut at a phrase to the one line `fits` allows. When its first
 * phrase does not fit, the line keeps that phrase whole and a look wraps it.
 */
export function mergedLine(merged: string, fits: (text: string) => boolean): string {
  return `${MERGED_PREFIX}${cutAtPhrase(merged, names => fits(`${MERGED_PREFIX}${names}`))}`
}

/**
 * A row's name as it shows before its stall word, which stays on the line of its last word. Whole when `fits` says the
 * name and the stall word fit in `STATUS_TEXT_LINES` lines, else cut at a word with an ellipsis until they do. The
 * stall word is never cut. When no cut fits, the name keeps its first word.
 */
export function nameBeforeStall(name: string, fits: (shown: string) => boolean): string {
  const words = name.split(' ')
  const cuts = words.map((_, n) => (n === 0 ? name : `${words.slice(0, words.length - n).join(' ')}…`))

  return cuts.find(fits) ?? cuts[cuts.length - 1] ?? name
}

/** What separates a row's name from its stall word. */
export const STALL_GAP = ' · '

const DAY_MS = 24 * 60 * 60_000

/**
 * A subject's stall word: how long it has gone without a change, in whole days, once it is open past `IDLE_AFTER_MS` with no
 * child of it running. A subject an open ask holds up has none, since its ◆ mark and its ask say it waits.
 */
function subjectStall(x: Subject, isHeld: boolean, isWorkRunning: boolean, now: number): StatusStall | null {
  if (isHeld) return null
  const idleMs = now - x.changedAt
  const isIdle = isOpen(x) && !isWorkRunning && idleMs >= IDLE_AFTER_MS

  return isIdle ? { text: `idle ${Math.floor(idleMs / DAY_MS)}d`, tone: 'muted' } : null
}

/** Whether `c` runs and waits on no one: not a delegate at a question or an approval, and not one that finished. */
function isChildWorking(c: Child): boolean {
  return c.endedAt === null && c.delegateState !== 'blocked'
}

/**
 * A name as `isNamedLikeSubject` and `textBeyondName` compare it: lower case, with no spaces, hyphens or underscores,
 * and no closing punctuation.
 */
const comparableName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[\s\-_]+/g, '')
    .replace(/[.!?:;,…]+$/, '')

/** `text`, or `null` when it only repeats the row's `name`, as `comparableName` compares them. */
export const textBeyondName = (name: string, text: string | null | undefined): string | null =>
  text && comparableName(text) !== comparableName(name) ? text : null

/**
 * Whether `c` is the only child of `x` and has the same name, so the subject's row says what the session says and
 * draws no row for it.
 */
function isNamedLikeSubject(x: Subject, under: readonly Child[]): boolean {
  return under.length === 1 && comparableName(under[0]!.name) === comparableName(x.name)
}

/**
 * What the one child that is named like its subject gives the subject's row: a moving mark while it works, the
 * needs-you mark while it is blocked, and ✓ once it finished, unless an open ask holds the subject up, which keeps its
 * own mark and words. Such a row has no stall word.
 */
function carriedByChild(
  c: Child,
  isHeld: boolean,
): Pick<StatusRow & { kind: 'subject' }, 'mark' | 'tone' | 'isRunning'> | null {
  if (c.delegateState === 'blocked') return { ...HELD_MARK, isRunning: false }
  if (c.delegateState === 'finished' && !isHeld) return { ...SUBJECT_MARKS.done, isRunning: false }
  if (isChildWorking(c) && !isHeld) return { ...SUBJECT_MARKS.working, isRunning: true }

  return null
}

/**
 * How a finished delegate reads under its name in a done fold: its last note when Herdr showed one, else how long it ran
 * and how long ago it finished, as "Ran 40m, finished 2h ago".
 */
export function finishedLine(c: Pick<Child, 'startedAt' | 'endedAt' | 'summary'>, now: number): string | null {
  if (c.summary) return c.summary
  if (c.endedAt === null) return null
  const finished = ago(now - c.endedAt)

  return `Ran ${duration(c.endedAt - c.startedAt)}, finished ${finished}`
}

/** A child's row. `text` is the line under its name, which only a finished delegate in a done fold draws. */
export function childRow(c: Child, branch: StatusBranch | null, depth: number, text: string | null = null): StatusRow {
  const marks =
    c.delegateState === 'finished' ? SUBJECT_MARKS.done : c.delegateState === 'blocked' ? HELD_MARK : CHILD_MARK

  return {
    kind: 'child',
    id: c.id,
    depth,
    ...marks,
    isRunning: isChildWorking(c),
    name: c.name,
    text,
    branch,
  }
}

/** A child with no row under a shown subject, and the shown milestone its subject serves, if any. */
type LooseChild = { child: Child; milestoneId: string | null }

/**
 * The children the list draws apart from any shown subject. `loose` are those that run, or finished under a
 * milestone, which draw as rows. `settled` are finished delegates that fold into a done fold: those under no
 * milestone, seen or not, and those the person has seen that no subject holds. A finished delegate never stacks as a row.
 */
export function unplacedChildren(
  children: readonly Child[],
  c: {
    subjects: readonly Subject[]
    shownIds: ReadonlySet<string>
    milestoneOf: (x: Subject) => string | null
    isSettled: (c: Child) => boolean
    running: readonly Child[]
  },
): { loose: LooseChild[]; settled: Child[] } {
  const unshown = c.running
    .filter(x => x.subjectId === null || !c.shownIds.has(x.subjectId))
    .map(child => {
      const subject = c.subjects.find(y => y.id === child.subjectId)
      return { child, milestoneId: subject === undefined ? null : c.milestoneOf(subject) }
    })
  const isFoldedFinished = (l: LooseChild) => l.child.delegateState === 'finished' && l.milestoneId === null
  const settled = [
    ...children.filter(x => c.isSettled(x) && !c.subjects.some(y => y.id === x.subjectId)),
    ...unshown.filter(isFoldedFinished).map(l => l.child),
  ].sort((x, y) => (y.endedAt ?? 0) - (x.endedAt ?? 0))

  return { loose: unshown.filter(l => !isFoldedFinished(l)), settled }
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
      text: c.isNew(x) || isOpen(x) ? textBeyondName(x.name, x.text) : null,
      stall: waitsOn === null && !carried ? ownStall : null,
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
