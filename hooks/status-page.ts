import type { Child, Item, Ledger, Session, Subject } from '../types'
import { isChildRunning, isChildSettled, isChildShown, isSubjectSeen } from './status-children'
import { isOpen, OPEN_SUBJECTS } from './status-limits'
import { cutAtPhrase } from './text'
import { SUBJECT_MARKS } from './help'
import type { StatusTone } from './help'
import { goalPage, metMilestonesFold, oldestAsk } from './status-goal-page'
import type { GoalParts, MilestoneRow } from './status-goal-page'
import { childRow, countsByMark, namedFolds, partRows } from './status-page-parts'
import type { ListContext } from './status-page-parts'

const STATUS_FAILED =
  "The inbox couldn't update this page from one of the agent's replies. What changed in that reply may be missing. It reads the conversation again after the next reply."

/** Where a row under a subject sits in its tree: `last` ends the line that ties the rows to the subject. */
export type StatusBranch = 'mid' | 'last'

/** The words after a subject's name: how long it has been idle, muted, as "idle 2d". */
export type StatusStall = { text: string; tone: 'muted' }

/**
 * One line of the Status's list, in the order to draw it. Each look lays out the parts; none chooses them. A subject
 * draws its name with its stall word after it, past `STALL_GAP`. A subject an open ask holds up draws the ask's words in
 * the needs-you tone under its name, and where it stands on the line after.
 */
export type StatusRow = {
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
      /** Where it stands. Null for a finished row the person has seen, as in a done fold. */
      text: string | null
      /** "idle 2d" once it has gone without a change. Null while `waitsOn` is set. */
      stall: StatusStall | null
      /** The oldest open ask that holds it up. */
      waitsOn: string | null
      /** The names of the subjects merged into it, while the person has not seen them. */
      merged: string | null
      /** The plan a reversal replaced, while the person has not seen it. */
      was: string | null
      /** Whether rows of its children follow, so its tree line runs down from its mark. */
      hasChildren: boolean
      /** Its children, which a fold on its name hides. 0 while it draws none, and its name then takes no press. */
      foldCount: number
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
      /**
       * Its place under its subject. Null when it is linked to no subject the list shows. It then sits first in the rows
       * of the milestone its subject serves, or else first in the list after the goal, under Other work while the goal
       * shows milestones.
       */
      branch: StatusBranch | null
    }
  /** The children of a subject past `CHILD_ROWS`, as "+ 2 more running", or "+ 2 more" when one finished. It is always the last row under its subject. */
  | { kind: 'more'; id: string; text: string; branch: 'last' }
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
  /**
   * Seen open rows of the work the goal does not need, folded into a count for each mark that is under way, as "● 5
   * working · ◌ 8 waiting". Folded queued rows get no count.
   */
  | { kind: 'counts'; id: string; counts: StatusCount[] }
)

/** One mark's share of a `counts` row. */
export type StatusCount = { mark: string; tone: StatusTone; text: string }

/** What the Status page shows. Every look draws it as it is. */
export type StatusPage = GoalParts & {
  isEmpty: boolean
  /** What the session is focused on now. The description is null until the Status call writes one. */
  head: { title: string; description: string | null } | null
  /**
   * Whether looks draw the head in its own section after the goal's: while no goal is set, and once the goal is met,
   * since the work no longer serves it. Otherwise the goal draws its Now line in the head's place.
   */
  isHeadApart: boolean
  /**
   * The list after the goal. Rows under a milestone are its `rows`. While the goal shows milestones, every other row
   * sits under Other work, so only milestones and their rows draw between the goal and Other work. Otherwise work not
   * linked to a milestone comes first, then Other work.
   */
  rows: StatusRow[]
  /** The status line's error while the last Status call wrote nothing. */
  error: string | null
}

const OTHER_WORK = 'Other work'
/** What a subject's was line starts with, before the plan it replaces. */
export const WAS_PREFIX = 'was: '
const MERGED_PREFIX = 'merged in: '
/** What separates a row's name from its stall word. */
export const STALL_GAP = ' · '

/** The most lines each text on a Status row wraps to: a name, where it stands, a was line. A look cuts past them with an ellipsis. */
export const STATUS_TEXT_LINES = 3
/** Closed rows drawn for work that closed since the last look. The fold after them names the rest. */
const NEW_CLOSED_ROWS = 2

/** The order of subjects, from what needs the person to what is finished. */
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
    STATUS_PLACES.indexOf(placeOf(x)) - STATUS_PLACES.indexOf(placeOf(y)) || y.changedAt - x.changedAt
  const goalParts = goalPage(o, s.ledger.items, now)
  const milestoneIds = new Set((goalParts.goal?.milestones ?? []).map(m => m.id))
  const servedBy = (x: Subject) => (o?.goal ? o.serves[x.id] : undefined)
  /** The milestone the page draws `x` under: one it serves that the goal shows. */
  const milestoneOf = (x: Subject): string | null => {
    const to = servedBy(x)
    return to !== undefined && milestoneIds.has(to) ? to : null
  }
  const hasMilestones = milestoneIds.size > 0
  const isUnneeded = (x: Subject) => servedBy(x) === 'none'
  const isOther = (x: Subject) => isUnneeded(x) || (hasMilestones && milestoneOf(x) === null)
  const running = (o?.children ?? [])
    .filter(c => isChildShown(c, now, look))
    .sort((x, y) => (y.lastActivityAt ?? y.startedAt) - (x.lastActivityAt ?? x.startedAt))
  const hasChildRow = (x: Subject) => running.some(c => c.subjectId === x.id)
  const unseenClosedOf = (part: Subject[]) =>
    part.filter(x => !isOpen(x) && isNew(x)).sort((x, y) => (y.closedAt ?? 0) - (x.closedAt ?? 0))
  const needed = subjects.filter(x => !isUnneeded(x))
  const main = needed.filter(x => !isOther(x))
  const other = subjects.filter(isOther)
  const canFold = (x: Subject) => !isHeld(x) && !isNew(x) && !hasChildRow(x)
  const laterIds = new Set((goalParts.goal?.milestones ?? []).filter(m => m.place === 'later').map(m => m.id))
  const isFoldedUnderLater = (x: Subject) => laterIds.has(milestoneOf(x) ?? '') && canFold(x)
  // The open fold is chosen across all the work the goal needs, so a row's fold does not hang on where it sits. A row
  // that folds under Later anyway takes none of its rows.
  const open = needed.filter(x => isOpen(x) && !isFoldedUnderLater(x)).sort(pageOrder)
  const foldable = open.filter(canFold)
  const folded = foldable.slice(Math.max(0, OPEN_SUBJECTS - (open.length - foldable.length)))
  /** A part's split. Under a Later milestone, every open row that can fold does. */
  const split = (part: Subject[], isLater = false): PartSplit => {
    const unseenClosed = unseenClosedOf(part)
    const newClosed = unseenClosed.slice(0, NEW_CLOSED_ROWS)
    const isFoldedOpen = (x: Subject) => isOpen(x) && (folded.includes(x) || (isLater && canFold(x)))
    return {
      shown: [...part.filter(x => isOpen(x) && !isFoldedOpen(x)), ...newClosed].sort(pageOrder),
      newClosed,
      named: unseenClosed.slice(NEW_CLOSED_ROWS),
      foldedOpen: part.filter(isFoldedOpen),
      foldedDone: part.filter(x => x.status === 'done' && !isNew(x)),
    }
  }
  const top = split(main.filter(x => milestoneOf(x) === null))
  const underMilestones = (goalParts.goal?.milestones ?? []).map(m =>
    split(
      main.filter(x => milestoneOf(x) === m.id),
      m.place === 'later',
    ),
  )
  const otherUnseenClosed = unseenClosedOf(other)
  const otherNewClosed = otherUnseenClosed.slice(0, NEW_CLOSED_ROWS)
  /** Work the goal does not need folds once seen. Work not linked to a shown milestone folds as the open fold says. */
  const isOtherFolded = (x: Subject) =>
    !isOpen(x)
      ? x.status === 'done' && !isNew(x)
      : isUnneeded(x)
        ? !isHeld(x) && !isNew(x) && !hasChildRow(x)
        : folded.includes(x)
  const otherFolded = other.filter(isOtherFolded)
  const otherShown = [...other.filter(x => isOpen(x) && !otherFolded.includes(x)), ...otherNewClosed].sort(pageOrder)
  const shownIds = new Set([...top.shown, ...underMilestones.flatMap(p => p.shown), ...otherShown].map(x => x.id))
  const ctx: ListContext = {
    isNew,
    isHeld,
    oldestAskOf,
    items: s.ledger.items,
    running,
    isTurnRunning: s.presence.isTurnRunning,
    now,
  }
  /** A done fold's rows draw no child, since a child of a subject that is not shown draws with no subject above it. */
  const foldCtx: ListContext = { ...ctx, running: [] }
  /** A part's "○ N more" `depth` steps in, for its folded open work. */
  const openFold = (prefix: string, foldedOpen: Subject[], depth: number): StatusRow[] =>
    foldedOpen.length === 0
      ? []
      : [
          {
            kind: 'fold',
            id: `${prefix}open`,
            depth,
            ...SUBJECT_MARKS.queued,
            text: `${foldedOpen.length} more`,
            subjectIds: [],
          },
        ]
  /**
   * A part's seen finished work as one done fold `depth` steps in, which holds their rows one step further in: its
   * subjects, then the finished delegates the person has seen that no subject holds. It reads "N more done" while
   * finished rows still show above it.
   */
  const doneFold = (
    prefix: string,
    done: Subject[],
    newClosed: Subject[],
    depth: number,
    settled: Child[],
  ): StatusRow[] =>
    done.length + settled.length === 0
      ? []
      : [
          {
            kind: 'done-fold',
            id: `${prefix}done`,
            depth,
            text: `${done.length + settled.length}${newClosed.some(x => x.status === 'done') ? ' more' : ''} done`,
            rows: [
              ...partRows([...done].sort(pageOrder), foldCtx, depth + 1),
              ...settled.map(c => childRow(c, null, depth + 1)),
            ],
          },
        ]
  /** A part's rows `depth` steps in: its work in the page's order with its folds, as the list after the goal folds. */
  const foldedPart = (prefix: string, p: PartSplit, depth: number, settled: Child[] = []): StatusRow[] => [
    ...partRows(p.shown, ctx, depth, openFold(prefix, p.foldedOpen, depth), namedFolds(prefix, p.named, depth)),
    ...doneFold(prefix, p.foldedDone, p.newClosed, depth, settled),
  ]
  /** Finished delegates the person has seen that no subject holds, which a subject's own row would otherwise stand for. */
  const settled = (o?.children ?? [])
    .filter(c => isChildSettled(c, now, look) && !o?.subjects.some(x => x.id === c.subjectId))
    .sort((x, y) => (y.endedAt ?? 0) - (x.endedAt ?? 0))
  /** Running work linked to no subject the page shows, with the shown milestone its subject serves, if any. */
  const loose = running
    .filter(c => c.subjectId === null || !shownIds.has(c.subjectId))
    .map(c => {
      const x = subjects.find(y => y.id === c.subjectId)
      return { child: c, milestoneId: x === undefined ? null : milestoneOf(x) }
    })
  /** Loose running work drawn first in a milestone's rows, or with `null` first in the list after the goal. */
  const looseRows = (milestoneId: string | null, depth: number): StatusRow[] =>
    loose.filter(l => l.milestoneId === milestoneId).map(l => childRow(l.child, null, depth))
  const otherCounts = countsByMark(otherFolded.filter(x => isOpen(x) && isUnneeded(x)))
  const afterOtherOpen: StatusRow[] = [
    ...openFold(
      'other-',
      otherFolded.filter(x => isOpen(x) && !isUnneeded(x)),
      0,
    ),
    ...(otherCounts.length === 0
      ? []
      : [{ kind: 'counts' as const, id: 'other-counts', depth: 0, counts: otherCounts }]),
  ]
  const otherRows: StatusRow[] = [
    ...(hasMilestones ? looseRows(null, 0) : []),
    ...partRows(otherShown, ctx, 0, afterOtherOpen, namedFolds('other-', otherUnseenClosed.slice(NEW_CLOSED_ROWS), 0)),
    ...doneFold(
      'other-',
      otherFolded.filter(x => x.status === 'done'),
      otherNewClosed,
      0,
      hasMilestones ? settled : [],
    ),
  ]
  const rows: StatusRow[] = [
    ...(hasMilestones ? [] : looseRows(null, 0)),
    ...foldedPart('', top, 0, hasMilestones ? [] : settled),
    ...(otherRows.length > 0 ? [{ kind: 'part' as const, id: 'other', depth: 0, text: OTHER_WORK }, ...otherRows] : []),
  ]
  /** Whether every subject under a milestone is closed, seen or not, with no child still running under it. */
  const isWorkClosed = (m: MilestoneRow, p: PartSplit) =>
    p.foldedOpen.length === 0 &&
    !p.shown.some(isOpen) &&
    !running.some(
      c =>
        isChildRunning(c, now) &&
        (p.shown.some(x => x.id === c.subjectId) || loose.some(l => l.child === c && l.milestoneId === m.id)),
    )
  const workCount = (p: PartSplit) => p.shown.length + p.named.length + p.foldedOpen.length + p.foldedDone.length
  /** Whether every row under a milestone is seen and finished, with no running work under it. */
  const isAllSeen = (m: MilestoneRow, p: PartSplit) =>
    p.shown.length + p.named.length + p.foldedOpen.length === 0 && !loose.some(l => l.milestoneId === m.id)
  /**
   * A milestone with its rows one step in. A done one the person has seen, with every row under it seen and finished,
   * shrinks to its name and holds its finished rows behind a fold.
   */
  const withRows = (m: MilestoneRow, p: PartSplit): MilestoneRow => {
    const rows = [...looseRows(m.id, 1), ...foldedPart(`${m.id}-`, p, 1)]
    const changedAt = o?.milestones.find(x => x.id === m.id)?.changedAt ?? Infinity
    const isShrunk = m.place === 'done' && look !== null && changedAt <= look && isAllSeen(m, p)
    return isShrunk
      ? {
          ...m,
          text: null,
          isMuted: true,
          foldId: p.foldedDone.length > 0 ? `${m.id}-done` : null,
          rows: partRows([...p.foldedDone].sort(pageOrder), foldCtx, 1),
        }
      : {
          ...m,
          rows,
          foldCount: rows.length === 0 ? 0 : workCount(p) + loose.filter(l => l.milestoneId === m.id).length,
        }
  }
  const g = goalParts.goal
  const goal = g && {
    ...g,
    milestonesFold: o?.goal
      ? metMilestonesFold(o.goal, g.milestones, m => isWorkClosed(m, underMilestones[g.milestones.indexOf(m)]!))
      : null,
    milestones: g.milestones.map((m, n) => withRows(m, underMilestones[n]!)),
  }
  const head = o?.head ? { title: o.head.title, description: o.head.description || null } : null

  return {
    isEmpty: head === null && rows.length === 0 && goal === null && !goalParts.canRestoreGoal,
    head,
    isHeadApart: goal === null || goal.isMet,
    ...goalParts,
    goal,
    rows,
    error: s.overviewFailure ? STATUS_FAILED : null,
  }
}

/** The subjects a look counts as seen while `row` is on screen. */
export function seenSubjectIds(row: StatusRow): string[] {
  return row.kind === 'subject' ? [row.id] : row.kind === 'fold' ? row.subjectIds : []
}
