import { expect, test } from 'claude-code/testing'

import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import { upgradeStatus } from '../hooks/status-upgrade'

test('a Status saved before subjects keeps its open work, dated at the last look, and its headline as the head', () => {
  const old = {
    isCoordinator: true,
    headline: 'Releasing 0.2.11',
    queue: [
      { status: 'working', text: 'Release notes', detail: 'drafted' },
      { status: 'done', text: 'Fix #81', detail: null },
    ],
    workstreams: [{ status: 'waits-on-other', text: 'VM pass', detail: null }],
    open: [{ status: 'problem', text: 'Flaky row test', detail: null }],
    lastLookAt: 5000,
  }

  expect(upgradeStatus(old)).toEqual({
    ...EMPTY_SESSION_STATUS,
    head: { title: 'Releasing 0.2.11', description: '' },
    subjects: [
      {
        id: 's1',
        name: 'VM pass',
        status: 'waits-on-other',
        text: '',
        was: null,
        merged: null,
        createdAt: 5000,
        changedAt: 5000,
        closedAt: null,
        into: null,
      },
      {
        id: 's2',
        name: 'Release notes',
        status: 'working',
        text: 'drafted',
        was: null,
        merged: null,
        createdAt: 5000,
        changedAt: 5000,
        closedAt: null,
        into: null,
      },
      {
        id: 's3',
        name: 'Flaky row test',
        status: 'queued',
        text: '',
        was: null,
        merged: null,
        createdAt: 5000,
        changedAt: 5000,
        closedAt: null,
        into: null,
      },
    ],
    nextId: 4,
    lastLookAt: 5000,
  })
  expect(upgradeStatus({ ...old, lastLookAt: null })?.subjects).toEqual([])
  expect(upgradeStatus({ headline: 'x', lastLookAt: null })?.head?.title).toBe('x')
})

test('a saved goal becomes the head with no description, and a saved head keeps both lines', () => {
  const head = { title: 'Offline sync', description: 'Adding offline sync to the notes app' }

  expect(upgradeStatus({ role: 'coordinator', goal: 'Ship notes 2.4', subjects: [] })?.head).toEqual({
    title: 'Ship notes 2.4',
    description: '',
  })
  expect(upgradeStatus({ goal: '', subjects: [] })?.head).toBeNull()
  expect(upgradeStatus({ head, subjects: [] })?.head).toEqual(head)
})

test('a saved Status drops subjects and children it cannot read, reads a delegate state it does not know as none, and nothing else is a Status', () => {
  const saved = {
    ...EMPTY_SESSION_STATUS,
    subjects: [
      { id: 's1', name: 'A', status: 'working', text: 'b', changedAt: 5, was: 'E folded in; was: two steps' },
      { id: 's2', status: 'odd' },
      { id: 's3', name: 'C', status: 'waits-on-you', text: 'needs a pick', changedAt: 6, was: 'F folded in' },
      { id: 's4', name: 'D', status: 'problem', text: 'flaky', changedAt: 7 },
    ],
    askSubjects: { i1: 's3', i2: 7 },
    children: [
      { id: 'c1', ref: 'r', kind: 'subagent', name: 'n', startedAt: 1 },
      { id: 'c2', kind: 'robot' },
      { id: 'c3', ref: 'herdr:a', kind: 'delegate', name: 'a', startedAt: 2, delegateState: 'blocked' },
      { id: 'c4', ref: 'herdr:b', kind: 'delegate', name: 'b', startedAt: 3, delegateState: 'asleep' },
    ],
    look: { startedAt: 'soon' },
  }
  const o = upgradeStatus(saved)!

  expect(o.subjects).toEqual([
    {
      id: 's1',
      name: 'A',
      status: 'working',
      text: 'b',
      was: 'two steps',
      merged: 'E',
      createdAt: 5,
      changedAt: 5,
      closedAt: null,
      into: null,
    },
    {
      id: 's3',
      name: 'C',
      status: 'queued',
      text: 'needs a pick',
      was: null,
      merged: 'F',
      createdAt: 6,
      changedAt: 6,
      closedAt: null,
      into: null,
    },
    {
      id: 's4',
      name: 'D',
      status: 'queued',
      text: 'flaky',
      was: null,
      merged: null,
      createdAt: 7,
      changedAt: 7,
      closedAt: null,
      into: null,
    },
  ])
  expect(o.askSubjects).toEqual({ i1: 's3' })
  expect(o.children).toEqual([
    {
      id: 'c1',
      ref: 'r',
      kind: 'subagent',
      name: 'n',
      subjectId: null,
      startedAt: 1,
      endedAt: null,
      lastActivityAt: null,
      delegateState: null,
    },
    expect.objectContaining({ id: 'c3', delegateState: 'blocked' }),
    expect.objectContaining({ id: 'c4', delegateState: null }),
  ])
  expect(o.look).toBeNull()
  expect(upgradeStatus(null)).toBeNull()
  expect(upgradeStatus('x')).toBeNull()
  expect(upgradeStatus({ role: 'session' })).toBeNull()
})
