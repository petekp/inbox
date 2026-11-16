import { expect, mock, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'
import { STATUS_TEXT_LINES } from '../hooks/status-page'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

test(
  'on the Status, where a subject stands goes under its name, wraps to three lines at the docked width and is cut with an ellipsis past them, and a merged line is cut to one line at a phrase, in the terminal and on desktop',
  { timeoutMs: 20_000 },
  async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.paneState = { isShown: true, isFocused: true }
    const name = 'Help text for every greeting command'
    const text = 'being written with examples, defaults, descriptions, environment variables, configuration precedence'
    w.statusReply = [
      'HEAD: Adding a greeting CLI | Building a CLI that greets by name',
      `NEW: working | ${name} | ${text}`,
      'NEW: queued | Loud flag | after help',
      'NEW: working | Sync retry, backoff, and jitter | drafted',
      'DROP: s3 | part of help | INTO s1',
    ].join('\n')

    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.settle()
    const terminal = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
    await terminal.press({ key: 'tab-key-overview' })
    await clock.settle()
    const textOf = async (pane: Pick<Mounted, 'find'>, key: string) => (await pane.find({ key }))?.text
    const lines = (await textOf(terminal, 'status-s1-text'))!.split('\n')
    expect(await textOf(terminal, 'status-s1-name')).toBe('Help text for every greeting\ncommand')
    expect(lines).toHaveLength(STATUS_TEXT_LINES)
    expect(lines[0]).toBe('being written with examples,')
    expect(lines.at(-1)).toMatch(/…$/)
    expect(await textOf(terminal, 'status-s1-merged')).toBe('merged in: Sync retry, backoff…')
    expect(await textOf(terminal, 'status-s2-name')).toBe('Loud flag')
    expect(await textOf(terminal, 'status-s2-text')).toBe('after help')
    await terminal.redraw({ ...PANE.props, bodyColumns: 120 })
    expect(await textOf(terminal, 'status-s1-text')).toBe(text)
    expect(await textOf(terminal, 'status-s1-merged')).toBe('merged in: Sync retry, backoff, and jitter')

    const desktop = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 30 } })
    await desktop.pointer({ type: 'down', x: 0, y: 1, button: 'left', in: 'tabs' })
    await clock.settle()
    const shown = (await textOf(desktop, 'status-s1-text'))!
    expect(shown).toMatch(/^being written with .+…$/)
    expect(shown.length).toBeLessThan(text.length)
    expect(await textOf(desktop, 'status-s1-merged')).toMatch(/^merged in: Sync retry(, backoff)?…$/)
    await desktop.redraw({ ...PANE.props, bodyColumns: 120 })
    expect(await textOf(desktop, 'status-s1-text')).toBe(text)
    expect(await textOf(desktop, 'status-s1-merged')).toBe('merged in: Sync retry, backoff, and jitter')
  },
)

test('on the Status in the terminal, the rows under a subject hang from its mark, ├─ for each and └─ for the last, and the line runs beside each wrapped line', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: 'demo' } as never)
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 34 } })
  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()
  const tree = async (id: string) => (await pane.find({ key: `status-${id}-tree` }))?.text.split('\n').slice(0, 3)
  const textLines = async (id: string) => (await pane.find({ key: `status-${id}-name` }))!.text.split('\n')

  expect(await tree('s1')).toEqual(['│', '│', '│'])
  expect(await tree('c1')).toEqual(['├─', '│', '│'])
  expect(await tree('c3')).toEqual(['├─', '│', '│'])
  expect(await tree('c4')).toEqual(['└─', ' ', ' '])
  expect(await tree('c5')).toEqual(['└─', ' ', ' '])
  expect(await tree('s3')).toBeUndefined()
  expect((await textLines('c3')).length).toBeGreaterThan(1)
  await pane.redraw({ ...PANE.props, bodyColumns: 120 })
  expect(await textLines('c3')).toEqual(['Tune how hard a pinch must be'])
})

test('on the Status, while the goal shows milestones, work linked to none of them draws under Other work, and the desktop hairline between the goal and that list draws no line', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.paneState = { isShown: true, isFocused: true }
  w.statusReply = [
    'HEAD: Adding a greeting CLI | Building a CLI that greets by name',
    'NEW: working | Help text | being written',
    'NEW: working | Loud flag | parsing done',
    'NEW: queued | Docs | after help',
    'GOAL: Greeting CLI ships | working Help ready; queued Docs written',
    'SERVES: s1 | m1',
  ].join('\n')

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const docked = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
  await docked.press({ key: 'tab-key-overview' })
  await clock.settle()
  expect(await docked.find({ key: 'status-other' })).toBeDefined()
  await docked.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 36 } })
  await desktop.pointer({ type: 'down', x: 0, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect(await desktop.find({ key: 'rule-1' })).toBeDefined()
  expect((await desktop.find({ key: 'rule-1' }))?.props.backgroundColor).toBeUndefined()
  await desktop.unmount()

  const inline = await $.ui.mount({ ...PANE, props: { ...PANE.props, placement: 'inline', bodyColumns: 90 } })
  await inline.press({ key: 'tab-key-overview' })
  await clock.settle()
  expect(await inline.find({ key: 'status-s2' })).toBeDefined()
})

test('on the Status, a parent folds its rows by its name or its f key and opens them again, in the terminal and on desktop', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: 'demo' } as never)
  const terminal = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 80 } })
  await terminal.press({ key: 'tab-key-overview' })
  await clock.settle()
  const chevron = async () => (await terminal.find({ key: 'parent-s1' }))?.props.label
  expect(await chevron()).toBe('⌄')
  expect(await terminal.find({ key: 'status-c1' })).toBeDefined()
  expect(await terminal.find({ key: 'status-s1-tree' })).toBeDefined()

  await terminal.press({ key: 'parent-s1' })
  await clock.settle()
  expect(await chevron()).toMatch(/^› \d+$/)
  expect(await terminal.find({ key: 'status-c1' })).toBeUndefined()
  expect(await terminal.find({ key: 'status-s1-tree' })).toBeUndefined()
  expect(await terminal.find({ key: 'status-s1' })).toBeDefined()

  await terminal.press({ key: 'parent-s1' })
  await clock.settle()
  expect(await chevron()).toBe('⌄')
  expect(await terminal.find({ key: 'status-c1' })).toBeDefined()

  for (let n = 0; n < 12 && !(await terminal.find({ key: 'toggle-collapse-s1-key' })); n++) {
    await terminal.press({ key: 'next' })
    await clock.settle()
  }
  expect((await terminal.find({ key: 'parent-s1' }))?.text).toBe('f: ⌄')
  await terminal.press({ key: 'toggle-collapse-s1-key' })
  await clock.settle()
  expect(await terminal.find({ key: 'status-c1' })).toBeUndefined()
  await terminal.press({ key: 'parent-s1' })
  await clock.settle()
  expect(await terminal.find({ key: 'status-s1' })).toBeDefined()
  expect(await terminal.find({ key: 'status-c1' })).toBeDefined()
  await terminal.press({ key: 'parent-m2' })
  await clock.settle()
  expect((await terminal.find({ key: 'parent-m2' }))?.props.label).toMatch(/^› \d+$/)
  expect(await terminal.find({ key: 'status-s1' })).toBeUndefined()
  expect(await terminal.find({ key: 'goal-m2-name' })).toBeUndefined()
  expect(await terminal.find({ key: 'status-m2' })).toBeDefined()
  await terminal.press({ key: 'parent-m2' })
  await clock.settle()
  await terminal.press({ key: 'parent-s1' })
  await clock.settle()
  await terminal.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 80 } })
  await desktop.pointer({ type: 'down', x: 0, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect(await desktop.find({ key: 'parent-s1' })).toMatchObject({ type: 'Client' })
  expect(await desktop.find({ key: 'status-c1' })).toBeUndefined()
  await desktop.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'parent-s1' })
  await clock.settle()
  expect(await desktop.find({ key: 'status-c1' })).toBeDefined()
})
