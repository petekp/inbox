import { splitLinked, fetchTracked, GH_TIMED_OUT_TEXT, isLimitInForce, NO_PR_SHARED, PR_SHARED_MS } from './pr-fetch'
import { TIMED_OUT_CODE } from './gh'
import { rerunArgs } from './pr-press'
import type { Effect } from './press-reducer'
import { withFetchedPrs } from './session-presses'
import type { Session } from '../types'
import type { SessionHost } from './session-host'

const PRS_REFRESH_MS = 120_000
/** How old the PRs may get while the PRs tab is not shown, where they only feed the counts. */
export const PRS_HIDDEN_REFRESH_MS = 10 * 60_000
const NEW_PR_FETCH_MS = 15_000

/**
 * True when the PRs are due for a fetch: none was fetched yet, the last is old, or, once `NEW_PR_FETCH_MS` has passed
 * since the last, a new tracked PR waits for its first or the agent replied since, as after a push that fixed a PR.
 * The last is old after `PRS_REFRESH_MS` while the PRs tab is shown, and after `PRS_HIDDEN_REFRESH_MS` while it is
 * not, since every session spends from one GitHub budget and a hidden tab's PRs only feed the counts.
 */
export function isPrFetchDue(s: Session, lastFetchedAt: number | undefined, now: number, isTabShown: boolean): boolean {
  if (lastFetchedAt === undefined) return true
  const hasNewPr = splitLinked(s.prViews, s.ledger).tracked.some(ref => !(ref in s.prViews.views))
  const hasReplySince = (s.presence.lastReplyAt ?? 0) > lastFetchedAt
  const refreshMs = isTabShown ? PRS_REFRESH_MS : PRS_HIDDEN_REFRESH_MS

  return now - lastFetchedAt >= refreshMs || ((hasNewPr || hasReplySince) && now - lastFetchedAt >= NEW_PR_FETCH_MS)
}

/** Which sessions have a PR fetch running, and when each last ended. */
export function prFetchTracker(now: () => number): {
  isFetching(id: string): boolean
  /**
   * Runs `fetch` when no fetch is running for `id` and `isPrFetchDue` says the PRs are due, with `isTabShown` saying
   * whether the session's PRs tab is shown. Returns the run, which never rejects, or null when nothing started.
   */
  fetchWhenDue(id: string, s: Session, isTabShown: boolean, fetch: () => Promise<void>): Promise<void> | null
  /**
   * Runs `fetch` as a press asks: now, or once the fetch running for `id` ends, since that fetch may have read the PRs
   * before the press. Presses during one running fetch share the fetch after it. Returns the run, which never rejects.
   */
  fetchNow(id: string, fetch: () => Promise<void>): Promise<void>
} {
  const running = new Map<string, Promise<void>>()
  const following = new Map<string, Promise<void>>()
  const endedAt = new Map<string, number>()
  const start = (id: string, fetch: () => Promise<void>) => {
    const run = fetch()
      .catch(() => undefined)
      .finally(() => {
        endedAt.set(id, now())
        running.delete(id)
      })
    running.set(id, run)

    return run
  }

  return {
    isFetching: id => running.has(id),
    fetchWhenDue: (id, s, isTabShown, fetch) =>
      running.has(id) || !isPrFetchDue(s, endedAt.get(id), now(), isTabShown) ? null : start(id, fetch),
    fetchNow: (id, fetch) => {
      const current = running.get(id)
      if (!current) return start(id, fetch)
      const next =
        following.get(id) ??
        current.then(() => {
          following.delete(id)
          return running.get(id) ?? start(id, fetch)
        })
      following.set(id, next)

      return next
    },
  }
}

/**
 * Fetches the PRs the session tracks and merges them in. `findsBranchPr` also looks up the current branch's PR.
 * `isPress` says a press asked, so every tracked PR is read now, even under a limit error, whose answer says
 * whether the limit still holds. Otherwise a view another session of the host read lately stands in, and a limit
 * error any session met stops the fetch until the limit resets, with the limit shown in this session's views.
 * Returns without fetching when gh cannot start.
 */
export async function fetchPrs<S extends Session>(
  host: Pick<SessionHost<S>, 'now' | 'read' | 'update' | 'gh'>,
  findsBranchPr: boolean,
  isPress = false,
): Promise<void> {
  const s = await host.read()
  const shared = (await host.gh.shared?.read()) ?? NO_PR_SHARED
  const now = await host.now()
  if (!isPress && isLimitInForce(shared.limit, now)) {
    const limit = shared.limit
    await host.update(cur =>
      cur.prViews.failure?.at === limit?.at ? cur : { ...cur, prViews: { ...cur.prViews, failure: limit } },
    )
    return
  }
  const bin = await host.gh.find()
  host.gh.noteMissing(bin === null)
  if (bin === null) return
  let sawUnstartable = false
  const fetchWith = (path: string) =>
    fetchTracked(
      host.gh.run(s, path, () => {
        sawUnstartable = true
      }),
      s.prViews,
      s.ledger,
      { findsBranchPr, isPress },
      () => host.now(),
      shared.views,
    )
  let fetch = await fetchWith(bin)
  if (sawUnstartable) {
    host.gh.forget()
    const refound = await host.gh.find()
    host.gh.noteMissing(refound === null)
    if (refound === null) return
    if (refound !== bin) fetch = await fetchWith(refound)
  }
  const { views: fetched, branchRef, isGhSignedOut, failure, read, unread } = fetch
  const at = await host.now()
  await host.gh.shared?.write(cur => ({
    views: Object.fromEntries(
      [...Object.entries(cur.views), ...read.map(ref => [ref, fetched[ref]!] as const)].filter(
        ([, view]) => at - (view.fetchedAt ?? 0) < PR_SHARED_MS,
      ),
    ),
    limit: failure?.kind === 'limit' ? failure : failure === null ? null : cur.limit,
  }))
  await host.update(cur => withFetchedPrs(cur, fetched, branchRef, isGhSignedOut, at, failure, unread))
}

/**
 * GitHub's refusal of a re-run while the run is running, as gh prints it: "run 77 cannot be rerun; This workflow is
 * already running". The run is running, which is what the press asked for.
 */
const ALREADY_RUNNING = /already running/i

/** Asks GitHub to re-run a workflow run. Returns why it could not, or null when the run is running. */
export async function rerunRun<S extends Session>(
  host: Pick<SessionHost<S>, 'read' | 'gh'>,
  e: Extract<Effect, { kind: 'rerun' }>,
): Promise<string | null> {
  const bin = await host.gh.find()
  if (bin === null) return 'the inbox could not find gh'
  const r = await host.gh.run(await host.read(), bin, () => host.gh.forget())(rerunArgs(e))
  if (r.exitCode === 0 || ALREADY_RUNNING.test(r.stderr)) return null

  return r.exitCode === TIMED_OUT_CODE
    ? GH_TIMED_OUT_TEXT
    : r.stderr.trim().split('\n')[0] || `gh exited with ${r.exitCode}`
}
