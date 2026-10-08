import assert from 'node:assert/strict'
import { test } from 'node:test'

import { makeServer } from '../src/server'
import { readState, updateState } from '../src/state'
import { fakeRunner, tempDir } from './helpers'

async function setup(queueCode: number) {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    root: '/repo',
    cliPath: '/apps/codex',
    ledger: {
      ...s.ledger,
      nextId: 2,
      items: [
        {
          id: 'i1',
          kind: 'question',
          label: null,
          ask: 'Ship it?',
          options: ['Yes', 'No'],
          rec: null,
          helps: [],
          turn: 1,
          at: 1,
        },
      ],
    },
  }))
  const runner = fakeRunner(() => ({ code: queueCode, stdout: '', stderr: queueCode === 0 ? '' : 'no such thread' }))
  const handle = makeServer({
    dir,
    now: () => 100,
    exec: runner.exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const call = (name: string, args: Record<string, unknown>, meta: Record<string, unknown>) =>
    handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args, _meta: meta } }) as Promise<{
      result: {
        structuredContent: { error: string | null; view: { questions: unknown[] } }
        content: { text: string }[]
      }
    }>

  return { dir, calls: runner.calls, call }
}

test('a press sends its message into the tab’s thread with the codex binary the hooks saw', async () => {
  const { dir, calls, call } = await setup(0)
  const r = await call('inbox_press', { press: { action: 'answer', id: 'i1', option: 0 } }, { thread_id: 's1' })
  assert.equal(r.result.structuredContent.error, null)
  assert.deepEqual(calls, [['/apps/codex', 'queue', '--thread', 's1', '--message', 'Re "Ship it?": Yes']])
  assert.deepEqual(r.result.structuredContent.view.questions, [])
  assert.equal((await readState(dir, 's1')).sent[0]?.text, 'Re "Ship it?": Yes')
})

test('a press whose message fails to send leaves its row as it was', async () => {
  const { dir, call } = await setup(1)
  const r = await call('inbox_press', { press: { action: 'answer', id: 'i1', option: 0 } }, { thread_id: 's1' })
  assert.match(r.result.structuredContent.error ?? '', /Not sent: no such thread/)
  assert.equal(r.result.structuredContent.view.questions.length, 1)
  assert.deepEqual((await readState(dir, 's1')).sent, [])
})

test('Codex’s own tool calls reach their session through the turn metadata', async () => {
  const { dir, call } = await setup(0)
  const r = await call(
    'record_finding',
    { kind: 'issue', title: 'No lint script', detail: 'Only tests run.' },
    { 'x-codex-turn-metadata': { session_id: 's1', thread_id: 's1' } },
  )
  assert.match(r.result.content[0]?.text ?? '', /^Recorded as f2/)
  assert.equal((await readState(dir, 's1')).ledger.findings[0]?.title, 'No lint script')
})
