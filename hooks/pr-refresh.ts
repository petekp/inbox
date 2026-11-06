import type { PrFetchFailure, PrViews } from '../types'
import { pressFeedbackIn } from './feedback'
import type { PressState } from './feedback'
import { GH_TIMED_OUT_TEXT, splitLinked } from './pr-fetch'
import type { PrLinks } from './pr-fetch'
import { lastPressOf, withOut } from './pr-press'
import type { LastPress, PrAction } from './pr-press'
import { PR_REFRESH_ID } from './pr-rows'
import { parseRef } from './prs'
import { clockTime } from './text'
import { isShownSince } from './timing'

/** The button at the top of the PRs tab while a PR could not be read. It is not "Try again", since a failed send draws that. */
export const PR_REFRESH_LABEL = 'Refresh PRs'

/** The notice at the top of the PRs tab for a cause that stopped the whole fetch. Its first sentence is the lead. */
export function fetchFailureNotice(f: PrFetchFailure): string {
  switch (f.kind) {
    case 'limit':
      return f.resetsAt === null
        ? "GitHub's limit is used up. The PRs refresh once it resets."
        : `GitHub's limit is used up. The PRs refresh after it resets at ${clockTime(f.resetsAt)}.`
    case 'unreachable':
      return 'Could not reach GitHub. The PRs show as last read.'
    case 'timed-out':
      return `${GH_TIMED_OUT_TEXT}. The PRs show as last read.`
    case 'error':
      return `Could not read the PRs: ${f.text}. They show as last read.`
  }
}

/** A fetch failure in a few words, as the Refresh press's result gives it: "GitHub's limit resets at 4:46 PM". */
function fetchFailureWords(f: PrFetchFailure): string {
  switch (f.kind) {
    case 'limit':
      return f.resetsAt === null ? "GitHub's limit is used up" : `GitHub's limit resets at ${clockTime(f.resetsAt)}`
    case 'unreachable':
      return 'could not reach GitHub'
    case 'timed-out':
      return GH_TIMED_OUT_TEXT
    case 'error':
      return f.text
  }
}

/** The state the top of the PRs tab reads: the mod keeps `isGhMissing` in its views, Codex and omp in their hosts. */
type PrReadState = Pick<PrViews, 'views' | 'branchRef' | 'failure' | 'unread' | 'isGhSignedOut'> & {
  isGhMissing: boolean
}

/** A cause that stopped the whole fetch, in a few words, or null. A missing gh comes first, then a sign-in, then GitHub's answer. */
function tabWideProblem(prs: PrReadState): string | null {
  if (prs.isGhMissing) return 'gh was not found'
  if (prs.isGhSignedOut) return 'gh is not signed in'

  return prs.failure ? fetchFailureWords(prs.failure) : null
}

/**
 * The tracked PRs the last fetch could not read, with why: those whose view carries an error, and those with no view.
 * The branch's own PR counts as tracked.
 */
type UnreadPr = { ref: string; why: string; hasBlock: boolean }

function unreadPrs(prs: PrReadState, links: PrLinks): UnreadPr[] {
  const { tracked } = splitLinked(prs, links)
  const refs = prs.branchRef && !tracked.includes(prs.branchRef) ? [...tracked, prs.branchRef] : tracked

  return refs.flatMap((ref): UnreadPr[] => {
    const view = prs.views[ref]
    if (view?.error) return [{ ref, why: view.error, hasBlock: true }]
    const why = view ? null : prs.unread?.[ref]

    return why ? [{ ref, why, hasBlock: false }] : []
  })
}

/**
 * Why the tab's PRs are not all current, or null when every tracked PR was read: a cause that stopped the whole
 * fetch, else which PRs could not be read. One PR with no block carries its reason, since no block shows it.
 */
export function refreshProblem(prs: PrReadState, links: PrLinks): string | null {
  const tabWide = tabWideProblem(prs)
  if (tabWide) return tabWide
  const unread = unreadPrs(prs, links)
  const [only] = unread
  if (!only) return null
  if (unread.length === 1)
    return `#${parseRef(only.ref).number} could not be read${only.hasBlock ? '' : `: ${only.why}`}`
  const numbers = unread.map(u => `#${parseRef(u.ref).number}`)
  const last = numbers.pop()

  return `${numbers.join(', ')} and ${last} could not be read`
}

/**
 * The line at the top of the PRs tab, under the notices, while a PR could not be read or Refresh PRs' press shows.
 * `text` names the PRs that could not be read, or is null when a notice above says the cause. `actions` holds
 * Refresh PRs while a PR could not be read. `showsPress` says whether the line draws the press's status: while the
 * press is out, or since the tab was shown. The line is null once nothing is left to draw: no PR fails to read, and
 * the press's status has faded, or was a failure a later fetch made good.
 */
export type PrRefreshView = { text: string | null; actions: PrAction[]; showsPress: boolean }

export function prRefreshView(
  prs: PrReadState,
  links: PrLinks,
  presses: PressState,
  shownSince: number | null,
): PrRefreshView | null {
  const problem = refreshProblem(prs, links)
  const row = lastPressOf(presses, PR_REFRESH_ID)
  const feedback = pressFeedbackIn(PR_REFRESH_ID, { is: 'open' }, row.last, presses.turns, presses.now)
  const isMadeGood = problem === null && feedback?.is === 'local' && feedback.result.state === 'failed'
  const isPressShown =
    feedback !== null &&
    !isMadeGood &&
    row.last !== undefined &&
    (row.pressing !== null || isShownSince(row.last.at, shownSince))
  if (problem === null && !isPressShown) return null

  return {
    text: problem !== null && tabWideProblem(prs) === null ? problem : null,
    actions: problem === null ? [] : prRefreshActions(row),
    showsPress: isPressShown,
  }
}

/** The line's buttons: Refresh PRs. Its label stays the same after a press, since the next press refreshes again. */
function prRefreshActions(row: LastPress): PrAction[] {
  return withOut(row, [
    { press: { action: 'pr-refresh' }, label: PR_REFRESH_LABEL, kind: 'local', emphasis: 'normal', icon: 'retry' },
  ])
}
