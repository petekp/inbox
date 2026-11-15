import { allRows } from '../../hooks/rows'
import { feedbackOf } from '../../hooks/feedback'
import type { TabView as View } from './core'
import type { Feedback } from '../../hooks/feedback'
import { tabState, drafts, errors, copies, sending } from './tab-state'
import { keepPressedOpen } from './tab-selection'
import { read, replies } from './tab-read'

export function isNotSent(v: View, id: string): boolean {
  return (
    allRows(v).some(r => r.id === id && r.feedback?.is === 'notSent') ||
    feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at)?.is === 'notSent'
  )
}

/** A row's saved last press, so the tab can tell when a view shows a press it has out. */
export function lastPressKey(v: View | null, id: string): string {
  return JSON.stringify(v?.lastActions[id] ?? null)
}

/**
 * The status the tab draws for its Local press while the press is out: the press's pending result, until a view shows
 * the server's record of the press, which then draws as in the other looks, such as "Starting a re-run of CI…" after
 * "Refreshing PR #12…". Null for a message, and once a view shows the press.
 */
export function outPending(v: View | null, id: string): Feedback | null {
  const out = sending.get(id)
  if (!out?.pending) return null

  return lastPressKey(v, id) === out.lastBefore ? out.pending : null
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
