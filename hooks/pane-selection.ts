import type { UiScrollBlock } from 'claude-code'
import type { Closed, Cursor, FoldKind, LastAction, PrView, RowNote, Tab } from '../types'
import type { SessionView } from './session-view'
import { type DrawnPr, prRowWaits } from './pr-tab'
import {
  allRows,
  drawnLists,
  type InboxView,
  listWaits,
  NEEDS_YOU_GROUPS,
  type ResultMark,
  type RowWait,
  SETTLED_MS,
  type settledLabel,
  type ShownTab,
} from './view'

/** The tab the pane shows, whether it shows the sample, and since when. */
export type Shown = { tab: ShownTab; isDemo: boolean; since: number }
export const NO_CURSOR: Cursor = { id: null, index: 0, openedAt: 0 }
export const NO_SELECTION: Record<Tab, Cursor> = { needsYou: NO_CURSOR, findings: NO_CURSOR, prs: NO_CURSOR }
/** How many times the terminal pane redraws while Undo's fill drains, two for each cell of the fill. */
export const UNDO_REDRAW_STEPS = 24
export const RESIZE_SCROLL_MS = 100
export const FOLD_KINDS: FoldKind[] = [...NEEDS_YOU_GROUPS.map(g => g.kind), 'issue', 'opportunity']
export type PendingUndoScroll = {
  key: string
  tab: Tab
  cursor: Cursor
  block: UiScrollBlock
  expiresAt: number
  sessionId: string
  revealUndo: boolean
}

/** When the last Undo the view offers ends, or null when it offers none. */
export function lastUndoEnd(view: SessionView): number | null {
  const ends = [...allRows(view).map(r => r.state), ...view.prs.drawn.map(d => d.state)].flatMap(state =>
    state.is === 'settled' && state.canUndo ? [state.at + SETTLED_MS] : [],
  )

  return ends.length > 0 ? Math.max(...ends) : null
}

/**
 * What a caller knows about the showing: `isOpen` when it knows whether the pane shows, and `since` when a showing
 * starts then even on the same tab, as when another conversation loads.
 */
export type Showing = { isOpen?: boolean; since?: number }

export function sameCursor(a: Cursor, b: Cursor): boolean {
  return a.id === b.id && a.index === b.index && a.openedAt === b.openedAt
}

export function settledLayoutId(
  tab: Tab,
  view: InboxView,
  prs: DrawnPr[],
  lastActions: Record<string, LastAction>,
  notes: Record<string, RowNote>,
  now: number,
  size: string | null,
): string {
  const rows =
    tab === 'needsYou'
      ? [...view.needsYou.questions, ...view.needsYou.tasks]
      : tab === 'findings'
        ? view.findings.rows
        : []
  return JSON.stringify([
    size,
    ...rows.map(r => r.id),
    ...rows.flatMap(r => (r.state.is === 'settled' ? [[r.id, r.state.at]] : [])),
    ...(tab === 'prs' ? prs.map(x => [x.pr.ref, x.state.is === 'settled' ? x.state.at : null]) : []),
    ...Object.entries(lastActions).flatMap(([id, action]) =>
      action.result ? [[id, action.result.at, now - action.result.at < SETTLED_MS]] : [],
    ),
    ...Object.entries(notes).map(([id, note]) => [id, note.at, now - note.at < SETTLED_MS]),
  ])
}

export function settledScrollKey(key: string, layout: string): string {
  return `scroll-${key}-${layout}`
}

export function selectedIndex(
  ids: string[],
  cursor: Cursor,
  top: string | null,
  isSettled: (id: string) => boolean,
): number {
  if (cursor.id !== null) {
    const at = ids.indexOf(cursor.id)
    if (at >= 0 || isSettled(cursor.id)) return at
    return ids.length === 0 ? -1 : Math.min(cursor.index, ids.length - 1)
  }

  return cursor.openedAt === 0 && top !== null ? ids.indexOf(top) : -1
}

export function tabWaits(
  tab: Tab,
  view: InboxView,
  prViews: PrView[],
  lastActions: Record<string, LastAction>,
): RowWait[] {
  return tab === 'prs' ? prRowWaits(prViews, lastActions) : listWaits(view)[tab]
}

export function tabRowIds(view: InboxView, prViews: PrView[]): Record<Tab, string[]> {
  const listed = drawnLists(
    view,
    () => false,
    r => r.id,
  ).byTab

  return { ...listed, prs: prRowWaits(prViews, {}).map(r => r.id) }
}

export type ClosedLine = Pick<Closed, 'id' | 'ask' | 'at'> & {
  outcomeLabel: string
  delivery: Parameters<typeof settledLabel>[1]
  mark: ResultMark
}
