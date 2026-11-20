import { isMilestonesFold } from '../../hooks/status-goal-page'
import type { UiEvent, UiState } from '../../hooks/ui-controller-types'
import type { FoldKind } from '../../types'
import { foldMove } from './tab-motion'
import { tabState } from './tab-state'
import { dispatch } from './tab-ui'

/** The motion key of a done fold's list, apart from the Asks groups' Closed lists. */
export const foldMotion = (id: string) => `status-${id}`

/** The motion keys of the open folds' lists. A met goal's milestones grow in and leave as stepped lines, so that fold has none. */
const openLists = (ui: UiState) =>
  new Set([...ui.unfolded, ...ui.statusUnfolded.filter(id => !isMilestonesFold(id)).map(foldMotion)])

/** Sends `events` to the controller, and moves the list of each fold they opened or shut as it draws. */
function sendFolds(events: UiEvent[]) {
  const before = openLists(tabState.ui)
  dispatch(events, { isDrawn: false })
  const after = openLists(tabState.ui)
  const changed = [...new Set([...before, ...after])].filter(m => before.has(m) !== after.has(m))
  const afterDraw = changed.map(m => foldMove(m, after.has(m), () => openLists(tabState.ui).has(m)))
  tabState.draw()
  for (const step of afterDraw) step()
}

/** Opens or shuts an Asks group's fold of closed rows. */
export const toggleFold = (fold: FoldKind) =>
  sendFolds([{ type: 'fold', fold, isOpen: !tabState.ui.unfolded.includes(fold) }])

/** Opens or shuts a Status fold. */
export const toggleStatusFold = (id: string) =>
  sendFolds([{ type: 'status-fold', id, isOpen: !tabState.ui.statusUnfolded.includes(id) }])

/** A click on a fold that is open or not: with Option held it folds every fold of the tab, or opens them all. */
export const clickFold = (e: MouseEvent, isOpen: boolean, toggle: () => void) =>
  e.altKey ? foldAllHere(!isOpen) : toggle()

/**
 * Folds every fold of the shown tab, or opens them all, as `isOpening` says, or with null by what is open now. Each fold
 * moves as it does when pressed alone.
 */
export const foldAllHere = (isOpening: boolean | null) => sendFolds([{ type: 'fold-all', isOpening }])
