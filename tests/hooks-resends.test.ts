import { expect, mock, test } from 'claude-code/testing'
import { PRESS_GUARD_MS, QUEUED_AFTER_MS } from '../hooks/timing'
import { w, arrive, arriveFirst, world } from './hooks-world'
import { PANE, SAVED_SESSION } from './hooks-helpers'

test('a press resent after the app quit with its first delivery lost reads as delivered once Claude gets it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const explain =
    'Remind me what this question you asked me is about: why it came up, what each choice would do, and which you would pick. Keep it under 80 words of plain language, not counting a diagram: no jargon, and name each thing by what it does. Call each choice by its name as listed. When a small ASCII diagram would show it faster than words, such as steps in order or a before-and-after, put one in a code block in your reply. Don\'t act on it yet.\n"Use Node or Python?"\nOptions: Node / Python'
  w.stored.set(
    's:session-1',
    JSON.stringify({
      ...SAVED_SESSION,
      lastActions: {
        i1: {
          kind: 'talk',
          action: 'explain',
          text: 'Explain',
          at: 900_000,
          delivery: { state: 'unconfirmed', message: explain, id: 'lost' },
        },
      },
      sent: [
        {
          text: explain,
          press: { id: 'i1', action: 'explain' },
          at: 900_000,
          row: 'i1',
          pressedAt: 900_000,
          deliveryId: 'lost',
          phase: 'attempting',
        },
      ],
    }),
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Not\s+confirmed:\s+Explain/ })).toBeDefined()

  await pane.press({ key: 'explain-i1-key' })
  await clock.settle()
  expect(w.sent.at(-1)).toBe(explain)
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /Explaining…/ })).toBeDefined()
  expect(await pane.find({ text: /Not confirmed|Queued/ })).toBeUndefined()
})

test('a uniquely rewritten Claude prompt is confirmed when its row enters before submit returns', async ($, on) => {
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
  w.submitAnswer = { rewrite: 'Rewritten prompt' }
  await pane.press({ key: 'explain-i1-key' })
  await clock.settle()

  expect(await pane.find({ text: /Explaining…/ })).toBeDefined()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
})

test('two Claude sends rewritten to the same text are each confirmed by their own row when they run in turn', async ($, on) => {
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
  w.submitAnswer = { rewrite: 'Same rewritten prompt', hold: true }
  w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.advance(PRESS_GUARD_MS)
  w.submitAnswer = { rewrite: 'Same rewritten prompt', hold: true }
  w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()

  await arriveFirst($)
  await clock.settle()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
  await arrive($)
  await clock.settle()
  expect(await pane.find({ text: /Explaining…/ })).toBeDefined()
  expect(await pane.find({ text: /Not\s+confirmed/ })).toBeUndefined()
})

test('an older Claude send with no saved receipt cannot acknowledge a new identical press after reload', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let clearSent = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    if (!clearSent) return next(e)
    clearSent = false
    return next({ ...e, value: { ...e.value, sent: [] } })
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
  clearSent = true
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.advance(PRESS_GUARD_MS)
  w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()
  expect(w.held).toHaveLength(2)

  await arriveFirst($)
  await clock.settle()
  expect(await pane.find({ text: /Not\s+confirmed:\s+Explain/ })).toBeDefined()
  expect(await pane.find({ text: /✓\sExplained/ })).toBeUndefined()

  await arriveFirst($)
  await clock.settle()
  expect(await pane.find({ text: /Not\s+confirmed:\s+Explain/ })).toBeDefined()
})
