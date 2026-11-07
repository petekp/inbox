import type { Item, Ledger, PrFetchFailure, PrView, PrViews } from '../types'
import { GH_TIMEOUT_MS, TIMED_OUT_CODE, UNSTARTABLE_CODE } from './gh'
import { prSteps } from './help-steps'
import type { HelpStep } from './help-steps'
import {
  asksForSignIn,
  limitResetOf,
  PRS_PER_QUERY,
  prsQuery,
  readPrNode,
  readPrsAnswer,
  runFailureOf,
} from './pr-query'
import { isKeptPr, parseRef, prRefs } from './prs'

export const MAX_PRS = 12

/** The most PRs an agent's order can rank. They are tracked beyond `MAX_PRS`. */
export const MAX_ORDERED_PRS = 30

/** How long a view read by any session of the host stands in for a fresh read, in a fetch no press asked for. */
export const PR_SHARED_MS = 120_000

/** How often a closed PR is read again, since one can be reopened, but rarely and never in a hurry. */
export const CLOSED_PR_REFRESH_MS = 60 * 60_000

/** How long a fetch waits after a limit error whose reset time GitHub did not give. */
export const LIMIT_RETRY_MS = 5 * 60_000

/** The ledger's PR links, and the agent's order of them. */
export type PrLinks = Pick<Ledger, 'prs' | 'prOrder'>

/** Runs gh with these arguments in the session's folder. A run that cannot start or does not finish ends with code -1. */
export type GhRun = (args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>

/**
 * What every session of a host shares about GitHub: the views any of them read lately, and the limit error the last
 * one met, so one limit stops every session's polling until it resets.
 */
export type PrShared = { views: Record<string, PrView>; limit: Extract<PrFetchFailure, { kind: 'limit' }> | null }

export const NO_PR_SHARED: PrShared = { views: {}, limit: null }

/** How a fetch was asked for: whether it looks up the branch's PR, and whether a press asked for it. */
export type FetchAsk = { findsBranchPr: boolean; isPress: boolean }

export function linkedPrs(prs: string[], refs: string[]): string[] {
  return [...prs.filter(r => !refs.includes(r)), ...refs]
}

/** The PRs on the tab: those the session linked, then those the agent's order ranks that the person did not dismiss. */
export function tabPrs(links: PrLinks): string[] {
  const order = links.prOrder
  const ranked = (order?.refs ?? []).filter(ref => !links.prs.includes(ref) && !order?.dismissed.includes(ref))

  return [...links.prs, ...ranked]
}

export function itemPrSteps(item: Item, prState: PrViews, linked: string[]): HelpStep[] {
  const refs = prState.branchRef ? [...linked, prState.branchRef] : linked

  return prSteps(
    item,
    refs.map(ref => ({ ref, url: prState.views[ref]?.url ?? null })),
  )
}

/**
 * A linked PR the tab leaves out for good, by `isKeptPr`: its view says someone else wrote it, or that it was merged
 * or closed before a fetch found it open. A fetch skips it, and a task naming it keeps its Open PR step.
 */
export function isLeftOut(prState: Pick<PrViews, 'views'>, ref: string): boolean {
  const view = prState.views[ref]

  return view !== undefined && !isKeptPr(view)
}

/**
 * The PRs on the tab it tracks, by `tabPrs`: those the agent's order ranks, and the newest `MAX_PRS` of the rest.
 * `older` names the rest, which the tab does not show.
 */
export function splitLinked(prState: Pick<PrViews, 'views'>, links: PrLinks): { tracked: string[]; older: string[] } {
  const ranked = new Set(links.prOrder?.refs ?? [])
  const shown = tabPrs(links).filter(ref => !isLeftOut(prState, ref))
  const unranked = shown.filter(ref => !ranked.has(ref))
  const older = unranked.slice(0, Math.max(0, unranked.length - MAX_PRS))

  return { tracked: shown.filter(ref => !older.includes(ref)), older }
}

export function olderPrsText(prState: PrViews, links: PrLinks): string | null {
  const { older } = splitLinked(prState, links)
  if (older.length === 0) return null
  const numbers = older.map(ref => `#${parseRef(ref).number}`).reverse()

  return `${older.length} older ${older.length === 1 ? 'PR' : 'PRs'} not shown: ${numbers.join(', ')}`
}

/** Whether the limit failure still stops fetches at `now`: until it resets, or `LIMIT_RETRY_MS` when GitHub gave no reset. */
export function isLimitInForce(limit: Extract<PrFetchFailure, { kind: 'limit' }> | null, now: number): boolean {
  if (!limit) return false

  return now < (limit.resetsAt ?? limit.at + LIMIT_RETRY_MS)
}

/**
 * Whether a tracked PR's saved view needs no read: a merged PR is final, and a closed one is read again only every
 * `CLOSED_PR_REFRESH_MS`, unless a press asks. A view with an error is read again, since the error may have passed.
 */
function isSettledView(view: PrView | undefined, ask: FetchAsk, now: number): boolean {
  if (!view || view.error !== null) return false
  if (view.state === 'MERGED') return true

  return view.state !== 'OPEN' && !ask.isPress && now - (view.fetchedAt ?? 0) < CLOSED_PR_REFRESH_MS
}

/**
 * Whether a shared view stands in for a read now: another session read it within `PR_SHARED_MS` and since this
 * session last read the PR, and no press asked. This session's own last read never stands in, so a fetch it asks
 * for reads GitHub as it did before sharing.
 */
function isSharedFresh(
  view: PrView | undefined,
  previous: PrView | undefined,
  ask: FetchAsk,
  now: number,
): view is PrView {
  if (view === undefined || ask.isPress) return false
  const readAt = view.fetchedAt ?? 0

  return now - readAt < PR_SHARED_MS && readAt > (previous?.fetchedAt ?? 0)
}

type Fetched = {
  views: Record<string, PrView>
  branchRef: string | null
  /** Whether a gh run asked for a sign-in; null when no run gave an answer. */
  isGhSignedOut: boolean | null
  /** Why no PR could be read, or null when the fetch read what it asked for, or asked for nothing. */
  failure: PrFetchFailure | null
  /** The refs whose views this fetch read from GitHub, for the host's shared views. */
  read: string[]
  /** Why each PR with no view could not be read, by ref. */
  unread: Record<string, string>
}

/**
 * Reads the PRs the session tracks, in one GraphQL query for every `PRS_PER_QUERY` of them. Only `findsBranchPr`
 * asks gh which PR the branch has, with one more gh run; otherwise the last one found is read by its ref. A merged
 * PR is not read again, a closed one only now and then, and a view in `shared` that another session read lately,
 * and since this session last read the PR, stands in for a read, unless a press asked. A PR gh could not read keeps its last view: with the reason on it when
 * the cause is its own, and with none when the whole fetch failed, since `failure` then says why once.
 */
export async function fetchTracked(
  run: GhRun,
  state: PrViews,
  links: PrLinks,
  ask: FetchAsk,
  now: () => number | Promise<number>,
  shared: Record<string, PrView> = {},
): Promise<Fetched> {
  let isGhSignedOut: boolean | null = null
  let failure: PrFetchFailure | null = null
  let lookupFailure: PrFetchFailure | null = null
  const gh: GhRun = async args => {
    const r = await run(args)
    const isAnswer = r.exitCode !== UNSTARTABLE_CODE && r.exitCode !== TIMED_OUT_CODE
    if (isAnswer) isGhSignedOut = isGhSignedOut === true || asksForSignIn(r)

    return r
  }
  const { tracked } = splitLinked(state, links)
  const at = await now()
  const branchRef = ask.findsBranchPr
    ? await branchPrRef(gh, state.branchRef, at, f => (lookupFailure = f))
    : state.branchRef
  const refs = [...new Set(branchRef ? [...tracked, branchRef] : tracked)]
  const views: Record<string, PrView> = {}
  const toRead: string[] = []
  for (const ref of refs) {
    const previous = state.views[ref]
    const fresh = shared[ref]
    if (isSettledView(previous, ask, at)) continue
    if (isSharedFresh(fresh, previous, ask, at)) views[ref] = withSeen(fresh, previous)
    else toRead.push(ref)
  }
  const read: string[] = []
  const unread: Record<string, string> = {}
  let isAnswered = false
  for (let n = 0; n < toRead.length; n += PRS_PER_QUERY) {
    const chunk = toRead.slice(n, n + PRS_PER_QUERY)
    const r = await gh(['api', 'graphql', '-f', `query=${prsQuery(chunk)}`])
    const fetchedAt = await now()
    const chunkFailure = runFailureOf(r, TIMED_OUT_CODE, fetchedAt)
    const answer = chunkFailure ? null : readPrsAnswer(r.stdout, chunk)
    if (!answer) {
      failure ??= chunkFailure ?? { kind: 'error', at: fetchedAt, text: "GitHub's answer could not be read" }
      continue
    }
    isAnswered = true
    for (const ref of chunk) {
      const previous = state.views[ref]
      const { node, error, threadsError } = answer.prs[ref]!
      if (node) {
        read.push(ref)
        views[ref] = withSeen({ ...readPrNode(ref, node, answer.viewer, previous, threadsError), fetchedAt }, previous)
      } else if (previous) views[ref] = { ...previous, error }
      else if (error) unread[ref] = error
    }
  }
  // The lookup's failure counts only when no query answered, since a query reads the known branch PR without it.
  if (failure === null && !isAnswered && lookupFailure) failure = lookupFailure
  if (failure?.kind === 'limit' && failure.resetsAt === null) {
    const limits = await gh(['api', 'rate_limit'])
    failure = { ...failure, resetsAt: limits.exitCode === 0 ? limitResetOf(limits.stdout) : null }
  }

  return { views, branchRef, isGhSignedOut, failure, read, unread }
}

/** `view` as this session keeps it: seen open once this fetch, or one before it in this session, found it open. */
function withSeen(view: Omit<PrView, 'wasSeenOpen'>, previous: PrView | undefined): PrView {
  return { ...view, wasSeenOpen: view.state === 'OPEN' || previous?.wasSeenOpen === true }
}

/**
 * The ref of the branch's PR, from gh. `known` is the branch's PR as of the last fetch: it stays the branch's PR when
 * the lookup fails for any reason but "no pull requests found", and `onFailure` hears why.
 */
async function branchPrRef(
  gh: GhRun,
  known: string | null,
  at: number,
  onFailure: (f: PrFetchFailure) => void,
): Promise<string | null> {
  const r = await gh(['pr', 'view', '--json', 'url'])
  if (r.exitCode === 0) return urlRef(r.stdout) ?? known
  if (/no pull requests found/i.test(r.stderr)) return null
  const why = asksForSignIn(r) ? null : runFailureOf(r, TIMED_OUT_CODE, at)
  if (why) onFailure(why)

  return known
}

function urlRef(json: string): string | null {
  try {
    return prRefs(String((JSON.parse(json) as { url?: unknown }).url ?? ''))[0] ?? null
  } catch {
    return null
  }
}

export const GH_TIMED_OUT_TEXT = `gh did not answer within ${GH_TIMEOUT_MS / 1000} seconds`
