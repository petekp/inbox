/** The work a server starts and does not wait for, so a caller can wait until it has all ended. */
export type Background = {
  /** Records `work` as running until it settles. A rejection is dropped. */
  track(work: Promise<unknown>): void
  /** Resolves once no tracked work runs, including work that started while it waited. */
  settled(): Promise<void>
}

export function makeBackground(): Background {
  const running = new Set<Promise<unknown>>()

  return {
    track(work) {
      const run = work.then(
        () => undefined,
        () => undefined,
      )
      running.add(run)
      void run.then(() => running.delete(run))
    },
    async settled() {
      while (running.size > 0) await Promise.all([...running])
    },
  }
}
