import type { UiScrollBlock } from 'claude-code'
import type { Closed, FoldKind, LastAction, PrView, RowNote, Tab } from '../../types'
import { prRowWaits } from '../../core/view/pr-rows'
import type { DrawnPr } from '../../core/view/pr-views'
import { NEEDS_YOU_GROUPS, type ResultMark, type settledLabel } from '../../core/view/rows'
import { drawnLists } from '../../core/view/action-plan'
import { type InboxView } from '../../core/view/view'
import { SETTLED_MS } from '../../core/view/timing'

export const RESIZE_SCROLL_MS = 100
export const FOLD_KINDS: FoldKind[] = [...NEEDS_YOU_GROUPS.map(g => g.kind), 'issue', 'opportunity']
/**
 * The Undo the inline terminal keeps in view after a press closed row `rowId`. Its block follows where the cursor went:
 * below the closed row scrolls the Undo to the top, above it to the bottom.
 */
export type PendingUndoScroll = {
  key: string
  rowId: string
  tab: Tab
  expiresAt: number
  sessionId: string
  revealUndo: boolean
}

/** Where to scroll the Undo of the row `closedId` when the cursor is on `openId`. */
export function undoBlockOf(ids: string[], closedId: string, openId: string | null): UiScrollBlock {
  const [open, closed] = [ids.indexOf(openId ?? ''), ids.indexOf(closedId)]

  return open < 0 || closed < 0 ? 'nearest' : open > closed ? 'start' : 'end'
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

export function tabRowIds(view: InboxView, prViews: PrView[]): Record<Tab, string[]> {
  const listed = drawnLists(
    view,
    () => false,
    r => r.id,
  ).byTab

  return { ...listed, prs: prRowWaits(prViews, {}).map(r => r.id) }
}

export type ClosedLine = Pick<Closed, 'id' | 'ask' | 'at' | 'how'> & {
  canRestore?: boolean
  outcomeLabel: string
  delivery: Parameters<typeof settledLabel>[1]
  mark: ResultMark
}
