import type { Closed, FoldKind } from '../../types'
import type { RowPress } from '../../hooks/presses'
import type { ClosedDelivery, ResultMark, RowView } from '../../hooks/rows'
import {
  NEEDS_YOU_GROUPS,
  ROW_COPY,
  actionLabel,
  fieldExit,
  replyHint,
  closedLineAction,
  closedShown,
  closedTotal,
  earlierLabel,
  foldLabel,
  isWaitingRow,
  rowResultMark,
  rowTitle,
  settledLabel,
  settledTone,
  shortAgo,
  shownOptionDescriptions,
  waitingCount,
} from '../../hooks/rows'
import { firstWaiting, rowKeyPlan } from '../../hooks/action-plan'
import { stepEffects } from '../../hooks/help-steps'
import { emptyText, groupEmptyText, tabBarBanners } from '../../hooks/banners'
import type { BannerView } from '../../hooks/banners'
import { isMaybeStale } from '../../hooks/band'
import { isFailure, rowFeedbackText } from '../../hooks/feedback'
import type { Feedback } from '../../hooks/feedback'
import { FINDING_GROUPS } from '../../hooks/help'
import type { SessionView } from '../../hooks/session-view'
import { shownTabs, tabBadge } from '../../hooks/tabs'
import type { ShownTab } from '../../hooks/tabs'
import { isDrawnInPlace } from '../../hooks/timing'
import { footerStatus } from '../../hooks/view'
import type { PressKind } from '../../types'
import { button } from './blocks'
import type { Block, Button, Does, Field, Mark, RowBlock, Tone } from './blocks'
import { prTabBlocks } from './draw-prs'
import { statusBlocks } from './draw-status'
import { GOAL_FIELD, GOAL_KEYS_ID } from '../../hooks/status-keys'

/** The look's name for its texts, which follow the desktop look's words, not the terminal's. */
const LOOK = 'herdr'

/**
 * What the look keeps between draws: the tab, the row the person opened, what they unfolded, and the row whose
 * field is open, or `GOAL_KEYS_ID` for the goal's.
 */
export type LookUi = {
  tab: ShownTab
  selected: string | null
  unfolded: FoldKind[]
  closedAll: FoldKind[]
  optionsShown: string[]
  statusUnfolded: string[]
  typing: string | null
}

export const freshUi = (tab: ShownTab): LookUi => ({
  tab,
  selected: null,
  unfolded: [],
  closedAll: [],
  optionsShown: [],
  statusUnfolded: [],
  typing: null,
})

/** What one draw of a session shows, from its published file. */
export type LookScreen = {
  view: SessionView
  agent: string
  now: number
  shownSince: number
  isNextBuild: boolean
  /** Whether the host could not find gh, which the session's PR state records and the shared view leaves out. */
  isGhMissing: boolean
}

const toneOfFeedback = (f: Feedback): Tone =>
  isFailure(f) ? 'error' : f.is === 'done' || (f.is === 'local' && f.result.state === 'done') ? 'done' : 'muted'

const markOf = (m: ResultMark | null): Mark | null =>
  m ? { text: m.text, tone: m.isRunning ? 'running' : (m.tone ?? 'muted'), isRunning: m.isRunning } : null

/** What a row's press does. A Local step lists its opens and copies, which the look runs itself. */
function rowDoes(row: RowView, press: RowPress, kind: PressKind, agent: string): Does {
  if (press.action === 'type') return { is: 'type', rowId: row.id, text: '', hint: replyHint(row, agent) }
  if (press.action === 'discard') return { is: 'leave', rowId: row.id, isDiscard: true }
  const step = press.action === 'step' ? row.steps[press.step] : undefined
  const effects = kind === 'local' && row.item && step ? stepEffects(row.item, step) : []

  return { is: 'press', press, effects }
}

/** The row's buttons in the plan's order: its keys, then its follow-ups. */
function rowButtons(row: RowView, isAllShown: boolean, agent: string): Button[] {
  const { keys, more } = rowKeyPlan(row, isAllShown)

  return [...keys, ...more].map((k, n): Button => {
    const id = `${row.id} ${n}`
    if (k.slot === 'allOptions') return button(id, k.label, k.emphasis, { is: 'view', change: { showOptions: row.id } })
    if (k.slot === 'retry') return button(id, k.label, k.emphasis, rowDoes(row, k.press, k.kind, agent))
    const { action } = k
    const does = rowDoes(row, action.press, action.kind, agent)

    return { ...button(id, actionLabel(action), action.emphasis, does, k.hotkey ?? null), isOut: action.isOut }
  })
}

/** An open field's buttons: Send, or the goal's Save, then Discard for a held reply or Cancel. */
function fieldOf(rowId: string, isDiscard: boolean, send: string = ROW_COPY.send): Field {
  const leave = isDiscard ? ROW_COPY.discard : ROW_COPY.cancel

  return {
    rowId,
    buttons: [
      button(`${rowId} send`, send, 'primary', { is: 'send', rowId }),
      button(`${rowId} leave`, leave, 'quiet', { is: 'leave', rowId, isDiscard }),
    ],
  }
}

function rowBody(row: RowView, isAllShown: boolean, isNextBuild: boolean): RowBlock['body'] {
  const lines: { text: string | null; tone: Tone }[] = [
    { text: row.detail, tone: null },
    { text: row.fileName ? `${ROW_COPY.relevantFile}${row.fileName}` : null, tone: 'dim' },
    ...shownOptionDescriptions(row, isAllShown).map(o => ({ text: `${o.label}: ${o.description}`, tone: null })),
    { text: row.recLine, tone: 'muted' },
    { text: isNextBuild ? row.holdsUpLine : null, tone: 'needsYou' },
  ]

  return lines.flatMap(l => (l.text ? [{ text: l.text, tone: l.tone }] : []))
}

function rowBlock(row: RowView, ui: LookUi, selected: string | null, screen: LookScreen): RowBlock {
  const { state, feedback: f } = row
  const isSettled = state.is === 'settled'
  const isAllShown = ui.optionsShown.includes(row.id)
  const text = rowFeedbackText(row, LOOK)
  const isSelected = !isSettled && row.id === selected
  const isTyping = ui.typing === row.id

  return {
    kind: 'row',
    id: row.id,
    depth: 0,
    mark: markOf(rowResultMark(row)),
    title: rowTitle(row, LOOK),
    age: row.at === null ? null : shortAgo(screen.now - row.at),
    feedback: text && f ? { text, tone: toneOfFeedback(f) } : null,
    settled: isSettled
      ? { label: settledLabel(state.label, state.delivery, state.reply), tone: settledTone(state) }
      : null,
    isDim: isSettled,
    isSelectable: !isSettled,
    isSelected,
    body: isSelected ? rowBody(row, isAllShown, screen.isNextBuild) : [],
    buttons: isSettled || (isSelected && !isTyping) ? rowButtons(row, isAllShown, screen.agent) : [],
    field: isSelected && isTyping ? fieldOf(row.id, fieldExit(row) === 'discard') : null,
  }
}

type ClosedLine = {
  id: string
  how: Closed['how']
  title: string
  at: number
  outcomeLabel: string
  delivery: ClosedDelivery
  mark: ResultMark
}

type Group = { kind: FoldKind; title: string; mark: Mark | null; rows: RowView[]; closed: ClosedLine[] }

function closedBlock(d: ClosedLine, now: number): RowBlock {
  const action = closedLineAction(d)
  const closedDoes: Does = action ? { is: 'press', press: action.press, effects: [] } : { is: 'nothing' }

  return {
    kind: 'row',
    id: `closed ${d.id}`,
    depth: 1,
    mark: markOf(d.mark),
    title: d.title,
    age: shortAgo(now - d.at),
    feedback: { text: settledLabel(d.outcomeLabel, d.delivery), tone: 'muted' },
    settled: null,
    isDim: true,
    isSelectable: false,
    isSelected: false,
    body: [],
    buttons: action ? [button(`closed ${d.id} 0`, action.label, 'quiet', closedDoes)] : [],
    field: null,
  }
}

/** A group: its heading with the count that waits, its rows, then its Closed fold, open or shut. */
function groupBlocks(g: Group, ui: LookUi, selected: string | null, screen: LookScreen): Block[] {
  const settled = new Set(g.rows.filter(r => r.state.is === 'settled').map(r => r.id))
  const total = closedTotal(g.closed, settled)
  const count = waitingCount(g.rows)
  const out: Block[] = [
    {
      kind: 'heading',
      id: `group ${g.kind}`,
      text: g.title,
      count: count > 0 ? count : null,
      mark: g.mark,
      buttons: [],
    },
    ...g.rows.map(r => rowBlock(r, ui, selected, screen)),
  ]
  if (g.rows.length === 0)
    out.push({
      kind: 'note',
      id: `empty ${g.kind}`,
      text: groupEmptyText(g.title),
      tone: 'dim',
      isStrong: false,
      depth: 0,
    })
  if (total === 0) return out
  const isOpen = ui.unfolded.includes(g.kind)
  out.push({
    kind: 'fold',
    id: `fold ${g.kind}`,
    depth: 0,
    text: foldLabel(total),
    isOpen,
    change: { closedFold: g.kind },
  })
  if (!isOpen) return out
  const shown = closedShown(g.closed, settled, ui.closedAll.includes(g.kind))
  out.push(...shown.map(d => closedBlock(d, screen.now)))
  const earlier = earlierLabel(total, shown.length)
  if (earlier) out.push({ kind: 'more', id: `earlier ${g.kind}`, depth: 1, text: earlier, change: { earlier: g.kind } })

  return out
}

function groupsOf(view: SessionView, tab: 'needsYou' | 'findings', shownSince: number): Group[] {
  if (tab === 'needsYou')
    return NEEDS_YOU_GROUPS.map(g => ({
      kind: g.kind,
      title: g.title,
      mark: null,
      rows: view.needsYou[g.list].filter(r => isDrawnInPlace(r, shownSince)),
      closed: view.needsYou.closed[g.list].map(d => ({ ...d, title: d.ask })),
    }))

  return (Object.keys(FINDING_GROUPS) as (keyof typeof FINDING_GROUPS)[]).map(kind => ({
    kind,
    title: FINDING_GROUPS[kind].title,
    mark: { text: FINDING_GROUPS[kind].mark, tone: FINDING_GROUPS[kind].tone, isRunning: false },
    rows: view.findings.rows.filter(r => r.finding?.kind === kind && isDrawnInPlace(r, shownSince)),
    closed: view.findings.closed.filter(f => f.kind === kind).map(f => ({ ...f, at: f.closedAt })),
  }))
}

/** The row the look opens: the one the person selected while it still waits, else the first that waits. */
function selectedOf(groups: Group[], selected: string | null): string | null {
  const rows = groups.flatMap(g => g.rows).filter(isWaitingRow)
  if (selected !== null && rows.some(r => r.id === selected)) return selected

  return firstWaiting(rows.map(r => ({ id: r.id, isWaiting: true })))
}

function rowTabBlocks(screen: LookScreen, ui: LookUi, tab: 'needsYou' | 'findings'): Block[] {
  const groups = groupsOf(screen.view, tab, screen.shownSince)
  const isEmpty = groups.every(g => g.rows.length === 0 && g.closed.length === 0)
  if (isEmpty) {
    const empty = emptyText(tab, screen.agent, isMaybeStale(screen.view))
    return [
      { kind: 'note', id: 'empty title', text: empty.title, tone: null, isStrong: true, depth: 0 },
      { kind: 'note', id: 'empty hint', text: empty.hint, tone: 'muted', isStrong: false, depth: 0 },
    ]
  }
  const selected = selectedOf(groups, ui.selected)

  return groups.flatMap(g => groupBlocks(g, ui, selected, screen))
}

export type TabCell = { id: ShownTab; label: string; badge: string | null; isSelected: boolean }

export function tabCells(screen: Pick<LookScreen, 'view' | 'isNextBuild'>, tab: ShownTab): TabCell[] {
  const { view } = screen
  const counts = { needsYou: view.needsYou.count, findings: view.findings.count, prs: view.prs.count }

  return shownTabs(screen.isNextBuild).map(t => ({
    id: t.id,
    label: t.label,
    badge: tabBadge(t.id, counts),
    isSelected: t.id === tab,
  }))
}

/** The banners under the tabs and the status line at the foot, as every look draws them. */
export function chrome(screen: LookScreen, tab: ShownTab): { banners: BannerView[]; status: string | null } {
  const status = footerStatus(
    tab,
    screen.view.status,
    { isFetching: false, hasPrs: screen.view.prs.drawn.length > 0 },
    screen.view.statusPage.error,
  )

  return { banners: tabBarBanners([], status.error, null), status: status.text }
}

export function tabBlocks(screen: LookScreen, ui: LookUi): Block[] {
  if (ui.tab === 'overview') {
    const goalField = ui.typing === GOAL_KEYS_ID ? fieldOf(GOAL_KEYS_ID, false, GOAL_FIELD.submit) : null
    return statusBlocks(screen.view.statusPage, { isUnfolded: id => ui.statusUnfolded.includes(id), goalField })
  }
  if (ui.tab === 'prs') return prTabBlocks(screen, ui.selected)

  return rowTabBlocks(screen, ui, ui.tab)
}
