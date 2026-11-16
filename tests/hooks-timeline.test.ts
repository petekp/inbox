import { expect, mock, test } from 'claude-code/testing'
import type { TabsProps } from '../hooks/tabs-client'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

test('the Timeline selection and folds upgrade to defaults in an older save', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  let selection: unknown
  let folded: unknown
  on('state.set', { plugin: 'inbox', key: 'timelineSelection' } as const, (_$, event, next) => {
    selection = event.value
    return next(event)
  })
  on('state.set', { plugin: 'inbox', key: 'timelineFolded' } as const, (_$, event, next) => {
    folded = event.value
    return next(event)
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })

  expect(selection).toBe(null)
  expect(folded).toEqual([])
})

test('the next-build pane draws Timeline with its saved selection and folded branch', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  let selectionReads = 0
  let foldedReads = 0
  on('state.get', { plugin: 'inbox', key: 'timelineSelection' } as const, () => {
    selectionReads++
    return { value: { value: 'other', version: 1 } as never }
  })
  on('state.get', { plugin: 'inbox', key: 'timelineFolded' } as const, () => {
    foldedReads++
    return { value: { value: ['plan'], version: 1 } as never }
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'mcp__inbox__tasks', operation: 'add', task_id: 'plan', title: 'Plan' })
  await $.tool.call({
    tool: 'mcp__inbox__tasks',
    operation: 'add',
    task_id: 'child',
    parent_id: 'plan',
    title: 'Child',
  })
  await $.tool.call({ tool: 'mcp__inbox__tasks', operation: 'add', task_id: 'other', title: 'Other' })
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-key-timeline' })
  await clock.settle()

  expect(selectionReads).toBeGreaterThan(0)
  expect(foldedReads).toBeGreaterThan(0)
  const text = (await pane.findAll({ type: 'Text' })).map(node => node.text)
  expect(
    text.some(line => line.includes('Timeline')),
    'Timeline tab',
  ).toBe(true)
  expect(text, 'the saved selection row').toContain('Other')
  expect(text, 'the saved selection marker').toContain('> · ')
  expect(text, 'the saved folded branch').not.toContain('Child')
})

test('Timeline puts the selected row actions in the footer without offering Select for it', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  on('state.get', { plugin: 'inbox', key: 'timelineSelection' } as const, () => {
    return { value: { value: 'plan', version: 1 } as never }
  })
  on('state.get', { plugin: 'inbox', key: 'timelineFolded' } as const, () => {
    return { value: { value: [], version: 1 } as never }
  })

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.tool.call({
    tool: 'mcp__inbox__tasks',
    operation: 'add',
    task_id: 'plan',
    title: 'A flow 21%',
    detail: 'Build the review flow',
  })
  await $.tool.call({
    tool: 'mcp__inbox__tasks',
    operation: 'add',
    task_id: 'child',
    parent_id: 'plan',
    title: 'Child',
  })
  await $.tool.call({ tool: 'mcp__inbox__tasks', operation: 'note', task_id: 'plan', note: 'Keep the row short' })
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'tab-key-timeline' })
  await clock.settle()

  const buttons = (await pane.findAll({ type: 'Button' })).map(button => button.props)
  expect(buttons.some(button => button.label === 'Close branch' && button.hotkey === 'h')).toBe(true)
  expect(buttons.some(button => button.label === 'Select')).toBe(false)
  const text = (await pane.findAll({ type: 'Text' })).map(node => node.text)
  expect(text).toContain('A flow 21%')
  expect(text.some(line => line.includes('Detail · Build the review flow'))).toBe(true)
  expect(text.some(line => line.includes('Updated · '))).toBe(true)
  expect(text.some(line => line.includes('Note · Keep the row short'))).toBe(true)
  expect(text.some(line => line.includes('History · '))).toBe(true)
})

test('the desktop Timeline draws every planned row action as one button per action', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.surfaces = ['desktop']
  on('state.get', { plugin: 'inbox', key: 'timelineSelection' } as const, () => {
    return { value: { value: 'plan', version: 1 } as never }
  })
  on('state.get', { plugin: 'inbox', key: 'timelineFolded' } as const, () => {
    return { value: { value: [], version: 1 } as never }
  })

  await $.session.start({ cwd: '/tmp/project', surface: null, isInteractive: false })
  for (const [task_id, parent_id] of [
    ['plan', undefined],
    ['branch', 'plan'],
    ['leaf', 'branch'],
  ] as const) {
    await $.tool.call({
      tool: 'mcp__inbox__tasks',
      operation: 'add',
      task_id,
      ...(parent_id ? { parent_id } : {}),
      title: task_id,
    })
  }
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 120 } })
  const { tabs, gap } = (await pane.find({ key: 'tabs' }))?.props.props as TabsProps
  const timelineAt = tabs
    .slice(
      0,
      tabs.findIndex(tab => tab.id === 'timeline'),
    )
    .reduce((x, tab) => x + tab.width + gap, 0)
  await pane.pointer({ type: 'down', x: timelineAt, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()

  const plannedButtons = async () =>
    (await pane.findAll({ type: 'Button' })).filter(
      button => button.key === 'toggle-branch' || button.key?.startsWith('timeline-select-'),
    )
  let buttons = await plannedButtons()
  expect(buttons.map(button => [button.key, button.props.label, button.props.plain])).toEqual([
    ['timeline-select-branch', 'branch', true],
    ['timeline-select-leaf', 'leaf', true],
    ['toggle-branch', 'Close branch', true],
  ])
})
