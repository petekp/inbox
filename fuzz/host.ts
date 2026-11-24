import type { SendOutcome } from '../core/runtime/session-presses'
import type { HerdrFileHost } from '../core/remote/herdr-app'
import { SETTLED_MS } from '../core/view/timing'
import type { Session, ViewerLeases } from '../types'
import type { Rng } from './rng'

/** What the host answers deliveries and opens or copies with, in turn. Each case draws these from its seed. */
export type HostOutcomes = {
  deliver: ('accepted' | 'rejected' | 'unconfirmed')[]
  isHeldUntilRun: boolean
  performFails: boolean[]
}

export function outcomesOf(rng: Rng): HostOutcomes {
  const delivery = () => (rng.chance(0.75) ? 'accepted' : rng.pick(['rejected', 'unconfirmed'] as const))

  return {
    deliver: Array.from({ length: 8 }, delivery),
    isHeldUntilRun: rng.chance(0.2),
    performFails: Array.from({ length: 8 }, () => rng.chance(0.2)),
  }
}

/**
 * An in-memory host, as `tests/session-script.ts` builds one, on the process clock the case moves. `changed` runs
 * after every saved change, as a host's publish does.
 */
export type FuzzHost = HerdrFileHost<Session> & {
  state(): Session
  set(change: (s: Session) => Session): void
  changed: Set<() => void>
  /** Presses whose message the host holds until the agent's turn ends. */
  held: (() => Promise<unknown>)[]
}

export function fuzzHost(start: Session, outcomes: HostOutcomes): FuzzHost {
  let state = start
  let leases: ViewerLeases = {}
  let ids = 0
  let delivers = 0
  let performs = 0
  const changed = new Set<() => void>()
  const save = (next: Session) => {
    state = next
    for (const listener of changed) listener()
    return state
  }
  const delivery = (): SendOutcome => {
    const kind = outcomes.deliver[delivers++ % Math.max(1, outcomes.deliver.length)] ?? 'accepted'
    if (kind === 'rejected') return { state: 'rejected', reason: 'the agent is busy' }
    if (kind === 'unconfirmed') return { state: 'unconfirmed', reason: 'no answer from the agent' }
    return { state: 'accepted', queuedId: null }
  }
  const isPerformFailed = () => outcomes.performFails[performs++ % Math.max(1, outcomes.performFails.length)] ?? false

  return {
    changed,
    held: [],
    state: () => state,
    set: change => void save(change(state)),
    now: () => Date.now(),
    read: async () => state,
    update: async change => save(await change(state)),
    deliver: async () => delivery(),
    isDeliveryHeldUntilRun: outcomes.isHeldUntilRun,
    perform: async () => (isPerformFailed() ? 'the file is gone' : null),
    refreshPrs: async () => {},
    fetchPrsInBackground: () => {},
    gh: {
      find: async () => null,
      forget: () => {},
      run: () => async () => ({ exitCode: 1, stdout: '', stderr: 'no gh' }),
      noteMissing: () => {},
    },
    settleWindowMs: SETTLED_MS,
    newId: () => `fz${++ids}`,
    comparePage: '/inbox/hooks/compare-page.html',
    compareInBackground: true,
    viewers: {
      read: async () => leases,
      update: async change => (leases = change(leases)),
    },
  }
}
