import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { EMPTY, inboxText } from '../../hooks/ledger'
import { feedbackText } from '../../hooks/view'
import { notePrompt, viewOf } from '../src/core'
import { handleHook } from '../src/hook'
import { readState, statePath, updateState } from '../src/state'
import { CODEX } from '../src/texts'
import { hookDeps, input, tempDir } from './helpers'

test('a session starts with the guidance, records the prompt, and ends the turn into the update', async () => {
  const dir = tempDir()
  const root = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  const deps = hookDeps(dir)

  const start = await handleHook(
    input('SessionStart', { cwd: root, source: 'startup', transcript_path: transcript }),
    deps,
  )
  assert.match(JSON.stringify(start), /mcp__inbox__record_finding/)
  const started = await readState(dir, 's1')
  assert.equal(started.root, root)
  assert.equal(started.cliPath, '/apps/codex')
  // A resumed conversation still holds the guidance, and this one has no ledger yet.
  assert.equal(
    await handleHook(input('SessionStart', { cwd: root, source: 'resume', transcript_path: transcript }), deps),
    null,
  )

  await handleHook(input('UserPromptSubmit', { prompt: 'Run the tests', turn_id: 't1' }), deps)
  assert.equal(
    await handleHook(
      input('Stop', {
        turn_id: 't1',
        transcript_path: transcript,
        last_assistant_message: 'All tests pass.',
      }),
      deps,
    ),
    null,
  )
  const ended = await readState(dir, 's1')
  assert.equal(ended.pending[0]?.ex.person, 'Run the tests')
  assert.equal(ended.pending[0]?.ex.reply, 'All tests pass.')
  assert.deepEqual(deps.updates, ['s1'])
})

test('a patch notes each edited file, resolved against the folder it ran in', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  const patch = '*** Begin Patch\n*** Add File: ../new/b.txt\n+b\n*** End Patch'
  await handleHook(
    input('PreToolUse', { tool_name: 'apply_patch', tool_input: { command: patch }, cwd: '/work/app' }),
    deps,
  )
  const s = await readState(dir, 's1')
  assert.deepEqual(s.turn.activity, ['edited /work/new/b.txt'])
})

test('hooks do nothing in a codex exec run', async () => {
  const dir = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  writeFileSync(
    transcript,
    `${JSON.stringify({ type: 'session_meta', payload: { originator: 'codex_exec', source: 'exec' } })}\n`,
  )
  const out = await handleHook(input('SessionStart', { cwd: '/', transcript_path: transcript }), hookDeps(dir))
  assert.equal(out, null)
  assert.equal((await readState(dir, 's1')).root, '')
})

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
    // Sent before the server kept the row and the queued id.
    sent: [{ text: 'Re "Ship it?": Yes', press: { id: 'i1', action: 'answer' }, at: 1 }],
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
    // Last actions as this plugin saved them before they had a kind.
    lastActions: {
      i1: { action: 'explain', text: 'Explain sent', at: 1 },
      i2: { action: 'typed', text: 'Reply sent', at: 1, isHandoff: true, turnsStarted: 1 },
      i3: { action: 'step-0', text: 'Run seed script sent', at: 1, isHandoff: true, turnsStarted: 1 },
      f2: { action: 'address', text: 'Sent to Codex to fix', at: 1, title: 'No tests' },
      f3: { action: 'discuss', text: 'Discuss sent', at: 1, title: 'No docs' },
      // The table has no row for a typed reply to a finding, so it records nothing now.
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
  // The old Explain reads as today's, on the question it was pressed on.
  const question = viewOf(s, 2).needsYou.questions[0]
  assert.equal(question && question.feedback && feedbackText(question.feedback, 'html'), '✓ Explain')
  assert.ok(question?.actions.some(a => a.label === 'Explain again'))
  // Its arrival changes no row.
  assert.deepEqual(
    s.sent.map(x => [x.row, x.queuedId]),
    [[null, null]],
  )
  assert.deepEqual(notePrompt(s, 'Re "Ship it?": Yes', 2).state.lastActions, s.lastActions)
  // Saved and read again, a converted file stays as it is.
  await updateState(dir, 's1', x => x)
  assert.deepEqual((await readState(dir, 's1')).lastActions, s.lastActions)
  for (const key of ['top', 'checks', 'snapshots', 'recordedRuns']) assert.equal(key in s, false, key)
  assert.deepEqual(s.turn, { person: 'Run the tests', activity: [], press: null })
  assert.equal('checks' in (s.pending[0]?.ex ?? {}), false)
  assert.equal(s.pending[0]?.ex.reply, 'Hello')
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

test('the inbox line Codex reads names the Inbox tab, never the mod’s /inbox pane', () => {
  const ledger = {
    ...EMPTY,
    items: [
      {
        id: 'i1',
        kind: 'question' as const,
        label: null,
        ask: 'Ship it?',
        options: ['Yes'],
        rec: null,
        helps: [],
        turn: 1,
        at: 1,
      },
    ],
  }
  for (const isOpen of [true, false]) {
    const text = inboxText(CODEX, ledger, isOpen)
    assert.match(text, /Inbox tab/)
    assert.doesNotMatch(text, /\/inbox|pane/)
  }
})

test('a session file this build cannot read is kept aside, and the session starts over', async () => {
  const dir = tempDir()
  mkdirSync(join(dir, 'sessions'), { recursive: true })
  writeFileSync(statePath(dir, 's1'), '{"ledger": ')
  await assert.rejects(readState(dir, 's1'))

  const s = await updateState(dir, 's1', s => ({ ...s, tabSeenAt: 5 }))
  assert.equal(s.tabSeenAt, 5)
  const kept = readdirSync(join(dir, 'sessions')).filter(f => f.startsWith('s1.json.unreadable-'))
  assert.equal(kept.length, 1)
  assert.equal(readFileSync(join(dir, 'sessions', kept[0]!), 'utf8'), '{"ledger": ')
})
