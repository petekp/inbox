import type { Item, Ledger, PrView, PrViews } from '../types'
import { GH_TIMEOUT_MS, TIMED_OUT_CODE, UNSTARTABLE_CODE } from './gh'
import { prSteps } from './help-steps'
import type { HelpStep } from './help-steps'
import { isKeptPr, parseRef, prRefs, readThreadsAnswer, readView, THREADS_QUERY, VIEW_FIELDS } from './prs'

export const MAX_PRS = 12

/** The most PRs an agent's order can rank. They are tracked beyond `MAX_PRS`. */
export const MAX_ORDERED_PRS = 30

/** How many gh runs a fetch has going at once. */
export const GH_RUNS_AT_ONCE = 8

/** The ledger's PR links, and the agent's order of them. */
export type PrLinks = Pick<Ledger, 'prs' | 'prOrder'>

/** Runs gh with these arguments in the session's folder. A run that cannot start or does not finish ends with code -1. */
export type GhRun = (args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>

/** gh's exit code for a command that needs a sign-in when gh has no token, as `gh help exit-codes` says. */
const GH_SIGN_IN_CODE = 4

/**
 * Whether gh's answer asks for a sign-in: gh has no token, or GitHub refused the token with HTTP 401, as it does for
 * an expired or revoked one.
 */
function asksForSignIn(r: { exitCode: number; stderr: string }): boolean {
  return r.exitCode === GH_SIGN_IN_CODE || (r.exitCode !== 0 && /\bHTTP 401\b/.test(r.stderr))
}

export function linkedPrs(prs: string[], refs: string[]): string[] {
  return [...prs.filter(r => !refs.includes(r)), ...refs]
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
export function isLeftOut(prState: PrViews, ref: string): boolean {
  const view = prState.views[ref]

  return view !== undefined && !isKeptPr(view)
}

/**
 * The linked PRs the tab tracks: those the agent's order ranks, and the newest `MAX_PRS` of the rest. `older` names
 * the rest, which the tab does not show.
 */
export function splitLinked(prState: PrViews, links: PrLinks): { tracked: string[]; older: string[] } {
  const ranked = new Set(links.prOrder?.refs ?? [])
  const shown = links.prs.filter(ref => !isLeftOut(prState, ref))
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

/**
 * Only `findsBranchPr` asks gh which PR the branch has; otherwise the last one found is refreshed by its ref.
 * `isGhSignedOut` says whether a gh run asked for a sign-in, and is null when no run gave an answer.
 */
export async function fetchTracked(
  run: GhRun,
  state: PrViews,
  links: PrLinks,
  findsBranchPr: boolean,
  now: () => number | Promise<number>,
): Promise<{ views: Record<string, PrView>; branchRef: string | null; isGhSignedOut: boolean | null }> {
  let isGhSignedOut: boolean | null = null
  const runs = limitedTo(GH_RUNS_AT_ONCE)
  const gh: GhRun = async args => {
    const r = await runs(() => run(args))
    const isAnswer = r.exitCode !== UNSTARTABLE_CODE && r.exitCode !== TIMED_OUT_CODE
    if (isAnswer) isGhSignedOut = isGhSignedOut === true || asksForSignIn(r)

    return r
  }
  const { tracked } = splitLinked(state, links)
  const branchTarget = findsBranchPr ? null : state.branchRef
  const isBranchLinked = branchTarget !== null && tracked.includes(branchTarget)
  const [branch, ...rest] = await Promise.all([
    findsBranchPr || (branchTarget && !isBranchLinked)
      ? fetchPr(gh, branchTarget, state.views, state.branchRef, now)
      : null,
    ...tracked.map(ref => fetchPr(gh, ref, state.views, null, now)),
  ])
  const views: Record<string, PrView> = {}
  for (const v of [...rest, branch]) if (v) views[v.ref] = v

  return { views, branchRef: findsBranchPr ? (branch?.ref ?? null) : state.branchRef, isGhSignedOut }
}

/**
 * `target` is "owner/repo#123", or null for
 * the current branch's PR, whose ref is known only from gh's answer.
 * `knownBranchRef` is the branch's PR as of the last fetch: it stays the
 * branch's PR when the lookup fails for any reason but "no pull requests found".
 * A PR that gh could not read because it asked for a sign-in keeps its last view, since the PRs tab's sign-in notice
 * says why. A view's `fetchedAt` is the time `now` reads once gh answers.
 */
async function fetchPr(
  gh: GhRun,
  target: string | null,
  views: Record<string, PrView>,
  knownBranchRef: string | null,
  now: () => number | Promise<number>,
): Promise<PrView | null> {
  const threadsOf = (ref: string) => {
    const r = parseRef(ref)
    return gh([
      'api',
      'graphql',
      '-f',
      `query=${THREADS_QUERY}`,
      '-F',
      `owner=${r.owner}`,
      '-F',
      `repo=${r.name}`,
      '-F',
      `number=${r.number}`,
    ])
  }
  const t = target ? parseRef(target) : null
  const [view, early] = await Promise.all([
    gh(['pr', 'view', ...(t ? [t.number, '-R', t.repo] : []), '--json', VIEW_FIELDS]),
    target ? threadsOf(target) : null,
  ])
  const fetchedAt = await now()
  const hasNoPr = view.exitCode !== 0 && /no pull requests found/i.test(view.stderr)
  const ref = target ?? (view.exitCode === 0 ? urlRef(view.stdout) : hasNoPr ? null : knownBranchRef)
  if (!ref) return null
  const previous = views[ref]
  const base = view.exitCode === 0 ? readView(ref, view.stdout) : null
  if (!base) {
    if (!previous || asksForSignIn(view)) return previous ?? null

    const error =
      view.exitCode === TIMED_OUT_CODE
        ? GH_TIMED_OUT_TEXT
        : view.stderr.trim().split('\n')[0] || 'gh could not read the PR'

    return { ...previous, error }
  }
  const threads = early ?? (await threadsOf(ref))
  const answer = threads.exitCode === 0 ? readThreadsAnswer(threads.stdout) : null

  return {
    ...base,
    threads: answer?.threads ?? previous?.threads ?? [],
    isYours: answer?.isYours ?? previous?.isYours ?? null,
    wasSeenOpen: base.state === 'OPEN' || previous?.wasSeenOpen === true,
    error: answer ? null : 'could not read review threads',
    fetchedAt,
  }
}

function urlRef(json: string): string | null {
  try {
    return prRefs(String((JSON.parse(json) as { url?: unknown }).url ?? ''))[0] ?? null
  } catch {
    return null
  }
}

export const GH_TIMED_OUT_TEXT = `gh did not answer within ${GH_TIMEOUT_MS / 1000} seconds`

/** Runs at most `limit` of the calls it is given at once, starting each in the order it was given. */
function limitedTo(limit: number): <T>(call: () => Promise<T>) => Promise<T> {
  let running = 0
  const waiting: (() => void)[] = []

  return async call => {
    if (running >= limit) await new Promise<void>(go => waiting.push(go))
    running += 1
    try {
      return await call()
    } finally {
      running -= 1
      waiting.shift()?.()
    }
  }
}
