import { expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { recorded } from '../hooks/session-presses'
import { emptySession } from '../hooks/session-files'
import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import { goalPage } from '../hooks/status-goal-page'
import { isGoalMet, goalTaskId } from '../hooks/status-goal-gate'
import { applyGoalOp, removeGoal, restoreGoal, setTypedGoal, settleGoal } from '../hooks/status-goal-ops'
import { taskTreeAnswer } from '../hooks/task-tool'
import { TOOL_FIELDS } from '../hooks/tool-schemas'
import type { TaskNode, TaskTree } from '../types'

const task = (id: string, goalId: string, status: TaskNode['status'], weight = 1): TaskNode => ({
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
})

test('goal settlement waits for linked tasks and is met when every linked task is done or dropped', () => {
  const typed = setTypedGoal(EMPTY_SESSION_STATUS, 'Ship the search release', 10)
  const goal = typed.goal!
  const tree: TaskTree = [
    task('done', goalTaskId(goal), 'done'),
    task('open', goalTaskId(goal), 'working'),
    task('dropped', goalTaskId(goal), 'dropped'),
  ]

  expect(settleGoal(typed, [], 20).goal).toMatchObject({ isAwaitingMilestones: true, metAt: null })
  expect(isGoalMet(goal, tree)).toBe(false)
  expect(settleGoal(typed, tree, 20).goal).toMatchObject({ isAwaitingMilestones: false, metAt: null })

  const completed = tree.map(node => ({ ...node, status: node.id === 'open' ? ('done' as const) : node.status }))
  const met = settleGoal(typed, completed, 30)
  expect(isGoalMet(goal, completed)).toBe(true)
  expect(met.goal).toMatchObject({ isAwaitingMilestones: false, metAt: 30 })
})

test('a set goal links new tasks, becomes met, and accepts RETIRE', () => {
  let state = emptySession()
  state = recorded(
    CLAUDE_CODE,
    state,
    'tasks',
    { operation: 'add', task_id: 'before', title: 'Earlier task' },
    5,
    TOOL_FIELDS,
  ).state
  expect(state.taskTree[0]).not.toHaveProperty('goalId')

  const goal = applyGoalOp(EMPTY_SESSION_STATUS, { kind: 'goal', text: 'Ship the search release' }, 10, state.taskTree)
  state = { ...state, ledger: { ...state.ledger, overview: goal } }
  const add = (input: Record<string, unknown>, now: number) => {
    state = recorded(CLAUDE_CODE, state, 'tasks', input, now, TOOL_FIELDS).state
  }
  add({ operation: 'add', task_id: 'root', title: 'Ship search' }, 11)
  add({ operation: 'add', task_id: 'child', parent_id: 'root', title: 'Finish release' }, 12)

  const goalId = goalTaskId(goal.goal!)
  expect(state.taskTree.slice(1).map(node => node.goalId)).toEqual([goalId, goalId])
  const child = taskTreeAnswer(
    state.taskTree,
    { operation: 'add', task_id: 'nested', parent_id: 'root', title: 'Nested' },
    13,
    'goal-other',
  )
  expect(child.taskTree.find(node => node.id === 'nested')?.goalId).toBe(goalId)
  const withoutGoal = taskTreeAnswer(state.taskTree, { operation: 'add', task_id: 'free', title: 'Unlinked' }, 14)
  expect(withoutGoal.taskTree.find(node => node.id === 'free')).not.toHaveProperty('goalId')

  add({ operation: 'complete', task_id: 'child' }, 15)
  add({ operation: 'complete', task_id: 'root' }, 16)
  const met = settleGoal(goal, state.taskTree, 17)
  expect(met.goal).toMatchObject({ metAt: 17, isAwaitingMilestones: false })
  expect(
    applyGoalOp(met, { kind: 'retire', why: 'The outcome no longer fits' }, 18, state.taskTree, met).goal,
  ).toBeNull()
})

test('GOAL can replace a met goal', () => {
  const saved = setTypedGoal(EMPTY_SESSION_STATUS, 'Ship search', 10)
  const tree = [task('search', goalTaskId(saved.goal!), 'done')]
  const met = settleGoal(saved, tree, 20)

  expect(applyGoalOp(met, { kind: 'goal', text: 'Prepare the release notes' }, 30, tree, met).goal?.text).toBe(
    'Prepare the release notes',
  )
})

test('the goal page counts linked work and shows the Now line without milestone rows', () => {
  const saved = {
    ...setTypedGoal(EMPTY_SESSION_STATUS, 'Ship the search release', 10),
    head: { title: 'Search', description: 'Finish search' },
  }
  const goalId = goalTaskId(saved.goal!)
  const tree = [
    task('done', goalId, 'done'),
    task('open', goalId, 'waits-on-other'),
    task('dropped', goalId, 'dropped'),
  ]
  const page = goalPage(saved, [], tree).goal!

  expect(page).toMatchObject({
    label: 'Goal',
    text: 'Ship the search release',
    count: '1 of 2 tasks done',
    now: 'Now: Finish search',
    milestones: [],
  })
  expect(goalPage(saved, [], []).goal?.awaiting).toBe('No tasks linked yet')
})

test('removing and restoring a goal preserves the saved goal and its legacy undo snapshot', () => {
  const saved = setTypedGoal(EMPTY_SESSION_STATUS, 'Ship the search release', 10)
  const removed = removeGoal(saved)

  expect(removed.goal).toBeNull()
  expect(removed.goalRemoved?.goal).toEqual(saved.goal)
  expect(restoreGoal(removed)).toMatchObject({ goal: saved.goal, goalRemoved: null })
})
