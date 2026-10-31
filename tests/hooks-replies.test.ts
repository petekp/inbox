import { expect, mock, test } from 'claude-code/testing'
import { PRESS_GUARD_MS, SETTLED_MS } from '../hooks/timing'
import { w, world } from './hooks-world'
import { BAND, PANE } from './hooks-helpers'

test('a reply becomes open items, and "1. yes" carries the question', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  const prompts: string[] = []
  world($, on, prompts)

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

  expect(prompts.length).toBe(1)
  expect(prompts[0]).toContain('<person>\nadd a greeting cli\n</person>')

  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  expect(await band.find({ text: /Asks 2/ })).toBeDefined()
  expect(await band.find({ text: /Use Node or Python\?|Name the command greet\?/ })).toBeUndefined()

  const answered = await $.prompt.submit({ text: '1. node\n2. yes', wait: false, origin: { kind: 'composer' } })
  expect(answered.context?.join('\n')).toContain('1 → "Use Node or Python?"')
  expect(answered.context?.join('\n')).toContain(
    'Waiting on the user:\n- (1) "Use Node or Python?"; options: Node / Python; recommended: Node (close id: i1)',
  )
  const unchanged = await $.prompt.submit({ text: 'also add a --loud flag', wait: false, origin: { kind: 'composer' } })
  expect(unchanged.context?.join('\n') ?? '').not.toContain('Waiting on the user')

  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'answer-i1-0' })
  expect(w.sent).toEqual(['Re "Use Node or Python?": Node'])
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  await $.turn.complete({ answer: 'Using Node.', durationMs: 5, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(prompts.at(-1)).toContain('Re "Use Node or Python?": Node\n</person>')
})

test('a question with 7 options shows 4 until [All 7 options], draws its steps after them, and letters only the first 9', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  w.ledgerReply = [
    'NEW: decide | 1 | Which color? | Red / Orange / Yellow / Green / Blue / Indigo / Violet | Green',
    'HELP: new 1 | run | ./a.sh | a script',
    'HELP: new 1 | run | ./b.sh | b script',
    'HELP: new 1 | run | ./c.sh | c script',
  ].join('\n')

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'pick a color', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: 'Run ./a.sh, ./b.sh or ./c.sh first.',
    durationMs: 5,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()
  const pane = await $.ui.mount(PANE)
  const hotkey = async (key: string) => (await pane.find({ key: `${key}-key` }))?.props.hotkey

  expect(await pane.find({ key: 'answer-i1-3' })).toBeDefined()
  expect(await pane.find({ key: 'answer-i1-4' })).toBeUndefined()
  expect(await hotkey('answer-i1-4')).toBeUndefined()
  expect((await pane.find({ key: 'all-options-i1' }))?.props.label).toBe('All 7 options')
  expect([
    await hotkey('answer-i1-3'),
    await hotkey('answer-i1-2'),
    await hotkey('help-i1-0'),
    await hotkey('help-i1-2'),
  ]).toEqual(['a', 'f', 'g', 'i'])
  expect(await pane.find({ key: 'answer-i1-3', text: ': Green (recommended)' })).toBeDefined()

  await pane.press({ key: 'all-options-i1' })
  expect(await pane.find({ key: 'answer-i1-6' })).toBeDefined()
  expect(await pane.find({ key: 'all-options-i1' })).toBeUndefined()
  expect([await hotkey('answer-i1-6'), await hotkey('help-i1-0'), await hotkey('help-i1-1')]).toEqual(['i', 'l', 'm'])
  expect(await hotkey('help-i1-2')).toBeUndefined()
  expect((await pane.find({ key: 'help-i1-2' }))?.props.label).toBe('Run c script')
  await pane.press({ key: 'answer-i1-6' })
  expect(w.sent).toEqual(['Re "Which color?": Violet'])
})

test('once the person answers or closes the last waiting row, a row from a later reply opens', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'Noted.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }

  await $.session.start({ cwd: '/tmp/project', surface: 'terminal', isInteractive: true })
  w.ledgerReply = 'NEW: decide | 1 | Use Node or Python? | Node / Python | Node'
  await reply('add a greeting cli', 't1')
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'answer-i1-0' })
  await clock.advance(SETTLED_MS)

  w.ledgerReply = 'CLOSED: i1 | Node chosen\nNEW: decide | 1 | Name the command greet? | Yes / No | Yes'
  await reply('use node', 't2')
  expect(await pane.find({ key: 'answer-i2-0' })).toBeDefined()

  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'dismiss-i2' })
  await clock.advance(SETTLED_MS)
  w.ledgerReply = 'NEW: do | - | Run npm install | - | -'
  await reply('carry on', 't3')
  expect(await pane.find({ key: 'done-i3' })).toBeDefined()
})
