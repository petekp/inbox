import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { Session } from '../types'
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

test('once a call from its source raised a Post hook, a call that raised none adds no activity line, a call that ran or failed does, and so does a call to a tool another mod answers, which raises none', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('tool.call', { tool: 'mcp__othermod__ping' as never }, () => ({ result: 'pong' }) as never)
  world($, on, [])
  w.raisesPostHooks = true
  let activity: string[] = []
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    activity = (e.value as Session).turn.activity
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'run the checks', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'run the checks', turnId: 't1' })
  const bash = (command: string, use: string) =>
    $.tool.call({ tool: 'Bash', command, description: command, tool_use_id: use } as never)

  await bash('echo probe-ok', 'ok')
  w.toolVerdict = 'deny'
  await bash('echo probe-denied', 'denied')
  w.toolVerdict = 'allow'
  w.otherToolAnswer = { result: 'Exit code 1', text: 'Exit code 1', isError: true }
  await bash('false', 'failed')
  await $.tool.call({ tool: 'mcp__othermod__ping', tool_use_id: 'mod' } as never)

  expect(activity).toEqual(['ran: echo probe-ok', 'ran: false', 'called othermod__ping'])
})

test('where no Post hook runs, as under the guard, every call adds its activity line', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let activity: string[] = []
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    activity = (e.value as Session).turn.activity
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'run the checks', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'run the checks', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'npm test', tool_use_id: 'u1' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/tmp/project/a.ts', content: '', tool_use_id: 'u2' } as never)

  expect(activity).toEqual(['ran: npm test', 'edited /tmp/project/a.ts'])
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

test('text a step writes before its tool calls reaches the per-turn call ahead of the final answer', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  w.stepAnswers = [
    { answer: 'The parser is fixed. Should I also rename the helper?', callsTool: true },
    { answer: 'Saved the notes.' },
  ]

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'fix the parser', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix the parser', turnId: 't1' })
  await runStep($, 0)
  await runStep($, 1)
  await $.turn.complete({
    answer: 'Saved the notes.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  expect(prompts.at(-1)).toContain('The parser is fixed. Should I also rename the helper?\n\nSaved the notes.')
})

test('a turn whose last step wrote nothing reaches the per-turn call with its earlier text', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  w.stepAnswers = [{ answer: 'Should I push the fix?', callsTool: true }, { answer: '' }]

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'fix the parser', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'fix the parser', turnId: 't1' })
  await runStep($, 0)
  await runStep($, 1)
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(prompts.at(-1)).toContain('Should I push the fix?')
})

test('text from an interrupted turn stays out of the next turn’s per-turn call', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'check the old build', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'check the old build', turnId: 't1' })
  w.stepAnswers = [{ answer: 'Checking the old build.', callsTool: true }]
  await runStep($, 0)
  await $.turn.complete({ answer: '', durationMs: 5, isAborted: true, turnId: 't1', reason: 'aborted' })
  await $.prompt.submit({ text: 'never mind, fix the parser', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'never mind, fix the parser', turnId: 't2' })
  w.stepAnswers = [{ answer: 'The parser is fixed.' }]
  await runStep($, 0)
  await $.turn.complete({
    answer: 'The parser is fixed.',
    durationMs: 5,
    isAborted: false,
    turnId: 't2',
    reason: 'answer',
  })
  await clock.settle()
  expect(prompts.at(-1)).toContain('The parser is fixed.')
  expect(prompts.at(-1)).not.toContain('Checking the old build.')
})
