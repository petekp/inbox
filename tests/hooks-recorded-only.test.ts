import { expect, mock, test } from 'claude-code/testing'
import { world } from './hooks-world'
import { BAND } from './hooks-helpers'

const turn = { durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as const

test('with INBOX_RECORDED_ITEMS_ONLY=1, a reply whose questions Claude did not record adds no ask', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts, { INBOX_RECORDED_ITEMS_ONLY: '1' })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ ...turn, answer: 'Plan ready. 1. Node or Python? 2. Call it greet?' })
  await clock.settle()

  expect(prompts.length).toBe(1)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Asks \d/ })).toBeUndefined()
})

test('without it, the same reply adds the asks the inbox model found', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ ...turn, answer: 'Plan ready. 1. Node or Python? 2. Call it greet?' })
  await clock.settle()

  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Asks 2/ })).toBeDefined()
})
