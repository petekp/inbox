import { expect, test } from 'claude-code/testing'

import { applyTaskOwnerFacts, observedTaskOwnerFact, taskOwnerKey } from '../hooks/task-facts'
import type { TaskNode } from '../types'

const NOW = 1_000_000
const owner = { machine: 'local', agent: 'worker-1' }
const task = (change: Partial<TaskNode> = {}): TaskNode => ({
  id: 'task-1',
  parentId: null,
  status: 'working',
  weight: 1,
  title: 'Build the feature',
  detail: '',
  notes: [],
  createdAt: NOW,
  updatedAt: NOW,
  history: [],
  links: { owner },
  ...change,
})

test('owner idle for 15 minutes stalls a working task without changing its status', () => {
  const original = [task()]
  const facts = { [taskOwnerKey(owner)]: { state: 'idle' as const, since: NOW - 15 * 60_000 } }
  const result = applyTaskOwnerFacts(original, facts, NOW)

  expect(result.stalledSince).toEqual({ 'task-1': NOW - 15 * 60_000 })
  expect(result.warnings).toEqual([
    { taskId: 'task-1', owner, message: 'Owner idle 15m+' },
    { taskId: 'task-1', owner, message: 'Owner finished, task open' },
  ])
  expect(original[0]?.status).toBe('working')
})

test('unknown owner state adds no marker or warning', () => {
  expect(applyTaskOwnerFacts([task()], {}, NOW)).toMatchObject({ stalledSince: {}, warnings: [] })
})

test('a finished owner warns while its task remains working', () => {
  const facts = { [taskOwnerKey(owner)]: { state: 'done' as const, since: NOW } }
  const result = applyTaskOwnerFacts([task()], facts, NOW)

  expect(result.stalledSince).toEqual({ 'task-1': NOW })
  expect(result.warnings).toEqual([{ taskId: 'task-1', owner, message: 'Owner finished, task open' }])
})

test('a repeated non-working observation retains its start time', () => {
  expect(observedTaskOwnerFact({ state: 'blocked', since: 10 }, 'blocked', 20)).toEqual({ state: 'blocked', since: 10 })
  expect(observedTaskOwnerFact({ state: 'working', since: 10 }, 'idle', 20)).toEqual({ state: 'idle', since: 20 })
})
