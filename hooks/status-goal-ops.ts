import type { GoalRefusal, Milestone, SessionStatus, StatusGoal, Subject } from '../types'
import type { Op } from './status'
import { goalRefusal, hasWorkForGoal } from './status-goal-gate'
import {
  clipWords,
  DESCRIPTION_KEPT,
  isOpen,
  MILESTONES_MAX,
  MILESTONES_MIN,
  NAME_KEPT,
  nameKey,
  namesOtherVersion,
  NL,
  REMOVED_KEPT,
  stems,
  TEXT_KEPT,
  words,
} from './status-limits'

/** The share of a GOAL line's words, as stems, that a goal must hold for the line to restate it. */
const RESTATED_SHARE = 0.8

/**
 * Whether a GOAL line's text restates `goal`, a goal's text or a removed goal's key: most of its words are the goal's
 * once cut to their stems, and it names no number the goal does not, since another version is another goal.
 */
export function restatesGoal(text: string, goal: string): boolean {
  const own = [...stems(text)]
  const theirs = stems(goal)
  const shared = own.filter(w => theirs.has(w)).length
  const hasNewNumber = own.some(w => /\d/.test(w) && !theirs.has(w))

  return own.length > 0 && !hasNewNumber && shared >= RESTATED_SHARE * own.length
}

/**
 * Whether a GOAL line's milestones are the current goal's, by name key. A goal that waits for its milestones still holds
 * the milestones of the goal before it, so it has none to compare.
 */
function hasGoalMilestones(o: SessionStatus, written: readonly { name: string }[]): boolean {
  if (o.goal === null || o.goal.isAwaitingMilestones) return false
  const keys = (names: string[]) => names.map(nameKey).sort().join(NL)
  const kept = o.milestones.filter(m => m.status !== 'dropped').map(m => m.name)

  return kept.length > 0 && keys(kept) === keys(written.map(m => m.name))
}

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

/** The milestone a SERVES or LINK line may link to: one `findMilestone` finds that is not dropped. */
export function linkableMilestone(o: SessionStatus, ref: string): Milestone | null {
  const m = findMilestone(o, ref)

  return m && m.status !== 'dropped' ? m : null
}

/** A was line stays until the person has seen it. */
function forgetSeenWas(m: Milestone, lastLookAt: number | null): void {
  if (lastLookAt !== null && m.changedAt <= lastLookAt) m.was = null
}

/**
 * Moves a milestone as SET, DONE, DROP or WAS does a subject, under the same hold: a rewording keeps its text and time.
 * A DROP passes the subjects and asks linked to the milestone to its INTO milestone, and with none unlinks them.
 */
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
    if (m.status === 'done') return
    m.status = 'done'
    if (op.text) m.text = clipWords(op.text, TEXT_KEPT)
    m.closedAt = now
  } else if (op.kind === 'drop') {
    const target = op.into ? linkableMilestone(o, op.into) : null
    m.status = 'dropped'
    m.text = clipWords(op.why, TEXT_KEPT)
    m.closedAt = now
    const into = target && target.id !== m.id ? target.id : null
    for (const [id, to] of Object.entries(o.serves)) {
      if (to !== m.id) continue
      if (into) o.serves[id] = into
      else delete o.serves[id]
    }
    for (const [ask, ids] of Object.entries(o.askSubjects)) {
      if (!ids.includes(m.id)) continue
      const kept = (into ? linksWith(ids, into) : ids).filter(id => id !== m.id)
      if (kept.length > 0) o.askSubjects[ask] = kept
      else delete o.askSubjects[ask]
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

/** A MILESTONE line for a milestone the goal holds moves it, and one with no text keeps the text it has. */
function addMilestone(o: SessionStatus, op: Extract<Op, { kind: 'milestone' }>, now: number): SessionStatus {
  const known = findMilestone(o, op.name)
  if (known) {
    const text = op.text || known.text
    if (op.status === 'done' || op.status === 'dropped')
      moveMilestone(
        o,
        known,
        op.status === 'done'
          ? { kind: 'done', ref: known.id, text }
          : { kind: 'drop', ref: known.id, why: text, into: null },
        now,
      )
    else moveMilestone(o, known, { kind: 'set', ref: known.id, status: op.status, text }, now)
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
 * The answer with each GOAL line that restates a goal just set, from a call that read that goal, read as MILESTONE
 * lines for its milestones. The call meant them as the goal's milestones, and the goal stays as the person typed it.
 */
export function withRestatedGoalAsMilestones(o: SessionStatus | null, ops: Op[], readSetAt: number | null): Op[] {
  const g = o?.goal
  const isReadJustSet = g != null && g.isAwaitingMilestones && readSetAt === g.setAt
  if (!isReadJustSet) return ops

  return ops.flatMap(op =>
    op.kind === 'goal' && restatesGoal(clipWords(op.text, DESCRIPTION_KEPT), g.text)
      ? op.milestones.map(m => ({ kind: 'milestone' as const, status: m.status, name: m.name, text: '' }))
      : [op],
  )
}

/** The goal a GOAL line sets, with its milestones as it wrote them and no subject linked yet. */
function inferredGoal(
  o: SessionStatus,
  text: string,
  named: readonly { name: string; status: Milestone['status'] }[],
  now: number,
): SessionStatus {
  const milestones: Milestone[] = named.map((m, n) => ({
    id: `m${o.nextMilestoneId + n}`,
    name: m.name,
    status: m.status,
    text: '',
    was: null,
    changedAt: now,
    closedAt: isOpen(m) ? null : now,
  }))
  const goal: StatusGoal = {
    text,
    setAt: now,
    metAt: null,
    was: o.goal?.text ?? null,
    isAwaitingMilestones: false,
    source: 'inferred',
  }

  return withoutLinksTo(
    {
      ...o,
      goal,
      goalRemoved: null,
      goalRefused: null,
      milestones,
      nextMilestoneId: o.nextMilestoneId + milestones.length,
      serves: {},
    },
    milestones,
  )
}

/** Why a GOAL line may not set the goal as `o` stands, or null when it may, apart from the gate `goalRefusal` keeps. */
function goalLineRefusal(o: SessionStatus, op: Extract<Op, { kind: 'goal' }>): GoalRefusal['why'] | null {
  const text = clipWords(op.text, DESCRIPTION_KEPT)
  const milestones = op.milestones.slice(0, MILESTONES_MAX).map(m => ({ name: clipWords(m.name, NAME_KEPT) }))
  const g = o.goal
  const isCurrent = g !== null && (restatesGoal(text, g.text) || hasGoalMilestones(o, milestones))
  const isPrevious = g?.was != null && restatesGoal(text, g.was)
  const isRemoved = o.removedGoals.some(key => restatesGoal(text, key))
  if (op.milestones.length < MILESTONES_MIN) return 'few-milestones'
  if (isCurrent || isPrevious || isRemoved) return 'restates'

  return hasWorkForGoal(o) ? null : 'no-work'
}

/**
 * Applies a GOAL, RETIRE, MILESTONE or SERVES line. A GOAL line sets the goal when `goalRefusal` allows it,
 * `hasWorkForGoal` holds, it has `MILESTONES_MIN` milestones, and it restates neither the goal, in its words or its
 * milestones, nor the goal it replaced, nor a removed one. RETIRE clears the goal when `goalRefusal` allows it, so
 * never a goal the same answer set. The gate reads the milestones as the answer's subject lines close them, so a GOAL
 * may follow the DONE that finishes the goal's last work. A refused line is saved for the next call to read.
 * Milestones and links need a goal. A SERVES line whose subject names another version than its milestone, as "2.6
 * beta" under "2.5 published", links the subject under none: another version's work is never part of the outcome.
 */
export function applyGoalOp(
  o: SessionStatus,
  op: Extract<Op, { kind: 'goal' | 'retire' | 'milestone' | 'serves' }>,
  now: number,
  findSubject: (ref: string) => Subject | null,
  start: SessionStatus = o,
): SessionStatus {
  if (op.kind === 'goal' || op.kind === 'retire') {
    const settled = o.goal?.isAwaitingMilestones ? o : withWorkDoneMilestones(o, now)
    const why = (op.kind === 'goal' && goalLineRefusal(settled, op)) || goalRefusal(settled, start, op.kind, now)
    if (why !== null) return { ...o, goalRefused: { line: op.kind, why } }
    if (op.kind === 'retire') return withoutGoal(o)
    const milestones = op.milestones
      .slice(0, MILESTONES_MAX)
      .map(m => ({ name: clipWords(m.name, NAME_KEPT), status: m.status }))

    return inferredGoal(o, clipWords(op.text, DESCRIPTION_KEPT), milestones, now)
  }
  if (o.goal === null) return o
  if (op.kind === 'milestone') return addMilestone(o, op, now)
  const subject = findSubject(op.subject)
  const milestone = op.milestone === null ? null : linkableMilestone(o, op.milestone)
  if (!subject || (op.milestone !== null && !milestone)) return o
  const isOtherVersion = milestone !== null && namesOtherVersion(subject.name, milestone.name)

  return { ...o, serves: { ...o.serves, [subject.id]: milestone === null || isOtherVersion ? 'none' : milestone.id } }
}

/**
 * Closes each open milestone whose linked work closed: at least one subject is linked, every one is closed and one is
 * done, and one closed after the milestone last changed. A milestone the call opened again after its work closed
 * stays open until another linked subject closes.
 */
function withWorkDoneMilestones(o: SessionStatus, now: number): SessionStatus {
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
 * The goal once an answer has applied. A typed goal carries the milestones of the goal before it until an answer from a
 * call that read this goal applies: that answer keeps up to `MILESTONES_MAX` of the milestones it names in `named` and
 * has not dropped, and the rest go. While the goal waits, the carried milestones do not count toward that limit. Until it keeps one, the goal still waits for its milestones. Otherwise each milestone whose linked work closed is
 * closed, as `withWorkDoneMilestones` says. The was line goes once the person has seen it,
 * and the goal is met while every milestone that is not dropped is done. Met follows the milestones, so a milestone
 * that opens again unmeets it. `readSetAt` is when the goal the call read was set, or null when it read none: a call
 * that read an earlier goal wrote for that goal.
 */
export function settleGoal(
  saved: SessionStatus,
  now: number,
  readSetAt: number | null,
  named: ReadonlySet<string>,
): SessionStatus {
  const g = saved.goal
  if (g === null) return saved
  const o = g.isAwaitingMilestones ? saved : withWorkDoneMilestones(saved, now)
  const isSeen = o.lastLookAt !== null && g.setAt <= o.lastLookAt
  const isAnswerForNewGoal = g.isAwaitingMilestones && readSetAt === g.setAt
  const milestones = isAnswerForNewGoal
    ? o.milestones.filter(m => named.has(m.id) && m.status !== 'dropped').slice(0, MILESTONES_MAX)
    : o.milestones
  const isAwaiting = g.isAwaitingMilestones && (!isAnswerForNewGoal || milestones.length === 0)
  const kept = milestones.filter(m => m.status !== 'dropped')
  const isMet = !isAwaiting && kept.length > 0 && kept.every(m => m.status === 'done')
  const was = isSeen ? null : g.was
  const metAt = isMet ? (g.metAt ?? now) : null
  const isSame =
    milestones.length === o.milestones.length &&
    was === g.was &&
    isAwaiting === g.isAwaitingMilestones &&
    metAt === g.metAt
  if (isSame) return o
  const settled = { ...o, milestones, goal: { ...g, was, isAwaitingMilestones: isAwaiting, metAt } }

  return isAnswerForNewGoal ? withoutLinksTo(settled, milestones) : settled
}

/** An ask's links with `id` added after the others, once. */
export const linksWith = (ids: readonly string[], id: string): string[] => (ids.includes(id) ? [...ids] : [...ids, id])

/** Links to milestones that `milestones` no longer holds, dropped so their subjects count as not linked yet. */
function withoutLinksTo(o: SessionStatus, milestones: readonly Milestone[]): SessionStatus {
  const ids = new Set(milestones.map(m => m.id))
  const isKept = (to: string) => to === 'none' || !/^m\d+$/.test(to) || ids.has(to)
  const askLinks = Object.entries(o.askSubjects).map(([ask, to]): [string, string[]] => [ask, to.filter(isKept)])

  return {
    ...o,
    serves: Object.fromEntries(Object.entries(o.serves).filter(([, to]) => isKept(to))),
    askSubjects: Object.fromEntries(askLinks.filter(([, to]) => to.length > 0)),
  }
}

/** The Status with no goal: its milestones go, and so do the links to them. */
function withoutGoal(o: SessionStatus): SessionStatus {
  return withoutLinksTo({ ...o, goal: null, goalRefused: null, milestones: [], serves: {} }, [])
}

/** Remove goal: the goal goes, the call is told not to set it again, and Undo can bring it back. */
export function removeGoal(o: SessionStatus): SessionStatus {
  const g = o.goal
  if (g === null) return o
  const removedGoals = [...o.removedGoals.filter(k => k !== nameKey(g.text)), nameKey(g.text)]
  const goalRemoved = { goal: g, milestones: o.milestones, serves: o.serves, askSubjects: o.askSubjects }

  return { ...withoutGoal(o), removedGoals: removedGoals.slice(-REMOVED_KEPT), goalRemoved }
}

/** Undo of Remove goal: the goal comes back with its milestones and links, and the call may set it again. */
export function restoreGoal(o: SessionStatus): SessionStatus {
  const r = o.goalRemoved
  if (r === null || o.goal !== null) return o
  const key = nameKey(r.goal.text)
  const subjectIds = new Set(o.subjects.map(s => s.id))
  const serves = Object.fromEntries(Object.entries(r.serves).filter(([id]) => subjectIds.has(id)))

  return {
    ...o,
    goal: r.goal,
    milestones: r.milestones,
    serves,
    askSubjects: r.askSubjects,
    removedGoals: o.removedGoals.filter(k => k !== key),
    goalRemoved: null,
  }
}

/**
 * A goal the person typed, which makes the goal theirs. A rewording of a goal that is not met keeps its milestones and
 * needs no message. A met goal typed again is a new goal. Any other goal replaces it, unlinks every subject, and carries the milestones until the Status call that
 * reads it keeps the ones it names. The page draws none of them until then.
 */
export function setTypedGoal(o: SessionStatus, text: string, now: number): SessionStatus {
  const typed = clipWords(text, DESCRIPTION_KEPT)
  if (typed === '') return o
  const isReworded = o.goal !== null && o.goal.metAt === null && hasSameWords(o.goal.text, typed)
  if (isReworded) return { ...o, goal: { ...o.goal!, text: typed, source: 'typed' } }
  const goal: StatusGoal = {
    text: typed,
    setAt: now,
    metAt: null,
    was: o.goal?.text ?? null,
    isAwaitingMilestones: true,
    source: 'typed',
  }

  return { ...o, goal, goalRemoved: null, goalRefused: null, serves: {} }
}
