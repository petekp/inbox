import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
        structuredContent: { error: string | null; view: { needsYou: { questions: { id: string }[] } } }
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
  assert.deepEqual(r.result.structuredContent.view.needsYou.questions, [])
  assert.equal((await readState(dir, 's1')).sent[0]?.text, 'Re "Ship it?": Yes')
})

test('a press whose message fails to send leaves its row as it was', async () => {
  const { dir, call } = await setup(1)
  const r = await call('inbox_press', { press: { action: 'answer', id: 'i1', option: 0 } }, { thread_id: 's1' })
  assert.match(r.result.structuredContent.error ?? '', /Not sent: no such thread/)
  assert.equal(r.result.structuredContent.view.needsYou.questions.length, 1)
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

test('a press in the demo changes only the demo and sends nothing into the conversation', async () => {
  const { dir, calls, call } = await setup(0)
  type Questions = { result: { structuredContent: { needsYou: { questions: { id: string }[] } } } }
  const demo = (await call('inbox_view', { demo: true }, { thread_id: 's1' })) as unknown as Questions
  const first = demo.result.structuredContent.needsYou.questions[0]
  assert.ok(first)
  const r = await call(
    'inbox_press',
    { press: { action: 'answer', id: first.id, option: 0 }, demo: true },
    { thread_id: 's1' },
  )
  assert.deepEqual(calls, [])
  assert.ok(!r.result.structuredContent.view.needsYou.questions.some(q => q.id === first.id))
  const real = await readState(dir, 's1')
  assert.deepEqual(real.sent, [])
  assert.deepEqual(
    real.ledger.items.map(i => i.id),
    ['i1'],
  )
})

test('an Open step shows a file macOS would run in Finder, and opens any other file', async () => {
  const { dir, calls, call } = await setup(0)
  const root = tempDir()
  writeFileSync(join(root, 'deploy.command'), 'echo hi')
  writeFileSync(join(root, 'notes.md'), '# Notes')
  await updateState(dir, 's1', s => ({
    ...s,
    root,
    ledger: {
      ...s.ledger,
      items: [
        {
          id: 'i2',
          kind: 'task',
          label: null,
          ask: 'Check the deploy script',
          options: [],
          rec: null,
          helps: [
            { kind: 'open', path: 'deploy.command' },
            { kind: 'open', path: 'notes.md' },
          ],
          turn: 1,
          at: 1,
        },
      ],
    },
  }))
  await call('inbox_press', { press: { action: 'step', id: 'i2', step: 0 } }, { thread_id: 's1' })
  await call('inbox_press', { press: { action: 'step', id: 'i2', step: 1 } }, { thread_id: 's1' })
  assert.deepEqual(calls, [
    ['open', '-R', join(root, 'deploy.command')],
    ['open', join(root, 'notes.md')],
  ])
})
