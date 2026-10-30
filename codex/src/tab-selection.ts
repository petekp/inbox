import { isRowTab, drawnTabOf, isGuarded, firstWaiting, listWaits, PRESS_GUARD_MS } from '../../hooks/view'
import type { RowWait, ShownTab } from '../../hooks/view'
import { prRowWaits, openPrViews } from '../../hooks/pr-tab'
import type { Tab } from '../../types'
import { ARRIVAL_TABS, followTo } from '../../hooks/arrivals'
import { isShownEmpty } from './arrivals'
import type { TabView as View } from './core'
import { drawnSettled } from './settle'
import { tabState, selection, unfolded, undoing, drawnRows } from './tab-state'
import type { Key, Row } from './tab-state'
import { drawIn } from './tab-motion'

export function switchTab(to: ShownTab) {
  if (to !== tabState.tab) tabState.shownSince = Date.now()
  tabState.tab = to
  tabState.isHelpShown = false
}

/** The tab drawn: the shown tab when the view's build draws it, else the build's first tab, and Asks while the view has no Status page, as from an older server. */
export function drawnTab(): ShownTab {
  const drawn = drawnTabOf(tabState.tab, tabState.view?.isNextBuild === true)

  return drawn === 'overview' && !tabState.view?.statusPage ? 'needsYou' : drawn
}

export function follow(v: View, added: Record<Tab, string[]>) {
  const shownTab = drawnTab()
  if (!isRowTab(shownTab)) return
  const drawn = shownSettled(v)
  const to = followTo(ARRIVAL_TABS, shownTab, isShownEmpty(v, shownTab, drawn, unfolded, v.isFetchingPrs), added)
  if (!to) return
  switchTab(to)
  selection[to] = null
}

export function tabWaits(v: View, t: Tab): RowWait[] {
  return t === 'prs' ? prRowWaits(openPrViews(v.prs.drawn), v.lastActions) : listWaits(v)[t]
}

export function shownSettled(v: View): Set<string> {
  return drawnSettled(v, tabState.shownSince, undoing)
}

export function selectedIndex(rows: Row[], t: Tab, v: View): number {
  const s = selection[t]
  if (s) {
    const at = rows.findIndex(r => r.id === s.id)
    if (at >= 0 || drawnRows.has(s.id) || rows.length === 0) return at
    const index = Math.min(s.index ?? 0, rows.length - 1)
    open(t, rows[index]!.id, index)
    return index
  }
  const id = firstWaiting(tabWaits(v, t))

  return id ? rows.findIndex(r => r.id === id) : -1
}

export function open(t: Tab, id: string, index?: number) {
  selection[t] = { id, openedAt: Date.now(), ...(index === undefined ? {} : { index }) }
  if (tabState.typing !== id) tabState.typing = null
  drawIn(PRESS_GUARD_MS)
}

export function select(t: Tab, rows: Row[], index: number) {
  const row = rows[index]
  if (!row) return
  open(t, row.id, index)
  tabState.draw()
}

export function keepPressedOpen(id: string) {
  const t = drawnTab()
  if (isRowTab(t) && !selection[t]) selection[t] = { id, openedAt: 0 }
}

export function isOpenGuarded(): boolean {
  const t = drawnTab()

  return isRowTab(t) && isGuarded(selection[t]?.openedAt ?? 0, Date.now())
}

export function rowActions(row: Row): { keys: Key[]; more: Key[] } {
  if (row.typing && tabState.typing === row.id) return { keys: [], more: [] }

  return { keys: row.keys, more: row.more }
}
