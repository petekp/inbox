import { expect, mock, test } from 'claude-code/testing'
import { LOOK_MIN_MS } from '../hooks/status'
import { statusPage } from '../hooks/view'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

test('on a next build, a look starts when the Status page shows, the page shows the head and the subjects in place of rows, binds only the held subject’s View key, View shows Asks with its ask selected, and an ask names the subject it holds up', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  w.statusReply =
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name\nNEW: working | Runtime | Node or Python\nLINK: i1 | Runtime\nNEW: working | Plan | being written\nDONE: s2 | written'

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  expect(await pane.find({ key: 'answer-i1-0' })).toBeDefined()
  expect(await pane.find({ text: /Holds up Runtime/ })).toBeDefined()

  const lookOf = () => {
    const saved = [...w.stored].find(([k]) => k.startsWith('s:'))
    return saved && JSON.parse(saved[1]).ledger.overview.look
  }
  expect(lookOf()).toBeNull()
  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()
  expect(lookOf()).not.toBeNull()
  expect((await pane.find({ key: 'status-head' }))?.text).toBe(
    'Adding a greeting CLIBuilding a CLI that greets by name',
  )
  expect((await pane.find({ key: 'status-s1-name' }))?.text).toBe('Runtime · waiting')
  expect((await pane.find({ key: 'status-s1-text' }))?.text).toBe('Node or Python')
  expect((await pane.find({ key: 'status-s1' }))?.text).toContain('◆')
  expect((await pane.find({ key: 'status-s2-text' }))?.text).toBe('written')
  expect(await pane.find({ text: /Use Node or Python\?/ })).toBeUndefined()
  const rowKeys = async () =>
    (await pane.findAll({ type: 'Button' }))
      .map(b => b.key ?? '')
      .filter(k => k.endsWith('-key') && !k.startsWith('tab-'))
  expect(await rowKeys()).toEqual(['show-ask-s1-key', 'no-row-d-key', 'no-row-x-key'])
  expect((await pane.find({ key: 'show-ask-s1' }))?.text).toBe('v: View question')
  expect(await pane.find({ key: 'show-ask-s2' })).toBeUndefined()
  await pane.press({ key: 'next' })
  await pane.press({ key: 'no-row-d-key' })
  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'No lint script',
    detail: 'Only tests run.',
  })
  await clock.settle()
  expect(await pane.find({ key: 'status-head' })).toBeDefined()
  expect(await rowKeys()).toEqual(['show-ask-s1-key', 'no-row-d-key', 'no-row-x-key'])

  await pane.press({ key: 'show-ask-s1-key' })
  await clock.settle()
  expect(lookOf()).toBeNull()
  expect(await pane.find({ key: 'status-head' })).toBeUndefined()
  expect(await pane.find({ key: 'view-i1' })).toBeDefined()
  expect(await pane.find({ key: 'answer-i1-0' })).toBeDefined()
  await pane.press({ key: 'tab-findings' })
  expect(await pane.find({ key: 'address-f3' })).toBeDefined()

  await $.tool.call({ tool: 'mcp__inbox__close', id: 'i1', answer: 'Node' })
  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()
  expect((await pane.find({ key: 'status-s1' }))?.text).not.toContain('◆')
  expect(await pane.find({ key: 'show-ask-s1' })).toBeUndefined()
  expect(await rowKeys()).toEqual(['no-row-d-key', 'no-row-x-key'])
})

test('on a next build, a look at the Status that ends while a Status call is out keeps its Seen line, and the answer that lands after it shows above the line', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  let session: Parameters<typeof statusPage>[0] | null = null
  on('state.set', { plugin: 'inbox', key: 'session' } as const, (_$, e, next) => {
    session = e.value as never
    return next(e)
  })
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({ answer: 'Noted.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }
  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  w.statusReply =
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name\nNEW: working | Plan | being written'
  await reply('add a greeting cli', 't1')
  const pane = await $.ui.mount(PANE)
  let release: () => void = () => undefined
  w.statusHold = new Promise<void>(resolve => (release = resolve))
  w.statusReply = 'NEW: working | Command | named greet'
  await reply('name it greet', 't2')
  expect(w.statusPrompts).toHaveLength(2)

  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()
  await clock.advance(LOOK_MIN_MS)
  await pane.press({ key: 'tab-key-needsYou' })
  await clock.settle()
  const seenAt = session!.ledger.overview?.lastLookAt
  expect(seenAt).toBe(1_000_000 + LOOK_MIN_MS)
  await clock.advance(1)
  release()
  await clock.settle()

  expect(session!.ledger.overview).toMatchObject({ lastLookAt: seenAt, look: null })
  const rows = statusPage(session!, clock.now()).rows
  expect(rows.map(r => (r.kind === 'subject' ? r.name : r.kind))).toEqual(['Command', 'look', 'Plan'])
})

test('a release build keys Asks, Finds and PRs 1 to 3, and a saved Status page shows Asks, tells Claude so, starts no look, stays saved, and names no subject an ask holds up', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)
  w.paneState = { isShown: true, isFocused: true }
  w.statusReply =
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name\nNEW: working | Runtime | Node or Python\nLINK: i1 | Runtime'
  let page: { value: unknown; version: number } = { value: 'overview', version: 1 }
  on('state.get', { plugin: 'inbox', key: 'page' } as const, () => ({ value: page as never }))
  on('state.set', { plugin: 'inbox', key: 'page' } as const, (_$, e) => {
    page = { value: e.value, version: page.version + 1 }
    return { value: { isSet: true as const, version: page.version } }
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  await clock.settle()
  expect(await pane.find({ key: 'answer-i1-0' })).toBeDefined()
  expect(await pane.find({ key: 'status-head' })).toBeUndefined()
  expect(await pane.find({ text: /Holds up/ })).toBeUndefined()
  const tabKeys = (await pane.findAll({ type: 'Button' }))
    .filter(b => (b.key ?? '').startsWith('tab-key-'))
    .map(b => [b.key, b.props.hotkey])
  expect(tabKeys).toEqual([
    ['tab-key-needsYou', '1'],
    ['tab-key-findings', '2'],
    ['tab-key-prs', '3'],
  ])
  const saved = [...w.stored].find(([k]) => k.startsWith('s:'))
  expect(saved && JSON.parse(saved[1]).ledger.overview.look).toBeNull()
  expect(saved && JSON.parse(saved[1]).ledger.overview.askSubjects).toEqual({ i1: 's1' })
  expect(page.value).toBe('overview')
  expect(prompts.at(-1)).toContain('is open beside the conversation, on its Asks tab, listing every open item.')

  await pane.press({ key: 'tab-key-findings' })
  await clock.settle()
  expect(page.value).toBeNull()
})

test('the Status page says what it is for before the session has any work', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  const terminal = await $.ui.mount(PANE)
  await terminal.press({ key: 'tab-key-overview' })
  expect(await terminal.find({ text: /once the work starts\./ })).toBeDefined()
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.find({ text: /once the work starts\./ })).toBeDefined()
})
