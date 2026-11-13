import { expect, test } from 'bun:test'

import { isLookFile, pressFile } from '../../hooks/herdr-press-file'
import { NO_HOLDS } from '../../hooks/timing'
import type { LocalResult } from '../../types'
import { GIVE_UP_MS } from '../src/out'
import { PressQueue } from '../src/press-queue'
import type { PressTarget, QueueIo } from '../src/press-queue'
import { AGENT, NOW, demoScreen } from './fixtures'

function fakeIo(overrides: Partial<QueueIo> = {}) {
  const files = new Map<string, string>()
  const woken: [string, string][] = []
  const clock = { now: NOW }
  const io: QueueIo = {
    now: () => clock.now,
    random: () => 0.5,
    write: async (path, text) => (files.set(path, text), null),
    isGone: async path => !files.has(path),
    claim: async path => files.delete(path),
    wake: async (terminal, pressId) => void woken.push([terminal, pressId]),
    ...overrides,
  }
  return { io, files, woken, clock }
}

const { view } = demoScreen()
const rowId = view.needsYou.questions[0]!.id
const target: PressTarget = {
  appHome: '/app',
  sessionId: 's1',
  terminal: 't9',
  view,
  holds: NO_HOLDS,
  projectFolder: '/w',
}
const open = [{ kind: 'open' as const, target: '/w/plan.md', name: 'plan.md' }]

test('a press is refused, with the reason on its row, when its row has a press out or there is no session', () => {
  const queue = new PressQueue(fakeIo().io)
  expect(queue.send(target, { action: 'done', id: rowId }, [], 'Done').is).toBe('sent')
  const again = queue.send(target, { action: 'type', id: rowId, text: 'hi' }, [], 'Send', 'hi')
  expect(again.is).toBe('refused')
  expect(queue.lines[rowId]).toEqual({ text: 'Not sent: the last press on this row has not finished.', tone: 'error' })
  expect(queue.outs.length).toBe(1)
  expect(new PressQueue(fakeIo().io).send(null, { action: 'done', id: rowId }, [], 'Done').is).toBe('refused')
})

test('a press shows its own opens’ result at once, then writes its file with it and wakes the session file’s terminal', async () => {
  const { io, files, woken, clock } = fakeIo()
  const queue = new PressQueue(io)
  const sent = queue.send(target, { action: 'done', id: rowId }, open, 'Open plan')
  if (sent.is !== 'sent') throw new Error('refused')
  const drawn: (string | undefined)[] = []
  await sent.finish(
    async (_effects, pending): Promise<LocalResult> => {
      clock.now = NOW + GIVE_UP_MS * 2
      return { ...pending, state: 'done' }
    },
    () => drawn.push(queue.outs[0]?.result?.state),
  )
  expect(drawn).toEqual(['done'])
  const [out] = queue.outs
  expect(out?.result?.state).toBe('done')
  const file = pressFile([...files.values()][0]!)
  expect(file.ok && !isLookFile(file.file) && file.file.result).toEqual({ error: null })
  expect(woken).toEqual([['t9', out!.pressId]])
  await queue.settle(view, null, AGENT)
  expect(queue.outs).toEqual([out!])
})

test('a press whose file is not yet written is not taken and does not give up', async () => {
  const { io, clock } = fakeIo()
  const queue = new PressQueue(io)
  const sent = queue.send(target, { action: 'done', id: rowId }, open, 'Open plan')
  if (sent.is !== 'sent') throw new Error('refused')
  let finishOpen = () => undefined as void
  const finishing = sent.finish(
    (_effects, pending) => new Promise(done => (finishOpen = () => done({ ...pending, state: 'done' }))),
    () => undefined,
  )
  clock.now = NOW + GIVE_UP_MS * 2
  await queue.settle(view, null, AGENT)
  expect(queue.outs.map(o => [o.isWritten, o.isTaken])).toEqual([[false, false]])
  finishOpen()
  await finishing
  expect(queue.outs[0]?.isWritten).toBe(true)
})

test('at the give-up time the look takes back a press no host took, and one a host took meanwhile waits as taken', async () => {
  const lost = fakeIo()
  const queue = new PressQueue(lost.io)
  const sent = queue.send(target, { action: 'done', id: rowId }, [], 'Done')
  if (sent.is === 'sent')
    await sent.finish(
      async (_e, pending) => pending,
      () => undefined,
    )
  lost.clock.now = NOW + GIVE_UP_MS
  await queue.settle(view, null, AGENT)
  expect(lost.files.size).toBe(0)
  expect(queue.outs).toEqual([])
  expect(queue.lines[rowId]?.text).toBe(`Not applied: ${AGENT}'s inbox did not answer.`)

  const raced = fakeIo({ isGone: async () => false, claim: async () => false })
  const held = new PressQueue(raced.io)
  const pressed = held.send(target, { action: 'done', id: rowId }, [], 'Done')
  if (pressed.is === 'sent')
    await pressed.finish(
      async (_e, pending) => pending,
      () => undefined,
    )
  raced.clock.now = NOW + GIVE_UP_MS
  await held.settle(view, null, AGENT)
  expect(held.outs.map(o => [o.isTaken, o.waitingSince])).toEqual([[true, NOW + GIVE_UP_MS]])
  expect(held.lines).toEqual({})
})
