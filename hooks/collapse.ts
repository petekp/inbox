import type { RowCollapse, Session } from '../types'
import { blockingChecks } from './pr-checks'
import { prCheckId, prThreadId } from './pr-rows'
import { waitingThreads } from './prs'

type CollapseSource = Pick<Session, 'ledger' | 'prViews' | 'lastActions'> & Partial<Pick<Session, 'collapsed'>>

/** The newest thing on a row: when it arrived, and the address of its newest entry GitHub gave no time, if any. */
type News = { at: number; untimedUrl: string | null }

const latest = (...times: (number | null | undefined)[]): number =>
  Math.max(-Infinity, ...times.filter((t): t is number => typeof t === 'number'))

/**
 * The newest thing on each row a tab can list, by row id. A press on the row counts, since only the person makes one.
 * So does a question or task the agent recorded again, a finding a question gave back, a review thread's new comment,
 * and a check's new failed run.
 */
function newsByRow({ ledger, prViews, lastActions }: CollapseSource): Map<string, News> {
  const pressed = (id: string) => lastActions[id]?.at
  const prs = Object.values(prViews.views)

  return new Map([
    ...ledger.items.map(i => [i.id, { at: latest(i.reportedAt, pressed(i.id)), untimedUrl: null }] as const),
    ...ledger.findings.map(f => [f.id, { at: latest(f.reopenedAt, pressed(f.id)), untimedUrl: null }] as const),
    ...prs.flatMap(pr =>
      waitingThreads(pr).map(t => {
        const id = prThreadId(pr, t)
        const untimedUrl = t.reply && t.reply.at === null ? t.reply.url : null
        return [id, { at: latest(t.reply?.at, pressed(id)), untimedUrl }] as const
      }),
    ),
    ...prs.flatMap(pr =>
      blockingChecks(pr).map(c => {
        const id = prCheckId(pr, c)
        const untimedUrl = c.finishedAt === undefined ? (c.url ?? '') : null
        return [id, { at: latest(c.finishedAt, pressed(id)), untimedUrl }] as const
      }),
    ),
  ])
}

const isUnchanged = (news: News | undefined, c: RowCollapse) =>
  news !== undefined && news.at <= c.at && news.untimedUrl === (c.untimedUrl ?? null)

/** The rows that draw collapsed: those the person collapsed, still listed, with nothing new on them since. */
export function collapsedRows(s: CollapseSource): string[] {
  const news = newsByRow(s)

  return Object.entries(s.collapsed ?? {}).flatMap(([id, c]) => (isUnchanged(news.get(id), c) ? [id] : []))
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
  const collapse: RowCollapse = { at, ...(untimedUrl !== null && { untimedUrl }) }

  return { ...s, collapsed: isCollapsed && news.has(row) ? { ...kept, [row]: collapse } : kept }
}
