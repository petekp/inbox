import { expect, test } from 'claude-code/testing'

import { EMPTY_SESSION_STATUS } from '../hooks/status-limits'
import { upgradeStatus } from '../hooks/status-upgrade'
import { after } from './status-helpers'

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

test('a goal string an earlier model wrote becomes the head with no description and never the goal, and a saved head keeps both lines', () => {
  const head = { title: 'Offline sync', description: 'Adding offline sync to the notes app' }
  const old = upgradeStatus({ role: 'coordinator', goal: 'Ship notes 2.4', subjects: [] })

  expect(old?.head).toEqual({ title: 'Ship notes 2.4', description: '' })
  expect(old?.goal).toBeNull()
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
    askSubjects: { i1: 's3', i2: 7, i3: ['s4', 9], i4: [] },
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
  expect(o.askSubjects).toEqual({ i1: ['s3'], i3: ['s4'] })
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

test('a Status saved before the goal loads with no goal, milestones or links', () => {
  const saved = upgradeStatus({ head: null, subjects: [], children: [], askSubjects: {}, nextId: 1, nextChildId: 1 })

  expect(saved).toEqual(EMPTY_SESSION_STATUS)
})

test('a saved goal keeps its milestones, loads as typed while it waits for them, and drops its proposal, what it cannot read and what links to nothing', () => {
  const subject = {
    id: 's1',
    name: 'Import',
    status: 'working',
    text: 'CSV works',
    was: null,
    merged: null,
    createdAt: 1,
    changedAt: 1,
    closedAt: null,
    into: null,
  }
  const milestone = {
    id: 'm1',
    name: 'Import works',
    status: 'working',
    text: 'CSV works',
    was: null,
    changedAt: 1,
    closedAt: null,
  }
  const saved = upgradeStatus({
    ...EMPTY_SESSION_STATUS,
    subjects: [subject],
    goal: { text: 'Import ready to demo', setAt: 5, metAt: null, was: 'Import built', isAwaitingMilestones: true },
    proposedGoal: {
      text: 'Demo on Friday',
      milestones: [
        { name: 'Import works', status: 'done' },
        { name: 'Bad', status: 'unknown' },
      ],
      at: 6,
    },
    declinedGoals: Array.from({ length: 12 }, (_, n) => `${n} goal`),
    milestones: [milestone, { id: 'm2', name: 'No time' }],
    nextMilestoneId: 1,
    serves: { s1: 'm1', s9: 'm1', s2: 'm7' },
  })

  expect(saved?.goal).toEqual({
    text: 'Import ready to demo',
    setAt: 5,
    metAt: null,
    was: 'Import built',
    isAwaitingMilestones: true,
    source: 'typed',
  })
  expect(Object.keys(saved ?? {})).not.toContain('proposedGoal')
  expect(saved?.removedGoals).toEqual(Array.from({ length: 10 }, (_, n) => `${n + 2} goal`))
  expect(saved?.milestones).toEqual([milestone])
  expect(saved?.nextMilestoneId).toBe(2)
  expect(saved?.serves).toEqual({ s1: 'm1' })
})

test('a goal with no text or time is no goal', () => {
  expect(upgradeStatus({ ...EMPTY_SESSION_STATUS, goal: { text: '', setAt: 5 } })?.goal).toBeNull()
  expect(upgradeStatus({ ...EMPTY_SESSION_STATUS, goal: { text: 'Ship it' } })?.goal).toBeNull()
})

test('a saved Status loses its links to a dropped milestone, its goal with no source loads as inferred, and its declined goals lose a trailing period and load as removed, the same on every load', () => {
  const at = { was: null, changedAt: 5, closedAt: null }
  const saved = {
    ...EMPTY_SESSION_STATUS,
    subjects: ['s1', 's2'].map(id => ({ id, name: id, status: 'working', text: '', createdAt: 5, ...at })),
    goal: { text: 'Notes in the store', setAt: 5, metAt: null, was: null, isAwaitingMilestones: false },
    milestones: [
      { id: 'm1', name: 'Sync works', status: 'working', text: '', ...at },
      { id: 'm2', name: 'Store review', status: 'dropped', text: 'not needed', ...at, closedAt: 6 },
    ],
    nextMilestoneId: 3,
    serves: { s1: 'm1', s2: 'm2' },
    askSubjects: { i1: 'm2', i2: 's1' },
    declinedGoals: ['demo import ready.', 'demo import ready', 'web on beta'],
  }
  const once = upgradeStatus(saved)!
  const unset = { ...once, goal: null, milestones: [], serves: {} }
  const again = after(unset, 'GOAL: Import ready to demo. | working Notes import; queued Demo run', 10)

  expect({ serves: once.serves, asks: once.askSubjects, removed: once.removedGoals }).toEqual({
    serves: { s1: 'm1' },
    asks: { i2: ['s1'] },
    removed: ['demo import ready', 'beta web'],
  })
  expect(once.goal?.source).toBe('inferred')
  expect(upgradeStatus(once)).toEqual(once)
  expect(again.goal).toBeNull()
})

test('a Status saved before looks counted rows on screen counts every subject that changed by its last look as seen, and a saved missed row keeps its time while its subject lasts', () => {
  const subject = (id: string, changedAt: number) => ({ id, name: id, status: 'working', text: '', changedAt })
  const saved = { subjects: [subject('s1', 10), subject('s2', 30)], lastLookAt: 20 }

  expect(upgradeStatus(saved)?.missedInLastLook).toEqual({})
  expect(upgradeStatus({ ...saved, missedInLastLook: { s1: 5, s2: null, s9: 1, s3: 'x' } })?.missedInLastLook).toEqual({
    s1: 5,
    s2: null,
  })
})
