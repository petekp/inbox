import { foldAllOn } from '../../hooks/fold-all'
import { toggleFold } from './tab-motion'
import { pressCollapse } from './tab-rows'
import { drawnTab } from './tab-selection'
import { toggleStatusFold } from './tab-status-line'
import { closedAll, statusUnfolded, tabState, unfolded } from './tab-state'

/** A click on a fold that is open or not: with Option held it folds every fold of the tab, or opens them all. */
export const clickFold = (e: MouseEvent, isOpen: boolean, toggle: () => void) =>
  e.altKey ? foldAllHere(!isOpen) : toggle()

/**
 * Folds every fold of the shown tab, or opens them all, as `isOpening` says, or with null by what is open now. Each fold
 * moves as it does when pressed alone. The collapses draw at once and save one after another, so the server applies each
 * to the state the last one left.
 */
export function foldAllHere(isOpening: boolean | null) {
  const v = tabState.view
  if (!v) return
  const open = { unfolded: [...unfolded], statusUnfolded: [...statusUnfolded] }
  const change = foldAllOn(v, drawnTab(), open, isOpening)
  for (const group of new Set([...unfolded, ...change.unfolded])) {
    if (unfolded.has(group) === change.unfolded.includes(group)) continue
    closedAll.delete(group)
    toggleFold(group, unfolded)
  }
  for (const id of new Set([...statusUnfolded, ...change.statusUnfolded]))
    if (statusUnfolded.has(id) !== change.statusUnfolded.includes(id)) toggleStatusFold(id)
  let saved: Promise<unknown> = Promise.resolve()
  for (const { id, isCollapsed } of change.collapses) {
    if (isCollapsed && tabState.typing === id) tabState.typing = null
    saved = pressCollapse(id, isCollapsed, saved)
  }
}
