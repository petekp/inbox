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

async function heldStatusAfterClear(
  $: Parameters<typeof world>[0],
  on: Parameters<typeof world>[1],
  heads = ['Adding a greeting CLI'],
) {
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
  w.statusReply = heads.map(head => `HEAD: ${head} | Building a CLI that greets by name`)
  for (const [n, head] of heads.entries()) {
    await $.prompt.submit({ text: head, wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({ answer: 'Noted.', durationMs: 5, isAborted: false, turnId: `t${n}`, reason: 'answer' })
    await clock.settle()
  }
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await clock.settle()
  w.storeLockedKey = 's:session-1'
  release()
  await clock.advance(3_000)

  return { clock, drawn: () => session!, savedHead: () => storedHead('s:session-1') }
}

const storedHead = (key: string) => JSON.parse(w.stored.get(key) ?? '{}').ledger?.overview?.head?.title

test('a write to a conversation off screen that meets a held lock lands in the background, and drawn saves go on meanwhile', async ($, on) => {
  const { clock, savedHead } = await heldStatusAfterClear($, on)
  expect(savedHead()).toBeUndefined()
  expect(w.logged.filter(line => line.includes('session-1 waits for the store lock'))).toHaveLength(1)

  w.ledgerReply = 'NEW: do | - | Water the plants | - | -'
  await $.prompt.submit({ text: 'water the plants', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Noted.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(JSON.parse(w.stored.get('s:session-2')!).ledger.items.map((i: { ask: string }) => i.ask)).toEqual([
    'Water the plants',
  ])
  expect(savedHead()).toBeUndefined()

  w.storeLockedKey = undefined
  await clock.advance(10_000)
  await clock.settle()
  expect(savedHead()).toBe('Adding a greeting CLI')
})

test('a later write to a conversation whose write is held runs after it, and both land in order', async ($, on) => {
  const { clock, savedHead } = await heldStatusAfterClear($, on, ['Adding a greeting CLI', 'Naming the command'])
  await clock.advance(3_000)
  expect(w.statusPrompts).toHaveLength(2)
  expect(w.statusPrompts[1]).toContain('<head>\nAdding a greeting CLI |')
  expect(savedHead()).toBeUndefined()

  w.storeLockedKey = undefined
  await clock.advance(10_000)
  await clock.settle()
  expect(savedHead()).toBe('Naming the command')
})

test('resuming a conversation whose write is held shows that write', async ($, on) => {
  const { clock, drawn } = await heldStatusAfterClear($, on)
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
  await clock.settle()
  expect(drawn().ledger.overview?.head?.title).toBe('Adding a greeting CLI')
})

test('a held write that cannot land within the cap is dropped and logged', async ($, on) => {
  const { clock, savedHead } = await heldStatusAfterClear($, on)
  await clock.advance(11 * 60_000)
  expect(w.logged.filter(line => line.includes('session-1 failed after 10 minutes'))).toHaveLength(1)

  w.storeLockedKey = undefined
  await clock.advance(60_000)
  await clock.settle()
  expect(savedHead()).toBeUndefined()
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
