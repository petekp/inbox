import { expect, test } from 'claude-code/testing'

import {
  claudeTasksAfter,
  codexPlanOf,
  ompTodoFromBranch,
  ompTodoOf,
  tasksText,
  upgradeHostTasks,
} from '../hooks/host-tasks'
import { statusPrompt } from '../hooks/model-text'
import type { HostTask } from '../types'

test('Claude Code tasks are created, then updated by id, and a TodoWrite call replaces the list', () => {
  let tasks: HostTask[] = []
  tasks = claudeTasksAfter(tasks, 'TaskCreate', { subject: 'Read the parser' }, 'Task #1 created')
  tasks = claudeTasksAfter(tasks, 'TaskCreate', { subject: 'Fix the parser' }, null)
  tasks = claudeTasksAfter(tasks, 'TaskUpdate', { taskId: '1', status: 'completed' }, null)
  tasks = claudeTasksAfter(tasks, 'TaskUpdate', { taskId: '2', status: 'in_progress' }, null)

  expect(tasks).toEqual([
    { id: '1', text: 'Read the parser', status: 'done' },
    { id: '2', text: 'Fix the parser', status: 'in-progress' },
  ])
  expect(claudeTasksAfter(tasks, 'TaskUpdate', { taskId: '9', status: 'completed' }, null)).toEqual(tasks)
  expect(claudeTasksAfter(tasks, 'TaskList', {}, null)).toBe(tasks)
  expect(
    claudeTasksAfter(
      tasks,
      'TodoWrite',
      { todos: [{ content: 'Only one', status: 'pending' }, { content: '' }] },
      null,
    ),
  ).toEqual([{ id: '1', text: 'Only one', status: 'pending' }])
})

test('a deleted task leaves the list, and a long list cuts finished tasks before the open ones', () => {
  const tasks: HostTask[] = [
    { id: '1', text: 'One', status: 'done' },
    { id: '2', text: 'Two', status: 'pending' },
  ]
  expect(claudeTasksAfter(tasks, 'TaskUpdate', { taskId: '1', status: 'deleted' }, null)).toEqual([tasks[1]])

  const long: HostTask[] = [
    { id: '0', text: 'Open early', status: 'in-progress' },
    ...Array.from({ length: 14 }, (_, n) => ({ id: String(n + 1), text: `Done ${n + 1}`, status: 'done' as const })),
  ]
  const lines = tasksText(long).split('\n')
  expect(lines).toHaveLength(12)
  expect(lines[0]).toBe('TASK: in-progress | Open early')
  expect(lines.at(-1)).toBe('TASK: done | Done 14')
})

test('the omp list is the newest todo result or /todo edit on the branch', () => {
  const result = (status: string, isError = false) => ({
    type: 'message',
    message: {
      role: 'toolResult',
      toolName: 'todo',
      isError,
      details: { phases: [{ tasks: [{ content: 'A', status }] }] },
    },
  })
  const edit = {
    type: 'custom',
    customType: 'user_todo_edit',
    data: { phases: [{ tasks: [{ content: 'B', status: 'pending' }] }] },
  }
  expect(ompTodoFromBranch([])).toEqual([])
  expect(ompTodoFromBranch([result('pending'), result('completed')])).toEqual([{ id: '1', text: 'A', status: 'done' }])
  expect(ompTodoFromBranch([result('pending'), edit])).toEqual([{ id: '1', text: 'B', status: 'pending' }])
  expect(ompTodoFromBranch([result('pending'), result('completed', true)])).toEqual([
    { id: '1', text: 'A', status: 'pending' },
  ])
})

test('a Codex plan and an omp todo result each give the whole list, and anything else gives none', () => {
  expect(
    codexPlanOf('{"plan":[{"step":"Read","status":"completed"},{"step":"Write","status":"in_progress"}]}'),
  ).toEqual([
    { id: '1', text: 'Read', status: 'done' },
    { id: '2', text: 'Write', status: 'in-progress' },
  ])
  expect(codexPlanOf('not json')).toBeNull()
  expect(codexPlanOf({ plan: 'no' })).toBeNull()
  expect(
    ompTodoOf({
      phases: [
        { name: 'a', tasks: [{ content: 'One', status: 'abandoned' }] },
        {
          name: 'b',
          tasks: [
            { content: 'Two', status: 'blocked' },
            { content: 'Three', status: 'pending' },
          ],
        },
      ],
    }),
  ).toEqual([
    { id: '1', text: 'One', status: 'dropped' },
    { id: '2', text: 'Two', status: 'blocked' },
    { id: '3', text: 'Three', status: 'pending' },
  ])
  expect(ompTodoOf({})).toBeNull()
})

test('a saved list keeps only well-formed tasks, and the Status call reads the list only when there is one', () => {
  const saved = upgradeHostTasks([
    { id: '1', text: 'Fine', status: 'done' },
    { id: 2, text: 'Bad id', status: 'done' },
    { id: '3', text: 'Bad status', status: 'later' },
  ])
  expect(saved).toEqual([{ id: '1', text: 'Fine', status: 'done' }])
  expect(upgradeHostTasks(undefined)).toEqual([])
  expect(tasksText(saved)).toBe('TASK: done | Fine')

  const ex = { turn: 1, person: 'go', trigger: null, activity: [], reply: 'ok', press: null, screen: '', tasks: [] }
  expect(statusPrompt({ last: null, asks: [], tasks: saved, now: 0 }, ex)).toContain(
    '<tasks>\nTASK: done | Fine\n</tasks>',
  )
  expect(statusPrompt({ last: null, asks: [], tasks: [], now: 0 }, ex)).not.toContain('<tasks>')
})
