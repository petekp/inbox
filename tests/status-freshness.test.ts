import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { CLAUDE_CODE } from '../hooks/model-text'
import { failedStatus } from '../hooks/session-status'
import { noteActivity, notePrompt, turnStarted } from '../hooks/session-turns'
import { sessionView } from '../hooks/session-view'
import { refreshStatus } from '../hooks/status-records'
import { upgradeStatus } from '../hooks/status-upgrade'
import { NO_HOLDS } from '../hooks/timing'
import { footerError } from '../hooks/view'
import type { Session } from '../types'
import { fakeHost } from './session-fake-host'

const MIN = 60_000
const FIRST =
  'HEAD: Work offline | Letting the app work without a connection\nNEW: working | Offline mode | queue built\nSUGGEST: -'
const MOVED = 'SET: s1 | working | queue and retry built\nSUGGEST: -'

function session(answers: string[]) {
  let clock = 0
  const { host } = fakeHost(async () => answers.shift() ?? 'NO CHANGE\nSUGGEST: -')
  const timed = { ...host, now: async () => (clock += 10 * MIN) }
  const line = async () => {
    const s = await host.read()
    const v = sessionView(s, clock, clock, NO_HOLDS)
    return footerError('overview', v.status, v.statusPage)
  }
  const call = async (activity: string | null) => {
    if (activity !== null) await host.update(s => noteActivity(s, activity))
    await refreshStatus(timed)
  }
  const start = () => host.update(s => notePrompt(CLAUDE_CODE, turnStarted(s, 0), 'go', false).state)

  return { host, call, line, start }
}

test('the Status tab says the page is not updated once five calls that read agent work in a row changed nothing, until one changes it', async () => {
  const { call, line, start } = session([FIRST])
  await start()
  await call('edited sync.ts')
  for (let n = 1; n < 5; n += 1) await call(`edited file-${n}.ts`)
  expect(await line()).toBeNull()

  await call('edited file-5.ts')
  expect(await line()).toMatch(/^Not updated in \d+[mhd]$/)

  const {
    call: next,
    line: nextLine,
    start: nextStart,
  } = session([FIRST, ...Array(5).fill('NO CHANGE\nSUGGEST: -'), MOVED])
  await nextStart()
  for (let n = 0; n <= 5; n += 1) await next(`edited file-${n}.ts`)
  expect(await nextLine()).not.toBeNull()
  await next('edited retry.ts')
  expect(await nextLine()).toBeNull()
})

test('a call that read no agent work does not count toward the stale line', async () => {
  const { call, line, start } = session([FIRST])
  await start()
  for (let n = 0; n < 9; n += 1) await call(null)

  expect(await line()).toBeNull()
})

test('a failed Status call shows in place of the stale line, and no tab but Status shows it', async () => {
  const { host, call, line, start } = session([FIRST])
  await start()
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
