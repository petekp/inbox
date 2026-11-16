import { foldAllOn } from '../../hooks/fold-all'
import type { SessionView } from '../../hooks/session-view'
import type { Does } from './blocks'
import type { LookUi } from './draw'

/**
 * Whether a click on the fold that button `does` stands for opens every fold of the tab (true) or folds them all
 * (false). Null when the button is no fold.
 */
export function foldClickOpens(does: Does, ui: LookUi): boolean | null {
  if (does.is === 'collapse') return !does.isCollapsed
  if (does.is !== 'view') return null
  if ('closedFold' in does.change) return !ui.unfolded.includes(does.change.closedFold)
  if ('toggleFold' in does.change) return !ui.statusUnfolded.includes(does.change.toggleFold)

  return null
}

/** What `foldAllIn` needs of the look: its view and state, and the collapse that saves a row or parent without selecting it. */
type FoldingLook<C> = {
  view: SessionView | null
  ui: LookUi
  collapse(id: string, isCollapsed: boolean, cx: C, isSelecting: boolean): void
}

/**
 * Folds every fold of the look's tab, or opens them all, as `isOpening` says, or with null by what is open now. A row
 * that collapses closes its field.
 */
export function foldAllIn<C extends { notify(): void }>(look: FoldingLook<C>, isOpening: boolean | null, cx: C): void {
  if (look.view === null) return
  const change = foldAllOn(look.view, look.ui.tab, look.ui, isOpening)
  const isTypingFolded = change.collapses.some(c => c.isCollapsed && c.id === look.ui.typing)
  look.ui = {
    ...look.ui,
    unfolded: change.unfolded,
    statusUnfolded: change.statusUnfolded,
    closedAll: look.ui.closedAll.filter(k => change.unfolded.includes(k)),
    ...(isTypingFolded && { typing: null }),
  }
  for (const c of change.collapses) look.collapse(c.id, c.isCollapsed, cx, false)
  cx.notify()
}
