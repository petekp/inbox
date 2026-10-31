import { expect, mock, test } from 'claude-code/testing'
import { PRESS_GUARD_MS, QUEUED_AFTER_MS, SETTLED_MS } from '../hooks/view'
import { w, arrive, world } from './hooks-world'
import { BAND, PANE, selectRow, leaveAndReturn } from './hooks-helpers'

test('Claude closes an item or finding that no longer applies, by the id it reads beside the prompt', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })
  const told = await $.prompt.submit({ text: 'where are we?', wait: false, origin: { kind: 'composer' } })
  expect(told.context?.join('\n')).toContain('- (2) "Name the command greet?" (close id: i2)')
  expect(told.context?.join('\n')).toContain('- issue: README is stale (close id: f3)')

  const close = (input: Record<string, string>) => $.tool.call({ tool: 'mcp__inbox__close', ...input } as never)
  w.paneState = { isShown: true, isFocused: true }
  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })

  await pane.press({ key: 'tab-findings' })
  await pane.press({ key: 'discuss-f3' })
  await clock.settle()
  expect(w.sent.at(-1)).toContain("Let's talk through this finding you recorded")
  expect(await pane.find({ text: /Discussing…/ })).toBeDefined()
  expect((await pane.find({ key: 'discuss-f3-key' }))?.props.label).toBe('Discuss')
  expect(await band.find({ text: /Finds 1/ })).toBeDefined()
  await pane.press({ key: 'tab-needsYou' })
  w.submitAnswer = 'hold'
  w.inFlight.push(pane.press({ key: 'explain-i1-key' }))
  await clock.settle()
  await clock.advance(QUEUED_AFTER_MS)
  expect(await pane.find({ text: /^Queued:\sExplain$/ })).toBeDefined()
  expect((await close({ id: 'i1', answer: 'Deno' })).result).toBe(
    'Closed. The user sees it in the /inbox pane with its outcome. Name it by what it says, never by its id.',
  )
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
  expect(await pane.find({ text: /^Deno$/ })).toBeDefined()
  expect((await close({ id: 'i2', reason: 'no longer applies' })).result).toBe(
    'Closed. The user sees it in the /inbox pane with its outcome. Name it by what it says, never by its id.',
  )
  expect((await close({ id: 'f3', reason: 'fixed' })).result).toBe(
    'Closed the finding. Name it by what it says, never by its id.',
  )
  expect((await close({ id: 'i9', reason: 'done' })).result).toContain(
    'Not closed: no open item or finding has the id i9.',
  )
  expect((await close({ id: 'i1', reason: 'again' })).result).toBe('Already closed: the user answered it (Deno).')
  expect((await close({ id: 'i2', answer: 'yes' })).result).toBe('Already closed: you closed it earlier.')
  expect((await close({ id: 'f3', reason: 'fixed again' })).result).toBe('Already closed: you closed it earlier.')

  await clock.advance(9000)
  expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
  await leaveAndReturn(pane, clock, 'needsYou')
  expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
  expect(await pane.find({ text: /^Deno$/ })).toBeUndefined()
  await pane.press({ key: 'fold-question' })
  expect(await pane.find({ text: /^Deno$/ })).toBeDefined()
  expect(await pane.find({ text: /^Closed by Claude: no longer applies$/ })).toBeDefined()

  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ key: 'row-f3' })).toBeUndefined()
  expect(await pane.find({ text: 'No open issues' })).toBeDefined()
  expect(await pane.find({ text: 'No open opportunities' })).toBeDefined()
  expect((await pane.find({ key: 'fold-issue' }))?.props.label).toBe('▸ 1 closed')
  await pane.press({ key: 'fold-issue' })
  expect(await pane.find({ text: /^README is stale$/ })).toBeDefined()
  expect(await pane.find({ text: /^Closed by Claude: fixed$/ })).toBeDefined()
  await arrive($)
})

test(
  'Dismiss settles a question in place with Undo, which brings it back open and selected, a second close reaches Claude too, and a message typed while Undo lasts folds the row when Undo ends',
  { timeoutMs: 20_000 },
  async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.paneState = { isShown: true, isFocused: true }
    const start = () => $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    const prompt = async (text: string) =>
      (await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })).context?.join('\n') ?? ''
    const closedLine = '- "Use Node or Python?" → dismissed by the user.'

    await start()
    await prompt('add a greeting cli')
    await $.turn.complete({
      answer: 'Plan ready. 1. Node or Python? 2. Call it greet?',
      durationMs: 5,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
    })
    await clock.settle()
    const pane = await $.ui.mount(PANE)

    await pane.press({ key: 'dismiss-i1' })
    expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
    expect(await pane.find({ text: /^Dismissed$/ })).toBeDefined()
    expect(await pane.find({ key: 'explain-i2-key' })).toBeDefined()
    expect((await pane.find({ key: 'dismiss-i2' }))?.props.dimColor).toBe(true)
    expect(await prompt('carry on')).toContain(closedLine)
    await start()
    await clock.settle()
    expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
    await selectRow(pane, 'i2')
    await pane.press({ key: 'undo-i1' })
    expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
    expect(await pane.find({ key: 'answer-i1-0' })).toBeDefined()
    expect(await pane.find({ key: 'answer-i1-1' })).toBeDefined()
    await clock.advance(100)
    expect((await pane.find({ key: 'dismiss-i1' }))?.props.dimColor).toBe(true)
    await pane.press({ key: 'dismiss-i1' })
    expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
    await pane.press({ key: 'dismiss-i1-key' })
    expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
    expect(await prompt('and now?')).toContain(closedLine)
    await pane.press({ key: 'undo-i1' })
    await clock.advance(500)
    expect((await pane.find({ key: 'dismiss-i1' }))?.props.dimColor).toBeUndefined()
    await pane.press({ key: 'dismiss-i1' })
    expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
    await clock.advance(SETTLED_MS)
    expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
    expect(await pane.find({ key: 'undo-i1' })).toBeUndefined()
    await leaveAndReturn(pane, clock, 'needsYou')
    expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
    expect((await pane.find({ key: 'fold-question' }))?.props.label).toBe('▸ 1 closed')
    expect(await pane.find({ key: 'explain-i2-key' })).toBeDefined()

    await clock.advance(PRESS_GUARD_MS)
    await pane.press({ key: 'dismiss-i2' })
    await clock.advance(100)
    await prompt('what else?')
    expect(await pane.find({ key: 'settled-i2' })).toBeDefined()
    expect(await pane.find({ key: 'undo-i2' })).toBeDefined()
    await clock.advance(SETTLED_MS)
    expect(await pane.find({ key: 'settled-i2' })).toBeUndefined()
    expect((await pane.find({ key: 'fold-question' }))?.props.label).toBe('▸ 2 closed')
  },
)
