import { expect, mock, test } from 'claude-code/testing'
import { PRESS_GUARD_MS } from '../hooks/timing'
import { w, world } from './hooks-world'
import { PANE, replyField, replyKey } from './hooks-helpers'

test('a title press opens a closed row and collapses the open one, a collapsed row’s title expands it, and a collapse closes the row’s reply field and keeps its draft', async ($, on) => {
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
  const isOpen = async (id: string) => (await pane.find({ key: `collapse-${id}` })) !== undefined
  expect(await isOpen('i1')).toBe(true)
  await pane.press({ key: 'title-i2' })
  await clock.settle()
  expect([await isOpen('i1'), await isOpen('i2')]).toEqual([false, true])

  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i2' })
  await pane.input({ key: await replyKey(pane, 'i2'), text: 'greet is fine', kind: 'change' })
  await pane.press({ key: 'collapse-i2' })
  await clock.settle()
  expect([await isOpen('i1'), await isOpen('i2')]).toEqual([false, false])
  expect(await replyField(pane, 'i2')).toBeUndefined()

  await pane.press({ key: 'title-i2' })
  await clock.settle()
  expect([await isOpen('i1'), await isOpen('i2')]).toEqual([false, true])
  expect(await replyField(pane, 'i2')).toBeUndefined()
  await clock.advance(PRESS_GUARD_MS)
  await pane.press({ key: 'typekey-i2' })
  expect((await replyField(pane, 'i2'))?.props.value).toBe('greet is fine')
  expect(w.sent).toEqual([])
})
