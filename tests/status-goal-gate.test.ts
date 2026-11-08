import { expect, test } from 'claude-code/testing'

import { parseStatus } from '../hooks/status'
import { setTypedGoal } from '../hooks/status-goal-ops'
import { GOAL_LEFT_MS } from '../hooks/status-limits'
import { applyStatus } from '../hooks/status-ops'
import { statusPrompt } from '../hooks/status-prompt'
import { upgradeStatus } from '../hooks/status-upgrade'
import type { SessionStatus } from '../types'
import { after, NO_ASKS } from './status-helpers'

const MIN = 60_000
const GOAL =
  'GOAL: Notes 2.5 in the store | done Sync fixed; working Cleanup done; queued Widgets in; queued 2.5 published'
const WORK = 'NEW: working | Launch crash | fix in review\nNEW: waits-on-other | Widget polish | handed off'
const NEXT = 'GOAL: Notes 2.6 on TestFlight | working Share extension in; queued 2.6 beta up'
const NEW_WORK = 'NEW: working | Share extension | links make notes'

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
const goalBlock = (o: SessionStatus, now: number) =>
  /<goal>\n([\s\S]*?)\n<\/goal>/.exec(statusPrompt({ last: o, asks: [], tasks: [], now }, exchange))?.[1] ?? null

/** The goal with the crash fix under Cleanup done and the widget polish under Widgets in, both milestones open. */
const linked = (): SessionStatus => after(null, `${WORK}\n${GOAL}\nSERVES: s1 | m2\nSERVES: s2 | m3`, 20 * MIN)

/**
 * The shape that stuck a session: both served milestones done while their subjects stay open, the last milestone
 * queued with no work, and the last progress under GOAL_LEFT_MS ago.
 */
const stuck = (): SessionStatus => after(linked(), 'DONE: m2 | crash fix merged\nDONE: m3 | widgets landed', 30 * MIN)

test('a done milestone holds nothing: open work linked to it neither keeps the goal nor blocks a new one', () => {
  const o = stuck()
  const soon = 30 * MIN + 24 * MIN
  const later = 30 * MIN + GOAL_LEFT_MS

  expect(o.subjects.map(s => s.status)).toEqual(['working', 'waits-on-other'])
  expect(after(o, 'RETIRE: moved on', soon).goal).not.toBeNull()
  expect(goalBlock(after(o, 'RETIRE: moved on', soon), soon)).toBe(
    'Notes 2.5 in the store\nRETIRE refused: the work has not left the goal: it moved 24m ago. When its outcome happened, write DONE for each open milestone instead, so it is met. Else write RETIRE once this line says no work for a time.',
  )
  expect(goalBlock(o, later)).toBe('Notes 2.5 in the store (no work for 30m)')
  expect(after(o, 'RETIRE: moved on', later)).toMatchObject({ goal: null, milestones: [], serves: {} })
  expect(after(o, `${NEW_WORK}\n${NEXT}`, later).goal?.text).toBe('Notes 2.6 on TestFlight')
  expect(after(linked(), 'RETIRE: moved on', later).goal?.text).toBe('Notes 2.5 in the store')
})

test('the outcome happened: DONE on the last open milestones meets the goal in that answer, and a GOAL may follow at once', () => {
  const o = stuck()
  const soon = 30 * MIN + 3 * MIN
  const met = after(o, 'DONE: m4 | live in the store', soon)
  const next = after(o, `DONE: m4 | live in the store\n${NEW_WORK}\n${NEXT}`, soon)

  expect(met.goal?.metAt).toBe(soon)
  expect(next.goal).toMatchObject({ text: 'Notes 2.6 on TestFlight', was: 'Notes 2.5 in the store', metAt: null })
  expect(after(o, 'DONE: m4 | live in the store\nRETIRE: shipped', soon).goal?.metAt).toBe(soon)
})

test('a GOAL applies in the answer whose subject DONE closes the goal’s last milestone', () => {
  const o = after(
    linked(),
    'DONE: m2 | merged\nDONE: m3 | landed\nNEW: working | Store release | in review\nSERVES: s3 | m4',
    30 * MIN,
  )
  const soon = 30 * MIN + 5 * MIN
  const next = after(o, `DONE: s3 | live in the store\n${NEW_WORK}\n${NEXT}`, soon)

  expect(next.goal).toMatchObject({ text: 'Notes 2.6 on TestFlight', was: 'Notes 2.5 in the store' })
  expect(next.milestones.map(m => m.name)).toEqual(['Share extension in', '2.6 beta up'])
  expect(after(o, `${NEW_WORK}\n${NEXT}`, soon).goal?.text).toBe('Notes 2.5 in the store')
})

test('each refused GOAL or RETIRE line is saved with why, the next call reads it as it stands then, and the next answer clears it', () => {
  const o = linked()
  const at = 25 * MIN
  const open = after(o, 'RETIRE: moved on', at)
  const typed = after(setTypedGoal(o, 'Ship 2.5 with sync', at), 'MILESTONE: queued | 2.5 live | not started', at + MIN)
  const met = after(
    o,
    'DONE: m2 | merged\nDONE: m3 | landed\nDONE: m4 | live\nDONE: s1 | merged\nDONE: s2 | landed',
    at,
  )
  const line = (text: string, now = at) => goalBlock(after(o, text, now), now)?.split('\n')[1] ?? null

  expect(open.goalRefused).toEqual({ line: 'retire', why: 'work-open' })
  expect(goalBlock(open, at)?.split('\n')[1]).toBe(
    "RETIRE refused: the goal's work is still open: Launch crash, Widget polish. In the same answer, close that work with DONE or DROP, or write SERVES to - for work the goal does not need, then write RETIRE again.",
  )
  expect(goalBlock(after(open, 'DONE: s1 | merged\nDROP: s2 | handed off', at + MIN), at + MIN)).toBe(
    'Notes 2.5 in the store',
  )
  expect(line(`${NEW_WORK}\n${NEXT}`)).toBe(
    "GOAL refused: the goal's work is still open: Launch crash, Widget polish. In the same answer, close that work with DONE or DROP, or write SERVES to - for work the goal does not need, then write GOAL again.",
  )
  expect(line(`${NEW_WORK}\nGOAL: Notes 2.6 on TestFlight | working Share extension in`)).toBe(
    'GOAL refused: a goal needs 2 to 5 milestones.',
  )
  expect(
    line('NEW: working | Share extension | links make notes\nGOAL: 2.5 notes in the store | queued A; queued B'),
  ).toBe('GOAL refused: it restates the goal, the goal before it, or a removed goal.')
  expect(
    line(
      'DONE: s1 | merged\nDONE: s2 | landed\nDONE: m2 | merged\nDONE: m3 | landed\nDONE: m4 | live\nRETIRE: shipped',
    ),
  ).toBe('RETIRE refused: the goal is met. It stays until GOAL sets the next one.')
  expect(goalBlock(after(met, NEXT, at + MIN), at + MIN)?.split('\n')[1]).toBe(
    "GOAL refused: no open subject is outside the goal, so there is no work for a new one. Write NEW for the new goal's work in the same answer.",
  )
  expect(goalBlock(after(typed, 'RETIRE: moved on', at + 2 * MIN), at + 2 * MIN)?.split('\n')[1]).toBe(
    'RETIRE refused: the person typed this goal, so it is theirs until it is met.',
  )
  expect(applyStatus(open, parseStatus('NO CHANGE')!, at + MIN, NO_ASKS)?.goalRefused).toBeNull()
  expect(after(open, 'SET: s1 | working | fix landed', at + MIN).goalRefused).toBeNull()
  expect(after(stuck(), `DONE: m4 | live\n${NEW_WORK}\n${NEXT}`, 35 * MIN).goalRefused).toBeNull()
})

test('a GOAL line does not replace a goal the person typed after a met goal, whichever goal its call read', () => {
  const at = 25 * MIN
  const met = after(
    linked(),
    'DONE: m2 | merged\nDONE: m3 | landed\nDONE: m4 | live\nDONE: s1 | merged\nDONE: s2 | landed',
    at,
  )
  const typed = setTypedGoal(met, 'Ship the iPad app', at + MIN)

  for (const readSetAt of [met.goal!.setAt, typed.goal!.setAt]) {
    const o = applyStatus(typed, parseStatus(`${NEW_WORK}\n${NEXT}`)!, at + 2 * MIN, NO_ASKS, readSetAt)

    expect({ readSetAt, goal: o?.goal?.text, refused: o?.goalRefused }).toEqual({
      readSetAt,
      goal: 'Ship the iPad app',
      refused: { line: 'goal', why: 'typed' },
    })
  }
})

test('a refusal for work that moved shows only while the work has not left the goal', () => {
  const o = after(stuck(), 'RETIRE: moved on', 30 * MIN + 24 * MIN)
  const later = 30 * MIN + GOAL_LEFT_MS

  expect(o.goalRefused).toEqual({ line: 'retire', why: 'moved' })
  expect(goalBlock(o, later)).toBe('Notes 2.5 in the store (no work for 30m)')
})

test('a SERVES line whose subject names another version than its milestone links it under none', () => {
  const o = after(
    linked(),
    'NEW: working | 2.6 beta | share extension in\nNEW: working | iPad crash | fix in review',
    25 * MIN,
  )
  const served = after(o, 'SERVES: s3 | m4\nSERVES: s4 | m4', 26 * MIN)
  const same = after(o, 'NEW: working | 2.5 beta | signed\nSERVES: 2.5 beta | m4\nSERVES: s3 | m2', 26 * MIN)

  expect(served.serves).toMatchObject({ s3: 'none', s4: 'm4' })
  expect(same.serves).toMatchObject({ s5: 'm4', s3: 'm2' })
})

test('a saved refusal loads when it is well formed, and as none otherwise, and a typed goal clears one', () => {
  const saved = { ...stuck(), goalRefused: { line: 'retire', why: 'moved' } }

  expect(upgradeStatus(saved)?.goalRefused).toEqual({ line: 'retire', why: 'moved' })
  expect(upgradeStatus({ ...saved, goalRefused: { line: 'retire', why: 'tired' } })?.goalRefused).toBeNull()
  expect(upgradeStatus({ ...saved, goalRefused: undefined })?.goalRefused).toBeNull()
  expect(setTypedGoal(upgradeStatus(saved)!, 'Ship 2.6 with sharing', 40 * MIN).goalRefused).toBeNull()
})

test('a saved link from a subject to a milestone of another version loads as none, so the goal it held comes unstuck', () => {
  const o = after(stuck(), 'NEW: working | 2.6 beta | share extension in', 31 * MIN)
  const saved = { ...o, serves: { ...o.serves, s3: 'm4' } }
  const loaded = upgradeStatus(saved)!
  const later = 31 * MIN + GOAL_LEFT_MS

  expect(loaded.serves).toMatchObject({ s3: 'none' })
  expect(goalBlock(loaded, later)).toBe('Notes 2.5 in the store (no work for 31m)')
  expect(after(loaded, 'RETIRE: moved on', later).goal).toBeNull()
})
