import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { PRESS_GUARD_MS, QUEUED_AFTER_MS, SETTLED_MS } from '../hooks/timing'
import { w, arrive, world } from './hooks-world'
import { PANE, selectRow, leaveAndReturn } from './hooks-helpers'

test(
  'Done on a task Claude just left tells Claude once Undo ends, and a task from an earlier reply or one already read stays silent',
  { timeoutMs: 20_000 },
  async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.paneState = { isShown: true, isFocused: true }
    const reply = async (text: string, answer: string, turnId: string) => {
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
      await $.turn.start({ text, turnId })
      await $.turn.complete({ answer, durationMs: 5, isAborted: false, turnId, reason: 'answer' })
      await clock.settle()
    }

    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    w.ledgerReply = 'NEW: do | - | Water the plants | - | -'
    await reply('plan the day', 'Water the plants when you can.', 't1')
    w.ledgerReply = ['NEW: do | - | Sign in to npm | - | -', 'NEW: do | - | Approve the deploy | - | -'].join('\n')
    await reply('publish it', 'Sign in to npm and approve the deploy, then I publish.', 't2')
    const pane = await $.ui.mount(PANE)
    const done = async (id: string) => {
      await selectRow(pane, `${id}`)
      await clock.advance(PRESS_GUARD_MS)
      await pane.press({ key: `done-${id}` })
      await clock.settle()
    }

    await done('i2')
    await clock.advance(SETTLED_MS / 2)
    await done('i3')
    await clock.advance(SETTLED_MS / 2)
    expect(w.sent).toEqual([])
    expect(await pane.find({ key: 'undo-i3' })).toBeDefined()
    await clock.advance(SETTLED_MS / 2)
    expect(w.sent).toEqual(['Done:\n- Sign in to npm\n- Approve the deploy'])

    await reply('thanks', 'Published.', 't3')
    await done('i1')
    await clock.advance(SETTLED_MS)
    expect(w.sent).toHaveLength(1)

    w.ledgerReply = 'NEW: do | - | Rotate the key | - | -'
    await reply('next', 'Rotate the key, then I redeploy.', 't4')
    await done('i4')
    await $.prompt.submit({ text: 'done, go ahead', wait: false, origin: { kind: 'composer' } })
    await clock.advance(SETTLED_MS)
    expect(w.sent).toHaveLength(1)
  },
)

test('a Done message that waits for its prompt to run reads Queued instead of Not confirmed', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  w.ledgerReply = 'NEW: do | - | Sign in to npm | - | -'
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'publish it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'publish it', turnId: 't1' })
  await $.turn.complete({
    answer: 'Sign in to npm, then I publish.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await selectRow(pane, 'i1')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'done-i1' })
  await clock.settle()

  w.submitAnswer = 'hold'
  await clock.advance(SETTLED_MS)
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
  expect(await pane.find({ text: /Queued/ })).toBeDefined()
  await leaveAndReturn(pane, clock, 'needsYou')
  await pane.press({ key: 'fold-task' })
  expect(await pane.find({ text: /Queued/ })).toBeDefined()
  await arrive($)
})

const doneWakeAfterRewrite = async ($: Engine, on: On, isMatched: boolean) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.ledgerReply = ['NEW: decide | 1 | Ship it? | yes / no | yes', 'NEW: do | - | Sign in to npm | - | -'].join('\n')
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'publish it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'publish it', turnId: 't1' })
  await $.turn.complete({
    answer: 'Ship it? And sign in to npm first.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  if (isMatched) {
    w.submitAnswer = 'hold'
    w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
    await clock.settle()
  }
  await selectRow(pane, 'i2')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'done-i2' })
  await clock.settle()
  w.submitAnswer = { rewrite: isMatched ? w.held[0]!.text : 'Rewritten by another plugin' }
  await clock.advance(SETTLED_MS)
  await clock.advance(QUEUED_AFTER_MS)
  await clock.settle()
  await leaveAndReturn(pane, clock, 'needsYou')
  await pane.press({ key: 'fold-task' })
  return pane
}

test('a Done message another plugin rewrote reads as delivered once Claude runs it, not Queued', async ($, on) => {
  const pane = await doneWakeAfterRewrite($, on, false)
  expect(await pane.find({ text: /Queued/ })).toBeUndefined()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
})

test('a Done message another plugin rewrote to text a pending press also sent reads Not confirmed, not Queued', async ($, on) => {
  const pane = await doneWakeAfterRewrite($, on, true)
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeDefined()
  await arrive($)
})

for (const switchAt of [null, 'before-submit', 'during-submit'] as const)
  test(`a refused Done batch stays recoverable after resume, with session switch during send: ${switchAt}`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.ledgerReply = ['NEW: do | - | Sign in to npm | - | -', 'NEW: do | - | Approve the deploy | - | -'].join('\n')
    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'publish it', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'publish it', turnId: 't1' })
    await $.turn.complete({
      answer: 'Sign in and approve the deploy.',
      durationMs: 5,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
    })
    await clock.settle()
    const pane = await $.ui.mount(PANE)
    for (const id of ['i1', 'i2']) {
      await selectRow(pane, `${id}`)
      await clock.advance(PRESS_GUARD_MS)
      await pane.press({ key: `done-${id}` })
      await clock.settle()
    }
    const switchSession = async () => {
      await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
      await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
    }
    if (switchAt === 'before-submit')
      w.storeSetHold = async (_key, value) => {
        const saved = value as { ledger?: { closed: { doneNotification?: unknown }[] } }
        if (!saved.ledger?.closed.some(c => c.doneNotification)) return
        w.storeSetHold = undefined
        await switchSession()
      }
    w.submitAnswer = {
      drop: 'Notifications refused',
      beforeDrop: async () => {
        if (switchAt === 'during-submit') await switchSession()
      },
    }
    await clock.advance(SETTLED_MS)
    expect(w.sent).toHaveLength(switchAt === 'before-submit' ? 0 : 1)
    if (switchAt) {
      expect(await pane.find({ text: /Not sent:/ })).toBeUndefined()
      await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
      await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
      await clock.settle()
    }
    await leaveAndReturn(pane, clock, 'needsYou')
    await pane.press({ key: 'fold-task' })
    expect({ refusalVisible: !!(await pane.find({ text: /Not sent:/ })) }).toEqual({ refusalVisible: true })
    expect({ firstUndoVisible: !!(await pane.find({ key: 'undo-i1' })) }).toEqual({ firstUndoVisible: true })
    expect({ secondUndoVisible: !!(await pane.find({ key: 'undo-i2' })) }).toEqual({ secondUndoVisible: true })
    await clock.advance(SETTLED_MS * 2)
    expect(w.sent).toHaveLength(switchAt === 'before-submit' ? 0 : 1)
    await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
    await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
    await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
    await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
    await clock.settle()
    await clock.advance(SETTLED_MS * 2)
    expect(w.sent).toHaveLength(switchAt === 'before-submit' ? 0 : 1)
    await pane.press({ key: 'fold-task' })
    expect({ refusalVisible: !!(await pane.find({ text: /Not sent:/ })) }).toEqual({ refusalVisible: true })
    await pane.press({ key: 'undo-i1' })
    await clock.settle()
    expect({ restoredTask: !!(await pane.find({ key: 'done-i1' })) }).toEqual({ restoredTask: true })
  })
