import { drawnLists, latestUndo, openOnArrival, rowAfterClose, steppedIndex, tabUndos } from '../../hooks/action-plan'
import type { RowWait } from '../../hooks/action-plan'
import { addNewRows, showNewRows } from '../../hooks/arrivals'
import { COLLAPSE_KEY, FOLD_ALL_KEY, UNDO_KEY } from '../../hooks/help'
import type { PrPress } from '../../hooks/pr-press'
import type { RowPress } from '../../hooks/presses'
import type { SessionView } from '../../hooks/session-view'
import { GOAL_KEYS_ID } from '../../hooks/status-keys'
import type { StatusPage } from '../../hooks/status-page'
import { isDrawnInPlace } from '../../hooks/timing'
import type { ShownTab } from '../../hooks/tabs'
import type { Draft } from '../../types'
import type { Block, Button, Does, RowBlock, ViewChange } from './blocks'
import type { LookUi, TabCell } from './draw'
import type { SentText } from './out'

/**
 * What a key does in the look: switch tabs, select a row, collapse or expand it, press a button, give focus back to
 * the terminal, or close the open text field.
 */
type KeyMove =
  | { is: 'tab'; tab: ShownTab }
  | { is: 'select'; id: string }
  | { is: 'collapse'; id: string; isCollapsed: boolean }
  | { is: 'fold-all' }
  | { is: 'press'; button: Button }
  | { is: 'leave' }
  | { is: 'close' }
  | null

const isSelectable = (b: Block): b is RowBlock => b.kind === 'row' && b.isSelectable

/** The row after or before the selected one, wrapping at either end, or the first or last row when none is selected. */
function stepRow(blocks: Block[], by: 1 | -1): string | null {
  const rows = blocks.filter(isSelectable)
  const next = steppedIndex(
    rows.findIndex(r => r.isSelected),
    by,
    rows.length,
  )

  return rows[next]?.id ?? null
}

/** The press of the Undo the undo key presses on a row tab: the one whose row or PR closed last. */
export function tabUndo(view: SessionView, tab: ShownTab, shownSince: number): RowPress | PrPress | null {
  if (tab === 'overview') return null
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows]
  const drawn = new Set(rows.filter(r => isDrawnInPlace(r, shownSince)).map(r => r.id))
  const lists = drawnLists(
    view,
    id => drawn.has(id),
    r => r,
  )

  return latestUndo(tabUndos(tab, lists, view.prs.drawn))?.press ?? null
}

const isSamePress = (a: RowPress | PrPress, b: RowPress | PrPress) => JSON.stringify(a) === JSON.stringify(b)

/** The drawn button of that Undo, unless its press is out. */
function undoButton(blocks: Block[], undo: RowPress | PrPress): Button | null {
  const drawn = blocks
    .flatMap(b => (b.kind === 'row' ? b.buttons : []))
    .find(b => b.does.is === 'press' && isSamePress(b.does.press, undo))

  return drawn && !drawn.isOut ? drawn : null
}

function stepTab(tabs: TabCell[], by: 1 | -1): ShownTab | null {
  const at = tabs.findIndex(t => t.isSelected)

  return tabs[(at + by + tabs.length) % tabs.length]?.id ?? null
}

/**
 * The move a key makes, as the Herdr look's Help lists: ← → switch tabs, j k move between rows, z collapses or
 * expands the selected row, u presses `undo`,
 * the Undo of the row that closed last, a selected row's hotkeys press its buttons, the tab's own keys such as g
 * press its line's buttons, and escape leaves the look. While a text field is open, `typing` names its row: the keys
 * type into it, and escape closes it.
 */
export function keyMove(
  key: string,
  tabs: TabCell[],
  blocks: Block[],
  typing: string | null,
  undo: RowPress | PrPress | null = null,
): KeyMove {
  if (typing !== null) return key === 'escape' ? { is: 'close' } : null
  if (key === 'escape') return { is: 'leave' }
  if (key === 'left' || key === 'right') {
    const tab = stepTab(tabs, key === 'right' ? 1 : -1)
    return tab ? { is: 'tab', tab } : null
  }
  if (key === 'j' || key === 'k') {
    const id = stepRow(blocks, key === 'j' ? 1 : -1)
    return id ? { is: 'select', id } : null
  }
  if (key === FOLD_ALL_KEY) return { is: 'fold-all' }
  if (key === UNDO_KEY) {
    const button = undo ? undoButton(blocks, undo) : null
    return button ? { is: 'press', button } : null
  }
  const selected = blocks.find((b): b is RowBlock => b.kind === 'row' && b.isSelected)
  if (key === COLLAPSE_KEY && selected?.isSelectable)
    return { is: 'collapse', id: selected.id, isCollapsed: !selected.isCollapsed }
  const lines = blocks.flatMap(b =>
    b.kind === 'line' || b.kind === 'banner' ? b.buttons : b.kind === 'empty' ? (b.under?.buttons ?? []) : [],
  )
  const pressed = [...(selected?.buttons ?? []), ...lines].find(b => b.hotkey === key && !b.isOut)

  return pressed ? { is: 'press', button: pressed } : null
}

/** Selecting a row closes the text field of any other row. Its draft is kept. */
export const withSelected = (ui: LookUi, id: string): LookUi => ({
  ...ui,
  selected: id,
  typing: ui.typing === id ? id : null,
})

/**
 * The look's state after a row or a Status parent collapses or opens. A row becomes the selected one and a collapse
 * closes its field. A Status parent is no row, so the selection stays.
 */
export const withCollapsed = (ui: LookUi, id: string, isCollapsed: boolean): LookUi => ({
  ...(ui.tab === 'overview' ? ui : withSelected(ui, id)),
  ...(isCollapsed && { typing: null }),
})

/**
 * After a publish, moves the selection off a selected row that waited at the last draw and no longer does, to the row
 * `rowAfterClose` gives, as the terminal's `openAfterClose` does. `last` and `now` are the tab's rows at the last draw
 * and at this one.
 */
export function withClosedSelection(ui: LookUi, last: RowWait[], now: RowWait[]): LookUi {
  const id = ui.selected
  const wasWaiting = last.some(r => r.id === id && r.isWaiting)
  const isWaiting = now.some(r => r.id === id && r.isWaiting)
  if (id === null || !wasWaiting || isWaiting) return ui
  const next = rowAfterClose(now, id)

  return next === null ? { ...ui, selected: null, typing: null } : withSelected(ui, next)
}

/**
 * After a publish, selects the first new row that waits while the selected row is collapsed, as `openOnArrival` says,
 * and records the new rows. The look finds them only in the tab it shows. `last` and `now` are the tab's rows at the
 * last draw and at this one.
 */
function withArrivals(ui: LookUi, last: RowWait[], now: RowWait[]): LookUi {
  const added = now.filter(r => !last.some(l => l.id === r.id)).map(r => r.id)
  const id = ui.selected === null ? null : openOnArrival(now, ui.selected, added)
  const recorded = added.length === 0 ? ui : { ...ui, newRows: addNewRows(ui.newRows, { [ui.tab]: added }) }

  return id === null ? recorded : withSelected(recorded, id)
}

/** `ui` as the look shows its tab `at`: the tab's new rows start their tint's clock, and ended tints are dropped. */
function withShownNewRows(ui: LookUi, at: number): LookUi {
  const newRows = showNewRows(ui.newRows, ui.tab, at)
  const isSame = newRows.size === ui.newRows.size && [...newRows].every(([id, row]) => ui.newRows.get(id) === row)

  return isSame ? ui : { ...ui, newRows }
}

/** The tab a draw showed, and its rows, or null when it showed no inbox, as while a session is read. */
export type LastWaits = { tab: ShownTab; rows: RowWait[] | null }

/**
 * The look's state after a draw that shows `rows`, from the rows the last draw showed. Rows count as closed or new
 * only between two draws of the same tab's rows. A new row's clock starts once `isTabShown`, which is false while Help
 * covers the tab.
 */
export function withDrawnRows(
  ui: LookUi,
  last: LastWaits,
  rows: RowWait[] | null,
  at: number,
  isTabShown: boolean,
  page?: StatusPage,
): LookUi {
  const lastRows = last.tab === ui.tab ? last.rows : null
  const arrived =
    rows !== null && lastRows !== null ? withArrivals(withClosedSelection(ui, lastRows, rows), lastRows, rows) : ui

  const shown = isTabShown ? withShownNewRows(arrived, at) : arrived

  return page ? withoutStaleSuggestion(shown, page) : shown
}

/**
 * Whether a click in the list gives the keys to the open text field rather than to the look: while the field is open
 * and drawn, which it is not under Help. GPUI delivers a click to every handler on its path, so a click on the field,
 * on its box or anywhere else in the list reaches the list's handler.
 */
export const isFieldDrawn = (ui: LookUi, isHelpShown: boolean): boolean => ui.typing !== null && !isHelpShown

/** Switching tabs closes the open text field. Its draft is kept. */
export const withTab = (ui: LookUi, tab: ShownTab): LookUi => ({ ...ui, tab, selected: null, typing: null })

/** The look's state after a press goes: an Undo selects its row, and Set closes the suggested goal. */
export function afterPress(ui: LookUi, press: Extract<Does, { is: 'press' }>['press']): LookUi {
  if (press.action === 'take-goal') return { ...ui, isSuggestionOpen: false }

  return 'id' in press && press.action === 'undo' ? withSelected(ui, press.id) : ui
}

/**
 * A field's text that went as a press closes the field, and closes the suggested goal when it was the goal's. A refused
 * one keeps both open. Either keeps the draft.
 */
export const afterSend = (ui: LookUi, rowId: string, isSent: boolean): LookUi =>
  isSent && ui.typing === rowId
    ? { ...ui, typing: null, ...(rowId === GOAL_KEYS_ID && { isSuggestionOpen: false }) }
    : ui

/** The suggested goal closes once the page offers none, so a later one never opens without a press. */
export const withoutStaleSuggestion = (ui: LookUi, page: StatusPage): LookUi =>
  ui.isSuggestionOpen && page.suggestedGoal === null ? { ...ui, isSuggestionOpen: false } : ui

/**
 * The drafts without those whose sent text the host confirmed, as the other looks delete a sent reply's draft, and
 * the confirmations still `waiting` for their row's open field to close. A draft whose words changed after the send
 * stays. A later send on the row, still `pending`, replaces an earlier one's confirmation.
 */
export function withoutConfirmed(
  drafts: Record<string, Draft>,
  confirmed: readonly SentText[],
  typing: string | null,
  pending: readonly SentText[],
): { drafts: Record<string, Draft>; waiting: SentText[] } {
  const current = confirmed.filter(c => !pending.some(p => p.rowId === c.rowId && p.pressId > c.pressId))
  const done = current.filter(c => c.rowId !== typing)
  const isSentDraft = (id: string, d: Draft) => done.some(c => c.rowId === id && c.text === d.text.trim())

  return {
    drafts: Object.fromEntries(Object.entries(drafts).filter(([id, d]) => !isSentDraft(id, d))),
    waiting: current.filter(c => c.rowId === typing),
  }
}

const toggled = <T>(list: T[], x: T): T[] => (list.includes(x) ? list.filter(y => y !== x) : [...list, x])

/** The look's state after a button that changes only what the look shows, other than Help. */
export function withChange(ui: LookUi, c: Exclude<ViewChange, { toggleHelp: true }>): LookUi {
  if ('showOptions' in c) return { ...ui, optionsShown: toggled(ui.optionsShown, c.showOptions) }
  if ('closedFold' in c) return { ...ui, unfolded: toggled(ui.unfolded, c.closedFold) }
  if ('earlier' in c) return { ...ui, closedAll: [...ui.closedAll, c.earlier] }
  if ('toggleFold' in c) return { ...ui, statusUnfolded: toggled(ui.statusUnfolded, c.toggleFold) }
  if ('isSuggestionOpen' in c) return { ...ui, isSuggestionOpen: c.isSuggestionOpen }

  return withSelected({ ...ui, tab: 'needsYou' }, c.showAsk)
}
