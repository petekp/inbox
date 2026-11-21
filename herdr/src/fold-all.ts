import type { UiState } from '../../core/view/ui-controller-types'
import type { Does } from './blocks'

/**
 * Whether a click on the fold that button `does` stands for opens every fold of the tab (true) or folds them all
 * (false). Null when the button is no fold.
 */
export function foldClickOpens(does: Does, ui: Pick<UiState, 'unfolded' | 'statusUnfolded'>): boolean | null {
  if (does.is === 'collapse') return !does.isCollapsed
  if (does.is !== 'view') return null
  if ('closedFold' in does.change) return !ui.unfolded.includes(does.change.closedFold)
  if ('toggleFold' in does.change) return !ui.statusUnfolded.includes(does.change.toggleFold)

  return null
}
