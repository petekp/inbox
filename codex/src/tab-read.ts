import { clipLabel } from '../../hooks/text'
import { LISTED_TABS, heldReplies, keptOpen, SETTLED_MS, keptDiscards } from '../../hooks/view'
import type { Holds } from '../../hooks/view'
import { capitalized } from '../../hooks/press-labels'
import { newRows, openRows } from './arrivals'
import type { TabView as View } from './core'
import { POLL_MS, settledIds, settledSeen } from './settle'
import { tabState, selection, drafts, entering } from './tab-state'
import { later, callTool, READ_TIMEOUT_MS } from './tab-host'
import { drawIn } from './tab-motion'
import { follow, tabWaits } from './tab-selection'
import { PAGE, swapPage } from './tab-swap'

export function applyView(next: View, seq: number) {
  if (tabState.isDisposed || seq < tabState.shown) return
  tabState.shown = seq
  tabState.readError = null
  tabState.pollFailures = 0
  tabState.readAt = Date.now()
  const before = tabState.seen
  tabState.seen = settledSeen(tabState.seen, settledIds(next), Date.now())
  if ([...tabState.seen.keys()].some(id => !before.has(id))) drawIn(SETTLED_MS)
  tabState.view = next
  const isOpening = LISTED_TABS.every(t => tabState.rowsSeen[t.id] === undefined)
  const rows = newRows(tabState.rowsSeen, next, next.isFetchingPrs)
  tabState.rowsSeen = rows.seen
  const added = [...rows.added.needsYou, ...rows.added.findings]
  for (const id of added) entering.add(id)
  for (const { id: t } of LISTED_TABS) {
    const id = !selection[t] && rows.added[t].length > 0 ? keptOpen(tabWaits(next, t), rows.added[t]) : null
    if (id) selection[t] = { id, openedAt: 0 }
  }
  follow(next, isOpening ? openRows(next) : rows.added)
  tabState.draw()
}

export async function read() {
  const generation = tabState.viewGeneration
  const seq = ++tabState.requested
  try {
    const next = await callTool<View>(
      'inbox_view',
      { demo: tabState.isDemo, tab: tabState.tab, ...holds() },
      READ_TIMEOUT_MS,
    )
    if (generation !== tabState.viewGeneration || seq < tabState.shown) return
    tabState.requestedPage = next.devPage
    if (tabState.updateError?.page !== tabState.requestedPage) tabState.updateError = null
    const isPageOld = tabState.requestedPage !== PAGE
    if (isPageOld && !tabState.updateError) void swapPage(tabState.requestedPage)
    tabState.serverNote = next.isPluginFolderGone
      ? {
          text: 'Quit and reopen Codex to load the installed inbox. Its files were moved or removed, so it still runs the version Codex started with.',
          kind: 'server-gone',
        }
      : next.serverLoadError
        ? {
            text: `The inbox server could not load its new build, so it still runs the last one. ${next.serverLoadError}`,
            kind: 'server-load-failed',
          }
        : next.serverBuild !== SERVER_BUILD && !isPageOld
          ? { text: 'This tab and the inbox server are from different builds.', kind: 'server-builds-differ' }
          : null
    applyView(next, seq)
  } catch (err) {
    if (tabState.isDisposed || generation !== tabState.viewGeneration || seq < tabState.shown) return
    if (tabState.view) tabState.pollFailures++
    else tabState.readError = failureText(err)
    tabState.draw()
  }
}

/** The host rejects with its JSON-RPC error object, not an Error. */
function failureText(err: unknown): string {
  const message =
    typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : String(err)
  const reason =
    clipLabel(
      message
        .replace(/^(Failed|Not done): /, '')
        .replace(/\s+/g, ' ')
        .trim(),
      120,
    ) || 'No reason given'

  return capitalized(/[.!?…]$/.test(reason) ? reason : `${reason}.`)
}

export async function poll() {
  if (tabState.activePresses === 0) await read()
  later(poll, POLL_MS)
}

export function replies(): Record<string, number> {
  return heldReplies(tabState.typing, Object.fromEntries(drafts))
}

export function holds(): Holds {
  tabState.discarded = keptDiscards(tabState.discarded, tabState.shownSince)

  return { replies: replies(), discarded: tabState.discarded, shownSince: tabState.shownSince }
}
