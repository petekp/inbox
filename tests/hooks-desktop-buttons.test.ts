import { expect, mock, test } from 'claude-code/testing'
import type { FoldProps } from '../hooks/fold-client'
import type { LinksProps } from '../hooks/links-client'
import type { RowProps } from '../hooks/row-client'
import type { TabsProps } from '../hooks/tabs-client'
import { PRESS_GUARD_MS, SETTLED_MS } from '../hooks/timing'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

test('the desktop task keeps help before Done, puts Try again first when its send fails, and keeps Undo’s place after Done once Undo ends', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  w.ledgerReply = ['NEW: do | - | Run the load script | - | -', 'HELP: new 1 | run | ./load.sh | load script'].join(
    '\n',
  )
  w.surfaces = ['desktop']
  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  await $.prompt.submit({ text: 'load the data', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Run ./load.sh.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 69 } })
  const actions = async () =>
    (await pane.findAll({ type: 'Button' })).filter(b => /^(retry|help|done)-i1/.test(b.key ?? '')).map(b => b.key)
  expect(await actions()).toEqual(['help-i1-0', 'done-i1'])
  w.submitAnswer = { drop: 'blocked' }
  await pane.press({ key: 'help-i1-0' })
  await clock.settle()
  expect(await actions()).toEqual(['retry-i1', 'help-i1-0', 'done-i1'])
  expect(await pane.find({ text: /Not sent/ })).toBeDefined()

  w.submitAnswer = 'enter'
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'done-i1' })
  await clock.settle()
  const undoPlace = async () => {
    const place = await pane.find({ key: 'undo-place-i1' })
    return place && { width: place.props.width, height: place.props.height }
  }
  const whileUndoLasts = await undoPlace()
  expect(whileUndoLasts).toBeDefined()
  expect(await pane.find({ key: 'undo-i1' })).toBeDefined()
  await clock.advance(SETTLED_MS)
  expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
  expect(await pane.find({ key: 'undo-i1' })).toBeUndefined()
  expect(await undoPlace()).toEqual(whileUndoLasts)
})

test('the desktop pane draws each action as one button and the tabs as one click region, with no keys and no close button of its own', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.surfaces = ['desktop']
  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Node or Python?', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  await clock.advance(3 * 60_000)

  w.paneState = { isShown: true, isFocused: true }
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 36 } })
  const buttons = await pane.findAll({ type: 'Button' })
  expect(buttons.filter(b => b.props.hotkey !== undefined || String(b.props.label).startsWith(': '))).toEqual([])
  expect(buttons.map(b => b.key ?? '').filter(k => /-key$|^tab-key-|^next$|^previous$/.test(k))).toEqual([])
  expect(buttons.map(b => b.key ?? '').filter(k => k.startsWith('tab-'))).toEqual([])
  const recommended = await pane.find({ key: 'answer-i1-0' })
  expect([recommended?.props.label, recommended?.props.variant]).toEqual(['Node (recommended)', 'primary'])
  expect((await pane.find({ key: 'select-i2' }))?.type).toBe('Client')
  expect(await pane.find({ key: 'title-i2' })).toBeUndefined()
  expect(((await pane.find({ key: 'select-i2' }))?.props.props as RowProps).side).toBe('3m')
  await pane.redraw({ ...PANE.props, bodyColumns: 26 })
  const narrowed = await pane.find({ key: 'answer-i1-0' })
  expect([narrowed?.props.label, narrowed?.props.variant]).toEqual(['Node', 'primary'])
  await pane.redraw({ ...PANE.props, bodyColumns: 69 })

  await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'select-i2' })
  await clock.settle()
  expect(await pane.find({ key: 'select-i2' })).toBeUndefined()
  await clock.advance(PRESS_GUARD_MS)
  const links = (await pane.find({ key: 'links-i2' }))?.props.props as LinksProps
  const explainAt = links.links
    .slice(
      0,
      links.links.findIndex(l => l.key === 'explain-i2'),
    )
    .reduce((x, l) => x + l.width + links.gap, 0)
  await pane.pointer({ type: 'down', x: explainAt, y: 0, button: 'left', in: 'links-i2' })
  await clock.settle()
  expect(w.sent).toHaveLength(1)
  expect(await pane.find({ text: /Explaining…/ })).toBeDefined()

  const tabBar = async () => (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
  const { tabs, gap } = await tabBar()
  expect(tabs.map(t => t.id)).toEqual(['needsYou', 'findings', 'prs'])
  const findingsEnd = tabs[0]!.width + gap + tabs[1]!.width
  await pane.pointer({ type: 'down', x: findingsEnd - 1, y: 1.1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect((await tabBar()).shown).toBe('findings')
  await pane.pointer({ type: 'down', x: tabs[0]!.width, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect((await tabBar()).shown).toBe('findings')

  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'README is stale',
    detail: 'Old.',
  })
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'f3', reason: 'fixed' } as never)
  await clock.advance(9000)
  expect(await pane.find({ key: 'settled-f3' })).toBeDefined()
  await pane.pointer({ type: 'down', x: 1, y: 1.1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect((await tabBar()).shown).toBe('needsYou')
  await pane.pointer({ type: 'down', x: findingsEnd - 1, y: 1.1, button: 'left', in: 'tabs' })
  await clock.settle()
  const fold = async () => (await pane.find({ key: 'fold-issue' }))?.props.props as FoldProps
  const closedItem = { text: /^Closed by Claude: fixed$/ } as const
  expect((await pane.find({ key: 'fold-issue' }))?.type).toBe('Client')
  expect(await pane.find(closedItem)).toBeUndefined()
  await pane.pointer({ type: 'down', x: 30, y: 0, button: 'left', in: 'fold-issue' })
  await clock.settle()
  expect((await fold()).isUnfolded).toBe(true)
  expect(await pane.find(closedItem)).toBeDefined()
  await pane.post({ isUnfolded: true }, { in: 'fold-issue' })
  await clock.settle()
  expect((await fold()).isUnfolded).toBe(true)
  expect(await pane.find(closedItem)).toBeDefined()

  await $.tool.call({
    tool: 'mcp__inbox__record',
    kind: 'finding',
    finding_kind: 'issue',
    title: 'Retry loop never backs off',
    detail: 'Hot.',
  })
  await clock.settle()
  expect(await pane.find({ text: 'Hot.' })).toBeDefined()

  expect(await pane.find({ key: 'close-pane' })).toBeUndefined()
})
