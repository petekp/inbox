import type { StatusTone } from '../../hooks/help'
import { goalKeyPlan, milestoneKeyPlan, statusKeyPlan, GOAL_FIELD, GOAL_KEYS_ID } from '../../hooks/status-keys'
import type { StatusKey } from '../../hooks/status-keys'
import { GOAL_HEADING, NO_GOAL_TEXT, shownMilestones } from '../../hooks/status-goal-page'
import type { MilestoneRow } from '../../hooks/status-goal-page'
import { STALL_GAP, WAS_PREFIX, mergedLine } from '../../hooks/status-page'
import type { StatusPage, StatusRow } from '../../hooks/status-page'
import { unfoldedRows } from '../../hooks/status-page-parts'
import { LATER_TEXT, isSpacedAbove, milestoneRows, workJoints } from '../../hooks/status-path'
import type { PathLine, WorkJoint } from '../../hooks/status-path'
import { cellWidth } from '../../hooks/text'
import { button, emptyBlock } from './blocks'
import { emptyTab } from '../../hooks/empty-tab'
import type { SessionView } from '../../hooks/session-view'
import type { Block, Button, Does, Field, Mark, PathSide, Tone, TreeStroke } from './blocks'

/** The most cells a merged line holds before it cuts its names: three lines of the pane at its usual width. */
const MERGED_CELLS = 150

const toneOf = (t: StatusTone): Tone => t

const markOf = (mark: string, tone: StatusTone, isRunning: boolean): Mark => ({
  text: mark,
  tone: toneOf(tone),
  isRunning,
})

function doesOf(k: StatusKey): Does {
  const p = k.press
  if (p.action === 'show-ask') return { is: 'view', change: { showAsk: p.askId } }
  if (p.action === 'toggle-fold') return { is: 'view', change: { toggleFold: p.foldId } }
  if (p.action === 'type-goal') return { is: 'type', rowId: GOAL_KEYS_ID, text: p.text, hint: GOAL_FIELD.placeholder }

  return { is: 'press', press: { action: p.action, id: GOAL_KEYS_ID }, effects: [] }
}

/** The buttons of a Status target, in its plan's order. The Status page selects no row, so its keys press nothing. */
function keyButtons(id: string, keys: StatusKey[]): Button[] {
  return keys.map((k, n) => button(`${id} ${n}`, k.label, k.emphasis, doesOf(k)))
}

function rowBlocks(row: StatusRow, isUnfolded: (id: string) => boolean): Block[] {
  if (row.kind === 'subject') {
    const under = [
      row.text,
      row.merged ? mergedLine(row.merged, t => cellWidth(t) <= MERGED_CELLS) : null,
      row.was ? `${WAS_PREFIX}${row.was}` : null,
    ].filter(l => l !== null)

    return [
      {
        kind: 'status',
        id: row.id,
        depth: row.depth,
        mark: markOf(row.mark, row.tone, row.isRunning),
        name: row.name,
        isBold: false,
        isMuted: false,
        stall: row.stall,
        under,
        buttons: keyButtons(row.id, statusKeyPlan(row)),
        ...(row.hasChildren ? { tree: [{ depth: row.depth, is: 'down' as const }] } : {}),
      },
    ]
  }
  if (row.kind === 'child')
    return [
      {
        kind: 'status',
        id: row.id,
        depth: row.depth,
        mark: markOf(row.mark, row.tone, row.isRunning),
        name: row.name,
        isBold: false,
        isMuted: true,
        stall: row.stall,
        under: [],
        buttons: [],
        ...(row.branch ? { tree: [{ depth: row.depth - 1, is: row.branch }] } : {}),
      },
    ]
  if (row.kind === 'more')
    return [{ ...note(row.id, row.text, 'muted'), depth: row.depth, tree: [{ depth: row.depth - 1, is: row.branch }] }]
  if (row.kind === 'part')
    return [
      { kind: 'gap', id: `gap ${row.id}` },
      { kind: 'rule', id: row.id, text: row.text },
    ]
  if (row.kind === 'counts')
    return [{ ...note(row.id, row.counts.map(c => `${c.mark} ${c.text}`).join(STALL_GAP), 'muted'), depth: row.depth }]
  if (row.kind === 'done-fold')
    return [
      {
        kind: 'fold',
        id: row.id,
        depth: row.depth,
        text: row.text,
        isOpen: isUnfolded(row.id),
        change: { toggleFold: row.id },
      },
    ]

  return [
    {
      kind: 'status',
      id: row.id,
      depth: row.depth,
      mark: markOf(row.mark, row.tone, false),
      name: row.text,
      isBold: false,
      isMuted: true,
      stall: null,
      under: [],
      buttons: [],
    },
  ]
}

/**
 * A milestone on the goal's path, with the line from the milestone above into its mark and on from under it. A done
 * milestone folded to its name draws as its fold.
 */
function milestoneBlock(
  m: MilestoneRow,
  lineAbove: PathLine,
  hasWork: boolean,
  isUnfolded: (id: string) => boolean,
): Block {
  const mark = markOf(m.mark, m.tone, false)
  const path: PathSide = { is: 'milestone', above: lineAbove, below: m.line }
  const tree = hasWork && m.line === null ? { tree: [{ depth: 0, is: 'down' as const }] } : {}
  if (m.foldId !== null)
    return {
      kind: 'fold',
      id: m.id,
      depth: 0,
      text: m.name,
      isOpen: isUnfolded(m.foldId),
      change: { toggleFold: m.foldId },
      mark,
      path,
      ...tree,
    }

  return {
    kind: 'status',
    id: m.id,
    depth: 0,
    mark,
    name: m.name,
    isBold: m.isChanged,
    isMuted: m.isMuted,
    stall: m.stall,
    ...(m.word === null ? {} : { word: m.word }),
    under: [m.text, m.was ? `${WAS_PREFIX}${m.was}` : null].filter(l => l !== null),
    buttons: keyButtons(m.id, milestoneKeyPlan(m)),
    path,
    ...tree,
  }
}

/** Where a milestone's work joint draws in the milestones' column: its arm, and the nesting connector running past. */
function jointStroke({ arm, beside }: WorkJoint): TreeStroke | null {
  if (arm === 'elbow') return { depth: 0, is: 'last' }
  if (beside === 'connector') return { depth: 0, is: arm === 'tee' ? 'mid' : 'past' }

  return arm === null ? null : { depth: 0, is: 'arm' }
}

/**
 * A block of a milestone's work, with the path's line beside it while the path runs on from the milestone, and its
 * joint with the milestones' column.
 */
function besidePath(b: Block, line: PathLine, joint: WorkJoint | undefined): Block {
  if (b.kind !== 'status' && b.kind !== 'fold' && b.kind !== 'note') return b
  const stroke = joint ? jointStroke(joint) : null

  return {
    ...b,
    ...(line === null ? {} : { path: { is: 'work', line } }),
    ...(stroke ? { tree: [stroke, ...(b.tree ?? [])] } : {}),
  }
}

const note = (id: string, text: string, tone: Tone): Extract<Block, { kind: 'note' }> => ({
  kind: 'note',
  id,
  text,
  tone,
  isHead: false,
  isAtEdge: false,
  isStrong: false,
  depth: 0,
})

/** A line of the page's head, at the panel's edge, with no padding above or below. */
const headNote = (id: string, text: string, tone: Tone): Block => ({
  ...note(id, text, tone),
  isHead: true,
  isAtEdge: true,
})

/** The head's title: the goal, or what the session is for. */
const headTitle = (id: string, text: string): Block => ({
  ...note(id, text, null),
  isHead: true,
  isAtEdge: true,
  isStrong: true,
})

/** What the Status page draws besides the shared page: the done folds the person opened, and the goal's open field. */
type StatusUi = { isUnfolded: (id: string) => boolean; goalField: Field | null }

/**
 * The goal's section: its heading with the goal's buttons, its text and the lines under it, then each milestone on the
 * path and its work, with the Later rule before the first milestone that waits under it.
 */
function goalBlocks(page: StatusPage, { isUnfolded, goalField }: StatusUi): Block[] {
  const g = page.goal
  const heading: Block = {
    kind: 'heading',
    id: 'goal heading',
    text: g?.label ?? GOAL_HEADING,
    count: null,
    mark: g?.mark ? { text: g.mark.mark, tone: 'success', isRunning: false } : null,
    buttons: keyButtons(GOAL_KEYS_ID, goalKeyPlan(page)),
    isLabel: true,
  }
  const field: Block[] = goalField
    ? [{ kind: 'field', id: 'goal field', field: goalField, isAtEdge: g?.mark == null }]
    : []
  if (g === null) return [heading, ...(goalField ? field : [headNote('goal text', NO_GOAL_TEXT, 'muted')])]
  /** A met goal's lines start at the text column, under its heading's label. */
  const atText = (b: Block): Block => (g.mark && b.kind === 'note' ? { ...b, isAtEdge: false } : b)
  const lines = goalField
    ? field
    : [
        headTitle('goal text', g.text),
        ...(g.was ? [headNote('goal was', `${WAS_PREFIX}${g.was}`, 'muted')] : []),
        ...(g.now ? [headNote('goal now', g.now, 'muted')] : []),
        ...(g.awaiting ? [headNote('goal awaiting', g.awaiting, 'muted')] : []),
      ].map(atText)
  const fold = g.milestonesFold
  const foldLine: Block[] = fold
    ? [
        {
          kind: 'fold',
          id: fold.id,
          depth: 0,
          text: fold.text,
          isOpen: isUnfolded(fold.id),
          change: { toggleFold: fold.id },
          isLabelFirst: true,
        },
      ]
    : []
  const shown = shownMilestones(g, isUnfolded)
  const milestones = shown.flatMap((m, n): Block[] => {
    const rows = milestoneRows(m, isUnfolded)
    const joints = workJoints(rows, m.line)

    return [
      ...(isSpacedAbove(shown, n, isUnfolded)
        ? [{ kind: 'gap', id: `gap ${m.id}`, ...(n > 0 ? { isMilestoneStep: true as const } : {}) } as const]
        : []),
      ...(m.startsLater ? [{ kind: 'rule', id: 'goal later', text: LATER_TEXT } as const] : []),
      milestoneBlock(m, shown[n - 1]?.line ?? null, rows.length > 0, isUnfolded),
      ...rows.flatMap((r, k) => rowBlocks(r, isUnfolded).map(b => besidePath(b, m.line, joints[k]))),
    ]
  })

  return [heading, ...lines, ...foldLine, ...milestones]
}

/** The Status page as the look draws it, in the shared page's order. */
export function statusBlocks(view: SessionView, ui: StatusUi): Block[] {
  const page = view.statusPage
  const { isUnfolded } = ui
  const empty = emptyTab(view, { tab: 'overview', isGoalFieldOpen: ui.goalField !== null })
  if (empty) {
    const setGoal = empty.under?.is === 'set-goal' ? empty.under : null
    const parts = setGoal && {
      id: GOAL_KEYS_ID,
      text: null,
      buttons: setGoal.isFieldOpen ? [] : keyButtons(GOAL_KEYS_ID, setGoal.keys),
      feedback: null,
      field: setGoal.isFieldOpen ? ui.goalField : null,
    }

    return [emptyBlock('overview', empty, parts)]
  }
  const description = page.head?.description
  const head =
    page.isHeadApart && page.head
      ? [
          headTitle('head title', page.head.title),
          ...(description ? [headNote('head text', description, 'muted')] : []),
        ]
      : []
  const top = [...goalBlocks(page, ui), ...(head.length > 0 ? [{ kind: 'gap', id: 'gap head' } as const, ...head] : [])]
  const rows = unfoldedRows(page.rows, isUnfolded).flatMap(r => rowBlocks(r, isUnfolded))

  const isGapNeeded = rows.length > 0 && page.rows[0]?.kind !== 'part'

  return isGapNeeded ? [...top, { kind: 'gap', id: 'gap rows' }, ...rows] : [...top, ...rows]
}
