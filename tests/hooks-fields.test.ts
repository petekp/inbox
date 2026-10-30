import { expect, mock, test } from 'claude-code/testing'
import { PRESS_GUARD_MS } from '../hooks/view'
import { w, world } from './hooks-world'
import { PANE, selectRow, replyField, replyKey } from './hooks-helpers'

test('t opens a field for the person’s own words: a question’s words go to Claude, which closes it once they answer it, and a reply hands a finding to Claude', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })

  const pane = await $.ui.mount(PANE)
  expect(await replyField(pane, 'i1')).toBeUndefined()
  await pane.press({ key: 'typekey-i1' })
  await pane.input({ key: await replyKey(pane, 'i1'), text: ' ' })
  await clock.settle()
  expect(await replyField(pane, 'i1')).toBeDefined()
  await pane.press({ key: 'send-i1' })
  await clock.settle()
  expect(await replyField(pane, 'i1')).toBeDefined()
  await pane.input({ key: await replyKey(pane, 'i1'), text: 'Deno, actually', kind: 'change' })
  await pane.press({ key: 'cancel-i1' })
  expect(await replyField(pane, 'i1')).toBeUndefined()
  expect(w.sent).toEqual([])
  await selectRow(pane, 'i2')
  await selectRow(pane, 'i1')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i1' })
  expect((await replyField(pane, 'i1'))?.props.value).toBe('Deno, actually')
  await pane.press({ key: 'send-i1' })
  expect(w.sent.at(-1)).toBe('Re "Use Node or Python?": Deno, actually')
  expect((await pane.find({ key: 'row-i1' }))?.text).toMatch(/^Use Node or Python\?\s·\s✓ Replied/)
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'i1', answer: 'Deno' } as never)
  await clock.settle()
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()

  await pane.press({ key: 'tab-findings' })
  await pane.press({ key: 'typekey-f3' })
  await pane.input({ key: await replyKey(pane, 'f3'), text: 'Fix it after the CLI ships.' })
  expect(w.sent.at(-1)).toBe(
    'About this finding you recorded:\nIssue: README is stale\nIt names the old command.\n\nFix it after the CLI ships.',
  )
  await clock.settle()
  expect(await pane.find({ text: /Replied/ })).toBeDefined()
  await clock.advance(9000)
  expect(await pane.find({ text: /README is stale/ })).toBeDefined()
})

test('Escape in a reply field closes the field and keeps the pane and the draft', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))
  w.paneState = { isShown: true, isFocused: false }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'typekey-i1' })
  await pane.input({ key: await replyKey(pane, 'i1'), text: 'Deno, actually', kind: 'change' })
  await clock.settle()
  expect(w.paneOpens.at(-1)?.closeOnEscape).toBeUndefined()

  await pane.redraw({ ...PANE.props, isFocused: false })
  await clock.settle()
  expect(await replyField(pane, 'i1')).toBeUndefined()
  expect(await pane.find({ key: 'row-i1' })).toBeDefined()
  expect(w.paneOpens.at(-1)).toMatchObject({ id: 'inbox', closeOnEscape: true })
  expect(w.paneOpens.at(-1)?.focus).toBeUndefined()

  await pane.redraw({ ...PANE.props, isFocused: true })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i1' })
  expect((await replyField(pane, 'i1'))?.props.value).toBe('Deno, actually')
  expect(w.sent).toEqual([])
})

test('a reply field that opens without the keys says to click it, until it has them', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: false }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()

  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: false } })
  await pane.press({ key: 'typekey-i1' })
  await clock.settle()
  expect(await replyField(pane, 'i1')).toBeDefined()
  expect(await pane.find({ text: 'Click the field to type' })).toBeDefined()

  await pane.redraw({ ...PANE.props, isFocused: true })
  await clock.settle()
  expect(await replyField(pane, 'i1')).toBeDefined()
  expect(await pane.find({ text: 'Click the field to type' })).toBeUndefined()
})

test('a press on a question Claude closed since the draw sends nothing and says so', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const close = (id: string) => () => $.tool.call({ tool: 'mcp__inbox__close', id, reason: 'settled in chat' } as never)
  const pane = await $.ui.mount(PANE)
  const stale = /^This changed before your press\. Nothing was sent\.$/

  w.beforeAct = close('i1')
  await pane.press({ key: 'answer-i1-0' })
  expect(w.sent).toEqual([])
  expect(await pane.find({ text: stale })).toBeDefined()
  await clock.advance(9000)
  expect(await pane.find({ text: stale })).toBeUndefined()
})
