import type { SessionStatus, StatusHead, Subject } from '../types'
import type { Op, StatusAnswer } from './status'
import {
  clipWords,
  DESCRIPTION_KEPT,
  EMPTY_SESSION_STATUS,
  isOpen,
  NAME_KEPT,
  nameKey,
  TEXT_KEPT,
  words,
} from './status-limits'
import type { OpenStatus } from './status-limits'
import { applyGoalOp, findMilestone, hasSameWords, moveMilestone, settleGoal } from './status-goal-ops'

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
 * Subject changes first, then reversals and the head, then links, so a WAS or LINK can name a subject the same answer
 * added, and the head reads the subjects as the answer left them.
 */
const OP_ORDER: Record<Op['kind'], number> = {
  none: 0,
  head: 1,
  new: 0,
  set: 0,
  done: 0,
  drop: 0,
  was: 1,
  link: 2,
  goal: 0,
  milestone: 0,
  serves: 2,
}

/**
 * The list after `ops`, applied at `now`. `askIds` are the open asks: a LINK may name one, and the links of the others
 * go. A line that names an id or a name the list does not hold, or an ask that is not open, changes nothing.
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
  /** A was line and a merged line stay until the person has seen them. The page shows them only on rows that changed since the last look. */
  const forgetSeenWas = (s: Subject) => {
    const isSeen = o.lastLookAt !== null && s.changedAt <= o.lastLookAt
    if (isSeen) {
      s.was = null
      s.merged = null
    }
  }
  const set = (s: Subject, status: OpenStatus, text: string) => {
    const isReworded = s.status === status && hasSameWords(s.text, text)
    if (isReworded) return
    s.status = status
    s.text = clipWords(text, TEXT_KEPT)
    forgetSeenWas(s)
    s.changedAt = now
  }
  const ordered = ops.map((op, n) => ({ op, n })).sort((x, y) => OP_ORDER[x.op.kind] - OP_ORDER[y.op.kind] || x.n - y.n)
  for (const { op } of ordered) {
    if (op.kind === 'none') continue
    if (op.kind === 'goal' || op.kind === 'milestone' || op.kind === 'serves') o = applyGoalOp(o, op, now, find)
    else if (op.kind === 'head') o.head = headAfter(o.head, op, answerWork(last?.subjects ?? [], o, now))
    else if (op.kind === 'link') {
      const child = o.children.find(c => c.id === op.ref)
      const subject = find(op.subject)
      const milestone = subject ? null : findMilestone(o, op.subject)
      if (child && subject) child.subjectId = subject.id
      else if (subject && askIds.has(op.ref)) o.askSubjects[op.ref] = subject.id
      else if (milestone && askIds.has(op.ref)) o.askSubjects[op.ref] = milestone.id
    } else if (op.kind === 'new') {
      const known = find(op.name)
      if (known && isOpen(known)) {
        set(known, op.status, op.text)
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
      if (!s) continue
      if (op.kind === 'set') set(s, op.status, op.text)
      else if (op.kind === 'done') {
        s.status = 'done'
        if (op.text) s.text = clipWords(op.text, TEXT_KEPT)
        forgetSeenWas(s)
        s.closedAt = now
        s.changedAt = now
      } else if (op.kind === 'drop') {
        const target = op.into ? find(op.into) : null
        s.status = 'dropped'
        s.text = clipWords(op.why, TEXT_KEPT)
        s.closedAt = now
        s.into = target && target.id !== s.id ? target.id : null
        s.changedAt = now
        if (target && s.into) {
          forgetSeenWas(target)
          target.merged = target.merged ? `${target.merged}, ${s.name}` : s.name
          target.changedAt = now
          for (const [ask, id] of Object.entries(o.askSubjects)) if (id === s.id) o.askSubjects[ask] = target.id
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

  return settleGoal(o, now, readSetAt)
}

/** The Status after an answer, applied at `now`. `askIds` are the open asks. */
export function applyStatus(
  last: SessionStatus | null,
  answer: StatusAnswer,
  now: number,
  askIds: ReadonlySet<string>,
  readSetAt: number | null = last?.goal?.setAt ?? null,
): SessionStatus | null {
  if (answer.kind === 'ops') return applyOps(last, answer.ops, now, askIds, readSetAt)

  return last === null ? null : settleGoal(last, now, readSetAt)
}
