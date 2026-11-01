import { expect, test } from 'claude-code/testing'

import { parseStatus } from '../hooks/status'
import { declineProposedGoal, setTypedGoal, useProposedGoal } from '../hooks/status-goal-ops'
import { applyStatus } from '../hooks/status-ops'
import { statusPrompt, statusSystem } from '../hooks/status-prompt'
import { GOAL_PARTS } from '../hooks/status-prompt-goal'
import type { GoalPartId } from '../hooks/status-prompt-goal'
import type { SessionStatus } from '../types'
import { after, NO_ASKS, opsOf } from './status-helpers'

const PROPOSE = 'GOAL: Import ready to demo | done Import works; working Error messages; queued Demo script'

const proposed = (): SessionStatus =>
  after(null, `NEW: working | Import | CSV works\nNEW: queued | Dark mode | not started\n${PROPOSE}`, 10)

const withGoal = (): SessionStatus => useProposedGoal(proposed(), 20)

test('reads GOAL, MILESTONE and SERVES lines, leaving out a proposed milestone with no known status', () => {
  expect(opsOf(`${PROPOSE}; soon Polish`)).toEqual([
    {
      kind: 'goal',
      text: 'Import ready to demo',
      milestones: [
        { status: 'done', name: 'Import works' },
        { status: 'working', name: 'Error messages' },
        { status: 'queued', name: 'Demo script' },
      ],
    },
  ])
  expect(opsOf('MILESTONE: working | Error messages | bad rows named\nSERVES: s1 | m1\nSERVES: s2 | -')).toEqual([
    { kind: 'milestone', status: 'working', name: 'Error messages', text: 'bad rows named' },
    { kind: 'serves', subject: 's1', milestone: 'm1' },
    { kind: 'serves', subject: 's2', milestone: null },
  ])
})

test('a GOAL line proposes and never sets the goal, and one with under two milestones, the current goal or a declined one, however long, is not proposed', () => {
  const o = proposed()
  const long = `GOAL: ${'every word of this goal counts toward the limit on how long a goal may read'} | queued A; queued B`
  const declinedLong = declineProposedGoal(after(null, long, 10))

  expect(o.goal).toBeNull()
  expect(o.proposedGoal?.text).toBe('Import ready to demo')
  expect(after(null, 'GOAL: Ship 2.6 | queued Release notes', 10).proposedGoal).toBeNull()
  expect(after(withGoal(), 'GOAL: Import, ready to demo | queued A; queued B', 30).proposedGoal).toBeNull()
  expect(after(withGoal(), 'GOAL: Ship 2.6 | queued Release notes; queued Tag', 30).goal?.text).toBe(
    'Import ready to demo',
  )
  expect(after(declineProposedGoal(o), PROPOSE, 30).proposedGoal).toBeNull()
  expect(declinedLong.declinedGoals).toHaveLength(1)
  expect(after(declinedLong, long, 20).proposedGoal).toBeNull()
})

test('Use this goal takes the proposed milestones with their states, and Not now remembers the goal', () => {
  const o = withGoal()

  expect(o.goal).toEqual({
    text: 'Import ready to demo',
    setAt: 20,
    metAt: null,
    was: null,
    isAwaitingMilestones: false,
  })
  expect(o.milestones.map(m => [m.id, m.name, m.status])).toEqual([
    ['m1', 'Import works', 'done'],
    ['m2', 'Error messages', 'working'],
    ['m3', 'Demo script', 'queued'],
  ])
  expect(o.proposedGoal).toBeNull()
  expect(declineProposedGoal(proposed())).toMatchObject({ proposedGoal: null, declinedGoals: ['demo import ready'] })
})

test('milestones need a goal, move by id under the rewording hold, and stop at five', () => {
  expect(after(null, 'MILESTONE: working | Import works | CSV', 10).milestones).toEqual([])
  const moved = after(withGoal(), 'SET: m2 | working | bad rows named\nDONE: m3 | written', 30)
  const reworded = after(moved, 'SET: m2 | working | named bad rows', 40)
  const full = after(
    withGoal(),
    ['A one', 'B two', 'C three'].map(n => `MILESTONE: queued | ${n} | not started`).join('\n'),
    30,
  )

  expect(moved.milestones.find(m => m.id === 'm2')).toMatchObject({ text: 'bad rows named', changedAt: 30 })
  expect(moved.milestones.find(m => m.id === 'm3')).toMatchObject({ status: 'done', closedAt: 30 })
  expect(reworded.milestones.find(m => m.id === 'm2')).toMatchObject({ text: 'bad rows named', changedAt: 30 })
  expect(full.milestones.map(m => m.name)).toEqual(['Import works', 'Error messages', 'Demo script', 'A one', 'B two'])
})

test('SERVES links a subject to a milestone or to none, and LINK can hold up a milestone', () => {
  const o = after(
    withGoal(),
    'SERVES: Import | Error messages\nSERVES: s2 | -\nSERVES: s1 | Polish\nLINK: i1 | m3',
    30,
    new Set(['i1']),
  )

  expect(o.serves).toEqual({ s1: 'm2', s2: 'none' })
  expect(o.askSubjects).toEqual({ i1: 'm3' })
})

test('the goal is met once every milestone left is done, and unmet when one opens again', () => {
  const met = after(withGoal(), 'DONE: m2 | named\nDROP: m3 | not needed', 30)
  const reopened = after(met, 'SET: m1 | working | broke on Excel', 40)

  expect(met.goal?.metAt).toBe(30)
  expect(after(met, 'SET: s1 | working | XLSX next', 35).goal?.metAt).toBe(30)
  expect(reopened.goal?.metAt).toBeNull()
})

test('a typed goal unlinks every subject and waits until an answer from a call that read it applies, and a rewording keeps its milestones and links and sends nothing', () => {
  const met = after(
    after(withGoal(), 'SERVES: s1 | m1\nSERVES: s2 | -', 22),
    'DONE: m2 | named\nDONE: m3 | written',
    25,
  )
  const typed = setTypedGoal(met, 'Ship 2.6 with import', 30)
  const answered = applyStatus(typed.status, parseStatus('NO CHANGE')!, 40, NO_ASKS)!
  const stale = applyStatus(typed.status, parseStatus('SET: m1 | working | redone')!, 40, NO_ASKS, met.goal!.setAt)!
  const reworded = setTypedGoal(met, 'Demo import ready', 30)

  expect(met.goal?.metAt).toBe(25)
  expect(typed.isNew).toBe(true)
  expect(typed.status.goal).toMatchObject({
    text: 'Ship 2.6 with import',
    was: 'Import ready to demo',
    isAwaitingMilestones: true,
  })
  expect(typed.status.serves).toEqual({})
  expect(typed.status.milestones).toHaveLength(3)
  expect(answered.goal).toMatchObject({ isAwaitingMilestones: false, metAt: 40 })
  expect(stale.goal).toMatchObject({ isAwaitingMilestones: true, metAt: null })
  expect(after(answered, 'MILESTONE: queued | Release notes | not started', 50).goal).toMatchObject({
    isAwaitingMilestones: false,
    metAt: null,
  })
  expect(reworded.status.serves).toEqual({ s1: 'm1', s2: 'none' })
  expect(reworded.isNew).toBe(false)
  expect(reworded.status.goal).toMatchObject({ text: 'Demo import ready', setAt: 20, isAwaitingMilestones: false })
})

test('a goal typed over a proposal declines it, one with the proposal’s words uses the proposal and its milestones, and Use this goal links no subject yet', () => {
  const o = proposed()
  const linked = after(withGoal(), 'SERVES: s1 | -\nGOAL: Ship 2.6 | queued Notes; queued Tag', 22)

  expect(setTypedGoal(o, 'Ship 2.6', 30).status).toMatchObject({ proposedGoal: null })
  expect(setTypedGoal(o, 'Ship 2.6', 30).status.declinedGoals).toHaveLength(1)
  const typed = setTypedGoal(o, 'Demo ready: import', 30)
  expect(typed.status).toMatchObject({ proposedGoal: null, declinedGoals: [] })
  expect(typed.status.goal).toMatchObject({ text: 'Demo ready: import', isAwaitingMilestones: false })
  expect(typed.status.milestones.map(m => m.name)).toEqual(useProposedGoal(o, 30).milestones.map(m => m.name))
  expect(linked.serves).toEqual({ s1: 'none' })
  expect(useProposedGoal(linked, 40).serves).toEqual({})
})

test("the replaced goal's was line goes once the person has looked", () => {
  const typed = setTypedGoal(withGoal(), 'Ship 2.6 with import', 30).status
  const seen = applyStatus({ ...typed, lastLookAt: 35 }, parseStatus('NO CHANGE')!, 40, NO_ASKS)

  expect(seen?.goal?.was).toBeNull()
})

test("the call reads the goal, its milestones, each subject's link and the declined goals, and a copy of the system text can leave out any one goal rule", () => {
  const linked = declineProposedGoal(
    after(withGoal(), 'SERVES: s1 | m1\nGOAL: Dark mode shipped | queued Theme built; queued Theme released', 22),
  )
  const exchange = {
    person: 'Go on',
    trigger: null,
    activity: [],
    reply: 'Done.',
    turn: 3,
    press: null,
    screen: '',
    tasks: [],
  }
  const prompt = statusPrompt({ last: linked, asks: [], tasks: [], now: 30 }, exchange)
  const noGoal = statusPrompt({ last: proposed(), asks: [], tasks: [], now: 30 }, exchange)

  expect(prompt).toMatch(/<goal>\nImport ready to demo\n<\/goal>/)
  expect(prompt).toMatch(/m2 \| working \| Error messages \| -/)
  expect(prompt).toMatch(/s1 \| working \| Import \| CSV works \| m1\n/)
  expect(prompt).toMatch(/s2 \| queued \| Dark mode \| not started \| \?\n/)
  expect(prompt).toMatch(/<declined>\ndark mode shipped\n<\/declined>/)
  expect(noGoal).not.toMatch(/<goal>|<milestones>|\| \?\n/)
  for (const id of Object.keys(GOAL_PARTS) as GoalPartId[]) {
    const others = (Object.keys(GOAL_PARTS) as GoalPartId[]).filter(x => x !== id)
    expect({ id, kept: statusSystem([id]).includes(GOAL_PARTS[id]) }).toEqual({ id, kept: false })
    expect({ id, others: others.every(x => statusSystem([id]).includes(GOAL_PARTS[x])) }).toEqual({ id, others: true })
  }
})
