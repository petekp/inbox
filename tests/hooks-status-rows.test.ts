import { expect, mock, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'
import { STATUS_TEXT_LINES, LOOK_DASH, LOOK_TEXT } from '../hooks/status-page'
import { w, world } from './hooks-world'
import { PANE } from './hooks-helpers'

test('on the Status, where a subject stands goes under its name, wraps to three lines at the docked width and is cut with an ellipsis past them, and a merged line is cut to one line at a phrase, in the terminal and on desktop', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
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

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 36 } })
  await desktop.pointer({ type: 'down', x: 0, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  const shown = (await textOf(desktop, 'status-s1-text'))!
  expect(shown).toMatch(/^being written with .+…$/)
  expect(shown.length).toBeLessThan(text.length)
  expect(await textOf(desktop, 'status-s1-merged')).toMatch(/^merged in: Sync retry(, backoff)?…$/)
  await desktop.redraw({ ...PANE.props, bodyColumns: 120 })
  expect(await textOf(desktop, 'status-s1-text')).toBe(text)
  expect(await textOf(desktop, 'status-s1-merged')).toBe('merged in: Sync retry, backoff, and jitter')
})

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

  expect(await tree('s1')).toEqual(['│', '│', '│'])
  expect(await tree('c1')).toEqual(['├─', '│', '│'])
  expect(await tree('c3')).toEqual(['├─', '│', '│'])
  expect(await tree('c4')).toEqual(['└─', ' ', ' '])
  expect(await tree('c2')).toEqual(['└─', ' ', ' '])
  expect(await tree('s3')).toBeUndefined()
  expect((await textLines('c3')).length).toBeGreaterThan(1)
  await pane.redraw({ ...PANE.props, bodyColumns: 120 })
  expect(await textLines('c3')).toEqual(['Tune how hard a pinch must be · waiting'])
})

test('on the Status, a rule sets each item apart in the docked terminal and on desktop, with none inside a subject’s tree or beside the look line, and the inline pane draws none', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: 'demo' } as never)
  const ruledAbove = async (pane: Pick<Mounted, 'findAll'>) =>
    (await pane.findAll({ type: 'Box' })).flatMap(b =>
      b.key?.startsWith('status-rule-') ? [b.key.slice('status-rule-'.length)] : [],
    )
  const docked = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
  await docked.press({ key: 'tab-key-overview' })
  await clock.settle()
  expect(await ruledAbove(docked)).toEqual(['s3', 's1', 's4', 'done'])
  await docked.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 36 } })
  await desktop.pointer({ type: 'down', x: 0, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  expect(await ruledAbove(desktop)).toEqual(['s3', 's1', 's4', 'done'])
  await desktop.unmount()

  const inline = await $.ui.mount({ ...PANE, props: { ...PANE.props, placement: 'inline', bodyColumns: 90 } })
  await inline.press({ key: 'tab-key-overview' })
  await clock.settle()
  expect(await inline.find({ key: 'status-s1' })).toBeDefined()
  expect(await ruledAbove(inline)).toEqual([])
})

test('on the Status, the look line is a dashed rule, unlike the solid rules between items, with a blank line above and below it in the terminal and space above and below it on desktop', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.files = ['/.next-build']
  expect(LOOK_DASH).not.toBe('─')

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'inbox', args: 'demo' } as never)
  const docked = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
  await docked.press({ key: 'tab-key-overview' })
  await clock.settle()
  const gaps = async (pane: Pick<Mounted, 'findAll'>) =>
    (await pane.findAll({ type: 'Box' })).flatMap(b =>
      b.key === 'look-above' || b.key === 'look-below' ? [[b.key, b.props.height]] : [],
    )
  expect(await gaps(docked)).toEqual([
    ['look-above', 1],
    ['look-below', 1],
  ])
  const [left, right] = (await docked.find({ key: 'status-look' }))!.text.trim().split(` ${LOOK_TEXT} `)
  expect(left).toMatch(new RegExp(`^${LOOK_DASH}+$`))
  expect(right).toMatch(new RegExp(`^${LOOK_DASH}+$`))
  await docked.unmount()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, bodyColumns: 36 } })
  await desktop.pointer({ type: 'down', x: 0, y: 1, button: 'left', in: 'tabs' })
  await clock.settle()
  const [above, below] = (await gaps(desktop)).map(([, height]) => height as number)
  expect(above).toBeGreaterThan(0)
  expect(above).toBeLessThan(1)
  expect(below).toBe(above)
  const keys = (await desktop.findAll({ type: 'Box' })).map(b => b.key ?? '')
  const dashes = keys.filter(k => /^dash-\d+$/.test(k)).length
  expect(dashes).toBeGreaterThan(4)
  expect(keys.filter(k => k.startsWith('dash-gap-')).length).toBe(dashes - 2)
})
