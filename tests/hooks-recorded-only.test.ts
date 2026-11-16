import { expect, mock, test } from 'claude-code/testing'
import { w, world } from './hooks-world'
import { BAND } from './hooks-helpers'

const turn = { durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' } as const

test('with INBOX_RECORDED_ITEMS_ONLY=1, a reply whose questions Claude did not record adds no ask', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts, { INBOX_RECORDED_ITEMS_ONLY: '1' })
  w.ledgerReply = [
    'NEW: decide | - | Which runtime should greet use? | Node / Python | Node | - | I recommend Node for the runtime.',
    'NEW: decide | - | Should the command be greet or hello? | greet / hello | greet | - | We should choose whether the command is greet or hello.',
  ].join('\n')

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'question',
    ask: 'Which runtime should greet use?',
    options: ['Node', 'Python'],
  } as never)
  await $.turn.complete({
    ...turn,
    answer: 'I recommend Node for the runtime. We should choose whether the command is greet or hello.',
  })
  await clock.settle()

  expect(prompts.length).toBe(1)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: 'Asks 1' })).toBeDefined()

  const next = await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })
  const context = next.context?.join('\n') ?? ''
  expect(context).toContain('Possibly unrecorded decisions in your last reply:')
  const candidateBlock =
    context.split('Possibly unrecorded decisions in your last reply:')[1]?.split('\nThe /inbox')[0] ?? ''
  expect(candidateBlock).toContain('Should the command be greet or hello?')
  expect(candidateBlock).toContain('We should choose whether the command is greet or hello.')
  expect(candidateBlock).not.toContain('Which runtime should greet use?')

  const following = await $.prompt.submit({ text: 'continue again', wait: false, origin: { kind: 'composer' } })
  expect(following.context?.join('\n') ?? '').not.toContain('Possibly unrecorded decisions in your last reply:')
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
