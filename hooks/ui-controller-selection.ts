import { listWaits, openOnArrival, steppedIndex, type RowWait } from './action-plan'
import { foldAllOn } from './fold-all'
import { prRowWaits } from './pr-rows'
import { openPrViews } from './pr-views'
import type { SessionView } from './session-view'
import { isRowTab, type ShownTab } from './tabs'
import { FOLD_QUIET_MS, PRESS_GUARD_MS, SETTLED_MS } from './timing'
import {
  ROW_TAB_IDS,
  type InputKind,
  type UiCommand,
  type UiCursor,
  type UiState,
  type UiStep,
  withCommands,
} from './ui-controller-types'
import type { FoldKind, Tab } from '../types'

const opensFor = (r: RowWait) => r.isWaiting && !r.isCollapsed

/** The view's collapses with the ones the person made that the view does not show yet. */
export function collapsedOf(ui: UiState, view: SessionView): string[] {
  const collapsed = new Set(view.collapsed)
  for (const [id, c] of Object.entries(ui.collapses)) {
    if (c.isCollapsed) collapsed.add(id)
    else collapsed.delete(id)
  }

  return [...collapsed]
}

/** The rows `tab` lists in drawn order, whether each waits, and whether the person collapsed it. */
export function tabWaits(ui: UiState, view: SessionView, tab: Tab): RowWait[] {
  const collapsed = collapsedOf(ui, view)
  if (tab === 'prs') return prRowWaits(openPrViews(view.prs.drawn), view.lastActions, collapsed)

  return listWaits({ ...view, collapsed })[tab]
}

/** Whether the person used the list within the last `FOLD_QUIET_MS`. A resting pointer counts only until then. */
export function isListInUse(ui: UiState, now: number): boolean {
  return ui.listInput !== null && now - ui.listInput.last < FOLD_QUIET_MS
}

/** The row `tab`'s cursor is on: the picked row, else the first that waits. */
export function selectedOf(ui: UiState, view: SessionView, tab: ShownTab): string | null {
  if (!isRowTab(tab)) return ui.statusSelection
  const cursor = ui.selection[tab]

  return cursor.id ?? tabWaits(ui, view, tab).find(opensFor)?.id ?? null
}

/** The row `tab` draws open: the cursor's row, unless the person collapsed it. */
export function openRowOf(ui: UiState, view: SessionView, tab: ShownTab): string | null {
  if (!isRowTab(tab)) return null
  const id = selectedOf(ui, view, tab)

  return id !== null && !collapsedOf(ui, view).includes(id) ? id : null
}

/** Whether a press by `by` on row `id` falls inside the guard of the input that opened it. */
export function isGuardedPress(ui: UiState, tab: ShownTab, id: string, by: InputKind, now: number): boolean {
  if (!isRowTab(tab)) return false
  const { id: cursorId, guard } = ui.selection[tab]

  return cursorId === id && guard !== null && guard.by === by && now < guard.at + PRESS_GUARD_MS
}

export const withCursor = (ui: UiState, tab: Tab, cursor: UiCursor): UiState => ({
  ...ui,
  selection: { ...ui.selection, [tab]: cursor },
})

/** The first row that opens at or after `index`, else the nearest before it. */
function waitingFrom(waits: RowWait[], index: number): { id: string | null; index: number } {
  const opening = waits.flatMap((r, i) => (opensFor(r) ? [{ id: r.id, index: i }] : []))

  return opening.find(r => r.index >= index) ?? opening.filter(r => r.index < index).pop() ?? { id: null, index: -1 }
}

/** Whether the person's own press closed row `id`: a press on it is out, or one was saved within `SETTLED_MS`. */
function isClosedByPerson(ui: UiState, view: SessionView, id: string, now: number): boolean {
  const lastAt = view.lastActions[id]?.at

  return Object.values(ui.pressesOut).some(p => p.rowId === id) || (lastAt !== undefined && lastAt >= now - SETTLED_MS)
}

/**
 * `ui` with `tab`'s cursor moved off row `closedId`, from `index`, and the reveal the shown tab needs. When a click
 * closed the row, the row the cursor moves to is guarded, so a double click does not land on it.
 */
function movedOff(ui: UiState, waits: RowWait[], tab: Tab, closedId: string, index: number, now: number): UiStep {
  const next = waitingFrom(waits, index)
  const isClosedByClick = Object.values(ui.pressesOut).some(p => p.rowId === closedId && p.by === 'click')
  const guard = isClosedByClick ? { by: 'click' as const, at: now } : null
  const moved = withCursor(ui, tab, { id: next.id, index: next.index, guard })
  const isShown = ui.tab === tab && next.id !== null

  return withCommands(
    moved,
    ...(isShown ? [{ kind: 'reveal', tab, id: next.id as string, closedId } as UiCommand] : []),
  )
}

/**
 * Each row tab's cursor after a read: it follows its row's place, moves off a row that left or stopped waiting, and
 * takes the row `openOnArrival` picks for the rows that arrived. A close by the agent waits while the list is in use.
 */
export function readCursors(
  ui: UiState,
  view: SessionView,
  added: Partial<Record<Tab, string[]>>,
  now: number,
): UiStep {
  let step = settleHeldClose(ui, view, now)
  for (const tab of ROW_TAB_IDS) {
    const waits = tabWaits(step.ui, view, tab)
    const cursor = step.ui.selection[tab]
    const index = cursor.id === null ? -1 : waits.findIndex(r => r.id === cursor.id)
    // A cursor whose id was never among the tab's rows rests on a line only the look draws, such as omp's fold lines.
    const wasOnRow = cursor.index >= 0
    const isGone = cursor.id !== null && wasOnRow && index < 0
    const wasWaiting = cursor.id !== null && (step.ui.waitingSeen[tab] ?? []).includes(cursor.id)
    const hasStopped = !isGone && wasWaiting && waits[index]?.isWaiting === false
    const isFieldOpen = cursor.id !== null && step.ui.typing === cursor.id
    let next = step.ui
    let commands = step.commands
    if ((isGone || hasStopped) && !isFieldOpen && cursor.id !== null) {
      const isHeld = hasStopped && !isClosedByPerson(next, view, cursor.id, now) && isListInUse(next, now)
      if (isHeld) next = { ...next, heldClose: { ...next.heldClose, [tab]: cursor.id } }
      else {
        const moved = movedOff(next, waits, tab, cursor.id, isGone ? cursor.index : index, now)
        next = moved.ui
        commands = [...commands, ...moved.commands]
      }
    } else if (index >= 0 && index !== cursor.index) next = withCursor(next, tab, { ...cursor, index })
    const picked = next.selection[tab].id
    const isOpenRowUnseen = picked === null && next.shownSince === null
    const arrived = isOpenRowUnseen ? null : openOnArrival(waits, picked, added[tab] ?? [])
    if (arrived !== null)
      next = withCursor(next, tab, { id: arrived, index: waits.findIndex(r => r.id === arrived), guard: null })
    next = { ...next, waitingSeen: { ...next.waitingSeen, [tab]: waits.filter(r => r.isWaiting).map(r => r.id) } }
    step = { ui: next, commands }
  }

  return step
}

const without = <K extends string, V>(byKey: Partial<Record<K, V>>, key: K): Partial<Record<K, V>> => {
  const { [key]: _gone, ...rest } = byKey
  return rest as Partial<Record<K, V>>
}

/** Applies each close by the agent that waited, once the list is quiet or the row is gone. */
export function settleHeldClose(ui: UiState, view: SessionView, now: number): UiStep {
  let step = withCommands(ui)
  for (const tab of ROW_TAB_IDS) {
    const id = step.ui.heldClose[tab]
    if (id === undefined) continue
    const cleared = { ...step.ui, heldClose: without(step.ui.heldClose, tab) }
    const cursor = step.ui.selection[tab]
    const waits = tabWaits(step.ui, view, tab)
    const index = waits.findIndex(r => r.id === id)
    const isStillWaiting = waits[index]?.isWaiting === true
    if (cursor.id !== id || isStillWaiting) step = { ui: cleared, commands: step.commands }
    else if (index < 0 || !isListInUse(step.ui, now)) {
      const moved = movedOff(cleared, waits, tab, id, index >= 0 ? index : cursor.index, now)
      step = { ui: moved.ui, commands: [...step.commands, ...moved.commands] }
    }
  }

  return step
}

/** Selects row `id` on `tab`. A click starts the guard. Selecting another row closes an open field; the draft stays. */
export function selectRow(
  ui: UiState,
  view: SessionView,
  tab: ShownTab,
  id: string | null,
  by: InputKind | null,
  now: number,
): UiState {
  if (!isRowTab(tab)) return { ...ui, statusSelection: id }
  const index = id === null ? -1 : tabWaits(ui, view, tab).findIndex(r => r.id === id)
  const guard = by === 'click' ? { by, at: now } : null
  const typing = ui.typing !== null && ui.typing !== id ? null : ui.typing
  const heldClose = without(ui.heldClose, tab)

  return { ...withCursor(ui, tab, { id, index, guard }), typing, heldClose }
}

/** j or k: the next or previous id in the look's own selectable order. */
export function stepSelection(ui: UiState, view: SessionView, by: 1 | -1, ids: string[], now: number): UiState {
  const at = ids.indexOf(selectedOf(ui, view, ui.tab) ?? '')
  const next = steppedIndex(at, by, ids.length)

  const id = ids[next]

  return id === undefined ? ui : selectRow(ui, view, ui.tab, id, 'key', now)
}

/** Records a collapse the person made, pins the cursor so no other row opens, and closes the row's field. */
export function collapseRow(ui: UiState, view: SessionView, id: string, isCollapsed: boolean, now: number): UiStep {
  let next: UiState = { ...ui, collapses: { ...ui.collapses, [id]: { isCollapsed, at: now } } }
  if (isCollapsed && next.typing === id) next = { ...next, typing: null }
  const tab = ui.tab
  if (isCollapsed && isRowTab(tab) && ui.selection[tab].id === null && selectedOf(ui, view, tab) === id)
    next = withCursor(next, tab, { id, index: tabWaits(ui, view, tab).findIndex(r => r.id === id), guard: null })

  return withCommands(next, { kind: 'save-collapse', id, isCollapsed })
}

/** A press on a row's title: it expands a collapsed row, selects another row, and collapses the open one unguarded. */
export function titlePress(ui: UiState, view: SessionView, id: string, by: InputKind, now: number): UiStep {
  const tab = ui.tab
  if (!isRowTab(tab)) return withCommands(ui)
  if (collapsedOf(ui, view).includes(id)) {
    const expanded = collapseRow(ui, view, id, false, now)
    return { ...expanded, ui: selectRow(expanded.ui, view, tab, id, by, now) }
  }
  if (selectedOf(ui, view, tab) !== id) return withCommands(selectRow(ui, view, tab, id, by, now))

  return isGuardedPress(ui, tab, id, by, now) ? withCommands(ui) : collapseRow(ui, view, id, true, now)
}

const withOnly = <T>(list: readonly T[], x: T, isIn: boolean): T[] =>
  isIn ? (list.includes(x) ? [...list] : [...list, x]) : list.filter(y => y !== x)

export function setFold(ui: UiState, fold: FoldKind, isOpen: boolean): UiState {
  return {
    ...ui,
    unfolded: withOnly(ui.unfolded, fold, isOpen),
    closedAll: isOpen ? ui.closedAll : withOnly(ui.closedAll, fold, false),
  }
}

/** Opens or folds every fold of the shown tab, as `foldAllOn` says. */
export function foldAll(ui: UiState, view: SessionView, isOpening: boolean | null, now: number): UiStep {
  const change = foldAllOn(view, ui.tab, { unfolded: ui.unfolded, statusUnfolded: ui.statusUnfolded }, isOpening)
  const start: UiState = {
    ...ui,
    unfolded: change.unfolded,
    statusUnfolded: change.statusUnfolded,
    closedAll: ui.closedAll.filter(k => change.unfolded.includes(k)),
  }

  return change.collapses.reduce<UiStep>((acc, c) => {
    const next = collapseRow(acc.ui, view, c.id, c.isCollapsed, now)
    return { ui: next.ui, commands: [...acc.commands, ...next.commands] }
  }, withCommands(start))
}

/**
 * Selects the row a confirmed Undo brought back, once a row tab lists it open again, unless a field is open on another
 * row. An Undo clicked guards the row, as a click that opens a row does.
 */
export function selectRestored(ui: UiState, view: SessionView, now: number): UiStep {
  const restoring = ui.restoring
  if (restoring === null) return withCommands(ui)
  const tab = ROW_TAB_IDS.find(t => tabWaits(ui, view, t).some(r => r.id === restoring.id && r.isWaiting))
  if (tab === undefined) return withCommands(ui)
  const cleared = { ...ui, restoring: null }
  if (ui.typing !== null && ui.typing !== restoring.id) return withCommands(cleared)
  const index = tabWaits(ui, view, tab).findIndex(r => r.id === restoring.id)
  const guard = restoring.by === 'click' ? { by: 'click' as const, at: now } : null
  const moved = withCursor(cleared, tab, { id: restoring.id, index, guard })

  return withCommands(
    moved,
    ...(ui.tab === tab ? [{ kind: 'reveal', tab, id: restoring.id, closedId: null } as UiCommand] : []),
  )
}
