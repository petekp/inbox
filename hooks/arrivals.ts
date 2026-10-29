import { failingChecks, waitingThreads } from './prs'
import { prCheckId, prMarkId, prThreadId } from './pr-tab'
import type { DrawnPr } from './pr-tab'
import { closedShown, FINDING_GROUPS, NEEDS_YOU_GROUPS, ROW_TABS, rowResultMark, settledRowIds } from './view'
import type { InboxView, ResultMark, RowView } from './view'
import type { Finding, FoldKind, PrView, Tab } from '../types'

export type RowRecord<T extends string> = Partial<Record<T, ReadonlySet<string>>>

/**
 * Records each tab's listed row ids, and returns by tab the ids its last record did not have. A tab listed as
 * null is loading: it keeps its record and adds nothing. A tab with no record adds nothing, so the first view
 * does not count its rows as new.
 */
export function recordRows<T extends string>(
  seen: RowRecord<T>,
  listed: Record<T, string[] | null>,
): { seen: RowRecord<T>; added: Record<T, string[]> } {
  const next: RowRecord<T> = { ...seen }
  const added = {} as Record<T, string[]>
  for (const tab of Object.keys(listed) as T[]) {
    const ids = listed[tab]
    const before = seen[tab]
    added[tab] = ids && before ? ids.filter(id => !before.has(id)) : []
    if (ids) next[tab] = new Set(ids)
  }

  return { seen: next, added }
}

export type ListedTab = 'needsYou' | 'findings'

/** The tabs a look moves between when rows arrive: every row tab. A page tab has no rows to arrive. */
export const ARRIVAL_TABS: readonly Tab[] = ROW_TABS.map(t => t.id)

/** Each tab's row ids in a view, settled rows included, so a row Undo brings back is not new. */
export function listedRowIds(v: InboxView): Record<ListedTab, string[]> {
  return {
    needsYou: [...v.needsYou.questions, ...v.needsYou.tasks].map(r => r.id),
    findings: v.findings.rows.map(r => r.id),
  }
}

/** Each tab's row ids that are not settled: the rows a look moves to as it opens. */
export function openRowIds(v: InboxView): Record<ListedTab, string[]> {
  const open = (rows: RowView[]) => rows.filter(r => r.state.is !== 'settled').map(r => r.id)

  return { needsYou: open([...v.needsYou.questions, ...v.needsYou.tasks]), findings: open(v.findings.rows) }
}

/** The tab's Closed folds, for `isTabEmpty`. */
export function closedGroups(
  v: InboxView,
  tab: ListedTab,
  isUnfolded: (kind: FoldKind) => boolean,
): { isUnfolded: boolean; rows: readonly { id: string; mark: ResultMark }[] }[] {
  return tab === 'findings'
    ? (Object.keys(FINDING_GROUPS) as Finding['kind'][]).map(kind => ({
        isUnfolded: isUnfolded(kind),
        rows: v.findings.closed.filter(f => f.kind === kind),
      }))
    : NEEDS_YOU_GROUPS.map(g => ({ isUnfolded: isUnfolded(g.kind), rows: v.needsYou.closed[g.list] }))
}

/** Whether a row tab draws a running mark: a row whose answer is on its way, or such a line in an unfolded Closed list. */
export function isRowTabRunning(v: InboxView, tab: ListedTab, isUnfolded: (kind: FoldKind) => boolean): boolean {
  const rows = tab === 'needsYou' ? [...v.needsYou.questions, ...v.needsYou.tasks] : v.findings.rows
  const settled = new Set(settledRowIds(rows))
  const closed = closedGroups(v, tab, isUnfolded).flatMap(g => (g.isUnfolded ? closedShown(g.rows, settled) : []))

  return rows.some(r => rowResultMark(r)?.isRunning) || closed.some(d => d.mark.isRunning)
}

export function isTabEmpty({
  rows,
  settled,
  closed,
  hasBlocker,
}: {
  rows: readonly Pick<RowView, 'id' | 'state'>[]
  settled: ReadonlySet<string>
  closed: readonly { isUnfolded: boolean; rows: readonly { id: string }[] }[]
  hasBlocker: boolean
}): boolean {
  return (
    !hasBlocker &&
    !rows.some(r => r.state.is !== 'settled' || settled.has(r.id)) &&
    !closed.some(g => g.isUnfolded && g.rows.some(r => !settled.has(r.id)))
  )
}

/**
 * The tab to move to for `rows`, the rows that just appeared, or as a look opens, the rows each tab lists: while the
 * shown tab shows only its empty text, the first other tab in `tabs` with rows. Null when the look stays.
 */
export function followTo<T extends string>(
  tabs: readonly T[],
  shown: T,
  isShownEmpty: boolean,
  rows: Record<T, string[]>,
): T | null {
  return isShownEmpty ? (tabs.find(t => t !== shown && rows[t].length > 0) ?? null) : null
}

/**
 * The PRs tab's row ids: each drawn PR's mark, and for a PR not settled, its waiting threads and failing checks. A new
 * PR counts as a new row through its mark.
 */
export function prRowIds(drawn: readonly DrawnPr[]): string[] {
  return drawn.flatMap(({ pr, state }) => [
    prMarkId(pr.ref),
    ...(state.is === 'settled'
      ? []
      : [...waitingThreads(pr).map(t => prThreadId(pr, t)), ...failingChecks(pr).map(c => prCheckId(pr, c))]),
  ])
}

/** True while no PR is drawn and the fetch is done, so the PRs tab shows only its empty text. */
export function isPrsTabEmpty(drawnCount: number, isFetching: boolean): boolean {
  return drawnCount === 0 && !isFetching
}
