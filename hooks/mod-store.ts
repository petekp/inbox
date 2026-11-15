/**
 * What the engine's store throws when another process holds the lock on its file. Only `set` and `delete` take the
 * lock, and the engine retries it for under a second before throwing.
 */
const LOCK_HELD = 'Lock file is already being held'
/** The waits before each retry of a store write that met a held lock, about two seconds in all. */
const LOCK_RETRY_WAITS_MS = [100, 200, 300, 500, 900]
/**
 * What the engine's store throws when a `set` would take the whole store past its cap, as in "$.store.set: the store
 * would be 4197799 characters, over the 4194304 limit". Every session of the mod shares the one store.
 */
const STORE_FULL = /the store would be \d+ characters, over the \d+ limit/

export const isLockHeld = (error: unknown) => error instanceof Error && error.message.includes(LOCK_HELD)

export const isStoreFull = (error: unknown) => error instanceof Error && STORE_FULL.test(error.message)

/** Runs `write`, and again after each wait in `LOCK_RETRY_WAITS_MS` while the store's lock is held. */
export async function whileLockHeld<T>(
  e: { sleep: (ms: number) => Promise<void> },
  write: () => Promise<T>,
): Promise<T> {
  for (const ms of LOCK_RETRY_WAITS_MS) {
    try {
      return await write()
    } catch (error) {
      if (!isLockHeld(error)) throw error
      await e.sleep(ms)
    }
  }
  return write()
}
