import { delegateRefs, delegateRowsTakenBack, delegatesStarted } from '../../hooks/children'
import { statusChanged } from '../../hooks/session-status'
import type { SessionState } from './state'

/** The delegates `command` names run from `at`, and the session keeps their rows as they were, to take back. */
export function delegateCallNoted(s: SessionState, command: string, at: number): SessionState {
  const refs = delegateRefs(command)
  const before = (s.ledger.overview?.children ?? []).filter(c => refs.has(c.ref))
  const noted = { ...s, delegateCalls: [...s.delegateCalls, { command, at, before }] }

  return statusChanged(noted, o => delegatesStarted(o, command, at))
}

/**
 * The rows of `refs`, the delegates of the turn's calls that did not run, go back to what they were before the first
 * call that started them, or go away when they had none. Newest call first, so each restores the rows the one before
 * it found.
 */
export function unranDelegatesTakenBack(s: SessionState, refs: string[]): SessionState {
  if (refs.length === 0) return s
  const unran = new Set(refs)

  return statusChanged(s, o =>
    s.delegateCalls.reduceRight((x, call) => {
      const callRefs = new Set([...delegateRefs(call.command)].filter(ref => unran.has(ref)))

      return delegateRowsTakenBack(x, callRefs, call.before, call.at)
    }, o),
  )
}
