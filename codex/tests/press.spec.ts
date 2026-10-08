import assert from 'node:assert/strict'
import { test } from 'node:test'

import { notePrompt, press, recordClose, recordFinding, viewOf } from '../src/core'
import { emptyState } from '../src/state'
import type { SessionState } from '../src/state'

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
  assert.equal(folded.tasks[0]?.isHandedOff, true)
  assert.equal(folded.tasks[0]?.last?.text, 'Run seed script sent')
  assert.equal(folded.waiting, 1)

  const started = notePrompt(r.state, (r.effects[0] as { text: string }).text, 70).state
  const summarized = { ...started, presence: { ...started.presence, turnsApplied: started.presence.turnsStarted } }
  assert.equal(viewOf(summarized, 80).tasks[0]?.isHandedOff, false)
})

test('Address removes the finding, sends it, and shows what was sent in its place for a few seconds', () => {
  const s = recordFinding(withItems(), { kind: 'issue', title: 'No lint script', detail: 'Only tests run.' }, 10).state
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
  const r = recordClose(withItems(), { id: 'i1', reason: 'no longer applies' }, 50)
  assert.equal(r.state.ledger.closed[0]?.outcome, 'closed by Codex: no longer applies')
  assert.equal(recordClose(withItems(), { id: 'i9', reason: 'x' }, 50).result.startsWith('Not closed'), true)
})
