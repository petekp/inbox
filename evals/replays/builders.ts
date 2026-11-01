import type { Child, Item, Milestone, SessionStatus, Subject, SubjectStatus } from '../../types'
import type { Facts, Piece } from '../status-facts'
import { minutes } from '../status-replay'

export function subject(id: string, status: SubjectStatus, name: string, text: string, changedAt: number): Subject {
  const isClosed = status === 'done' || status === 'dropped'
  const at = minutes(changedAt)

  return {
    id,
    name,
    status,
    text,
    was: null,
    merged: null,
    createdAt: at,
    changedAt: at,
    closedAt: isClosed ? at : null,
    into: null,
  }
}

export function milestone(id: string, status: SubjectStatus, name: string, text: string, changedAt: number): Milestone {
  const at = minutes(changedAt)

  return { id, name, status, text, was: null, changedAt: at, closedAt: status === 'done' ? at : null }
}

/** A goal the person set or accepted at `setAt`, with its milestones written. */
export function goal(text: string, setAt: number): NonNullable<SessionStatus['goal']> {
  return { text, setAt: minutes(setAt), metAt: null, was: null, isAwaitingMilestones: false }
}

export function delegate(id: string, name: string, subjectId: string, startedAt: number): Child {
  return {
    id,
    ref: `herdr:${name}`,
    kind: 'delegate',
    name,
    subjectId,
    startedAt: minutes(startedAt),
    endedAt: null,
    lastActivityAt: minutes(-5),
    delegateState: 'working',
  }
}

export function question(id: string, ask: string, at: number): Item {
  return {
    id,
    kind: 'question',
    label: null,
    ask,
    options: [],
    rec: null,
    helps: [],
    turn: 1,
    at: minutes(at),
    from: 'record',
  }
}

export function overview(o: Pick<SessionStatus, 'head' | 'subjects'> & Partial<SessionStatus>): SessionStatus {
  return {
    children: [],
    askSubjects: {},
    nextId: o.subjects.length + 1,
    nextChildId: (o.children?.length ?? 0) + 1,
    lastLookAt: null,
    look: null,
    goal: null,
    proposedGoal: null,
    declinedGoals: [],
    milestones: [],
    nextMilestoneId: 1,
    serves: {},
    ...o,
  }
}

export const piece = (p: Piece) => p

export const NO_FACTS: Facts = {
  focus: '',
  focusMatch: '.',
  pieces: [],
  asks: [],
  notWork: [],
  children: [],
  changed: [],
}
