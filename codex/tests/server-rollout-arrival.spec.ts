import assert from 'node:assert/strict'
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { handleHook } from '../src/hook'
import { ROLLOUT_ARRIVAL_AFTER_MS } from '../src/rollout-arrivals'
import { makeServer } from '../src/server'
import { SETTLE_WINDOW_MS } from '../src/settle'
import { readState, updateState } from '../src/state'
import { codexCommandStore } from '../src/command-log'
import { commandsOf } from '../../core/runtime/remote-command-state'
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

async function queuedPress(press: Record<string, unknown> = ANSWER) {
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
  await call('inbox_press', press)
  at += SETTLE_WINDOW_MS
  await call('inbox_view', {})
  const view = async (later: number) => {
    at = later
    await call('inbox_view', {})

    return readState(dir, 's1')
  }

  return { dir, transcript, view, call, setNow: (to: number) => void (at = to) }
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

test('transcript polling cannot confirm remote commands from matching text, even after a real arrival', async () => {
  const { dir, transcript, view } = await queuedPress()
  await updateState(dir, 's1', s => {
    const sent = s.sent[0]
    if (!sent) throw new Error('The answer was not queued.')
    const ids = ['remote-first', 'remote-second']
    return {
      ...s,
      sent: ids.map(id => ({ ...sent, deliveryId: id, commandIds: [id] })),
      remoteCommands: Object.fromEntries(
        ids.map(id => [
          id,
          {
            payload: id,
            acceptedAt: PRESSED_AT,
            state: 'applied' as const,
            error: null,
            row: 'i1',
            deliveryId: id,
            delivered: false,
            pendingDelivery: true,
          },
        ]),
      ),
    }
  })
  appendFileSync(transcript, JSON.stringify(userMessageRow(MESSAGE + '\n', PRESSED_AT + 5_000)) + '\n')
  const delivered = async (s: Awaited<ReturnType<typeof view>>) => {
    const { commands } = await commandsOf(
      codexCommandStore(dir, 's1', () => PRESSED_AT),
      s,
    )
    return [commands['remote-first']?.delivered, commands['remote-second']?.delivered]
  }
  for (const now of [PRESSED_AT + 20_000, PRESSED_AT + 30_000]) {
    const s = await view(now)
    assert.deepEqual(await delivered(s), [false, false])
    assert.equal(s.sent.length, 2)
  }
  await handleHook(input('UserPromptSubmit', { prompt: MESSAGE, turn_id: 't1' }), hookDeps(dir))
  const s = await view(PRESSED_AT + 40_000)
  assert.deepEqual(await delivered(s), [true, false])
  assert.equal(s.sent.length, 1)
})

test('a queued Explain the rollout saved mid-turn stops reading Queued in the next tab read, with no tab switch', async () => {
  const { dir, transcript, call, setNow } = await queuedPress({ press: { action: 'explain', id: 'i1' }, thread: 's1' })
  const message = (await readState(dir, 's1')).sent[0]!.text
  const feedbackAt = async (at: number) => {
    setNow(at)
    const r = (await call('inbox_view', {})) as unknown as {
      result: { structuredContent: { needsYou: { questions: { feedback: { is: string } | null }[] } } }
    }

    return r.result.structuredContent.needsYou.questions[0]?.feedback?.is
  }
  assert.equal(await feedbackAt(PRESSED_AT + 5_000), 'queued')

  appendFileSync(transcript, JSON.stringify(userMessageRow(message + '\n', PRESSED_AT + 5_000)) + '\n')

  assert.notEqual(await feedbackAt(PRESSED_AT + 5_000 + ROLLOUT_ARRIVAL_AFTER_MS), 'queued')
  assert.equal((await readState(dir, 's1')).lastActions.i1?.delivery?.state, 'arrived')
})
