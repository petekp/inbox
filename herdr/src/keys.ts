import { latestUndo, steppedIndex } from '../../hooks/action-plan'
import { UNDO_KEY } from '../../hooks/help'
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

const isUndo = (b: Button) =>
  b.does.is === 'press' && (b.does.press.action === 'undo' || b.does.press.action === 'pr-undo')

/** The Undo the undo key presses: the one of the tab's settled rows and PRs that closed last. */
function lastUndo(blocks: Block[]): Button | null {
  const shown = blocks.flatMap(b =>
    b.kind === 'row' && b.settled ? b.buttons.filter(isUndo).map(button => ({ button, at: b.settled!.at })) : [],
  )
  const undo = latestUndo(shown)?.button

  return undo && !undo.isOut ? undo : null
}

function stepTab(tabs: TabCell[], by: 1 | -1): ShownTab | null {
  const at = tabs.findIndex(t => t.isSelected)

  return tabs[(at + by + tabs.length) % tabs.length]?.id ?? null
}

/**
 * The move a key makes, as the Herdr look's Help lists: ← → switch tabs, j k move between rows, u presses the Undo of
 * the row that closed last, a selected row's hotkeys press its buttons, the tab's own keys such as g press its line's buttons, and escape leaves the look. While
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
  if (key === UNDO_KEY) {
    const undo = lastUndo(blocks)
    return undo ? { is: 'press', button: undo } : null
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
