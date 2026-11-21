import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { CLAUDE_CODE } from '../core/domain/model-text'
import { failedStatus } from '../core/runtime/session-status'
import { noteActivity, notePrompt, turnStarted } from '../core/runtime/session-turns'
import { sessionView } from '../core/view/session-view'
import { askAndWriteStatus, readForStatus, refreshStatus } from '../core/runtime/status-records'
import type { StatusCall } from '../core/runtime/status-records'
import { goalPressed } from '../core/domain/goal-press'
import { upgradeStatus } from '../core/domain/status-upgrade'
import { NO_HOLDS } from '../core/view/timing'
import { footerError } from '../core/view/view'
import type { Exchange, Session } from '../types'
import { fakeHost } from './session-fake-host'

const MIN = 60_000
const FIRST =
  'HEAD: Work offline | Letting the app work without a connection\nNEW: working | Offline mode | queue built\nSUGGEST: -'
const MOVED = 'SET: s1 | working | queue and retry built\nSUGGEST: -'
const SET_GOAL = () => ({ kind: 'mark' as const, action: 'type', text: 'Set goal', at: 0 })
const EXCHANGE: Exchange = {
  person: 'go',
  trigger: null,
  activity: [],
  reply: 'Done.',
  turn: 0,
  press: null,
  screen: '',
  tasks: [],
}

function session(answers: string[]) {
  let clock = 0
  const { host } = fakeHost(async () => answers.shift() ?? 'NO CHANGE\nSUGGEST: -')
  const timed = { ...host, now: async () => (clock += 10 * MIN) }
  const line = async () => {
    const s = await host.read()
    const v = sessionView(s, clock, clock, NO_HOLDS)
    return footerError('overview', v.status, v.statusPage)
  }
  const reply = async (activity: string[]) => {
    const read = await readForStatus(timed)
    const { s } = read
    const exchange = { ...EXCHANGE, activity, turn: s.ledger.turn }
    const call: StatusCall = { exchange: { kind: 'reply', exchange }, ask: host.ask }
    await askAndWriteStatus(timed, read, call, [], s.presence.turnsApplied)
  }
  const call = (activity: string | null) => reply(activity === null ? [] : [activity])
  const midTurn = async (activity: string) => {
    await host.update(s => noteActivity(s, activity))
    await refreshStatus(timed)
  }
  const start = () => host.update(s => notePrompt(CLAUDE_CODE, turnStarted(s, 0), 'go', false).state)
  const typeGoal = (text: string) =>
    host.update(s => {
      const pressed = goalPressed(s.ledger, { action: 'type', id: 'goal', text }, SET_GOAL, clock)
      return 'ledger' in pressed ? { ...s, ledger: pressed.ledger } : s
    })

  return { host, call, line, start, midTurn, typeGoal }
}

test('the Status tab says the page is not updated once five calls after replies with agent work changed nothing, until one changes it', async () => {
  const { call, line } = session([FIRST])
  await call('edited sync.ts')
  for (let n = 1; n < 5; n += 1) await call(`edited file-${n}.ts`)
  expect(await line()).toBeNull()

  await call('edited file-5.ts')
  expect(await line()).toMatch(/^Not updated in \d+[mhd]$/)

  const { call: next, line: nextLine } = session([FIRST, ...Array(5).fill('NO CHANGE\nSUGGEST: -'), MOVED])
  for (let n = 0; n <= 5; n += 1) await next(`edited file-${n}.ts`)
  expect(await nextLine()).not.toBeNull()
  await next('edited retry.ts')
  expect(await nextLine()).toBeNull()
})

test('a call that read no agent work, or work during a turn, does not count toward the stale line', async () => {
  const { call, line, start, midTurn } = session([FIRST])
  for (let n = 0; n < 9; n += 1) await call(null)
  expect(await line()).toBeNull()

  await start()
  for (let n = 0; n < 9; n += 1) await midTurn(`edited file-${n}.ts`)
  expect(await line()).toBeNull()
})

test('a goal the person sets clears the stale line', async () => {
  const { call, line, typeGoal } = session([FIRST])
  for (let n = 0; n <= 5; n += 1) await call(`edited file-${n}.ts`)
  expect(await line()).not.toBeNull()

  await typeGoal('Offline mode in the beta')
  expect(await line()).toBeNull()
})

test('a failed Status call shows in place of the stale line, and no tab but Status shows it', async () => {
  const { host, call, line } = session([FIRST])
  for (let n = 0; n <= 5; n += 1) await call(`edited file-${n}.ts`)
  const stale = await line()
  const failed = (s: Session) => failedStatus(s, null, s.presence.turnsApplied, 0)
  const v = (s: Session) => sessionView(s, 0, 0, NO_HOLDS)
  const s = await host.read()

  expect(stale).not.toBeNull()
  expect(footerError('overview', v(failed(s)).status, v(failed(s)).statusPage)).toBe(v(failed(s)).statusPage.error)
  expect(footerError('needsYou', v(s).status, v(s).statusPage)).toBeNull()
})

test('a Status an earlier build saved has no time of its last change and no quiet calls', () => {
  const saved = { head: null, subjects: [], children: [] }

  expect(upgradeStatus(saved)).toMatchObject({ changedAt: null, quietCalls: 0 })
})
