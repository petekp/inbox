import type { RowCollapse, Session } from '../../types'
import { blockingChecks } from '../domain/pr-checks'
import { prCheckId, prThreadId } from './pr-rows'
import { waitingThreads } from '../domain/prs'
import { waitingUnderParents } from './status-folds'

type CollapseSource = Pick<Session, 'ledger' | 'prViews' | 'lastActions'> & Partial<Pick<Session, 'collapsed'>>

/**
 * The newest thing on a row: when it arrived, the address of its newest entry GitHub gave no time, if any, and for a
 * Status parent, the ids of what waits on the person under it.
 */
type News = { at: number; untimedUrl: string | null; waiting: string[] }

const latest = (...times: (number | null | undefined)[]): number =>
  Math.max(-Infinity, ...times.filter((t): t is number => typeof t === 'number'))

/**
 * The newest thing on each row a tab can list, by row id. A press on the row counts, since only the person makes one.
 * So does a question or task the agent recorded again, a finding a question gave back, a review thread's new comment,
 * and a check's new failed run. A Status parent's news is what waits on the person under it.
 */
function newsByRow({ ledger, prViews, lastActions }: CollapseSource): Map<string, News> {
  const pressed = (id: string) => lastActions[id]?.at
  const prs = Object.values(prViews.views)

  const timed = (at: number, untimedUrl: string | null = null): News => ({ at, untimedUrl, waiting: [] })

  return new Map([
    ...ledger.items.map(i => [i.id, timed(latest(i.reportedAt, pressed(i.id)))] as const),
    ...ledger.findings.map(f => [f.id, timed(latest(f.reopenedAt, pressed(f.id)))] as const),
    ...prs.flatMap(pr =>
      waitingThreads(pr).map(t => {
        const id = prThreadId(pr, t)
        const untimedUrl = t.reply && t.reply.at === null ? t.reply.url : null
        return [id, timed(latest(t.reply?.at, pressed(id)), untimedUrl)] as const
      }),
    ),
    ...prs.flatMap(pr =>
      blockingChecks(pr).map(c => {
        const id = prCheckId(pr, c)
        const untimedUrl = c.finishedAt === undefined ? (c.url ?? '') : null
        return [id, timed(latest(c.finishedAt, pressed(id)), untimedUrl)] as const
      }),
    ),
    ...[...waitingUnderParents(ledger)].map(
      ([id, waiting]) => [id, { at: -Infinity, untimedUrl: null, waiting }] as const,
    ),
  ])
}

const isUnchanged = (news: News | undefined, c: RowCollapse) =>
  news !== undefined &&
  news.at <= c.at &&
  news.untimedUrl === (c.untimedUrl ?? null) &&
  news.waiting.every(id => c.waiting?.includes(id))

/** The rows that draw collapsed: those the person collapsed, still listed, with nothing new on them since. */
export function collapsedRows(s: CollapseSource): string[] {
  const news = newsByRow(s)

  return Object.entries(s.collapsed ?? {}).flatMap(([id, c]) => (isUnchanged(news.get(id), c) ? [id] : []))
}

/**
 * `s`'s collapses as a write saves them. A row that opened because something new arrived on it, or that no tab lists,
 * loses its entry, so it stays open. A Status parent's entry keeps only the ids still waiting under it, so one that
 * waits again counts as new.
 */
export function settledCollapses<S extends CollapseSource>(s: S): S {
  if (s.collapsed === undefined) return s
  const news = newsByRow(s)
  let isChanged = false
  const kept = Object.entries(s.collapsed).flatMap(([id, c]): [string, RowCollapse][] => {
    const n = news.get(id)
    if (!isUnchanged(n, c)) {
      isChanged = true
      return []
    }
    const waiting = c.waiting?.filter(w => n?.waiting.includes(w)) ?? []
    if (waiting.length === (c.waiting?.length ?? 0)) return [[id, c]]
    isChanged = true
    const settled: RowCollapse = { at: c.at, ...(c.untimedUrl !== undefined && { untimedUrl: c.untimedUrl }) }
    return [[id, waiting.length > 0 ? { ...settled, waiting } : settled]]
  })

  return isChanged ? { ...s, collapsed: Object.fromEntries(kept) } : s
}

/** `s` with `row` collapsed at `at`, or expanded. It keeps only the entries of rows a tab can still list. */
export function withCollapse<S extends CollapseSource>(
  s: S,
  row: string,
  isCollapsed: boolean,
  at: number,
): S & Pick<Session, 'collapsed'> {
  const news = newsByRow(s)
  const kept = Object.fromEntries(Object.entries(s.collapsed ?? {}).filter(([id]) => id !== row && news.has(id)))
  const untimedUrl = news.get(row)?.untimedUrl ?? null
  const waiting = news.get(row)?.waiting ?? []
  const collapse: RowCollapse = {
    at,
    ...(untimedUrl !== null && { untimedUrl }),
    ...(waiting.length > 0 && { waiting }),
  }

  return { ...s, collapsed: isCollapsed && news.has(row) ? { ...kept, [row]: collapse } : kept }
}
