import type { RenderSurface, UiScrollBlock, UiScrollResult } from 'claude-code'

import type { Tab } from '../../types'
import { drawnState, later, readUi, redraw } from './mod-drawn'
import type { Mod } from './mod-ports'
import { conversation } from './mod-sessions'
import { cancelUndoScroll, paneState, suspendUndoReveal } from './mod-state'
import { settledLayoutId, settledScrollKey, tabRowIds, undoBlockOf } from '../pane/pane-selection'
import { openPrViews } from '../../core/view/pr-views'
import { isRowTab, type ShownTab } from '../../core/view/tabs'
import { SETTLED_MS } from '../../core/view/timing'
import { selectedOf } from '../../core/view/ui-controller-selection'

type PaneScrollCalls = Pick<Mod, 'atoms' | 'clock' | 'pane' | 'sendUi'>

const RAIL_REDRAW_MS = 50

/**
 * Draws the inline terminal pane once more, after the last of a burst of draws. Its tab column moves down by the
 * window's offset, and on the terminal the engine's own scrolls, a clamp or an end followed, draw nothing, so only a
 * new draw reads where the window stands.
 */
export function followRailOffset(m: PaneScrollCalls) {
  if (paneState.isRailRedraw) {
    paneState.isRailRedraw = false
    return
  }
  const draw = ++paneState.railDraws
  later(m, RAIL_REDRAW_MS, () => {
    if (draw !== paneState.railDraws) return
    paneState.isRailRedraw = true
    return redraw(m)
  })
}

export async function scrollToKey(
  m: PaneScrollCalls,
  key: string,
  block: UiScrollBlock,
  stillCurrent: () => boolean = () => true,
  retryMs = 30,
): Promise<boolean> {
  for (let tries = 0; tries < Math.ceil(300 / retryMs); tries++) {
    if (!stillCurrent()) return false
    const result = await m.pane.scrollTo(key, block).catch((): UiScrollResult => ({}))
    if (!stillCurrent()) return false
    if (result.deny === undefined) return true
    await m.clock.sleep(retryMs)
  }
  return false
}

export async function selectStatusRow(m: PaneScrollCalls, id: string, focusKey?: string) {
  await m.sendUi([{ type: 'select', tab: 'overview', id, by: 'click' }])
  const isDrawn = await scrollToKey(m, `status-${id}`, 'nearest')
  if (isDrawn && focusKey) await m.pane.focus(focusKey).catch(() => {})
}

async function scrollToRow(m: PaneScrollCalls, id: string) {
  await scrollToKey(m, `view-${id}`, paneState.isInlinePane ? 'start' : 'nearest')
}

/** Scrolls the pending Undo into view on the inline terminal, while it lasts and the person has not moved. */
async function revealPendingUndo(m: PaneScrollCalls): Promise<boolean> {
  const pending = paneState.pendingUndoScroll
  if (!pending || !pending.revealUndo || !paneState.isInlineTerminalPane || pending.sessionId !== conversation.id)
    return false
  const drawn = await drawnState(m)
  const { ui, view, now } = drawn
  if (paneState.pendingUndoScroll !== pending || ui.tab !== pending.tab || now >= pending.expiresAt) return false
  const ids = tabRowIds(view, openPrViews(view.prs.drawn))[pending.tab]
  const block = undoBlockOf(ids, pending.rowId, selectedOf(ui, view, pending.tab))
  const prs = view.prs.drawn
  const layout = settledLayoutId(
    pending.tab,
    view,
    prs,
    drawn.lastActions,
    drawn.notes,
    now,
    paneState.terminalInlineSize,
  )
  const key = settledScrollKey(pending.key, layout)
  return scrollToKey(m, key, block, () => paneState.pendingUndoScroll === pending && pending.revealUndo, 5)
}

/** Keeps the Undo `key` of row `rowId`, which a press just closed, in view on the inline terminal while it lasts. */
export async function keepUndoVisible(m: PaneScrollCalls, key: string, rowId: string, at: number, revision: number) {
  const ui = await readUi(m)
  if (revision !== paneState.undoScrollRevision || !isRowTab(ui.tab)) return
  const sessionId = conversation.id
  paneState.pendingUndoScroll = { key, rowId, tab: ui.tab, expiresAt: at + SETTLED_MS, sessionId, revealUndo: true }
  await revealPendingUndo(m)
}

/**
 * The controller moved a tab's cursor to row `id`. After a close it moved off `closedId`, and an Undo the inline
 * terminal keeps in view for that row stays in view.
 */
export async function revealRow(m: PaneScrollCalls, tab: Tab, id: string, closedId: string | null) {
  const pending = paneState.pendingUndoScroll
  if (closedId !== null && pending?.rowId === closedId && pending.revealUndo) return void (await revealPendingUndo(m))
  if (closedId === null) {
    if (pending?.tab === tab) suspendUndoReveal()
    else cancelUndoScroll()
  }
  await scrollToRow(m, id)
}

/** Scrolls the pane to where a switch opens `tab`: a row tab to its open row, and the Status to its start. */
export async function scrollToTabStart(m: PaneScrollCalls, tab: ShownTab) {
  if (isRowTab(tab)) await scrollToOpenRow(m, tab)
  else await m.pane.scrollToStart().catch(() => undefined)
}

export async function scrollToOpenRow(m: PaneScrollCalls, tab: Tab, surface?: RenderSurface) {
  const revision = paneState.undoScrollRevision
  if (surface !== 'desktop' && (await revealPendingUndo(m))) return
  if (revision !== paneState.undoScrollRevision) return
  if (paneState.isInlinePane) {
    const { ui, view } = await drawnState(m)
    const id = selectedOf(ui, view, tab)
    if (revision !== paneState.undoScrollRevision) return
    if (id !== null) {
      await scrollToKey(m, `view-${id}`, 'start', () => revision === paneState.undoScrollRevision)
      return
    }
  }
  if (revision !== paneState.undoScrollRevision) return
  await m.pane.scrollToStart().catch(() => undefined)
}
