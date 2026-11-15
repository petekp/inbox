import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { w, world } from './hooks-world'
import { PANE, replyField, replyKey } from './hooks-helpers'
import { NO_GOAL_TEXT } from '../hooks/status-goal-page'

const INFERRING = [
  'HEAD: Pilot | Shipping the pilot',
  'NEW: working | Fixes | built',
  'NEW: queued | Announcement | not started',
  'GOAL: Pilot ready to announce | done Fixes built; queued Announced',
].join('\n')

async function statusShown($: Engine, on: On) {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
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

test('a goal the Status call writes shows at once under the Goal heading with its milestones, Edit and Remove draw at the right end of the heading row, the head draws as its Now line, and nothing is sent', async ($, on) => {
  const { pane } = await statusShown($, on)

  expect((await pane.find({ key: 'goal-heading' }))?.text).toMatch(/^Goal ─+e: Edit · r: Remove$/)
  expect((await pane.find({ key: 'type-goal-goal' }))?.text).toBe('e: Edit')
  expect((await pane.find({ key: 'remove-goal-goal' }))?.text).toBe('r: Remove')
  expect((await pane.find({ key: 'goal-text' }))?.text.replaceAll('\u00a0', ' ')).toBe(
    'Pilot ready to announce · 1 of 2 done',
  )
  expect((await pane.find({ key: 'goal-m1-name' }))?.text).toBe('Fixes built')
  expect((await pane.find({ key: 'goal-now' }))?.text).toBe('Now: Shipping the pilot')
  expect(await pane.find({ key: 'status-head' })).toBeUndefined()
  expect(w.sent).toEqual([])
})

test('Remove goal leaves the Goal heading with the line that says no goal is set and offers Undo, which brings the goal back, then New, which opens an empty goal field that sets the typed goal and waits for its milestones', async ($, on) => {
  const { clock, pane } = await statusShown($, on)

  await pane.press({ key: 'remove-goal-goal-key' })
  await clock.settle()
  expect(await pane.find({ key: 'goal-text' })).toBeUndefined()
  expect((await pane.find({ key: 'goal-heading' }))?.text).toMatch(/^Goal ─+u: Undo · n: New$/)
  expect((await pane.find({ key: 'goal-none' }))?.text).toBe(NO_GOAL_TEXT)
  expect(await pane.find({ key: 'status-head' })).toBeDefined()
  expect((await pane.find({ key: 'restore-goal-goal' }))?.text).toBe('u: Undo')
  const hotkeys = (await pane.findAll({ type: 'Button' })).flatMap(b => (b.props.hotkey ? [b.props.hotkey] : []))
  expect(hotkeys.filter(k => k === 'u')).toHaveLength(1)
  await pane.press({ key: 'restore-goal-goal-key' })
  await clock.settle()
  expect((await pane.find({ key: 'goal-m1-name' }))?.text).toBe('Fixes built')
  await pane.press({ key: 'remove-goal-goal-key' })
  await clock.settle()
  expect((await pane.find({ key: 'type-goal-goal' }))?.text).toBe('n: New')

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

test('in a narrow pane the goal’s buttons wrap under its heading’s rule, at the right edge, with nothing cut', async ($, on) => {
  const { clock, pane } = await statusShown($, on)
  await pane.unmount()
  const narrow = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 24 } })
  await narrow.press({ key: 'tab-key-overview' })
  await clock.settle()

  expect((await narrow.find({ key: 'goal-heading-title' }))?.text).toMatch(/^Goal ─+$/)
  expect((await narrow.find({ key: 'goal-heading-keys' }))?.text).toMatch(/Edit · (r: )?Remove$/)
  expect(await narrow.find({ key: 'goal-heading' })).toBeUndefined()
})

test('the goal’s Edit opens the field with the goal in it in place of the goal’s text, leaves the heading as Goal and gives the field the keys, and Cancel closes it and keeps the goal', async ($, on) => {
  const { clock, pane } = await statusShown($, on)

  await pane.press({ key: 'type-goal-goal-key' })
  await clock.settle()
  expect(await replyField(pane, 'goal')).toMatchObject({ props: { value: 'Pilot ready to announce' } })
  expect(w.paneOpens.at(-1)).toMatchObject({ id: 'inbox', focus: true })
  expect(w.paneOpens.at(-1)?.closeOnEscape).toBeUndefined()
  expect(await pane.find({ key: 'goal-text' })).toBeUndefined()
  expect(await pane.find({ key: 'type-goal-goal' })).toBeUndefined()
  expect((await pane.find({ key: 'goal-heading-title' }))?.text).toMatch(/^Goal ─+$/)
  await pane.press({ key: 'cancel-goal' })
  await clock.settle()
  expect(await replyField(pane, 'goal')).toBeUndefined()
  expect((await pane.find({ key: 'goal-text' }))?.text.replaceAll('\u00a0', ' ')).toBe(
    'Pilot ready to announce · 1 of 2 done',
  )
})

test('New on the empty Status page sets the typed goal before any Status call', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()

  expect((await pane.find({ key: 'type-goal-goal' }))?.text).toBe('n: New')
  await pane.press({ key: 'type-goal-goal-key' })
  await clock.settle()
  await pane.input({ key: await replyKey(pane, 'goal'), text: 'Greeting CLI on npm' })
  await clock.settle()
  expect((await pane.find({ key: 'goal-text' }))?.text).toBe('Greeting CLI on npm')
  expect((await pane.find({ key: 'goal-awaiting' }))?.text).toBe('Milestones after the next reply')
})
