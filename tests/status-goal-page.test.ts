import { expect, test } from 'claude-code/testing'

import { EMPTY } from '../hooks/ledger'
import { emptySession } from '../hooks/session-files'
import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import { statusPage } from '../hooks/status-page'
import { goalTaskId } from '../hooks/status-goal-gate'
import { setTypedGoal, settleGoal } from '../hooks/status-goal-ops'
import type { TaskNode, TaskTree } from '../types'

const task = (id: string, status: TaskNode['status'], goalId: string, weight = 1): TaskNode => ({
  id,
  parentId: null,
  status,
  weight,
  title: id,
  detail: '',
  notes: [],
  createdAt: 1,
  updatedAt: 1,
  history: [],
  goalId,
  streamId: 'search-release',
})

test('Status shows the goal, its linked task count, Now, and task rows from the tree', () => {
  const goalState = setTypedGoal(EMPTY_SESSION_STATUS, 'Ship search', 10)
  const goalId = goalTaskId(goalState.goal!)
  const tree: TaskTree = [
    task('Done part', 'done', goalId),
    task('Waiting part', 'waits-on-other', goalId),
    task('Queued part', 'queued', goalId),
    task('Dropped part', 'dropped', goalId, 10),
  ]
  const saved = settleGoal({ ...goalState, head: { title: 'Search', description: 'Finish search' } }, tree, 20)
  const session = { ...emptySession(), taskTree: tree, ledger: { ...EMPTY, overview: saved } }
  const page = statusPage(session, 30)

  expect(page.goal).toMatchObject({
    label: 'Goal',
    text: 'Ship search',
    count: '1 of 3 tasks done',
    now: 'Now: Finish search',
    milestones: [],
  })
  expect(page.rows.map(row => (row.kind === 'subject' ? row.name : row.kind))).toContain(
    'Done part, Waiting part, Queued part, Dropped part',
  )
  expect(page.rows.find(row => row.kind === 'subject')).toMatchObject({
    text: '8% complete',
  })
})

test('a typed goal with no linked tasks says it is awaiting task links', () => {
  const saved = setTypedGoal(EMPTY_SESSION_STATUS, 'Ship search', 10)
  const page = statusPage({ ledger: { overview: saved, items: [] }, presence: emptySession().presence }, 30)

  expect(page.goal).toMatchObject({ label: 'Goal', awaiting: 'No tasks linked yet', count: null, milestones: [] })
})
