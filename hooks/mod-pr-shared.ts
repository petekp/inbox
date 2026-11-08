import type { Session } from '../types'
import type { SaveEngine } from './mod-saves'
import { whileLockHeld } from './mod-store'
import { NO_PR_SHARED, PR_SHARED_MS } from './pr-fetch'
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

/**
 * Drops each shared view read `PR_SHARED_MS` or longer ago, since a fetch takes a shared view in place of a read only
 * within that time. Returns whether any went. A failure is logged, and drops nothing.
 */
export async function dropUnreadSharedViews(e: Pick<SaveEngine, 'store' | 'sleep' | 'log' | 'now'>): Promise<boolean> {
  try {
    const now = await e.now()

    return await whileLockHeld(e, async () => {
      const shared = await e.store.get(PR_SHARED_KEY)
      if (!isPrShared(shared)) return false
      const kept = Object.entries(shared.views).filter(([, view]) => now - (view.fetchedAt ?? 0) < PR_SHARED_MS)
      if (kept.length === Object.keys(shared.views).length) return false
      await e.store.set(PR_SHARED_KEY, { ...shared, views: Object.fromEntries(kept) })

      return true
    })
  } catch (err) {
    e.log(
      `inbox: dropping the shared PR views no fetch reads failed: ${err instanceof Error ? err.message : String(err)}`,
    )

    return false
  }
}
