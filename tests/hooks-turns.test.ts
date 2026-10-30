import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { PRESS_GUARD_MS, SETTLED_MS, statusPage } from '../hooks/view'
import { w, world } from './hooks-world'
import { PANE, selectRow } from './hooks-helpers'

async function runStep($: Engine, index: number) {
  const stream = $.turn.step({ turnId: 't1', index, model: 'm', messageCount: 3 })
  for await (const _chunk of stream) void _chunk
  await stream.result
}

test('a turn runs from the main agent’s turn.start to its turn.complete, not for a subagent’s turn, a Done message waits for an interrupted turn to end, and a reload clears it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: Parameters<typeof statusPage>[0] | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  const now = async () => (session!.presence.isTurnRunning ? 'running' : null)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  w.ledgerReply = 'NEW: do | - | Sign in to npm | - | -'
  await $.prompt.submit({ text: 'publish it', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'publish it', turnId: 't1' })
  expect(await now()).toBe('running')
  await $.turn.complete({ answer: 'Sign in to npm.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(await now()).toBe(null)

  const pane = await $.ui.mount(PANE)
  await selectRow(pane, 'i1')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'done-i1' })
  await $.turn.start({ text: 'Look around the repo', turnId: 's1', agentId: 'a1' })
  await clock.settle()
  expect(await now()).toBe(null)
  await $.turn.start({ text: '', turnId: 't2' })
  await clock.advance(SETTLED_MS)
  expect(await now()).toBe('running')
  expect(w.sent).toEqual([])

  await $.turn.complete({ answer: '', durationMs: 5, isAborted: true, turnId: 't2', reason: 'aborted' })
  await clock.settle()
  expect(await now()).toBe(null)
  expect(w.sent).toEqual(['Done: Sign in to npm'])

  await $.turn.start({ text: '', turnId: 't3' })
  expect(await now()).toBe('running')
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(await now()).toBe(null)
})

test('a reply a step ends on before another step starts reaches the per-turn call, and the last answer is not counted twice', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  w.stepAnswers = [
    { answer: 'Fixed the parser. Should I also rename the helper?' },
    { answer: 'Linted. The parser is fixed.' },
  ]

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'fix the parser', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix the parser', turnId: 't1' })
  await runStep($, 0)
  await runStep($, 1)
  await $.turn.complete({
    answer: 'Linted. The parser is fixed.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  expect(prompts.at(-1)).toContain('Should I also rename the helper?')
  expect(prompts.at(-1)?.match(/Linted\. The parser is fixed\./g)).toHaveLength(1)
})

test('narration before a tool call is not a reply sent back', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  w.stepAnswers = [{ answer: 'Let me run the tests first.', callsTool: true }, { answer: 'All tests pass.' }]

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'fix the parser', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix the parser', turnId: 't1' })
  await runStep($, 0)
  await runStep($, 1)
  await $.turn.complete({
    answer: 'All tests pass.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  expect(prompts.at(-1)).not.toContain('Let me run the tests first.')
})
