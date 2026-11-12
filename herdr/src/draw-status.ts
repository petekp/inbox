import type { StatusTone } from '../../hooks/help'
import { goalKeyPlan, milestoneKeyPlan, statusKeyPlan, GOAL_FIELD, GOAL_KEYS_ID } from '../../hooks/status-keys'
import type { StatusKey } from '../../hooks/status-keys'
import { GOAL_HEADING, NO_GOAL_TEXT } from '../../hooks/status-goal-page'
import type { MilestoneRow } from '../../hooks/status-goal-page'
import { STALL_GAP, WAS_PREFIX, mergedLine } from '../../hooks/status-page'
import type { StatusPage, StatusRow } from '../../hooks/status-page'
import { unfoldedRows } from '../../hooks/status-page-parts'
import { cellWidth } from '../../hooks/text'
import { button } from './blocks'
import type { Block, Button, Does, Field, Mark, Tone } from './blocks'

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
  const rule: Block[] = row.isRuledAbove
    ? [{ kind: 'rule', id: `rule ${row.id}`, text: null, isDashed: false, depth: row.depth, isBetweenGroups: false }]
    : []
  if (row.kind === 'subject') {
    const under = [
      row.text,
      row.merged ? mergedLine(row.merged, t => cellWidth(t) <= MERGED_CELLS) : null,
      row.was ? `${WAS_PREFIX}${row.was}` : null,
    ].filter(l => l !== null)

    return [
      ...rule,
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
      },
    ]
  }
  if (row.kind === 'child')
    return [
      ...rule,
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
      },
    ]
  if (row.kind === 'more') return [{ ...note(row.id, row.text, 'muted'), depth: row.depth }]
  if (row.kind === 'look')
    return [{ kind: 'rule', id: row.id, text: row.text, isDashed: true, depth: row.depth, isBetweenGroups: false }]
  if (row.kind === 'part')
    return [
      { kind: 'gap', id: `gap ${row.id}` },
      { kind: 'rule', id: row.id, text: row.text, isDashed: false, depth: 0, isBetweenGroups: false },
    ]
  if (row.kind === 'counts')
    return [
      ...rule,
      { ...note(row.id, row.counts.map(c => `${c.mark} ${c.text}`).join(STALL_GAP), 'muted'), depth: row.depth },
    ]
  if (row.kind === 'done-fold')
    return [
      ...rule,
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
    ...rule,
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

function milestoneBlock(m: MilestoneRow): Block {
  return {
    kind: 'status',
    id: m.id,
    depth: 0,
    mark: markOf(m.mark, m.tone, false),
    name: m.name,
    isBold: m.isChanged,
    isMuted: false,
    stall: m.stall,
    under: [m.text, m.was ? `${WAS_PREFIX}${m.was}` : null].filter(l => l !== null),
    buttons: keyButtons(m.id, milestoneKeyPlan(m)),
  }
}

const note = (id: string, text: string, tone: Tone): Extract<Block, { kind: 'note' }> => ({
  kind: 'note',
  id,
  text,
  count: null,
  tone,
  isHead: false,
  isStrong: false,
  depth: 0,
})

/** A line of the page's head, which starts where the marks start. */
const headNote = (id: string, text: string, tone: Tone): Block => ({ ...note(id, text, tone), isHead: true })

/** The head's title: the goal, or what the session is for, with the goal's count after it. */
const headTitle = (id: string, text: string, count: string | null): Block => ({
  ...note(id, text, null),
  count,
  isHead: true,
  isStrong: true,
})

/** What the Status page draws besides the shared page: the done folds the person opened, and the goal's open field. */
type StatusUi = { isUnfolded: (id: string) => boolean; goalField: Field | null }

/** The goal's section: its heading with the goal's buttons, its text and the lines under it, then each milestone and its work. */
function goalBlocks(page: StatusPage, { isUnfolded, goalField }: StatusUi): Block[] {
  const g = page.goal
  const heading: Block = {
    kind: 'heading',
    id: 'goal heading',
    depth: 0,
    text: g?.label ?? GOAL_HEADING,
    count: null,
    mark: null,
    buttons: keyButtons(GOAL_KEYS_ID, goalKeyPlan(page)),
    isLabel: true,
  }
  const field: Block[] = goalField ? [{ kind: 'field', id: 'goal field', field: goalField }] : []
  if (g === null) return [heading, ...(goalField ? field : [headNote('goal text', NO_GOAL_TEXT, 'muted')])]
  const lines = goalField
    ? field
    : [
        headTitle('goal text', g.text, g.count === null ? null : `${STALL_GAP}${g.count}`),
        ...(g.was ? [headNote('goal was', `${WAS_PREFIX}${g.was}`, 'muted')] : []),
        ...(g.now ? [headNote('goal now', g.now, 'muted')] : []),
        ...(g.awaiting ? [headNote('goal awaiting', g.awaiting, 'muted')] : []),
      ]
  const milestones = g.milestones.flatMap((m): Block[] => [
    { kind: 'gap', id: `gap ${m.id}` },
    milestoneBlock(m),
    ...unfoldedRows(m.rows, isUnfolded).flatMap(r => rowBlocks(r, isUnfolded)),
  ])

  return [heading, ...lines, ...milestones]
}

/** The Status page as the look draws it, in the shared page's order. */
export function statusBlocks(page: StatusPage, ui: StatusUi): Block[] {
  const { isUnfolded } = ui
  if (page.isEmpty && ui.goalField === null)
    return [
      {
        kind: 'empty',
        id: 'empty overview',
        title: page.empty.title,
        hint: page.empty.hint,
        buttons: keyButtons(GOAL_KEYS_ID, goalKeyPlan(page)),
      },
    ]
  const description = page.head?.description
  const head =
    page.goal === null && page.head
      ? [
          headTitle('head title', page.head.title, null),
          ...(description ? [headNote('head text', description, 'muted')] : []),
        ]
      : []
  const top = [...goalBlocks(page, ui), ...(head.length > 0 ? [{ kind: 'gap', id: 'gap head' } as const, ...head] : [])]
  const rows = unfoldedRows(page.rows, isUnfolded).flatMap(r => rowBlocks(r, isUnfolded))

  return rows.length > 0 ? [...top, { kind: 'gap', id: 'gap rows' }, ...rows] : top
}
