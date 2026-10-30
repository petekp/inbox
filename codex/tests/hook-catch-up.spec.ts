import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { handleHook } from '../src/hook'
import { herdrOnWrite } from '../src/host'
import { readState, updateState } from '../src/state'
import { fakeRunner, input, rolloutCopy, tempDir, turnRow } from './helpers'
import { reportedTokens } from '../../tests/session-script'
import { CATCH_UP_REPLY, execDeps, runUpdates } from './hook-fixtures'

test('a session resumed with earlier turns is marked behind at its first hook and catches up over the rollout, and each write reports to its Herdr pane', async () => {
  const dir = tempDir()
  const herdr = fakeRunner(() => ({ code: 0, stdout: '', stderr: '' }))
  let at = 100
  const onWrite = herdrOnWrite({ HERDR_PANE_ID: 'p1' }, herdr.exec, dir, () => ++at)
  const deps = { ...execDeps(dir), onWrite }
  const transcript = rolloutCopy()
  const prompts: string[] = []

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'resume', transcript_path: transcript }), deps)
  const started = await readState(dir, 's1')
  assert.equal(started.presence.ledgerState, 'behind')
  assert.equal(started.transcriptPath, transcript)
  assert.deepEqual(deps.updates, ['s1'])

  await runUpdates(
    dir,
    's1',
    async prompt => (prompts.push(prompt), CATCH_UP_REPLY),
    () => 7,
    onWrite,
  )
  const caught = await readState(dir, 's1')
  assert.equal(prompts.length, 1)
  assert.match(prompts[0] ?? '', /<conversation>\n[\s\S]*Person: List the files here and say what each does/)
  assert.equal(caught.presence.ledgerState, 'current')
  assert.deepEqual(
    caught.ledger.items.map(i => i.ask),
    ['Allow edits?'],
  )

  const reports = herdr.calls.map(args => args.join(' '))
  assert.ok(reports.every(r => r.startsWith('herdr pane report-metadata p1 --source inbox ')))
  const tokens = herdr.calls.map(reportedTokens)
  const cleared = {
    inbox: null,
    'inbox-stop': null,
    'inbox-needs-you': null,
    'inbox-findings': null,
    'inbox-prs': null,
  }
  assert.deepEqual(tokens[0], cleared)
  assert.deepEqual(tokens.at(-1), { ...cleared, inbox: 'Allow edits?', 'inbox-needs-you': '1' })
  const seqs = herdr.calls.map(args => Number(args[args.indexOf('--seq') + 1]))
  assert.deepEqual(
    seqs,
    [...seqs].sort((a, b) => a - b),
  )
  assert.equal(new Set(seqs).size, seqs.length)
})

function forkRollout(parentId: string): string {
  const [first, ...rest] = readFileSync(rolloutCopy(), 'utf8').split('\n')
  const meta = JSON.parse(first ?? '')
  const path = join(tempDir(), 'fork.jsonl')
  writeFileSync(
    path,
    [JSON.stringify({ ...meta, payload: { ...meta.payload, forked_from_id: parentId } }), ...rest].join('\n'),
  )

  return path
}

test('a forked chat takes its parent’s ledger at its first hook, and catches up when the parent has none', async () => {
  const dir = tempDir()
  const deps = execDeps(dir)
  await updateState(dir, 'parent', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 3, turnsApplied: 3 },
    ledger: { ...s.ledger, turn: 3, updates: 1, nextId: 4 },
  }))

  await handleHook(
    input('SessionStart', {
      session_id: 'child',
      cwd: '/repo',
      source: 'startup',
      transcript_path: forkRollout('parent'),
    }),
    deps,
  )
  const child = await readState(dir, 'child')
  assert.equal(child.ledger.turn, 3)
  assert.equal(child.presence.turnsStarted, 0)
  assert.equal(child.presence.ledgerState, 'current')
  assert.deepEqual(deps.updates, [])

  await handleHook(
    input('SessionStart', {
      session_id: 'orphan',
      cwd: '/repo',
      source: 'startup',
      transcript_path: forkRollout('missing-parent'),
    }),
    deps,
  )
  assert.equal((await readState(dir, 'orphan')).presence.ledgerState, 'behind')
  assert.deepEqual(deps.updates, ['orphan'])
})

test('a failed catch-up leaves the ledger behind, and the next Stop catches up again before the exchange', async () => {
  const dir = tempDir()
  const deps = execDeps(dir)
  const transcript = rolloutCopy()
  const prompts: string[] = []
  let answer: string | null = null
  const ask = async (prompt: string) => (prompts.push(prompt), answer)

  await handleHook(input('UserPromptSubmit', { prompt: 'What now?', turn_id: 't9', transcript_path: transcript }), deps)
  await handleHook(
    input('Stop', { turn_id: 't9', transcript_path: transcript, last_assistant_message: 'Try adding tests.' }),
    deps,
  )
  await runUpdates(dir, 's1', ask, () => 7)
  assert.equal((await readState(dir, 's1')).presence.ledgerState, 'failed')
  assert.equal(prompts.length, 1)

  answer = CATCH_UP_REPLY
  await handleHook(input('Stop', { turn_id: 't9', transcript_path: transcript, last_assistant_message: '' }), deps)
  assert.equal(deps.updates.length, 3)
  await runUpdates(dir, 's1', ask, () => 8)
  const caught = await readState(dir, 's1')
  assert.equal(prompts.length, 2)
  assert.match(prompts[1] ?? '', /<conversation>/)
  assert.equal(caught.presence.ledgerState, 'current')
  assert.deepEqual(caught.pending, [])
})

test('a new session, a compaction start, a subagent and a session with recorded turns are not marked behind', async () => {
  const dir = tempDir()
  const deps = execDeps(dir)
  const fresh = join(tempDir(), 'fresh.jsonl')
  writeFileSync(fresh, turnRow('task_started', 't1'))
  const earlier = rolloutCopy()

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup', transcript_path: fresh }), deps)
  await handleHook(input('UserPromptSubmit', { prompt: 'Hi', turn_id: 't1', transcript_path: fresh }), deps)
  assert.equal((await readState(dir, 's1')).presence.ledgerState, 'current')

  await handleHook(input('SessionStart', { session_id: 's2', source: 'compact', transcript_path: earlier }), deps)
  assert.equal((await readState(dir, 's2')).presence.ledgerState, 'current')

  await handleHook(
    input('UserPromptSubmit', { session_id: 's3', agent_id: 'a1', prompt: 'Review', transcript_path: earlier }),
    deps,
  )
  const subagent = await readState(dir, 's3')
  assert.equal(subagent.presence.ledgerState, 'current')
  assert.equal(subagent.transcriptPath, null)

  await updateState(dir, 's4', s => ({ ...s, presence: { ...s.presence, turnsStarted: 2, turnsApplied: 2 } }))
  await handleHook(
    input('UserPromptSubmit', { session_id: 's4', prompt: 'Go', turn_id: 't9', transcript_path: earlier }),
    deps,
  )
  assert.equal((await readState(dir, 's4')).presence.ledgerState, 'current')
  assert.deepEqual(deps.updates, [])
})
