import { expect, test } from 'claude-code/testing'

import { CLAUDE_CODE } from '../hooks/model-text'
import { recorded } from '../hooks/session-presses'
import { sessionView } from '../hooks/session-view'
import { press, wakeAfterSettle } from '../hooks/host-press'
import { NO_HOLDS } from '../hooks/timing'
import { fakeHost } from './session-fake-host'

for (const isDeliveryHeldUntilRun of [false, true])
  test(`a refused Done message folds its row and leaves its Closed line reading Not sent, with Undo, when delivery is held until run: ${isDeliveryHeldUntilRun}`, async () => {
    let clock = 1_000_000
    const scripted = fakeHost(async () => null).host
    const host = {
      ...scripted,
      now: () => clock,
      isDeliveryHeldUntilRun,
      deliver: async () => ({ state: 'rejected' as const, reason: 'queue refused' }),
    }
    const holds = { ...NO_HOLDS, shownSince: clock }
    await host.update(s => recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask: 'Sign in to npm' }, clock).state)
    const id = (await host.read()).ledger.items[0]!.id
    await press(host, { action: 'done', id }, false, holds)
    clock += host.settleWindowMs
    await wakeAfterSettle(host)
    const view = sessionView(await host.read(), clock, host.settleWindowMs, holds)

    expect(view.needsYou.tasks.map(r => r.id)).toEqual([])
    expect(view.needsYou.closed.tasks.map(c => c.delivery)).toEqual([{ error: 'queue refused', canUndo: true }])
  })

for (const isDeliveryHeldUntilRun of [false, true])
  test(`a Done message whose send throws folds its row, and its Closed line and sent record read not confirmed, when delivery is held until run: ${isDeliveryHeldUntilRun}`, async () => {
    let clock = 1_000_000
    const scripted = fakeHost(async () => null).host
    const host = {
      ...scripted,
      now: () => clock,
      isDeliveryHeldUntilRun,
      deliver: async () => {
        throw new Error('the session went away')
      },
    }
    const holds = { ...NO_HOLDS, shownSince: clock }
    await host.update(s => recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask: 'Sign in to npm' }, clock).state)
    const id = (await host.read()).ledger.items[0]!.id
    await press(host, { action: 'done', id }, false, holds)
    clock += host.settleWindowMs
    await wakeAfterSettle(host)
    const s = await host.read()
    const view = sessionView(s, clock, host.settleWindowMs, holds)

    expect(view.needsYou.tasks.map(r => r.id)).toEqual([])
    expect(view.needsYou.closed.tasks.map(c => c.delivery)).toEqual(['unconfirmed'])
    expect(s.sent.map(x => x.phase)).toEqual(['uncertain'])
  })

test('a typed reply to a question while its answer is held for Undo sends the answer first, then the reply', async () => {
  const clock = 1_000_000
  const sent: string[] = []
  const scripted = fakeHost(async () => null).host
  const host = {
    ...scripted,
    now: () => clock,
    deliver: async (_s: unknown, text: string) => {
      sent.push(text)
      return { state: 'accepted' as const, queuedId: null }
    },
  }
  const question = { kind: 'question', ask: 'Which cache should the API use?', options: ['Redis', 'In-memory'] }
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', question, clock).state)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'answer', id, option: 'Redis' }, false, NO_HOLDS)
  expect(sent).toEqual([])
  await press(host, { action: 'type', id, text: 'and keep it warm' }, false, NO_HOLDS)

  expect(sent).toHaveLength(2)
  expect(sent[0]).toContain('Redis')
  expect(sent[1]).toContain('and keep it warm')
})
