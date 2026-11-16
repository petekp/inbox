import { expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { recorded } from '../hooks/session-presses'
import { emptySession } from '../hooks/session-files'
import { TASK_NOTE_LENGTH, TASK_TITLE_LENGTH } from '../hooks/task-tree'
import { TOOL_FIELDS } from '../hooks/tool-schemas'
import type { Session } from '../types'

function caller() {
  let state: Session = emptySession()
  const call = (input: Record<string, unknown>) => {
    const answer = recorded(CLAUDE_CODE, state, 'tasks', input, 1000 + state.taskTree.length, TOOL_FIELDS)
    state = answer.state
    return answer.result
  }

  return { call, state: () => state }
}

test('tasks adds, updates, moves, completes and notes, returning the normalized node and agent-sourced history', () => {
  const { call, state } = caller()
  const added = call({ operation: 'add', task_id: 'p', title: ' Plan ', detail: 'Start here', weight: 2 })
  expect(JSON.parse(added.slice('Task saved: '.length))).toMatchObject({
    id: 'p',
    parentId: null,
    status: 'queued',
    weight: 2,
    title: 'Plan',
    detail: 'Start here',
    history: [{ kind: 'created', source: 'agent' }],
  })
  call({ operation: 'add', task_id: 'c', parent_id: 'p', title: 'Implement' })
  call({
    operation: 'update',
    task_id: 'c',
    title: 'Implement the tool',
    detail: 'Use the shared API',
    status: 'working',
    weight: 3,
  })
  call({ operation: 'move', task_id: 'c', parent_id: null })
  call({ operation: 'complete', task_id: 'c' })
  call({ operation: 'note', task_id: 'c', note: 'Verified the host wiring' })

  expect(state().taskTree.find(task => task.id === 'c')).toMatchObject({
    parentId: null,
    status: 'done',
    title: 'Implement the tool',
    detail: 'Use the shared API',
    weight: 3,
    notes: ['Verified the host wiring'],
    history: [
      { kind: 'created', source: 'agent' },
      { kind: 'updated', source: 'agent' },
      { kind: 'moved', source: 'agent' },
      { kind: 'completed', source: 'agent' },
      { kind: 'note', source: 'agent', detail: 'Verified the host wiring' },
    ],
  })
})

test('tasks refuses invalid ids, parents, operations, statuses, weights, empty changes and oversized values with corrections', () => {
  const { call, state } = caller()
  const refused = (input: Record<string, unknown>, advice: string) => {
    const before = state().taskTree
    const answer = call(input)
    expect(answer).toContain('Not saved:')
    expect(answer).toContain(advice)
    expect(state().taskTree).toEqual(before)
  }

  expect(call({ operation: 'add', task_id: 'same', title: 'Valid task' })).toContain('Task saved:')
  refused({ operation: 'add', task_id: 'same', title: 'Duplicate' }, 'choose a new id')
  refused({ operation: 'add', task_id: 'child', parent_id: 'missing', title: 'Child' }, 'existing task id or null')
  refused({ operation: 'move', task_id: 'same', parent_id: 'missing' }, 'existing task id or null')
  refused({ operation: 'update', task_id: 'missing', title: 'Unknown' }, 'existing id or add it first')
  refused({ operation: 'move', task_id: 'missing', parent_id: null }, 'existing id or add it first')
  refused({ operation: 'complete', task_id: 'missing' }, 'existing id or add it first')
  refused({ operation: 'note', task_id: 'missing', note: 'A note' }, 'existing id or add it first')
  refused({ operation: 'move', task_id: 'same', parent_id: 'same' }, 'create a cycle')
  refused(
    { operation: 'update', task_id: 'same', status: 'planned' },
    'status must be working, queued, waits-on-other, done, dropped',
  )
  refused({ operation: 'update', task_id: 'same', weight: 0 }, 'weight must be a finite number from 0.1 to 100')
  refused({ operation: 'update', task_id: 'same', weight: 101 }, 'weight must be a finite number from 0.1 to 100')
  refused({ operation: 'unknown', task_id: 'same' }, 'operation must be add, update, move, complete or note')
  refused({ operation: 'add', task_id: '', title: 'No id' }, 'task_id must be 1–100 characters')
  refused({ operation: 'add', task_id: 'x'.repeat(101), title: 'Long id' }, 'task_id must be 1–100 characters')
  refused({ operation: 'add', task_id: 'empty', title: '  ' }, 'add needs a non-empty title')
  refused(
    { operation: 'add', task_id: 'long', title: 'x'.repeat(TASK_TITLE_LENGTH + 1) },
    'title must be at most 100 characters',
  )
  refused(
    { operation: 'update', task_id: 'same', title: 'x'.repeat(TASK_TITLE_LENGTH + 1) },
    'title must be at most 100 characters',
  )
  refused(
    { operation: 'add', task_id: 'detail', title: 'Detail', detail: 'x'.repeat(2001) },
    'detail must be at most 2000 characters',
  )
  refused({ operation: 'update', task_id: 'same' }, 'update needs title, detail, status or weight to change')
  refused({ operation: 'move', task_id: 'same' }, 'move needs an existing parent_id')
  refused({ operation: 'note', task_id: 'same', note: '  ' }, 'note needs non-empty text')
  refused(
    { operation: 'note', task_id: 'same', note: 'x'.repeat(TASK_NOTE_LENGTH + 1) },
    'note must be at most 2000 characters',
  )
})
