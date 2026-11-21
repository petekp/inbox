import { mod } from './mod-state'
import type { FetchAsk } from '../../core/domain/pr-fetch'

/**
 * Runs PR fetches one at a time. A fetch asked for while one runs follows it, and finds the branch's PR when any of
 * the asks wanted it. `run` does one fetch, and a failure of it ends only that fetch.
 */
export function queuePrFetch(
  findsBranchPr: boolean,
  isPress: boolean,
  run: (ask: FetchAsk) => Promise<void>,
): Promise<void> {
  const waiting = mod.nextFetch
  if (waiting) {
    waiting.findsBranchPr ||= findsBranchPr
    waiting.isPress ||= isPress
    return mod.fetchingPrs
  }
  mod.nextFetch = { findsBranchPr, isPress }
  mod.fetchingPrs = mod.fetchingPrs
    .then(async () => {
      const ask = mod.nextFetch ?? { findsBranchPr: false, isPress: false }
      mod.nextFetch = null
      mod.isFetchingPrsNow = true
      try {
        await run(ask)
      } finally {
        mod.isFetchingPrsNow = false
      }
    })
    .catch(() => undefined)

  return mod.fetchingPrs
}

/**
 * Whether a PR fetch runs or waits, from memory. The saved `prViews.isFetching` stays set when the save that clears
 * it fails, so the poll reads this instead.
 */
export const isPrFetchBusy = (): boolean => mod.isFetchingPrsNow || mod.nextFetch !== null
