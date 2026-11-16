import { expect, mock, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'
import { STATUS_TEXT_LINES } from '../hooks/status-page'
import { w, world } from './hooks-world'
import { PANE, seedTasks } from './hooks-helpers'

test(
  'on the Status, task details wrap at the docked width and are cut with an ellipsis past three lines in the terminal and on desktop',
  { timeoutMs: 20_000 },
  async ($, on) => {
    const clock = mock.clock(on, { now: 1_000_000 })
    world($, on, [])
    w.files = ['/.next-build']
    w.paneState = { isShown: true, isFocused: true }
    const name = 'Help text for every greeting command'
    const text = 'being written with examples, defaults, descriptions, environment variables, configuration precedence'
    w.statusReply = 'HEAD: Adding a greeting CLI | Building a CLI that greets by name'

    await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
    await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
    await seedTasks($, [
      { id: 's1', title: name, status: 'working', detail: text },
      { id: 's2', title: 'Loud flag', status: 'queued', detail: 'after help' },
    ])
    await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.settle()
    const terminal = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
    await terminal.press({ key: 'tab-key-overview' })
    await clock.settle()
    const textOf = async (pane: Pick<Mounted, 'find'>, key: string) => (await pane.find({ key }))?.text
    const lines = (await textOf(terminal, 'status-s1-text'))!.split('\n')
    expect(await textOf(terminal, 'status-s1-name')).toBe('Help text for every greeting\ncommand')
    expect(lines).toHaveLength(STATUS_TEXT_LINES)
    expect(lines[0]).toMatch(/0% complete · being written with/)
    expect(lines.at(-1)).toMatch(/…$/)
    expect(await textOf(terminal, 'status-s2-name')).toBe('Loud flag')
    expect(await textOf(terminal, 'status-s2-text')).toContain('after help')
    await terminal.redraw({ ...PANE.props, bodyColumns: 160 })
    expect(await textOf(terminal, 'status-s1-text')).toBe(`0% complete · ${text}`)

    const desktop = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 30 } })
    await desktop.pointer({ type: 'down', x: 0, y: 1, button: 'left', in: 'tabs' })
    await clock.settle()
    const shown = (await textOf(desktop, 'status-s1-text'))!
    expect(shown).toMatch(/^0% complete · being written with .+…$/)
    expect(shown.length).toBeLessThan(text.length)
    await desktop.redraw({ ...PANE.props, bodyColumns: 160 })
    expect(await textOf(desktop, 'status-s1-text')).toBe(`0% complete · ${text}`)
  },
)

test('on the Status in the terminal, the rows under a subject hang from its mark, ├─ for each and └─ for the last, and the line runs beside each wrapped line', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: 'demo' } as never)
  const pane = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 34 } })
  await pane.press({ key: 'tab-key-overview' })
  await clock.settle()
  const tree = async (id: string) => (await pane.find({ key: `status-${id}-tree` }))?.text.split('\n').slice(0, 3)
  const textLines = async (id: string) => (await pane.find({ key: `status-${id}-name` }))!.text.split('\n')

  expect(await tree('m2')).toEqual(['│', '│', '│'])
  expect(await tree('c1')).toEqual(['├─', '│', '│'])
  expect(await tree('c3')).toEqual(['├─', '│', '│'])
  expect(await tree('c4')).toEqual(['└─', ' ', ' '])
  expect(await tree('c5')).toEqual(['└─', ' ', ' '])
  expect(await tree('m3')).toBeUndefined()
  expect((await textLines('c3')).length).toBeGreaterThan(1)
  await pane.redraw({ ...PANE.props, bodyColumns: 120 })
  expect(await textLines('c3')).toEqual(['Tune how hard a pinch must be · waiting'])
})

test('on the Status, a task tree stays the source of Working on while the goal keeps its own controls', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  w.paneState = { isShown: true, isFocused: true }
  w.statusReply = ['HEAD: Adding a greeting CLI | Building a CLI that greets by name', 'GOAL: Greeting CLI ships'].join(
    '\n',
  )

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'add a greeting cli', wait: false, origin: { kind: 'composer' } })
  await seedTasks($, [
    { id: 's1', title: 'Help text', status: 'working', detail: 'being written' },
    { id: 's2', title: 'Loud flag', status: 'working', detail: 'parsing done' },
    { id: 's3', title: 'Docs', status: 'queued', detail: 'after help' },
  ])
  await $.turn.complete({ answer: 'Plan ready.', durationMs: 5, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const docked = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
  await docked.press({ key: 'tab-key-overview' })
  await clock.settle()
  expect(await docked.find({ key: 'status-s1' })).toBeDefined()
  await docked.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 36 } })
  await desktop.pointer({ type: 'down', x: 0, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect(await desktop.find({ key: 'goal-text' })).toBeDefined()
  await desktop.unmount()

  const inline = await $.ui.mount({ ...PANE, props: { ...PANE.props, placement: 'inline', bodyColumns: 90 } })
  await inline.press({ key: 'tab-key-overview' })
  await clock.settle()
  expect(await inline.find({ key: 'status-s2' })).toBeDefined()
})
