import assert from 'node:assert/strict'
import { test } from 'node:test'

import { recordClose, recordFinding } from '../../hooks/tools'
import type { RowView } from '../../hooks/view'
import type { Item } from '../../types'
import { endTurn, notePrompt, press, viewOf } from '../src/core'
import { emptyState } from '../src/state'
import type { SessionState } from '../src/state'
import { CODEX } from '../src/texts'

function withItems(): SessionState {
  const s = emptyState('s1')

  return {
    ...s,
    root: '/repo',
    ledger: {
      ...s.ledger,
      turn: 1,
      nextId: 3,
      batchTurn: 1,
      items: [
        {
          id: 'i1',
          kind: 'question',
          label: '1',
          ask: 'Fix add.js or the test?',
          options: ['Fix add.js', 'Change test'],
          rec: 'Fix add.js',
          helps: [],
          turn: 1,
          at: 1,
        },
        {
          id: 'i2',
          kind: 'task',
          label: null,
          ask: 'Sign in to npm',
          options: [],
          rec: null,
          helps: [{ kind: 'run', command: 'npm run seed', name: 'seed script' }],
          turn: 1,
          at: 1,
        },
      ],
    },
    presence: { ...s.presence, turnsStarted: 1, turnsApplied: 1 },
  }
}

test('an answer closes its question and sends the answer, which the next prompt matches as a press', () => {
  const r = press(withItems(), { action: 'answer', id: 'i1', option: 0 }, 50)
  assert.ok(r)
  assert.deepEqual(r.effects, [
    { kind: 'send', text: 'Re "Fix add.js or the test?": Fix add.js', press: { id: 'i1', action: 'answer' } },
  ])
  assert.deepEqual(
    r.state.ledger.closed.map(d => [d.id, d.outcome, d.how]),
    [['i1', 'Fix add.js', 'answered']],
  )

  const prompt = notePrompt(r.state, 'Re "Fix add.js or the test?": Fix add.js', 60)
  assert.deepEqual(prompt.state.turn.press, { id: 'i1', action: 'answer' })
  assert.deepEqual(prompt.state.sent, [])
  assert.match(
    prompt.notes.join('\n'),
    /Closed since you last read the inbox:\n- "Fix add.js or the test\?" → Fix add.js/,
  )
})

test('the person’s own numbered answer gets the note that maps it to the question', () => {
  const { notes } = notePrompt(withItems(), '1. fix add.js', 60)
  assert.match(notes[0] ?? '', /1 → "Fix add.js or the test\?"/)
})

test('a run step hands the task to Codex: it folds until the turn it started is summarized', () => {
  const r = press(withItems(), { action: 'step', id: 'i2', step: 0 }, 50)
  assert.ok(r)
  assert.equal(r.effects[0]?.kind, 'send')
  const folded = viewOf(r.state, 60)
  assert.deepEqual(folded.needsYou.tasks[0]?.state, { is: 'handedOff' })
  assert.equal(folded.lastActions.i2?.text, 'Run seed script sent')
  assert.equal(folded.needsYou.count, 1)

  const started = notePrompt(r.state, (r.effects[0] as { text: string }).text, 70).state
  const summarized = { ...started, presence: { ...started.presence, turnsApplied: started.presence.turnsStarted } }
  assert.deepEqual(viewOf(summarized, 80).needsYou.tasks[0]?.state, { is: 'open' })
})

/** An open question or task asked in reply `turn`. */
function asked(id: string, kind: Item['kind'], turn: number): Item {
  return { id, kind, label: null, ask: `Ask ${id}`, options: [], rec: null, helps: [], turn, at: turn }
}

test('the tab lists Needs you in the mod’s order, numbers only the questions a typed number answers, and counts what waits', () => {
  const s = emptyState('s1')
  // An older question and task stay open after the latest reply asked a question, a task and a question.
  const state: SessionState = {
    ...s,
    ledger: {
      ...s.ledger,
      turn: 2,
      batchTurn: 2,
      nextId: 6,
      items: [
        asked('i1', 'task', 1),
        asked('i2', 'question', 1),
        asked('i3', 'question', 2),
        asked('i4', 'task', 2),
        asked('i5', 'question', 2),
      ],
    },
    // The older task was handed to Codex in the turn that is running.
    lastActions: { i1: { action: 'typed', text: 'Reply sent', at: 1, isHandoff: true, turnsStarted: 2 } },
    presence: { ...s.presence, turnsStarted: 2, turnsApplied: 2 },
  }
  const v = viewOf(state, 10)
  const rows = (list: RowView[]) => list.map(r => [r.id, r.handle, r.state.is])
  assert.deepEqual(rows(v.needsYou.questions), [
    ['i3', '1)', 'open'],
    // The task in the batch takes position 2, as a typed "2." would answer it.
    ['i5', '3)', 'open'],
    ['i2', '?', 'open'],
  ])
  assert.deepEqual(rows(v.needsYou.tasks), [
    ['i1', '•', 'handedOff'],
    ['i4', '•', 'open'],
  ])
  assert.equal(v.needsYou.count, 4)
  assert.equal(v.needsYou.topId, 'i3')

  // Once the person sends any message, a typed number no longer reaches the batch.
  const after = viewOf(notePrompt(state, 'thanks', 20).state, 30)
  assert.deepEqual(
    after.needsYou.questions.map(r => r.handle),
    ['?', '?', '?'],
  )
})

test('the tab reads Updating… while exchanges wait for the inbox model, and shows a failed update only once none do', () => {
  const s = { ...withItems(), presence: { ...withItems().presence, isUpdating: false, ledgerState: 'failed' as const } }
  const waiting = endTurn(s, 'Done.', 50)
  assert.equal(waiting.pending.length, 1)
  assert.deepEqual(
    { isUpdating: viewOf(waiting, 60).status.isUpdating, error: viewOf(waiting, 60).status.error },
    { isUpdating: true, error: null },
  )
  assert.match(viewOf(s, 60).status.error ?? '', /^Last update failed\./)
  assert.equal(viewOf(s, 60).status.changedAt, 1)
})

test('Address removes the finding, sends it, and shows what was sent in its place for a few seconds', () => {
  const w = withItems()
  const s = {
    ...w,
    ledger: recordFinding(CODEX, w.ledger, { kind: 'issue', title: 'No lint script', detail: 'Only tests run.' }, 10)
      .ledger,
  }
  const r = press(s, { action: 'address', id: 'f3' }, 50)
  assert.ok(r)
  assert.match(
    (r.effects[0] as { text: string }).text,
    /^Please address this finding you recorded:\nIssue: No lint script/,
  )
  assert.deepEqual(
    viewOf(r.state, 60).leaving.map(x => [x.title, x.text]),
    [['No lint script', 'Sent to Codex to fix']],
  )
  assert.deepEqual(viewOf(r.state, 60 + 6000).leaving, [])
  assert.deepEqual(r.state.ledger.findings, [])
})

test('a press on a row that is gone does nothing', () => {
  assert.equal(press(withItems(), { action: 'answer', id: 'i9', option: 0 }, 50), null)
})

test('Codex closing an item reads as Codex in its outcome', () => {
  const r = recordClose(CODEX, withItems().ledger, { id: 'i1', reason: 'no longer applies' }, 50)
  assert.equal(r.ledger.closed[0]?.outcome, 'closed by Codex: no longer applies')
  assert.equal(
    recordClose(CODEX, withItems().ledger, { id: 'i9', reason: 'x' }, 50).result.startsWith('Not closed'),
    true,
  )
})
