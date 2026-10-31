import { expect, mock, test } from 'claude-code/testing'
import { PRESS_GUARD_MS } from '../hooks/timing'
import { w, world } from './hooks-world'
import { BAND, PANE, selectRow, leaveAndReturn, replyField, replyKey } from './hooks-helpers'

test('a question Claude closes while the person types an answer stays in place with its field and words, out of the count, until its answer sends and the person types their next message, then folds into Closed', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))

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
  const pane = await $.ui.mount(PANE)
  const band = await $.ui.mount({ plugin: 'inbox', surface: 'terminal', ...BAND })
  await selectRow(pane, 'i2')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i2' })
  await pane.input({ key: await replyKey(pane, 'i2'), text: 'Call it hello', kind: 'change' })
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'i2', reason: 'no longer applies: settled in chat' } as never)
  await clock.settle()
  await clock.advance(9000)

  expect(await replyField(pane, 'i2')).toBeDefined()
  expect((await pane.find({ key: 'row-i2' }))?.text).toMatch(
    /Closed\sby\sClaude:\sno\slonger\sapplies:\ssettled\sin\schat/,
  )
  expect(await pane.find({ key: 'discard-i2' })).toBeDefined()
  expect(await pane.find({ key: 'cancel-i2' })).toBeUndefined()
  expect(await band.find({ text: /Asks 1/ })).toBeDefined()
  expect(await pane.find({ text: /closed/ })).toBeUndefined()

  await pane.press({ key: 'send-i2' })
  await clock.settle()
  expect(w.sent.at(-1)).toBe('Re "Name the command greet?": Call it hello')
  expect(await replyField(pane, 'i2')).toBeUndefined()
  expect(await pane.find({ key: 'settled-i2' })).toBeDefined()
  expect(await pane.find({ text: /^Replied$/ })).toBeDefined()
  expect((await pane.find({ key: 'settled-i2' }))?.text).toMatch(/✗\s*Replied/)
  await clock.advance(9000)
  expect(await pane.find({ key: 'settled-i2' })).toBeDefined()
  await $.prompt.submit({ text: 'what is next?', wait: false, origin: { kind: 'composer' } })
  await clock.settle()
  expect(await pane.find({ key: 'row-i2' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-i2' })).toBeUndefined()
  expect(await pane.find({ text: /1 closed/ })).toBeDefined()
  await pane.press({ key: 'fold-question' })
  expect((await pane.find({ key: 'closed-i2' }))?.text).toMatch(/✗\s*Closed\sby\sClaude/)
})

test('a held row and the rows that closed while the tab shows stay in place, and the reply still sends, after more items close than the Closed list keeps', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))
  const reply = async (text: string, turnId: string) => {
    await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text, turnId })
    await $.turn.complete({ answer: 'Noted.', durationMs: 5, isAborted: false, turnId, reason: 'answer' })
    await clock.settle()
  }
  const tasks = [
    'Water the plants',
    'Feed the cat',
    'Rotate the signing key',
    'Approve the deploy',
    'Pin the Node version',
    'Update the README',
    'Tag the release',
    'Clear the build cache',
    'Rename the branch',
    'Archive old logs',
    'Book the venue',
    'Order more paper',
    'Renew the domain',
  ]
  const others = tasks.map((_, n) => `i${n + 3}`)

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
  const pane = await $.ui.mount(PANE)
  await selectRow(pane, 'i2')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i2' })
  await pane.input({ key: await replyKey(pane, 'i2'), text: 'Call it hello', kind: 'change' })
  await $.tool.call({
    tool: 'mcp__inbox__close',
    id: 'i2',
    reason: 'settled in chat, since the team already picked the name for the command in this morning’s standup',
  } as never)
  await clock.settle()
  w.ledgerReply = tasks.map(t => `NEW: do | - | ${t} | - | -`).join('\n')
  await reply('keep going', 't2')
  expect(await pane.find({ text: /Renew the domain/ })).toBeDefined()
  w.ledgerReply = others.map(id => `CLOSED: ${id} | done`).join('\n')
  await reply('all done', 't3')
  await clock.advance(9000)

  expect(await pane.find({ key: 'settled-i3' })).toBeDefined()
  expect(await pane.find({ key: 'settled-i15' })).toBeDefined()
  expect(await replyField(pane, 'i2')).toBeDefined()
  expect((await pane.find({ key: 'row-i2' }))?.text).toMatch(/Closed\sby\sClaude:\ssettled\sin\schat/)
  expect((await pane.find({ key: 'row-i2' }))?.text).toContain('Claude: settled in chat, since the team')

  await pane.press({ key: 'send-i2' })
  await clock.settle()
  expect(w.sent.at(-1)).toBe('Re "Name the command greet?": Call it hello')
  expect(await pane.find({ key: 'settled-i2' })).toBeDefined()
})

test('Discard ends a held row’s reply and folds it into Closed at once, and a row the person dismisses with a draft settles with Undo instead of holding', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  world($, on, [])
  on('ui.focus', () => ({}))

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
  const pane = await $.ui.mount(PANE)
  await pane.press({ key: 'typekey-i1' })
  await pane.input({ key: await replyKey(pane, 'i1'), text: 'Deno, actually', kind: 'change' })
  await pane.press({ key: 'cancel-i1' })
  await selectRow(pane, 'i2')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i2' })
  await pane.input({ key: await replyKey(pane, 'i2'), text: 'Call it hello', kind: 'change' })
  await pane.press({ key: 'cancel-i2' })
  await $.tool.call({ tool: 'mcp__inbox__close', id: 'i2', reason: 'settled in chat' } as never)
  await clock.settle()
  await clock.advance(1000)

  expect(await replyField(pane, 'i2')).toBeUndefined()
  expect((await pane.find({ key: 'row-i2' }))?.text).toMatch(/Closed\sby\sClaude:\ssettled\sin\schat/)
  await pane.press({ key: 'discard-i2' })
  await clock.settle()
  expect(await pane.find({ key: 'row-i2' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-i2' })).toBeUndefined()
  expect(await pane.find({ text: /settled\sin\schat/ })).toBeUndefined()
  expect(await pane.find({ text: /1 closed/ })).toBeDefined()
  expect(w.sent).toEqual([])

  await selectRow(pane, 'i1')
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'dismiss-i1' })
  await clock.settle()
  expect(await pane.find({ key: 'undo-i1' })).toBeDefined()
  await clock.advance(9000)
  expect(await pane.find({ key: 'settled-i1' })).toBeDefined()
  expect(await pane.find({ key: 'undo-i1' })).toBeUndefined()
  await leaveAndReturn(pane, clock, 'needsYou')
  expect(await pane.find({ key: 'row-i1' })).toBeUndefined()
  expect(await pane.find({ key: 'settled-i1' })).toBeUndefined()
  expect(await pane.find({ text: /2 closed/ })).toBeDefined()
})
