import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyPress } from '../../hooks/presses'
import type { PressResult, RowPress } from '../../hooks/presses'
import { recordClose, recordFinding } from '../../hooks/tools'
import type { RowView } from '../../hooks/view'
import type { Item } from '../../types'
import { endTurn, notePrompt, viewOf } from '../src/core'
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

/** A press on a state's ledger, at time 50, as a host applies it. */
function pressed(s: SessionState, p: RowPress): PressResult {
  return applyPress(s.ledger, p, { now: 50, turnsStarted: s.presence.turnsStarted, extraSteps: [] })
}

/** The state after a press that went through, with its last action on its row. */
function after(s: SessionState, p: RowPress): SessionState {
  const r = pressed(s, p)
  assert.ok(!('stale' in r))

  return { ...s, ledger: r.ledger, lastActions: r.last ? { ...s.lastActions, [p.id]: r.last } : s.lastActions }
}

test('an answer names its option by text: it closes the question and sends the answer as a press', () => {
  const r = pressed(withItems(), { action: 'answer', id: 'i1', option: 'Fix add.js' })
  assert.ok(!('stale' in r))
  assert.deepEqual(r.effects, [
    { kind: 'send', text: 'Re "Fix add.js or the test?": Fix add.js', by: { id: 'i1', action: 'answer' } },
  ])
  assert.deepEqual(
    r.ledger.closed.map(d => [d.id, d.outcome, d.how]),
    [['i1', 'Fix add.js', 'answered']],
  )
  assert.equal(r.last?.kind, 'mark')
})

test('a press drawn for a row that left or changed is stale, and changes and sends nothing', () => {
  const s = withItems()
  const stale: unknown[] = [
    // The row is gone.
    { action: 'answer', id: 'i9', option: 'Fix add.js' },
    // The option is no longer among the question's, or comes from a tab that sent its index.
    { action: 'answer', id: 'i1', option: 'Delete the test' },
    { action: 'answer', id: 'i1', option: 0 },
    // The step at that place has another label now.
    { action: 'step', id: 'i2', step: 0, label: 'Run the old script' },
    // Undo has nothing to undo while the item is open.
    { action: 'undo', id: 'i1' },
  ]
  for (const p of stale) assert.deepEqual(pressed(s, p as RowPress), { stale: true })
  // A blank typed reply goes through and does nothing.
  assert.deepEqual(pressed(s, { action: 'type', id: 'i2', text: '  ' }), { ledger: s.ledger, last: null, effects: [] })
})

test('the person’s own numbered answer gets the note that maps it to the question', () => {
  const { notes } = notePrompt(withItems(), '1. fix add.js', 60)
  assert.match(notes[0] ?? '', /1 → "Fix add.js or the test\?"/)
})

test('a run step hands the task to Codex: it folds until the turn it started is summarized', () => {
  const p: RowPress = { action: 'step', id: 'i2', step: 0, label: 'Run seed script' }
  const r = pressed(withItems(), p)
  assert.ok(!('stale' in r))
  assert.deepEqual(r.effects, [
    {
      kind: 'send',
      text: 'For "Sign in to npm", run this:\n```\nnpm run seed\n```',
      by: { id: 'i2', action: 'run' },
    },
  ])
  const s = after(withItems(), p)
  const folded = viewOf(s, 60)
  assert.deepEqual(folded.needsYou.tasks[0]?.state, { is: 'handedOff' })
  assert.deepEqual(folded.needsYou.tasks[0]?.feedback, { is: 'done', label: 'Run seed script', at: 50 })
  assert.equal(folded.needsYou.count, 1)

  const started = notePrompt(s, 'For "Sign in to npm", run this:', 70).state
  const summarized = { ...started, presence: { ...started.presence, turnsApplied: started.presence.turnsStarted } }
  assert.deepEqual(viewOf(summarized, 80).needsYou.tasks[0]?.state, { is: 'open' })
})

test('a run step on a question sends its command and leaves the question open, and a step that copies and opens sends nothing', () => {
  const w = withItems()
  const question = w.ledger.items[0]!
  const s: SessionState = {
    ...w,
    ledger: {
      ...w.ledger,
      items: [
        {
          ...question,
          helps: [
            { kind: 'run', command: 'npm test', name: 'tests' },
            { kind: 'copy', text: 'API_KEY=x', name: 'env line' },
            { kind: 'open', path: '.env.local' },
          ],
        },
      ],
    },
  }
  const run = pressed(s, { action: 'step', id: 'i1', step: 0, label: 'Run tests' })
  assert.ok(!('stale' in run))
  assert.deepEqual(
    run.effects.map(e => e.kind),
    ['send'],
  )
  assert.equal(run.last?.kind, 'handoff')
  assert.deepEqual(
    run.ledger.items.map(i => i.id),
    ['i1'],
  )
  assert.equal(viewOf(after(s, { action: 'step', id: 'i1', step: 0, label: 'Run tests' }), 60).needsYou.count, 1)

  const copyOpen = pressed(s, { action: 'step', id: 'i1', step: 1, label: 'Copy env line and open .env.local' })
  assert.deepEqual(copyOpen, {
    ledger: s.ledger,
    last: null,
    effects: [
      { kind: 'copy', text: 'API_KEY=x', name: 'env line', isCommand: false },
      { kind: 'open', target: '.env.local', name: '.env.local' },
    ],
  })
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
    lastActions: { i1: { kind: 'handoff', action: 'type', text: 'Reply', at: 1, turnsStarted: 2 } },
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

test('a question lists every option, folds those past the fourth of 7, marks the recommended one, and lists its steps before its other actions', () => {
  const s = emptyState('s1')
  const colors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet']
  const state: SessionState = {
    ...s,
    ledger: {
      ...s.ledger,
      items: [
        {
          ...asked('i1', 'question', 1),
          options: colors,
          rec: 'Green',
          helps: [{ kind: 'run', command: './a.sh', name: 'a script' }],
        },
      ],
    },
  }
  const actions = viewOf(state, 10).needsYou.questions[0]?.actions ?? []
  assert.deepEqual(
    actions.map(a => [a.label, a.kind, a.isPrimary, a.isFolded]),
    [
      ['Red', 'mark', false, false],
      ['Orange', 'mark', false, false],
      ['Yellow', 'mark', false, false],
      ['Green', 'mark', true, false],
      ['Blue', 'mark', false, true],
      ['Indigo', 'mark', false, true],
      ['Violet', 'mark', false, true],
      ['Run a script', 'handoff', false, false],
      ['Type an answer', 'mark', false, false],
      ['Explain', 'talk', false, false],
      ['Dismiss', 'mark', false, false],
    ],
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
  // Codex does not rerun a failed update, so the error promises no retry.
  assert.equal(viewOf(s, 60).status.error, 'Last update failed. Items from that reply may be missing.')
  assert.equal(viewOf(s, 60).status.changedAt, 1)
})

test('Address removes the finding, sends it, and shows what was sent in its place for a few seconds', () => {
  const w = withItems()
  const s = {
    ...w,
    ledger: recordFinding(CODEX, w.ledger, { kind: 'issue', title: 'No lint script', detail: 'Only tests run.' }, 10)
      .ledger,
  }
  const r = pressed(s, { action: 'address', id: 'f3' })
  assert.ok(!('stale' in r))
  assert.deepEqual(r.effects, [
    {
      kind: 'send',
      text: 'Please address this finding you recorded:\nIssue: No lint script\nOnly tests run.',
      by: null,
    },
  ])
  const sent = after(s, { action: 'address', id: 'f3' })
  assert.deepEqual(
    viewOf(sent, 60).leaving.map(x => [x.title, x.text]),
    [['No lint script', 'Address']],
  )
  assert.deepEqual(viewOf(sent, 60 + 6000).leaving, [])
  assert.deepEqual(sent.ledger.findings, [])
  // Dismiss closes a finding without sending anything.
  const dismissed = pressed(s, { action: 'dismiss', id: 'f3' })
  assert.ok(!('stale' in dismissed))
  assert.deepEqual(dismissed.effects, [])
  assert.deepEqual(
    dismissed.ledger.closedFindings.map(f => [f.id, f.how]),
    [['f3', 'dismissed']],
  )
})

test('Codex closing an item reads as Codex in its outcome', () => {
  const r = recordClose(CODEX, withItems().ledger, { id: 'i1', reason: 'no longer applies' }, 50)
  assert.equal(r.ledger.closed[0]?.outcome, 'closed by Codex: no longer applies')
  assert.equal(
    recordClose(CODEX, withItems().ledger, { id: 'i9', reason: 'x' }, 50).result.startsWith('Not closed'),
    true,
  )
})
