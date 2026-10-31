import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyPress, markSentToAgent, refuseDoneNotification } from '../../hooks/press-reducer'
import { runLocalEffects, runSends } from '../../hooks/press-effects'
import type { EffectHost } from '../../hooks/press-effects'
import { pendingResult, withLasts } from '../../hooks/pressed'
import type { RowPress } from '../../hooks/presses'
import { applyPrPress } from '../../hooks/pr-tab'
import { demoView } from '../../hooks/demo'
import type { LastAction } from '../../types'
import { pressed, withItems } from './press-fixtures'

test('an older same-time send failure does not claim a newer failed action', async () => {
  let lasts: Record<string, LastAction> = {
    i1: {
      kind: 'talk' as const,
      action: 'explain',
      text: 'Explain',
      at: 50,
      delivery: { state: 'failed' as const, reason: 'new send failed', id: 'new' },
    },
  }
  const host: EffectHost = {
    now: () => 50,
    deliveryId: () => 'old',
    perform: async () => null,
    send: async () => ({ state: 'rejected', reason: 'old send failed' }),
    saveLasts: async change => (lasts = change(lasts)),
    saveLedger: async () => {},
  }
  const result = await runSends(host, [{ kind: 'send', text: 'same text', by: null }], 'i1', ['i1'], 50)
  assert.deepEqual(result, { state: 'rejected', reason: 'old send failed', isRowFailed: false })
  const finalDelivery = lasts.i1?.delivery
  assert.equal(finalDelivery?.state, 'failed')
  assert.equal(finalDelivery?.state === 'failed' ? finalDelivery.id : null, 'new')
})

test('an older same-time local completion cannot replace the newer press of the same action', async () => {
  const effect = { kind: 'open' as const, target: 'same', name: 'same' }
  const older = pendingResult([effect], 50, 'older')
  const newer = pendingResult([effect], 50, 'newer')
  let lasts: Record<string, LastAction> = {
    i1: { kind: 'local', action: 'step-0', text: 'Open same', at: 50, result: newer },
  }
  const host: EffectHost = {
    now: () => 50,
    deliveryId: () => '',
    perform: async () => 'older failed',
    send: async () => ({ state: 'accepted' }),
    saveLasts: async change => (lasts = change(lasts)),
    saveLedger: async () => {},
  }

  await runLocalEffects(host, [effect], 'i1', older)
  assert.deepEqual(lasts.i1?.result, newer)

  host.perform = async () => null
  await runLocalEffects(host, [effect], 'i1', newer)
  assert.deepEqual(lasts.i1?.result, {
    state: 'done',
    parts: [{ kind: 'open', name: 'same', isCommand: false, error: null }],
    at: 50,
    pressId: 'newer',
  })
})

test('a rejected local effect records failure on the pressed row', async () => {
  const effect = { kind: 'open' as const, target: 'file.command', name: 'file.command' }
  const pending = pendingResult([effect], 50, 'press')
  let lasts: Record<string, LastAction> = {
    i1: { kind: 'local', action: 'step-0', text: 'Open file.command', at: 50, result: pending },
  }
  const host: EffectHost = {
    now: () => 51,
    deliveryId: () => '',
    perform: async () => {
      throw new Error('spawn failed')
    },
    send: async () => ({ state: 'accepted' }),
    saveLasts: async change => (lasts = change(lasts)),
    saveLedger: async () => {},
  }

  await runLocalEffects(host, [effect], 'i1', pending)
  assert.deepEqual(lasts.i1?.result, {
    state: 'failed',
    parts: [{ kind: 'open', name: 'file.command', isCommand: false, error: 'spawn failed' }],
    at: 51,
    pressId: 'press',
  })
})

test('a review thread that stopped waiting rejects a stale Address press', () => {
  const d = demoView(100, 'Codex')
  const pr = Object.values(d.prViews.views).find(v => v.threads.some(t => t.isWaiting))!
  const thread = pr.threads.find(t => t.isWaiting)!
  const resolved = { ...pr, threads: pr.threads.map(t => (t.id === thread.id ? { ...t, isWaiting: false } : t)) }
  const prViews = { ...d.prViews, views: { ...d.prViews.views, [pr.ref]: resolved } }

  assert.deepEqual(
    applyPrPress(
      d.ledger,
      prViews,
      {},
      { action: 'thread-address', ref: pr.ref, thread: thread.id },
      { now: 200, turnsStarted: 0 },
    ),
    { stale: true },
  )
})

test('a delayed older press cannot replace a newer same-time last action', () => {
  const action = (id: string, pressOrder: number): LastAction => ({
    kind: 'talk',
    action: 'explain',
    text: 'Explain',
    at: 50,
    pressOrder,
    delivery: { state: 'queued', message: 'same text', id },
  })
  const newer = withLasts({}, { i1: action('new', 2) }, [], 2)
  const olderFinishesLast = withLasts(newer, { i1: action('old', 1) }, [], 1)
  assert.equal(olderFinishesLast.i1?.delivery?.state, 'queued')
  assert.equal(olderFinishesLast.i1?.delivery?.state === 'queued' ? olderFinishesLast.i1.delivery.id : null, 'new')
})

test('a press drawn for a row that left or changed is stale, and changes and sends nothing', () => {
  const s = withItems()
  const stale: unknown[] = [
    { action: 'answer', id: 'i9', option: 'Fix add.js' },
    { action: 'answer', id: 'i1', option: 'Delete the test' },
    { action: 'answer', id: 'i1', option: 0 },
    { action: 'step', id: 'i2', step: 0, label: 'Run the old script' },
    { action: 'undo', id: 'i1' },
  ]
  for (const p of stale) assert.deepEqual(pressed(s, p as RowPress), { stale: true })
  assert.deepEqual(pressed(s, { action: 'type', id: 'i2', text: '  ' }), { ledger: s.ledger, last: null, effects: [] })
})

test('a refused Done attempt cannot change a later close of the same task', () => {
  const initial = withItems().ledger
  const first = applyPress(
    initial,
    undefined,
    { id: 'i2', action: 'done' },
    { now: 20, turnsStarted: 1, extraSteps: [], comparePage: '/plugin/dist/compare-page.html' },
  )
  assert.ok(!('stale' in first))
  const sent = markSentToAgent(first.ledger, ['i2'], 'old-attempt')
  const refused = refuseDoneNotification(sent, 'old-attempt', 'Refused')
  const undo = applyPress(
    refused,
    undefined,
    { id: 'i2', action: 'undo' },
    { now: 20, turnsStarted: 1, extraSteps: [], comparePage: '/plugin/dist/compare-page.html' },
  )
  assert.ok(!('stale' in undo))
  const second = applyPress(
    undo.ledger,
    undefined,
    { id: 'i2', action: 'done' },
    { now: 20, turnsStarted: 1, extraSteps: [], comparePage: '/plugin/dist/compare-page.html' },
  )
  assert.ok(!('stale' in second))
  const newer = markSentToAgent(second.ledger, ['i2'], 'new-attempt')
  const result = refuseDoneNotification(newer, 'old-attempt', 'Late refusal')
  assert.deepEqual(result, newer)
  assert.equal(result.closed[0]?.isSentToAgent, true)
})
