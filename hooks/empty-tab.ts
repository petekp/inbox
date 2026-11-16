import { isMaybeStale } from './band'
import { MAYBE_STALE_TEXT, NOTHING_NEEDED_TEXT } from './banners'
import { ghNoticeOf } from './pr-rows'
import type { PrRefreshView } from './pr-refresh'
import type { SessionView } from './session-view'
import { goalKeys, isSuggestionShown } from './status-keys'
import type { StatusKey } from './status-keys'
import { screenTabOf } from './tabs'

/** Each empty tab's title. The Status tab's is its own name. */
const EMPTY_TITLES = {
  needsYou: NOTHING_NEEDED_TEXT,
  findings: 'No findings yet',
  prs: 'No PRs',
  prsFetching: 'Checking for PRs…',
} as const

export type EmptyText = { title: string; hint: string | null }

/**
 * What sits under an empty tab's text: Refresh PRs while a PR could not be read, or the goal's buttons and field, with
 * the suggested goal's text while it shows.
 */
type EmptyUnder =
  | { is: 'pr-refresh'; refresh: PrRefreshView }
  | { is: 'set-goal'; keys: StatusKey[]; isFieldOpen: boolean; suggestion: string | null }

export type EmptyTab = EmptyText & { under: EmptyUnder | null }

/** What a look knows about a tab that the shared view does not. */
type EmptyTabLook =
  | {
      tab: 'needsYou' | 'findings'
      /** The agent's name in the hints, as in "Claude's questions". */
      agent: string
      /** More than 0 while the look draws a row, a settled row in place or a Closed line on the tab. */
      drawn: number
      /** Whether the look draws something in the tab's place that waits on the person, such as a stop or a failed read. */
      hasBlocker: boolean
      /** Whether the look could not read the saved inbox, so the tab may be missing rows. */
      isReadFailed: boolean
      /** The host's own text in place of the Asks tab's, such as Codex's while it has not heard from its hooks. */
      hostText?: EmptyText | null
    }
  | {
      tab: 'prs'
      /** The host's word for a conversation with the agent, as in "when this session opens or links one". */
      place: string
      /** More than 0 while the look draws a PR block. */
      drawn: number
      isFetchingPrs: boolean
      isGhMissing: boolean
    }
  | { tab: 'overview'; isGoalFieldOpen: boolean; isSuggestionOpen?: boolean }

/** The empty Status tab's text. Its title is the tab's name. */
export const EMPTY_STATUS_TEXT: { title: string; hint: string } = {
  title: screenTabOf('overview').label,
  hint: "What this session's work is for, where each part stands, and what changed. It fills in once the work starts.",
}

/** The hint under an empty PRs tab. */
export function prsEmptyHint(place: string): string {
  return `Your PRs show here when this ${place} opens or links one, or when your branch has one.`
}

/**
 * The tab's empty state, or null while it has something to draw. Every look draws what this returns with its one empty
 * drawer, in place of the tab's list.
 */
export function emptyTab(view: SessionView, look: EmptyTabLook): EmptyTab | null {
  if (look.tab === 'overview') {
    const page = view.statusPage
    if (!page.isEmpty) return null
    const isSuggestionOpen = look.isSuggestionOpen ?? false
    const suggestion = isSuggestionShown(page, isSuggestionOpen) ? page.suggestedGoal : null

    return {
      ...EMPTY_STATUS_TEXT,
      under: { is: 'set-goal', keys: goalKeys(page, isSuggestionOpen), isFieldOpen: look.isGoalFieldOpen, suggestion },
    }
  }
  if (look.tab === 'prs') {
    if (look.drawn > 0) return null
    const gh = { isGhMissing: look.isGhMissing, isGhSignedOut: view.prs.isGhSignedOut, failure: view.prs.failure }
    const { refresh } = view.prs

    return {
      title: look.isFetchingPrs ? EMPTY_TITLES.prsFetching : EMPTY_TITLES.prs,
      hint: ghNoticeOf(gh)?.text ?? prsEmptyHint(look.place),
      under: refresh ? { is: 'pr-refresh', refresh } : null,
    }
  }
  if (look.drawn > 0 || look.hasBlocker) return null
  if (look.tab === 'needsYou' && look.hostText) return { ...look.hostText, under: null }
  const hint =
    look.tab === 'needsYou'
      ? `${look.agent}'s questions and the tasks only you can do show up here.`
      : `${look.agent} flags issues and opportunities it spots beyond your task.`
  const title = isMaybeStale(view, look.isReadFailed) ? MAYBE_STALE_TEXT : EMPTY_TITLES[look.tab]

  return { title, hint, under: null }
}
