import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { w, world } from './hooks-world'
import { PANE, replyField, replyKey } from './hooks-helpers'

const PROPOSING =
  'HEAD: Pilot | Shipping the pilot\nNEW: working | Fixes | built\nGOAL: Pilot ready to announce | done Fixes built; queued Announced'

async function statusShown($: Engine, on: On) {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  w.statusReply = PROPOSING
  on('ui.focus', () => ({}))
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'get the pilot ready to announce', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Fixes built.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()
  return { clock, pane }
}

test('on a next build, a proposed goal shows above the head with its keys selected and its x bound to Not now alone, Edit opens the field in its place, Use this goal sets it with its milestones and draws the head as its Now line, and nothing is sent', async ($, on) => {
  const { clock, pane } = await statusShown($, on)

  expect((await pane.find({ key: 'goal-proposal-text' }))?.text).toBe('Pilot ready to announce')
  expect(await pane.find({ key: 'status-proposal' })).toBeDefined()
  expect((await pane.find({ key: 'goal-proposal-milestones' }))?.text).toBe('✓ Fixes built   ○ Announced')
  expect((await pane.find({ key: 'use-goal-proposal' }))?.text).toBe('u: Use this goal')
  expect((await pane.find({ key: 'type-goal-goal' }))?.text).toBe('Set a goal')
  const hiddenKeys = (await pane.findAll({ type: 'Button' })).flatMap(b =>
    b.key?.endsWith('-key') && !b.key.startsWith('tab-') ? [b.key] : [],
  )
  expect(hiddenKeys).toEqual([
    'use-goal-proposal-key',
    'type-goal-proposal-key',
    'decline-goal-proposal-key',
    'no-row-d-key',
  ])

  await pane.press({ key: 'type-goal-proposal-key' })
  await clock.settle()
  expect(await replyField(pane, 'goal')).toMatchObject({ props: { value: 'Pilot ready to announce' } })
  expect(await pane.find({ key: 'goal-proposal-text' })).toBeUndefined()
  expect(await pane.find({ key: 'use-goal-proposal' })).toBeUndefined()
  expect(await pane.find({ key: 'type-goal-goal' })).toBeUndefined()
  await pane.press({ key: 'cancel-goal' })
  await clock.settle()

  await pane.press({ key: 'use-goal-proposal-key' })
  await clock.settle()
  expect(await pane.find({ key: 'status-proposal' })).toBeUndefined()
  expect((await pane.find({ key: 'goal-label' }))?.text).toBe('Goal · 1 of 2 done')
  expect((await pane.find({ key: 'goal-text' }))?.text).toBe('Pilot ready to announce')
  expect((await pane.find({ key: 'goal-m1-name' }))?.text).toBe('Fixes built')
  expect((await pane.find({ key: 'status-now-line' }))?.text).toBe('Now: Shipping the pilot')
  expect(await pane.find({ key: 'status-head' })).toBeUndefined()
  expect((await pane.find({ key: 'type-goal-goal' }))?.text).toBe('g: Change goal')
  expect(w.sent).toEqual([])
})

test('on a next build, Not now drops the proposal and keeps Set a goal, which opens an empty goal field that sets the typed goal and waits for its milestones', async ($, on) => {
  const { clock, pane } = await statusShown($, on)

  await pane.press({ key: 'decline-goal-proposal-key' })
  await clock.settle()
  expect(await pane.find({ key: 'status-proposal' })).toBeUndefined()
  expect(await pane.find({ key: 'status-head' })).toBeDefined()

  await pane.press({ key: 'type-goal-goal-key' })
  await clock.settle()
  expect(await replyField(pane, 'goal')).toBeDefined()
  expect(await pane.find({ key: 'type-goal-goal' })).toBeUndefined()
  await pane.input({ key: await replyKey(pane, 'goal'), text: 'Pilot live for every team' })
  await clock.settle()
  expect(await replyField(pane, 'goal')).toBeUndefined()
  expect((await pane.find({ key: 'goal-text' }))?.text).toBe('Pilot live for every team')
  expect((await pane.find({ key: 'goal-awaiting' }))?.text).toBe('Milestones after the next reply')
  expect(w.sent).toEqual([])
})

test('on a next build, Change goal opens the field with the goal in it in place of the goal and gives it the keys, and Cancel closes it and keeps the goal', async ($, on) => {
  const { clock, pane } = await statusShown($, on)
  await pane.press({ key: 'use-goal-proposal-key' })
  await clock.settle()

  await pane.press({ key: 'type-goal-goal-key' })
  await clock.settle()
  expect(await replyField(pane, 'goal')).toMatchObject({ props: { value: 'Pilot ready to announce' } })
  expect(w.paneOpens.at(-1)).toMatchObject({ id: 'inbox', focus: true })
  expect(w.paneOpens.at(-1)?.closeOnEscape).toBeUndefined()
  expect(await pane.find({ key: 'goal-text' })).toBeUndefined()
  await pane.press({ key: 'cancel-goal' })
  await clock.settle()
  expect(await replyField(pane, 'goal')).toBeUndefined()
  expect((await pane.find({ key: 'goal-text' }))?.text).toBe('Pilot ready to announce')
})

test('on a next build, Set a goal on the empty Status page sets the typed goal before any Status call', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()

  expect((await pane.find({ key: 'type-goal-goal' }))?.text).toBe('s: Set a goal')
  await pane.press({ key: 'type-goal-goal-key' })
  await clock.settle()
  await pane.input({ key: await replyKey(pane, 'goal'), text: 'Greeting CLI on npm' })
  await clock.settle()
  expect((await pane.find({ key: 'goal-text' }))?.text).toBe('Greeting CLI on npm')
  expect((await pane.find({ key: 'goal-awaiting' }))?.text).toBe('Milestones after the next reply')
})
