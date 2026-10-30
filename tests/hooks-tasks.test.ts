import { expect, mock, test } from 'claude-code/testing'
import { PRESS_GUARD_MS, SETTLED_MS } from '../hooks/view'
import { w, world } from './hooks-world'
import { BAND, PANE, selectRow } from './hooks-helpers'

test('a task handed to Claude folds and leaves the count until Claude’s reply leaves it open, whatever it opens or copies meanwhile', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.ledgerReply = [
    'NEW: do | - | Run the load script | - | -',
    'HELP: new 1 | run | ./load.sh | load script',
    'HELP: new 1 | run | npm login | -',
    'HELP: new 1 | open | notes/load.md | -',
    'NEW: do | - | Add the API key | - | -',
    'HELP: new 2 | copy | API_KEY=x | env line',
    'HELP: new 2 | open | .env.local | -',
  ].join('\n')
  const answer = 'Run ./load.sh after npm login; see notes/load.md. Put API_KEY=x in .env.local.'
  w.theme = 'dark'

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'load the data', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'load the data', turnId: 't1' })
  await $.turn.complete({ answer, durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  const pane = await $.ui.mount(PANE)
  expect(await band.find({ text: /Asks 2/ })).toBeDefined()

  await pane.press({ key: 'help-i1-0' })
  await clock.settle()
  expect(w.sent.at(-1)).toContain('./load.sh')
  expect(await pane.find({ text: /Run load script/ })).toBeDefined()
  expect(await pane.find({ key: 'help-i1-1' })).toBeUndefined()
  expect(await band.find({ text: /Asks 1/ })).toBeDefined()
  expect(await pane.find({ key: 'help-i2-0' })).toBeDefined()

  await pane.press({ key: 'title-i1' })
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'help-i1-1' })
  await clock.settle()
  expect(w.copied).toEqual(['npm login'])
  expect(
    await pane.find({
      text: /^\u2007·\s✓\sCopied\snpm\slogin\.\sRun\sit\sin\sa\sterminal,\sor\stype\s!\sand\spaste\.$/,
    }),
  ).toBeDefined()
  await pane.press({ key: 'help-i1-2' })
  await clock.settle()
  const red = (await pane.find({ type: 'Text', text: /^\s*Could not open load\.md: it no longer exists$/ }))?.props
    .color
  expect(red).toBeDefined()
  expect(w.toasts).toEqual([])
  expect(await band.find({ text: /Asks 1/ })).toBeDefined()
  await clock.advance(SETTLED_MS)
  expect(await pane.find({ text: 'Could not open load.md: it no longer exists' })).toBeDefined()

  w.files = ['/tmp/project/.env.local']
  await selectRow(pane, 'i2')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'help-i2-0' })
  await clock.settle()
  expect(w.copied.at(-1)).toBe('API_KEY=x')
  expect(w.ran.at(-1)).toEqual(['open', '/tmp/project/.env.local'])
  expect(
    (await pane.find({ type: 'Text', text: /^\u2007·\s✓\sCopied\senv\sline\u2007·\sOpened\s\.env\.local$/ }))?.props
      .color,
  ).not.toBe(red)
  expect((await pane.find({ type: 'Text', text: /Could not open load\.md/ }))?.props.color).toBe(red)
  expect((await pane.find({ key: 'help-i2-0-key' }))?.props.label).toBe('Copy env line and open .env.local')
  await clock.advance(SETTLED_MS)
  expect(await pane.find({ text: /Opened \.env\.local/ })).toBeUndefined()
  await pane.press({ key: 'title-i1' })

  w.ledgerReply = 'NONE'
  await $.turn.start({ text: 'For "Run the load script", run this', turnId: 't2' })
  await $.turn.complete({ answer: 'It needs sudo.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect((await pane.find({ key: 'help-i1-0-key' }))?.props.label).toBe('Run load script again')
  expect(await band.find({ text: /Asks 2/ })).toBeDefined()
})

test('last actions an earlier build saved convert once by the table, and a task handed off then still folds', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.ledgerReply = 'NEW: do | - | Run the load script | - | -\nHELP: new 1 | run | ./load.sh | load script'
  const at = 1_000_000
  const thread = (id: string) => `acme/greet#12 thread ${id}`
  const old: Record<string, Record<string, unknown>> = {
    i1: {
      action: 'help-i1-0',
      text: 'Run load script',
      at,
      isHandoff: true,
      turnsStarted: 1,
      tab: 'needsYou',
      title: 'Run the load script',
      index: 0,
    },
    i2: { action: 'explain-i2', text: 'Explain sent', at },
    i3: { action: 'typed', text: 'Reply', at, isHandoff: true },
    i4: { action: 'step-1', text: 'Seed sent', at },
    i5: { action: 'explain', text: 'Explain sent', at },
    f6: { action: 'address-f6', text: 'Sent to Claude to fix', at },
    f7: { action: 'discuss-f7', text: 'Discuss sent', at },
    f9: {
      kind: 'handoff',
      action: 'address',
      text: 'Address',
      at,
      turnsStarted: 1,
      tab: 'findings',
      title: 'x',
      index: 0,
    },
    [thread('T1')]: { action: 'address-T1', text: 'Address', at, isHandoff: true },
    [thread('T2')]: { action: 'draft-T2', text: 'Draft reply', at },
    [thread('T3')]: { action: 'discuss-T3', text: 'Discuss', at },
    'pr:acme/greet#12': { action: 'resolve-acme/greet#12', text: 'Resolve conflicts', at, isHandoff: false },
    'pr:acme/greet#13': { action: 'address-all-acme/greet#13', text: 'Address all 2 threads', at },
    i8: { action: 'open-i8', text: 'Open', at },
    [`acme/greet#12 check test`]: { action: 'log-acme/greet#12-test', text: 'Open log', at },
    'check:/repo npm test': { action: 'fix-check', text: 'Fix', at },
  }
  const converted = {
    i1: { kind: 'handoff', action: 'step-0', text: 'Run load script', at, turnsStarted: 1 },
    i2: { kind: 'talk', action: 'explain', text: 'Explain', at },
    i3: { kind: 'handoff', action: 'type', text: 'Reply', at },
    i4: { kind: 'handoff', action: 'step-1', text: 'Seed', at },
    i5: { kind: 'talk', action: 'explain', text: 'Explain', at },
    f6: { kind: 'handoff', action: 'address', text: 'Address', at },
    f7: { kind: 'talk', action: 'discuss', text: 'Discuss', at },
    f9: { kind: 'handoff', action: 'address', text: 'Address', at, turnsStarted: 1 },
    [thread('T1')]: { kind: 'handoff', action: 'thread-address', text: 'Address', at },
    [thread('T2')]: { kind: 'talk', action: 'thread-draft', text: 'Draft reply', at },
    [thread('T3')]: { kind: 'talk', action: 'thread-discuss', text: 'Discuss', at },
    'pr:acme/greet#12': { kind: 'talk', action: 'pr-conflicts', text: 'Resolve conflicts', at },
    'pr:acme/greet#13': { kind: 'handoff', action: 'pr-address-all', text: 'Address all 2 threads', at },
  }
  let saving: unknown = null
  let saved: unknown = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    const write = saving ? { ...e, value: { ...e.value, lastActions: saving as never } } : e
    saved = write.value.lastActions
    return next(write)
  })
  let savingUnfolded: unknown = null
  let savedUnfolded: unknown = null
  on('state.set', { plugin: 'inbox', key: 'unfolded' } as const, (_$, e, next) => {
    const write = savingUnfolded ? { ...e, value: savingUnfolded as never } : e
    savedUnfolded = write.value
    return next(write)
  })
  const oldCursor = { id: 'i1', index: 0 }
  let savingOpen: { selection: unknown } | null = null
  const savedOpen: { selection?: unknown } = {}
  on('state.set', { plugin: 'inbox', key: 'selection' } as const, (_$, e, next) => {
    const write = savingOpen ? { ...e, value: savingOpen.selection as never } : e
    savedOpen.selection = write.value
    return next(write)
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'load the data', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'load the data', turnId: 't1' })
  await $.turn.complete({ answer: 'Run ./load.sh.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'Old name.',
  })
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'f2', reason: 'fixed' } as never)
  saving = old
  savingUnfolded = ['finding', 'do']
  savingOpen = {
    selection: { needsYou: oldCursor, findings: { id: null, index: 0 }, prs: { id: null, index: 0 } },
  }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  saving = null
  savingUnfolded = null
  savingOpen = null
  const openConverted = {
    selection: {
      needsYou: { ...oldCursor, openedAt: 0 },
      findings: { id: null, index: 0, openedAt: 0 },
      prs: { id: null, index: 0, openedAt: 0 },
    },
  }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(saved).toEqual(converted)
  expect(savedUnfolded).toEqual(['issue', 'opportunity', 'task'])
  expect(savedOpen).toEqual(openConverted)
  saved = null
  savedUnfolded = null
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(saved).toEqual(converted)
  expect(savedUnfolded).toEqual(['issue', 'opportunity', 'task'])
  expect(savedOpen).toEqual(openConverted)

  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await pane.find({ text: /Run load script/ })).toBeDefined()
  expect(await band.find({ text: /Asks/ })).toBeUndefined()
  await clock.advance(SETTLED_MS)
  await pane.press({ key: 'tab-findings' })
  expect((await pane.find({ key: 'fold-issue' }))?.props.label).toBe('▾ 1 closed')
})
