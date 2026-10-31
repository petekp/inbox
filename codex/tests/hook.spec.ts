import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { EMPTY } from '../../hooks/ledger'
import { inboxText } from '../../hooks/model-text'
import { parseStatus } from '../../hooks/status'
import { applyStatus } from '../../hooks/status-ops'
import { viewOf } from '../src/core'
import { handleHook } from '../src/hook'
import { readState, updateState } from '../src/state'
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
  assert.match(JSON.stringify(start), /mcp__inbox__record/)
  const started = await readState(dir, 's1')
  assert.equal(started.root, root)
  assert.equal(started.cliPath, '/apps/codex')
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

test('a hook without CODEX_CLI_PATH saves the CLI the app names in CODEX_APP_RUNTIME_CLI_PATH, and CODEX_CLI_PATH wins when both are set', async () => {
  const dir = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  const start = (id: string, env: NodeJS.ProcessEnv) =>
    handleHook(input('SessionStart', { session_id: id, cwd: tempDir(), transcript_path: transcript }), {
      ...hookDeps(dir),
      env,
    })

  await start('app', { CODEX_APP_RUNTIME_CLI_PATH: '/app/codex' })
  await start('override', { CODEX_CLI_PATH: '/person/codex', CODEX_APP_RUNTIME_CLI_PATH: '/app/codex' })
  await start('unnamed', {})

  assert.equal((await readState(dir, 'app')).cliPath, '/app/codex')
  assert.equal((await readState(dir, 'override')).cliPath, '/person/codex')
  assert.equal((await readState(dir, 'unnamed')).cliPath, null)
})

test('a start after compaction carries the Status head and where each open subject stands', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      updates: 1,
      overview: applyStatus(
        null,
        parseStatus('HEAD: Adding caching | Caching answers to cut load\nNEW: queued | Cache | Redis or memory')!,
        1,
        new Set(),
      )!,
    },
  }))
  const context = JSON.stringify(await handleHook(input('SessionStart', { cwd: '/repo', source: 'compact' }), deps))
  assert.match(context, /Working on: Adding caching/)
  assert.match(context, /- Cache: Redis or memory \(queued\)/)
})

test('a main-agent prompt starts a turn that runs until Stop or a start that is not a compact, and a subagent prompt does not', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  const now = async () => ((await readState(dir, 's1')).presence.isTurnRunning ? 'running' : null)

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  await handleHook(input('UserPromptSubmit', { prompt: 'Look around', agent_id: 'a1' }), deps)
  assert.equal(await now(), null)
  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it', turn_id: 't1' }), deps)
  assert.equal(await now(), 'running')
  await handleHook(input('SessionStart', { cwd: '/repo', source: 'compact' }), deps)
  assert.equal(await now(), 'running')
  await handleHook(input('Stop', { last_assistant_message: '', turn_id: 't1' }), deps)
  assert.equal(await now(), null)

  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it again', turn_id: 't2' }), deps)
  await handleHook(input('SessionStart', { cwd: '/repo', source: 'resume' }), deps)
  assert.equal(await now(), null)
})

test('a main-agent prompt no press sent counts as typed, and a press’s message and a subagent prompt do not', async () => {
  const dir = tempDir()
  let clock = 1000
  const deps = hookDeps(dir, () => clock)
  const typedAt = async () => (await readState(dir, 's1')).presence.lastTypedMessageAt
  const answer = 'Re "Ship it?": Yes'

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  await updateState(dir, 's1', s => ({
    ...s,
    sent: [
      {
        text: answer,
        press: { id: 'i1', action: 'answer' },
        at: 900,
        row: 'i1',
        queuedId: null,
        pressedAt: 900,
        deliveryId: 'd1',
        phase: 'accepted',
      },
    ],
  }))
  clock = 2000
  await handleHook(input('UserPromptSubmit', { prompt: answer, turn_id: 't1' }), deps)
  clock = 3000
  await handleHook(input('UserPromptSubmit', { prompt: 'Look around', agent_id: 'a1' }), deps)
  assert.equal(await typedAt(), null)

  clock = 4000
  await handleHook(input('UserPromptSubmit', { prompt: 'Ship the docs too', turn_id: 't2' }), deps)
  assert.equal(await typedAt(), 4000)
})

test('each hook records that it ran, with the turn UserPromptSubmit saw, and the tab reads the session as heard', async () => {
  const dir = tempDir()
  let clock = 1000
  const deps = hookDeps(dir, () => clock)
  const heard = async () => (await readState(dir, 's1')).heard
  assert.equal(viewOf(await readState(dir, 's1'), clock).heard, 'none')

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  assert.deepEqual(await heard(), {
    startAt: 1000,
    promptAt: null,
    prompts: 0,
    promptTurns: [],
    stopAt: null,
    stops: 0,
    promptMissedAt: null,
  })
  clock = 2000
  await handleHook(input('UserPromptSubmit', { prompt: 'Hi', turn_id: 't1' }), deps)
  assert.deepEqual(
    { ...(await heard()), startAt: undefined },
    {
      startAt: undefined,
      promptAt: 2000,
      prompts: 1,
      promptTurns: ['t1'],
      stopAt: null,
      stops: 0,
      promptMissedAt: null,
    },
  )
  await handleHook(input('UserPromptSubmit', { prompt: 'Review', turn_id: 'a1', agent_id: 'agent-1' }), deps)
  assert.deepEqual([(await heard()).prompts, (await heard()).promptTurns], [1, ['t1']])
  clock = 3000
  await handleHook(input('Stop', { turn_id: 't1', last_assistant_message: '' }), deps)
  const h = await heard()
  assert.deepEqual([h.stopAt, h.stops], [3000, 1])
  assert.equal(viewOf(await readState(dir, 's1'), clock).heard, 'heard')
})

test('a session takes its folder from the rollout, and the branch that folder is on at its start and at each turn’s end', async () => {
  const dir = tempDir()
  const folder = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  writeFileSync(transcript, `${JSON.stringify({ type: 'session_meta', payload: { cwd: folder } })}\n`)
  let branch = 'main'
  const deps = hookDeps(dir)
  deps.run = async (args, { cwd }) =>
    args.join(' ') === 'git branch --show-current' && cwd === folder
      ? { code: 0, stdout: `${branch}\n`, stderr: '' }
      : { code: 1, stdout: '', stderr: 'not a repository' }
  const place = async () => (await readState(dir, 's1')).place

  await handleHook(input('SessionStart', { cwd: folder, source: 'startup', transcript_path: transcript }), deps)
  assert.deepEqual(await place(), { folder, branch: 'main' })
  branch = 'fix-login'
  await handleHook(input('UserPromptSubmit', { prompt: 'Switch', turn_id: 't1', transcript_path: transcript }), deps)
  await handleHook(input('Stop', { turn_id: 't1', cwd: folder, transcript_path: transcript }), deps)
  assert.deepEqual(await place(), { folder, branch: 'fix-login' })
})

test('hooks do nothing in a codex exec run or an ephemeral thread', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  const transcript = join(tempDir(), 'rollout.jsonl')
  writeFileSync(
    transcript,
    `${JSON.stringify({ type: 'session_meta', payload: { originator: 'codex_exec', source: 'exec' } })}\n`,
  )
  const out = await handleHook(input('SessionStart', { cwd: '/', transcript_path: transcript }), deps)
  assert.equal(out, null)
  assert.equal((await readState(dir, 's1')).root, '')

  for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop'])
    assert.equal(
      await handleHook(
        input(event, {
          cwd: '/',
          transcript_path: null,
          prompt: 'Suggest the next message',
          last_assistant_message: 'Fix the failing test.',
        }),
        deps,
      ),
      null,
    )
  assert.equal((await readState(dir, 's1')).root, '')
  assert.deepEqual(deps.updates, [])
})

test('the inbox line Codex reads names the Inbox tab, never the mod’s /inbox pane', () => {
  const ledger = {
    ...EMPTY,
    items: [
      {
        id: 'i1',
        kind: 'question' as const,
        label: null,
        from: 'record' as const,
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
