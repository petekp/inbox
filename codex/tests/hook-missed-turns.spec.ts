import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { handleHook } from '../src/hook'
import type { HookInput } from '../src/hook'
import { readState, statePath, updateState } from '../src/state'
import { input, ROLLOUT_FIXTURE, tempDir, turnRow } from './helpers'
import { CATCH_UP_REPLY, execDeps, runUpdates } from './hook-fixtures'

test('turns that ended without a Stop, interrupted ones included, are caught up at the next hook, also in a session saved before the covered turn existed or whose covered turn the rollout lacks; a prompt recorded for one of them does not join the next turn’s; and a clear start covers them instead', async () => {
  const dir = tempDir()
  const deps = execDeps(dir)
  const rows = readFileSync(ROLLOUT_FIXTURE, 'utf8').split('\n')
  const path = join(tempDir(), 'rollout.jsonl')
  const rolloutThrough = (row: number) => writeFileSync(path, rows.slice(0, row + 1).join('\n'))
  const [first, second, third, fourth] = [1, 20, 30, 38].map(row => JSON.parse(rows[row] ?? '').payload.turn_id)
  const hook = (event: string, turnId: string, fields: Partial<HookInput> = {}) =>
    handleHook(input(event, { turn_id: turnId, transcript_path: path, ...fields }), deps)
  const prompts: string[] = []

  rolloutThrough(1)
  await hook('UserPromptSubmit', first, { prompt: 'List the files here and say what each does' })
  rolloutThrough(19)
  await hook('Stop', first, { last_assistant_message: 'Here are the files.' })
  assert.equal((await readState(dir, 's1')).coveredTurn, first)

  rolloutThrough(30)
  await hook('UserPromptSubmit', third, { prompt: 'In one sentence, what did we discuss so far?' })
  const behind = await readState(dir, 's1')
  assert.equal(behind.presence.ledgerState, 'behind')
  assert.equal(behind.coveredTurn, second)
  assert.deepEqual(deps.updates, ['s1', 's1'])

  rolloutThrough(38)
  await hook('UserPromptSubmit', fourth, { prompt: 'SYNTHETIC: what do you suggest?' })
  const dropped = await readState(dir, 's1')
  assert.equal(dropped.coveredTurn, third)
  assert.equal(dropped.turn.person, 'SYNTHETIC: what do you suggest?')

  await runUpdates(
    dir,
    's1',
    async prompt => (prompts.push(prompt), CATCH_UP_REPLY),
    () => 7,
  )
  const caught = await readState(dir, 's1')
  assert.equal(prompts.length, 1)
  assert.match(prompts[0] ?? '', /Person: Now add a subtract function to calc\.py/)
  assert.equal(caught.presence.ledgerState, 'current')
  assert.deepEqual(caught.pending, [])
  assert.deepEqual(
    caught.ledger.items.map(i => i.ask),
    ['Allow edits?'],
  )

  rolloutThrough(44)
  await hook('Stop', fourth, { last_assistant_message: 'Add tests next.' })
  const after = await readState(dir, 's1')
  assert.equal(after.presence.ledgerState, 'current')
  assert.equal(after.coveredTurn, fourth)
  assert.deepEqual(
    after.pending.map(p => p.ex.person),
    ['SYNTHETIC: what do you suggest?'],
  )

  await updateState(dir, 's1', s => ({ ...s, coveredTurn: first }))
  const updates = deps.updates.length
  await handleHook(input('SessionStart', { source: 'clear', cwd: '/repo', transcript_path: path }), deps)
  const cleared = await readState(dir, 's1')
  assert.equal(cleared.presence.ledgerState, 'current')
  assert.equal(cleared.coveredTurn, fourth)
  assert.equal(deps.updates.length, updates)

  rolloutThrough(38)
  await updateState(dir, 's2', s => ({
    ...s,
    heard: { ...s.heard, startAt: 1, promptAt: 2, prompts: 1, promptTurns: [first], stopAt: 3, stops: 1 },
  }))
  const { coveredTurn: _covered, ...savedBefore } = JSON.parse(readFileSync(statePath(dir, 's2'), 'utf8'))
  writeFileSync(statePath(dir, 's2'), JSON.stringify(savedBefore))
  await updateState(dir, 's3', s => ({ ...s, heard: { ...s.heard, startAt: 1 }, coveredTurn: 'gone' }))
  for (const id of ['s2', 's3']) {
    await handleHook(
      input('UserPromptSubmit', { session_id: id, turn_id: fourth, prompt: 'Go', transcript_path: path }),
      deps,
    )
    const caughtUp = await readState(dir, id)
    assert.equal(caughtUp.presence.ledgerState, 'behind', id)
    assert.equal(caughtUp.coveredTurn, third, id)
  }

  const interrupted = join(tempDir(), 'rollout.jsonl')
  const turnRows = (rows: Parameters<typeof turnRow>[]) =>
    writeFileSync(interrupted, rows.map(row => turnRow(...row)).join('\n'))
  await updateState(dir, 's4', s => ({ ...s, heard: { ...s.heard, startAt: 1 }, coveredTurn: 'p' }))
  const prompt = (turnId: string, text: string) =>
    handleHook(
      input('UserPromptSubmit', { session_id: 's4', turn_id: turnId, prompt: text, transcript_path: interrupted }),
      deps,
    )
  turnRows([
    ['task_started', 'p'],
    ['task_complete', 'p'],
    ['task_started', 'a'],
  ])
  await prompt('a', 'Rename the module')
  assert.equal((await readState(dir, 's4')).presence.ledgerState, 'current')
  turnRows([
    ['task_started', 'p'],
    ['task_complete', 'p'],
    ['task_started', 'a'],
    ['turn_aborted', 'a'],
    ['task_started', 'b'],
  ])
  const updatesBefore = deps.updates.length
  await prompt('b', 'Keep the old name')
  const afterInterrupt = await readState(dir, 's4')
  assert.equal(afterInterrupt.presence.ledgerState, 'behind')
  assert.equal(afterInterrupt.coveredTurn, 'a')
  assert.equal(afterInterrupt.turn.person, 'Keep the old name')
  assert.deepEqual(deps.updates.slice(updatesBefore), ['s4'])
})

test('a covered turn that started far back in a long rollout still decides which later turns are caught up, and a clear start covers turns that ended that far back', async () => {
  const dir = tempDir()
  const deps = execDeps(dir)
  const path = join(tempDir(), 'rollout.jsonl')
  const filler = (bytes: number) =>
    JSON.stringify({ type: 'event_msg', payload: { type: 'agent_message', message: 'x'.repeat(bytes) } })
  const promptIn = async (id: string, rows: string[]) => {
    writeFileSync(path, rows.join('\n'))
    await updateState(dir, id, s => ({ ...s, heard: { ...s.heard, startAt: 1 }, coveredTurn: 'p' }))
    await handleHook(
      input('UserPromptSubmit', { session_id: id, turn_id: 'b', prompt: 'Go', transcript_path: path }),
      deps,
    )

    return readState(dir, id)
  }
  const afterLongTurn = (bytes: number) => [turnRow('task_started', 'p'), filler(bytes), turnRow('task_complete', 'p')]

  for (const [id, bytes] of [
    ['s1', 100 * 1024],
    ['s2', 600 * 1024],
    ['s3', 5 * 1024 * 1024],
  ] as const) {
    const missed = await promptIn(id, [
      ...afterLongTurn(bytes),
      turnRow('task_started', 'a'),
      turnRow('turn_aborted', 'a'),
      turnRow('task_started', 'b'),
    ])
    assert.equal(missed.presence.ledgerState, 'behind', id)
    assert.equal(missed.coveredTurn, 'a', id)
  }

  const current = await promptIn('s4', [...afterLongTurn(600 * 1024), turnRow('task_started', 'b')])
  assert.equal(current.presence.ledgerState, 'current')
  assert.equal(current.coveredTurn, 'p')

  writeFileSync(path, [turnRow('task_started', 'x'), filler(600 * 1024), turnRow('task_complete', 'x')].join('\n'))
  await updateState(dir, 's5', s => ({ ...s, heard: { ...s.heard, startAt: 1 }, coveredTurn: 'gone' }))
  await handleHook(
    input('SessionStart', { session_id: 's5', source: 'clear', cwd: '/repo', transcript_path: path }),
    deps,
  )
  const cleared = await readState(dir, 's5')
  assert.equal(cleared.coveredTurn, 'x')
  assert.equal(cleared.presence.ledgerState, 'current')
})
