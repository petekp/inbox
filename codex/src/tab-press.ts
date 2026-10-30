import { allRows, feedbackOf } from '../../hooks/view'
import type { TabView as View } from './core'
import { tabState, drafts, errors, copies } from './tab-state'
import { keepPressedOpen } from './tab-selection'
import { read, replies } from './tab-read'

export function isNotSent(v: View, id: string): boolean {
  return (
    allRows(v).some(r => r.id === id && r.feedback?.is === 'notSent') ||
    feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at)?.is === 'notSent'
  )
}

export async function copy(rowId: string, c: { text: string; name: string }, isLatest: () => boolean) {
  try {
    await navigator.clipboard.writeText(c.text)
  } catch {
    if (!isLatest()) return
    // The tab's frame may not get the clipboard, so the text shows for a manual copy.
    errors.set(rowId, `Could not copy ${c.name}: this tab has no clipboard access`)
    copies.set(rowId, c)
  }
}

export function startTyping(id: string) {
  keepPressedOpen(id)
  const wasHeld = id in replies()
  if (!drafts.has(id)) drafts.set(id, { text: '', since: tabState.view?.at ?? Date.now() })
  tabState.typing = id
  tabState.focusTyping = true
  tabState.draw()
  if (wasHeld) return
  // A view requested before this did not carry this row's reply, so it would draw the row's close as final.
  tabState.shown = ++tabState.requested
  void read()
}

export function discardReply(id: string) {
  tabState.discarded = { ...tabState.discarded, [id]: Date.now() }
  drafts.delete(id)
  if (tabState.typing === id) tabState.typing = null
  tabState.draw()
  void read()
}
