import { COLLAPSE_KEY, FOLD_ALL_KEY, UNDO_KEY } from '../../hooks/help'
import type { ShownTab } from '../../hooks/tabs'
import type { UiEvent } from '../../hooks/ui-controller-types'
import type { Block, Button, RowBlock } from './blocks'
import type { TabCell } from './draw'

/**
 * What a key does in the look: an event for the shared controller, a press of a drawn button, giving focus back to
 * the terminal, or nothing.
 */
type KeyMove = { is: 'event'; event: UiEvent } | { is: 'press'; button: Button } | { is: 'leave' } | null

const isSelectable = (b: Block): b is RowBlock => b.kind === 'row' && b.isSelectable

function stepTab(tabs: TabCell[], by: 1 | -1): ShownTab | null {
  const at = tabs.findIndex(t => t.isSelected)

  return tabs[(at + by + tabs.length) % tabs.length]?.id ?? null
}

const event = (e: UiEvent): KeyMove => ({ is: 'event', event: e })

/**
 * The move a key makes, as the Herdr look's Help lists: ← → switch tabs, j k move between rows, z collapses or
 * expands the selected row, w folds or opens every fold, u presses the Undo of the row that closed last, a selected
 * row's hotkeys press its buttons, the tab's own keys such as g press its line's buttons, and escape leaves the look.
 * While a text field is open, `typing` names its row: the keys type into it, and escape closes it. Under Help, only
 * ← → and escape do anything.
 */
export function keyMove(
  key: string,
  tabs: TabCell[],
  blocks: Block[],
  typing: string | null,
  isHelpShown = false,
): KeyMove {
  if (typing !== null) return key === 'escape' ? event({ type: 'close-field', id: typing, isDiscard: false }) : null
  if (key === 'escape') return { is: 'leave' }
  if (key === 'left' || key === 'right') {
    const tab = stepTab(tabs, key === 'right' ? 1 : -1)
    return tab ? event({ type: 'show-tab', tab }) : null
  }
  if (isHelpShown) return null
  if (key === 'j' || key === 'k') {
    const ids = blocks.filter(isSelectable).map(r => r.id)
    return ids.length > 0 ? event({ type: 'step', by: key === 'j' ? 1 : -1, ids }) : null
  }
  if (key === FOLD_ALL_KEY) return event({ type: 'fold-all', isOpening: null })
  if (key === UNDO_KEY) return event({ type: 'undo-key' })
  const selected = blocks.find((b): b is RowBlock => b.kind === 'row' && b.isSelected)
  if (key === COLLAPSE_KEY && selected?.isSelectable)
    return event({ type: 'collapse', id: selected.id, isCollapsed: !selected.isCollapsed })
  const lines = blocks.flatMap(b =>
    b.kind === 'line' || b.kind === 'banner' ? b.buttons : b.kind === 'empty' ? (b.under?.buttons ?? []) : [],
  )
  const pressed = [...(selected?.buttons ?? []), ...lines].find(b => b.hotkey === key && !b.isOut)

  return pressed ? { is: 'press', button: pressed } : null
}

/**
 * Whether a click in the list gives the keys to the open text field rather than to the look: while the field is open
 * and drawn, which it is not under Help. GPUI delivers a click to every handler on its path, so a click on the field,
 * on its box or anywhere else in the list reaches the list's handler.
 */
export const isFieldDrawn = (typing: string | null, isHelpShown: boolean): boolean => typing !== null && !isHelpShown
