import { expect, mock, test } from 'claude-code/testing'
import { SETTLED_MS } from '../hooks/timing'
import { w, world } from './hooks-world'
import { PANE, SAVED_SESSION } from './hooks-helpers'

test('/clear and /resume switch the inbox to the other conversation, and each keeps its saved items', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const turn = async (text: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: text, reason: 'answer' })
    await clock.settle()
  }

  w.stored.set('p:/tmp/project', JSON.stringify(SAVED_SESSION))
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await turn('add a greeting cli')
  expect(w.stored.has('p:/tmp/project')).toBe(false)
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'answer-i1-0' })
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  w.ledgerReply = 'NEW: decide | 1 | Pin the Node version? | Yes / No | Yes'
  await turn('fix the build')
  expect(await pane.find({ text: /Pin the Node version\?/ })).toBeDefined()
  expect(await pane.find({ text: /✓/ })).toBeUndefined()
  expect((await pane.find({ key: 'answer-i1-0' }))?.props.label).not.toMatch(/again/)
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
  await clock.settle()

  expect(await pane.find({ text: /Name the command greet\?/ })).toBeDefined()
  expect(await pane.find({ text: /Pin the Node version\?/ })).toBeUndefined()

  await $.session.end({ reason: 'resume', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-2' })
  await clock.settle()
  expect(await pane.find({ text: /Pin the Node version\?/ })).toBeDefined()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeUndefined()
})

test('where classic.SessionStart is skipped, the first prompt after /clear, /resume and /branch loads that conversation and carries its open questions', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const turn = async (text: string, reply: string, goal: string) => {
    w.ledgerReply = reply
    w.statusReply = `HEAD: ${goal} | Answering the question\nNEW: queued | Answer | Waiting on an answer`
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: text, reason: 'answer' })
    await clock.settle()
  }
  const contextOf = async (id: string, reason: 'clear' | 'resume', text: string) => {
    await $.session.end({ reason, sessionId: w.sessionId, resume: { id: w.sessionId } })
    w.sessionId = id
    const prompt = await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    return (prompt.context ?? []).join('\n')
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await turn('add caching', 'NEW: decide | 1 | Pick a cache? | Redis / Memory | Memory', 'Adding caching')

  const cleared = await contextOf('session-2', 'clear', 'start over')
  expect(cleared).not.toContain('Pick a cache?')
  expect(cleared).not.toContain('Adding caching')

  await turn('fix the build', 'NEW: decide | 1 | Pin Node? | Yes / No | Yes', 'Fixing the build')
  const branched = await contextOf('session-3', 'resume', 'try another way')
  expect(branched).toContain('Pin Node?')
  expect(branched).toContain('Working on: Fixing the build')
  expect(branched).toContain('- Answer: Waiting on an answer (queued)')

  const resumed = await contextOf('session-1', 'resume', 'where were we?')
  expect(resumed).toContain('Pick a cache?')
  expect(resumed).toContain('Working on: Adding caching')
  expect(resumed).not.toContain('Fixing the build')
  expect(resumed).not.toContain('Pin Node?')
  const again = (await $.prompt.submit({ text: 'and now?', wait: false, origin: { kind: 'composer' } })).context ?? []
  expect(again.join('\n')).not.toContain('Pick a cache?')
  expect(again.join('\n')).not.toContain('Working on:')
})

test('a ledger update held during clear cannot write its old question into the new conversation', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.ledgerReply = 'NEW: decide | 1 | Old question? | Yes / No | Yes'
  let entered!: () => void
  let release!: () => void
  const inWrite = new Promise<void>(resolve => (entered = resolve))
  const held = new Promise<void>(resolve => (release = resolve))
  let didHold = false
  on('state.set', { plugin: 'inbox', key: 'session' } as const, async (_$, e, next) => {
    if (!didHold && e.value.ledger.items.some(i => i.ask === 'Old question?')) {
      didHold = true
      entered()
      await held
    }
    return next(e)
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'old request', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Old reply.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await inWrite
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Old question/ })).toBeUndefined()
  release()
  await clock.settle()
  expect(await pane.find({ text: /Old question/ })).toBeUndefined()
  expect(w.stored.has('s:session-2')).toBe(false)
})

test('a forked conversation keeps the parent’s findings and closed records, and dismissing the question that replaced a finding brings the finding back', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Retry loop never backs off',
    detail: 'The fetch retry spins with no delay.',
  })
  w.ledgerReply = 'ASKED: f1 | new 1\nNEW: decide | 1 | Add a backoff to the retry loop? | Yes / No | Yes'
  await $.prompt.submit({ text: 'fix the retries', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Add a backoff?', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ text: /Add a backoff to the retry loop\?/ })).toBeDefined()
  await clock.advance(1)
  await pane.press({ key: 'tab-findings' })
  await clock.settle()
  expect(await pane.find({ key: 'settled-f1' })).toBeUndefined()
  await pane.press({ key: 'fold-issue' })
  expect(await pane.find({ text: /^Now a question in Asks$/ })).toBeDefined()
  await pane.press({ key: 'tab-needsYou' })
  const contextOf = async () =>
    ((await $.prompt.submit({ text: 'where are we?', wait: false, origin: { kind: 'composer' } })).context ?? []).join(
      '\n',
    )
  expect(await contextOf()).not.toContain('(close id: f1)')

  await $.session.end({ reason: 'resume', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'fork', session_id: 'session-2' })
  await clock.settle()
  expect(await contextOf()).toContain('(close id: i2)')
  expect(await contextOf()).not.toContain('(close id: f1)')
  await pane.press({ key: 'dismiss-i2' })
  await clock.settle()
  await clock.advance(SETTLED_MS)
  expect(await contextOf()).toContain('- issue: Retry loop never backs off (close id: f1)')
})
