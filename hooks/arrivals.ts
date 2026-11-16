import { cancelledChecks, failingChecks } from './pr-checks'
import { waitingThreads } from './prs'
import { prCheckId, prMarkId, prThreadId } from './pr-rows'
import type { DrawnPr } from './pr-views'
import { closedShown, closedTitleTone, NEEDS_YOU_GROUPS, rowResultMark, settledRowIds } from './rows'
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

/** How long a new row's title tint shows at full strength once its tab is shown, then how long it fades, in ms. */
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

/** `rows` as a look draws `tab` at `now`: that tab's rows start their clock, and rows whose tint has gone are dropped. */
export function showNewRows(rows: NewRows, tab: string, now: number): NewRows {
  const next = new Map<string, NewRow>()
  for (const [id, row] of rows) {
    const shown = row.tab === tab && row.shownAt === null ? { ...row, shownAt: now } : row
    if (newRowShare(shown, now) > 0) next.set(id, shown)
  }

  return next
}

/**
 * The new row a look draws for row `id` in `tab`, or undefined. An entry recorded for another tab draws nothing there, as
 * when a row id names a different row in another conversation.
 */
export function newRowIn(rows: NewRows, id: string, tab: string): NewRow | undefined {
  const row = rows.get(id)

  return row?.tab === tab ? row : undefined
}

/**
 * The strength of a row's tint before `TITLE_TINT` at `now`, from 1 to 0: full until its tab is shown, then full for `NEW_HOLD_MS`, then an
 * ease to 0 over `NEW_FADE_MS`. 0 for a row not new.
 */
export function newRowShare(row: NewRow | undefined, now: number): number {
  if (!row) return 0
  if (row.shownAt === null) return 1
  const p = (now - row.shownAt - NEW_HOLD_MS) / NEW_FADE_MS
  if (p >= 1) return 0
  if (p <= 0) return 1

  return (1 + Math.cos(Math.PI * p)) / 2
}

/** The strength a look that steps the fade draws: the share at the start of the step `now` is in. */
export function steppedShare(row: NewRow | undefined, now: number, steps = NEW_STEPS): number {
  if (row?.shownAt == null) return newRowShare(row, now)
  const step = NEW_FADE_MS / steps
  const faded = Math.max(0, now - row.shownAt - NEW_HOLD_MS)

  return newRowShare(row, row.shownAt + NEW_HOLD_MS + Math.floor(faded / step) * step)
}

/** How much of its tone a title takes at the start of its hold: a tint, not the tone's full color. */
export const TITLE_TINT = 0.65

/** When a look first drew each closed row, keyed `${id}:${closedAt}`, so a row closed again after Undo gets a new clock. */
export type ClosedSeen = Map<string, number>

/**
 * The clock of a closed row's title tint: the same hold and fade as a new row's, from when a look first drew the row
 * closed, so a look that learns of the close late never starts mid-fade. Undefined once the tint has gone, and for a
 * row closed longer ago than the tint lasts when the look first draws it.
 */
export function closedTitleClock(seen: ClosedSeen, id: string, closedAt: number, now: number): NewRow | undefined {
  const key = `${id}:${closedAt}`
  const total = NEW_HOLD_MS + NEW_FADE_MS
  let shownAt = seen.get(key)
  if (shownAt === undefined) {
    if (now - closedAt >= total) return undefined
    shownAt = now
    seen.set(key, shownAt)
  }

  return now - shownAt < total ? { tab: '', shownAt } : undefined
}

/** How far a title takes its tone at `now`, from 0 to `TITLE_TINT`, in the steps a look that redraws on a timer draws. */
export function steppedTitleTint(clock: NewRow | undefined, now: number): number {
  return steppedShare(clock, now) * TITLE_TINT
}

/**
 * When the next title tint in `rows` and in `v`'s closed rows ends, or null when none is left, so a look redraws until
 * then. A new row whose tab is not yet shown has no end. A closed row no look has drawn yet counts as ending a whole
 * tint from now, since its clock starts at its first draw, which this does not start.
 */
export function titleTintEndsAt(rows: NewRows, v: InboxView, seen: ClosedSeen, now: number): number | null {
  const total = NEW_HOLD_MS + NEW_FADE_MS
  const ends = [...rows.values()].flatMap(r => (r.shownAt === null ? [] : [r.shownAt + total]))
  for (const r of [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows]) {
    if (r.state.is !== 'settled' || closedTitleTone(r.state) === 'muted') continue
    const shownAt = seen.get(`${r.id}:${r.state.at}`) ?? (now - r.state.at < total ? now : undefined)
    if (shownAt !== undefined) ends.push(shownAt + total)
  }
  const next = Math.min(...ends.filter(at => at > now), Infinity)

  return next === Infinity ? null : next
}
