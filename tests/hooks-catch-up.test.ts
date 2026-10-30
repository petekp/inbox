import { expect, mock, test } from 'claude-code/testing'
import type { Session } from '../types'
import { PRESS_GUARD_MS } from '../hooks/view'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

test('resumed into a conversation it cannot fork yet, it catches up from the transcript before any reply', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  on('session.turns', () => ({ value: 3 }))
  on('model.fork', () => ({ value: { isAnswered: false as const, reason: 'nothing-to-fork' as const } }))
  const said = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] as never[] })
  w.transcriptRows = [
    said('user', 'Add a greeting CLI. Node or Python?'),
    said('user', 'inbox: what waits on the user, as of your last reply. Anything not listed here is closed.'),
    said('assistant', 'The plan is written. 1. Node or Python? 2. Name the command greet?'),
  ]

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const conversation = prompts.at(-1)?.match(/<conversation>\n([\s\S]*?)\n<\/conversation>/)?.[1]
  expect(conversation).toBe(
    'Person: Add a greeting CLI. Node or Python?\nAgent: The plan is written. 1. Node or Python? 2. Name the command greet?',
  )
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  expect(await pane.find({ text: /update failed/ })).toBeUndefined()
})

test('a catch-up writes its Status with a separate call over the transcript', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.statusReply =
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name\nNEW: queued | Command | named greet'
  let session: {
    ledger: { overview: { head: { title: string } | null; subjects: { name: string; status: string }[] } | null }
  } | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  on('session.turns', () => ({ value: 3 }))
  on('model.fork', () => ({
    value: {
      isAnswered: true,
      text: 'NONE',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))
  const said = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] as never[] })
  w.transcriptRows = [
    said('user', 'Add a greeting CLI.'),
    said('assistant', 'The plan is written. Command named greet.'),
  ]

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()

  expect(session!.ledger.overview).toMatchObject({
    head: { title: 'Adding a greeting CLI' },
    subjects: [{ name: 'Command', status: 'queued' }],
  })
  expect(w.statusPrompts.at(-1)).toContain('<conversation>\nPerson: Add a greeting CLI.')
})

test('a catch-up’s Status call waits for a failing Status call still out, and its answer clears the failure that call saved', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const failureCauses: (string | null)[] = []
  let session: Pick<Session, 'ledger' | 'overviewFailure'> | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    const written: Pick<Session, 'ledger' | 'overviewFailure'> = e.value as never
    session = written
    failureCauses.push(written.overviewFailure?.cause ?? null)
    return next(e)
  })
  on('model.fork', () => ({
    value: {
      isAnswered: true,
      text: 'NONE',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))
  const said = (role: 'user' | 'assistant', text: string) => ({ role, text, toolUses: [] as never[] })
  w.transcriptRows = [
    said('user', 'Add a greeting CLI.'),
    said('assistant', 'The plan is written. Command named greet.'),
  ]
  const reply = async (answer: string, turnId: string) => {
    await $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({ answer, durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  let release: () => void = () => undefined
  w.statusHold = new Promise<void>(resolve => (release = resolve))
  w.statusReply = [
    'The plan is written.',
    'Still prose.',
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name',
  ]
  await reply('Plan ready.', 't1')
  w.ledgerReply = 'not a ledger'
  await reply('Using Node.', 't2')
  await reply('Named it greet.', 't3')
  expect(w.statusPrompts).toHaveLength(1)

  release()
  await clock.settle()
  expect(w.statusPrompts).toHaveLength(3)
  expect(w.statusPrompts[2]).toContain('<conversation>\nPerson: Add a greeting CLI.')
  expect(failureCauses).toContain('refused')
  expect(failureCauses.at(-1)).toBeNull()
  expect(session!.ledger.overview?.head?.title).toBe('Adding a greeting CLI')
})

test('after a failed update, the next reply catches up over the whole conversation', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  on('model.fork', () => ({
    value: {
      isAnswered: true,
      text: 'CLOSED: i1 | Node\nFIXED: f3 | fixed\nNEW: do | - | Review the welcome copy | - | -',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  expect(await pane.find({ text: 'now' })).toBeDefined()
  expect(await pane.find({ key: 'explain-i2-key' })).toBeUndefined()
  await pane.press({ key: 'next' })
  expect(await pane.find({ key: 'explain-i2-key' })).toBeDefined()
  await pane.press({ key: 'previous' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'explain-i1-key' })
  expect(w.sent.at(-1)).toContain('"Use Node or Python?"\nOptions: Node / Python')
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()

  w.ledgerReply = 'not a ledger'
  await $.turn.complete({ answer: 'Using Node.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(await pane.find({ text: /update failed/ })).toBeDefined()
  await $.turn.complete({
    answer: 'Fixed the README too.',
    durationMs: 5,
    isAborted: false,
    turnId: 't3',
    reason: 'answer',
  })
  await clock.settle()
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  expect(await pane.find({ text: /^Use Node or Python\?$/ })).toBeDefined()
  expect(await pane.find({ text: /^Node$/ })).toBeDefined()
  expect(await pane.find({ text: /Name the command greet\?/ })).toBeDefined()
  expect(await pane.find({ text: /Review the welcome copy/ })).toBeDefined()
  expect(await pane.find({ text: /update failed/ })).toBeUndefined()
  await clock.advance(1)
  await pane.press({ key: 'tab-findings' })
  await clock.settle()
  expect(await pane.find({ key: 'row-f3' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-f3' })).toBeUndefined()
  expect((await pane.find({ key: 'fold-issue' }))?.props.label).toBe('▸ 1 closed')
})

test('a reload that cuts off the end-of-turn hook catches up on load, and a subagent’s turn leaves nothing to catch up', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let forks = 0
  on('model.fork', () => {
    forks++
    return {
      value: {
        isAnswered: true,
        text: 'NEW: decide | - | Push the branch to origin? | yes / no | yes',
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const updates = forks
  await $.turn.start({ text: 'Look around the repo', turnId: 's1', agentId: 'a1' })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(forks).toBe(updates)

  await $.turn.start({ text: '', turnId: 't2' })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Push the branch to origin\?/ })).toBeDefined()
})
