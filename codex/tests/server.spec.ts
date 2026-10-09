import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { notePrompt } from '../src/core'
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
        structuredContent: {
          error: string | null
          note: string | null
          view: { needsYou: { questions: { id: string }[] } }
        }
        content: { text: string }[]
      }
    }>

  return { dir, calls: runner.calls, call }
}

const ANSWER = { press: { action: 'answer', id: 'i1', option: 'Yes' }, thread: 's1' }

test('a press sends its message into the tab’s thread with the codex binary the hooks saw, and the next prompt reads it as a press', async () => {
  const { dir, calls, call } = await setup(0)
  const r = await call('inbox_press', ANSWER, { thread_id: 's1' })
  assert.equal(r.result.structuredContent.error, null)
  assert.equal(r.result.structuredContent.note, null)
  assert.deepEqual(calls, [['/apps/codex', 'queue', '--thread', 's1', '--message', 'Re "Ship it?": Yes']])
  assert.deepEqual(r.result.structuredContent.view.needsYou.questions, [])
  const s = await readState(dir, 's1')
  assert.equal(s.sent[0]?.text, 'Re "Ship it?": Yes')

  const prompt = notePrompt(s, 'Re "Ship it?": Yes', 200)
  assert.deepEqual(prompt.state.turn.press, { id: 'i1', action: 'answer' })
  assert.deepEqual(prompt.state.sent, [])
  assert.match(prompt.notes.join('\n'), /Closed since you last read the inbox:\n- "Ship it\?" → Yes/)
})

test('a press drawn in another thread, or on a row that changed, reads stale and sends and saves nothing', async () => {
  const { dir, calls, call } = await setup(0)
  const before = await readState(dir, 's1')
  // The tab drew the press for another thread, or is an old tab that sends none.
  for (const thread of ['s2', undefined]) {
    const r = await call('inbox_press', { ...ANSWER, thread }, { thread_id: 's1' })
    assert.equal(r.result.structuredContent.note, 'stale')
    assert.equal(r.result.content[0]?.text, 'This changed before your press. Nothing was sent.')
  }
  // Codex closed the question before the person's typed answer reached it.
  await updateState(dir, 's1', s => ({ ...s, ledger: { ...s.ledger, items: [] } }))
  const typed = await call(
    'inbox_press',
    { press: { action: 'type', id: 'i1', text: 'Yes, ship it' }, thread: 's1' },
    { thread_id: 's1' },
  )
  assert.equal(typed.result.structuredContent.note, 'stale')
  assert.deepEqual(calls, [])
  const s = await readState(dir, 's1')
  assert.deepEqual(s.sent, [])
  assert.deepEqual(s.lastActions, before.lastActions)
})

test('a press whose message fails to send leaves its row as it was', async () => {
  const { dir, call } = await setup(1)
  const r = await call('inbox_press', ANSWER, { thread_id: 's1' })
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

test('a press in the demo changes only the demo, sends nothing into the conversation, and says so', async () => {
  const { dir, calls, call } = await setup(0)
  const before = await readState(dir, 's1')
  type Questions = {
    result: { structuredContent: { needsYou: { questions: { id: string; item: { options: string[] } }[] } } }
  }
  const demo = (await call('inbox_view', { demo: true }, { thread_id: 's1' })) as unknown as Questions
  const first = demo.result.structuredContent.needsYou.questions[0]
  assert.ok(first)
  const option = first.item.options[0]
  const r = await call(
    'inbox_press',
    { press: { action: 'answer', id: first.id, option }, thread: 's1', demo: true },
    { thread_id: 's1' },
  )
  assert.deepEqual(calls, [])
  assert.ok(!r.result.structuredContent.view.needsYou.questions.some(q => q.id === first.id))
  assert.equal(r.result.structuredContent.note, 'sample')
  assert.equal(r.result.content[0]?.text, 'Sample entry: nothing was sent.')
  // A copy step copies nothing in the demo: its row gets the same note.
  const copied = await call(
    'inbox_press',
    { press: { action: 'step', id: 'd16', step: 0, label: 'Copy theme command' }, thread: 's1', demo: true },
    { thread_id: 's1' },
  )
  assert.equal(copied.result.structuredContent.note, 'sample')
  assert.equal((copied.result.structuredContent as unknown as { copy: unknown }).copy, null)
  assert.deepEqual(await readState(dir, 's1'), before)
})

test('an Open step shows a file macOS would run in Finder, opens any other file, and records on its row what happened', async () => {
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
            { kind: 'open', path: 'moved.md' },
          ],
          turn: 1,
          at: 1,
        },
      ],
    },
  }))
  const step = (step: number, label: string) =>
    call('inbox_press', { press: { action: 'step', id: 'i2', step, label }, thread: 's1' }, { thread_id: 's1' })
  await step(0, 'Open deploy.command')
  await step(1, 'Open notes.md')
  assert.deepEqual(calls, [
    ['open', '-R', join(root, 'deploy.command')],
    ['open', join(root, 'notes.md')],
  ])
  assert.deepEqual((await readState(dir, 's1')).lastActions.i2?.result, {
    state: 'done',
    parts: [{ kind: 'open', name: 'notes.md', isCommand: false, error: null }],
    at: 100,
  })
  // A file that is gone fails on its row; the reply's error is only for a message that was not sent.
  const moved = await step(2, 'Open moved.md')
  assert.equal(moved.result.structuredContent.error, null)
  assert.deepEqual((await readState(dir, 's1')).lastActions.i2?.result, {
    state: 'failed',
    parts: [{ kind: 'open', name: 'moved.md', isCommand: false, error: 'it no longer exists' }],
    at: 100,
  })
  assert.equal(calls.length, 2)
})
