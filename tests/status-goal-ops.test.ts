import { expect, test } from 'claude-code/testing'

import { parseStatus } from '../hooks/status'
import { removeGoal, setTypedGoal } from '../hooks/status-goal-ops'
import { applyStatus } from '../hooks/status-ops'
import { statusPrompt, statusSystem } from '../hooks/status-prompt'
import { GOAL_PARTS } from '../hooks/status-prompt-goal'
import type { GoalPartId } from '../hooks/status-prompt-goal'
import type { SessionStatus } from '../types'
import { after, NO_ASKS, opsOf } from './status-helpers'

const GOAL = 'GOAL: Import ready to demo | done Import works; working Error messages; queued Demo script'
const WORK = 'NEW: working | Import | CSV works\nNEW: queued | Dark mode | not started'

const withGoal = (): SessionStatus => after(null, `${WORK}\n${GOAL}`, 20)

test('reads GOAL, RETIRE, MILESTONE and SERVES lines, leaving out a GOAL milestone with no known status', () => {
  expect(opsOf(`${GOAL}; soon Polish\nRETIRE: work moved to search`)).toEqual([
    {
      kind: 'goal',
      text: 'Import ready to demo',
      milestones: [
        { status: 'done', name: 'Import works' },
        { status: 'working', name: 'Error messages' },
        { status: 'queued', name: 'Demo script' },
      ],
    },
    { kind: 'retire', why: 'work moved to search' },
  ])
  expect(opsOf('MILESTONE: working | Error messages | bad rows named\nSERVES: s1 | m1\nSERVES: s2 | -')).toEqual([
    { kind: 'milestone', status: 'working', name: 'Error messages', text: 'bad rows named' },
    { kind: 'serves', subject: 's1', milestone: 'm1' },
    { kind: 'serves', subject: 's2', milestone: null },
  ])
})

test('a GOAL line sets an inferred goal with its milestones, and none with under two milestones, or for work that is all closed', () => {
  const o = withGoal()

  expect(o.goal).toEqual({
    text: 'Import ready to demo',
    setAt: 20,
    metAt: null,
    was: null,
    isAwaitingMilestones: false,
    source: 'inferred',
  })
  expect(o.milestones.map(m => [m.id, m.name, m.status])).toEqual([
    ['m1', 'Import works', 'done'],
    ['m2', 'Error messages', 'working'],
    ['m3', 'Demo script', 'queued'],
  ])
  expect(after(null, `${WORK}\nGOAL: Ship 2.6 | queued Release notes`, 10).goal).toBeNull()
  expect(after(null, `NEW: working | Import | CSV works\n${GOAL}`, 10).goal).not.toBeNull()
  expect(after(null, `NEW: working | Import | CSV works\nDONE: Import | shipped\n${GOAL}`, 10).goal).toBeNull()
  expect(after(null, `${WORK}\nDONE: s1 | shipped\n${GOAL}`, 10).goal).not.toBeNull()
  expect(after(null, `${WORK}\nDONE: s1 | shipped\nDONE: s2 | shipped\n${GOAL}`, 10).goal).toBeNull()
})

test('a GOAL line that restates the goal, names its milestones or restates a removed goal changes nothing, and a next goal that shares a few words is set', () => {
  const done = after(withGoal(), 'SERVES: s1 | m2\nSERVES: s2 | -\nDONE: s1 | shipped', 30)
  const removed = after(removeGoal(withGoal()), 'NEW: working | Search | index drafted', 40)

  expect(after(done, 'GOAL: Import, ready to demo | queued A; queued B', 40).goal?.setAt).toBe(20)
  expect(
    after(done, 'GOAL: CSV import done | queued Demo script; done Import works; working Error messages', 40).goal
      ?.setAt,
  ).toBe(20)
  expect(after(removed, 'GOAL: Import demo-ready | working Import works; queued Demo script', 50).goal).toBeNull()
  expect(
    after(
      done,
      'NEW: working | Grouping | drafted\nGOAL: Import ready to demo in 2.7 | queued Grouping; queued 2.7 cut',
      40,
    ).goal,
  ).toMatchObject({
    text: 'Import ready to demo in 2.7',
    was: 'Import ready to demo',
  })
})

test('a GOAL or RETIRE line replaces an inferred goal only once none of its linked work is open, read after the same answer closed it', () => {
  const linked = after(withGoal(), 'SERVES: s1 | m2\nSERVES: s2 | m3', 30)
  const next = 'GOAL: Search under 100 ms | working Index rebuilt; queued 2.7 live'
  const work = 'NEW: working | Search index | rebuilt\nNEW: queued | Ranking | not started'

  expect(after(linked, `${work}\n${next}`, 40).goal?.text).toBe('Import ready to demo')
  expect(after(linked, `DONE: s1 | merged\n${work}\n${next}`, 40).goal?.text).toBe('Import ready to demo')
  expect(after(linked, `${next}\nDONE: s1 | merged\nDROP: s2 | not needed\n${work}`, 40).goal).toMatchObject({
    text: 'Search under 100 ms',
    was: 'Import ready to demo',
    source: 'inferred',
  })
  expect(after(linked, 'RETIRE: moved on', 40).goal).not.toBeNull()
  expect(after(linked, 'DONE: s1 | merged\nDROP: s2 | not needed\nRETIRE: moved on', 40)).toMatchObject({
    goal: null,
    milestones: [],
    serves: {},
  })
})

test('a met goal takes a next GOAL at once and refuses RETIRE', () => {
  const met = after(withGoal(), 'DONE: m2 | named\nDONE: m3 | written', 30)
  const next = after(met, 'GOAL: Search under 100 ms | working Index rebuilt; queued 2.7 live', 40)

  expect(met.goal?.metAt).toBe(30)
  expect(after(met, 'RETIRE: done', 40).goal?.metAt).toBe(30)
  expect(next.goal).toMatchObject({ text: 'Search under 100 ms', metAt: null, was: 'Import ready to demo' })
  expect(next.milestones.map(m => m.id)).toEqual(['m4', 'm5'])
})

test('a typed goal is neither replaced nor retired before it is met, and takes a next GOAL once it is', () => {
  const typed = after(
    setTypedGoal(withGoal(), 'Ship 2.6 with import', 30),
    'MILESTONE: queued | 2.6 live | not started\nMILESTONE: queued | Notes out | not started\nSERVES: s1 | 2.6 live',
    40,
  )
  const idle = after(typed, 'DONE: s1 | shipped\nDROP: s2 | not needed\nNEW: working | Search | index drafted', 50)
  const next = 'GOAL: Search under 100 ms | working Index rebuilt; queued 2.7 live'
  const met = after(after(idle, 'DONE: Notes out | written\nNEW: queued | Ranking | not started', 60), next, 70)

  expect(typed.goal?.source).toBe('typed')
  expect(after(idle, 'RETIRE: moved on', 1e9).goal?.text).toBe('Ship 2.6 with import')
  expect(after(idle, `NEW: queued | Ranking | not started\n${next}`, 1e9).goal?.text).toBe('Ship 2.6 with import')
  expect(met.goal).toMatchObject({ text: 'Search under 100 ms', source: 'inferred' })
})

test('code closes a milestone once its linked work closed with one done, and leaves one the call opened again until more of its work closes', () => {
  const linked = after(
    withGoal(),
    'SERVES: s1 | m2\nSERVES: s2 | m3\nNEW: queued | Docs | not started\nSERVES: s3 | m2',
    30,
  )
  const closed = after(linked, 'DONE: s1 | merged\nDROP: s3 | not needed\nDROP: s2 | not needed', 40)
  const reopened = after(closed, 'SET: m2 | working | Excel errors left', 50)
  const more = after(
    after(reopened, 'NEW: working | Excel errors | named\nSERVES: s4 | m2', 60),
    'DONE: s4 | named',
    70,
  )

  expect(closed.milestones.map(m => [m.id, m.status])).toEqual([
    ['m1', 'done'],
    ['m2', 'done'],
    ['m3', 'queued'],
  ])
  expect(
    applyStatus(reopened, parseStatus('NO CHANGE')!, 55, NO_ASKS)!.milestones.find(m => m.id === 'm2')?.status,
  ).toBe('working')
  expect(more.milestones.find(m => m.id === 'm2')).toMatchObject({ status: 'done', closedAt: 70 })
  expect(more.goal?.metAt).toBeNull()
})

test('Remove goal clears the goal, its milestones and links, and the call does not set it again', () => {
  const removed = removeGoal(after(withGoal(), 'SERVES: s1 | m2\nLINK: i1 | m2', 30, new Set(['i1'])))

  expect(removed).toMatchObject({ goal: null, milestones: [], serves: {}, askSubjects: {} })
  expect(removed.removedGoals).toEqual(['demo import ready'])
  expect(removeGoal(removed)).toBe(removed)
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
  expect(typed.goal?.source).toBe('typed')
  expect(reworded.serves).toEqual({ s1: 'm1', s2: 'none' })
  expect(reworded.goal).toMatchObject({
    text: 'Demo import ready',
    setAt: 20,
    isAwaitingMilestones: false,
    source: 'typed',
  })
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
  expect(stale.milestones.map(m => m.name)).toEqual(typed.milestones.map(m => m.name))
  expect(stale.goal).toMatchObject({ isAwaitingMilestones: true })
})

test('a restated goal’s milestone keeps the text the goal before it gave that milestone, and a GOAL line for another goal while a typed goal waits changes nothing', () => {
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
  expect(other.goal).toMatchObject({ text: 'Ship 2.6 with import', isAwaitingMilestones: true })
  expect(other.milestones).toEqual([])
})

test("the replaced goal's was line goes once the person has looked", () => {
  const typed = setTypedGoal(withGoal(), 'Ship 2.6 with import', 30)
  const seen = applyStatus({ ...typed, lastLookAt: 35 }, parseStatus('NO CHANGE')!, 40, NO_ASKS)

  expect(seen?.goal?.was).toBeNull()
})

test("the call reads the goal, its milestones, each subject's link and the removed goals, and a copy of the system text can leave out any one goal rule", () => {
  const linked = {
    ...after(withGoal(), 'SERVES: s1 | m1', 22),
    removedGoals: ['dark mode shipped'],
  }
  const typed = after(
    setTypedGoal(linked, 'Ship 2.6 with import', 25),
    'MILESTONE: queued | 2.6 live | not started',
    26,
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
  const noGoal = statusPrompt({ last: after(null, WORK, 10), asks: [], tasks: [], now: 30 }, exchange)
  const typedPrompt = statusPrompt({ last: typed, asks: [], tasks: [], now: 30 }, exchange)

  expect(prompt).toMatch(/<goal>\nImport ready to demo\n<\/goal>/)
  expect(prompt).toMatch(/m1 \| done \| Import works \| -\n/)
  expect(prompt).toMatch(/m2 \| working \| Error messages \| - \| no work linked\n/)
  expect(typedPrompt).toMatch(/<goal>\nShip 2.6 with import \(typed\)\n<\/goal>/)
  expect(prompt).toMatch(/s1 \| working \| Import \| CSV works \| m1\n/)
  expect(prompt).toMatch(/s2 \| queued \| Dark mode \| not started \| \?\n/)
  expect(prompt).toMatch(/<removed>\ndark mode shipped\n<\/removed>/)
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
