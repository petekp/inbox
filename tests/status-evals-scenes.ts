import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import { emptySession } from '../hooks/session-files'
import { taskTreeFromStatus } from '../hooks/task-tree'
import type { Item, Session, SessionStatus, Subject, SubjectStatus } from '../types'
import { minutes } from '../evals/status-replay'

export function subject(id: string, status: SubjectStatus, name: string, text: string, changedAt: number): Subject {
  const isClosed = status === 'done' || status === 'dropped'
  return {
    id,
    name,
    status,
    text,
    was: null,
    merged: null,
    createdAt: minutes(0),
    changedAt: minutes(changedAt),
    closedAt: isClosed ? minutes(changedAt) : null,
    into: null,
  }
}

export function statusOf(subjects: Subject[], more: Partial<SessionStatus> = {}): SessionStatus {
  const head = { title: 'Offline sync', description: 'Adding offline sync to the notes app' }
  return { ...EMPTY_SESSION_STATUS, head, subjects, nextId: subjects.length + 1, ...more }
}

export function sessionOf(o: SessionStatus, items: Item[], at: number): Session {
  const base = emptySession()
  return {
    ...base,
    ledger: { ...base.ledger, overview: o, items },
    taskTree: taskTreeFromStatus(o),
    presence: { ...base.presence, lastReplyAt: minutes(at) },
  }
}
