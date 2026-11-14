import { expect, test } from 'bun:test'

import { isLookFile, pressFile } from '../../hooks/herdr-press-file'
import { NO_HOLDS } from '../../hooks/timing'
import type { SessionView } from '../../hooks/session-view'
import type { Delivery, LocalResult } from '../../types'
import type { LastPress } from '../src/files'
import { withoutConfirmed } from '../src/keys'
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

const REPLY = 'Call it hello'
const typed = { action: 'type' as const, id: rowId, text: REPLY }

async function sendReply(queue: PressQueue) {
  const sent = queue.send(target, typed, [], 'Send', REPLY)
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
const queued = replied({ state: 'queued', message: REPLY })
const applied = (id: string): LastPress => ({ id, outcome: 'applied' })

const drafts = { [rowId]: { text: `${REPLY} `, since: NOW } }
const taken = () => fakeIo({ isGone: async () => true }).io

async function draftsAfter(answers: [SessionView, (pressId: string) => LastPress | null][]) {
  const queue = new PressQueue(taken())
  const pressId = await sendReply(queue)
  const kept = []
  for (const [shown, last] of answers) {
    const confirmed = await queue.settle(shown, last(pressId), AGENT)
    kept.push(withoutConfirmed(drafts, confirmed, null, queue.sentTexts).drafts)
  }
  return { kept, queue }
}

test('a sent reply keeps its draft until the host finishes its press, then a confirmed send deletes it', async () => {
  const named = await draftsAfter([
    [queued, () => null],
    [queued, applied],
  ])
  expect(named.kept).toEqual([drafts, {}])
  expect(named.queue.isAwaiting()).toBe(false)
  const ended = await draftsAfter([[queued, () => null]])
  expect([ended.queue.outs.length, ended.queue.isAwaiting()]).toEqual([0, true])
  const passed = await draftsAfter([[replied({ state: 'arrived' }), id => applied(`${id}~`)]])
  expect(passed.kept).toEqual([{}])
})

test('a failed, unconfirmed, stale or unsaved send keeps its draft', async () => {
  const answers: [SessionView, (pressId: string) => LastPress][] = [
    [replied({ state: 'failed', reason: 'the session refused it' }), applied],
    [replied({ state: 'unconfirmed', message: REPLY }), applied],
    [queued, id => ({ id, outcome: 'stale' })],
    [view, applied],
  ]
  for (const answer of answers) {
    const { kept, queue } = await draftsAfter([answer])
    expect(kept).toEqual([drafts])
    expect(queue.isAwaiting()).toBe(false)
  }
})

test('a reply whose file no host took waits, even once the host answers a later press', async () => {
  const queue = new PressQueue(fakeIo().io)
  const pressId = await sendReply(queue)
  expect(await queue.settle(queued, applied(`${pressId}~`), AGENT)).toEqual([])
  expect(queue.sentTexts.map(s => s.pressId)).toEqual([pressId])
})

test('a reply the look gives up on keeps its draft, whether no host took it or its file could not be written', async () => {
  const lost = fakeIo()
  const queue = new PressQueue(lost.io)
  await sendReply(queue)
  lost.clock.now = NOW + GIVE_UP_MS
  expect(await queue.settle(view, null, AGENT)).toEqual([])
  expect(queue.lines[rowId]?.text).toBe(`Not applied: ${AGENT}'s inbox did not answer.`)
  expect(queue.isAwaiting()).toBe(false)
  const unwritten = new PressQueue(fakeIo({ write: async () => 'the disk is full' }).io)
  await sendReply(unwritten)
  expect(unwritten.isAwaiting()).toBe(false)
})

test('a confirmed send leaves a draft edited after it, and deletes an unedited one once its open field closes', async () => {
  const queue = new PressQueue(taken())
  const confirmed = await queue.settle(queued, applied(await sendReply(queue)), AGENT)
  const edited = { [rowId]: { text: `${REPLY}, and add a test`, since: NOW } }
  expect(withoutConfirmed(edited, confirmed, null, []).drafts).toEqual(edited)
  const open = withoutConfirmed(drafts, confirmed, rowId, [])
  expect(open).toEqual({ drafts, waiting: confirmed })
  expect(withoutConfirmed(drafts, open.waiting, null, []).drafts).toEqual({})
})

test('a later send on the row, still out, keeps the draft when an earlier send is confirmed', async () => {
  const { io, clock } = fakeIo({ isGone: async () => true })
  const queue = new PressQueue(io)
  const first = await sendReply(queue)
  await queue.settle(queued, null, AGENT)
  clock.now = NOW + 1000
  await sendReply(queue)
  const confirmed = await queue.settle(queued, applied(first), AGENT)
  expect(confirmed.map(c => c.pressId)).toEqual([first])
  expect(withoutConfirmed(drafts, confirmed, null, queue.sentTexts)).toEqual({ drafts, waiting: [] })
})
