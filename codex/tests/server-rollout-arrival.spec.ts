import assert from 'node:assert/strict'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { handleHook } from '../src/hook'
import { ROLLOUT_ARRIVAL_AFTER_MS } from '../src/rollout-arrivals'
import { makeServer } from '../src/server'
import { SETTLE_WINDOW_MS } from '../src/settle'
import { readState, updateState } from '../src/state'
import { fakeRunner, hookDeps, input, tempDir } from './helpers'
import { ANSWER, setup } from './server-fixtures'

const MESSAGE = 'Re "Ship it?": Yes'
const PRESSED_AT = 1_000_000

function userMessageRow(text: string, at: number) {
  return {
    timestamp: new Date(at).toISOString(),
    type: 'response_item',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  }
}

async function queuedPress() {
  const { dir } = await setup(0)
  const transcript = join(tempDir(), 'rollout.jsonl')
  const meta = { type: 'session_meta', payload: { id: 's1', originator: 'codex_cli', cwd: '/repo' } }
  writeFileSync(transcript, JSON.stringify(meta) + '\n')
  await updateState(dir, 's1', s => ({ ...s, transcriptPath: transcript, ledger: { ...s.ledger, turn: 1 } }))
  let at = PRESSED_AT
  const runner = fakeRunner(() => ({ code: 0, stdout: 'Queued message q1\n', stderr: '' }))
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => at,
    exec: runner.exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
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
  const view = async (later: number) => {
    at = later
    await call('inbox_view', {})

    return readState(dir, 's1')
  }

  return { dir, transcript, view }
}

test('a queued answer the rollout saved mid-turn with a trailing newline reads arrived once no hook matched it', async () => {
  const { dir, transcript, view } = await queuedPress()
  assert.equal((await readState(dir, 's1')).lastActions.i1?.delivery?.state, 'queued')
  appendFileSync(transcript, JSON.stringify(userMessageRow(MESSAGE + '\n', PRESSED_AT + 5_000)) + '\n')

  const s = await view(PRESSED_AT + 5_000 + ROLLOUT_ARRIVAL_AFTER_MS)

  assert.equal(s.lastActions.i1?.delivery?.state, 'arrived')
  assert.deepEqual(s.sent, [])
})

test('a queued answer the rollout saved a moment ago stays queued so the hook can match it', async () => {
  const { transcript, view } = await queuedPress()
  appendFileSync(transcript, JSON.stringify(userMessageRow(MESSAGE, PRESSED_AT + 5_000)) + '\n')

  const s = await view(PRESSED_AT + 5_000 + ROLLOUT_ARRIVAL_AFTER_MS - 1)

  assert.equal(s.lastActions.i1?.delivery?.state, 'queued')
  assert.equal(s.sent.length, 1)
})

test('a queued answer stays queued when the rollout holds only an earlier message with its text', async () => {
  const { transcript, view } = await queuedPress()
  appendFileSync(transcript, JSON.stringify(userMessageRow(MESSAGE, PRESSED_AT - 60_000)) + '\n')

  const s = await view(PRESSED_AT + 60_000)

  assert.equal(s.lastActions.i1?.delivery?.state, 'queued')
})

test('a prompt hook whose text has a trailing newline still reads the queued answer arrived', async () => {
  const { dir } = await queuedPress()

  await handleHook(input('UserPromptSubmit', { prompt: MESSAGE + '\n', turn_id: 't1' }), hookDeps(dir))

  const s = await readState(dir, 's1')
  assert.equal(s.lastActions.i1?.delivery?.state, 'arrived')
  assert.deepEqual(s.sent, [])
})
