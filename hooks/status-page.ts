import type { Item, Ledger, Session, Subject } from '../types'
import { isChildRunning } from './status-children'
import { isOpen, OPEN_SUBJECTS } from './status-limits'
import { cutAtPhrase } from './text'
import { SUBJECT_MARKS } from './help'
import type { StatusTone } from './help'
import { goalPage, oldestAsk } from './status-goal-page'
import type { GoalParts } from './status-goal-page'
import { childRow, countsByMark, isFinishedUnseen, partRows, ruledRows } from './status-page-parts'
import type { ListContext } from './status-page-parts'

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
  /**
   * Rows folded into one line: open rows into a count, as "○ 2 more", or work that closed since the last look past the
   * rows drawn for it, named, as "✓ Also done: Sync merge, Search speed".
   */
  | { kind: 'fold'; id: string; mark: string; tone: StatusTone; text: string }
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

export const LOOK_TEXT = 'Last seen'
export const OTHER_WORK = 'Other work'
/** The dash the terminal and omp draw the look line's rule with. The rules between rows are solid, so the dashes mark this one out. */
export const LOOK_DASH = '╌'
/** What a subject's was line starts with, before the plan it replaces. */
export const WAS_PREFIX = 'was: '
const MERGED_PREFIX = 'merged in: '
/** What separates a row's name from its stall word. */
export const STALL_GAP = ' · '

/** The most lines each text on a Status row wraps to: a name, where it stands, a was line. A look cuts past them with an ellipsis. */
export const STATUS_TEXT_LINES = 3
/** Closed rows drawn above the look line for work that closed since the last look. The fold after them names the rest. */
const NEW_CLOSED_ROWS = 2
/** What a named fold says before the names it holds. Each closed status gets its own fold, in this order. */
export const NAMED_FOLD_TEXT = { done: 'Also done: ', dropped: 'Also dropped: ' } as const

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
  const isNew = (x: Subject) => look === null || x.changedAt > look
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
    lookId: look === null ? null : 'look',
    lookText: LOOK_TEXT,
    isLookAtEnd: true,
  }
  const lookId = (id: string) => (look === null ? null : id)
  /** A done fold's rows draw no child, since a child of a subject that is not shown is drawn at the top of the list. */
  const foldCtx: ListContext = { ...ctx, lookId: null, running: [] }
  /** A part's closed work past its rows that the person has not seen, named in one fold for each closed status. */
  const namedFolds = (prefix: string, named: Subject[], depth: number): StatusRowParts[] =>
    (['done', 'dropped'] as const).flatMap(status => {
      const names = named.filter(x => x.status === status).map(x => x.name)
      return names.length === 0
        ? []
        : [
            {
              kind: 'fold' as const,
              id: `${prefix}also-${status}`,
              depth,
              ...SUBJECT_MARKS[status],
              text: `${NAMED_FOLD_TEXT[status]}${names.join(', ')}`,
            },
          ]
    })
  const rows: StatusRowParts[] = [
    ...running.filter(c => c.subjectId === null || !shownIds.has(c.subjectId)).map(c => childRow(c, null, 0)),
    ...partRows(top.shown, ctx, 0, namedFolds('', top.named, 0)),
  ]
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
          },
        ]
      : []),
    ...doneFold(prefix, p.foldedDone, p.newClosed, depth),
  ]
  rows.push(...foldRows('', top, 0))
  if (otherShown.length > 0 || otherFolded.length > 0) {
    // The part's rule follows the list, so a look line that ends the list would draw a second rule under it.
    if (rows.at(-1)?.kind === 'look') rows.pop()
    rows.push({ kind: 'part', id: 'other', depth: 0, text: OTHER_WORK })
    rows.push(
      ...partRows(
        otherShown,
        { ...ctx, lookId: lookId('other-look') },
        0,
        namedFolds('other-', otherUnseenClosed.slice(NEW_CLOSED_ROWS), 0),
      ),
    )
    const otherFoldedOpen = otherFolded.filter(isOpen)
    if (otherFoldedOpen.length > 0)
      rows.push({ kind: 'counts', id: 'other-counts', depth: 0, counts: countsByMark(otherFoldedOpen) })
    rows.push(
      ...doneFold(
        'other-',
        otherFolded.filter(x => x.status === 'done'),
        otherNewClosed,
        0,
      ),
    )
  }
  /** A milestone's rows, one step in: its work in the page's order, then its folds, as the list after the goal folds. */
  const milestoneRows = (id: string, p: PartSplit): StatusRow[] =>
    ruledRows(
      [
        ...partRows(
          p.shown,
          { ...ctx, lookId: lookId(`${id}-look`), isLookAtEnd: false },
          1,
          namedFolds(`${id}-`, p.named, 1),
        ),
        ...foldRows(`${id}-`, p, 1),
      ],
      false,
    )
  const g = goalParts.goal
  const goal = g && {
    ...g,
    milestones: g.milestones.map((m, n) => ({ ...m, rows: milestoneRows(m.id, underMilestones[n]!) })),
  }
  const head = o?.head ? { title: o.head.title, description: o.head.description || null } : null

  return {
    isEmpty: head === null && rows.length === 0 && goal === null && goalParts.proposal === null,
    head,
    ...goalParts,
    goal,
    rows: ruledRows(rows, true),
    error: s.overviewFailure ? STATUS_FAILED : null,
    empty: {
      title: 'Status',
      hint: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts.",
    },
  }
}

/** Every row of the Status's list in the order the looks draw them: each milestone's rows, then the list after the goal. */
export function statusListRows(page: StatusPage): StatusRow[] {
  return [...(page.goal?.milestones ?? []).flatMap(m => m.rows), ...page.rows]
}
