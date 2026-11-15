import { cancelledChecks, failingChecks } from './pr-checks'
import { waitingThreads } from './prs'
import { prCheckId, prMarkId, prThreadId } from './pr-rows'
import type { DrawnPr } from './pr-views'
import { closedShown, NEEDS_YOU_GROUPS, rowResultMark, settledRowIds } from './rows'
import { FINDING_GROUPS } from './help'
import { ROW_TABS } from './tabs'
import type { InboxView } from './view'
import type { ResultMark, RowView } from './rows'
import type { Finding, FoldKind, Tab } from '../types'

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

/**
 * Whether a row tab draws a running mark: a row whose answer is on its way or whose Talk press the agent works on, or
 * such a line in an unfolded Closed list.
 */
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
 * The PRs tab's row ids: each drawn PR's mark, and for a PR not settled, its waiting threads and its failing and
 * cancelled checks. A new
 * PR counts as a new row through its mark.
 */
export function prRowIds(drawn: readonly DrawnPr[]): string[] {
  return drawn.flatMap(({ pr, state }) => [
    prMarkId(pr.ref),
    ...(state.is === 'settled'
      ? []
      : [
          ...waitingThreads(pr).map(t => prThreadId(pr, t)),
          ...[...failingChecks(pr), ...cancelledChecks(pr)].map(c => prCheckId(pr, c)),
        ]),
  ])
}

/** True while no PR is drawn and the fetch is done, so the PRs tab shows only its empty text. */
export function isPrsTabEmpty(drawnCount: number, isFetching: boolean): boolean {
  return drawnCount === 0 && !isFetching
}

/** How long a new row's bar shows at full strength once its tab is shown, then how long it fades, in ms. */
export const NEW_HOLD_MS = 1500
export const NEW_FADE_MS = 3000
/** The colors a look that redraws on a timer steps the fade through. */
export const NEW_STEPS = 6

/** A new row: the tab that lists it, and when that tab was first shown in an open look after it arrived. */
export type NewRow = { tab: string; shownAt: number | null }
export type NewRows = ReadonlyMap<string, NewRow>

/** `rows` with the rows `added` names, by tab. A row already there keeps its clock. */
export function addNewRows(rows: NewRows, added: Partial<Record<string, readonly string[]>>): NewRows {
  const next = new Map(rows)
  for (const [tab, ids] of Object.entries(added))
    for (const id of ids ?? []) if (!next.has(id)) next.set(id, { tab, shownAt: null })

  return next
}

/** `rows` as a look draws `tab` at `now`: that tab's rows start their clock, and rows whose bar has gone are dropped. */
export function showNewRows(rows: NewRows, tab: string, now: number): NewRows {
  const next = new Map<string, NewRow>()
  for (const [id, row] of rows) {
    const shown = row.tab === tab && row.shownAt === null ? { ...row, shownAt: now } : row
    if (newRowShare(shown, now) > 0) next.set(id, shown)
  }

  return next
}

/**
 * The strength of a row's bar at `now`, from 1 to 0: full until its tab is shown, then full for `NEW_HOLD_MS`, then an
 * ease to 0 over `NEW_FADE_MS`. With `isReduced`, it stays full for the whole time and then ends. 0 for a row not new.
 */
export function newRowShare(row: NewRow | undefined, now: number, isReduced = false): number {
  if (!row) return 0
  if (row.shownAt === null) return 1
  const p = (now - row.shownAt - NEW_HOLD_MS) / NEW_FADE_MS
  if (p >= 1) return 0
  if (isReduced || p <= 0) return 1

  return (1 + Math.cos(Math.PI * p)) / 2
}

/** The strength a look that steps the fade draws: the share at the start of the step `now` is in. */
export function steppedShare(row: NewRow | undefined, now: number, steps = NEW_STEPS): number {
  if (row?.shownAt == null) return newRowShare(row, now)
  const step = NEW_FADE_MS / steps
  const faded = Math.max(0, now - row.shownAt - NEW_HOLD_MS)

  return newRowShare(row, row.shownAt + NEW_HOLD_MS + Math.floor(faded / step) * step)
}

/** Whether a shown row's bar still moves, so a look that redraws on a timer keeps redrawing. */
export function isNewRowFading(rows: NewRows, now: number): boolean {
  return [...rows.values()].some(r => r.shownAt !== null && newRowShare(r, now) > 0)
}
