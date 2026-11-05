import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { w, world } from './hooks-world'
import { PANE, replyField, replyKey } from './hooks-helpers'

const INFERRING = [
  'HEAD: Pilot | Shipping the pilot',
  'NEW: working | Fixes | built',
  'NEW: queued | Announcement | not started',
  'GOAL: Pilot ready to announce | done Fixes built; queued Announced',
].join('\n')

async function statusShown($: Engine, on: On) {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  w.statusReply = INFERRING
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

test('on a next build, a goal the Status call writes shows at once with its milestones, its header holds Edit and Remove goal, the head draws as its Now line, and nothing is sent', async ($, on) => {
  const { pane } = await statusShown($, on)

  expect((await pane.find({ key: 'goal-label' }))?.text).toBe('Goal · e: Edit · r: Remove goal')
  expect((await pane.find({ key: 'goal-text' }))?.text.replaceAll('\u00a0', ' ')).toBe(
    'Pilot ready to announce · 1 of 2 done',
  )
  expect((await pane.find({ key: 'goal-m1-name' }))?.text).toBe('Fixes built')
  expect((await pane.find({ key: 'goal-now' }))?.text).toBe('Now: Shipping the pilot')
  expect(await pane.find({ key: 'status-head' })).toBeUndefined()
  expect(w.sent).toEqual([])
})

test('on a next build, Remove goal clears the goal and selects Set a goal, which opens an empty goal field that sets the typed goal and waits for its milestones', async ($, on) => {
  const { clock, pane } = await statusShown($, on)

  await pane.press({ key: 'remove-goal-goal-key' })
  await clock.settle()
  expect(await pane.find({ key: 'goal-text' })).toBeUndefined()
  expect(await pane.find({ key: 'status-head' })).toBeDefined()
  expect((await pane.find({ key: 'type-goal-goal' }))?.text).toBe('s: Set a goal')

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

test('on a next build, the goal header’s Edit opens the field with the goal in it in place of the goal’s text, leaves the header as Goal and gives the field the keys, and Cancel closes it and keeps the goal', async ($, on) => {
  const { clock, pane } = await statusShown($, on)

  await pane.press({ key: 'type-goal-goal-key' })
  await clock.settle()
  expect(await replyField(pane, 'goal')).toMatchObject({ props: { value: 'Pilot ready to announce' } })
  expect(w.paneOpens.at(-1)).toMatchObject({ id: 'inbox', focus: true })
  expect(w.paneOpens.at(-1)?.closeOnEscape).toBeUndefined()
  expect(await pane.find({ key: 'goal-text' })).toBeUndefined()
  expect(await pane.find({ key: 'type-goal-goal' })).toBeUndefined()
  expect((await pane.find({ key: 'goal-label' }))?.text).toBe('Goal')
  await pane.press({ key: 'cancel-goal' })
  await clock.settle()
  expect(await replyField(pane, 'goal')).toBeUndefined()
  expect((await pane.find({ key: 'goal-text' }))?.text.replaceAll('\u00a0', ' ')).toBe(
    'Pilot ready to announce · 1 of 2 done',
  )
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
