import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyPress } from '../../hooks/press-reducer'
import { recordClose, recordItem } from '../../hooks/tools'
import { closedShown } from '../../hooks/rows'
import { firstWaiting, keptOpen, listWaits, rowAfterClose } from '../../hooks/action-plan'
import { QUEUED_AFTER_MS, NO_HOLDS, SETTLED_MS } from '../../hooks/timing'
import type { RowWait } from '../../hooks/action-plan'
import { viewOf } from '../src/core'
import { EXIT_MS } from '../../hooks/row-motion'
import { drawnSettled, SETTLE_WINDOW_MS } from '../src/settle'
import { CODEX } from '../src/texts'
import { after, withItems } from './press-fixtures'

test('the tab draws a settled row while it shows the tab the row closed in, and lists it in the Closed fold once the person switches tab', () => {
  const s = withItems()
  const dismissed = after(s, { action: 'dismiss', id: 'i1' })
  const shown = viewOf(dismissed, 2050 + SETTLED_MS + EXIT_MS + 1, { ...NO_HOLDS, shownSince: 40 })
  assert.equal(shown.needsYou.questions[0]?.state.is, 'settled')
  const fold = (shownSince: number) =>
    closedShown(shown.needsYou.closed.questions, drawnSettled(shown, shownSince)).map(d => d.id)
  assert.deepEqual([...drawnSettled(shown, 40)], ['i1'])
  assert.deepEqual(fold(40), [])
  assert.deepEqual(fold(2060), ['i1'])
  const switched = viewOf(dismissed, 2060, { ...NO_HOLDS, shownSince: 2060 }).needsYou
  assert.deepEqual(switched.questions, [])
  assert.deepEqual(
    switched.closed.questions.map(d => d.id),
    ['i1'],
  )
})

test('a row Codex closes while the person types a reply stays held in place, out of the count and the Closed fold, Discard folds it at once, and its reply sends and settles it as Replied', () => {
  const s = withItems()
  const closed = { ...s, ledger: recordClose(CODEX, s.ledger, { id: 'i1', reason: 'settled in chat' }, 50).ledger }
  const held = viewOf(closed, 50 + SETTLE_WINDOW_MS + 1, { ...NO_HOLDS, replies: { i1: 40 } }).needsYou
  assert.deepEqual(
    held.questions.map(r => [r.id, r.state, r.feedback, r.actions.map(a => [a.label, a.kind])]),
    [
      [
        'i1',
        { is: 'held', label: 'Closed by Codex: settled in chat', at: 50 },
        { is: 'closed', label: 'Closed by Codex: settled in chat', at: 50 },
        [
          ['Reply', 'handoff'],
          ['Discard', 'view'],
        ],
      ],
    ],
  )
  assert.equal(held.count, 1)
  assert.deepEqual(held.closed.questions, [])
  assert.equal(firstWaiting(listWaits(viewOf(closed, 60, { ...NO_HOLDS, replies: { i1: 40 } })).needsYou), 'i2')
  assert.deepEqual(
    viewOf(closed, 50 + SETTLE_WINDOW_MS + 1, { ...NO_HOLDS, replies: { i1: 51 } }).needsYou.questions,
    [],
  )
  const discarded = viewOf(closed, 60, { ...NO_HOLDS, discarded: { i1: 55 } }).needsYou
  assert.deepEqual(discarded.questions, [])
  assert.deepEqual(
    discarded.closed.questions.map(d => d.id),
    ['i1'],
  )

  const r = applyPress(
    closed.ledger,
    undefined,
    { action: 'type', id: 'i1', text: ' Fix add.js after all ' },
    {
      now: 70,
      turnsStarted: 1,
      extraSteps: [],
      comparePage: '/plugin/dist/compare-page.html',
    },
  )
  assert.ok(!('stale' in r))
  assert.equal(r.ledger, closed.ledger)
  assert.deepEqual(r.effects, [{ kind: 'send', text: 'Re "Fix add.js or the test?": Fix add.js after all', by: null }])
  const replied = { ...closed, lastActions: { i1: r.last! } }
  assert.deepEqual(
    viewOf(replied, 70 + QUEUED_AFTER_MS, { replies: { i1: 40 }, discarded: {}, shownSince: 40 }).needsYou.questions[0]
      ?.state,
    {
      is: 'settled',
      label: 'Replied',
      at: 70,
      canUndo: false,
      offersUndo: false,
      delivery: 'queued',
      closedAs: 'handled',
    },
  )
  const later = 70 + SETTLE_WINDOW_MS
  assert.deepEqual(viewOf(replied, later).needsYou.questions, [])
  assert.deepEqual(
    viewOf(replied, later).needsYou.closed.questions.map(d => d.id),
    ['i1'],
  )
})

test('a held finding’s reply sends what a reply to the open finding sends, and a row the person closed holds nothing', () => {
  const s = withItems()
  const recorded = recordItem(
    CODEX,
    s.ledger,
    { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' },
    10,
  ).ledger
  const closed = recordClose(CODEX, recorded, { id: 'f3', reason: 'added one' }, 50).ledger
  const r = applyPress(
    closed,
    undefined,
    { action: 'type', id: 'f3', text: 'Use eslint' },
    {
      now: 70,
      turnsStarted: 1,
      extraSteps: [],
      comparePage: '/plugin/dist/compare-page.html',
    },
  )
  assert.ok(!('stale' in r))
  assert.deepEqual(
    r.effects.map(e => e.kind === 'send' && e.text),
    ['About this finding you recorded:\nIssue: No lint script\nOnly tests run.\n\nUse eslint'],
  )
  assert.deepEqual(
    viewOf({ ...s, ledger: closed }, 50 + SETTLE_WINDOW_MS + 1, {
      ...NO_HOLDS,
      replies: { f3: 40 },
    }).findings.rows.map(row => [row.id, row.state.is]),
    [['f3', 'held']],
  )

  const dismissed = after({ ...s, ledger: recorded }, { action: 'dismiss', id: 'f3' })
  assert.deepEqual(viewOf(dismissed, 50 + SETTLE_WINDOW_MS + 1, { ...NO_HOLDS, replies: { f3: 40 } }).findings.rows, [])
  const answered = after(s, { action: 'answer', id: 'i1', option: 'Fix add.js' })
  assert.deepEqual(
    viewOf(answered, 50 + SETTLE_WINDOW_MS + 1, { ...NO_HOLDS, replies: { i1: 40 } }).needsYou.questions.map(
      row => row.id,
    ),
    [],
  )
})

test('Codex closing an item reads as Codex in its outcome', () => {
  const r = recordClose(CODEX, withItems().ledger, { id: 'i1', reason: 'no longer applies' }, 50)
  assert.equal(r.ledger.closed[0]?.outcome, 'closed by Codex: no longer applies')
  assert.equal(
    recordClose(CODEX, withItems().ledger, { id: 'i9', reason: 'x' }, 50).result.startsWith('Not closed'),
    true,
  )
  const closed = recordClose(CODEX, withItems().ledger, { id: 'i1', reason: 'a' }, 50)
  const again = recordClose(CODEX, closed.ledger, { id: 'i1', answer: 'b' }, 60)
  assert.equal(again.result, 'Already closed: you closed it earlier.')
  assert.equal(again.ledger, closed.ledger)
})

test('after a close the next waiting row opens, else the nearest one before it, and a row that arrives above leaves the open row open', () => {
  const w = (id: string, isWaiting = true): RowWait => ({ id, isWaiting })
  assert.equal(rowAfterClose([w('i1', false), w('i2', false), w('i3')], 'i1'), 'i3')
  assert.equal(rowAfterClose([w('i1'), w('i2', false), w('i3', false)], 'i3'), 'i1')
  assert.equal(rowAfterClose([w('i1', false), w('i2', false)], 'i2'), null)
  assert.equal(rowAfterClose([w('i1')], 'i9'), null)
  assert.equal(keptOpen([w('i3'), w('i1'), w('i2')], ['i3']), 'i1')
  assert.equal(keptOpen([w('i3'), w('i1', false)], ['i3']), null)
})
