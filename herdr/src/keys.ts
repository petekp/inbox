import { drawnLists, latestUndo, steppedIndex, tabUndos } from '../../hooks/action-plan'
import { UNDO_KEY } from '../../hooks/help'
import type { PrPress } from '../../hooks/pr-press'
import type { RowPress } from '../../hooks/presses'
import type { SessionView } from '../../hooks/session-view'
import { isDrawnInPlace } from '../../hooks/timing'
import type { ShownTab } from '../../hooks/tabs'
import type { Draft } from '../../types'
import type { Block, Button, RowBlock } from './blocks'
import type { LookUi, TabCell } from './draw'

/**
 * What a key does in the look: switch tabs, select a row, press a button, give focus back to the terminal, or close
 * the open text field.
 */
type KeyMove =
  | { is: 'tab'; tab: ShownTab }
  | { is: 'select'; id: string }
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
 * The move a key makes, as the Herdr look's Help lists: ← → switch tabs, j k move between rows, u presses `undo`,
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
  if (key === UNDO_KEY) {
    const button = undo ? undoButton(blocks, undo) : null
    return button ? { is: 'press', button } : null
  }
  const selected = blocks.find((b): b is RowBlock => b.kind === 'row' && b.isSelected)
  const lines = blocks.flatMap(b => (b.kind === 'line' || b.kind === 'banner' ? b.buttons : []))
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
 * Keeps the row the look opened in place of a selected row that stopped waiting, so the selection stays there once
 * the closed row leaves the list. The PRs tab keeps its own selection.
 */
export function withDrawnSelection(ui: LookUi, blocks: Block[]): LookUi {
  if (ui.selected === null || ui.tab === 'prs') return ui
  const drawn = blocks.find(b => b.kind === 'row' && b.isSelected)?.id ?? null

  return drawn === null || drawn === ui.selected ? ui : { ...ui, selected: drawn }
}

/**
 * Whether a click in the list gives the keys to the open text field rather than to the look: while the field is open
 * and drawn, which it is not under Help. GPUI delivers a click to every handler on its path, so a click on the field,
 * on its box or anywhere else in the list reaches the list's handler.
 */
export const isFieldDrawn = (ui: LookUi, isHelpShown: boolean): boolean => ui.typing !== null && !isHelpShown

/** Switching tabs closes the open text field. Its draft is kept. */
export const withTab = (ui: LookUi, tab: ShownTab): LookUi => ({ ...ui, tab, selected: null, typing: null })

/** A field's text that went as a press closes the field and drops its draft. A refused one keeps both. */
export function afterSend(ui: LookUi, drafts: Record<string, Draft>, rowId: string, isSent: boolean) {
  if (!isSent) return { ui, drafts }
  const kept = Object.fromEntries(Object.entries(drafts).filter(([id]) => id !== rowId))

  return { ui: { ...ui, typing: ui.typing === rowId ? null : ui.typing }, drafts: kept }
}
