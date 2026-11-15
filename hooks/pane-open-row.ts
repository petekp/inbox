import type { UiScrollBlock } from 'claude-code'
import type { Cursor, Tab } from '../types'
import { firstWaiting, openOnArrival, rowAfterClose, type RowWait } from './action-plan'
import { NO_CURSOR, tabRowIds, tabWaits } from './pane-selection'
import { openPrViews } from './pr-views'
import { allRows, settledRowIds } from './rows'
import type { SessionView } from './session-view'
import { isGuarded } from './timing'

type Selection = Record<Tab, Cursor>

/** The rows tab `tab` lists, whether each waits, and their ids in the order the pane draws them. */
export function shownWaits(view: SessionView, tab: Tab | null): { rows: RowWait[]; ids: string[] } {
  if (tab === null) return { rows: [], ids: [] }
  const prViews = openPrViews(view.prs.drawn)

  return { rows: tabWaits(tab, view, prViews, view.lastActions), ids: tabRowIds(view, prViews)[tab] }
}

/** The id of the row a cursor opens, or would open but for a collapse: its own row, else the first that waits. */
function cursorRow(cursor: Cursor, rows: RowWait[]): string | null {
  return cursor.id ?? (cursor.openedAt === 0 ? firstWaiting(rows) : null)
}

/** What a press on a row's title or the `z` key does to row `id`, at `index` in its tab. */
type RowToggle = { is: 'select' | 'collapse' | 'expand'; id: string; index: number } | null

/**
 * A click on row `id`'s title: it opens a closed row, collapses the open one, and expands a collapsed one. A click
 * while the press guard runs after the row opened collapses nothing, so a double click leaves it open.
 */
export function titlePress(
  view: SessionView,
  tab: Tab | null,
  selection: Selection,
  now: number,
  id: string,
): RowToggle {
  if (tab === null) return null
  const { rows, ids } = shownWaits(view, tab)
  const index = ids.indexOf(id)
  if (index < 0) return null
  if (view.collapsed.includes(id)) return { is: 'expand', id, index }
  if (cursorRow(selection[tab], rows) !== id) return { is: 'select', id, index }

  return isGuarded(selection[tab].openedAt, now) ? null : { is: 'collapse', id, index }
}

/** The `z` key: collapses or expands the row the cursor is on. */
export function collapseKeyPress(view: SessionView, tab: Tab | null, selection: Selection): RowToggle {
  if (tab === null) return null
  const { rows, ids } = shownWaits(view, tab)
  const id = cursorRow(selection[tab], rows)
  const index = id === null ? -1 : ids.indexOf(id)
  if (id === null || index < 0) return null

  return { is: view.collapsed.includes(id) ? 'expand' : 'collapse', id, index }
}

/** The selection with tab `tab`'s cursor kept on row `id`, so collapsing it opens no other row. */
export const pinnedOn = (s: Selection, tab: Tab, id: string, index: number): Selection =>
  s[tab].id === id ? s : { ...s, [tab]: { id, index, openedAt: 0 } }

/**
 * The selection once rows arrived, as `openOnArrival` says, and the tabs whose open row it changed. A tab whose cursor
 * the person closed, or the PRs tab with no cursor, keeps it.
 */
export function arrivedSelection(
  view: SessionView,
  added: Record<Tab, readonly string[]>,
  s: Selection,
): { selection: Selection; opened: Tab[] } {
  const prViews = openPrViews(view.prs.drawn)
  const ids = tabRowIds(view, prViews)
  const opened = (Object.keys(s) as Tab[]).flatMap(t => {
    const c = s[t]
    const isKept = c.id === null && (c.openedAt !== 0 || t === 'prs')
    const id = isKept ? null : openOnArrival(tabWaits(t, view, prViews, view.lastActions), c.id, added[t])
    return id === null ? [] : [{ t, cursor: { id, index: ids[t].indexOf(id), openedAt: 0 } }]
  })

  return {
    selection: opened.length === 0 ? s : { ...s, ...Object.fromEntries(opened.map(o => [o.t, o.cursor])) },
    opened: opened.map(o => o.t),
  }
}

/** Once rows left, each tab whose cursor rested on one opens the row now at its index. Null when none moved. */
export function leftRowsSelection(view: SessionView, now: number, s: Selection): Selection | null {
  const ids = tabRowIds(view, openPrViews(view.prs.drawn))
  const settled = new Set(settledRowIds(allRows(view)))
  let isMoved = false
  const moved = Object.fromEntries(
    (Object.keys(s) as Tab[]).map(t => {
      const c = s[t]
      const list = ids[t]
      if (c.id === null || list.includes(c.id) || settled.has(c.id)) return [t, c]
      isMoved = true
      const index = Math.min(c.index, list.length - 1)
      return [t, index < 0 ? NO_CURSOR : { id: list[index]!, index, openedAt: now }]
    }),
  ) as Selection

  return isMoved ? moved : null
}

/**
 * Where the cursor goes once the open row `id` stopped waiting: the row `rowAfterClose` gives, at `index`, or none.
 * `undoBlock` is where the pane scrolls the row's Undo. Null when the cursor stays.
 */
export function closeMove(
  view: SessionView,
  tab: Tab | null,
  selection: Selection,
  id: string,
  wasWaiting: boolean,
): { following: string | null; index: number; undoBlock: UiScrollBlock } | null {
  const { rows, ids } = shownWaits(view, tab)
  if (tab === null || !wasWaiting || selection[tab].id !== id || rows.find(r => r.id === id)?.isWaiting) return null
  const following = rowAfterClose(rows, id)
  const isBelow = rows.findIndex(r => r.id === following) > rows.findIndex(r => r.id === id)

  return {
    following,
    index: following === null ? -1 : ids.indexOf(following),
    undoBlock: following === null ? 'nearest' : isBelow ? 'start' : 'end',
  }
}
