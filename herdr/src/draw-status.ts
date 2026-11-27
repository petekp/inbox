import type { StatusTone } from '../../core/view/help'
import { goalKeyGroups, milestoneKeyPlan, statusKeyPlan, GOAL_FIELD, GOAL_KEYS_ID } from '../../core/view/status-keys'
import type { StatusKey } from '../../core/view/status-keys'
import { GOAL_HEADING, NO_GOAL_TEXT, shownMilestones, suggestedGoalOffer } from '../../core/view/status-goal-page'
import type { MilestoneRow } from '../../core/view/status-goal-page'
import { WAS_PREFIX } from '../../core/view/status-page'
import { foldLevelOf, mergedLine, nameLevelOf, textLevelOf, WAS_LEVEL } from '../../core/view/status-page-parts'
import type { StatusPage, StatusRow } from '../../core/view/status-page'
import {
  COUNTS_LABEL,
  countsText,
  hasTreeDown,
  isParentCollapsed,
  milestoneRows,
  unfoldedRows,
} from '../../core/view/status-folds'
import { statusGaps } from '../../core/view/status-gaps'
import { LATER_TEXT, isSpacedAbove, workJoints } from '../../core/view/status-path'
import type { PathLine, WorkJoint } from '../../core/view/status-path'
import { cellWidth } from '../../core/domain/text'
import { button, emptyBlock } from './blocks'
import { emptyTab } from '../../core/view/empty-tab'
import type { SessionView } from '../../core/view/session-view'
import type { IsCollapsed } from '../../core/view/status-folds'
import type { Block, Button, Does, Field, Mark, PathSide, StatusLine, Tone, TreeStroke } from './blocks'

/** The most cells a merged line holds before it cuts its names: three lines of the pane at its usual width. */
const MERGED_CELLS = 150

const toneOf = (t: StatusTone): Tone => t ?? 'muted'

const markOf = (mark: string, tone: StatusTone, isRunning: boolean): Mark => ({
  text: mark,
  tone: toneOf(tone),
  isRunning,
})

function doesOf(k: StatusKey): Does {
  const p = k.press
  if (p.action === 'show-ask') return { is: 'view', change: { showAsk: p.askId } }
  if (p.action === 'toggle-fold') return { is: 'view', change: { toggleFold: p.foldId } }
  if (p.action === 'toggle-collapse') return { is: 'nothing' }
  if (p.action === 'type-goal') return { is: 'type', rowId: GOAL_KEYS_ID, text: p.text, hint: GOAL_FIELD.placeholder }

  return { is: 'press', press: { action: p.action, id: GOAL_KEYS_ID }, effects: [], kind: k.kind }
}

/** The buttons of a Status target, in its plan's order. The Status page selects no row, so its keys press nothing. */
function keyButtons(id: string, keys: StatusKey[], from = 0): Button[] {
  return keys.map((k, n) => button(`${id} ${from + n}`, k.label, k.emphasis, doesOf(k)))
}

/** A parent's fold, drawn after its name and stall. Null for a row with nothing under it. */
function foldOf(
  p: { id: string; foldCount: number; mark: string },
  isCollapsed: IsCollapsed,
): Pick<Extract<Block, { kind: 'status' }>, 'fold'> {
  if (p.foldCount === 0) return {}
  const isFolded = isParentCollapsed(p, isCollapsed)
  const toggle = button(`${p.id} fold`, isFolded ? 'Unfold' : 'Fold', 'quiet', {
    is: 'collapse',
    id: p.id,
    isCollapsed: !isFolded,
  })

  return { fold: { isFolded, count: p.foldCount, level: foldLevelOf(p), toggle } }
}

type UnderLine = StatusLine['under'][number]

/** The lines under a Status name: where it stands at its level, then the merged line, muted, and the Prev line. */
function underLines(text: UnderLine | null, merged: string | null, was: string | null): UnderLine[] {
  const muted = (t: string | null): UnderLine[] => (t === null ? [] : [{ text: t, level: 'muted' }])

  return [
    ...(text ? [text] : []),
    ...muted(merged ? mergedLine(merged, t => cellWidth(t) <= MERGED_CELLS) : null),
    ...(was ? [{ text: `${WAS_PREFIX}${was}`, level: WAS_LEVEL }] : []),
  ]
}

function rowBlocks(row: StatusRow, isUnfolded: (id: string) => boolean, isCollapsed: IsCollapsed): Block[] {
  if (row.kind === 'subject') {
    const under = underLines(row.text ? { text: row.text, level: textLevelOf(row) } : null, row.merged, row.was)

    return [
      {
        kind: 'status',
        id: row.id,
        depth: row.depth,
        mark: markOf(row.mark, row.tone, row.isRunning),
        name: row.name,
        isBold: false,
        nameLevel: nameLevelOf(row, 'plain'),
        stall: row.stall,
        under,
        buttons: keyButtons(row.id, statusKeyPlan(row)),
        ...foldOf(row, isCollapsed),
        ...(hasTreeDown(row, isCollapsed) ? { tree: [{ depth: row.depth, is: 'down' as const }] } : {}),
      },
    ]
  }
  if (row.kind === 'ask')
    return [
      {
        kind: 'status',
        id: row.id,
        depth: row.depth,
        mark: markOf(row.mark, row.tone, false),
        name: row.text,
        isBold: false,
        nameLevel: 'plain',
        nameTone: row.tone,
        stall: null,
        under: [],
        buttons: keyButtons(row.id, statusKeyPlan(row)),
        ...(row.branch ? { tree: [{ depth: row.depth - 1, is: row.branch }] } : {}),
      },
    ]
  if (row.kind === 'child')
    return [
      {
        kind: 'status',
        id: row.id,
        depth: row.depth,
        mark: markOf(row.mark, row.tone, row.isRunning),
        name: row.name,
        isBold: false,
        nameLevel: nameLevelOf(row, 'muted'),
        stall: null,
        under: underLines(row.text ? { text: row.text, level: textLevelOf(row) } : null, null, null),
        buttons: [],
        ...(row.branch ? { tree: [{ depth: row.depth - 1, is: row.branch }] } : {}),
      },
    ]
  if (row.kind === 'more')
    return [
      {
        ...note(row.id, row.text, 'muted'),
        depth: row.depth,
        ...(row.branch ? { tree: [{ depth: row.depth - 1, is: row.branch }] } : {}),
      },
    ]
  if (row.kind === 'part')
    return [
      { kind: 'gap', id: `gap ${row.id}` },
      { kind: 'rule', id: row.id, text: row.text, ...(row.isTitle && row.text ? { isTitle: true as const } : {}) },
      ...(row.description ? [{ ...note(`${row.id} description`, row.description, 'muted'), isAtEdge: true }] : []),
    ]
  if (row.kind === 'done-fold' || row.kind === 'counts')
    return [
      {
        kind: 'fold',
        id: row.id,
        depth: row.depth,
        text: row.kind === 'counts' ? countsText(row.counts) : row.text,
        ...(row.kind === 'counts'
          ? {
              counts: {
                label: COUNTS_LABEL,
                items: row.counts.map(c => ({ mark: markOf(c.mark, c.tone, false), text: c.text })),
              },
            }
          : {}),
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
      nameLevel: nameLevelOf(row, 'muted'),
      stall: null,
      under: [],
      buttons: [],
    },
  ]
}

/** A Status row's first block with the space above it. A part's blocks never take one: `statusGaps` sets none there. */
const withGap = (b: Block, gap: number | null | undefined): Block =>
  gap != null && (b.kind === 'status' || b.kind === 'note' || b.kind === 'fold') ? { ...b, gapAbove: gap } : b

/** Each row's blocks, the first carrying the space `statusGaps` sets above the row. */
function listBlocks(rows: StatusRow[], isUnfolded: (id: string) => boolean, isCollapsed: IsCollapsed): Block[][] {
  const gaps = statusGaps(rows)

  return rows.map((r, n) => rowBlocks(r, isUnfolded, isCollapsed).map((b, k) => (k === 0 ? withGap(b, gaps[n]) : b)))
}

/**
 * A milestone on the goal's path, with the line from the milestone above into its mark and on from under it. A done
 * milestone folded to its name draws as its fold. A subject drawn in its place adds what a subject's row draws.
 */
function milestoneBlock(
  m: MilestoneRow,
  lineAbove: PathLine,
  hasWork: boolean,
  isUnfolded: (id: string) => boolean,
  isCollapsed: IsCollapsed,
): Block {
  const x = m.subject
  const mark = markOf(m.mark, m.tone, x?.isRunning ?? false)
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
      level: textLevelOf(m),
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
    isBold: m.isBold,
    nameLevel: nameLevelOf(m, m.isMuted ? 'muted' : 'plain'),
    stall: x?.stall ?? null,
    under: underLines(m.text ? { text: m.text, level: textLevelOf(m) } : null, x?.merged ?? null, m.was),
    buttons: keyButtons(m.id, milestoneKeyPlan(m)),
    ...foldOf(m, isCollapsed),
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
const headNote = (id: string, text: string, tone: Tone): Extract<Block, { kind: 'note' }> => ({
  ...note(id, text, tone),
  isHead: true,
  isAtEdge: true,
})

/** The head's title: the goal, or what the session is for. */
const headTitle = (id: string, text: string): Extract<Block, { kind: 'note' }> => ({
  ...note(id, text, null),
  isHead: true,
  isAtEdge: true,
  isStrong: true,
})

/** What the Status page draws besides the shared page: the done folds the person opened, and the goal's open field. */
type StatusUi = {
  isUnfolded: (id: string) => boolean
  isCollapsed: IsCollapsed
  goalField: Field | null
}

/**
 * The goal's section: its heading with the goal's buttons, its text and the lines under it, then each milestone on the
 * path and its work, with the Later rule before the first milestone that waits under it.
 */
function goalBlocks(page: StatusPage, { isUnfolded, isCollapsed, goalField }: StatusUi): Block[] {
  const g = page.goal
  const groups = goalKeyGroups(page)
  const isSuggested = goalField === null && page.suggestedGoal !== null
  const heading: Block = {
    kind: 'heading',
    id: 'goal heading',
    text: g?.label ?? GOAL_HEADING,
    count: null,
    mark: g?.mark ? { text: g.mark.mark, tone: 'success', isRunning: false } : null,
    buttons: keyButtons(GOAL_KEYS_ID, groups.heading),
    isLabel: true,
  }
  const field: Block[] = goalField
    ? [{ kind: 'field', id: 'goal field', field: goalField, isAtEdge: g?.mark == null }]
    : []
  const suggestion: Block[] = [
    {
      ...headTitle('goal text', suggestedGoalOffer(page.suggestedGoal ?? '')),
      buttons: keyButtons(GOAL_KEYS_ID, groups.offer, groups.heading.length),
    },
  ]
  if (g === null) {
    const empty = isSuggested ? suggestion : [headNote('goal text', NO_GOAL_TEXT, 'muted')]
    return [heading, ...(goalField ? field : empty)]
  }
  /** A met goal's lines start at the text column, under its heading's label. */
  const atText = (b: Block): Block => (g.mark && b.kind === 'note' ? { ...b, isAtEdge: false } : b)
  const lines = goalField
    ? field
    : (isSuggested
        ? suggestion
        : [
            headTitle('goal text', g.text),
            ...(g.was ? [{ ...headNote('goal was', `${WAS_PREFIX}${g.was}`, 'muted'), level: WAS_LEVEL }] : []),
            ...(g.now ? [headNote('goal now', g.now, 'muted')] : []),
          ]
      ).map(atText)
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
        },
      ]
    : []
  const shown = shownMilestones(g, isUnfolded)
  const milestones = shown.flatMap((m, n): Block[] => {
    const rows = milestoneRows(m, isUnfolded, isCollapsed)
    const joints = workJoints(rows, m.line)

    return [
      ...(isSpacedAbove(shown, n, isUnfolded, isCollapsed)
        ? [{ kind: 'gap', id: `gap ${m.id}`, ...(n > 0 ? { isMilestoneStep: true as const } : {}) } as const]
        : []),
      ...(m.startsLater ? [{ kind: 'rule', id: 'goal later', text: LATER_TEXT } as const] : []),
      milestoneBlock(m, shown[n - 1]?.line ?? null, rows.length > 0, isUnfolded, isCollapsed),
      ...listBlocks(rows, isUnfolded, isCollapsed)
        .map((bs, k) => bs.map(b => besidePath(b, m.line, joints[k])))
        .flat(),
    ]
  })

  return [heading, ...lines, ...foldLine, ...milestones]
}

/** The Status page as the look draws it, in the shared page's order. */
export function statusBlocks(view: SessionView, ui: StatusUi): Block[] {
  const page = view.statusPage
  const { isUnfolded, isCollapsed } = ui
  const empty = emptyTab(view, { tab: 'overview', isGoalFieldOpen: ui.goalField !== null })
  if (empty) {
    const setGoal = empty.under?.is === 'set-goal' ? empty.under : null
    const parts = setGoal && {
      id: GOAL_KEYS_ID,
      text: setGoal.suggestion === null ? null : suggestedGoalOffer(setGoal.suggestion),
      buttons: setGoal.isFieldOpen
        ? []
        : [
            ...keyButtons(GOAL_KEYS_ID, setGoal.keys),
            ...keyButtons(GOAL_KEYS_ID, setGoal.offerKeys, setGoal.keys.length),
          ],
      feedback: null,
      field: setGoal.isFieldOpen ? ui.goalField : null,
    }

    return [emptyBlock('overview', empty, parts)]
  }
  const top = goalBlocks(page, ui)
  const rows = listBlocks(unfoldedRows(page.rows, isUnfolded, isCollapsed), isUnfolded, isCollapsed).flat()

  const isGapNeeded = rows.length > 0 && page.rows[0]?.kind !== 'part'

  return isGapNeeded ? [...top, { kind: 'gap', id: 'gap rows' }, ...rows] : [...top, ...rows]
}
