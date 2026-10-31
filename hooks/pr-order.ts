import type { PrOrder, PrView, RankedPrStatus } from '../types'
import { ago } from './text'
import { failingChecks, inPrOrder, rankOf, readiness, waitingThreads } from './prs'
import { DOT, isShownSince } from './view'
import type { PressState } from './view'
import type { PrLinks } from './pr-fetch'
import { RANK_AGAIN_ID } from './pr-rows'
import { openPrViews } from './pr-views'
import type { DrawnPr } from './pr-views'
import { lastPressOf, withOut } from './pr-press'
import type { LastPress, PrAction } from './pr-press'

export const RANK_AGAIN_LABEL = 'Rank again'

/** A ranked PR's number in the agent's order, as a look draws it before the PR's title: "1. ". */
export function prRankText(rank: number): string {
  return `${rank}.\u2002`
}

/**
 * The line above the PR blocks while the agent's order ranks a block the tab draws, open or settling, as "Merge order ·
 * set by Claude 2m ago". Null otherwise.
 */
function prOrderText(order: PrLinks['prOrder'], drawn: DrawnPr[], now: number): string | null {
  const isRanking = drawn.some(d => d.rank !== null)
  if (!order || !isRanking) return null

  return `${order.label ?? 'Order'}${DOT}set by ${order.by} ${ago(now - order.at)}`
}

/** What a ranked PR's block shows, as an order records it. Read without sent threads, so a press does not change it. */
export function rankedStatusOf(pr: PrView): RankedPrStatus {
  return {
    status: readiness(pr).status,
    threads: waitingThreads(pr).map(t => t.id),
    failing: failingChecks(pr).map(c => c.name),
  }
}

/**
 * `links` with a recorded status for each open ranked PR that has a view in `views` and none recorded yet. A recorded
 * status is never replaced, so it stays what the tab showed when the order was set, or at the PR's first fetch after.
 */
export function withOrderStatuses<L extends PrLinks>(links: L, views: Record<string, PrView>): L {
  const order = links.prOrder
  const statuses = order?.statuses
  if (!order || !statuses) return links
  const added = order.refs.flatMap(ref => {
    const view = views[ref]
    return statuses[ref] || view?.state !== 'OPEN' ? [] : [[ref, rankedStatusOf(view)] as const]
  })
  if (added.length === 0) return links

  return { ...links, prOrder: { ...order, statuses: { ...statuses, ...Object.fromEntries(added) } } }
}

/** Whether a ranked PR changed since the order recorded its status: a new status, waiting thread or failing check. */
function hasChanged(was: RankedPrStatus, is: RankedPrStatus): boolean {
  return (
    is.status !== was.status ||
    is.threads.some(id => !was.threads.includes(id)) ||
    is.failing.some(name => !was.failing.includes(name))
  )
}

/** The open PRs of `prs` the order ranks and that changed since it recorded their status, in rank order. */
export function changedRankedPrs(order: PrOrder, prs: PrView[]): PrView[] {
  const statuses = order.statuses ?? {}

  return inPrOrder(prs, order.refs).filter(pr => {
    const was = statuses[pr.ref]
    return rankOf(pr, order.refs) !== null && was !== undefined && hasChanged(was, rankedStatusOf(pr))
  })
}

/**
 * The order's lines above the PR blocks: its title, the agent's reason, and the line that says how many ranked PRs
 * changed since, with Rank again.
 */
export type PrOrderView = {
  /** "Merge in this order · set by Claude 2h ago". `prOrderText`. */
  title: string
  /** The agent's reason for the order, or null for an order saved before the inbox kept one. */
  why: string | null
  /**
   * The changed line, while a ranked open PR changed or Rank again's press shows. `text` is "2 PRs changed since", or
   * null once none has. `actions` holds Rank again while one has. The line stays while the press is out or was made
   * since the tab was shown. `showsPress` says whether it draws the press's status: while the press is out, when it
   * came after the order was set, or, once the agent's new order replaced that one, until a ranked PR changes again.
   */
  changed: { text: string | null; actions: PrAction[]; showsPress: boolean } | null
}

export function prOrderView(
  order: PrOrder | null,
  drawn: DrawnPr[],
  presses: PressState,
  shownSince: number | null,
): PrOrderView | null {
  const title = prOrderText(order, drawn, presses.now)
  if (!order || title === null) return null
  const count = changedRankedPrs(order, openPrViews(drawn)).length
  const row = lastPressOf(presses, RANK_AGAIN_ID)
  const last = row.last
  const isPressShownHere = last !== undefined && (row.pressing !== null || isShownSince(last.at, shownSince))
  const isForThisOrder = last !== undefined && last.at >= order.at
  const showsPress = row.pressing !== null || isForThisOrder || (isPressShownHere && count === 0)
  const isChangedShown = count > 0 || isPressShownHere

  return {
    title,
    why: order.why,
    changed: isChangedShown
      ? {
          text: count > 0 ? `${count} ${count === 1 ? 'PR' : 'PRs'} changed since` : null,
          actions: count > 0 ? prOrderActions(row) : [],
          showsPress,
        }
      : null,
  }
}

/**
 * The changed line's buttons: Rank again. Its label reads the same after a press, since it already says "again".
 */
function prOrderActions(row: LastPress): PrAction[] {
  return withOut(row, [
    {
      press: { action: 'pr-rank-again' },
      label: RANK_AGAIN_LABEL,
      kind: 'talk',
      emphasis: 'normal',
      hotkey: 'g',
    },
  ])
}
