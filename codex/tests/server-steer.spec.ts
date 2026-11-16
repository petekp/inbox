import assert from 'node:assert/strict'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import type { SteerResult, SteerTarget } from '../src/app-steer'
import { handleHook } from '../src/hook'
import { makeServer } from '../src/server'
import { SETTLE_WINDOW_MS } from '../src/settle'
import { readState, updateState } from '../src/state'
import { fakeRunner, hookDeps, input, tempDir } from './helpers'
import { ANSWER, queueCalls, setup } from './server-fixtures'

const MESSAGE = 'Re "Ship it?": Yes'

function rollout(originator: string, rows: object[]): string {
  const path = join(tempDir(), 'rollout.jsonl')
  const meta = { type: 'session_meta', payload: { id: 's1', originator, cwd: '/repo' } }
  writeFileSync(path, [meta, ...rows].map(row => JSON.stringify(row)).join('\n') + '\n')

  return path
}

const RUNNING = [{ type: 'event_msg', payload: { type: 'task_started', turn_id: 't1' } }]
const ENDED = [...RUNNING, { type: 'event_msg', payload: { type: 'task_complete', turn_id: 't1' } }]

function userMessageRow(text: string) {
  return {
    timestamp: new Date().toISOString(),
    type: 'response_item',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  }
}

async function pressWith(
  transcript: string,
  steer: (to: SteerTarget) => Promise<SteerResult>,
): Promise<{ dir: string; steers: SteerTarget[]; queued: string[][] }> {
  const { dir } = await setup(0)
  await updateState(dir, 's1', s => ({ ...s, transcriptPath: transcript, ledger: { ...s.ledger, turn: 1 } }))
  let at = 100
  const runner = fakeRunner(() => ({ code: 0, stdout: 'Queued message q1\n', stderr: '' }))
  const steers: SteerTarget[] = []
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => at,
    exec: runner.exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
    steer: to => {
      steers.push(to)
      return steer(to)
    },
  })
  const call = (name: string, args: Record<string, unknown>) =>
    handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args, _meta: { thread_id: 's1' } },
    })
  await call('inbox_press', ANSWER)
  at += SETTLE_WINDOW_MS
  await call('inbox_view', {})

  return { dir, steers, queued: queueCalls(runner.calls) }
}

test('an answer pressed while the Codex app runs the chat’s turn goes into that turn, queues nothing, and reads arrived', async () => {
  const transcript = rollout('Codex Desktop', RUNNING)
  const { dir, steers, queued } = await pressWith(transcript, async () => ({ kind: 'steered' }))

  assert.deepEqual(steers, [{ threadId: 's1', text: MESSAGE, cwd: '/repo' }])
  assert.deepEqual(queued, [])
  const s = await readState(dir, 's1')
  assert.equal(s.lastActions.i1?.delivery?.state, 'arrived')

  await handleHook(input('UserPromptSubmit', { prompt: MESSAGE, turn_id: 't1' }), hookDeps(dir))
  const after = await readState(dir, 's1')
  assert.deepEqual(after.turn.press, { id: 'i1', action: 'answer' })
  assert.equal(after.lastActions.i1?.delivery?.state, 'arrived')
})

test('a failed steer queues the message when the rollout does not show it', async () => {
  const transcript = rollout('Codex Desktop', RUNNING)
  const { dir, queued } = await pressWith(transcript, async () => ({ kind: 'failed', reason: 'no-client-found' }))

  assert.equal(queued.length, 1)
  assert.equal(queued[0]?.at(-1), MESSAGE)
  assert.equal((await readState(dir, 's1')).lastActions.i1?.delivery?.state, 'queued')
})

test('a failed steer queues nothing when the rollout shows the message in the turn', async () => {
  const transcript = rollout('Codex Desktop', RUNNING)
  const { dir, queued } = await pressWith(transcript, async to => {
    appendFileSync(transcript, JSON.stringify(userMessageRow(to.text)) + '\n')
    return { kind: 'failed', reason: 'request-timeout' }
  })

  assert.deepEqual(queued, [])
  assert.equal((await readState(dir, 's1')).lastActions.i1?.delivery?.state, 'arrived')
})

test('a press queues without a steer when the chat’s turn has ended', async () => {
  const transcript = rollout('Codex Desktop', ENDED)
  const { steers, queued } = await pressWith(transcript, async () => ({ kind: 'steered' }))

  assert.deepEqual(steers, [])
  assert.equal(queued.length, 1)
})

test('a press queues without a steer when the chat runs outside the Codex app', async () => {
  const transcript = rollout('codex_cli_rs', RUNNING)
  const { steers, queued } = await pressWith(transcript, async () => ({ kind: 'steered' }))

  assert.deepEqual(steers, [])
  assert.equal(queued.length, 1)
})
