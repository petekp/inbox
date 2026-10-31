import { expect, mock, test } from 'claude-code/testing'
import { PRESS_GUARD_MS, QUEUED_AFTER_MS } from '../hooks/timing'
import { w, arrive, arriveFirst, world } from './hooks-world'
import { BAND, PANE, selectRow, replyKey } from './hooks-helpers'

test('a press whose submit stays pending through a turn reads Queued instead of Not confirmed until the message runs', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))

  await $.session.start({ cwd: '/tmp/project', surface: 'desktop', isInteractive: true })
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

  w.submitAnswer = 'hold'
  w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
  expect(await pane.find({ text: /Queued:\sExplain$/ })).toBeDefined()

  await arrive($)
  await clock.settle()
  expect(await pane.find({ text: /Queued/ })).toBeUndefined()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
})

test('a press during a turn reads Queued until its prompt enters, and one that will not enter is undone with Not sent and [Try again]', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  on('ui.focus', () => ({}))
  let drafts: unknown = null
  on('state.set', { plugin: 'inbox', key: 'drafts' } as const, (_$, e, next) => {
    drafts = e.value
    return next(e)
  })

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
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })

  w.submitAnswer = 'hold'
  w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()
  expect(await pane.find({ text: /Queued/ })).toBeUndefined()
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /^Queued:\sExplain$/ })).toBeDefined()
  await selectRow(pane, 'i2')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i2' })
  w.inFlight.push(pane.input({ key: await replyKey(pane, 'i2'), text: 'yes' }))
  await clock.settle()
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /Queued:\sReply/ })).toBeDefined()
  await arrive($)
  await clock.settle()
  await selectRow(pane, 'i1')
  expect(await pane.find({ text: /^Explaining…$/ })).toBeDefined()
  expect(await pane.find({ text: /Queued/ })).toBeUndefined()

  w.submitAnswer = { drop: 'a hook refused it' }
  await selectRow(pane, 'i1')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i1' })
  await pane.input({ key: await replyKey(pane, 'i1'), text: 'Deno, actually' })
  await clock.settle()
  expect(w.sent.at(-1)).toBe('Re "Use Node or Python?": Deno, actually')
  expect(await pane.find({ key: 'row-i1' })).toBeDefined()
  expect(drafts).toEqual({ i1: { text: 'Deno, actually', since: expect.any(Number) } })
  await pane.press({ key: 'answer-i1-0' })
  await clock.settle()
  expect(w.sent.at(-1)).toBe('Re "Use Node or Python?": Node')
  expect(await pane.find({ key: 'row-i1' })).toBeDefined()
  expect(await pane.find({ text: 'Not sent: a hook refused it' })).toBeDefined()
  expect(await band.find({ text: /Asks 1/ })).toBeDefined()
  expect((await pane.find({ key: 'answer-i1-0-key' }))?.props.label).toBe('Node (recommended)')

  w.submitAnswer = 'enter'
  const next = await $.prompt.submit({ text: 'carry on', wait: false, origin: { kind: 'composer' } })
  expect(next.context?.join('\n') ?? '').not.toMatch(/→ (Node|Deno)/)
  await $.turn.complete({ answer: 'Carrying on.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(prompts.at(-1)).toContain('carry on\n</person>')
  expect(prompts.at(-1)).not.toContain('Re "Use Node or Python?"')

  await pane.press({ key: 'retry-i1' })
  await clock.settle()
  expect(w.sent.at(-1)).toBe('Re "Use Node or Python?": Node')
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
})

test('a reply another plugin rewrote to the text of a pending press reads Not confirmed and keeps its draft', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))
  let drafts: unknown = null
  on('state.set', { plugin: 'inbox', key: 'drafts' } as const, (_$, e, next) => {
    drafts = e.value
    return next(e)
  })

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
  w.submitAnswer = 'hold'
  w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()
  await selectRow(pane, 'i2')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i2' })
  w.submitAnswer = { rewrite: w.held[0]!.text }
  await pane.input({ key: await replyKey(pane, 'i2'), text: 'greet is fine' })
  await clock.settle()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeDefined()
  expect(drafts).toEqual({ i2: { text: 'greet is fine', since: expect.any(Number) } })
  await arrive($)
})

test('a second Explain press while the first is out sends nothing, and the first reads Explaining… once it enters', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

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
  w.submitAnswer = 'hold'
  w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.advance(PRESS_GUARD_MS)
  expect((await pane.find({ key: 'explain-i1' }))?.props.dimColor).toBe(true)
  w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()
  expect(w.held).toHaveLength(1)

  await arriveFirst($)
  await clock.settle()
  expect(await pane.find({ text: /Explaining…/ })).toBeDefined()
  expect(await pane.find({ text: /Not confirmed/ })).toBeUndefined()
})
