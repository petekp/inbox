import type { Milestone, SessionStatus, StatusHead, Subject } from '../types'
import type { Op, StatusAnswer } from './status'
import { isChildRunning, isSubjectSeen } from './status-children'
import {
  clipWords,
  DESCRIPTION_KEPT,
  EMPTY_SESSION_STATUS,
  IDLE_AFTER_MS,
  isNumberOnly,
  isOpen,
  isUnderWay,
  NAME_KEPT,
  nameKey,
  TEXT_KEPT,
  words,
} from './status-limits'
import type { OpenStatus } from './status-limits'
import {
  applyGoalOp,
  findMilestone,
  hasSameWords,
  linkableMilestone,
  withNextMilestone,
  linksWith,
  moveMilestone,
  settleGoal,
  withRestatedGoalAsMilestones,
} from './status-goal-ops'
import { withSuggestion } from './status-suggest'

/** What an answer did to the work, read once its subject changes have applied at `now`. */
type AnswerWork = {
  /** The answer finished work that was under way before it, and finished none that it started. */
  isEarlierWorkFinished: boolean
  /** Work is under way after the answer: a subject is working, or the answer set one waiting. */
  isWorkUnderWay: boolean
  /** No subject is working, waiting, held up by an open ask or worked on by a running child after the answer. */
  isNothingUnderWay: boolean
  /** The answer closed a subject that was open before it. */
  isOpenWorkClosed: boolean
  /** The answer closed a subject that was working or waiting before it. */
  isUnderWayWorkClosed: boolean
  /** The answer closed a subject it added. */
  isClosedWorkNew: boolean
  /** Whether `description` names a subject the answer closed, by every content word of its name. */
  namesClosed(description: string): boolean
  /** Whether `description` names any closed subject, by every content word of its name. */
  namesFinished(description: string): boolean
}

function namesAny(subjects: readonly Subject[], description: string): boolean {
  const said = words(description)
  return subjects.some(s => {
    const name = [...words(s.name)]
    return name.length > 0 && name.every(w => said.has(w))
  })
}

function answerWork(before: readonly Subject[], o: SessionStatus, now: number): AnswerWork {
  const was = new Map(before.map(s => [s.id, s]))
  const closed = o.subjects.filter(s => {
    const earlier = was.get(s.id)
    return !isOpen(s) && s.closedAt === now && (earlier === undefined || isOpen(earlier))
  })
  const isClosedWorkNew = closed.some(s => !was.has(s.id))
  const isUnderWayWorkClosed = closed.some(s => {
    const earlier = was.get(s.id)
    return earlier !== undefined && isUnderWay(earlier)
  })

  const asked = new Set(Object.values(o.askSubjects).flat())
  const isWorkedOn = (s: Subject) => o.children.some(c => c.subjectId === s.id && isChildRunning(c, now))
  const isHeld = (s: Subject) => isOpen(s) && (asked.has(s.id) || isWorkedOn(s))
  const isNothingUnderWay = !o.subjects.some(s => isUnderWay(s) || isHeld(s))

  return {
    isEarlierWorkFinished: isUnderWayWorkClosed && !isClosedWorkNew,
    isWorkUnderWay: o.subjects.some(
      s => s.status === 'working' || (s.status === 'waits-on-other' && s.changedAt === now),
    ),
    isNothingUnderWay,
    isOpenWorkClosed: closed.some(s => was.has(s.id)),
    isUnderWayWorkClosed,
    isClosedWorkNew,
    namesClosed: description => namesAny(closed, description),
    namesFinished: description =>
      namesAny(
        o.subjects.filter(s => !isOpen(s)),
        description,
      ),
  }
}

/**
 * Whether a head's description no longer says what the session is doing. While other work goes on, a head that kept
 * its title names work the answer finished, as "Fixing the sync bug, then shipping 2.5" once the sync bug is done and
 * 2.5 is under way. Once nothing is under way, it is stale when it names any finished work, or when the answer finished
 * the work it was about: under a kept title, any work that was open before the answer, and under a new title, work that
 * was under way before it or that it started. A side fix that started and finished while the head's work waits queued
 * leaves the description.
 */
function isDescriptionStale(head: StatusHead | null, isTitleKept: boolean, work: AnswerWork): boolean {
  if (head === null || head.description === '') return false
  if (!work.isNothingUnderWay) return isTitleKept && work.namesClosed(head.description)
  const isHeadWorkClosed = isTitleKept ? work.isOpenWorkClosed : work.isUnderWayWorkClosed || work.isClosedWorkNew

  return isHeadWorkClosed || work.namesFinished(head.description)
}

/**
 * The head after a HEAD line, read once the answer's subject changes have applied. While nothing is under way, a line
 * that keeps the title changes nothing when the head has no description or the answer closed work that was open before
 * it: then the call describes what comes after the work. A head with no description otherwise takes the line. A head
 * with a description holds when the answer finished work that was under way before it, started none it finished, and
 * left none under way, since the call reads queued work as the next focus. Otherwise a line that keeps the title keeps
 * the title's wording and takes the line's description, so a corrected description applies, and a line with another
 * title replaces the head.
 */
function headAfter(last: StatusHead | null, op: Extract<Op, { kind: 'head' }>, work: AnswerWork): StatusHead {
  const line = { title: clipWords(op.title, NAME_KEPT), description: clipWords(op.description, DESCRIPTION_KEPT) }
  if (last === null) return line
  const isIdleSameTitle = work.isNothingUnderWay && hasSameWords(last.title, op.title)
  if (isIdleSameTitle && (last.description === '' || work.isOpenWorkClosed)) return last
  if (last.description === '') return line
  const isQueuedWorkNext = work.isEarlierWorkFinished && !work.isWorkUnderWay
  if (isQueuedWorkNext) return last
  if (!hasSameWords(last.title, op.title)) return line
  const isSameDescription = line.description === '' || hasSameWords(last.description, line.description)

  return isSameDescription ? last : { title: last.title, description: line.description }
}

/**
 * Subject changes first, then the goal, then milestones, then reversals and the head, then links. So the goal's guard
 * reads the subjects as the answer left them, a MILESTONE line adds to a goal the same answer set, a WAS or LINK can
 * name a subject the same answer added, and the head reads the subjects as the answer left them. NEXT moves its
 * milestone once the goal has settled, so a goal just set keeps its plan's order before NEXT moves one.
 */
const OP_ORDER: Record<Op['kind'], number> = {
  none: 0,
  new: 0,
  set: 0,
  done: 0,
  drop: 0,
  goal: 1,
  retire: 1,
  milestone: 2,
  head: 3,
  was: 3,
  link: 4,
  serves: 4,
  next: 4,
  suggest: 4,
}

/**
 * The list after `ops`, applied at `now`. `askIds` are the open asks: a LINK may name one, and the links of the others
 * go. A line that names an id or a name the list does not hold, or an ask that is not open, changes nothing. A GOAL
 * line that restates a goal just set gives its milestones, so the SERVES lines that name them link.
 */
export function applyOps(
  last: SessionStatus | null,
  ops: Op[],
  now: number,
  askIds: ReadonlySet<string>,
  readSetAt: number | null = last?.goal?.setAt ?? null,
): SessionStatus {
  let o: SessionStatus = {
    ...(last ?? EMPTY_SESSION_STATUS),
    subjects: (last?.subjects ?? []).map(s => ({ ...s })),
    children: (last?.children ?? []).map(c => ({ ...c })),
    milestones: (last?.milestones ?? []).map(m => ({ ...m })),
    serves: { ...last?.serves },
    askSubjects: Object.fromEntries(Object.entries(last?.askSubjects ?? {}).filter(([ask]) => askIds.has(ask))),
    goalRefused: null,
  }
  const closedHere = new Set<string>()
  const find = (ref: string) => {
    const key = nameKey(clipWords(ref, NAME_KEPT))

    return o.subjects.find(s => s.id === ref) ?? o.subjects.find(s => isOpen(s) && nameKey(s.name) === key) ?? null
  }
  /**
   * The subject that closed since the person last looked whose name `name` repeats word for word, the latest first. A
   * NEW for it reopens it, so the page shows one row for the piece, not one for each time it finished. A longer name,
   * as "Retry button release" after "Retry button", is other work. A subject this answer closed is not reopened by it,
   * so a DONE and a NEW for follow-up work stay two rows.
   */
  const closedUnseen = (name: string) => {
    const key = nameKey(clipWords(name, NAME_KEPT))

    return (
      o.subjects.findLast(
        s => !isOpen(s) && !closedHere.has(s.id) && !isSubjectSeen(o, s) && nameKey(s.name) === key,
      ) ?? null
    )
  }
  /** A was line and a merged line stay until the person has seen them. The page shows them only on rows that changed since the last look. */
  const forgetSeenWas = (s: Subject) => {
    if (isSubjectSeen(o, s)) {
      s.was = null
      s.merged = null
    }
  }
  /** A subject folded into another comes back out: the other no longer names it as merged. */
  const unfold = (s: Subject) => {
    const target = s.into === null ? undefined : o.subjects.find(x => x.id === s.into)
    if (target?.merged)
      target.merged =
        target.merged
          .split(', ')
          .filter(name => name !== s.name)
          .join(', ') || null
    s.into = null
  }
  const set = (s: Subject, status: OpenStatus, text: string) => {
    const isUnchanged = s.status === status && hasSameWords(s.text, text)
    const isIdle = now - s.changedAt >= IDLE_AFTER_MS
    const isWorkResumed = status === 'working' && isIdle
    if (isUnchanged && !isWorkResumed) {
      if (isIdle && isUnderWay(s)) s.keptAt = now
      return
    }
    s.status = status
    s.text = clipWords(text, TEXT_KEPT)
    s.closedAt = null
    unfold(s)
    forgetSeenWas(s)
    s.changedAt = now
  }
  /** Each milestone the answer names, with the first of its lines that names it. */
  const named = new Map<string, number>()
  let nextRef: string | null = null
  const markNamed = (m: Milestone | null, line: number) => {
    if (m) named.set(m.id, Math.min(line, named.get(m.id) ?? Infinity))
  }
  const servesLines = ops.flatMap(op => (op.kind === 'serves' ? [op] : []))
  const ordered = withRestatedGoalAsMilestones(last, ops, readSetAt)
    .map((op, n) => ({ op, n }))
    .sort((x, y) => OP_ORDER[x.op.kind] - OP_ORDER[y.op.kind] || x.n - y.n)
  for (const { op, n } of ordered) {
    if (op.kind === 'none' || op.kind === 'suggest') continue
    if (op.kind === 'next') {
      markNamed(findMilestone(o, op.ref), n)
      nextRef = op.ref
      continue
    }
    if (op.kind === 'goal' || op.kind === 'retire' || op.kind === 'milestone' || op.kind === 'serves') {
      o = applyGoalOp(o, op, now, find, last ?? o, servesLines)
      if (op.kind === 'milestone') markNamed(findMilestone(o, op.name), n)
      if (op.kind === 'serves' && op.milestone !== null) markNamed(findMilestone(o, op.milestone), n)
    } else if (op.kind === 'head') {
      if (!isNumberOnly(op.title)) o.head = headAfter(o.head, op, answerWork(last?.subjects ?? [], o, now))
    } else if (op.kind === 'link') {
      const child = o.children.find(c => c.id === op.ref)
      const subject = find(op.subject)
      const milestone = subject ? null : linkableMilestone(o, op.subject)
      const linked = subject ?? milestone
      if (child && subject) child.subjectId = subject.id
      else if (linked && askIds.has(op.ref)) o.askSubjects[op.ref] = linksWith(o.askSubjects[op.ref] ?? [], linked.id)
      markNamed(milestone, n)
    } else if (op.kind === 'new') {
      if (isNumberOnly(op.name)) continue
      const known = find(op.name)
      const repeated = known && isOpen(known) ? known : closedUnseen(op.name)
      if (repeated) {
        set(repeated, op.status, op.text)
        continue
      }
      const s: Subject = {
        id: `s${o.nextId}`,
        name: clipWords(op.name, NAME_KEPT),
        status: op.status,
        text: clipWords(op.text, TEXT_KEPT),
        was: null,
        merged: null,
        createdAt: now,
        changedAt: now,
        closedAt: null,
        into: null,
      }
      o = { ...o, nextId: o.nextId + 1, subjects: [...o.subjects, s] }
    } else {
      const s = find(op.ref)
      const milestone = s ? null : findMilestone(o, op.ref)
      if (milestone) moveMilestone(o, milestone, op, now)
      markNamed(milestone, n)
      if (!s) continue
      if (op.kind === 'set') set(s, op.status, op.text)
      else if (op.kind === 'done') {
        if (s.status === 'done') continue
        s.status = 'done'
        unfold(s)
        if (op.text) s.text = clipWords(op.text, TEXT_KEPT)
        forgetSeenWas(s)
        s.closedAt = now
        s.changedAt = now
        closedHere.add(s.id)
      } else if (op.kind === 'drop') {
        const target = op.into ? find(op.into) : null
        unfold(s)
        s.status = 'dropped'
        s.text = clipWords(op.why, TEXT_KEPT)
        s.closedAt = now
        s.into = target && target.id !== s.id ? target.id : null
        s.changedAt = now
        closedHere.add(s.id)
        if (target && s.into) {
          forgetSeenWas(target)
          target.merged = target.merged ? `${target.merged}, ${s.name}` : s.name
          target.changedAt = now
          for (const [ask, ids] of Object.entries(o.askSubjects))
            if (ids.includes(s.id)) o.askSubjects[ask] = linksWith(ids, target.id).filter(id => id !== s.id)
        }
      } else {
        forgetSeenWas(s)
        s.was = op.text
        s.changedAt = now
      }
    }
  }
  const isTitleKept = !!o.head && !!last?.head && o.head.title === last.head.title
  if (o.head && isDescriptionStale(o.head, isTitleKept, answerWork(last?.subjects ?? [], o, now)))
    o = { ...o, head: { ...o.head, description: '' } }

  const settled = settleGoal(o, now, readSetAt, named)

  return withSuggestion(nextRef === null ? settled : withNextMilestone(settled, nextRef, now), ops)
}

/**
 * The Status after an answer, applied at `now`. `askIds` are the open asks. A removed goal's Undo lasts until an answer
 * from a call that did not read that goal applies: the call moved on from it. A refused GOAL or RETIRE line is kept
 * for one call: the answer after it, with lines or NO CHANGE, read it. An answer whose only lines are `SUGGEST: -` while
 * nothing is suggested changes nothing, as NO CHANGE does.
 */
export function applyStatus(
  last: SessionStatus | null,
  answer: StatusAnswer,
  now: number,
  askIds: ReadonlySet<string>,
  readSetAt: number | null = last?.goal?.setAt ?? null,
): SessionStatus | null {
  const isNoSuggestionOnly =
    answer.kind === 'ops' &&
    (last?.suggestedGoal ?? null) === null &&
    answer.ops.every(op => op.kind === 'suggest' && op.text === null)
  const changes = answer.kind === 'ops' && !isNoSuggestionOnly ? answer.ops : null
  const read = last?.goalRefused ? { ...last, goalRefused: null } : last
  const o = changes ? applyOps(last, changes, now, askIds, readSetAt) : read
  if (o === null) return null
  const settled = changes ? o : settleGoal(o, now, readSetAt, new Map())
  const isRemovedRead = settled.goalRemoved !== null && settled.goalRemoved.goal.setAt === readSetAt

  return settled.goalRemoved === null || isRemovedRead ? settled : { ...settled, goalRemoved: null }
}
