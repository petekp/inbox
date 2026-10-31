import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { EMPTY } from '../../hooks/ledger'
import type { Ledger } from '../../types'
import { applyPress } from '../../hooks/press-reducer'
import type { PressResult } from '../../hooks/press-reducer'
import { inboxView } from '../../hooks/view'
import { ledgerActions, RowActions } from '../src/row-actions'
import { recordItem } from '../../hooks/tools'
import { CODEX } from '../src/texts'
import { buttons, named, task } from './row-actions-fixtures'

test('the Codex renderer preserves retry, folded-option and finding action order, keeps a row’s follow-ups in one group that wraps as a unit, maps emphasis, and guards presses', async () => {
  const { row, ledger } = task()
  let state = ledger
  let retried: PressResult | null = null
  const actions = ledgerActions(
    {
      ...row,
      feedback: {
        is: 'notSent',
        reason: 'queue failed',
        retry: { action: 'step', id: row.id, step: 0, label: 'Run tests' },
      },
    },
    false,
    null,
    {
      press: p => {
        const result = applyPress(state, undefined, p, {
          now: 20,
          turnsStarted: 1,
          extraSteps: [],
          comparePage: '/plugin/dist/compare-page.html',
        })
        assert.ok(!('stale' in result))
        retried = result
        state = result.ledger
      },
      reply: () => {},
      discard: () => {},
      showOptions: () => {},
    },
  )
  const root = document.createElement('div')
  document.body.append(root)
  let guarded = true
  const draw = () =>
    render(h(RowActions, { keys: actions.keys, more: actions.more, reply: null, isBlocked: () => guarded }), root)
  await act(draw)
  assert.deepEqual(
    buttons(root).map(b => b.textContent),
    ['Try again', 'Run tests', 'Done', 'Reply', 'Explain', 'Dismiss'],
  )
  assert.equal(named(root, 'Done').classList.contains('primary'), true)
  assert.equal(named(root, 'Run tests').classList.contains('primary'), false)
  await act(() => named(root, 'Done').click())
  assert.equal(state.closed.length, 0)
  guarded = false
  await act(draw)
  await act(() => named(root, 'Try again').click())
  const retriedPress = retried as PressResult | null
  assert.ok(retriedPress && !('stale' in retriedPress))
  assert.ok(retriedPress.effects.some(effect => effect.kind === 'send' && effect.text.includes('npm test')))
  assert.equal(state.closed.length, 0)
  const questionLedger: Ledger = {
    ...ledger,
    items: [
      {
        ...ledger.items[0]!,
        kind: 'question',
        ask: 'Which option?',
        options: ['A', 'B', 'C', 'D', 'E', 'F'],
        rec: 'A',
        isDesignChoice: true,
      },
    ],
  }
  const question = inboxView({
    ledger: questionLedger,
    lastActions: {},
    notes: {},
    turns: { turnsStarted: 1, turnsApplied: 1 },
    extraSteps: {},
    settleWindowMs: 5120,
    status: { isUpdating: false, error: null },
    now: 10,
    replies: {},
    discarded: {},
    shownSince: null,
    lastTypedMessageAt: null,
  }).needsYou.questions[0]!
  let allOptions = false
  let answer: PressResult | null = null
  const drawQuestion = () => {
    const choices = ledgerActions(question, allOptions, null, {
      press: p => {
        answer = applyPress(questionLedger, undefined, p, {
          now: 20,
          turnsStarted: 1,
          extraSteps: [],
          comparePage: '/plugin/dist/compare-page.html',
        })
      },
      reply: () => {},
      discard: () => {},
      showOptions: () => {
        allOptions = true
        drawQuestion()
      },
    })
    render(h(RowActions, { keys: choices.keys, more: choices.more, reply: null, isBlocked: () => false }), root)
  }
  await act(drawQuestion)
  assert.deepEqual(
    buttons(root).map(b => b.textContent),
    ['A (recommended)', 'B', 'C', 'D', 'All 6 options', 'Run tests', 'Reply', 'Explain', 'Compare', 'Dismiss'],
  )
  await act(() => named(root, 'All 6 options').click())
  assert.ok(named(root, 'F'))
  await act(() => named(root, 'F').click())
  const answered = answer as PressResult | null
  assert.ok(answered && !('stale' in answered))
  assert.equal(answered.ledger.closed[0]?.outcome, 'F')
  const findingLedger = recordItem(
    CODEX,
    EMPTY,
    { kind: 'finding', finding_kind: 'issue', title: 'Missing retry limit', detail: 'The request loops.' },
    1,
  ).ledger
  const finding = inboxView({
    ledger: findingLedger,
    lastActions: {},
    notes: {},
    turns: { turnsStarted: 1, turnsApplied: 1 },
    extraSteps: {},
    settleWindowMs: 5120,
    status: { isUpdating: false, error: null },
    now: 10,
    replies: {},
    discarded: {},
    shownSince: null,
    lastTypedMessageAt: null,
  }).findings.rows[0]!
  let discussion: PressResult | null = null
  const followUps = ledgerActions(finding, false, null, {
    press: p => {
      discussion = applyPress(findingLedger, undefined, p, {
        now: 20,
        turnsStarted: 1,
        extraSteps: [],
        comparePage: '/plugin/dist/compare-page.html',
      })
    },
    reply: () => {},
    discard: () => {},
    showOptions: () => {},
  })
  await act(() =>
    render(h(RowActions, { keys: followUps.keys, more: followUps.more, reply: null, isBlocked: () => false }), root),
  )
  assert.deepEqual(
    buttons(root).map(b => b.textContent),
    ['Fix', 'File issue', 'Reply', 'Explain', 'Discuss', 'Dismiss'],
  )
  assert.deepEqual(
    buttons(named(root, 'Explain').parentElement!).map(b => b.textContent),
    ['Reply', 'Explain', 'Discuss', 'Dismiss'],
  )
  await act(() => named(root, 'Discuss').click())
  const discussed = discussion as PressResult | null
  assert.ok(discussed && !('stale' in discussed))
  assert.equal(discussed.last?.kind, 'talk')
  assert.equal(discussed.ledger.findings[0]?.id, finding.id)
  await act(() => render(null, root))
  root.remove()
})
