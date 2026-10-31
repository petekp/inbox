import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { linkDialogs } from '../../hooks/dialogs'
import { EMPTY } from '../../hooks/ledger'
import { feedbackText } from '../../hooks/feedback'
import { notePrompt, noteToolCall, viewOf } from '../src/core'
import { readState, statePath, updateState } from '../src/state'
import { tempDir } from './helpers'

test('a session saved by an older build loads converted, as the mod converts its own', async () => {
  const dir = tempDir()
  const old = {
    version: 1,
    sessionId: 's1',
    top: '/repo',
    checks: { results: [], repos: ['/repo'] },
    snapshots: { '/repo': { head: null, dirty: {} } },
    recordedRuns: ['e1'],
    turn: { person: 'Run the tests', activity: [], press: null, sentBack: ['Tests pass.'] },
    sent: [{ text: 'Re "Ship it?": Yes', press: { id: 'i1', action: 'answer' }, at: 1 }],
    dialogQuestions: [
      { callId: 'call_1', index: 0, question: 'Ship it now?', options: ['Yes', 'No'], turn: 1, itemId: null },
    ],
    pending: [
      {
        ex: {
          person: 'Hi',
          trigger: null,
          activity: [],
          reply: 'Hello',
          turn: 1,
          press: null,
          screen: '',
          checks: ['✓ npm test'],
        },
        turnsStarted: 1,
      },
    ],
    ledger: {
      items: [
        {
          id: 'i1',
          kind: 'decide',
          label: null,
          from: 'record',
          ask: 'Ship it?',
          options: ['Yes', 'No'],
          rec: 'Yes',
          helps: [],
          turn: 1,
        },
      ],
      decided: [{ id: 'i0', ask: 'Rename it?', outcome: 'dismissed', at: 1 }],
      notes: [{ id: 'f1', kind: 'issue', title: 'No lint', detail: '', path: null, at: 1 }],
    },
    lastActions: {
      i1: { action: 'explain', text: 'Explain sent', at: 1 },
      i2: { action: 'typed', text: 'Reply sent', at: 1, isHandoff: true, turnsStarted: 1 },
      i3: { action: 'step-0', text: 'Run seed script sent', at: 1, isHandoff: true, turnsStarted: 1 },
      f2: { action: 'address', text: 'Sent to Codex to fix', at: 1, title: 'No tests' },
      f3: { action: 'discuss', text: 'Discuss sent', at: 1, title: 'No docs' },
      f4: { action: 'typedFinding', text: 'Reply sent', at: 1, title: 'No types' },
    },
  }
  mkdirSync(join(dir, 'sessions'), { recursive: true })
  writeFileSync(statePath(dir, 's1'), JSON.stringify(old))
  const s = await readState(dir, 's1')
  const ledger = s.ledger
  assert.deepEqual(s.lastActions, {
    i1: { kind: 'talk', action: 'explain', text: 'Explain', at: 1 },
    i2: { kind: 'handoff', action: 'type', text: 'Reply', at: 1, turnsStarted: 1 },
    i3: { kind: 'handoff', action: 'step-0', text: 'Run seed script', at: 1, turnsStarted: 1 },
    f2: { kind: 'handoff', action: 'address', text: 'Address', at: 1 },
    f3: { kind: 'talk', action: 'discuss', text: 'Discuss', at: 1 },
  })
  const question = viewOf(s, 2).needsYou.questions[0]
  assert.equal(question && question.feedback && feedbackText(question.feedback, 'codex'), '✓ Explained')
  assert.ok(question?.actions.some(a => a.label === 'Explain again'))
  assert.deepEqual(
    s.sent.map(x => [x.row, x.queuedId]),
    [[null, null]],
  )
  assert.deepEqual(notePrompt(s, 'Re "Ship it?": Yes', 2).state.lastActions, s.lastActions)
  await updateState(dir, 's1', x => x)
  assert.deepEqual((await readState(dir, 's1')).lastActions, s.lastActions)
  for (const key of ['top', 'checks', 'snapshots', 'recordedRuns']) assert.equal(key in s, false, key)
  assert.equal(viewOf(s, 2).heard, 'heard')
  assert.equal(viewOf(noteToolCall(s, 't9', 3), 3).heard, 'heard')
  assert.deepEqual(s.turn, { person: 'Run the tests', trigger: null, activity: [], press: null })
  assert.equal('checks' in (s.pending[0]?.ex ?? {}), false)
  assert.equal(s.pending[0]?.ex.reply, 'Hello')
  assert.deepEqual(
    linkDialogs(s).ledger.items.map(i => [i.id, i.dialog]),
    [['i1', { callId: 'call_1', index: 0, question: 'Ship it now?' }]],
  )
  assert.deepEqual(
    ledger.items.map(i => [i.kind, i.at]),
    [['question', null]],
  )
  assert.deepEqual(
    ledger.closed.map(d => [d.id, d.kind, d.how]),
    [['i0', 'question', 'dismissed']],
  )
  assert.deepEqual(
    ledger.findings.map(f => f.id),
    ['f1'],
  )
  assert.equal(ledger.nextId, EMPTY.nextId)
})

test('a session file this build cannot read remains intact after a routine update', async () => {
  const dir = tempDir()
  const initial = await updateState(dir, 's1', s => ({
    ...s,
    ledger: { ...s.ledger, turn: 7 },
  }))
  const path = statePath(dir, 's1')
  for (const saved of [
    '{"ledger": ',
    JSON.stringify({ ...initial, pending: { broken: true } }),
    JSON.stringify({ ...initial, version: 2 }),
  ]) {
    writeFileSync(path, saved)
    await assert.rejects(readState(dir, 's1'))
    await assert.rejects(updateState(dir, 's1', s => ({ ...s, tabSeenAt: 5 })))
    assert.equal(readFileSync(path, 'utf8'), saved)
  }
  assert.deepEqual(readdirSync(join(dir, 'sessions')), ['s1.json'])
})
