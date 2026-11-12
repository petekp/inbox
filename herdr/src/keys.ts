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

/** The row after or before the selected one, or the first or last row when none is selected. */
function stepRow(blocks: Block[], by: 1 | -1): string | null {
  const rows = blocks.filter(isSelectable)
  if (rows.length === 0) return null
  const at = rows.findIndex(r => r.isSelected)
  const next = at < 0 ? (by === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + by))

  return rows[next]!.id
}

function stepTab(tabs: TabCell[], by: 1 | -1): ShownTab | null {
  const at = tabs.findIndex(t => t.isSelected)

  return tabs[(at + by + tabs.length) % tabs.length]?.id ?? null
}

/**
 * The move a key makes, as the Herdr look's Help lists: ← → switch tabs, j k move between rows, a selected row's
 * hotkeys press its buttons, the tab's own keys such as g press its line's buttons, and escape leaves the look. While
 * a text field is open, `typing` names its row: the keys type into it, and escape closes it.
 */
export function keyMove(key: string, tabs: TabCell[], blocks: Block[], typing: string | null): KeyMove {
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
  const selected = blocks.find((b): b is RowBlock => b.kind === 'row' && b.isSelected)
  const lines = blocks.flatMap(b => (b.kind === 'line' ? b.buttons : []))
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
 * Whether a click in the list gives the keys back to the look. While a text field is open, it keeps them: GPUI delivers
 * a click to every handler on its path, so a click inside the field reaches the list's handler too.
 */
export const doesListClickTakeKeys = (ui: LookUi): boolean => ui.typing === null

/** Switching tabs closes the open text field. Its draft is kept. */
export const withTab = (ui: LookUi, tab: ShownTab): LookUi => ({ ...ui, tab, selected: null, typing: null })

/** A field's text that went as a press closes the field and drops its draft. A refused one keeps both. */
export function afterSend(ui: LookUi, drafts: Record<string, Draft>, rowId: string, isSent: boolean) {
  if (!isSent) return { ui, drafts }
  const kept = Object.fromEntries(Object.entries(drafts).filter(([id]) => id !== rowId))

  return { ui: { ...ui, typing: ui.typing === rowId ? null : ui.typing }, drafts: kept }
}
