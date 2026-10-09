import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import type { Feedback } from '../../hooks/view'
import { noteHook, notePrompt, viewOf } from '../src/core'
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
  const runner = fakeRunner(() =>
    queueCode === 0
      ? { code: 0, stdout: 'Queued message q1\n', stderr: '' }
      : { code: queueCode, stdout: '', stderr: 'no such thread' },
  )
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
          view: { needsYou: { questions: { id: string; state: { is: string }; feedback: Feedback | null }[] } }
        }
        content: { text: string }[]
      }
    }>

  return { dir, calls: runner.calls, call, handle }
}

const ANSWER = { press: { action: 'answer', id: 'i1', option: 'Yes' }, thread: 's1' }

test('a press sends its message into the tab’s thread with the codex binary the hooks saw, and the next prompt reads it as a press', async () => {
  const { dir, calls, call } = await setup(0)
  const r = await call('inbox_press', ANSWER, { thread_id: 's1' })
  assert.equal(r.result.structuredContent.error, null)
  assert.equal(r.result.structuredContent.note, null)
  assert.deepEqual(calls, [['/apps/codex', 'queue', '--thread', 's1', '--message', 'Re "Ship it?": Yes']])
  // The answered question settles in place before it leaves.
  assert.deepEqual(
    r.result.structuredContent.view.needsYou.questions.map(q => [q.id, q.state.is]),
    [['i1', 'settled']],
  )
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

test('a press reads Queued until Codex takes its message as a prompt, then ✓', async () => {
  const { dir, call } = await setup(0)
  const r = await call('inbox_press', { press: { action: 'explain', id: 'i1' }, thread: 's1' }, { thread_id: 's1' })
  assert.deepEqual(r.result.structuredContent.view.needsYou.questions[0]?.feedback, {
    is: 'queued',
    label: 'Explain',
    at: 100,
  })
  const s = await readState(dir, 's1')
  assert.deepEqual(
    s.sent.map(x => [x.row, x.queuedId]),
    [['i1', 'q1']],
  )
  // UserPromptSubmit carries the message the tab queued.
  const arrived = notePrompt(s, s.sent[0]!.text, 200).state
  assert.deepEqual(viewOf(arrived, 200).needsYou.questions[0]?.feedback, { is: 'done', label: 'Explain', at: 100 })
})

test('a press whose message fails to send is undone, and its row says why with [Try again]', async () => {
  const { dir, call } = await setup(1)
  const r = await call('inbox_press', ANSWER, { thread_id: 's1' })
  // The tab keeps a typed draft only when the reply says the press failed.
  assert.match(r.result.structuredContent.error ?? '', /Not sent: no such thread/)
  const question = r.result.structuredContent.view.needsYou.questions[0]
  assert.equal(question?.state.is, 'open')
  assert.deepEqual(question?.feedback, {
    is: 'notSent',
    reason: 'no such thread',
    retry: { action: 'answer', id: 'i1', option: 'Yes' },
  })
  const s = await readState(dir, 's1')
  assert.deepEqual(s.sent, [])
  assert.deepEqual(s.ledger.closed, [])
})

test('a close Codex read, then undone, is reported again when the row closes a second time', async () => {
  const { dir, calls, call } = await setup(0)
  const press = (action: string) =>
    call('inbox_press', { press: { action, id: 'i1' }, thread: 's1' }, { thread_id: 's1' })
  const prompt = async (text: string) => {
    let notes: string[] = []
    await updateState(dir, 's1', s => {
      const r = notePrompt(s, text, 200)
      notes = r.notes
      return r.state
    })
    return notes.join('\n')
  }
  const closedLine = /Closed since you last read the inbox:\n- "Ship it\?" → dismissed by the user/

  await press('dismiss')
  assert.match(await prompt('carry on'), closedLine)
  const undone = await press('undo')
  assert.equal(undone.result.structuredContent.note, null)
  assert.deepEqual(
    undone.result.structuredContent.view.needsYou.questions.map(q => [q.id, q.state.is]),
    [['i1', 'open']],
  )
  await press('dismiss')
  assert.match(await prompt('and now?'), closedLine)
  // Dismiss and Undo send nothing.
  assert.deepEqual(calls, [])
})

test('the tab opens from the app-only inbox_view tool, and the model’s inbox tool mounts nothing', async () => {
  const { handle } = await setup(0)
  const r = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })) as {
    result: { tools: { name: string; title?: string; _meta?: Record<string, unknown> }[] }
  }
  const tool = (name: string) => r.result.tools.find(t => t.name === name)
  assert.equal(tool('inbox')?._meta, undefined)
  assert.equal(tool('inbox_view')?.title, 'Inbox')
  assert.deepEqual(tool('inbox_view')?._meta, {
    ui: { resourceUri: 'ui://inbox/tab', visibility: ['app'] },
    'openai/ui': { entrypoints: [{ type: 'thread' }] },
  })
})

test('the inbox tool answers in text: the count, each row that waits, and where to act on them', async () => {
  const { dir, call } = await setup(0)
  const codex = { 'x-codex-turn-metadata': { session_id: 's1', turn_id: 't1' } }
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      items: [
        ...s.ledger.items,
        {
          id: 'i2',
          kind: 'task',
          label: null,
          ask: 'Add the API key to .env',
          options: [],
          rec: null,
          helps: [],
          turn: 1,
          at: 2,
        },
      ],
      findings: [{ id: 'f3', kind: 'issue', title: 'No lint script', detail: 'Only tests run.', path: null, at: 3 }],
      // The question came in the reply to the latest prompt, so a "1" in the next one answers it.
      turn: 1,
      batchTurn: 1,
    },
  }))
  const r = (await call('inbox', {}, codex)) as unknown as {
    result: { content: { text: string }[]; structuredContent?: unknown }
  }
  assert.equal(r.result.structuredContent, undefined)
  assert.equal(
    r.result.content[0]?.text,
    [
      '2 wait on the user · 1 finding',
      'Questions:',
      '1) [i1] "Ship it?"; options: Yes / No',
      'Tasks:',
      '• [i2] "Add the API key to .env"',
      'Findings:',
      '• [f3] issue: No lint script',
      'Open the Inbox tab to act on these.',
    ].join('\n'),
  )
  // A row that just closed still settles in the tab, but no longer waits.
  await call('inbox_press', { press: { action: 'dismiss', id: 'i1' }, thread: 's1' }, { thread_id: 's1' })
  await call('inbox_press', { press: { action: 'dismiss', id: 'i2' }, thread: 's1' }, { thread_id: 's1' })
  await call('inbox_press', { press: { action: 'dismiss', id: 'f3' }, thread: 's1' }, { thread_id: 's1' })
  const after = await call('inbox', {}, codex)
  assert.equal(after.result.content[0]?.text, 'Nothing waits on the user.')
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

test('a tool call from Codex in a turn UserPromptSubmit never recorded shows the hook skipped; the tab’s own calls show nothing', async () => {
  const { dir, call } = await setup(0)
  await updateState(dir, 's1', s => noteHook(noteHook(s, 'start', 10), 'prompt', 20, 't1'))
  const viewed = async () => {
    const r = (await call('inbox_view', {}, { thread_id: 's1' })) as unknown as {
      result: { structuredContent: { heard: string } }
    }
    return r.result.structuredContent.heard
  }
  assert.equal(await viewed(), 'heard')
  await call('close', { id: 'i1', reason: 'done' }, { 'x-codex-turn-metadata': { session_id: 's1', turn_id: 't1' } })
  assert.equal(await viewed(), 'heard')
  // A subagent's call carries the root's session id, in a turn the root's prompt hook never sees.
  await call('inbox', {}, { 'x-codex-turn-metadata': { session_id: 's1', thread_id: 'sub1', turn_id: 'u1' } })
  await call('inbox', {}, { 'x-codex-turn-metadata': { session_id: 's1', parent_thread_id: 's1', turn_id: 'u2' } })
  assert.equal(await viewed(), 'heard')
  await call('inbox', {}, { 'x-codex-turn-metadata': { session_id: 's1', turn_id: 't2' } })
  assert.equal((await readState(dir, 's1')).heard.promptMissedAt, 100)
  assert.equal(await viewed(), 'partial')
})

test('a press in the demo changes only the demo, sends nothing into the conversation, and says so', async () => {
  const { dir, calls, call } = await setup(0)
  const before = await readState(dir, 's1')
  type Questions = {
    result: {
      structuredContent: {
        needsYou: { questions: { id: string; state: { is: string }; item: { options: string[] } }[] }
      }
    }
  }
  const demo = (await call('inbox_view', { demo: true }, { thread_id: 's1' })) as unknown as Questions
  const first = demo.result.structuredContent.needsYou.questions.find(q => q.state.is === 'open')
  assert.ok(first)
  const option = first.item.options[0]
  const r = await call(
    'inbox_press',
    { press: { action: 'answer', id: first.id, option }, thread: 's1', demo: true },
    { thread_id: 's1' },
  )
  assert.deepEqual(calls, [])
  assert.equal(r.result.structuredContent.view.needsYou.questions.find(q => q.id === first.id)?.state.is, 'settled')
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
