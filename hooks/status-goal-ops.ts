import type { Milestone, SessionStatus, Subject } from '../types'
import type { Op } from './status'
import {
  clipWords,
  DECLINED_KEPT,
  DESCRIPTION_KEPT,
  isOpen,
  MILESTONES_MAX,
  MILESTONES_MIN,
  NAME_KEPT,
  nameKey,
  TEXT_KEPT,
  words,
} from './status-limits'

/** Whether two texts have the same content words, in any order. */
export function hasSameWords(a: string, b: string): boolean {
  const x = words(a)
  const y = words(b)

  return x.size === y.size && [...x].every(w => y.has(w))
}

/** The milestone a line names: by its id, or by the name of a milestone that is not dropped. */
export function findMilestone(o: SessionStatus, ref: string): Milestone | null {
  const key = nameKey(clipWords(ref, NAME_KEPT))

  return (
    o.milestones.find(m => m.id === ref) ??
    o.milestones.find(m => m.status !== 'dropped' && nameKey(m.name) === key) ??
    null
  )
}

/** A was line stays until the person has seen it. */
function forgetSeenWas(m: Milestone, lastLookAt: number | null): void {
  if (lastLookAt !== null && m.changedAt <= lastLookAt) m.was = null
}

/** Moves a milestone as SET, DONE, DROP or WAS does a subject, under the same hold: a rewording keeps its text and time. */
export function moveMilestone(
  o: SessionStatus,
  m: Milestone,
  op: Extract<Op, { kind: 'set' | 'done' | 'drop' | 'was' }>,
  now: number,
): void {
  if (op.kind === 'set') {
    const isReworded = m.status === op.status && hasSameWords(m.text, op.text)
    if (isReworded) return
    m.status = op.status
    m.text = clipWords(op.text, TEXT_KEPT)
    m.closedAt = null
  } else if (op.kind === 'done') {
    m.status = 'done'
    if (op.text) m.text = clipWords(op.text, TEXT_KEPT)
    m.closedAt = now
  } else if (op.kind === 'drop') {
    const target = op.into ? findMilestone(o, op.into) : null
    m.status = 'dropped'
    m.text = clipWords(op.why, TEXT_KEPT)
    m.closedAt = now
    if (target && target.id !== m.id) {
      for (const [id, to] of Object.entries(o.serves)) if (to === m.id) o.serves[id] = target.id
      for (const [ask, to] of Object.entries(o.askSubjects)) if (to === m.id) o.askSubjects[ask] = target.id
    }
  } else {
    forgetSeenWas(m, o.lastLookAt)
    m.was = op.text
    m.changedAt = now
    return
  }
  forgetSeenWas(m, o.lastLookAt)
  m.changedAt = now
}

function addMilestone(o: SessionStatus, op: Extract<Op, { kind: 'milestone' }>, now: number): SessionStatus {
  const known = findMilestone(o, op.name)
  if (known) {
    if (op.status === 'done' || op.status === 'dropped')
      moveMilestone(
        o,
        known,
        op.status === 'done'
          ? { kind: 'done', ref: known.id, text: op.text }
          : { kind: 'drop', ref: known.id, why: op.text, into: null },
        now,
      )
    else moveMilestone(o, known, { kind: 'set', ref: known.id, status: op.status, text: op.text }, now)
    return o
  }
  const isFull =
    !o.goal!.isAwaitingMilestones && o.milestones.filter(m => m.status !== 'dropped').length >= MILESTONES_MAX
  if (isFull) return o
  const m: Milestone = {
    id: `m${o.nextMilestoneId}`,
    name: clipWords(op.name, NAME_KEPT),
    status: op.status,
    text: clipWords(op.text, TEXT_KEPT),
    was: null,
    changedAt: now,
    closedAt: op.status === 'done' || op.status === 'dropped' ? now : null,
  }

  return { ...o, nextMilestoneId: o.nextMilestoneId + 1, milestones: [...o.milestones, m] }
}

/**
 * Applies a GOAL, MILESTONE or SERVES line. A GOAL line only ever proposes: the goal itself changes on a press alone.
 * A proposal with fewer than `MILESTONES_MIN` milestones, of the current goal or of a declined one is dropped.
 * Milestones and links need a goal.
 */
export function applyGoalOp(
  o: SessionStatus,
  op: Extract<Op, { kind: 'goal' | 'milestone' | 'serves' }>,
  now: number,
  findSubject: (ref: string) => Subject | null,
): SessionStatus {
  if (op.kind === 'goal') {
    const text = clipWords(op.text, DESCRIPTION_KEPT)
    const key = nameKey(text)
    const isCurrent = o.goal !== null && nameKey(o.goal.text) === key
    if (op.milestones.length < MILESTONES_MIN || isCurrent || o.declinedGoals.includes(key)) return o
    const milestones = op.milestones
      .slice(0, MILESTONES_MAX)
      .map(m => ({ name: clipWords(m.name, NAME_KEPT), status: m.status }))

    return { ...o, proposedGoal: { text, milestones, at: now } }
  }
  if (o.goal === null) return o
  if (op.kind === 'milestone') return addMilestone(o, op, now)
  const subject = findSubject(op.subject)
  const milestone = op.milestone === null ? null : findMilestone(o, op.milestone)
  if (!subject || (op.milestone !== null && !milestone)) return o

  return { ...o, serves: { ...o.serves, [subject.id]: milestone?.id ?? 'none' } }
}

/**
 * The goal once an answer has applied. A typed goal carries the milestones of the goal before it until an answer from a
 * call that read this goal applies: that answer keeps up to `MILESTONES_MAX` of the milestones it names in `named` and
 * has not dropped, and the rest go. While the goal waits, the carried milestones do not count toward that limit. Until it keeps one, the goal still waits for its milestones. The was line goes once the person has seen it,
 * and the goal is met while every milestone that is not dropped is done. Met follows the milestones, so a milestone
 * that opens again unmeets it. `readSetAt` is when the goal the call read was set, or null when it read none: a call
 * that read an earlier goal wrote for that goal.
 */
export function settleGoal(
  o: SessionStatus,
  now: number,
  readSetAt: number | null,
  named: ReadonlySet<string>,
): SessionStatus {
  if (o.goal === null) return o
  const setAt = o.goal.setAt
  const isSeen = o.lastLookAt !== null && setAt <= o.lastLookAt
  const isAnswerForNewGoal = o.goal.isAwaitingMilestones && readSetAt === setAt
  const milestones = isAnswerForNewGoal
    ? o.milestones.filter(m => named.has(m.id) && m.status !== 'dropped').slice(0, MILESTONES_MAX)
    : o.milestones
  const isAwaiting = o.goal.isAwaitingMilestones && (!isAnswerForNewGoal || milestones.length === 0)
  const kept = milestones.filter(m => m.status !== 'dropped')
  const isMet = !isAwaiting && kept.length > 0 && kept.every(m => m.status === 'done')
  const was = isSeen ? null : o.goal.was
  const metAt = isMet ? (o.goal.metAt ?? now) : null
  const isSame =
    milestones.length === o.milestones.length &&
    was === o.goal.was &&
    isAwaiting === o.goal.isAwaitingMilestones &&
    metAt === o.goal.metAt
  if (isSame) return o
  const settled = { ...o, milestones, goal: { ...o.goal, was, isAwaitingMilestones: isAwaiting, metAt } }

  return isAnswerForNewGoal ? withoutLinksTo(settled, milestones) : settled
}

/** Links to milestones that `milestones` no longer holds, dropped so their subjects count as not linked yet. */
function withoutLinksTo(o: SessionStatus, milestones: readonly Milestone[]): SessionStatus {
  const ids = new Set(milestones.map(m => m.id))
  const keep = ([, to]: [string, string]) => to === 'none' || !/^m\d+$/.test(to) || ids.has(to)

  return {
    ...o,
    serves: Object.fromEntries(Object.entries(o.serves).filter(keep)),
    askSubjects: Object.fromEntries(Object.entries(o.askSubjects).filter(keep)),
  }
}

/** Use this goal: the proposal becomes the goal, with its milestones as it proposed them and no subject linked yet. */
export function useProposedGoal(o: SessionStatus, now: number): SessionStatus {
  const p = o.proposedGoal
  if (p === null) return o
  const milestones: Milestone[] = p.milestones.map((m, n) => ({
    id: `m${o.nextMilestoneId + n}`,
    name: m.name,
    status: m.status,
    text: '',
    was: null,
    changedAt: now,
    closedAt: isOpen(m) ? null : now,
  }))
  const goal = { text: p.text, setAt: now, metAt: null, was: o.goal?.text ?? null, isAwaitingMilestones: false }

  return settleGoal(
    withoutLinksTo(
      {
        ...o,
        goal,
        proposedGoal: null,
        milestones,
        nextMilestoneId: o.nextMilestoneId + milestones.length,
        serves: {},
      },
      milestones,
    ),
    now,
    null,
    new Set(),
  )
}

/** Not now: the proposal goes, and the call is told not to propose it again. */
export function declineProposedGoal(o: SessionStatus): SessionStatus {
  if (o.proposedGoal === null) return o
  const declinedGoals = [...o.declinedGoals, nameKey(o.proposedGoal.text)].slice(-DECLINED_KEPT)

  return { ...o, proposedGoal: null, declinedGoals }
}

/**
 * A goal the person typed. One with a proposal's words uses the proposal and its milestones, as Use this goal does. Any
 * other declines a proposal. A rewording of the goal keeps its milestones and needs no message. Any other goal replaces
 * it, unlinks every subject, and carries the milestones until the Status call that reads it keeps the ones it names. The
 * page draws none of them until then.
 */
export function setTypedGoal(o: SessionStatus, text: string, now: number): { status: SessionStatus; isNew: boolean } {
  const typed = clipWords(text, DESCRIPTION_KEPT)
  if (typed === '') return { status: o, isNew: false }
  const p = o.proposedGoal
  if (p !== null && hasSameWords(p.text, typed)) {
    const used = useProposedGoal(o, now)

    return { status: { ...used, goal: { ...used.goal!, text: typed } }, isNew: true }
  }
  const declined = declineProposedGoal(o)
  const isReworded = o.goal !== null && hasSameWords(o.goal.text, typed)
  if (isReworded) return { status: { ...declined, goal: { ...o.goal!, text: typed } }, isNew: false }
  const goal = { text: typed, setAt: now, metAt: null, was: o.goal?.text ?? null, isAwaitingMilestones: true }

  return { status: { ...declined, goal, serves: {} }, isNew: true }
}
