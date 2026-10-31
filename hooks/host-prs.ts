import { splitLinked, fetchTracked } from './pr-fetch'
import { withFetchedPrs } from './session-presses'
import type { Session } from '../types'
import type { SessionHost } from './session-host'

const PRS_REFRESH_MS = 120_000
const NEW_PR_FETCH_MS = 15_000

/**
 * True when the PRs are due for a fetch: none was fetched yet, the last is old, or, once `NEW_PR_FETCH_MS` has passed
 * since the last, a new tracked PR waits for its first or the agent replied since, as after a push that fixed a PR.
 */
export function isPrFetchDue(s: Session, lastFetchedAt: number | undefined, now: number): boolean {
  if (lastFetchedAt === undefined) return true
  const hasNewPr = splitLinked(s.prViews, s.ledger).tracked.some(ref => !(ref in s.prViews.views))
  const hasReplySince = (s.presence.lastReplyAt ?? 0) > lastFetchedAt

  return (
    now - lastFetchedAt >= PRS_REFRESH_MS || ((hasNewPr || hasReplySince) && now - lastFetchedAt >= NEW_PR_FETCH_MS)
  )
}

/** Which sessions have a PR fetch running, and when each last ended. */
export function prFetchTracker(now: () => number): {
  isFetching(id: string): boolean
  /**
   * Runs `fetch` when no fetch is running for `id` and `isPrFetchDue` says the PRs are due. Returns the run, which
   * never rejects, or null when nothing started.
   */
  fetchWhenDue(id: string, s: Session, fetch: () => Promise<void>): Promise<void> | null
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
    fetchWhenDue: (id, s, fetch) =>
      running.has(id) || !isPrFetchDue(s, endedAt.get(id), now()) ? null : start(id, fetch),
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
 * Returns without fetching when gh cannot start.
 */
export async function fetchPrs<S extends Session>(
  host: Pick<SessionHost<S>, 'now' | 'read' | 'update' | 'gh'>,
  findsBranchPr: boolean,
): Promise<void> {
  const s = await host.read()
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
      findsBranchPr,
      () => host.now(),
    )
  let fetch = await fetchWith(bin)
  if (sawUnstartable) {
    host.gh.forget()
    const refound = await host.gh.find()
    host.gh.noteMissing(refound === null)
    if (refound === null) return
    if (refound !== bin) fetch = await fetchWith(refound)
  }
  const { views: fetched, branchRef, isGhSignedOut } = fetch
  await host.update(cur => withFetchedPrs(cur, fetched, branchRef, isGhSignedOut))
}
