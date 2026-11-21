import { expect, test } from 'bun:test'

import { isPressFile, pressFile } from '../../core/remote/herdr-press-file'
import { NO_HOLDS } from '../../core/view/timing'
import type { SessionView } from '../../core/view/session-view'
import type { Delivery, LocalResult, PressKind } from '../../types'
import type { SettledOutcome } from '../../core/view/ui-controller-types'
import type { LastPress } from '../src/files'
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
  when: [],
}
const open = [{ kind: 'open' as const, target: '/w/plan.md', name: 'plan.md' }]
const opts = (label: string, kind: PressKind | null, uiPressId: number) => ({ effects: [], label, kind, uiPressId })

test('a press is refused, with the reason on its row, when its row has a press out or there is no session', () => {
  const queue = new PressQueue(fakeIo().io)
  expect(queue.send(target, { action: 'done', id: rowId }, opts('Done', 'mark', 1)).is).toBe('sent')
  const again = queue.send(target, { action: 'type', id: rowId, text: 'hi' }, { ...opts('Send', null, 2), reply: 'hi' })
  expect(again.is).toBe('refused')
  expect(queue.lines[rowId]).toEqual({
    text: 'Not sent: the last press on this row has not finished.',
    tone: 'error',
    source: { is: 'notSent', reason: 'the last press on this row has not finished.', retry: null },
  })
  expect(queue.outs.length).toBe(1)
  expect(queue.takeEnded()).toEqual([
    {
      uiPressId: 2,
      outcome: { error: 'the last press on this row has not finished.', note: null, isUnconfirmed: false },
    },
  ])
  expect(new PressQueue(fakeIo().io).send(null, { action: 'done', id: rowId }, opts('Done', 'mark', 1)).is).toBe(
    'refused',
  )
})

test('a press shows its own opens’ result at once, then writes its file with it and wakes the session file’s terminal', async () => {
  const { io, files, woken, clock } = fakeIo()
  const queue = new PressQueue(io)
  const sent = queue.send(target, { action: 'done', id: rowId }, { ...opts('Open plan', 'local', 1), effects: open })
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
  expect(file.ok && isPressFile(file.file) && file.file.result).toEqual({ error: null })
  expect(woken).toEqual([['t9', out!.pressId]])
  await queue.settle(view, null, AGENT)
  expect(queue.outs).toEqual([out!])
})

test('a press whose file is not yet written is not taken and does not give up', async () => {
  const { io, clock } = fakeIo()
  const queue = new PressQueue(io)
  const sent = queue.send(target, { action: 'done', id: rowId }, { ...opts('Open plan', 'local', 1), effects: open })
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
  const sent = queue.send(target, { action: 'done', id: rowId }, opts('Done', 'mark', 1))
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
  expect(queue.takeEnded().map(e => [e.uiPressId, e.outcome.error])).toEqual([[1, `${AGENT}'s inbox did not answer.`]])

  const raced = fakeIo({ isGone: async () => false, claim: async () => false })
  const held = new PressQueue(raced.io)
  const pressed = held.send(target, { action: 'done', id: rowId }, opts('Done', 'mark', 1))
  if (pressed.is === 'sent')
    await pressed.finish(
      async (_e, pending) => pending,
      () => undefined,
    )
  raced.clock.now = NOW + GIVE_UP_MS
  await held.settle(view, null, AGENT)
  expect(held.outs.map(o => [o.isTaken, o.waitingSince])).toEqual([[true, NOW + GIVE_UP_MS]])
  expect(held.lines).toEqual({})
  expect(held.takeEnded()).toEqual([])
})

const REPLY = 'Call it hello'
const typed = { action: 'type' as const, id: rowId, text: REPLY }

async function sendReply(queue: PressQueue, uiPressId = 1) {
  const sent = queue.send(target, typed, { ...opts('Send', null, uiPressId), reply: REPLY })
  if (sent.is !== 'sent') throw new Error('refused')
  const pressId = queue.outs.at(-1)!.pressId
  await sent.finish(
    async (_e, pending) => pending,
    () => undefined,
  )
  return pressId
}

const replied = (delivery: Delivery): SessionView => ({
  ...view,
  lastActions: {
    ...view.lastActions,
    [rowId]: { kind: 'talk', action: 'type', text: 'Send', reply: REPLY, at: NOW + 50, delivery },
  },
})
const taken = () => fakeIo({ isGone: async () => true }).io

test('the host’s answer to a reply ends it as applied, stale or failed, for the shared controller', async () => {
  const answers: [SessionView, (pressId: string) => LastPress, SettledOutcome][] = [
    [
      replied({ state: 'arrived' }),
      id => ({ id, outcome: 'applied' }),
      { error: null, note: null, isUnconfirmed: false },
    ],
    [
      replied({ state: 'queued', message: REPLY }),
      id => ({ id, outcome: 'stale' }),
      { error: null, note: 'stale', isUnconfirmed: false },
    ],
    [
      replied({ state: 'failed', reason: 'the session refused it' }),
      id => ({ id, outcome: 'applied' }),
      { error: 'the session refused it', note: null, isUnconfirmed: false },
    ],
    [
      replied({ state: 'unconfirmed', message: REPLY }),
      id => ({ id, outcome: 'applied' }),
      { error: null, note: null, isUnconfirmed: true },
    ],
  ]
  for (const [shown, last, outcome] of answers) {
    const queue = new PressQueue(taken())
    const pressId = await sendReply(queue, 7)
    await queue.settle(shown, last(pressId), AGENT)
    expect({ outs: queue.outs.length, ended: queue.takeEnded() }).toEqual({
      outs: 0,
      ended: [{ uiPressId: 7, outcome }],
    })
  }
})

test('a reply whose file no host took waits, even once the host answers a later press', async () => {
  const queue = new PressQueue(fakeIo().io)
  const pressId = await sendReply(queue)
  await queue.settle(view, { id: `${pressId}~`, outcome: 'applied' }, AGENT)
  expect({ outs: queue.outs.map(o => o.pressId), ended: queue.takeEnded() }).toEqual({ outs: [pressId], ended: [] })
})

test('a reply whose file could not be written ends refused, with the reason on its row', async () => {
  const unwritten = new PressQueue(fakeIo({ write: async () => 'the disk is full' }).io)
  await sendReply(unwritten, 3)
  expect([unwritten.isAwaiting(), unwritten.holdsPresses()]).toEqual([false, true])
  const [ended] = unwritten.takeEnded()
  expect(unwritten.holdsPresses()).toBe(false)
  expect({ id: ended?.uiPressId, isError: ended?.outcome.error !== null, line: unwritten.lines[rowId]?.tone }).toEqual({
    id: 3,
    isError: true,
    line: 'error',
  })
})

test('a press the host refused ends with the host’s reason on its row', async () => {
  const queue = new PressQueue(taken())
  const pressId = await sendReply(queue, 4)
  const why = 'This changed before your press. Nothing was sent.'
  await queue.settle(view, { id: pressId, outcome: 'refused', why }, AGENT)
  expect({ line: queue.lines[rowId], ended: queue.takeEnded() }).toEqual({
    line: { text: why, tone: 'error', source: { is: 'notSent', reason: why, retry: null } },
    ended: [{ uiPressId: 4, outcome: { error: why, note: null, isUnconfirmed: false } }],
  })
})
