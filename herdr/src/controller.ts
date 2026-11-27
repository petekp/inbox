import type { RowWait } from '../../core/view/action-plan'
import type { PrPress } from '../../core/view/pr-press'
import type { RowPress } from '../../core/domain/presses'
import { ROW_COPY } from '../../core/view/rows'
import { GOAL_KEYS_ID, goalSubmitLabel } from '../../core/view/status-keys'
import type { SessionView } from '../../core/view/session-view'
import { isRowTab } from '../../core/view/tabs'
import type { ShownTab } from '../../core/view/tabs'
import { PERSON_EVENTS, keptUiStates, reduceUi } from '../../core/view/ui-controller'
import { selectedOf } from '../../core/view/ui-controller-selection'
import type { HostFacts, InputKind, LookConfig, UiCommand, UiEvent, UiState } from '../../core/view/ui-controller-types'
import type { Block, Button, Does, ViewChange } from './blocks'
import type { LookUi } from './draw'
import type { ReadSession } from '../../core/remote/herdr-read'
import { rowSignature } from './out'
import type { Out } from './out'
import { foldClickOpens } from './fold-all'
import type { PressTarget } from './press-queue'

/** The Herdr look pulses running marks on the GPU, steps title tints, and times Undo from the session's close. */
export const HERDR_LOOK: LookConfig = { runningMarks: 'pulse', titleTint: 'steps', undoClock: 'session' }

type Applied = { ui: UiState; commands: UiCommand[]; nextWakeAt: number | null }

/** Runs `events` through the shared controller in order, each on the state the last one left. */
export function applyEvents(ui: UiState, view: SessionView, events: readonly UiEvent[], now: number): Applied {
  let applied: Applied = { ui, commands: [], nextWakeAt: null }
  for (const event of events) {
    const step = reduceUi(applied.ui, view, event, now)
    applied = { ui: step.ui, commands: [...applied.commands, ...step.commands], nextWakeAt: step.nextWakeAt }
  }

  return applied
}

/** What the published session says about its host. The look draws no stop, so nothing holds the Asks tab's place. */
export const hostFactsOf = (read: Extract<ReadSession, { is: 'read' }>): HostFacts => ({
  isFetchingPrs: read.isFetchingPrs,
  hasAsksBlocker: false,
  lastTypedMessageAt: read.session.presence.lastTypedMessageAt,
})

/** What the drawing reads of the controller's state: the shown tab, its cursor's row, folds and the open field. */
export const lookUiOf = (ui: UiState, view: SessionView | null): LookUi => ({
  tab: ui.tab,
  selected: view !== null && isRowTab(ui.tab) ? selectedOf(ui, view, ui.tab) : null,
  unfolded: ui.unfolded,
  closedAll: ui.closedAll,
  optionsShown: ui.optionsShown,
  statusUnfolded: ui.statusUnfolded,
  typing: ui.typing,
})

function changeEvents(c: ViewChange, ui: UiState, by: InputKind): UiEvent[] {
  if ('showOptions' in c) return [{ type: 'show-options', id: c.showOptions }]
  if ('closedFold' in c) return [{ type: 'fold', fold: c.closedFold, isOpen: !ui.unfolded.includes(c.closedFold) }]
  if ('earlier' in c) return [{ type: 'earlier', fold: c.earlier }]
  if ('toggleFold' in c)
    return [{ type: 'status-fold', id: c.toggleFold, isOpen: !ui.statusUnfolded.includes(c.toggleFold) }]
  if ('showAsk' in c) return [{ type: 'show-ask', id: c.showAsk, by }]

  return [{ type: 'show-help', isShown: !ui.isHelpShown }]
}

/**
 * The events a button's press sends. With `isAll`, a fold's button folds or opens every fold of the tab. A field opens
 * with its draft, or with the button's text when it has none, as the goal's Edit gives the goal.
 */
export function buttonEvents(d: Does, ui: UiState, by: InputKind, isAll = false): UiEvent[] {
  const opening = isAll ? foldClickOpens(d, ui) : null
  if (opening !== null) return [{ type: 'fold-all', isOpening: opening }]
  if (d.is === 'view') return changeEvents(d.change, ui, by)
  if (d.is === 'collapse') return [{ type: 'collapse', id: d.id, isCollapsed: d.isCollapsed }]
  if (d.is === 'press') return [{ type: 'press', press: d.press, by }]
  if (d.is === 'type') {
    const isSeeded = ui.drafts[d.rowId] === undefined && d.text !== ''
    return [{ type: 'open-field', id: d.rowId, ...(isSeeded ? { seed: d.text } : {}) }]
  }
  if (d.is === 'send') {
    const text = ui.drafts[d.rowId]?.text ?? ''
    return [{ type: 'press', press: { action: 'type', id: d.rowId, text }, by }]
  }
  if (d.is === 'leave') return [{ type: 'close-field', id: d.rowId, isDiscard: d.isDiscard }]

  return []
}

/**
 * A click on a row's title or on a shut row, or on every fold of the tab with `isAll`. On a row tab the shared title
 * press decides: it expands a collapsed row, opens another, and collapses the open one outside the press guard. The
 * Status page selects no row, so its parents only collapse or expand.
 */
export function titleClickEvents(ui: UiState, id: string, isCollapsed: boolean, isAll: boolean): UiEvent[] {
  if (isAll) return [{ type: 'fold-all', isOpening: !isCollapsed }]
  if (isRowTab(ui.tab)) return [{ type: 'title-press', id, by: 'click' }]

  return [{ type: 'collapse', id, isCollapsed }]
}

const isSamePress = (a: RowPress | PrPress, b: RowPress | PrPress) => JSON.stringify(a) === JSON.stringify(b)

const buttonsIn = (blocks: readonly Block[]): Button[] =>
  blocks.flatMap((b): Button[] =>
    'buttons' in b ? (b.buttons ?? []) : b.kind === 'empty' ? (b.under?.buttons ?? []) : [],
  )

/** The drawn button that makes `press`, for its label, kind and effects, as when the undo key presses a drawn Undo. */
export function buttonOf(blocks: readonly Block[], press: RowPress | PrPress): Button | null {
  return buttonsIn(blocks).find(b => b.does.is === 'press' && isSamePress(b.does.press, press)) ?? null
}

/**
 * What a press command sends through the queue: where to, and its label, kind and effects from the drawn button. A
 * reply's label is Send, or the goal's own. With no session, read or view there is no target, and the queue refuses it.
 */
export function pressSending(
  c: Extract<UiCommand, { kind: 'press' }>,
  b: Button | null,
  at: { appHome: string; sessionId: string | null; read: Extract<ReadSession, { is: 'read' }> | null },
  view: SessionView | null,
) {
  const { sessionId, read } = at
  const target: PressTarget | null =
    sessionId && read && view
      ? {
          appHome: at.appHome,
          sessionId,
          terminal: read.envelope.terminal,
          view,
          holds: c.holds,
          when: c.when,
          projectFolder: read.projectFolder,
        }
      : null
  const p = c.press
  const d = b?.does.is === 'press' ? b.does : null
  const isGoal = p.action === 'type' && p.id === GOAL_KEYS_ID
  const label =
    p.action !== 'type' ? (b?.label ?? '') : isGoal && view ? goalSubmitLabel(view.statusPage) : ROW_COPY.send
  const reply = p.action === 'type' && !isGoal ? p.text.trim() : undefined
  const options = { effects: d?.effects ?? [], label, kind: d?.kind ?? null, uiPressId: c.pressId }

  return { target, options: reply === undefined ? options : { ...options, reply } }
}

/**
 * Whether `e` is the person's own key or click in the look, which may give the keys to a field it opens. A pointer
 * moving over the list and typing are the person's too, but move nothing.
 */
export const isLookMove = (e: UiEvent): boolean =>
  PERSON_EVENTS.has(e.type) && e.type !== 'list-input' && e.type !== 'edit-draft'

/** The placeholder of each field the drawn buttons open, by row. */
export const fieldHints = (blocks: readonly Block[]): Record<string, string> =>
  Object.fromEntries(buttonsIn(blocks).flatMap(b => (b.does.is === 'type' ? [[b.does.rowId, b.does.hint]] : [])))

/** A session the look left: its controller state, and when the look last showed it. */
export type LeftSession = { ui: UiState; shownAt: number }

/**
 * The sessions whose state the look keeps: those holding a draft or a sent reply, the most recently shown first, and
 * those with a press still out, whose answer the state's press ids match.
 */
export function keptLeft(
  left: Record<string, LeftSession>,
  hasPressOut: (id: string) => boolean,
): Record<string, LeftSession> {
  const out = Object.entries(left).filter(([id]) => hasPressOut(id))

  return { ...keptUiStates(left, null), ...Object.fromEntries(out) }
}

/**
 * A press the look had out at a draw: its id, its row, the row as the look drew it when pressed, and whether the opens
 * and copies the look runs itself had ended.
 */
type DrawnOut = Pick<Out, 'pressId' | 'rowId' | 'before'> & { hasRun: boolean }

/**
 * What a draw showed: its tab, its rows, the presses out, and the last press the host's file named. Rows are null
 * when it showed no inbox, as while a session is read.
 */
export type LastDraw = { tab: ShownTab; rows: RowWait[] | null; outs: DrawnOut[]; lastPressId: string | null }

export const NO_DRAW: LastDraw = { tab: 'needsYou', rows: null, outs: [], lastPressId: null }

/** What a draw of the inbox shows of the presses: its tab and rows, the presses out, and the host's last press. */
export const drawOf = (tab: ShownTab, rows: RowWait[], outs: readonly Out[], read: ReadSession | null): LastDraw => ({
  tab,
  rows,
  outs: outs.map(o => ({ pressId: o.pressId, rowId: o.rowId, before: o.before, hasRun: o.result !== null })),
  lastPressId: (read?.is === 'read' && read.lastPress?.id) || null,
})

const waitsIn = (rows: RowWait[], id: string) => rows.some(r => r.id === id && r.isWaiting)

/**
 * Whether this draw shows the answer to a press the look had out at the last draw: the opens and copies the look ran
 * itself ended, the host's file names the press as its last for the first time, the press's row changed, or, on the
 * same tab, its row no longer waits. What the answer brings is then the person's, so it shows and glides at once.
 */
export function isAnswerDraw(last: LastDraw, now: LastDraw, view: SessionView | null): boolean {
  const hasRun = (o: DrawnOut) => !o.hasRun && now.outs.some(n => n.pressId === o.pressId && n.hasRun)
  const isNamed = (o: DrawnOut) => now.lastPressId === o.pressId && last.lastPressId !== o.pressId
  const isChanged = (o: DrawnOut) => view !== null && rowSignature(view, o.rowId) !== o.before
  if (last.outs.some(o => hasRun(o) || isNamed(o) || isChanged(o))) return true
  const lastRows = last.tab === now.tab ? last.rows : null
  const rows = now.rows
  if (rows === null || lastRows === null) return false

  return last.outs.some(o => waitsIn(lastRows, o.rowId) && !waitsIn(rows, o.rowId))
}
