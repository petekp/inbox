import type { LastAction, PrView, PrViews } from '../types'
import { inPrOrder, rankOf } from './prs'
import { closedRowState } from './rows'
import { isSettledInPlace, isShownSince, isUndoLeft } from './timing'
import type { SettledState } from './rows'
import type { Placing } from './timing'
import { isLeftOut, splitLinked, tabPrs } from './pr-fetch'
import type { PrLinks } from './pr-fetch'
import { prMarkId } from './pr-rows'
import type { PrPress } from './pr-press'

/** The label of a dismissed PR's block while it settles. */
export const PR_DISMISSED_LABEL = 'Dismissed'
/** The labels of a PR's block that settles because a fetch found it merged, or closed without merging. */
export const PR_MERGED_LABEL = 'Merged'
export const PR_CLOSED_LABEL = 'Closed'

export function isTracked(prState: PrViews, links: PrLinks, ref: string): boolean {
  return splitLinked(prState, links).tracked.includes(ref) || prState.branchRef === ref
}

/** Whether the session keeps a PR's view: the tab tracks the PR, or it is on the tab and left out, which keeps a fetch from reading it again. */
function keepsView(prState: PrViews, links: PrLinks, ref: string): boolean {
  return isTracked(prState, links, ref) || (tabPrs(links).includes(ref) && isLeftOut(prState, ref))
}

/** The PR's Dismiss, by the person or by a fetch that found it finished, or null when its last press did not dismiss it. */
function dismissal(lastActions: Record<string, LastAction>, ref: string): LastAction | null {
  const mark = lastActions[prMarkId(ref)]

  return mark?.action === 'pr-dismiss' ? mark : null
}

function dismissedAt(lastActions: Record<string, LastAction>, ref: string): number | null {
  return dismissal(lastActions, ref)?.at ?? null
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
 * settles in place as a dismissed row does. `isRanked` says whether the agent's order ranks it. Ranked blocks draw
 * first, and a look starts the rest with `otherPrsStart`.
 */
export type DrawnPr = { pr: PrView; state: { is: 'open' } | SettledState; isRanked: boolean }

/** The PRs of the drawn blocks that are not settled. */
export function openPrViews(drawn: DrawnPr[]): PrView[] {
  return drawn.filter(d => d.state.is === 'open').map(d => d.pr)
}

/**
 * How a settled block reads and marks its close: ✓ for a merge, the lapsed mark for a PR closed without one, ✕ for
 * the person's Dismiss. Each offers Undo while it lasts, which keeps the PR on the tab.
 */
function settledPrState(mark: LastAction, now: number, settleWindowMs: number): SettledState {
  const closed =
    mark.text === PR_MERGED_LABEL
      ? ({ how: 'update', outcome: PR_MERGED_LABEL } as const)
      : mark.text === PR_CLOSED_LABEL
        ? ({ how: 'expired', outcome: PR_CLOSED_LABEL } as const)
        : ({ how: 'dismissed', outcome: PR_DISMISSED_LABEL } as const)
  const state = closedRowState(closed, mark.at, now, settleWindowMs, null)

  return { ...state, canUndo: isUndoLeft(mark.at, now, settleWindowMs), offersUndo: true }
}

/**
 * The PR blocks a look draws, in order. A PR dismissed while the look shows the PRs tab stays as a settled block as
 * long as a settled row would, by `isSettledInPlace`, and offers Undo for `settleWindowMs`.
 */
export function drawnPrs(
  prState: PrViews,
  links: PrLinks,
  lastActions: Record<string, LastAction>,
  placing: Placing,
): DrawnPr[] {
  const { now, settleWindowMs } = placing
  const ranked = links.prOrder?.refs ?? []
  const drawn = inPrOrder(Object.values(prState.views), ranked).flatMap((pr): Omit<DrawnPr, 'isRanked'>[] => {
    if (isTracked(prState, links, pr.ref)) return [{ pr, state: { is: 'open' } }]
    const mark = dismissal(lastActions, pr.ref)
    if (mark === null) return []
    const state = settledPrState(mark, now, settleWindowMs)

    return isSettledInPlace(state, placing, prMarkId(pr.ref)) ? [{ pr, state }] : []
  })

  return drawn.map(d => ({ ...d, isRanked: rankOf(d.pr, ranked) !== null }))
}

/**
 * The mark id of the settled PR block whose Undo a press leaves for the terminal's undo key: the block its Dismiss
 * settled, or the last drawn block of those Clear merged and closed settled, which share the newest Undo. That is the
 * Undo the undo key takes. Null for any other press, or when no such block draws.
 */
export function prUndoBlockAfter(drawn: DrawnPr[], p: PrPress): string | null {
  if (p.action === 'pr-dismiss')
    return drawn.some(d => d.pr.ref === p.ref && d.state.is === 'settled') ? prMarkId(p.ref) : null
  if (p.action !== 'pr-clear-finished') return null
  const undos = drawn.flatMap(d =>
    d.state.is === 'settled' && d.state.canUndo ? [{ ref: d.pr.ref, at: d.state.at }] : [],
  )
  const newestAt = Math.max(...undos.map(u => u.at))
  const last = undos.filter(u => u.at === newestAt).at(-1)

  return last ? prMarkId(last.ref) : null
}
