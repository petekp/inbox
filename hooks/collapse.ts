import type { Session } from '../types'
import { blockingChecks } from './pr-checks'
import { prCheckId, prThreadId } from './pr-rows'
import { waitingThreads } from './prs'

type CollapseSource = Pick<Session, 'collapsed' | 'ledger' | 'prViews' | 'lastActions'>

const latest = (...times: (number | null | undefined)[]): number =>
  Math.max(-Infinity, ...times.filter((t): t is number => typeof t === 'number'))

/**
 * When something new last arrived on each row a tab can list, by row id. A press on the row counts, since only the
 * person makes one. So does a question or task the agent recorded again, a review thread's new comment, and a check's
 * new failed run.
 */
function newsByRow({ ledger, prViews, lastActions }: CollapseSource): Map<string, number> {
  const pressed = (id: string) => lastActions[id]?.at
  const prs = Object.values(prViews.views)

  return new Map([
    ...ledger.items.map(i => [i.id, latest(i.reportedAt, pressed(i.id))] as const),
    ...ledger.findings.map(f => [f.id, latest(pressed(f.id))] as const),
    ...prs.flatMap(pr =>
      waitingThreads(pr).map(t => {
        const id = prThreadId(pr, t)
        return [id, latest(t.reply?.at, pressed(id))] as const
      }),
    ),
    ...prs.flatMap(pr =>
      blockingChecks(pr).map(c => {
        const id = prCheckId(pr, c)
        return [id, latest(c.finishedAt, pressed(id))] as const
      }),
    ),
  ])
}

/** The rows that draw collapsed: those the person collapsed, still listed, with nothing new on them since. */
export function collapsedRows(s: CollapseSource): string[] {
  const news = newsByRow(s)

  return Object.entries(s.collapsed).flatMap(([id, at]) => ((news.get(id) ?? Infinity) <= at ? [id] : []))
}

/** `s` with `row` collapsed at `at`, or expanded. It keeps only the entries of rows a tab can still list. */
export function withCollapse<S extends CollapseSource>(s: S, row: string, isCollapsed: boolean, at: number): S {
  const news = newsByRow(s)
  const kept = Object.fromEntries(Object.entries(s.collapsed).filter(([id]) => id !== row && news.has(id)))

  return { ...s, collapsed: isCollapsed && news.has(row) ? { ...kept, [row]: at } : kept }
}
