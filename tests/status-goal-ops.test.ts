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

test('a proposal that rewords the goal or a declined goal, or names the goal’s milestones, is not proposed, and a next goal that shares a few words is', () => {
  const typed = setTypedGoal(
    after(null, 'NEW: working | Import | CSV works', 10),
    'Ship 2.6 with the import feature and recent fixes',
    20,
  )
  const declined = declineProposedGoal(proposed())

  expect(typed.goal?.isAwaitingMilestones).toBe(true)
  expect(
    after(typed, 'GOAL: 2.6 shipped with the import feature | working Import landed; queued 2.6 cut', 30).proposedGoal,
  ).toBeNull()
  expect(
    after(typed, 'GOAL: Ship 2.7 with PR grouping | queued Grouping built; queued 2.7 cut', 30).proposedGoal?.text,
  ).toBe('Ship 2.7 with PR grouping')
  expect(
    after(typed, 'GOAL: Ship 2.7 with the import feature and recent fixes | queued Fixes; queued 2.7 cut', 30)
      .proposedGoal,
  ).not.toBeNull()
  expect(
    after(withGoal(), 'GOAL: CSV import done | queued Demo script; done Import works; working Error messages', 30)
      .proposedGoal,
  ).toBeNull()
  expect(
    after(declined, 'GOAL: Import demo-ready | working Import works; queued Demo script', 30).proposedGoal,
  ).toBeNull()
})

test('Set as goal takes the proposed milestones with their states, and Not now remembers the goal', () => {
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
  expect(after(moved, 'DONE: m3 | written again', 40).milestones.find(m => m.id === 'm3')).toMatchObject({
    text: 'written',
    changedAt: 30,
    closedAt: 30,
  })
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
  expect(o.askSubjects).toEqual({ i1: ['m3'] })
})

test('the goal is met once every milestone left is done, and unmet when one opens again', () => {
  const met = after(withGoal(), 'DONE: m2 | named\nDROP: m3 | not needed', 30)
  const reopened = after(met, 'SET: m1 | working | broke on Excel', 40)

  expect(met.goal?.metAt).toBe(30)
  expect(after(met, 'SET: s1 | working | XLSX next', 35).goal?.metAt).toBe(30)
  expect(reopened.goal?.metAt).toBeNull()
})

test('a typed goal unlinks every subject and waits until an answer from a call that read it keeps a milestone, and a rewording keeps its milestones and links and sends nothing', () => {
  const met = after(
    after(withGoal(), 'SERVES: s1 | m1\nSERVES: s2 | -', 22),
    'DONE: m2 | named\nDONE: m3 | written',
    25,
  )
  const typed = setTypedGoal(met, 'Ship 2.6 with import', 30)
  const answered = applyStatus(typed, parseStatus('NO CHANGE')!, 40, NO_ASKS)!
  const stale = applyStatus(typed, parseStatus('SET: m1 | working | redone')!, 40, NO_ASKS, met.goal!.setAt)!
  const reworded = setTypedGoal(met, 'Demo import ready', 30)

  expect(met.goal?.metAt).toBe(25)
  expect(typed.goal).toMatchObject({
    text: 'Ship 2.6 with import',
    was: 'Import ready to demo',
    isAwaitingMilestones: true,
  })
  expect(typed.serves).toEqual({})
  expect(typed.milestones).toHaveLength(3)
  expect(answered.milestones).toEqual([])
  expect(answered.goal).toMatchObject({ isAwaitingMilestones: true, metAt: null })
  expect(stale.goal).toMatchObject({ isAwaitingMilestones: true, metAt: null })
  expect(after(answered, 'MILESTONE: queued | Release notes | not started', 50).goal).toMatchObject({
    isAwaitingMilestones: false,
    metAt: null,
  })
  expect(reworded.serves).toEqual({ s1: 'm1', s2: 'none' })
  expect(reworded.goal).toMatchObject({ text: 'Demo import ready', setAt: 20, isAwaitingMilestones: false })
})

test('the answer that reads a typed goal keeps the milestones it names, and the dropped and unnamed ones of the goal before go and never fill its five places', () => {
  const met = after(after(withGoal(), 'DONE: m2 | named\nDONE: m3 | written', 25), 'SERVES: s1 | m3', 26)
  const typed = setTypedGoal(met, 'Ship 2.6 with import', 30)
  const answered = after(
    typed,
    'MILESTONE: done | Import works | CSV works\nDROP: m2 | not needed\nMILESTONE: queued | Release notes | not started\nSERVES: s2 | m1',
    40,
  )

  const five = after(
    withGoal(),
    'MILESTONE: queued | Docs | not started\nMILESTONE: queued | Store page | not started',
    26,
  )
  const replaced = after(
    setTypedGoal(five, 'Search under 100 ms', 30),
    'MILESTONE: working | Under 100 ms | index rebuilt\nMILESTONE: queued | 2.6 live | not started\nSERVES: s1 | Under 100 ms',
    40,
  )

  expect(answered.milestones.map(m => m.name)).toEqual(['Import works', 'Release notes'])
  expect(answered.goal).toMatchObject({ isAwaitingMilestones: false, metAt: null })
  expect(answered.serves).toEqual({ s2: 'm1' })
  expect(five.milestones).toHaveLength(5)
  expect(replaced.milestones.map(m => m.name)).toEqual(['Under 100 ms', '2.6 live'])
  expect(replaced.serves).toEqual({ s1: replaced.milestones[0]!.id })
})

test('a GOAL line that restates a goal just set gives its milestones, and the SERVES lines that name them link, unless the call read the goal before it', () => {
  const typed = setTypedGoal(withGoal(), 'Ship 2.6 with import', 30)
  const restated = 'GOAL: 2.6 shipped with import | working Import works; queued 2.6 live\nSERVES: s1 | Import works'
  const answered = after(typed, restated, 40)
  const stale = applyStatus(typed, parseStatus(restated)!, 40, NO_ASKS, withGoal().goal!.setAt)!

  expect(answered.milestones.map(m => [m.name, m.status])).toEqual([
    ['Import works', 'working'],
    ['2.6 live', 'queued'],
  ])
  expect(answered.goal).toMatchObject({ text: 'Ship 2.6 with import', isAwaitingMilestones: false })
  expect(answered.serves).toEqual({ s1: answered.milestones[0]!.id })
  expect(answered.proposedGoal).toBeNull()
  expect(stale.milestones.map(m => m.name)).toEqual(typed.milestones.map(m => m.name))
  expect(stale.goal).toMatchObject({ isAwaitingMilestones: true })
})

test('a restated goal’s milestone keeps the text the goal before it gave that milestone, and a GOAL line for another goal while a goal waits is still a proposal', () => {
  const described = after(withGoal(), 'SET: m1 | working | CSV and JSON work', 25)
  const typed = setTypedGoal(withGoal(), 'Ship 2.6 with import', 30)
  const carried = setTypedGoal(described, 'Ship 2.6 with import', 30)
  const restated = after(carried, 'GOAL: Ship 2.6 with import | done Import works; queued 2.6 live', 40)
  const other = after(typed, 'GOAL: Dark mode in 2.7 | working Dark theme; queued 2.7 live', 40)

  expect(restated.goal).toMatchObject({ isAwaitingMilestones: false })
  expect(restated.milestones.map(m => [m.name, m.status, m.text])).toEqual([
    ['Import works', 'done', 'CSV and JSON work'],
    ['2.6 live', 'queued', ''],
  ])
  expect(other.proposedGoal?.text).toBe('Dark mode in 2.7')
  expect(other.goal).toMatchObject({ text: 'Ship 2.6 with import', isAwaitingMilestones: true })
  expect(other.milestones).toEqual([])
})

test('a goal typed over a proposal declines it, one with the proposal’s words uses the proposal and its milestones, and Set as goal links no subject yet', () => {
  const o = proposed()
  const linked = after(withGoal(), 'SERVES: s1 | -\nGOAL: Ship 2.6 | queued Notes; queued Tag', 22)

  expect(setTypedGoal(o, 'Ship 2.6', 30)).toMatchObject({ proposedGoal: null })
  expect(setTypedGoal(o, 'Ship 2.6', 30).declinedGoals).toHaveLength(1)
  const typed = setTypedGoal(o, 'Demo ready: import', 30)
  expect(typed).toMatchObject({ proposedGoal: null, declinedGoals: [] })
  expect(typed.goal).toMatchObject({ text: 'Demo ready: import', isAwaitingMilestones: false })
  expect(typed.milestones.map(m => m.name)).toEqual(useProposedGoal(o, 30).milestones.map(m => m.name))
  expect(linked.serves).toEqual({ s1: 'none' })
  expect(useProposedGoal(linked, 40).serves).toEqual({})
})

test("the replaced goal's was line goes once the person has looked", () => {
  const typed = setTypedGoal(withGoal(), 'Ship 2.6 with import', 30)
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

test('a milestone dropped with no INTO unlinks its subjects and asks, so the call links them again', () => {
  const asks = new Set(['i1'])
  const linked = after(withGoal(), 'SERVES: s1 | Error messages\nSERVES: s2 | -\nLINK: i1 | m2', 30, asks)

  for (const line of ['DROP: m2 | not needed', 'MILESTONE: dropped | Error messages | not needed']) {
    const dropped = after(linked, line, 40, asks)
    expect({ line, serves: dropped.serves, asks: dropped.askSubjects }).toEqual({
      line,
      serves: { s2: 'none' },
      asks: {},
    })
    const relinked = after(dropped, 'SERVES: s1 | m2\nLINK: i1 | m2', 50, asks)
    expect({ line, serves: relinked.serves, asks: relinked.askSubjects }).toEqual({
      line,
      serves: { s2: 'none' },
      asks: {},
    })
  }
})

test('a DROP whose INTO names a dropped milestone unlinks its subjects, as a DROP with no INTO does', () => {
  const linked = after(withGoal(), 'SERVES: s1 | Error messages\nSERVES: s2 | m3\nDROP: m3 | not needed', 30)
  const dropped = after(linked, 'DROP: m2 | not needed | INTO m3', 40)

  expect(dropped.serves).toEqual({})
})
