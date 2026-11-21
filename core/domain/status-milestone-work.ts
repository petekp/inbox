import type { Milestone, SessionStatus } from '../../types'
import { isOpen } from './status-limits'

/** A was line stays until the person has seen it. */
export function forgetSeenWas(m: Milestone, lastLookAt: number | null): void {
  if (lastLookAt !== null && m.changedAt <= lastLookAt) m.was = null
}

/**
 * Closes each open milestone whose linked work closed: at least one subject is linked, every one is closed and one is
 * done, and one closed after the milestone last changed. A milestone the call opened again after its work closed
 * stays open until another linked subject closes.
 */
export function withWorkDoneMilestones(o: SessionStatus, now: number): SessionStatus {
  let isChanged = false
  const milestones = o.milestones.map(m => {
    if (!isOpen(m)) return m
    const linked = o.subjects.filter(s => o.serves[s.id] === m.id)
    const isWorkDone =
      linked.length > 0 &&
      linked.every(s => !isOpen(s)) &&
      linked.some(s => s.status === 'done') &&
      linked.some(s => (s.closedAt ?? -Infinity) > m.changedAt)
    if (!isWorkDone) return m
    isChanged = true
    return { ...m, status: 'done' as const, closedAt: now, changedAt: now, was: null }
  })

  return isChanged ? { ...o, milestones } : o
}

/**
 * Starts each queued milestone whose linked work is under way: working while some of it is working, else waiting on
 * something outside the session. It keeps the text it had while queued, which may be empty.
 */
export function withWorkStartedMilestones(o: SessionStatus, now: number): SessionStatus {
  const startedAs = (m: Milestone): 'working' | 'waits-on-other' | null => {
    if (m.status !== 'queued') return null
    const linked = o.subjects.filter(s => o.serves[s.id] === m.id)
    if (linked.some(s => s.status === 'working')) return 'working'
    return linked.some(s => s.status === 'waits-on-other') ? 'waits-on-other' : null
  }
  if (!o.milestones.some(m => startedAs(m) !== null)) return o

  return {
    ...o,
    milestones: o.milestones.map(m => {
      const status = startedAs(m)
      if (status === null) return m
      const started = { ...m }
      forgetSeenWas(started, o.lastLookAt)

      return { ...started, status, changedAt: now }
    }),
  }
}
