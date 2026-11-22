import { expect, mock } from 'claude-code/testing'
import { test } from './test-with-timeout'
import { w, world } from './hooks-world'
import { BAND, PANE, sidebarLines, sidebarTokens, NO_COUNTS } from './hooks-helpers'

test('a stop and an open permission prompt lead the sidebar line until they clear', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.classic.PermissionRequest({
    tool_name: 'Bash',
    tool_input: { command: 'git push', description: 'Push main to origin' },
  } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('Allow push main to origin?')
  await $.tool.call({ tool: 'Bash', command: 'git push', description: 'Push main to origin' } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('')

  await $.classic.StopFailure({ error: 'authentication_failed' } as never)
  await clock.settle()
  expect(sidebarLines().at(-1)).toBe('! Signed out: /login')
  expect(sidebarTokens()).toMatchObject({ ...NO_COUNTS, 'inbox-stop': '! Signed out: /login' })
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Run \/login, then send a message to resume\./ })).toBeDefined()
  expect(await band.find({ key: 'open-inbox' })).toBeDefined()
  expect((await band.findAll({ type: 'Text', text: /^Nothing needed$/ })).some(t => t.props.dimColor)).toBe(true)
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ key: 'resume' })).toBeUndefined()
  expect(await band.find({ key: 'resume' })).toBeUndefined()
  await $.turn.start({ text: 'logged in, go on', turnId: 't2' })
  await clock.settle()
  expect(await band.find({ text: /Stopped/ })).toBeUndefined()
  expect(sidebarLines().at(-1)).toBe('')
  expect(sidebarTokens()).toMatchObject(NO_COUNTS)

  await $.classic.StopFailure({ error: 'server_error' } as never)
  await clock.settle()
  expect(await pane.find({ text: /API error \(server_error\)\./ })).toBeDefined()
  expect(await band.find({ key: 'resume' })).toBeDefined()
  await pane.press({ key: 'resume' })
  await clock.settle()
  expect(w.sent.at(-1)).toBe('Continue')
  expect((await band.find({ key: 'resume' }))?.props.label).toBe('Resuming…')
  expect((await pane.find({ key: 'resume' }))?.props.label).toBe('Resuming…')
  await band.press({ key: 'resume' })
  await pane.press({ key: 'resume' })
  await clock.settle()
  expect(w.sent.filter(text => text === 'Continue')).toHaveLength(1)
  await $.turn.start({ text: 'Continue', turnId: 't3' })
  await clock.settle()
  expect(await pane.find({ text: /Stopped/ })).toBeUndefined()
})

test('a delayed Resume refusal belongs only to the stop and conversation that sent it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })

  const holdResume = async (reason: string) => {
    let entered!: () => void
    let release!: () => void
    const inSubmit = new Promise<void>(resolve => (entered = resolve))
    const held = new Promise<void>(resolve => (release = resolve))
    w.submitAnswer = {
      drop: reason,
      beforeDrop: async () => {
        entered()
        await held
      },
    }
    await band.press({ key: 'resume' })
    await inSubmit
    return release
  }

  await $.classic.StopFailure({ error: 'server_error' } as never)
  const releaseFirst = await holdResume('first refusal')
  await $.classic.StopFailure({ error: 'server_error' } as never)
  releaseFirst()
  await clock.settle()
  expect(await band.find({ text: /first refusal/ })).toBeUndefined()

  const releaseSecond = await holdResume('old session refusal')
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } })
  await $.classic.SessionStart({ source: 'clear', session_id: 'session-2' })
  await $.classic.StopFailure({ error: 'server_error' } as never)
  releaseSecond()
  await clock.settle()
  expect(await band.find({ text: /old session refusal/ })).toBeUndefined()
  expect(await band.find({ key: 'resume' })).toBeDefined()
})

test('a turn an API error ended shows its stop from the error text in the transcript, and a StopFailure hook that ran keeps its own', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  const said = (text: string) => [{ role: 'assistant' as const, text, toolUses: [] as never[] }]
  const fail = (turnId: string) =>
    $.turn.complete({ answer: '', durationMs: 5, isAborted: false, turnId, reason: 'error' })

  w.transcriptRows = said("You've hit your limit · resets 7:33pm (America/Los_Angeles)")
  await $.turn.start({ text: 'go', turnId: 't1' })
  await fail('t1')
  await clock.settle()
  expect(await band.find({ text: /Resume after 7:33pm\./ })).toBeDefined()

  w.transcriptRows = said('Please run /login · API Error: 401 Invalid API key')
  await $.turn.start({ text: 'go', turnId: 't2' })
  await fail('t2')
  await clock.settle()
  expect(await band.find({ text: /Run \/login, then send a message to resume\./ })).toBeDefined()

  w.transcriptRows = said('There was an issue with the selected model.')
  await $.turn.start({ text: 'go', turnId: 't3' })
  await fail('t3')
  await clock.settle()
  expect(await band.find({ key: 'resume' })).toBeDefined()

  w.transcriptRows = said('API Error: Server is temporarily limiting requests (not your usage limit)')
  await $.turn.start({ text: 'go', turnId: 't3b' })
  await fail('t3b')
  await clock.settle()
  expect(await band.find({ text: /the API is limiting requests/ })).toBeDefined()

  w.transcriptRows = said('Please run /login · API Error: 401 Invalid API key')
  await $.turn.start({ text: 'go', turnId: 't4' })
  await $.classic.StopFailure({ error: 'server_error' } as never)
  await fail('t4')
  await clock.settle()
  expect(await band.find({ text: /API error \(server_error\)/ })).toBeDefined()
})

test('while a permission prompt is open, the band says Claude waits and the Asks tab lists the prompt, then Nothing needed once it clears', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const pane = await $.ui.mount(PANE)
  const terminalBand = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  const desktopBand = await $.ui.mount({ plugin: 'inbox', surface: 'desktop', ...BAND })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' } } as never)
  await clock.settle()
  for (const band of [terminalBand, desktopBand])
    expect(await band.find({ text: /^Claude is waiting for your permission$/ })).toBeDefined()
  expect(await pane.find({ text: /Allow git push\?/ })).toBeDefined()
  expect(await pane.find({ text: /Allow or deny it in Claude's dialog\./ })).toBeDefined()
  for (const drawn of [pane, terminalBand, desktopBand])
    expect(await drawn.find({ text: /^Nothing needed$/ })).toBeUndefined()
  await $.tool.call({ tool: 'Bash', command: 'git push' } as never)
  await clock.settle()
  expect(await pane.find({ text: /Allow git push\?/ })).toBeUndefined()
  for (const drawn of [pane, terminalBand, desktopBand]) {
    expect(await drawn.find({ text: /^Claude is waiting for your permission$/ })).toBeUndefined()
    expect(await drawn.find({ text: /^Nothing needed$/ })).toBeDefined()
  }
})

test('while a permission prompt is open and a row waits, the band keeps its counts and the Asks tab lists the prompt above the row, which stays open', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__inbox__record', kind: 'task', ask: 'Sign in to npm' })
  const pane = await $.ui.mount(PANE)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'git push' } } as never)
  await clock.settle()
  const texts = (await pane.findAll({ type: 'Text' })).map(t => t.text ?? '')
  const promptAt = texts.findIndex(t => /Allow git push\?/.test(t))
  expect(promptAt).toBeGreaterThanOrEqual(0)
  expect(promptAt).toBeLessThan(texts.findIndex(t => /Sign in to npm/.test(t)))
  expect((await pane.findAll({ type: 'Button' })).some(b => /^done-/.test(b.key ?? ''))).toBe(true)
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'inbox', surface, ...BAND })
    expect(await band.find({ text: /^Asks 1$/ })).toBeDefined()
    expect(await band.find({ text: /waiting for your permission/ })).toBeUndefined()
    await band.unmount()
  }
})
