import { expect } from 'claude-code/testing'
import { test } from './test-with-timeout'

import { CLAUDE_CODE } from '../core/domain/model-text'
import { recorded } from '../core/runtime/session-presses'
import { sessionView } from '../core/view/session-view'
import { rowKeyPlan } from '../core/view/action-plan'
import { press, wakeAfterSettle } from '../core/runtime/host-press'
import { NO_HOLDS, QUEUED_AFTER_MS } from '../core/view/timing'
import { fakeHost } from './session-fake-host'
import { TOOL_FIELDS } from '../core/domain/tool-schemas'

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
    await host.update(
      s => recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask: 'Sign in to npm' }, clock, TOOL_FIELDS, null).state,
    )
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
    await host.update(
      s => recorded(CLAUDE_CODE, s, 'record', { kind: 'task', ask: 'Sign in to npm' }, clock, TOOL_FIELDS, null).state,
    )
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
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', question, clock, TOOL_FIELDS, null).state)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'answer', id, option: 'Redis' }, false, NO_HOLDS)
  expect(sent).toEqual([])
  await press(host, { action: 'type', id, text: 'and keep it warm' }, false, NO_HOLDS)

  expect(sent).toHaveLength(2)
  expect(sent[0]).toContain('Redis')
  expect(sent[1]).toContain('and keep it warm')
})

test('a typed question back goes to the agent as a question about the ask, and the question stays open', async () => {
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
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', question, clock, TOOL_FIELDS, null).state)
  const id = (await host.read()).ledger.items[0]!.id
  await press(host, { action: 'type', id, text: 'Why not Redis?' }, false, NO_HOLDS)
  await press(host, { action: 'type', id, text: 'Redis?' }, false, NO_HOLDS)

  expect(sent).toEqual([
    'About this question you asked me: Why not Redis?\n"Which cache should the API use?"\nOptions: Redis / In-memory',
    'Re "Which cache should the API use?": Redis?',
  ])
  expect((await host.read()).ledger.items.map(i => i.id)).toEqual([id])
})

for (const isDeliveryHeldUntilRun of [false, true])
  test(`an answer held for Undo reads sending, not Queued, from its release until QUEUED_AFTER_MS later, when delivery is held until run: ${isDeliveryHeldUntilRun}`, async () => {
    let clock = 1_000_000
    const scripted = fakeHost(async () => null).host
    const host = {
      ...scripted,
      now: () => clock,
      isDeliveryHeldUntilRun,
      deliver: async () => ({ state: 'accepted' as const, queuedId: null, isInTurn: false }),
    }
    const holds = { ...NO_HOLDS, shownSince: clock }
    const question = { kind: 'question', ask: 'Which cache should the API use?', options: ['Redis', 'In-memory'] }
    await host.update(s => recorded(CLAUDE_CODE, s, 'record', question, clock, TOOL_FIELDS, null).state)
    const id = (await host.read()).ledger.items[0]!.id
    await press(host, { action: 'answer', id, option: 'Redis' }, false, holds)
    clock += host.settleWindowMs
    await wakeAfterSettle(host)
    const deliveryAt = async (at: number) =>
      sessionView(await host.read(), at, host.settleWindowMs, holds).needsYou.closed.questions.map(c => c.delivery)

    expect(await deliveryAt(clock)).toEqual(['sending'])
    expect(await deliveryAt(clock + QUEUED_AFTER_MS - 1)).toEqual(['sending'])
    expect(await deliveryAt(clock + QUEUED_AFTER_MS)).toEqual(['queued'])
  })

test("a task's result press closes it and sends its result, after its steps take the place of Done in its buttons", async () => {
  let clock = 1_000_000
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
  const holds = { ...NO_HOLDS, shownSince: clock }
  const check = {
    kind: 'task',
    ask: 'Delete a card and press Cmd+Z: does it come back?',
    options: ['Comes back', 'Gone'],
    rec: 'Gone',
    steps: ['https://localhost:3000/stack'],
  }
  await host.update(s => recorded(CLAUDE_CODE, s, 'record', check, clock, TOOL_FIELDS, null).state)
  const open = sessionView(await host.read(), clock, host.settleWindowMs, holds).needsYou.tasks[0]
  if (!open) throw new Error('the task has no row')
  const plan = rowKeyPlan(open, false)

  expect(open.actions.map(a => [a.press.action, a.label, a.emphasis])).toEqual([
    ['step', 'Open localhost:3000', 'normal'],
    ['answer', 'Comes back', 'normal'],
    ['answer', 'Gone', 'normal'],
    ['type', 'Reply', 'quiet'],
    ['explain', 'Explain', 'quiet'],
    ['dismiss', 'Dismiss', 'quiet'],
  ])
  expect([plan.options, plan.answerRow, plan.keys.map(k => (k.slot === 'choice' ? k.action.label : k.slot))]).toEqual([
    [],
    null,
    ['Open localhost:3000', 'Comes back', 'Gone'],
  ])

  await press(host, { action: 'answer', id: open.id, option: 'Gone' }, false, holds)
  clock += host.settleWindowMs
  await wakeAfterSettle(host)
  const s = await host.read()

  expect(sent).toEqual(['Re "Delete a card and press Cmd+Z: does it come back?": Gone'])
  expect([s.ledger.items, s.ledger.closed.map(c => [c.how, c.outcome])]).toEqual([[], [['answered', 'Gone']]])
})
