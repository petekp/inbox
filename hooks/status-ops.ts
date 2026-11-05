import type { Milestone, SessionStatus, StatusHead, Subject } from '../types'
import type { Op, StatusAnswer } from './status'
import { isSubjectSeen } from './status-children'
import {
  clipWords,
  DESCRIPTION_KEPT,
  EMPTY_SESSION_STATUS,
  isNumberOnly,
  isOpen,
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
  linksWith,
  moveMilestone,
  settleGoal,
  withRestatedGoalAsMilestones,
} from './status-goal-ops'

function isUnderWay(s: Pick<Subject, 'status'>): boolean {
  return s.status === 'working' || s.status === 'waits-on-other'
}

/** What an answer did to the work, read once its subject changes have applied at `now`. */
type AnswerWork = {
  /** The answer finished work that was under way before it, and finished none that it started. */
  isEarlierWorkFinished: boolean
  /** Work is under way after the answer: a subject is working, or the answer set one waiting. */
  isWorkUnderWay: boolean
  /** Whether `description` names a subject the answer closed, by every content word of its name. */
  namesClosed(description: string): boolean
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

  return {
    isEarlierWorkFinished: isUnderWayWorkClosed && !isClosedWorkNew,
    isWorkUnderWay: o.subjects.some(
      s => s.status === 'working' || (s.status === 'waits-on-other' && s.changedAt === now),
    ),
    namesClosed: description => {
      const said = words(description)
      return closed.some(s => {
        const name = [...words(s.name)]
        return name.length > 0 && name.every(w => said.has(w))
      })
    },
  }
}

/**
 * Whether a head's description names work the answer finished while other work goes on, as "Fixing the sync bug, then
 * shipping 2.5" once the sync bug is done and 2.5 is under way.
 */
function isDescriptionStale(head: StatusHead | null, work: AnswerWork): boolean {
  return head !== null && head.description !== '' && work.isWorkUnderWay && work.namesClosed(head.description)
}

/**
 * The head after a HEAD line, read once the answer's subject changes have applied. A head with a description holds
 * when the line keeps its title, since the call rewrites the description to track the current piece of the focus,
 * unless the description names work the answer finished. It also holds when the answer finished work that was under
 * way before it, started none it finished, and left none under way, since the call reads queued work as the next focus. A head with no description
 * always takes the line.
 */
function headAfter(last: StatusHead | null, op: Extract<Op, { kind: 'head' }>, work: AnswerWork): StatusHead {
  const isComplete = last !== null && last.description !== ''
  const isSameTitle = last !== null && hasSameWords(last.title, op.title)
  const isStale = isDescriptionStale(last, work)
  const isHeld = isComplete && ((isSameTitle && !isStale) || (work.isEarlierWorkFinished && !work.isWorkUnderWay))

  return isHeld
    ? last!
    : { title: clipWords(op.title, NAME_KEPT), description: clipWords(op.description, DESCRIPTION_KEPT) }
}

/**
 * Subject changes first, then the goal, then milestones, then reversals and the head, then links. So the goal's guard
 * reads the subjects as the answer left them, a MILESTONE line adds to a goal the same answer set, a WAS or LINK can
 * name a subject the same answer added, and the head reads the subjects as the answer left them.
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
  }
  const find = (ref: string) => {
    const key = nameKey(clipWords(ref, NAME_KEPT))

    return o.subjects.find(s => s.id === ref) ?? o.subjects.find(s => isOpen(s) && nameKey(s.name) === key) ?? null
  }
  /**
   * The subject that closed since the person last looked whose name `name` repeats, the latest first: the same key
   * words, or every word of a name of two words or more, as "Retry button bug" repeats "Retry button". A NEW for it
   * reopens it, so the page shows one row for the piece, not one for each time it finished.
   */
  const closedUnseen = (name: string) => {
    const said = words(clipWords(name, NAME_KEPT))
    const repeats = (s: Subject) => {
      const own = [...words(s.name)]
      return nameKey(s.name) === nameKey([...said].join(' ')) || (own.length >= 2 && own.every(w => said.has(w)))
    }

    return o.subjects.findLast(s => !isOpen(s) && !isSubjectSeen(o, s) && repeats(s)) ?? null
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
    const isReworded = s.status === status && hasSameWords(s.text, text)
    if (isReworded) return
    s.status = status
    s.text = clipWords(text, TEXT_KEPT)
    s.closedAt = null
    unfold(s)
    forgetSeenWas(s)
    s.changedAt = now
  }
  const named = new Set<string>()
  const markNamed = (m: Milestone | null) => {
    if (m) named.add(m.id)
  }
  const ordered = withRestatedGoalAsMilestones(last, ops, readSetAt)
    .map((op, n) => ({ op, n }))
    .sort((x, y) => OP_ORDER[x.op.kind] - OP_ORDER[y.op.kind] || x.n - y.n)
  for (const { op } of ordered) {
    if (op.kind === 'none') continue
    if (op.kind === 'goal' || op.kind === 'retire' || op.kind === 'milestone' || op.kind === 'serves') {
      o = applyGoalOp(o, op, now, find)
      if (op.kind === 'milestone') markNamed(findMilestone(o, op.name))
      if (op.kind === 'serves' && op.milestone !== null) markNamed(findMilestone(o, op.milestone))
    } else if (op.kind === 'head') {
      if (!isNumberOnly(op.title)) o.head = headAfter(o.head, op, answerWork(last?.subjects ?? [], o, now))
    } else if (op.kind === 'link') {
      const child = o.children.find(c => c.id === op.ref)
      const subject = find(op.subject)
      const milestone = subject ? null : linkableMilestone(o, op.subject)
      const linked = subject ?? milestone
      if (child && subject) child.subjectId = subject.id
      else if (linked && askIds.has(op.ref)) o.askSubjects[op.ref] = linksWith(o.askSubjects[op.ref] ?? [], linked.id)
      markNamed(milestone)
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
      markNamed(milestone)
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
      } else if (op.kind === 'drop') {
        const target = op.into ? find(op.into) : null
        unfold(s)
        s.status = 'dropped'
        s.text = clipWords(op.why, TEXT_KEPT)
        s.closedAt = now
        s.into = target && target.id !== s.id ? target.id : null
        s.changedAt = now
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
  const isHeadKept = o.head === (last?.head ?? null)
  if (isHeadKept && o.head && isDescriptionStale(o.head, answerWork(last?.subjects ?? [], o, now)))
    o = { ...o, head: { ...o.head, description: '' } }

  return settleGoal(o, now, readSetAt, named)
}

/**
 * The Status after an answer, applied at `now`. `askIds` are the open asks. A removed goal's Undo lasts until an answer
 * from a call that did not read that goal applies: the call moved on from it.
 */
export function applyStatus(
  last: SessionStatus | null,
  answer: StatusAnswer,
  now: number,
  askIds: ReadonlySet<string>,
  readSetAt: number | null = last?.goal?.setAt ?? null,
): SessionStatus | null {
  const o = answer.kind === 'ops' ? applyOps(last, answer.ops, now, askIds, readSetAt) : last
  if (o === null) return null
  const settled = answer.kind === 'ops' ? o : settleGoal(o, now, readSetAt, new Set())
  const isRemovedRead = settled.goalRemoved !== null && settled.goalRemoved.goal.setAt === readSetAt

  return settled.goalRemoved === null || isRemovedRead ? settled : { ...settled, goalRemoved: null }
}
