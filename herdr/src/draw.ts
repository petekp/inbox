import type { FoldKind } from '../../types'
import type { RowPress } from '../../core/domain/presses'
import type { ResultMark, RowView } from '../../core/view/rows'
import { closedLineView } from '../../core/view/closed-line'
import type { ClosedLineView } from '../../core/view/closed-line'
import {
  NEEDS_YOU_GROUPS,
  ROW_COPY,
  actionLabel,
  fieldExit,
  replyHint,
  closedShown,
  closedTotal,
  earlierLabel,
  foldLabel,
  isWaitingRow,
  rowMark,
  rowTitle,
  settledLabel,
  closedTitleTone,
  settledTone,
  shortAgo,
  waitingCount,
} from '../../core/view/rows'
import { rowKeyPlan } from '../../core/view/action-plan'
import type { RowWait } from '../../core/view/action-plan'
import { localEffects } from '../../core/domain/help-steps'
import { groupEmptyText, tabBarBanners } from '../../core/view/banners'
import type { BannerView } from '../../core/view/banners'
import { emptyTab } from '../../core/view/empty-tab'
import { feedbackTone, rowAgeAt, rowFeedbackText, stoppedWarningOf } from '../../core/view/feedback'
import { FINDING_GROUPS } from '../../core/view/help'
import { earlierLineText } from '../../core/domain/earlier-answers'
import type { SessionView } from '../../core/view/session-view'
import { shownTabs, tabBadge } from '../../core/view/tabs'
import type { ShownTab } from '../../core/view/tabs'
import { SETTLED_MS, isDrawnInPlace } from '../../core/view/timing'
import { footerError } from '../../core/view/view'
import type { PressKind } from '../../types'
import { button, emptyBlock, sessionButtons } from './blocks'
import { HOLD_MS } from './block-glide'
import { undoPlaceEndsAt } from '../../core/view/ui-controller-clock'
import type { Block, BodyLine, Button, Does, Field, Mark, RowBlock } from './blocks'
import { prTabBlocks } from './draw-prs'
import { prRowWaits } from '../../core/view/pr-rows'
import { openPrViews } from '../../core/view/pr-views'
import { statusBlocks } from './draw-status'
import { GOAL_KEYS_ID, goalSubmitLabel } from '../../core/view/status-keys'

/** The look's name for its texts, which follow the desktop look's words, not the terminal's. */
const LOOK = 'herdr'

/**
 * What the drawing reads of the look's state: the tab, the row its cursor is on, what the person unfolded, and the row
 * whose field is open, or `GOAL_KEYS_ID` for the goal's.
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

/** What one draw of a session shows, from its published file. */
export type LookScreen = {
  view: SessionView
  agent: string
  now: number
  shownSince: number
  /** Whether the host could not find gh, which the session's PR state records and the shared view leaves out. */
  isGhMissing: boolean
  /** Whether the host has a PR fetch running, from the published file. */
  isFetchingPrs: boolean
  /** Whether Claude Code holds the inbox's messages after the person stopped the session, from the published file. */
  isSendHeld: boolean
}

const markOf = (m: ResultMark | null): Mark | null =>
  m ? { text: m.text, tone: m.tone ?? 'muted', isRunning: m.isRunning } : null

/** What a row's press does. A Local step lists its opens and copies, which the look runs itself. */
function rowDoes(row: RowView, press: RowPress, kind: PressKind, agent: string): Does {
  if (press.action === 'type') return { is: 'type', rowId: row.id, text: '', hint: replyHint(row, agent) }
  if (press.action === 'discard') return { is: 'leave', rowId: row.id, isDiscard: true }
  const effects = kind === 'local' ? localEffects(row, press) : []

  return { is: 'press', press, effects, kind }
}

/** The row's buttons in the plan's order: its options, which the tree draws, then its keys, then its follow-ups. */
function rowButtons(row: RowView, isAllShown: boolean, agent: string): Button[] {
  const { options, keys, more, sessionKey } = rowKeyPlan(row, isAllShown, true)
  const answers = options.map((o, n): Button => ({
    ...button(
      `${row.id} ${n}`,
      actionLabel(o.action),
      o.action.emphasis,
      rowDoes(row, o.action.press, o.action.kind, agent),
      o.hotkey ?? null,
    ),
    isOut: o.action.isOut,
    isOption: true,
  }))

  return [
    ...answers,
    ...sessionButtons(row.id, sessionKey),
    ...[...keys, ...more].map((k, n): Button => {
      const id = `${row.id} ${options.length + n}`
      if (k.slot === 'allOptions')
        return button(id, k.label, k.emphasis, { is: 'view', change: { showOptions: row.id } })
      if (k.slot === 'retry') return button(id, k.label, k.emphasis, rowDoes(row, k.press, k.kind, agent))
      const { action } = k
      const does = rowDoes(row, action.press, action.kind, agent)

      return {
        ...button(id, actionLabel(action), action.emphasis, does, k.hotkey ?? null),
        isOut: action.isOut,
        ...(action.isFollowUp ? { isFollowUp: true as const } : {}),
      }
    }),
  ]
}

/**
 * A settled row's Undo, as the plan's `undo` action gives it while Undo lasts. The panel draws Undo on a line of its
 * own. Once Undo ends, the button keeps its place and its label, muted and taking no press, so the row neither changes
 * shape before it folds nor shows an empty line. A row whose message waits for the agent stays until the agent takes
 * it, so from `undoPlaceEndsAt` its spent Undo fades out while its place holds, then its place closes.
 */
function undoButtons(row: RowView, agent: string, now: number): Button[] {
  if (row.state.is !== 'settled') return []
  const id = `${row.id} undo`
  const runsOutAt = row.state.at + SETTLED_MS
  const undo = row.actions.find(a => a.press.action === 'undo')
  if (undo)
    return [
      {
        ...button(id, actionLabel(undo), undo.emphasis, rowDoes(row, undo.press, undo.kind, agent)),
        isOut: undo.isOut,
        runsOutAt,
      },
    ]

  if (!row.state.offersUndo) return []
  const leftAt = row.state.delivery === 'queued' ? undoPlaceEndsAt(row.state) : null
  if (leftAt !== null && now >= leftAt + HOLD_MS) return []
  const leaving = leftAt !== null && now >= leftAt ? { leftAt } : {}

  return [{ ...button(id, ROW_COPY.undo, 'quiet'), isSpent: true, ...leaving, runsOutAt }]
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

/** The kinds of the row's planned buttons, which say whether a press sends a message. */
function plannedKinds(row: RowView, isAllShown: boolean): { kind: PressKind }[] {
  const { options, keys, more } = rowKeyPlan(row, isAllShown, true)

  return [
    ...options.map(o => ({ kind: o.action.kind })),
    ...[...keys, ...more].flatMap(k =>
      'action' in k ? [{ kind: k.action.kind }] : 'kind' in k ? [{ kind: k.kind }] : [],
    ),
  ]
}

/** The row's lines under its title. */
function rowBody(row: RowView, isAllShown: boolean): BodyLine[] {
  const options = rowKeyPlan(row, isAllShown).options.map((o, n): BodyLine[] => [
    { part: 'answer', optionId: `${row.id} ${n}`, text: '', tone: 'muted' },
    ...(o.note ? [{ part: 'note' as const, text: o.note, tone: 'muted' as const, isOptionNote: true as const }] : []),
  ])
  const holdsUp: BodyLine[][] = row.holdsUpLine ? [[{ part: 'holdsUp', text: row.holdsUpLine, tone: 'muted' }]] : []
  const branches = [...holdsUp, ...options]
  const lastBranch = branches.length - 1
  const isTrunkAfterHoldsUp = options.length > 0
  const tree = (branch: number, line: number): BodyLine['tree'] =>
    line > 0 ? (branch === lastBranch ? undefined : 'trunk') : branch === lastBranch ? 'last' : 'tee'
  const branchLines = (branch: number): BodyLine[] =>
    (branches[branch] ?? []).map((l, line) => {
      const placed = tree(branch, line)

      return placed ? { ...l, tree: placed } : l
    })
  const contextTree = isTrunkAfterHoldsUp ? { tree: 'trunk' as const } : {}
  const lines: BodyLine[] = [
    ...holdsUp.flatMap((_, branch) => branchLines(branch)),
    { part: 'context', text: row.contextLine ?? '', tone: 'muted', ...contextTree },
    { part: 'earlier', text: row.earlierLine ? earlierLineText(row.earlierLine) : '', tone: 'muted', ...contextTree },
    { part: 'detail', text: row.detail ?? '', tone: null },
    { part: 'file', text: row.fileName ? `${ROW_COPY.relevantFile}${row.fileName}` : '', tone: 'muted' },
    ...options.flatMap((_, n) => branchLines(holdsUp.length + n)),
  ]

  return lines.filter(l => l.text || l.lead || l.optionId)
}

function sideBySideOf(row: RowView, isAllShown: boolean): Pick<RowBlock, 'sideBySide'> {
  const { options, answerRow } = rowKeyPlan(row, isAllShown)

  return answerRow
    ? { sideBySide: { optionIds: options.map((_, n) => `${row.id} ${n}`), recLine: answerRow.recLine } }
    : {}
}

/** How long ago the row's press was made, once it has an age, else how long ago the row arrived. A settled row draws none. */
function rowAge(row: RowView, now: number): string | null {
  if (row.state.is === 'settled') return null
  const at = rowAgeAt(row.feedback, row.at)

  return at === null ? null : shortAgo(now - at)
}

function rowBlock(row: RowView, ui: LookUi, selected: string | null, screen: LookScreen): RowBlock {
  const { state, feedback: f } = row
  const isSettled = state.is === 'settled'
  const isAllShown = ui.optionsShown.includes(row.id)
  const text = rowFeedbackText(row, LOOK)
  const isSelected = !isSettled && row.id === selected
  const isCollapsed = screen.view.collapsed.includes(row.id)
  const isOpen = isSelected && !isCollapsed
  const isTyping = ui.typing === row.id
  const warning = isOpen ? stoppedWarningOf(screen.isSendHeld, plannedKinds(row, isAllShown), text) : null

  return {
    kind: 'row',
    id: row.id,
    depth: 0,
    mark: markOf(rowMark(row)),
    title: rowTitle(row, LOOK),
    age: rowAge(row, screen.now),
    feedback: text && f ? { text, tone: feedbackTone(f), source: f } : null,
    settled: isSettled
      ? {
          label: settledLabel(state.label, state.delivery, state.reply),
          tone: settledTone(state),
          tint: closedTitleTone(state) === 'muted' ? null : closedTitleTone(state),
          at: state.at,
        }
      : null,
    isDim: isSettled,
    isSelectable: !isSettled,
    isSelected,
    ...(isCollapsed && { isCollapsed }),
    body: isOpen ? rowBody(row, isAllShown) : [],
    ...(isOpen ? sideBySideOf(row, isAllShown) : {}),
    buttons: isSettled
      ? [...rowButtons(row, isAllShown, screen.agent), ...undoButtons(row, screen.agent, screen.now)]
      : isOpen
        ? rowButtons(row, isAllShown, screen.agent).filter(b => !isTyping || b.isOption)
        : [],
    field: isOpen && isTyping ? fieldOf(row.id, fieldExit(row) === 'discard') : null,
    ...(warning && { warning }),
  }
}

type Group = { kind: FoldKind; title: string; mark: Mark | null; rows: RowView[]; closed: ClosedLineView[] }

function closedBlock(d: ClosedLineView, now: number): RowBlock {
  const { action, sessionKey } = d
  const closedDoes: Does = action ? { is: 'press', press: action.press, effects: [], kind: null } : { is: 'nothing' }

  return {
    kind: 'row',
    id: `closed ${d.id}`,
    depth: 1,
    mark: markOf(d.mark),
    title: d.title,
    age: shortAgo(now - d.at),
    feedback: { text: d.outcome, tone: 'muted', source: null },
    settled: null,
    isDim: true,
    isSelectable: false,
    isSelected: false,
    body: [],
    buttons: [
      ...sessionButtons(`closed ${d.id}`, sessionKey),
      ...(action ? [button(`closed ${d.id} 0`, action.label, 'quiet', closedDoes)] : []),
    ],
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
      isLabel: false,
    },
    ...g.rows.map(r => rowBlock(r, ui, selected, screen)),
  ]
  if (g.rows.length === 0)
    out.push({
      kind: 'note',
      id: `empty ${g.kind}`,
      text: groupEmptyText(g.title),
      tone: 'muted',
      isHead: false,
      isAtEdge: false,
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
      mark: { text: g.mark.mark, tone: g.mark.tone, isRunning: false },
      rows: view.needsYou[g.list].filter(r => isDrawnInPlace(r, shownSince)),
      closed: view.needsYou.closed[g.list].map(d => closedLineView(d, true)),
    }))

  return (Object.keys(FINDING_GROUPS) as (keyof typeof FINDING_GROUPS)[]).map(kind => ({
    kind,
    title: FINDING_GROUPS[kind].title,
    mark: { text: FINDING_GROUPS[kind].mark, tone: FINDING_GROUPS[kind].tone, isRunning: false },
    rows: view.findings.rows.filter(r => r.finding?.kind === kind && isDrawnInPlace(r, shownSince)),
    closed: view.findings.closed.filter(f => f.kind === kind).map(f => closedLineView(f, true)),
  }))
}

const waitsOf = (groups: Group[], collapsed: string[]): RowWait[] =>
  groups
    .flatMap(g => g.rows)
    .map(r => ({ id: r.id, isWaiting: isWaitingRow(r), isCollapsed: collapsed.includes(r.id) }))

/** The rows a tab lists, in order, whether each waits on the person, and whether the person collapsed it. */
export function rowWaits({ view, shownSince }: LookScreen, tab: ShownTab): RowWait[] {
  if (tab === 'prs') return prRowWaits(openPrViews(view.prs.drawn), view.lastActions, view.collapsed)

  return tab === 'overview' ? [] : waitsOf(groupsOf(view, tab, shownSince), view.collapsed)
}

function rowTabBlocks(screen: LookScreen, ui: LookUi, tab: 'needsYou' | 'findings'): Block[] {
  const groups = groupsOf(screen.view, tab, screen.shownSince)
  const empty = emptyTab(screen.view, {
    tab,
    agent: screen.agent,
    drawn: groups.filter(g => g.rows.length > 0 || g.closed.length > 0).length,
    hasBlocker: false,
  })
  if (empty) return [emptyBlock(tab, empty)]

  return groups.flatMap((g, n): Block[] => [
    ...(n > 0 ? [{ kind: 'rule', id: `rule ${g.kind}`, text: null } as const] : []),
    ...groupBlocks(g, ui, ui.selected, screen),
  ])
}

export type TabCell = { id: ShownTab; label: string; badge: string | null; isSelected: boolean }

export function tabCells(screen: Pick<LookScreen, 'view'>, tab: ShownTab): TabCell[] {
  const { view } = screen
  const counts = { needsYou: view.needsYou.count, findings: view.findings.count, prs: view.prs.count }

  return shownTabs().map(t => ({
    id: t.id,
    label: t.label,
    badge: tabBadge(t.id, counts),
    isSelected: t.id === tab,
  }))
}

/** The banners under the tabs, as every look draws them. */
export function chrome(screen: LookScreen, tab: ShownTab): { banners: BannerView[] } {
  const error = footerError(tab, screen.view.status, screen.view.statusPage)

  return { banners: tabBarBanners([], error, null) }
}

export function tabBlocks(screen: LookScreen, ui: LookUi): Block[] {
  if (ui.tab === 'overview') {
    const goalField =
      ui.typing === GOAL_KEYS_ID ? fieldOf(GOAL_KEYS_ID, false, goalSubmitLabel(screen.view.statusPage)) : null
    return statusBlocks(screen.view, {
      isUnfolded: id => ui.statusUnfolded.includes(id),
      isCollapsed: id => screen.view.collapsed.includes(id),
      goalField,
    })
  }
  if (ui.tab === 'prs') return prTabBlocks(screen, ui.selected)

  return rowTabBlocks(screen, ui, ui.tab)
}
