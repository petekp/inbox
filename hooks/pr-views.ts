import type { LastAction, PrView, PrViews } from '../types'
import { inPrOrder, rankOf } from './prs'
import { closedRowState } from './rows'
import { isSettledInPlace, isShownSince } from './timing'
import type { SettledState } from './rows'
import type { ViewInput } from './view'
import { isLeftOut, splitLinked } from './pr-fetch'
import type { PrLinks } from './pr-fetch'
import { prMarkId } from './pr-rows'

/** The label of a dismissed PR's block while its Undo lasts. */
export const PR_DISMISSED_LABEL = 'Dismissed'

export function isTracked(prState: PrViews, links: PrLinks, ref: string): boolean {
  return splitLinked(prState, links).tracked.includes(ref) || prState.branchRef === ref
}

/** Whether the session keeps a PR's view: the tab tracks the PR, or it is linked and left out, which keeps a fetch from reading it again. */
function keepsView(prState: PrViews, links: PrLinks, ref: string): boolean {
  return isTracked(prState, links, ref) || (links.prs.includes(ref) && isLeftOut(prState, ref))
}

/** When the PR was dismissed, or null when its last press did not dismiss it. */
function dismissedAt(lastActions: Record<string, LastAction>, ref: string): number | null {
  const mark = lastActions[prMarkId(ref)]

  return mark?.action === 'pr-dismiss' ? mark.at : null
}

export function isDismissed(lastActions: Record<string, LastAction>, ref: string): boolean {
  return dismissedAt(lastActions, ref) !== null
}

/**
 * Whether a session keeps a PR's view: `keepsView` keeps it, or the PR was dismissed while the look shows the PRs tab,
 * so its settled block and Undo can draw it. Once the person leaves the tab, the block is gone and so is the view.
 */
export function isViewKept(
  prState: PrViews,
  links: PrLinks,
  lastActions: Record<string, LastAction>,
  ref: string,
  shownSince: number | null,
): boolean {
  const at = dismissedAt(lastActions, ref)

  return keepsView(prState, links, ref) || (at !== null && isShownSince(at, shownSince))
}

/**
 * A PR block a look draws: a tracked PR, which is open, or a PR dismissed while the look shows the PRs tab, which
 * settles in place as a dismissed row does. `rank` is its number in the agent's order, from 1, or null when the order
 * does not rank it. A look draws it before an open block's title.
 */
export type DrawnPr = { pr: PrView; state: { is: 'open' } | SettledState; rank: number | null }

/** The PRs of the drawn blocks that are not settled. */
export function openPrViews(drawn: DrawnPr[]): PrView[] {
  return drawn.filter(d => d.state.is === 'open').map(d => d.pr)
}

const DISMISSED_PR = { how: 'dismissed', outcome: PR_DISMISSED_LABEL } as const

/**
 * The PR blocks a look draws, in order. A PR dismissed while the look shows the PRs tab stays as a settled block as
 * long as a settled row would, by `isSettledInPlace`, and offers Undo for `settleWindowMs`.
 */
export function drawnPrs(
  prState: PrViews,
  links: PrLinks,
  lastActions: Record<string, LastAction>,
  now: number,
  settleWindowMs: number,
  placing: Pick<ViewInput, 'shownSince' | 'lastTypedMessageAt'>,
): DrawnPr[] {
  const ranked = links.prOrder?.refs ?? []
  const drawn = inPrOrder(Object.values(prState.views), ranked).flatMap((pr): Omit<DrawnPr, 'rank'>[] => {
    if (isTracked(prState, links, pr.ref)) return [{ pr, state: { is: 'open' } }]
    const at = dismissedAt(lastActions, pr.ref)
    if (at === null) return []
    const state = closedRowState(DISMISSED_PR, at, now, settleWindowMs, null)

    return isSettledInPlace(state, placing) ? [{ pr, state }] : []
  })
  let rank = 0

  return drawn.map(d => ({ ...d, rank: rankOf(d.pr, ranked) === null ? null : ++rank }))
}
