import { expect, test } from 'claude-code/testing'
import { EMPTY } from '../hooks/ledger'
import {
  TASK_HISTORY_DETAIL_LENGTH,
  TASK_HISTORY_LIMIT,
  TASK_NOTE_LENGTH,
  TASK_NOTES_LIMIT,
  TASK_DEPTH_LIMIT,
  TASK_NODE_LIMIT,
  TASK_TITLE_LENGTH,
  addTaskNote,
  appendTaskHistory,
  completeTask,
  createTask,
  moveTask,
  taskTreeFromStatus,
  updateTask,
  weightedTaskProgress,
} from '../hooks/task-tree'
import { upgradeSession } from '../hooks/session-files'
import type { TaskNode, TaskTree } from '../types'
import { taskMilestone, taskStatus, taskSubject } from './task-tree-fixtures'

const node = (id: string, changes: Partial<TaskNode> = {}): TaskNode => ({
  id,
  parentId: null,
  status: 'working',
  weight: 1,
  title: id,
  detail: '',
  notes: [],
  createdAt: 1,
  updatedAt: 1,
  history: [],
  ...changes,
})

const tree: TaskTree = [node('parent'), node('child', { parentId: 'parent' }), node('other')]
const resultTree = (result: ReturnType<typeof createTask>) => {
  if (!result.ok) throw new Error(result.reason)
  return result.tree
}

test('create, update, move, complete, note and history operations are pure and preserve explicit facts', () => {
  const initial = [node('parent')]
  const created = createTask(initial, node('child', { parentId: 'parent' }), 'agent')
  expect(initial).toHaveLength(1)
  let changed = resultTree(created)
  changed = resultTree(updateTask(changed, 'child', { title: 'Updated title' }, 2, 'agent'))
  changed = resultTree(moveTask(changed, 'child', null, 3, 'agent'))
  changed = resultTree(addTaskNote(changed, 'child', 'A note', 4, 'agent'))
  changed = resultTree(appendTaskHistory(changed, 'child', { at: 5, source: 'review', kind: 'imported' }))
  changed = resultTree(completeTask(changed, 'child', 6, 'agent'))

  expect(changed[1]).toMatchObject({
    parentId: null,
    status: 'done',
    title: 'Updated title',
    updatedAt: 6,
    notes: ['A note'],
  })
  expect(changed[1]!.history.map(event => [event.kind, event.source])).toEqual([
    ['created', 'agent'],
    ['updated', 'agent'],
    ['moved', 'agent'],
    ['note', 'agent'],
    ['imported', 'review'],
    ['completed', 'agent'],
  ])
})

test('tree operations refuse duplicate ids, unknown ids and parents, cycles, invalid weights and unbounded notes', () => {
  expect(createTask(tree, node('parent'), 'agent')).toEqual({ ok: false, reason: 'duplicate-id' })
  expect(createTask(tree, node('new', { parentId: 'missing' }), 'agent')).toEqual({
    ok: false,
    reason: 'unknown-parent',
  })
  expect(createTask(tree, node('new', { weight: 0 }), 'agent')).toEqual({ ok: false, reason: 'invalid-weight' })
  expect(updateTask(tree, 'other', { weight: 0 }, 2, 'agent')).toEqual({ ok: false, reason: 'invalid-weight' })
  expect(updateTask(tree, 'missing', { title: 'x' }, 2, 'agent')).toEqual({ ok: false, reason: 'unknown-task' })
  expect(moveTask(tree, 'missing', null, 2, 'agent')).toEqual({ ok: false, reason: 'unknown-task' })
  expect(moveTask(tree, 'parent', 'missing', 2, 'agent')).toEqual({ ok: false, reason: 'unknown-parent' })
  expect(moveTask(tree, 'parent', 'child', 2, 'agent')).toEqual({ ok: false, reason: 'cycle' })
  expect(completeTask(tree, 'missing', 2, 'agent')).toEqual({ ok: false, reason: 'unknown-task' })
  expect(addTaskNote(tree, 'missing', 'x', 2, 'agent')).toEqual({ ok: false, reason: 'unknown-task' })
  expect(appendTaskHistory(tree, 'missing', { at: 2, source: 'agent', kind: 'updated' })).toEqual({
    ok: false,
    reason: 'unknown-task',
  })
  expect(addTaskNote(tree, 'other', 'x'.repeat(TASK_NOTE_LENGTH + 1), 2, 'agent')).toEqual({
    ok: false,
    reason: 'limit',
  })
  expect(
    appendTaskHistory(tree, 'other', {
      at: 2,
      source: 'agent',
      kind: 'updated',
      detail: 'x'.repeat(TASK_HISTORY_DETAIL_LENGTH + 1),
    }),
  ).toEqual({
    ok: false,
    reason: 'limit',
  })
  expect(
    createTask(tree, node('notes', { notes: Array.from({ length: TASK_NOTES_LIMIT + 1 }, () => 'note') }), 'agent'),
  ).toEqual({
    ok: false,
    reason: 'limit',
  })
  expect(createTask(tree, node('long-title', { title: 'x'.repeat(TASK_TITLE_LENGTH + 1) }), 'agent')).toEqual({
    ok: false,
    reason: 'limit',
  })
  expect(updateTask(tree, 'parent', { title: 'x'.repeat(TASK_TITLE_LENGTH + 1) }, 2, 'agent')).toEqual({
    ok: false,
    reason: 'limit',
  })
  expect(
    createTask(
      Array.from({ length: TASK_NODE_LIMIT }, (_, i) => node(`n${i}`)),
      node('overflow'),
      'agent',
    ),
  ).toEqual({
    ok: false,
    reason: 'limit',
  })
  const tooDeep = Array.from({ length: TASK_DEPTH_LIMIT }, (_, i) =>
    node(`d${i}`, { parentId: i === 0 ? null : `d${i - 1}` }),
  )
  expect(createTask(tooDeep, node('too-deep', { parentId: `d${TASK_DEPTH_LIMIT - 1}` }), 'agent')).toEqual({
    ok: false,
    reason: 'limit',
  })
  expect(moveTask(tooDeep, 'd0', `d${TASK_DEPTH_LIMIT - 1}`, 2, 'agent')).toEqual({ ok: false, reason: 'cycle' })
  const deepTarget = [...tooDeep, node('target', { parentId: 'd7' }), node('other')]
  expect(moveTask(deepTarget, 'other', 'target', 2, 'agent')).toEqual({ ok: false, reason: 'limit' })
})

test('tree operations reject malformed task links when applied directly', () => {
  expect(createTask(tree, node('bad-pr', { links: { pr: 'http://github.com/acme/app/pull/12' } }), 'agent')).toEqual({
    ok: false,
    reason: 'invalid-pr',
  })
  expect(createTask(tree, node('bad-owner', { links: { owner: { agent: '', machine: 'local' } } }), 'agent')).toEqual({
    ok: false,
    reason: 'invalid-owner',
  })
  expect(updateTask(tree, 'parent', { links: { issue: 'https://github.com/acme/app/pull/12' } }, 2, 'agent')).toEqual({
    ok: false,
    reason: 'invalid-issue',
  })
})

test('notes refuse their count limit and history keeps only the newest bounded events', () => {
  const full = node('full', { notes: Array.from({ length: TASK_NOTES_LIMIT }, () => 'note') })
  expect(addTaskNote([full], 'full', 'next', 2, 'agent')).toEqual({ ok: false, reason: 'limit' })
  const long = Array.from({ length: TASK_HISTORY_LIMIT }, (_, i) => ({
    at: i,
    source: 'agent',
    kind: 'updated' as const,
  }))
  const result = appendTaskHistory([node('history', { history: long })], 'history', {
    at: TASK_HISTORY_LIMIT,
    source: 'agent',
    kind: 'updated',
  })
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.tree[0]!.history).toHaveLength(TASK_HISTORY_LIMIT)
    expect(result.tree[0]!.history[0]!.at).toBe(1)
    expect(result.tree[0]!.history.at(-1)!.at).toBe(TASK_HISTORY_LIMIT)
  }
})

test('weighted progress derives recursively from task status and weight', () => {
  expect(
    weightedTaskProgress([
      node('group', { weight: 2 }),
      node('finished', { parentId: 'group', status: 'done', weight: 1 }),
      node('open', { parentId: 'group', weight: 3 }),
      node('root-done', { status: 'done', weight: 1 }),
    ]),
  ).toBe(0.5)
  expect(weightedTaskProgress([])).toBe(0)
})

test('empty Status and pre-v0.4 saves migrate to an empty or upgraded task tree', () => {
  expect(taskTreeFromStatus(null)).toEqual([])
  expect(upgradeSession({}).taskTree).toEqual([])
  const legacy = upgradeSession({
    ledger: {
      ...EMPTY,
      overview: {
        headline: 'Older focus',
        lastLookAt: 30,
        workstreams: [{ status: 'working', text: 'Build parser', detail: 'Read input' }],
      },
    } as never,
  })
  expect(legacy.taskTree).toMatchObject([{ id: 's1', title: 'Build parser', detail: 'Read input', status: 'working' }])
})

test('subjects only migrate in order with their status, detail, prior notes and history', () => {
  const subjects = [
    taskSubject('s2', { name: 'Second', status: 'queued', was: 'Earlier wording', merged: 'Old task' }),
    taskSubject('s1', { name: 'First', status: 'waits-on-other' }),
  ]
  const tree = taskTreeFromStatus(taskStatus({ subjects }))
  expect(tree.map(task => task.id)).toEqual(['s2', 's1'])
  expect(tree[0]).toMatchObject({ status: 'queued', detail: 'Details for s2', notes: ['Earlier wording', 'Old task'] })
  expect(tree[0]!.history).toMatchObject([
    { at: 10, source: 'status', kind: 'created' },
    { at: 20, kind: 'imported' },
  ])
})

test('migration bounds prior-plan notes without putting long text into bounded history', () => {
  const tree = taskTreeFromStatus(
    taskStatus({
      subjects: [taskSubject('s1', { was: 'x'.repeat(TASK_NOTE_LENGTH + 1) })],
    }),
  )
  expect(tree[0]!.notes).toHaveLength(1)
  expect(tree[0]!.notes[0]).toHaveLength(TASK_NOTE_LENGTH)
  expect(tree[0]!.history.every(event => (event.detail?.length ?? 0) <= TASK_HISTORY_DETAIL_LENGTH)).toBe(true)
})

test('milestones and linked subjects retain goal, parent links and source order without changing Status', () => {
  const status = taskStatus({
    goal: { text: 'Ship the parser', setAt: 7, metAt: null, was: null, isAwaitingMilestones: false, source: 'typed' },
    milestones: [taskMilestone('m2', { name: 'Second milestone' }), taskMilestone('m1', { name: 'First milestone' })],
    subjects: [taskSubject('s2'), taskSubject('s1', { status: 'done', closedAt: 30 })],
    askSubjects: { i1: ['s1', 'm1'] },
    serves: { s1: 'm1', s2: 'none' },
  })
  const saved = { ledger: { ...EMPTY, overview: status } }
  const upgraded = upgradeSession(saved)

  expect(upgraded.ledger.overview?.head).toEqual(status.head)
  expect(upgraded.ledger.overview?.goal).toEqual(status.goal)
  expect(upgraded.ledger.overview?.askSubjects).toEqual(status.askSubjects)
  expect(upgraded.taskTree.map(task => task.id)).toEqual(['m2', 'm1', 's2', 's1'])
  expect(upgraded.taskTree.find(task => task.id === 'm1')).toMatchObject({ parentId: null, goalId: 'goal-7' })
  expect(upgraded.taskTree.find(task => task.id === 's1')).toMatchObject({
    parentId: 'm1',
    goalId: 'goal-7',
    status: 'done',
  })
  expect(upgraded.taskTree.find(task => task.id === 's2')).toMatchObject({ parentId: null })
})

test('milestones from the prior goal do not link to a goal awaiting its milestones', () => {
  const saved = {
    ledger: {
      ...EMPTY,
      overview: taskStatus({
        goal: {
          text: 'Ship the replacement',
          setAt: 31,
          metAt: null,
          was: 'Ship the parser',
          isAwaitingMilestones: true,
          source: 'typed',
        },
        milestones: [taskMilestone('m1')],
        subjects: [taskSubject('s1')],
      }),
    },
  }
  const upgraded = upgradeSession(saved)

  expect(upgraded.taskTree.map(task => task.goalId)).toEqual([undefined, undefined])
  expect(upgradeSession(upgraded)).toEqual(upgraded)
})

test('a merged subject keeps its explicit destination link without treating it as a parent', () => {
  const tree = taskTreeFromStatus(
    taskStatus({
      subjects: [taskSubject('s1'), taskSubject('s2', { status: 'dropped', into: 's1' })],
    }),
  )
  expect(tree[1]).toMatchObject({ id: 's2', parentId: null, mergedIntoId: 's1', status: 'dropped' })
})

test('a merged subject keeps both its milestone parent and merge destination', () => {
  const tree = taskTreeFromStatus(
    taskStatus({
      milestones: [taskMilestone('m1')],
      subjects: [taskSubject('s1'), taskSubject('s2', { status: 'dropped', into: 's1' })],
      serves: { s2: 'm1' },
    }),
  )
  expect(tree.find(task => task.id === 's2')).toMatchObject({ parentId: 'm1', mergedIntoId: 's1' })
})

test('done and open milestones and subjects keep their statuses and completion times', () => {
  const tree = taskTreeFromStatus(
    taskStatus({
      milestones: [taskMilestone('m1', { status: 'done', changedAt: 21, closedAt: 25 })],
      subjects: [taskSubject('s1', { status: 'done', changedAt: 22, closedAt: 26 }), taskSubject('s2')],
    }),
  )
  expect(tree.map(task => [task.id, task.status, task.updatedAt])).toEqual([
    ['m1', 'done', 25],
    ['s1', 'done', 26],
    ['s2', 'working', 20],
  ])
  expect(tree[0]!.history.at(-1)).toMatchObject({ at: 25, source: 'status', kind: 'completed' })
})

test('an already-migrated save is unchanged on the next upgrade', () => {
  const first = upgradeSession({ ledger: { ...EMPTY, overview: taskStatus({ subjects: [taskSubject('s1')] }) } })
  expect(upgradeSession(first)).toEqual(first)
})

test('an explicitly migrated empty tree does not re-import retained Status rows', () => {
  const saved = {
    taskTree: [],
    ledger: { ...EMPTY, overview: taskStatus({ subjects: [taskSubject('s1')] }) },
  }
  expect(upgradeSession(saved).taskTree).toEqual([])
  expect(upgradeSession(upgradeSession(saved))).toEqual(upgradeSession(saved))
})
