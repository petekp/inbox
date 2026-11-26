import type { Milestone, SessionStatus } from '../../types'
import { isOpen } from './status-limits'

/** A was line stays until the person has seen it. */
export function forgetSeenWas(m: Milestone, lastLookAt: number | null): void {
  if (lastLookAt !== null && m.changedAt <= lastLookAt) m.was = null
}

/**
 * Closes each open milestone whose linked work closed: at least one subject is linked, every one is closed and one is
 * done, and one closed no earlier than the milestone last changed, so a SET in the answer that closes the work does
 * not hold it open. A milestone an earlier answer opened again after its work closed stays open until another linked
 * subject closes. A milestone this closes drops its text, which said what was left.
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
      linked.some(s => (s.closedAt ?? -Infinity) >= m.changedAt)
    if (!isWorkDone) return m
    isChanged = true
    return { ...m, status: 'done' as const, text: '', closedAt: now, changedAt: now, was: null }
  })

  return isChanged ? { ...o, milestones } : o
}

/**
 * Opens again each done milestone an open ask in `askIds` holds up, itself or through a subject that serves it. One that
 * is open in one of `earlier`, the Status as the answer's lines left it and then as the answer found it, goes back to
 * how it stood in the first that holds it open, so a DONE written while an ask holds it changes nothing. Any other opens
 * with no text, working while some open subject serving it is working or none is open, else waiting on something
 * outside the session while some of it waits, else queued.
 */
export function withHeldMilestonesOpen(
  o: SessionStatus,
  now: number,
  askIds: ReadonlySet<string>,
  earlier: readonly SessionStatus[],
): SessionStatus {
  const isHeld = (m: Milestone) => {
    const ids = new Set([m.id, ...o.subjects.filter(s => o.serves[s.id] === m.id).map(s => s.id)])
    return Object.entries(o.askSubjects).some(([ask, to]) => askIds.has(ask) && to.some(id => ids.has(id)))
  }
  const reopened = (m: Milestone): Milestone => {
    const open = earlier.flatMap(e => e.milestones.filter(x => x.id === m.id && isOpen(x)))[0]
    if (open) return { ...open }
    const work = o.subjects.filter(s => isOpen(s) && o.serves[s.id] === m.id)
    const status =
      work.length === 0 || work.some(s => s.status === 'working')
        ? 'working'
        : work.some(s => s.status === 'waits-on-other')
          ? 'waits-on-other'
          : 'queued'
    return { ...m, status, text: '', was: null, changedAt: now, closedAt: null }
  }
  if (!o.milestones.some(m => m.status === 'done' && isHeld(m))) return o

  return { ...o, milestones: o.milestones.map(m => (m.status === 'done' && isHeld(m) ? reopened(m) : m)) }
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
