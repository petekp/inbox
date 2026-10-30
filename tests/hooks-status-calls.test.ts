import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Session } from '../types'
import { STATUS_REFRESH_MS } from '../hooks/session'
import { w, LEDGER_REPLY, world } from './hooks-world'

const replyWithStatus = async ($: Engine, on: On, answer: string | null | string[], ledgerAnswer = LEDGER_REPLY) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.statusReply = answer
  w.ledgerReply = ledgerAnswer
  let session: Pick<Session, 'ledger' | 'overviewFailure'> | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. Node or Python?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()

  return session!
}

test('a reply’s Status comes from the separate Status call, after the ledger update', async ($, on) => {
  const { ledger } = await replyWithStatus(
    $,
    on,
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name\nNEW: working | Plan | Planning',
  )

  expect(ledger.overview?.head?.title).toBe('Adding a greeting CLI')
  expect(ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?', 'Name the command greet?'])
  expect(w.statusPrompts).toHaveLength(1)
})

test('a failed Status call leaves the ledger update applied and no Status, and saves that it gave no answer', async ($, on) => {
  const { ledger, overviewFailure } = await replyWithStatus($, on, null)

  expect(ledger.overview).toBeNull()
  expect(ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?', 'Name the command greet?'])
  expect(w.statusPrompts).toHaveLength(1)
  expect(overviewFailure).toMatchObject({ cause: 'no-answer', answer: null })
})

test('a Status answer that holds prose is asked once more, and the second answer applies', async ($, on) => {
  const { ledger, overviewFailure } = await replyWithStatus($, on, [
    'The person wants a CLI.\nHEAD: Adding a greeting CLI | Building a CLI that greets by name',
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name',
  ])

  expect(w.statusPrompts).toHaveLength(2)
  expect(ledger.overview?.head?.title).toBe('Adding a greeting CLI')
  expect(overviewFailure).toBeNull()
})

test('a Status call that answers with prose twice writes nothing and saves its second answer', async ($, on) => {
  const { ledger, overviewFailure } = await replyWithStatus($, on, ['The person wants a CLI.', 'Still prose.'])

  expect(w.statusPrompts).toHaveLength(2)
  expect(ledger.overview).toBeNull()
  expect(overviewFailure).toMatchObject({ cause: 'refused', answer: 'Still prose.' })
})

test('a Status answer of UNCHANGED leaves the last Status as it was', async ($, on) => {
  const { ledger } = await replyWithStatus($, on, 'UNCHANGED')

  expect(ledger.overview).toBeNull()
})

test('a ledger update shows before its Status call returns', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: { ledger: { overview: { head: { title: string } | null } | null; items: { id: string }[] } } | null =
    null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'Noted.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  w.ledgerReply = 'NEW: decide | 1 | Use Node or Python? | Node / Python | Node'
  await reply('add a greeting cli', 't1')

  let release: () => void = () => undefined
  w.statusHold = new Promise<void>(resolve => (release = resolve))
  w.statusReply = 'HEAD: Scaffolding the command | Laying out the greet command'
  w.ledgerReply = 'CLOSED: i1 | Node chosen'
  await reply('use node', 't2')

  expect(session!.ledger.items).toEqual([])
  expect(session!.ledger.overview).toBeNull()
  expect(w.statusPrompts.at(-1)).not.toContain('Use Node or Python?')
  release()
  await clock.settle()
  expect(session!.ledger.overview?.head?.title).toBe('Scaffolding the command')
})

test('a turn past the wait runs the Status call on its work so far at its next tool call, once, and no ledger call until the reply', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  w.statusReply = 'HEAD: Adding a greeting CLI | Building a CLI that greets by name'
  let session: Pick<Session, 'ledger'> | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls', description: 'ls' } as never)
  await clock.settle()
  expect(w.statusPrompts).toEqual([])

  await clock.advance(STATUS_REFRESH_MS)
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'npm test' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm run build', description: 'build' } as never)
  await clock.settle()
  expect(w.statusPrompts).toHaveLength(1)
  expect(w.statusPrompts[0]).toContain('npm test')
  expect(w.statusPrompts[0]).not.toContain('<reply>')
  expect(prompts).toEqual([])
  expect(session!.ledger.overview?.head?.title).toBe('Adding a greeting CLI')
})

test('a ledger call that gives no usable answer runs no Status call', async ($, on) => {
  const { ledger } = await replyWithStatus(
    $,
    on,
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name',
    'not a ledger',
  )

  expect(w.statusPrompts).toEqual([])
  expect(ledger.overview).toBeNull()
})

test('the next ledger update does not wait for an earlier Status call, and Status calls run one at a time', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: { ledger: { overview: { head: { title: string } | null } | null; items: { ask: string }[] } } | null =
    null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'Noted.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  let release: () => void = () => undefined
  w.statusHold = new Promise<void>(resolve => (release = resolve))
  w.statusReply = 'HEAD: Scaffolding the command | Laying out the greet command'
  w.ledgerReply = 'NEW: do | - | Water the plants | - | -'
  await reply('add a greeting cli', 't1')
  w.ledgerReply = 'NEW: do | - | Feed the cat | - | -'
  await reply('and a name', 't2')

  expect(session!.ledger.items.map(i => i.ask)).toEqual(['Water the plants', 'Feed the cat'])
  expect(w.statusPrompts).toHaveLength(1)
  release()
  await clock.settle()
  expect(w.statusPrompts).toHaveLength(2)
  expect(w.statusPrompts[1]).toContain('<head>\nScaffolding the command | Laying out the greet command\n</head>')
})

test('a mid-turn Status call still out when its turn ends writes first, and the reply’s Status call reads that write and writes last', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: Pick<Session, 'ledger'> | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await clock.advance(STATUS_REFRESH_MS)
  let release: () => void = () => undefined
  w.statusHold = new Promise<void>(resolve => (release = resolve))
  w.statusReply = [
    'HEAD: Planning the CLI | Planning a CLI that greets by name',
    'HEAD: Building the CLI | Building a CLI that greets by name',
  ]
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'npm test' } as never)
  await clock.settle()
  expect(w.statusPrompts).toHaveLength(1)

  await $.turn.complete({ answer: 'Built it.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(session!.ledger.items.map(i => i.ask)).toEqual(['Use Node or Python?', 'Name the command greet?'])
  expect(w.statusPrompts).toHaveLength(1)
  release()
  await clock.settle()

  expect(w.statusPrompts).toHaveLength(2)
  expect(w.statusPrompts[1]).toContain('<reply>')
  expect(w.statusPrompts[1]).toContain('<head>\nPlanning the CLI | Planning a CLI that greets by name\n</head>')
  expect(session!.ledger.overview?.head?.title).toBe('Building the CLI')
})

test('a Status answer that lands after /clear goes to the conversation it was for, and the new conversation keeps an empty Status', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: Pick<Session, 'ledger'> | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  let release: () => void = () => undefined
  w.statusHold = new Promise<void>(resolve => (release = resolve))
  w.statusReply =
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name\nNEW: working | Plan | being written'
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(w.statusPrompts).toHaveLength(1)

  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await clock.settle()
  release()
  await clock.settle()

  expect(session!.ledger.overview).toBeNull()
  expect(w.stored.has('s:session-2')).toBe(false)
  expect(JSON.parse(w.stored.get('s:session-1') ?? '{}').ledger.overview?.head?.title).toBe('Adding a greeting CLI')
})
