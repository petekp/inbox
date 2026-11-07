import type { Session } from '../types'
import { whileLockHeld } from './mod-saves'
import type { SaveEngine } from './mod-saves'
import { NO_PR_SHARED } from './pr-fetch'
import type { PrShared } from './pr-fetch'
import type { SessionHost } from './session-host'

/** The store key of what every Claude Code session shares about GitHub. Not `s:` or `p:`, which the saves prune. */
const PR_SHARED_KEY = 'gh:shared'

function isPrShared(value: unknown): value is PrShared {
  const v = value as Partial<PrShared> | null

  return typeof v === 'object' && v !== null && typeof v.views === 'object' && v.views !== null && 'limit' in v
}

/**
 * The shared views and limit in the engine store, which every session of the mod reads and writes. A write that
 * cannot land, as when the store's lock stays held, is dropped and logged: the next fetch writes again. The read
 * and the write are not one step, so two fetches that end together can each keep only their own views.
 */
export function prSharedStore(
  e: Pick<SaveEngine, 'store' | 'sleep' | 'log'>,
): NonNullable<SessionHost<Session>['gh']['shared']> {
  const read = async (): Promise<PrShared> => {
    const value = await e.store.get(PR_SHARED_KEY)

    return isPrShared(value) ? value : NO_PR_SHARED
  }

  return {
    read: () => read().catch(() => NO_PR_SHARED),
    write: async change => {
      try {
        await whileLockHeld(e, async () => e.store.set(PR_SHARED_KEY, change(await read())))
      } catch (err) {
        e.log(`inbox: saving the shared PR views failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
  }
}
