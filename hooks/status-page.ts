import type { Item, Ledger, Session, Subject } from '../types'
import { isChildRunning, isSubjectSeen } from './status-children'
import { isOpen, OPEN_SUBJECTS } from './status-limits'
import { ago, cutAtPhrase } from './text'
import { SUBJECT_MARKS } from './help'
import type { StatusTone } from './help'
import { goalPage, oldestAsk } from './status-goal-page'
import type { GoalParts } from './status-goal-page'
import {
  childRow,
  countsByMark,
  isFinishedUnseen,
  NEW_TEXT,
  newSinceText,
  partRows,
  ruledRows,
} from './status-page-parts'
import type { ListContext } from './status-page-parts'

const STATUS_FAILED =
  "The inbox couldn't update this page from one of the agent's replies. What changed in that reply may be missing. It reads the conversation again after the next reply."

/** Where a row under a subject sits in its tree: `last` ends the line that ties the rows to the subject. */
export type StatusBranch = 'mid' | 'last'

/**
 * The words after a row's name: "waiting" in the needs-you tone while it waits on the person, "finished" in the done
 * tone, or how long an open subject has been idle, muted, as "idle 2d".
 */
export type StatusStall = { text: string; tone: 'needsYou' | 'done' | 'muted' }

/**
 * One line of the Status's list, in the order to draw it. Each look lays out the parts; none chooses them. A subject
 * or child draws its name with its stall word after it, past `STALL_GAP`, in the stall's tone. A subject draws where it
 * stands on the line under its name.
 */
export type StatusRow = StatusRowParts & {
  /** Whether a rule sets it apart from the row above. A subject and the rows under it are one item, and a heading is a rule already. */
  isRuledAbove: boolean
  /** Whether it ends the list, so a heading leaves no space below it. */
  isLast: boolean
}

export type StatusRowParts = {
  /** How many steps in from the list's edge it draws: a subject under a milestone at 1, a child under that subject at 2. */ depth: number
} & (
  | {
      kind: 'subject'
      id: string
      mark: string
      tone: StatusTone
      /** Whether its work runs now, so a look animates the mark: this session's turn runs, or a child of it does. */
      isRunning: boolean
      name: string
      /** Where it stands. Null for a finished row under the Earlier heading, which the person has seen. */
      text: string | null
      /** "waiting" while an open ask holds it up, else how long it has been idle, past `IDLE_AFTER_MS`. */
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
  /** A heading over the rows that changed since the last look, as "New since you looked 1h ago", or over the rows after them, "Earlier". */
  | { kind: 'heading'; id: string; text: string; hasSpaceAbove: boolean }
  /**
   * Rows folded into one line: open rows into a count, as "○ 2 more", or work that closed since the last look past the
   * rows drawn for it, named, as "✓ Also done: Sync merge, Search speed".
   */
  | {
      kind: 'fold'
      id: string
      mark: string
      tone: StatusTone
      text: string
      /** The work a named fold stands for, which a look that shows it counts as seen. None for the open fold. */
      subjectIds: string[]
    }
  /**
   * Seen finished rows folded into a count, as "3 done", or "3 more done" while finished rows still show above it. It
   * draws as the Closed fold does, with no mark. While the person has it unfolded, a look draws its `rows` after it, one
   * step in, as `unfoldedRows` gives them.
   */
  | { kind: 'done-fold'; id: string; text: string; rows: StatusRow[] }
  /** Where the work the goal does not need starts, under its own rule. */
  | { kind: 'part'; id: string; text: string }
  /** Seen open rows of that work folded into a count for each mark, as "● 5 working · ◌ 8 waiting · ○ 10 queued". */
  | { kind: 'counts'; id: string; counts: StatusCount[] }
)

/** One mark's share of a `counts` row. */
export type StatusCount = { mark: string; tone: StatusTone; text: string }

/** What the Status page shows. Every look draws it as it is. */
export type StatusPage = GoalParts & {
  isEmpty: boolean
  /** What the session is focused on now. The description is null until the Status call writes one. Looks draw it only while no goal is set; the goal draws its Now line in its place. */
  head: { title: string; description: string | null } | null
  /** The list after the goal: work not linked to a milestone, then Other work. Rows under a milestone are its `rows`. */
  rows: StatusRow[]
  /** The status line's error while the last Status call wrote nothing. */
  error: string | null
  empty: { title: string; hint: string }
}

const OTHER_WORK = 'Other work'
/** What a subject's was line starts with, before the plan it replaces. */
export const WAS_PREFIX = 'was: '
const MERGED_PREFIX = 'merged in: '
/** What separates a row's name from its stall word. */
export const STALL_GAP = ' · '

/** The most lines each text on a Status row wraps to: a name, where it stands, a was line. A look cuts past them with an ellipsis. */
export const STATUS_TEXT_LINES = 3
/** Closed rows drawn under the New heading for work that closed since the last look. The fold after them names the rest. */
const NEW_CLOSED_ROWS = 2
/** What a named fold says before the names it holds. Each closed status gets its own fold, in this order. */
export const NAMED_FOLD_TEXT = { done: 'Also done: ', dropped: 'Also dropped: ' } as const
/**
 * The most names a named fold shows; it counts the rest as "+N more". Two names of up to `NAME_KEPT` characters, the
 * prefix and the count wrap to at most `STATUS_TEXT_LINES` lines in 31 cells, the text width at the narrowest terminal
 * dock, so omp, which cuts a row's text past that many lines, shows the whole line there too.
 */
const NAMED_FOLD_NAMES = 2
/** Whether a look that shows a named fold counts the work in its "+N more" as seen, as it does the work it names. */
const IS_FOLD_MORE_SEEN = true
/** What ends a named fold that holds more names than it shows. */
export const namedFoldMore = (n: number) => `+${n} more`

/** The order of subjects under each of the New and Earlier headings, from what needs the person to what is finished. */
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

/**
 * A part of the list's subjects: those it draws, the work that closed since the last look past its rows, which a fold
 * names, and those it folds into a count.
 */
type PartSplit = {
  shown: Subject[]
  newClosed: Subject[]
  named: Subject[]
  foldedOpen: Subject[]
  foldedDone: Subject[]
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
  const isNew = (x: Subject) => o === null || !isSubjectSeen(o, x)
  const heldIds = new Set(s.ledger.items.flatMap(i => o?.askSubjects[i.id] ?? []))
  const isHeld = (x: Subject) => isOpen(x) && heldIds.has(x.id)
  const oldestAskOf = (x: Subject): { id: string; kind: Item['kind'] } | null =>
    isHeld(x) ? oldestAsk(s.ledger.items, o?.askSubjects ?? {}, x.id) : null
  const placeOf = (x: Subject): StatusPlace =>
    isHeld(x) ? 'held' : x.status === 'done' || x.status === 'dropped' ? 'closed' : x.status
  const pageOrder = (x: Subject, y: Subject) =>
    Number(isNew(y)) - Number(isNew(x)) ||
    STATUS_PLACES.indexOf(placeOf(x)) - STATUS_PLACES.indexOf(placeOf(y)) ||
    y.changedAt - x.changedAt
  const goalParts = goalPage(o, s.ledger.items)
  const milestoneIds = new Set((goalParts.goal?.milestones ?? []).map(m => m.id))
  const servedBy = (x: Subject) => (o?.goal ? o.serves[x.id] : undefined)
  const isOther = (x: Subject) => servedBy(x) === 'none'
  /** The milestone the page draws `x` under: one it serves that the goal shows. */
  const milestoneOf = (x: Subject): string | null => {
    const to = servedBy(x)
    return to !== undefined && milestoneIds.has(to) ? to : null
  }
  const running = (o?.children ?? [])
    .filter(c => isChildRunning(c, now) || isFinishedUnseen(c, look))
    .sort((x, y) => (y.lastActivityAt ?? y.startedAt) - (x.lastActivityAt ?? x.startedAt))
  const hasChildRow = (x: Subject) => running.some(c => c.subjectId === x.id)
  const unseenClosedOf = (part: Subject[]) =>
    part.filter(x => !isOpen(x) && isNew(x)).sort((x, y) => (y.closedAt ?? 0) - (x.closedAt ?? 0))
  const main = subjects.filter(x => !isOther(x))
  const other = subjects.filter(isOther)
  // The open fold is chosen across the whole main list, under milestones and not, so a goal changes no row's fold.
  const open = main.filter(isOpen).sort(pageOrder)
  const foldable = open.filter(x => !isHeld(x) && !isNew(x) && !hasChildRow(x))
  const folded = foldable.slice(Math.max(0, OPEN_SUBJECTS - (open.length - foldable.length)))
  const split = (part: Subject[]): PartSplit => {
    const unseenClosed = unseenClosedOf(part)
    const newClosed = unseenClosed.slice(0, NEW_CLOSED_ROWS)
    return {
      shown: [...part.filter(x => isOpen(x) && !folded.includes(x)), ...newClosed].sort(pageOrder),
      newClosed,
      named: unseenClosed.slice(NEW_CLOSED_ROWS),
      foldedOpen: part.filter(x => folded.includes(x)),
      foldedDone: part.filter(x => x.status === 'done' && !isNew(x)),
    }
  }
  const top = split(main.filter(x => milestoneOf(x) === null))
  const underMilestones = (goalParts.goal?.milestones ?? []).map(m => split(main.filter(x => milestoneOf(x) === m.id)))
  const otherUnseenClosed = unseenClosedOf(other)
  const otherNewClosed = otherUnseenClosed.slice(0, NEW_CLOSED_ROWS)
  const isOtherFolded = (x: Subject) =>
    isOpen(x) ? !isHeld(x) && !isNew(x) && !hasChildRow(x) : x.status === 'done' && !isNew(x)
  const otherFolded = other.filter(isOtherFolded)
  const otherShown = [...other.filter(x => isOpen(x) && !otherFolded.includes(x)), ...otherNewClosed].sort(pageOrder)
  const shownIds = new Set([...top.shown, ...underMilestones.flatMap(p => p.shown), ...otherShown].map(x => x.id))
  const ctx: ListContext = {
    isNew,
    isHeld,
    oldestAskOf,
    running,
    isTurnRunning: s.presence.isTurnRunning,
    now,
    headingIds: null,
    hasRowsAfter: false,
    isNewHeadingAlone: true,
  }
  const headingIds = (prefix: string) => (look === null ? null : { new: `${prefix}new`, earlier: `${prefix}earlier` })
  /** A done fold's rows draw no child, since a child of a subject that is not shown is drawn at the top of the list. */
  const foldCtx: ListContext = { ...ctx, running: [] }
  /** A part's closed work past its rows that the person has not seen, named in one fold for each closed status. */
  const namedFolds = (prefix: string, named: Subject[], depth: number): StatusRowParts[] =>
    (['done', 'dropped'] as const).flatMap(status => {
      const closed = named.filter(x => x.status === status)
      const names = closed.map(x => x.name)
      const hidden = names.length - NAMED_FOLD_NAMES
      const shown = [...names.slice(0, NAMED_FOLD_NAMES), ...(hidden > 0 ? [namedFoldMore(hidden)] : [])]
      return names.length === 0
        ? []
        : [
            {
              kind: 'fold' as const,
              id: `${prefix}also-${status}`,
              depth,
              ...SUBJECT_MARKS[status],
              text: `${NAMED_FOLD_TEXT[status]}${shown.join(', ')}`,
              subjectIds: (IS_FOLD_MORE_SEEN ? closed : closed.slice(0, NAMED_FOLD_NAMES)).map(x => x.id),
            },
          ]
    })
  /** A part's seen finished work as one done fold `depth` steps in, which holds their rows one step further in. */
  const doneFold = (prefix: string, done: Subject[], newClosed: Subject[], depth: number): StatusRowParts[] =>
    done.length === 0
      ? []
      : [
          {
            kind: 'done-fold',
            id: `${prefix}done`,
            depth,
            text: `${done.length}${newClosed.some(x => x.status === 'done') ? ' more' : ''} done`,
            rows: ruledRows(partRows([...done].sort(pageOrder), foldCtx, depth + 1), false),
          },
        ]
  /**
   * A part's folds `depth` steps in: "○ N more" for its folded open work, and "N done" for its seen finished work, or
   * "N more done" while finished rows still show above it.
   */
  const foldRows = (prefix: string, p: PartSplit, depth: number): StatusRowParts[] => [
    ...(p.foldedOpen.length > 0
      ? [
          {
            kind: 'fold' as const,
            id: `${prefix}open`,
            depth,
            ...SUBJECT_MARKS.queued,
            text: `${p.foldedOpen.length} more`,
            subjectIds: [],
          },
        ]
      : []),
    ...doneFold(prefix, p.foldedDone, p.newClosed, depth),
  ]
  const topFolds = foldRows('', top, 0)
  const rows: StatusRowParts[] = [
    ...running.filter(c => c.subjectId === null || !shownIds.has(c.subjectId)).map(c => childRow(c, null, 0)),
    ...partRows(
      top.shown,
      { ...ctx, headingIds: headingIds(''), hasRowsAfter: topFolds.length > 0 },
      0,
      namedFolds('', top.named, 0),
    ),
    ...topFolds,
  ]
  if (otherShown.length > 0 || otherFolded.length > 0) {
    const otherFoldedOpen = otherFolded.filter(isOpen)
    const otherFolds: StatusRowParts[] = [
      ...(otherFoldedOpen.length > 0
        ? [{ kind: 'counts' as const, id: 'other-counts', depth: 0, counts: countsByMark(otherFoldedOpen) }]
        : []),
      ...doneFold(
        'other-',
        otherFolded.filter(x => x.status === 'done'),
        otherNewClosed,
        0,
      ),
    ]
    rows.push(
      { kind: 'part', id: 'other', depth: 0, text: OTHER_WORK },
      ...partRows(
        otherShown,
        { ...ctx, headingIds: headingIds('other-'), hasRowsAfter: otherFolds.length > 0 },
        0,
        namedFolds('other-', otherUnseenClosed.slice(NEW_CLOSED_ROWS), 0),
      ),
      ...otherFolds,
    )
  }
  /** A milestone's rows, one step in: its work in the page's order, then its folds, as the list after the goal folds. */
  const milestoneRows = (id: string, p: PartSplit): StatusRow[] => {
    const folds = foldRows(`${id}-`, p, 1)
    const parts = { headingIds: headingIds(`${id}-`), hasRowsAfter: folds.length > 0, isNewHeadingAlone: false }
    return ruledRows([...partRows(p.shown, { ...ctx, ...parts }, 1, namedFolds(`${id}-`, p.named, 1)), ...folds], false)
  }
  const g = goalParts.goal
  const sinceText = look === null ? NEW_TEXT : newSinceText(ago(now - look))
  const [milestones, listRows] = withSinceOnFirstNew(
    (g?.milestones ?? []).map((m, n) => milestoneRows(m.id, underMilestones[n]!)),
    ruledRows(rows, true),
    sinceText,
  )
  const goal = g && { ...g, milestones: g.milestones.map((m, n) => ({ ...m, rows: milestones[n]! })) }
  const head = o?.head ? { title: o.head.title, description: o.head.description || null } : null

  return {
    isEmpty: head === null && rows.length === 0 && goal === null && !goalParts.canRestoreGoal,
    head,
    ...goalParts,
    goal,
    rows: listRows,
    error: s.overviewFailure ? STATUS_FAILED : null,
    empty: {
      title: 'Status',
      hint: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts.",
    },
  }
}

/**
 * The milestones' rows and the list after the goal, with `sinceText` on the first New heading in draw order, so the page
 * says once how long ago the person last looked, where their eye first meets what changed. A heading that starts the
 * list takes no space above it, since the space above the list already sets it apart.
 */
function withSinceOnFirstNew(
  milestones: StatusRow[][],
  rows: StatusRow[],
  sinceText: string,
): [StatusRow[][], StatusRow[]] {
  let isSaid = false
  const said = (list: StatusRow[]) =>
    list.map(r => {
      if (isSaid || r.kind !== 'heading' || r.text !== NEW_TEXT) return r
      isSaid = true
      return { ...r, text: sinceText }
    })

  const saidMilestones = milestones.map(said)
  const [first, ...rest] = said(rows)
  const startsList = first?.kind === 'heading' ? { ...first, hasSpaceAbove: false } : first

  return [saidMilestones, startsList ? [startsList, ...rest] : []]
}

/** The subjects a look counts as seen while `row` is on screen. */
export function seenSubjectIds(row: StatusRow): string[] {
  return row.kind === 'subject' ? [row.id] : row.kind === 'fold' ? row.subjectIds : []
}

/** Every row of the Status's list in the order the looks draw them: each milestone's rows, then the list after the goal. */
export function statusListRows(page: StatusPage): StatusRow[] {
  return [...(page.goal?.milestones ?? []).flatMap(m => m.rows), ...page.rows]
}
