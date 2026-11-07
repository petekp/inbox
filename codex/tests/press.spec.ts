import assert from 'node:assert/strict'
import { test } from 'node:test'

import { withArrival } from '../../hooks/press-reducer'
import { applyPrPress, withFinishedPrsSettled } from '../../hooks/pr-tab'
import { demoView } from '../../hooks/demo'
import { recordClose, recordItem } from '../../hooks/tools'
import { feedbackText } from '../../hooks/feedback'
import { firstWaiting, listWaits } from '../../hooks/action-plan'
import { QUEUED_AFTER_MS } from '../../hooks/timing'
import { rowHandle, settledLabel, settledMark } from '../../hooks/rows'
import { notePrompt, viewOf } from '../src/core'
import { SETTLE_WINDOW_MS } from '../src/settle'
import type { SessionState } from '../src/state'
import { CODEX } from '../src/texts'
import { after, pressed, released, SHOWN, withItems } from './press-fixtures'

test('a fetch that finds tab PRs merged settles each but the branch’s own as Merged, and Undo keeps one on the tab', () => {
  const d = demoView(100, 'Codex')
  const refs = ['acme/visor#31', 'acme/visor#29', 'acme/visor#33']
  const inState = (state: 'OPEN' | 'MERGED') =>
    Object.fromEntries(refs.map(ref => [ref, { ...d.prViews.views[ref]!, state }]))
  const before = { ...d, lastActions: {}, prViews: { ...d.prViews, views: inState('OPEN') } }
  const r = withFinishedPrsSettled(before, inState('MERGED'), { now: 200, turnsStarted: 0 })
  assert.deepEqual(r.ledger.prs, ['acme/visor#31'])
  assert.deepEqual(
    Object.entries(r.lastActions).map(([id, l]) => [id, l.kind, l.action, l.text]),
    [
      ['pr:acme/visor#29', 'mark', 'pr-dismiss', 'Merged'],
      ['pr:acme/visor#33', 'mark', 'pr-dismiss', 'Merged'],
    ],
  )

  const prViews = { ...d.prViews, views: inState('MERGED') }
  const ctx = { now: 200, turnsStarted: 0 }
  const undone = applyPrPress(r.ledger, prViews, r.lastActions, { action: 'pr-undo', ref: 'acme/visor#29' }, ctx)
  assert.ok(!('stale' in undone))
  assert.deepEqual(undone.ledger.prs, ['acme/visor#31', 'acme/visor#29'])
})

test('Fix hands a finding off and settles it as the choice made, each press with no ✓ until its message arrives, then lists it in the Closed fold though an applied turn leaves it open; File issue folds it until the reply, which leaves it Still open or closes it with the issue; Discuss keeps it open; a close moves it to Closed', () => {
  const w = withItems()
  const s = {
    ...w,
    ledger: recordItem(
      CODEX,
      w.ledger,
      { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' },
      10,
    ).ledger,
  }
  const r = pressed(s, { action: 'address', id: 'f3' })
  assert.ok(!('stale' in r))
  assert.deepEqual(r.effects, [])
  const message = r.last?.delivery?.state === 'held' ? r.last.delivery.message : ''
  assert.equal(message, 'Please address this finding you recorded:\nIssue: No lint script\nOnly tests run.')
  const held = after(s, { action: 'address', id: 'f3' })
  const sent = released(held, 'f3')
  const folded = viewOf(sent, 60, SHOWN).findings
  assert.deepEqual(
    folded.rows.map(r => [r.id, r.state.is, r.feedback && feedbackText(r.feedback, 'codex')]),
    [['f3', 'settled', null]],
  )
  assert.equal(folded.count, 0)
  assert.equal(folded.rows[0]?.state.is === 'settled' && folded.rows[0].state.label, 'Fix')
  const drawnAt = (state: SessionState, at: number) => {
    const row = viewOf(state, at, SHOWN).findings.rows[0]
    assert.ok(row?.state.is === 'settled')

    const mark = settledMark(row.state)

    return [mark.isRunning ? 'running' : mark.text, settledLabel(row.state.label, row.state.delivery)]
  }
  assert.deepEqual(drawnAt(held, 60), ['', 'Fix'])
  assert.deepEqual(drawnAt(sent, 60), ['running', 'Fix'])
  assert.deepEqual(drawnAt(sent, 50 + QUEUED_AFTER_MS), ['running', 'Queued: Fix'])
  assert.deepEqual(drawnAt({ ...sent, lastActions: withArrival(sent.lastActions, message) }, 80), ['✓', 'Fix'])
  const started = notePrompt(sent, 'Please address this finding you recorded:', 70).state
  const applied = { ...started, presence: { ...started.presence, turnsApplied: started.presence.turnsStarted } }
  const moved = viewOf(applied, 80 + SETTLE_WINDOW_MS).findings
  assert.deepEqual(moved.rows, [])
  assert.equal(moved.count, 0)
  assert.deepEqual(
    moved.closed.map(f => [f.id, f.outcome]),
    [['f3', 'Fix']],
  )
  const filing = pressed(s, { action: 'issue', id: 'f3' })
  assert.ok(!('stale' in filing))
  assert.equal(filing.effects.length, 1)
  const filingText = filing.effects[0]?.kind === 'send' ? filing.effects[0].text : ''
  assert.match(filingText, /^Please file an issue for this finding you recorded/)
  assert.ok(filingText.endsWith('\nIssue: No lint script\nOnly tests run.'))
  const filed = after(s, { action: 'issue', id: 'f3' })
  const filedRows = viewOf(filed, 60).findings
  assert.deepEqual(
    filedRows.rows.map(r => [r.id, r.state.is, r.feedback && feedbackText(r.feedback, 'codex')]),
    [['f3', 'handedOff', 'File issue']],
  )
  assert.equal(filedRows.count, 0)
  const filedArrived = viewOf({ ...filed, lastActions: withArrival(filed.lastActions, filingText) }, 60).findings
  assert.deepEqual(
    filedArrived.rows.map(r => r.feedback && feedbackText(r.feedback, 'codex')),
    ['✓ Asked to file'],
  )
  const filedStarted = notePrompt(filed, 'Please file an issue for this finding you recorded', 70).state
  const leftOpen: SessionState = {
    ...filedStarted,
    presence: { ...filedStarted.presence, turnsApplied: filedStarted.presence.turnsStarted },
    lastActions: {
      ...filedStarted.lastActions,
      f3: { ...filedStarted.lastActions.f3!, delivery: { state: 'arrived' } },
    },
  }
  const stillOpen = viewOf(leftOpen, 80 + SETTLE_WINDOW_MS).findings
  assert.deepEqual(
    stillOpen.rows.map(r => [r.id, r.state.is, r.feedback && feedbackText(r.feedback, 'codex')]),
    [['f3', 'open', 'Still open']],
  )
  assert.equal(stillOpen.count, 1)
  assert.deepEqual(stillOpen.closed, [])
  const filedAndClosed = {
    ...leftOpen,
    ledger: recordClose(CODEX, leftOpen.ledger, { id: 'f3', reason: 'LIN-12' }, 90, {
      lastActions: {},
      turnStartedAt: null,
    }).ledger,
  }
  assert.deepEqual(
    viewOf(filedAndClosed, 90 + SETTLE_WINDOW_MS).findings.closed.map(f => [f.id, f.outcome]),
    [['f3', 'closed by Codex: LIN-12']],
  )
  const discussed = viewOf(after(s, { action: 'discuss', id: 'f3' }), 60).findings
  assert.deepEqual(
    discussed.rows.map(r => [r.id, r.state.is, r.actions.find(a => a.press.action === 'discuss')?.label]),
    [['f3', 'open', 'Discuss']],
  )
  assert.equal(discussed.count, 1)
  const closedBy = {
    ...sent,
    ledger: recordClose(CODEX, sent.ledger, { id: 'f3', reason: 'fixed' }, 90, { lastActions: {}, turnStartedAt: null })
      .ledger,
  }
  assert.deepEqual(
    viewOf(closedBy, 100, SHOWN).findings.rows.map(r => [r.id, r.state, r.actions]),
    [
      [
        'f3',
        {
          is: 'settled',
          label: 'Closed by Codex: fixed',
          at: 90,
          canUndo: false,
          offersUndo: false,
          delivery: null,
          closedAs: 'handled',
        },
        [],
      ],
    ],
  )
  const closed = viewOf(closedBy, 90 + SETTLE_WINDOW_MS)
  assert.deepEqual(closed.findings.rows, [])
  assert.deepEqual(
    closed.findings.closed.map(f => [f.id, f.title, f.outcome]),
    [['f3', 'No lint script', 'closed by Codex: fixed']],
  )
  const dismissed = pressed(s, { action: 'dismiss', id: 'f3' })
  assert.ok(!('stale' in dismissed))
  assert.deepEqual(dismissed.effects, [])
  assert.deepEqual(
    dismissed.ledger.closedFindings.map(f => [f.id, f.how]),
    [['f3', 'dismissed']],
  )
})

test('Dismiss settles a row in place with Undo, and Undo puts it back open where it was; only a Done or Dismiss undoes', () => {
  const s = withItems()
  const dismissed = after(s, { action: 'dismiss', id: 'i1' })
  const settled = viewOf(dismissed, 60, SHOWN).needsYou
  assert.deepEqual(
    settled.questions.map(r => [r.id, r.state, r.actions.map(a => a.press)]),
    [
      [
        'i1',
        {
          is: 'settled',
          label: 'Dismissed',
          at: 50,
          canUndo: true,
          offersUndo: true,
          delivery: null,
          closedAs: 'dismissed',
        },
        [{ action: 'undo', id: 'i1' }],
      ],
    ],
  )
  assert.equal(settled.count, 1)
  assert.equal(firstWaiting(listWaits(viewOf(dismissed, 60, SHOWN)).needsYou), 'i2')
  const undone = after(dismissed, { action: 'undo', id: 'i1' })
  const back = viewOf(undone, 70).needsYou
  assert.deepEqual(
    back.questions.map(r => [r.id, r.state.is, rowHandle(r), r.item?.options]),
    [['i1', 'open', '1)', ['Fix add.js', 'Change test']]],
  )
  assert.equal(back.count, 2)
  assert.deepEqual(undone.ledger.closed, [])
  assert.ok('stale' in pressed(undone, { action: 'undo', id: 'i1' }))
  const answered = after(s, { action: 'answer', id: 'i1', option: 'Fix add.js' })
  const takenBack = pressed(answered, { action: 'undo', id: 'i1' })
  assert.ok(!('stale' in takenBack) && takenBack.dropLast === true)
  assert.deepEqual(
    takenBack.ledger.items.map(i => i.id),
    ['i1', 'i2'],
  )
  assert.ok('stale' in pressed(released(answered, 'i1'), { action: 'undo', id: 'i1' }))
  const closedByCodex = {
    ...s,
    ledger: recordClose(CODEX, s.ledger, { id: 'i2', reason: 'done' }, 50, { lastActions: {}, turnStartedAt: null })
      .ledger,
  }
  assert.ok('stale' in pressed(closedByCodex, { action: 'undo', id: 'i2' }))
  const expired = {
    ...s,
    ledger: {
      ...s.ledger,
      items: s.ledger.items.slice(1),
      closed: [
        {
          id: 'i1',
          kind: 'question' as const,
          ask: 'Fix add.js or the test?',
          outcome: 'expired',
          how: 'expired' as const,
          at: 40,
          item: s.ledger.items[0],
        },
      ],
    },
  }
  assert.ok('stale' in pressed(expired, { action: 'undo', id: 'i1' }))
  const withFinding = {
    ...s,
    ledger: recordItem(
      CODEX,
      s.ledger,
      { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' },
      10,
    ).ledger,
  }
  const restored = after(after(withFinding, { action: 'dismiss', id: 'f3' }), { action: 'undo', id: 'f3' })
  assert.deepEqual(
    viewOf(restored, 70).findings.rows.map(r => [r.id, r.state.is]),
    [['f3', 'open']],
  )
})
