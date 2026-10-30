import { expect, mock, test } from 'claude-code/testing'
import type { Session } from '../types'
import { w, world } from './hooks-world'
import { SAVED_SESSION } from './hooks-helpers'

test('tool calls during a turn leave the saved session alone, and the turn’s update saves it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let saves = 0
  w.storeSetHold = async key => {
    if (key === 's:session-1') saves++
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await clock.settle()
  const savesAtStart = saves
  for (const command of ['ls', 'cat package.json', 'npm test'])
    await $.tool.call({ tool: 'Bash', command, description: command } as never)
  await clock.settle()
  expect(saves).toBe(savesAtStart)

  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(saves).toBeGreaterThan(savesAtStart)
  expect(JSON.parse(w.stored.get('s:session-1')!).presence.turnsApplied).toBe(1)
})

test('a failed first save keeps the prior saved session intact', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const prior = JSON.stringify(SAVED_SESSION)
  w.stored.set('s:session-1', prior)
  w.storeSetRefusal = 'store unavailable'
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'new request', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'New reply.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(w.stored.get('s:session-1')).toBe(prior)
})

test('a save that meets a held store lock waits, and the turn’s update still lands', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: Pick<Session, 'ledger'> | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  w.storeSetLockHeld = 1
  const completing = $.turn.complete({
    answer: 'Plan ready.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.advance(5_000)
  await completing
  await clock.settle()

  const asks = ['Use Node or Python?', 'Name the command greet?']
  expect(w.storeSetLockHeld).toBe(0)
  expect(session!.ledger.items.map(i => i.ask)).toEqual(asks)
  expect((JSON.parse(w.stored.get('s:session-1')!) as Session).ledger.items.map(i => i.ask)).toEqual(asks)
  expect(w.logged).toEqual([])
})

test('when the store lock stays held, the update still shows and the next save writes it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: Pick<Session, 'ledger'> | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  const before = w.stored.get('s:session-1')
  w.storeSetLockHeld = Infinity
  const completing = $.turn.complete({
    answer: 'Plan ready.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.advance(60_000)
  await completing
  await clock.settle()

  const asks = ['Use Node or Python?', 'Name the command greet?']
  expect(session!.ledger.items.map(i => i.ask)).toEqual(asks)
  expect(w.stored.get('s:session-1')).toBe(before)
  expect(w.logged.length).toBeGreaterThan(0)
  expect(w.logged.every(line => line.includes('Lock file is already being held'))).toBe(true)

  w.storeSetLockHeld = 0
  w.ledgerReply = 'NONE'
  await $.prompt.submit({ text: 'go on', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Done.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect((JSON.parse(w.stored.get('s:session-1')!) as Session).ledger.items.map(i => i.ask)).toEqual(asks)
})

test('session pruning uses saved time and retains records whose age cannot be read', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.stored.set('s:unknown', JSON.stringify({ savedAt: 'unknown', ledger: SAVED_SESSION.ledger }))
  for (let n = 3; n <= 40; n++)
    w.stored.set(`s:prior-${n}`, JSON.stringify({ savedAt: n, ledger: SAVED_SESSION.ledger }))
  w.stored.set('s:prior-1', JSON.stringify({ savedAt: 1, ledger: SAVED_SESSION.ledger }))
  w.stored.set('s:prior-2', JSON.stringify({ savedAt: 2, ledger: SAVED_SESSION.ledger }))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'new request', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'New reply.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(w.stored.has('s:prior-1')).toBe(false)
  expect(w.stored.has('s:prior-2')).toBe(false)
  expect(w.stored.has('s:prior-3')).toBe(true)
  expect(w.stored.has('s:unknown')).toBe(true)
  expect(w.stored.has('s:session-1')).toBe(true)
})

test('a ledger write committed before clear still saves to its original session', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let entered!: () => void
  let release!: () => void
  const afterWrite = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async (_$, e, next) => {
    const result = await next(e)
    if (e.value.ledger.findings.some((f: { title: string }) => f.title === 'Late finding')) {
      entered()
      await held
    }
    return result
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'old request', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Old reply.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const adding = $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Late finding',
    detail: 'Late detail.',
  })
  await afterWrite
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  release()
  await adding
  await clock.settle()
  expect(
    JSON.parse(w.stored.get('s:session-1') ?? '{}').ledger.findings.map((f: { title: string }) => f.title),
  ).toContain('Late finding')
})

test('the latest committed ledger wins when an older write completes afterward', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let entered!: () => void
  let release!: () => void
  const afterWrite = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async (_$, e, next) => {
    const result = await next(e)
    const titles = e.value.ledger.findings.map((f: { title: string }) => f.title)
    if (titles.includes('First finding') && !titles.includes('Second finding')) {
      entered()
      await held
    }
    return result
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const first = $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'First finding',
    detail: 'First.',
  })
  await afterWrite
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Second finding',
    detail: 'Second.',
  })
  release()
  await first
  await clock.settle()
  expect(
    JSON.parse(w.stored.get('s:session-1') ?? '{}').ledger.findings.map((f: { title: string }) => f.title),
  ).toEqual(['First finding', 'Second finding'])
})
