import { expect, mock, test } from 'claude-code/testing'
import { PRESS_GUARD_MS } from '../hooks/timing'
import { w, world } from './hooks-world'
import { BAND, PANE, selectRow, sidebarLines, sidebarTokens, NO_COUNTS } from './hooks-helpers'

test('a question’s handle is the number a typed answer reaches, and the band counts what the tab counts', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [], { HERDR_PANE_ID: 'p1' })
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'Run ./load.sh.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(sidebarTokens()).toEqual({ inbox: null, ...NO_COUNTS })
  await reply('add a greeting cli', 't1')
  w.ledgerReply = [
    'NEW: decide | 1 | Add a --loud flag? | yes / no | yes',
    'NEW: do | - | Run the load script | - | -',
    'HELP: new 2 | run | ./load.sh | load script',
    'NEW: decide | 2 | Print in color? | yes / no | no',
    'NEW: do | - | Sign in to npm | - | -',
  ].join('\n')
  await reply('add flags too', 't2')

  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  const handle = async (id: string) => {
    const label = (await pane.find({ key: `title-${id}` }))?.props.label
    return typeof label === 'string' ? (label.match(/^(\d+\)) /)?.[1] ?? null) : undefined
  }
  expect(await pane.find({ key: 'explain-i3-key' })).toBeDefined()
  expect([await handle('i5'), await handle('i1'), await handle('i2')]).toEqual(['2)', null, null])
  expect(await pane.find({ text: /^1\) Add a --loud flag\?/ })).toBeDefined()
  expect(await band.find({ text: /Asks 6/ })).toBeDefined()
  expect(await pane.find({ text: /^ 6$/ })).toBeDefined()
  expect(sidebarTokens()).toMatchObject({ ...NO_COUNTS, 'inbox-needs-you': '6' })

  const answered = await $.prompt.submit({ text: '1. yes', wait: false, origin: { kind: 'composer' } })
  expect(answered.context?.join('\n')).toContain('1 → "Add a --loud flag?"')
  expect(await pane.find({ text: /^1\) Add a --loud flag\?/ })).toBeUndefined()
  expect(await pane.find({ text: /^Add a --loud flag\?/ })).toBeDefined()

  await selectRow(pane, 'i4')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'help-i4-0' })
  await clock.settle()
  expect(await band.find({ text: /Asks 5/ })).toBeDefined()
  expect(await pane.find({ text: /^ 5$/ })).toBeDefined()
  expect(sidebarTokens()).toMatchObject({ ...NO_COUNTS, 'inbox-needs-you': '5' })

  w.ledgerReply = ['NEW: do | - | Water the plants | - | -', 'NEW: decide | 1 | Ship it? | yes / no | yes'].join('\n')
  await reply('ship it', 't3')
  expect(await handle('i8')).toBe('1)')
  expect(sidebarLines().at(-1)).toBe('8 · Ship it?')
  w.ledgerReply = 'NEW: do | - | Feed the cat | - | -'
  await reply('one more task', 't4')
  expect(sidebarLines().at(-1)).toBe('9 · Ship it?')
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'Old name.',
  })
  await clock.settle()
  expect(sidebarTokens()).toEqual({
    ...NO_COUNTS,
    inbox: '9 · Ship it?',
    'inbox-needs-you': '9',
    'inbox-findings': '1',
  })

  await $.session.end({ reason: 'other', sessionId: 'session-1' } as never)
  await clock.settle()
  expect(sidebarTokens()).toEqual({ inbox: null, ...NO_COUNTS })
})

test('the band is [Open inbox] and the counts with full-brightness labels, the same while working and after 15 idle minutes', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const band = (props: Partial<typeof BAND.props> = {}) =>
    $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND, props: { ...BAND.props, ...props } })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'add a greeting cli', turnId: 't1' })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'It names the old command.',
  })

  const standing = await band()
  expect(await standing.find({ key: 'open-inbox' })).toBeDefined()
  expect(await standing.find({ text: /^Asks 2\u2007·\u2002Finds 1$/ })).toBeDefined()
  const labels = await standing.findAll({ type: 'Text', text: /^(Asks|Finds) $/ })
  expect(labels).toHaveLength(2)
  expect(labels.some(l => l.props.dimColor)).toBe(false)
  expect(await standing.find({ text: /Use Node or Python|Add a greeting CLI|Waiting on two choices/ })).toBeUndefined()

  const working = await band({ isWorking: true })
  expect(await working.find({ text: /^Asks 2\u2007·\u2002Finds 1$/ })).toBeDefined()

  await clock.advance(16 * 60_000)
  expect(await standing.find({ text: /^Asks 2\u2007·\u2002Finds 1$/ })).toBeDefined()
  expect(await standing.find({ text: /Plan written|last active/ })).toBeUndefined()

  const pane = await $.ui.mount(PANE)
  await selectRow(pane, 'i2')
  await pane.press({ key: 'tab-findings' })
  w.panesOpened = []
  await standing.press({ key: 'open-inbox' })
  expect(w.panesOpened).toEqual(['inbox'])
  expect(await pane.find({ key: 'explain-i1-key' })).toBeDefined()
  expect(await pane.find({ key: 'explain-i2-key' })).toBeUndefined()
})

test('the band keeps what the mods after the inbox draw there, with its counts and with its stop line', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Text({ children: ['Heads up'] }))
  world($, on, [])
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'inbox', surface, ...BAND })
    expect(await band.find({ text: /^Asks 2$/ })).toBeDefined()
    expect(await band.find({ text: 'Heads up' })).toBeDefined()
    await band.unmount()
  }

  await $.classic.StopFailure({ error: 'server_error' } as never)
  await clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'inbox', surface, ...BAND })
    expect(await band.find({ key: 'resume' })).toBeDefined()
    expect(await band.find({ text: 'Heads up' })).toBeDefined()
    await band.unmount()
  }
})
