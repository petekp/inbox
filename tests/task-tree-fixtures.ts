import type { Milestone, SessionStatus, Subject } from '../types'
import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import { EMPTY } from '../hooks/ledger'
import type { TaskTree } from '../types'

export const taskSubject = (id: string, changes: Partial<Subject> = {}): Subject => ({
  id,
  name: `Task ${id}`,
  status: 'working',
  text: `Details for ${id}`,
  was: null,
  merged: null,
  createdAt: 10,
  changedAt: 20,
  closedAt: null,
  into: null,
  ...changes,
})

export const taskMilestone = (id: string, changes: Partial<Milestone> = {}): Milestone => ({
  id,
  name: `Milestone ${id}`,
  status: 'working',
  text: `Details for ${id}`,
  was: null,
  changedAt: 20,
  closedAt: null,
  ...changes,
})

export function taskStatus(changes: Partial<SessionStatus> = {}): SessionStatus {
  return {
    ...EMPTY_SESSION_STATUS,
    head: { title: 'Current focus', description: 'Current activity' },
    ...changes,
  }
}

export function savedTaskSession(taskTree?: TaskTree) {
  return {
    ledger: { ...EMPTY, overview: taskStatus({ subjects: [taskSubject('s1')] }) },
    ...(taskTree === undefined ? {} : { taskTree }),
  }
}
