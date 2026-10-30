import { expect, mock, test } from 'claude-code/testing'
import { SESSION_VERSION } from '../hooks/session-version'
import { PRESS_GUARD_MS, SETTLED_MS, statusPage } from '../hooks/view'
import { w, world } from './hooks-world'
import { PANE, selectRow, SAVED_SESSION } from './hooks-helpers'

test('a session saved with no version, mid-turn, by a process that ended loads with no turn running, its Done message goes, and its next save writes the session version', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let session: Parameters<typeof statusPage>[0] | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  const task = {
    ...SAVED_SESSION.ledger.items[0]!,
    kind: 'task',
    label: null,
    ask: 'Sign in to npm',
    options: [],
    rec: null,
  }
  w.stored.set(
    's:session-1',
    JSON.stringify({
      ...SAVED_SESSION,
      ledger: { ...SAVED_SESSION.ledger, items: [task] },
      presence: { isTurnRunning: true },
    }),
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(session!.presence.isTurnRunning).toBe(false)
  const pane = await $.ui.mount(PANE)
  await selectRow(pane, 'i1')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'done-i1' })
  await clock.advance(SETTLED_MS)
  expect(w.sent).toEqual(['Done: Sign in to npm'])
  expect(JSON.parse(w.stored.get('s:session-1')!).version).toBe(SESSION_VERSION)
})

test('resuming a session waits for its in-flight save before loading it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'old request', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Old reply.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  let entered!: () => void
  let release!: () => void
  const inSet = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  w.storeSetHold = async key => {
    if (key !== 's:session-1') return
    w.storeSetHold = undefined
    entered()
    await held
  }
  const adding = $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'New finding',
    detail: 'New detail.',
  })
  await inSet
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  let loaded = false
  const loading = $.classic.SessionStart({ source: 'resume', session_id: 'session-1' }).then(() => {
    loaded = true
  })
  await clock.settle()
  expect(loaded).toBe(false)
  release()
  await Promise.all([loading, adding])
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ text: /New finding/ })).toBeDefined()
})

test('a delayed saved-session read cannot replace a newer conversation', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const savedFor = (ask: string) => ({
    ...SAVED_SESSION,
    ledger: { ...SAVED_SESSION.ledger, items: [{ ...SAVED_SESSION.ledger.items[0]!, ask }] },
  })
  w.stored.set('s:session-2', JSON.stringify(savedFor('Second session question?')))
  w.stored.set('s:session-3', JSON.stringify(savedFor('Third session question?')))
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  let entered!: () => void
  let release!: () => void
  const inRead = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  let heldOnce = false
  w.storeHold = async () => {
    if (!heldOnce) {
      heldOnce = true
      entered()
      await held
    }
  }
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  const loadingOld = $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await inRead
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-3' })
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Third session question/ })).toBeDefined()
  release()
  await loadingOld
  await clock.settle()
  expect(await pane.find({ text: /Third session question/ })).toBeDefined()
  expect(await pane.find({ text: /Second session question/ })).toBeUndefined()
})

test('a delayed saved-session application cannot poison the next load', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const savedFor = (ask: string) => ({
    ...SAVED_SESSION,
    ledger: { ...SAVED_SESSION.ledger, items: [{ ...SAVED_SESSION.ledger.items[0]!, ask }] },
  })
  w.stored.set('s:session-2', JSON.stringify(savedFor('Second session question?')))
  w.stored.set('s:session-3', JSON.stringify(savedFor('Third session question?')))
  let entered!: () => void
  let release!: () => void
  const afterWrite = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  let holdNext = false
  on('state.set', { plugin: 'inbox', key: 'unreadable' } as const, async (_$, e, next) => {
    const result = await next(e)
    if (holdNext) {
      holdNext = false
      entered()
      await held
    }
    return result
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  holdNext = true
  const loadingOld = $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await afterWrite
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  const loadingNew = $.classic.SessionStart({ source: 'resume', session_id: 'session-3' })
  release()
  await Promise.all([loadingOld, loadingNew])
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Third session question/ })).toBeDefined()
  expect(await pane.find({ text: /Second session question/ })).toBeUndefined()
})

test('a tool call after a hot reload, before the load converts the ledger, still applies', async ($, on) => {
  mock.clock(on, { now: 1 })
  world($, on, [])
  let strip = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    if (!strip) return next(e)
    const { closedFindings, ...old } = e.value.ledger as unknown as Record<string, unknown>
    return next({ ...e, value: { ...e.value, ledger: old as never } })
  })
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'Old.',
  })
  strip = true
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Second',
    detail: 'Two.',
  })
  strip = false
  const r = await $.tool.call({ tool: 'mcp__inbox__close', id: 'f1', reason: 'fixed' } as never)
  expect(r.result).toBe('Closed the finding. Name it by what it says, never by its id.')
})
