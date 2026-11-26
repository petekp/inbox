import type { Child, Item, Ledger, Session, Subject } from '../../types'
import { isChildRunning, isChildSettled, isChildShown, isSubjectSeen } from '../domain/status-children'
import { isOpen, OPEN_SUBJECTS } from '../domain/status-limits'
import { statusSyncText } from '../domain/status-freshness'
import { statusSync } from './sync-state'
import type { StatusSync, TurnSync } from './sync-state'
import { SUBJECT_MARKS } from './help'
import type { StatusTone } from './help'
import { goalPage, metMilestonesFold, oldestAsk } from './status-goal-page'
import type { GoalParts, MilestoneRow } from './status-goal-page'
import {
  childRow,
  countsByMark,
  finishedLine,
  isCounted,
  namedFolds,
  partRows,
  textBeyondName,
  unplacedChildren,
} from './status-page-parts'
import type { ListContext, PartSplit } from './status-page-parts'
import { headPart, milestoneAsSubject, subjectInPlaceOf, withoutRepeatedNow } from './status-repeats'

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
      /** The line under its name: how long a finished delegate in a done fold ran and when it finished. Null for every other child. */
      text: string | null
      /**
       * Its place under its subject. Null when it is linked to no subject the list shows. It then sits first in the rows
       * of the milestone its subject serves, or else first in the list after the goal, under Other work while the goal
       * shows milestones.
       */
      branch: StatusBranch | null
    }
  /**
   * The children of a subject past `CHILD_ROWS`, as "+ 2 more running", or "+ 2 more" when one finished. It is always
   * the last row under its subject. Its branch is null under a subject drawn in a milestone's place, as a child's is.
   */
  | { kind: 'more'; id: string; text: string; branch: 'last' | null }
  /**
   * Rows folded into one line: open rows into a count, as "○ 2 more", or work that closed since the last look past the
   * rows drawn for it, named, as "✓ Done: Sync merge, Search speed".
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
  /**
   * Where the work the goal does not need starts, under its own rule: "Other work", or the head's title with its
   * description under it while the head is apart from the goal (`StatusPage.head`). The text is null, and the rule
   * draws with no label, while no goal is set and the title repeats a subject's name (`isTitleRepeated`).
   */
  | { kind: 'part'; id: string; text: string | null; description: string | null; isTitle: boolean }
  /**
   * Seen open rows of the work the goal does not need, folded into a count for each mark that is under way, as "Also
   * open: ● 5 working · ◌ 8 waiting ›". Folded queued rows get no count. It folds as the done fold does: while the person
   * has it unfolded, a look draws its `rows` after it, one step in, as `unfoldedRows` gives them.
   */
  | { kind: 'counts'; id: string; counts: StatusCount[]; rows: StatusRow[] }
)

/** One mark's share of a `counts` row. */
export type StatusCount = { mark: string; tone: StatusTone; text: string }

/** What the Status page shows. Every look draws it as it is. */
export type StatusPage = GoalParts & {
  isEmpty: boolean
  /**
   * What the session is focused on now. The description is null until the Status call writes one. While a goal is
   * open, the goal draws it as its Now line. While no goal is set, and once the goal is met, since the work no longer
   * serves it, it is the heading of `rows`, as their first `part` row, when `headPart` keeps it: over rows, or while no goal is set and it has a description.
   */
  head: { title: string; description: string | null } | null
  /**
   * The list after the goal. Rows under a milestone are its `rows`. While the goal shows milestones, every other row
   * sits under Other work, so only milestones and their rows draw between the goal and Other work. Otherwise work not
   * linked to a milestone comes first, then Other work.
   */
  rows: StatusRow[]
  /** Whether the page is current. */
  sync: StatusSync
  /** The status line that says why the page is stale, or null while it is current. */
  syncText: string | null
}

const OTHER_WORK = 'Other work'
/** The word a Prev line starts with, before the text it replaced: a subject's plan, a milestone's text, the goal before. */
export const WAS_LABEL = 'Prev: '
/** The mark before a Prev line's word. */
export const WAS_MARK = '↩'
/** What a Prev line starts with: its mark, then its word. */
export const WAS_PREFIX = `${WAS_MARK} ${WAS_LABEL}`

/** The most lines each text on a Status row wraps to: a name, where it stands, a was line. A look cuts past them with an ellipsis. */
export const STATUS_TEXT_LINES = 3
/** Closed rows drawn for work that closed since the last look. The fold after them names the rest. */
const NEW_CLOSED_ROWS = 2

/** The order of subjects, from what needs the person to what is finished. */
const STATUS_PLACES = ['held', 'working', 'waits-on-other', 'queued', 'closed'] as const

type StatusPlace = (typeof STATUS_PLACES)[number]

export function statusPage(
  s: {
    ledger: Pick<Ledger, 'overview' | 'items'>
    presence: Session['presence']
    overviewFailure?: Session['overviewFailure']
  },
  now: number,
  turn: TurnSync = { is: 'fresh' },
): StatusPage {
  const o = s.ledger.overview
  const sync = statusSync(s)
  const look = o?.lastLookAt ?? null
  const subjects = (o?.subjects ?? []).filter(x => x.into === null)
  const isNew = (x: Subject) => o === null || !isSubjectSeen(o, x)
  const heldIds = new Set(s.ledger.items.flatMap(i => o?.askSubjects[i.id] ?? []))
  const isHeld = (x: Subject) => isOpen(x) && heldIds.has(x.id)
  const holdKindsOf = (x: Subject) => s.ledger.items.filter(i => o?.askSubjects[i.id]?.includes(x.id)).map(i => i.kind)
  const oldestAskOf = (x: Subject): { id: string; kind: Item['kind'] } | null =>
    isHeld(x) ? oldestAsk(s.ledger.items, o?.askSubjects ?? {}, x.id) : null
  const placeOf = (x: Subject): StatusPlace =>
    isHeld(x) ? 'held' : x.status === 'done' || x.status === 'dropped' ? 'closed' : x.status
  const pageOrder = (x: Subject, y: Subject) =>
    STATUS_PLACES.indexOf(placeOf(x)) - STATUS_PLACES.indexOf(placeOf(y)) || y.changedAt - x.changedAt
  const goalParts = goalPage(o, s.ledger.items)
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
    holdKindsOf,
    oldestAskOf,
    items: s.ledger.items,
    running,
    isTurnRunning: s.presence.isTurnRunning && turn.is === 'fresh',
    now,
  }
  /** A done fold's rows draw no child, since a child of a subject that is not shown draws with no subject above it. */
  const foldCtx: ListContext = { ...ctx, running: [] }
  /** A part's "○ N more" `depth` steps in, for its folded open work. */
  const openFold = (prefix: string, foldedOpen: Subject[], depth: number): StatusRow[] =>
    foldedOpen.length === 0
      ? []
      : foldedOpen.length === 1
        ? partRows(foldedOpen, ctx, depth)
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
      : done.length + settled.length === 1
        ? [...partRows(done, foldCtx, depth), ...settled.map(c => childRow(c, null, depth, finishedLine(c, now)))]
        : [
            {
              kind: 'done-fold',
              id: `${prefix}done`,
              depth,
              text: `${done.length + settled.length}${newClosed.some(x => x.status === 'done') ? ' more' : ''} done`,
              rows: [
                ...partRows([...done].sort(pageOrder), foldCtx, depth + 1),
                ...settled.map(c => childRow(c, null, depth + 1, finishedLine(c, now))),
              ],
            },
          ]
  /** A part's rows `depth` steps in: its work in the page's order with its folds, as the list after the goal folds. */
  const foldedPart = (prefix: string, p: PartSplit, depth: number, settled: Child[] = []): StatusRow[] => [
    ...partRows(p.shown, ctx, depth, openFold(prefix, p.foldedOpen, depth), namedFolds(prefix, p.named, depth)),
    ...doneFold(prefix, p.foldedDone, p.newClosed, depth, settled),
  ]
  const { loose, settled } = unplacedChildren(o?.children ?? [], {
    subjects,
    shownIds,
    milestoneOf,
    isSettled: c => isChildSettled(c, now, look),
    running,
  })
  /** Loose running work drawn first in a milestone's rows, or with `null` first in the list after the goal. */
  const looseRows = (milestoneId: string | null, depth: number): StatusRow[] =>
    loose.filter(l => l.milestoneId === milestoneId).map(l => childRow(l.child, null, depth))
  const otherCountedSubjects = otherFolded.filter(x => isOpen(x) && isUnneeded(x) && isCounted(x))
  const otherCounts = countsByMark(otherCountedSubjects)
  const afterOtherOpen: StatusRow[] = [
    ...openFold(
      'other-',
      otherFolded.filter(x => isOpen(x) && !isUnneeded(x)),
      0,
    ),
    ...(otherCounts.length === 0
      ? []
      : [
          {
            kind: 'counts' as const,
            id: 'other-counts',
            depth: 0,
            counts: otherCounts,
            rows: partRows([...otherCountedSubjects].sort(pageOrder), foldCtx, 1),
          },
        ]),
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
  const head = o?.head ? { title: o.head.title, description: textBeyondName(o.head.title, o.head.description) } : null
  const g = goalParts.goal
  const listRows: StatusRow[] = [
    ...(hasMilestones ? [] : looseRows(null, 0)),
    ...foldedPart('', top, 0, hasMilestones ? [] : settled),
    ...(otherRows.length > 0
      ? [
          { kind: 'part' as const, id: 'other', depth: 0, text: OTHER_WORK, description: null, isTitle: false },
          ...otherRows,
        ]
      : []),
  ]
  const headRows = headPart(head, g, subjects, listRows)
  const rows: StatusRow[] = [
    ...headRows,
    ...(headRows.length > 0 && listRows[0]?.id === 'other' ? listRows.slice(1) : listRows),
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
    const milestone = o?.milestones.find(x => x.id === m.id)
    const hasLooseWork = loose.some(l => l.milestoneId === m.id)
    const inPlace = o && milestone && !hasLooseWork ? subjectInPlaceOf(o, milestone, s.ledger.items) : null
    if (inPlace) return milestoneAsSubject(m, partRows([inPlace], isNew(inPlace) || isOpen(inPlace) ? ctx : foldCtx, 0))
    const rows = [...looseRows(m.id, 1), ...foldedPart(`${m.id}-`, p, 1)]
    const changedAt = milestone?.changedAt ?? Infinity
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
  const goal = g && {
    ...g,
    milestonesFold: o?.goal
      ? metMilestonesFold(o.goal, g.milestones, m => isWorkClosed(m, underMilestones[g.milestones.indexOf(m)]!))
      : null,
    milestones: g.milestones.map((m, n) => withRows(m, underMilestones[n]!)),
  }

  return withoutRepeatedNow(
    {
      isEmpty: rows.length === 0 && goal === null && !goalParts.canRestoreGoal,
      head,
      ...goalParts,
      goal,
      rows,
      sync,
      syncText: statusSyncText(sync, now),
    },
    o,
  )
}

/** The subjects a look counts as seen while `row` is on screen. */
export function seenSubjectIds(row: StatusRow): string[] {
  return row.kind === 'subject' ? [row.id] : row.kind === 'fold' ? row.subjectIds : []
}
