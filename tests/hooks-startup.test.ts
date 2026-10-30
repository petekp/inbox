import { expect, mock, test } from 'claude-code/testing'
import type { PromptOrigin } from 'claude-code'
import { DARK_TONES } from '../hooks/tones'
import { w, world } from './hooks-world'
import { BAND, PANE, SAVED_SESSION } from './hooks-helpers'

test('tools the engine refuses show an error banner on every tab, and the mod still loads the conversation', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.theme = 'dark'
  w.toolRefusal = 'blocked by managed settings'
  w.stored.set('s:session-1', JSON.stringify(SAVED_SESSION))

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  const isRedLead = async () =>
    (await pane.findAll({ type: 'Text', text: /^Claude cannot record or close items here\.$/ })).some(
      t => t.props.color === DARK_TONES.error,
    )
  const body = /Your organization's settings block the inbox's tools\./
  expect(await isRedLead()).toBe(true)
  expect(await pane.find({ text: body })).toBeDefined()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  await pane.press({ key: 'tab-findings' })
  expect(await isRedLead()).toBe(true)
  expect(await pane.find({ text: body })).toBeDefined()
})

test('a saved session the store cannot read shows as unreadable, not empty, until [Try again] reads it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount(PANE)
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  w.storeRefusal = 'the store is busy'
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(await pane.find({ text: /Could not read the inbox/ })).toBeUndefined()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()

  w.storeRefusal = undefined
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await clock.settle()
  expect(await pane.find({ text: /Nothing needed/ })).toBeDefined()
  w.storeRefusal = 'the store is busy'
  await $.session.end({ reason: 'resume', sessionId: 'session-2', resume: { id: 'session-2' } })
  await $.classic.SessionStart({ source: 'resume', session_id: 'session-1' })
  await clock.settle()
  expect(await pane.find({ text: 'Could not read the inbox.' })).toBeDefined()
  expect(await pane.find({ text: /Nothing needed/ })).toBeUndefined()

  let readDone = () => {}
  w.storeHold = () => new Promise<void>(r => (readDone = r))
  await pane.press({ key: 'read-again' })
  await clock.settle()
  expect(await pane.find({ text: 'Reading the inbox…' })).toBeDefined()
  expect(await pane.find({ key: 'read-again' })).toBeDefined()
  await pane.press({ key: 'read-again' })
  w.storeHold = undefined
  readDone()
  await clock.settle()
  expect(await pane.find({ text: 'Could not read the inbox.' })).toBeDefined()

  w.ledgerReply = 'NONE'
  await $.prompt.submit({ text: 'keep going', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'Old.',
  })
  await clock.settle()
  expect(w.stored.get('s:session-1')).toContain('Use Node or Python?')

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(await pane.find({ text: 'Could not read the inbox.' })).toBeDefined()
  await $.prompt.submit({ text: 'and the tests', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'ok', durationMs: 5, isAborted: false, turnId: 't3', reason: 'answer' })
  await clock.settle()
  expect(w.stored.get('s:session-1')).toContain('Use Node or Python?')

  w.storeRefusal = undefined
  await pane.press({ key: 'read-again' })
  await clock.settle()
  expect(await pane.find({ text: /Could not read the inbox/ })).toBeUndefined()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  expect(w.stored.get('s:session-1')).toContain('Use Node or Python?')
})

for (const origin of [{ kind: 'sdk' }, { kind: 'plugin', name: 'test-plugin' }] satisfies PromptOrigin[]) {
  test(`a headless run stays inactive when ${origin.kind} invokes the inbox command`, async ($, on) => {
    const prompts: string[] = []
    mock.clock(on, { now: 1 })
    world($, on, prompts)

    await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
    await $.command.run({
      command: 'inbox',
      args: 'demo',
      origin,
      presentation: { isFullscreen: false, columns: 80 },
    })
    await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'sdk' } })
    await $.turn.complete({ answer: 'hello', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })

    expect(w.panesOpened).toEqual([])
    expect(w.stored.size).toBe(0)
    expect(prompts).toEqual([])
  })
}

test('the first inbox command loads saved rows before desktop attaches', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.stored.set('s:session-1', JSON.stringify(SAVED_SESSION))

  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  await $.command.run({
    command: 'inbox',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
  await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  await clock.settle()
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
})

for (const activatingEvent of ['start', 'attach'] as const) {
  test(`an inbox command waits for the saved rows loading during desktop ${activatingEvent}`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.stored.set('s:session-1', JSON.stringify(SAVED_SESSION))
    let release = () => {}
    const reading = new Promise<void>(r => (release = r))
    let didRead = () => {}
    const readStarted = new Promise<void>(r => (didRead = r))
    w.storeHold = () => {
      didRead()
      return reading
    }

    if (activatingEvent === 'attach')
      await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
    else w.surfaces = ['desktop']
    const activation =
      activatingEvent === 'start'
        ? $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
        : $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
    await readStarted
    const command = $.command.run({ command: 'inbox', args: '' } as never)
    const attach = $.session.attach({ surface: 'desktop', clientId: 'desktop:other' })
    await clock.settle()
    expect(w.panesOpened).toEqual([])
    release()
    await Promise.all([activation, command, attach])
    const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await pane.find({ text: /Use Node or Python\?/ })).toBeDefined()
    expect(
      (await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })).context?.join('\n'),
    ).toContain('Use Node or Python?')
  })
}

test('a refused inbox command registration leaves normal desktop startup and saved rows available', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.commandRefusal = 'blocked by managed settings'
  w.surfaces = ['desktop']
  w.stored.set('s:session-1', JSON.stringify(SAVED_SESSION))

  expect(await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })).toEqual({
    cwd: '/tmp/project',
  })
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'desktop', ...BAND })
  expect(await band.find({ text: /Asks 1/ })).toBeDefined()
  expect(
    (await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })).context?.join('\n'),
  ).toContain('Use Node or Python?')
})

for (const isAttachedFirst of [true, false]) {
  test(`the desktop app turns the mod on when it attaches ${isAttachedFirst ? 'before' : 'after'} the start`, async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    const prompts: string[] = []
    world($, on, prompts)
    if (isAttachedFirst) w.surfaces = ['desktop']

    await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
    if (!isAttachedFirst) await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
    await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'sdk' } })
    await $.turn.complete({
      answer: 'Node or Python?',
      durationMs: 5,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
    })
    await clock.settle()

    expect(prompts.length).toBe(1)
    const band = await $.ui.mount({ plugin: 'inbox', surface: 'desktop', ...BAND })
    expect(await band.find({ text: /Asks 2/ })).toBeDefined()
  })
}

test('a session the desktop app started carries its saved rows into a first prompt that comes before the attach', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [], { CLAUDE_CODE_ENTRYPOINT: 'claude-desktop' })
  w.stored.set('s:session-1', JSON.stringify(SAVED_SESSION))

  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  const firstPrompt = await $.prompt.submit({ text: 'continue', wait: false, origin: { kind: 'composer' } })

  expect(firstPrompt.context?.join('\n')).toContain('Use Node or Python?')
})

test('a claude -p run from a desktop session stays off', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts, { CLAUDE_CODE_ENTRYPOINT: 'claude-desktop', CLAUDE_CODE_CHILD_SESSION: '1' })

  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'sdk' } })
  await $.turn.complete({ answer: 'Node or Python?', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  expect(prompts).toEqual([])
  expect(w.stored.size).toBe(0)
})
