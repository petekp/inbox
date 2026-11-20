import {
  addNewRows,
  ARRIVAL_TABS,
  closedGroups,
  followTo,
  isPrsTabEmpty,
  isTabEmpty,
  listedRowIds,
  NEW_FADE_MS,
  NEW_HOLD_MS,
  openRowIds,
  prRowIds,
  recordRows,
  showNewRows,
  type NewRows,
} from './arrivals'
import { allRows, settledRowIds } from './rows'
import type { SessionView } from './session-view'
import { isRowTab, type ShownTab } from './tabs'
import { isListInUse, tabWaits } from './ui-controller-selection'
import {
  type HostFacts,
  type UiState,
  type UiStep,
  NO_UI_CURSOR,
  ROW_TAB_IDS,
  withCommands,
} from './ui-controller-types'
import type { Tab } from '../types'

export const newRowsOf = (ui: UiState): NewRows => new Map(Object.entries(ui.newRows))

const asRecord = (rows: NewRows) => Object.fromEntries(rows)

/** Whether the shown row tab draws only its empty text. */
function isShownEmpty(ui: UiState, view: SessionView, tab: Tab): boolean {
  if (tab === 'prs') return isPrsTabEmpty(view.prs.drawn.length, ui.host.isFetchingPrs)
  const rows = tab === 'needsYou' ? [...view.needsYou.questions, ...view.needsYou.tasks] : view.findings.rows

  return isTabEmpty({
    rows,
    settled: new Set(settledRowIds(rows)),
    closed: closedGroups(view, tab, kind => ui.unfolded.includes(kind)),
    hasBlocker: tab === 'needsYou' && ui.host.hasAsksBlocker,
  })
}

/**
 * Shows `tab` as a move the person did not make: Help closes, the tab's cursor starts over, and an open field closes
 * with its draft kept.
 */
function moveTo(ui: UiState, tab: ShownTab, now: number): UiStep {
  const selection = isRowTab(tab) ? { ...ui.selection, [tab]: NO_UI_CURSOR } : ui.selection

  return withCommands(shownTab({ ...ui, selection }, tab, now), { kind: 'tab-shown', tab })
}

/** `ui` showing `tab`. The person's own switch keeps the target tab's cursor. */
export function shownTab(ui: UiState, tab: ShownTab, now: number): UiState {
  const isChanged = tab !== ui.tab
  const newRows = ui.isVisible && isRowTab(tab) ? asRecord(showNewRows(newRowsOf(ui), tab, now)) : ui.newRows

  return {
    ...ui,
    tab,
    isHelpShown: false,
    shownSince: isChanged && ui.shownSince !== null ? now : ui.shownSince,
    typing: isChanged ? null : ui.typing,
    heldArrivals: {},
    heldClose: isChanged ? {} : ui.heldClose,
    newRows,
  }
}

export function opened(ui: UiState, now: number): UiState {
  return {
    ...ui,
    shownSince: now,
    isOpening: true,
    opensOnAsks: true,
    rowsSeen: {},
    newRows: {},
    closedSeen: {},
    heldArrivals: {},
  }
}

export function closed(ui: UiState): UiState {
  return {
    ...ui,
    shownSince: null,
    typing: null,
    isHelpShown: false,
    isOpening: false,
    opensOnAsks: false,
    heldArrivals: {},
    heldClose: {},
  }
}

/** A page that shows again only reconsiders Asks: its clocks and records go on. */
export function visible(ui: UiState, isVisible: boolean): UiState {
  return { ...ui, isVisible, opensOnAsks: ui.opensOnAsks || (isVisible && !ui.isVisible) }
}

const TINT_MS = NEW_HOLD_MS + NEW_FADE_MS

/** When the look first saw each closed row, for its title tint. Rows past their tint drop out. */
function seenClosed(ui: UiState, view: SessionView, now: number): Record<string, number> {
  const seen: Record<string, number> = {}
  for (const r of allRows(view)) {
    if (r.state.is !== 'settled') continue
    const key = `${r.id}:${r.state.at}`
    const at = ui.closedSeen[key] ?? (ui.isVisible && now - r.state.at < TINT_MS ? now : undefined)
    if (at !== undefined && now - at < TINT_MS) seen[key] = at
  }

  return seen
}

/** The rows each tab lists, and the new ones since the last read. */
export function recordTabs(ui: UiState, view: SessionView, host: HostFacts, now: number) {
  const listed = { ...listedRowIds(view), prs: host.isFetchingPrs ? null : prRowIds(view.prs.drawn) }
  const seen = Object.fromEntries(Object.entries(ui.rowsSeen).map(([t, ids]) => [t, new Set(ids)]))
  const recorded = recordRows<Tab>(seen, listed)
  const isTinting = ui.isVisible && ui.shownSince !== null
  const added = addNewRows(newRowsOf(ui), isTinting ? recorded.added : {})
  const newRows = isTinting && isRowTab(ui.tab) ? showNewRows(added, ui.tab, now) : added
  const rowsSeen = Object.fromEntries(Object.entries(recorded.seen).map(([t, ids]) => [t, [...(ids ?? [])]]))

  return {
    ui: { ...ui, host, rowsSeen, newRows: asRecord(newRows), closedSeen: seenClosed(ui, view, now) },
    added: recorded.added,
  }
}

const hasAsksWaiting = (view: SessionView) => view.needsYou.count > 0

/** The move an open makes: Asks when a row there waits, else away from an empty tab to one with open rows. */
function openingMove(ui: UiState, view: SessionView, now: number): UiStep {
  const settled = { ...ui, isOpening: false, opensOnAsks: false }
  const isOnRowTab = isRowTab(ui.tab) && !ui.isHelpShown && ui.typing === null
  if (!isOnRowTab) return withCommands(settled)
  if (ui.opensOnAsks && ui.tab !== 'needsYou' && hasAsksWaiting(view)) return moveTo(settled, 'needsYou', now)
  if (!ui.isOpening || !isShownEmpty(ui, view, ui.tab as Tab)) return withCommands(settled)
  const to = followTo(ARRIVAL_TABS, ui.tab as Tab, true, { ...openRowIds(view), prs: [] })

  return to === null ? withCommands(settled) : moveTo(settled, to, now)
}

const merged = (a: Partial<Record<Tab, string[]>>, b: Partial<Record<Tab, string[]>>) =>
  Object.fromEntries(ROW_TAB_IDS.map(t => [t, [...new Set([...(a[t] ?? []), ...(b[t] ?? [])])]])) as Record<
    Tab,
    string[]
  >

/**
 * Follows rows that arrived to another tab while the shown one is empty. While the list is in use, they wait in
 * `heldArrivals`, and a later call checks again that the tab is empty and that each held row still waits.
 */
export function follow(ui: UiState, view: SessionView, added: Partial<Record<Tab, string[]>>, now: number): UiStep {
  const tab = ui.tab
  const isFollowing = isRowTab(tab) && ui.shownSince !== null && !ui.isHelpShown
  if (!isFollowing || !isShownEmpty(ui, view, tab)) return withCommands({ ...ui, heldArrivals: {} })
  const all = merged(ui.heldArrivals, added)
  const arrivals = Object.fromEntries(
    ROW_TAB_IDS.map(t => [t, all[t].filter(id => tabWaits(ui, view, t).some(r => r.id === id && r.isWaiting))]),
  ) as Record<Tab, string[]>
  if (isListInUse(ui, now)) return withCommands({ ...ui, heldArrivals: arrivals })
  const to = followTo(ARRIVAL_TABS, tab, true, arrivals)
  const cleared = { ...ui, heldArrivals: {} }

  return to === null ? withCommands(cleared) : moveTo(cleared, to, now)
}

/** What a read does to the tabs: it records rows, makes an open's move, or follows arrivals. */
export function readTabs(ui: UiState, view: SessionView, added: Partial<Record<Tab, string[]>>, now: number): UiStep {
  if (!ui.isOpening && !ui.opensOnAsks) return follow(ui, view, added, now)
  const opening = openingMove(ui, view, now)

  return opening.commands.length > 0 ? opening : follow(opening.ui, view, added, now)
}

export const hasHeldArrivals = (ui: UiState) => Object.values(ui.heldArrivals).some(ids => (ids ?? []).length > 0)
