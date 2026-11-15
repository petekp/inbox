import { latestUndo, tabUndos } from '../../hooks/action-plan'
import { pressRowId } from '../../hooks/pr-press'
import type { Tab } from '../../types'
import type { TabView as View } from './core'
import { isUndoLeft } from './settle'
import { tabState, undoing } from './tab-state'
import { shownSettled } from './tab-selection'
import { listsOf, prPlan } from './tab-rows'
import { undo } from './tab-list'
import { undoPr } from './tab-prs'

/**
 * Presses the Undo the undo key names, by the shared rule. The tab times each Undo from the poll that first listed
 * its row, as it draws it, so that time stands in for the close's.
 */
export function pressUndoKey(v: View, t: Tab): boolean {
  const lists = listsOf(v, shownSettled(v))
  const now = Date.now()
  const shown = tabUndos(t, lists, prPlan(v).blocks).flatMap(u => {
    const id = pressRowId(u.press)
    const at = tabState.seen.get(id)
    return at !== undefined && !undoing.has(id) && isUndoLeft(at, now) ? [{ ...u, at }] : []
  })
  const p = latestUndo(shown)?.press
  if (!p) return false
  if (p.action === 'pr-undo') void undoPr(pressRowId(p), p.ref)
  else {
    const settled = [...lists.questions, ...lists.tasks, ...lists.findings].find(
      x => 'settled' in x && x.settled.id === pressRowId(p),
    )
    if (settled && 'settled' in settled) void undo(settled.settled)
  }

  return true
}
