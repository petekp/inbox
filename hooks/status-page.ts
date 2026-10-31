import type { Item, Child, Ledger, Session, Subject } from '../types'
import { isChildRunning } from './status-children'
import { isOpen, OPEN_SUBJECTS } from './status-limits'
import { cutAtPhrase } from './text'
import { SUBJECT_MARKS, HELD_MARK, IDLE_MARK } from './help'
import type { StatusTone } from './help'

const STATUS_FAILED = 'Last Status update failed. Changes from that reply may be missing.'

/** Where a row under a subject sits in its tree: `last` ends the line that ties the rows to the subject. */
export type StatusBranch = 'mid' | 'last'

/** The word after a row's name: "waiting" in the needs-you tone while it waits on the person, or "finished". */
export type StatusStall = { text: string; tone: 'needsYou' | 'done' }

/**
 * One line of the Status's list, in the order to draw it. Each look lays out the parts; none chooses them. A subject
 * or child draws its name with its stall word after it, past `STALL_GAP`, in the stall's tone. A subject draws where it
 * stands on the line under its name.
 */
export type StatusRow = StatusRowParts & {
  /** Whether a rule sets it apart from the row above. A subject and the rows under it are one item, and the look line is a rule already. */
  isRuledAbove: boolean
  /** Whether it ends the list, so the look line leaves no space below it. */
  isLast: boolean
}

type StatusRowParts =
  | {
      kind: 'subject'
      id: string
      mark: string
      tone: StatusTone
      /** Whether its work runs now, so a look animates the mark: this session's turn runs, or a child of it does. */
      isRunning: boolean
      name: string
      /** Where it stands. Null for a finished row below the look line, which the person has seen. */
      text: string | null
      /** "waiting" while an open ask holds it up. */
      stall: StatusStall | null
      /** The names of the subjects merged into it, while the person has not seen them. */
      merged: string | null
      /** The plan a reversal replaced, while the person has not seen it. */
      was: string | null
      /** Whether rows of its children follow, so its tree line runs down from its mark. */
      hasChildren: boolean
      /** The oldest open ask that holds it up, which its View button opens. Null while no open ask holds it up. */
      ask: { id: string; kind: Item['kind'] } | null
    }
  | {
      kind: 'child'
      id: string
      mark: string
      tone: StatusTone
      /** Whether its work shows under way, as `isChildWorking` says. A look animates the mark while it is set. */
      isRunning: boolean
      name: string
      /** What its work does, as `childStall` says. */
      stall: StatusStall | null
      /** Its place under its subject. Null when it is linked to no subject the list shows, so it sits at the top of the list. */
      branch: StatusBranch | null
    }
  /** The children of a subject past `CHILD_ROWS`, as "+ 2 more running", or "+ 2 more" when one finished. It is always the last row under its subject. */
  | { kind: 'more'; id: string; text: string; branch: 'last' }
  /** Where the person last looked: rows above it changed since. */
  | { kind: 'look'; id: string; text: string }
  /** Rows folded into a count, as "✓ 3 done" or "○ 2 more". */
  | { kind: 'fold'; id: string; mark: string; tone: StatusTone; text: string }

/** What the Status page shows. Every look draws it as it is. */
export type StatusPage = {
  isEmpty: boolean
  /** What the session is focused on now. The description is null until the Status call writes one. */
  head: { title: string; description: string | null } | null
  rows: StatusRow[]
  /** The status line's error while the last Status call wrote nothing. */
  error: string | null
  empty: { title: string; hint: string }
}

export const LOOK_TEXT = 'Last seen'
/** The dash the terminal and omp draw the look line's rule with. The rules between rows are solid, so the dashes mark this one out. */
export const LOOK_DASH = '╌'
/** What a subject's was line starts with, before the plan it replaces. */
export const WAS_PREFIX = 'was: '
const MERGED_PREFIX = 'merged in: '
/** What separates a row's name from its stall word. */
export const STALL_GAP = ' · '

/** The most lines each text on a Status row wraps to: a name, where it stands, a was line. A look cuts past them with an ellipsis. */
export const STATUS_TEXT_LINES = 3
/** The most children drawn under one subject; the rest fold into "+ N more running". */
export const CHILD_ROWS = 3
/** Finished rows drawn above the look line; older ones fold into the count. */
const NEW_CLOSED_ROWS = 2

const CHILD_MARK: { mark: string; tone: StatusTone } = { mark: SUBJECT_MARKS.working.mark, tone: null }

/** The order of subjects on each side of the look line, from what needs the person to what is finished. */
const STATUS_PLACES = ['held', 'working', 'waits-on-other', 'queued', 'closed'] as const

type StatusPlace = (typeof STATUS_PLACES)[number]

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

  return cuts.find(fits) ?? cuts.at(-1)!
}

/** Whether `row` starts an item after another, with no look line between them. */
function isItemAfterItem(row: StatusRowParts, prev: StatusRowParts | undefined): boolean {
  const isUnderSubject = row.kind === 'more' || (row.kind === 'child' && row.branch !== null)

  return prev !== undefined && prev.kind !== 'look' && row.kind !== 'look' && !isUnderSubject
}

/** Whether `c` is a delegate that finished after the person last looked, so the page still shows it. */
function isFinishedUnseen(c: Child, lastLookAt: number | null): boolean {
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

function childRow(c: Child, branch: StatusBranch | null): StatusRowParts {
  const marks =
    c.delegateState === 'finished' ? SUBJECT_MARKS.done : c.delegateState === 'blocked' ? HELD_MARK : CHILD_MARK

  return {
    kind: 'child',
    id: c.id,
    ...marks,
    isRunning: isChildWorking(c),
    name: c.name,
    stall: childStall(c),
    branch,
  }
}

export function statusPage(
  s: {
    ledger: Pick<Ledger, 'overview' | 'items'>
    presence: Session['presence']
    overviewFailure?: Session['overviewFailure']
  },
  now: number,
): StatusPage {
  const o = s.ledger.overview
  const look = o?.lastLookAt ?? null
  const subjects = (o?.subjects ?? []).filter(x => x.into === null)
  const isNew = (x: Subject) => look === null || x.changedAt > look
  const heldIds = new Set(s.ledger.items.flatMap(i => o?.askSubjects[i.id] ?? []))
  const isHeld = (x: Subject) => isOpen(x) && heldIds.has(x.id)
  const oldestAskOf = (x: Subject): { id: string; kind: Item['kind'] } | null => {
    if (!isHeld(x)) return null
    const oldest = s.ledger.items
      .filter(i => o?.askSubjects[i.id] === x.id)
      .sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0]

    return oldest ? { id: oldest.id, kind: oldest.kind } : null
  }
  const placeOf = (x: Subject): StatusPlace =>
    isHeld(x) ? 'held' : x.status === 'done' || x.status === 'dropped' ? 'closed' : x.status
  const pageOrder = (x: Subject, y: Subject) =>
    Number(isNew(y)) - Number(isNew(x)) ||
    STATUS_PLACES.indexOf(placeOf(x)) - STATUS_PLACES.indexOf(placeOf(y)) ||
    y.changedAt - x.changedAt
  const stallOf = (x: Subject): StatusStall | null => (isHeld(x) ? { text: 'waiting', tone: 'needsYou' } : null)
  const newClosed = subjects
    .filter(x => !isOpen(x) && isNew(x))
    .sort((x, y) => (y.closedAt ?? 0) - (x.closedAt ?? 0))
    .slice(0, NEW_CLOSED_ROWS)
  const running = (o?.children ?? [])
    .filter(c => isChildRunning(c, now) || isFinishedUnseen(c, look))
    .sort((x, y) => (y.lastActivityAt ?? y.startedAt) - (x.lastActivityAt ?? x.startedAt))
  const open = subjects.filter(isOpen).sort(pageOrder)
  const foldable = open.filter(x => !isHeld(x) && !isNew(x) && !running.some(c => c.subjectId === x.id))
  const folded = foldable.slice(Math.max(0, OPEN_SUBJECTS - (open.length - foldable.length)))
  const shown = [...open.filter(x => !folded.includes(x)), ...newClosed].sort(pageOrder)
  const foldedDone = subjects.filter(x => x.status === 'done' && !newClosed.includes(x))
  const shownIds = new Set(shown.map(x => x.id))
  const rows: StatusRowParts[] = running
    .filter(c => c.subjectId === null || !shownIds.has(c.subjectId))
    .map(c => childRow(c, null))
  const lookRow: StatusRowParts | null = look === null ? null : { kind: 'look', id: 'look', text: LOOK_TEXT }
  const firstSeen = shown.findIndex(x => !isNew(x))
  for (const [i, x] of shown.entries()) {
    const hasNewAbove = i > 0
    if (lookRow && i === firstSeen && hasNewAbove) rows.push(lookRow)
    const under = running.filter(c => c.subjectId === x.id)
    const shownUnder = under.slice(0, CHILD_ROWS)
    const isMore = under.length > CHILD_ROWS
    const isRunning = x.status === 'working' && !isHeld(x) && (s.presence.isTurnRunning || under.some(isChildWorking))
    const isIdle = x.status === 'working' && !isRunning
    rows.push({
      kind: 'subject',
      id: x.id,
      ...(isHeld(x) ? HELD_MARK : isIdle ? IDLE_MARK : SUBJECT_MARKS[x.status]),
      isRunning,
      name: x.name,
      text: isNew(x) || isOpen(x) ? x.text || null : null,
      stall: stallOf(x),
      merged: isNew(x) ? x.merged : null,
      was: isNew(x) ? x.was : null,
      hasChildren: under.length > 0,
      ask: oldestAskOf(x),
    })
    rows.push(...shownUnder.map((c, n) => childRow(c, n === shownUnder.length - 1 && !isMore ? 'last' : 'mid')))
    const hidden = under.slice(CHILD_ROWS)
    const isEveryHiddenRunning = hidden.every(c => c.delegateState !== 'finished')
    if (isMore)
      rows.push({
        kind: 'more',
        id: `${x.id}-more`,
        text: `+ ${hidden.length} more${isEveryHiddenRunning ? ' running' : ''}`,
        branch: 'last',
      })
  }
  const isEveryShownNew = firstSeen === -1
  if (lookRow && isEveryShownNew && shown.length > 0) rows.push(lookRow)
  if (folded.length > 0) rows.push({ kind: 'fold', id: 'open', ...SUBJECT_MARKS.queued, text: `${folded.length} more` })
  if (foldedDone.length > 0) {
    const isMore = newClosed.some(x => x.status === 'done')
    rows.push({
      kind: 'fold',
      id: 'done',
      mark: SUBJECT_MARKS.done.mark,
      tone: 'done',
      text: `${foldedDone.length}${isMore ? ' more' : ''} done`,
    })
  }
  const head = o?.head ? { title: o.head.title, description: o.head.description || null } : null

  return {
    isEmpty: head === null && rows.length === 0,
    head,
    rows: rows.map((r, n) => ({ ...r, isRuledAbove: isItemAfterItem(r, rows[n - 1]), isLast: n === rows.length - 1 })),
    error: s.overviewFailure ? STATUS_FAILED : null,
    empty: {
      title: 'Status',
      hint: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts.",
    },
  }
}
