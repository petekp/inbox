import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { EMPTY, inboxText } from '../../hooks/ledger'
import { handleHook } from '../src/hook'
import { readState, statePath, updateState } from '../src/state'
import { CODEX } from '../src/texts'
import { commandEndLine, fakeRunner, hookDeps, input, tempDir, tempRepo } from './helpers'

const FAILED = 'ℹ tests 1\nℹ pass 0\nℹ fail 1\n✖ adds (1.2ms)'

test('a session records a failing check, ends the turn, and sends Codex back once over a claim against it', async () => {
  const dir = tempDir()
  const repo = tempRepo({
    'package.json': '{"scripts":{"test":"node --test"}}',
    'add.js': 'export const add = (a, b) => a - b\n',
  })
  const transcript = join(tempDir(), 'rollout.jsonl')
  const { exec } = fakeRunner(() => ({ code: 0, stdout: '', stderr: '' }))
  const deps = hookDeps(dir, exec)

  const start = await handleHook(
    input('SessionStart', { cwd: repo, source: 'startup', transcript_path: transcript }),
    deps,
  )
  assert.match(JSON.stringify(start), /mcp__inbox__record_finding/)
  const started = await readState(dir, 's1')
  assert.equal(started.top, repo)
  assert.equal(started.cliPath, '/apps/codex')
  // A resumed conversation still holds the guidance, and this one has no ledger yet.
  assert.equal(
    await handleHook(input('SessionStart', { cwd: repo, source: 'resume', transcript_path: transcript }), deps),
    null,
  )

  await handleHook(input('UserPromptSubmit', { prompt: 'Run the tests', turn_id: 't1' }), deps)
  writeFileSync(transcript, `${commandEndLine('t1', 'e1', 'npm test', repo, 1, FAILED)}\n`)
  assert.equal(
    await handleHook(
      input('Stop', {
        turn_id: 't1',
        transcript_path: transcript,
        last_assistant_message: 'npm test fails: add subtracts.',
      }),
      deps,
    ),
    null,
  )
  const ended = await readState(dir, 's1')
  assert.deepEqual(
    ended.checks.results.map(c => [c.name, c.result, c.folder, c.isLeftFailing]),
    [['npm test', 'fail', null, true]],
  )
  assert.equal(ended.pending[0]?.ex.person, 'Run the tests')
  assert.deepEqual(deps.updates, ['s1'])

  // The next turn claims the tests pass without running them again.
  await handleHook(input('UserPromptSubmit', { prompt: 'Fix it', turn_id: 't2' }), deps)
  const claim = 'Fixed add.js. All tests pass.'
  const sentBack = await handleHook(
    input('Stop', { turn_id: 't2', transcript_path: transcript, last_assistant_message: claim }),
    deps,
  )
  assert.equal(sentBack?.decision, 'block')
  assert.match(String(sentBack?.reason), /npm test failed when it last ran/)

  const final = 'I have not rerun the tests, so the fix is untested.'
  const again = await handleHook(
    input('Stop', {
      turn_id: 't2',
      transcript_path: transcript,
      last_assistant_message: final,
      stop_hook_active: true,
    }),
    deps,
  )
  assert.equal(again, null)
  const s = await readState(dir, 's1')
  assert.equal(s.pending[1]?.ex.reply, `${claim}\n\n${final}`)
})

test('a check run together with other commands is refused before it runs', async () => {
  const { exec } = fakeRunner(() => ({ code: 0, stdout: '', stderr: '' }))
  const deps = hookDeps(tempDir(), exec)
  const out = await handleHook(
    input('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test | tail -5' } }),
    deps,
  )
  assert.equal((out?.hookSpecificOutput as Record<string, unknown>).permissionDecision, 'deny')
  assert.equal(
    await handleHook(input('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' } }), deps),
    null,
  )
})

test('a patch makes the edited file’s repo one of the session’s', async () => {
  const dir = tempDir()
  const repo = tempRepo({ 'a.txt': 'a\n' })
  const { exec } = fakeRunner(() => ({ code: 0, stdout: '', stderr: '' }))
  const deps = hookDeps(dir, exec)
  const patch = `*** Begin Patch\n*** Add File: ${repo}/new/b.txt\n+b\n*** End Patch`
  await handleHook(input('PreToolUse', { tool_name: 'apply_patch', tool_input: { command: patch }, cwd: '/' }), deps)
  const s = await readState(dir, 's1')
  assert.deepEqual(s.checks.repos, [repo])
  assert.deepEqual(s.turn.activity, [`edited ${repo}/new/b.txt`])
})

test('hooks do nothing in a codex exec run', async () => {
  const dir = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  writeFileSync(
    transcript,
    `${JSON.stringify({ type: 'session_meta', payload: { originator: 'codex_exec', source: 'exec' } })}\n`,
  )
  const { exec } = fakeRunner(() => ({ code: 0, stdout: '', stderr: '' }))
  const out = await handleHook(input('SessionStart', { cwd: '/', transcript_path: transcript }), hookDeps(dir, exec))
  assert.equal(out, null)
  assert.equal((await readState(dir, 's1')).root, '')
})

test('a session saved with an older ledger shape loads converted, as the mod converts its own', async () => {
  const dir = tempDir()
  const old = {
    version: 1,
    sessionId: 's1',
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
  }
  mkdirSync(join(dir, 'sessions'), { recursive: true })
  writeFileSync(statePath(dir, 's1'), JSON.stringify(old))
  const { ledger } = await readState(dir, 's1')
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
