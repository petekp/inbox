import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { demoView } from '../../hooks/demo'
import { applyUpdate, parseReply } from '../../hooks/ledger'
import { feedbackOf, feedbackText, QUEUED_AFTER_MS, screenTabOf } from '../../hooks/view'
import type { Feedback } from '../../hooks/view'
import { screenText } from '../../hooks/model-text'
import { noteHook, notePrompt, viewOf } from '../src/core'
import { CODEX } from '../src/texts'
import type { View } from '../src/core'
import { makeServer, pageName } from '../src/server'
import { PRESS_TIMEOUT_MS } from '../../hooks/session'
import { SETTLE_WINDOW_MS } from '../src/settle'
import { readState, statePath, updateState } from '../src/state'
import { handleHook } from '../src/hook'
import { findCli } from '../src/cli'
import { fakeRunner, hookDeps, input, rolloutAt, tempDir } from './helpers'

async function setup(queueCode: number, now = () => 100, fallbackCli = async () => 'codex') {
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
          from: 'record',
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
    now,
    exec: runner.exec,
    tabHtml: '<html></html>',
    fallbackCli,
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

test('a row the tab holds keeps its closed record through more closes than the Closed list keeps, from the agent’s tools and the per-reply update, and its reply still sends', async () => {
  const { dir, calls, call } = await setup(0)
  const others = Array.from({ length: 13 }, (_, n) => `i${n + 2}`)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      nextId: 15,
      items: [...s.ledger.items, ...others.map(id => ({ ...s.ledger.items[0]!, id, ask: `Ship ${id}?` }))],
    },
  }))
  const holds = { replies: { i1: 50 }, discarded: {} }
  const agent = { 'x-codex-turn-metadata': { session_id: 's1', turn_id: 't1' } }
  await call('inbox_view', holds, { thread_id: 's1' })
  await call('close', { id: 'i1', reason: 'settled in chat' }, agent)
  for (const id of others.slice(0, 7)) await call('close', { id, reason: 'done' }, agent)
  const update = parseReply(
    others
      .slice(7)
      .map(id => `CLOSED: ${id} | done`)
      .join('\n'),
  )!
  await updateState(dir, 's1', s => ({ ...s, ledger: applyUpdate(s.ledger, update, 100, 1) }))

  assert.deepEqual(
    (await readState(dir, 's1')).ledger.closed.map(c => c.id),
    ['i1', ...others.slice(1)],
  )
  const r = await call(
    'inbox_press',
    { press: { action: 'type', id: 'i1', text: 'Ship it anyway' }, thread: 's1', ...holds },
    { thread_id: 's1' },
  )
  assert.equal(r.result.structuredContent.note, null)
  assert.deepEqual(
    calls.filter(c => c[1] === 'queue'),
    [['/apps/codex', 'queue', '--thread', 's1', '--message', 'Re "Ship it?": Ship it anyway']],
  )
})

test('a press drawn in another thread, or on a row that changed, reads stale and sends and saves nothing', async () => {
  const { dir, calls, call } = await setup(0)
  const before = await readState(dir, 's1')
  for (const thread of ['s2', undefined]) {
    const r = await call('inbox_press', { ...ANSWER, thread }, { thread_id: 's1' })
    assert.equal(r.result.structuredContent.note, 'stale')
    assert.equal(r.result.content[0]?.text, 'This changed before your press. Nothing was sent.')
  }
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

test('an answer pressed while the turn that opened a dialog still runs goes in the form the Codex app reads as the dialog’s answer, reads Queued, and arrives as the press', async () => {
  const { dir, calls, call } = await setup(0)
  const transcript = join(tempDir(), 'rollout.jsonl')
  const questions = [
    { title: 'Which name?', options: ['Ada', 'Grace'] },
    { title: 'Ship "v2" now?', options: ['Yes (Recommended)', 'No'] },
  ]
  writeFileSync(
    transcript,
    [
      { type: 'event_msg', payload: { type: 'task_started', turn_id: 't1' } },
      {
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'request_user_input_async',
          call_id: 'call_7',
          arguments: JSON.stringify({ questions }),
        },
      },
    ]
      .map(row => JSON.stringify(row))
      .join('\n'),
  )
  await updateState(dir, 's1', s => ({
    ...s,
    transcriptPath: transcript,
    ledger: { ...s.ledger, turn: 1 },
    heard: { ...s.heard, promptAt: 1 },
  }))
  await call('inbox_press', ANSWER, { thread_id: 's1' })
  const message = calls[0]?.[5] ?? ''
  const open = '<send_user_message_question_reply>'
  const close = '</send_user_message_question_reply>'
  assert.ok(message.startsWith(open) && message.endsWith(close))
  assert.deepEqual(JSON.parse(message.slice(open.length, -close.length)), [
    { questionItemId: '["request_user_input_async","call_7",1]', question: 'Ship "v2" now?', answer: 'Yes' },
  ])
  assert.equal((await readState(dir, 's1')).lastActions.i1?.delivery?.state, 'queued')

  await handleHook(input('UserPromptSubmit', { prompt: message, turn_id: 't2' }), hookDeps(dir))
  const s = await readState(dir, 's1')
  assert.deepEqual(s.turn.press, { id: 'i1', action: 'answer' })
  assert.equal(s.lastActions.i1?.delivery?.state, 'arrived')
})

test('a press reads Explaining… at once, Queued once its message waits QUEUED_AFTER_MS for Codex to take it, then Explaining… until the reply, then ✓', async () => {
  const { dir, call } = await setup(0)
  const r = await call('inbox_press', { press: { action: 'explain', id: 'i1' }, thread: 's1' }, { thread_id: 's1' })
  assert.deepEqual(r.result.structuredContent.view.needsYou.questions[0]?.feedback, {
    is: 'working',
    label: 'Explaining…',
    at: 100,
  })
  const s = await readState(dir, 's1')
  assert.deepEqual(
    s.sent.map(x => [x.row, x.queuedId]),
    [['i1', 'q1']],
  )
  assert.deepEqual(viewOf(s, 100 + QUEUED_AFTER_MS).needsYou.questions[0]?.feedback, {
    is: 'queued',
    label: 'Explain',
    at: 100,
  })
  const arrived = notePrompt(s, s.sent[0]!.text, 200).state
  assert.deepEqual(viewOf(arrived, 200).needsYou.questions[0]?.feedback, {
    is: 'working',
    label: 'Explaining…',
    at: 100,
  })
  const replied = { ...arrived, presence: { ...arrived.presence, turnsApplied: arrived.presence.turnsStarted } }
  assert.deepEqual(viewOf(replied, 300).needsYou.questions[0]?.feedback, { is: 'done', label: 'Explained', at: 100 })
})

test('a press rejected before queue starts reopens its question and offers Try again', async () => {
  const { dir, call, calls } = await setup(
    0,
    () => 100,
    async () => {
      throw new Error('codex binary missing')
    },
  )
  await updateState(dir, 's1', s => ({ ...s, cliPath: null }))
  const r = await call('inbox_press', ANSWER, { thread_id: 's1' })
  assert.match(r.result.structuredContent.error ?? '', /Not sent: codex binary missing/)
  const question = r.result.structuredContent.view.needsYou.questions[0]
  assert.equal(question?.state.is, 'open')
  assert.deepEqual(question?.feedback, {
    is: 'notSent',
    reason: 'codex binary missing',
    retry: { action: 'answer', id: 'i1', option: 'Yes' },
  })
  const s = await readState(dir, 's1')
  assert.deepEqual(s.sent, [])
  assert.deepEqual(s.ledger.closed, [])
  assert.deepEqual(calls, [])
})

test('a queue command failure leaves the accepted press unconfirmed without retrying it', async () => {
  const { dir, call, calls } = await setup(1)
  const r = await call('inbox_press', ANSWER, { thread_id: 's1' })
  assert.equal(r.result.structuredContent.error, null)
  assert.equal((r.result.structuredContent as unknown as { delivery: string }).delivery, 'unconfirmed')
  const s = await readState(dir, 's1')
  assert.equal(s.ledger.closed[0]?.id, 'i1')
  assert.equal(s.lastActions.i1?.delivery?.state, 'unconfirmed')
  assert.equal(s.sent[0]?.phase, 'uncertain')
  assert.equal(calls.length, 1)
  const observed = notePrompt(s, s.sent[0]!.text, 200).state
  assert.equal(observed.sent.length, 1)
  assert.equal(observed.lastActions.i1?.delivery?.state, 'unconfirmed')
})

test('an accepted queue survives a failed final state write as an unconfirmed press', async () => {
  const { dir } = await setup(0)
  let accepted = false
  const handle = makeServer({
    dir,
    now: () => 100,
    exec: async args => {
      if (args[1] === 'queue') {
        accepted = true
        mkdirSync(`${statePath(dir, 's1')}.${process.pid}.tmp`)
        return { code: 0, stdout: 'Queued message q1\n', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: '' }
    },
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const reply = (await handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'inbox_press', arguments: ANSWER, _meta: { thread_id: 's1' } },
  })) as { result: { content: { text: string }[]; structuredContent: { error: string | null; delivery: string } } }
  const s = await readState(dir, 's1')

  assert.equal(accepted, true)
  assert.equal(reply.result.structuredContent.error, null)
  assert.equal(reply.result.structuredContent.delivery, 'unconfirmed')
  assert.doesNotMatch(reply.result.content[0]!.text, /Not sent/)
  assert.equal(s.ledger.closed[0]?.id, 'i1')
  assert.equal(s.lastActions.i1?.delivery?.state, 'unconfirmed')
  assert.equal(s.sent[0]?.phase, 'attempting')
  assert.equal(s.sent[0]?.text, 'Re "Ship it?": Yes')
})

test('a local Open does not run when its press could not be saved', async () => {
  const { dir } = await setup(0)
  const root = tempDir()
  writeFileSync(join(root, 'notes.md'), '# Notes')
  await updateState(dir, 's1', s => ({
    ...s,
    root,
    ledger: {
      ...s.ledger,
      items: [
        {
          ...s.ledger.items[0]!,
          id: 'i2',
          kind: 'task',
          ask: 'Read notes',
          options: [],
          helps: [{ kind: 'open', path: 'notes.md' }],
        },
      ],
    },
  }))
  mkdirSync(`${statePath(dir, 's1')}.${process.pid}.tmp`)
  const calls: string[][] = []
  const handle = makeServer({
    dir,
    now: () => 100,
    exec: async args => {
      calls.push(args)
      return { code: 0, stdout: '', stderr: '' }
    },
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const reply = (await handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'inbox_press',
      arguments: { press: { action: 'step', id: 'i2', step: 0, label: 'Open notes.md' }, thread: 's1' },
      _meta: { thread_id: 's1' },
    },
  })) as { result: { structuredContent: { error: string | null } } }

  assert.match(reply.result.structuredContent.error ?? '', /Not sent:/)
  assert.deepEqual(calls, [])
  assert.equal((await readState(dir, 's1')).lastActions.i2, undefined)
})

test('an unknown older send blocks identical later arrivals from certifying the newer press', async () => {
  const { dir } = await setup(0)
  let queues = 0
  const handle = makeServer({
    dir,
    now: () => 100,
    exec: async args =>
      args[1] === 'queue' && queues++ === 0
        ? { code: 1, stdout: '', stderr: 'outcome unknown' }
        : { code: 0, stdout: 'Queued message q2\n', stderr: '' },
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const explain = () =>
    handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'inbox_press',
        arguments: { press: { action: 'explain', id: 'i1' }, thread: 's1' },
        _meta: { thread_id: 's1' },
      },
    })
  await explain()
  await explain()
  const s = await readState(dir, 's1')
  assert.deepEqual(
    s.sent.map(x => x.phase),
    ['uncertain', 'accepted'],
  )
  assert.equal(s.lastActions.i1?.delivery?.state, 'unconfirmed')

  const afterFirst = notePrompt(s, s.sent[0]!.text, 200).state
  const afterSecond = notePrompt(afterFirst, s.sent[0]!.text, 210).state
  assert.equal(afterFirst.sent.length, 2)
  assert.equal(afterSecond.sent.length, 2)
  assert.equal(afterSecond.lastActions.i1?.delivery?.state, 'unconfirmed')
  assert.equal(afterFirst.turn.press, null)
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
    ui: { resourceUri: 'ui://inbox/view', visibility: ['app'] },
    'openai/ui': { entrypoints: [{ type: 'thread' }] },
  })
  const read = (await handle({ jsonrpc: '2.0', id: 2, method: 'resources/read' })) as {
    result: { contents: { uri: string }[] }
  }
  assert.equal(read.result.contents[0]?.uri, 'ui://inbox/view')
  const older = pageName('<html>older</html>')
  const readOlder = (await handle({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: older } })) as {
    result: { contents: { uri: string; text: string }[] }
  }
  assert.equal(readOlder.result.contents[0]?.uri, older)
  assert.match(readOlder.result.contents[0]?.text ?? '', /<html>/)
})

test('the view request saves the tab the page shows, ignores a name that is not a tab, and the inbox model is told the tab', async () => {
  const { dir, call } = await setup(0)
  assert.equal((await readState(dir, 's1')).shownTab, 'needsYou')
  await call('inbox_view', { tab: 'prs' }, { thread_id: 's1' })
  assert.equal((await readState(dir, 's1')).shownTab, 'prs')
  await call('inbox_view', { tab: 'nowhere' }, { thread_id: 's1' })
  assert.equal((await readState(dir, 's1')).shownTab, 'prs')
  assert.equal(
    screenText(CODEX, true, screenTabOf((await readState(dir, 's1')).shownTab)),
    'The Inbox tab is open beside the conversation, on its PRs tab, listing every open item.',
  )
})

test('with no dev build, the view names the installed page and inbox_tab_page serves it, so a tab from an older build replaces itself', async () => {
  const { call } = await setup(0)
  const view = (await call('inbox_view', {}, { thread_id: 's1' })) as unknown as {
    result: { structuredContent: { devPage: string } }
  }
  assert.equal(view.result.structuredContent.devPage, pageName('<html></html>'))
  const page = (await call('inbox_tab_page', {}, { thread_id: 's1' })) as unknown as {
    result: { structuredContent: { html: string } }
  }
  assert.equal(page.result.structuredContent.html, '<html></html>')
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
          from: 'record',
          ask: 'Add the API key to .env',
          options: [],
          rec: null,
          helps: [],
          turn: 1,
          at: 2,
        },
      ],
      findings: [{ id: 'f3', kind: 'issue', title: 'No lint script', detail: 'Only tests run.', path: null, at: 3 }],
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
      'A close id is only for the close tool. Never write one in a reply.',
      'Questions:',
      '1) "Ship it?"; options: Yes / No (close id: i1)',
      'Tasks:',
      '• "Add the API key to .env" (close id: i2)',
      'Findings:',
      '• issue: No lint script (close id: f3)',
      'Open the Inbox tab to act on these.',
    ].join('\n'),
  )
  await call('inbox_press', { press: { action: 'dismiss', id: 'i2' }, thread: 's1' }, { thread_id: 's1' })
  await call('inbox_press', { press: { action: 'dismiss', id: 'f3' }, thread: 's1' }, { thread_id: 's1' })
  const one = await call('inbox', {}, codex)
  assert.equal(
    one.result.content[0]?.text,
    [
      '1 waits on the user',
      'A close id is only for the close tool. Never write one in a reply.',
      'Questions:',
      '1) "Ship it?"; options: Yes / No (close id: i1)',
      'Open the Inbox tab to act on these.',
    ].join('\n'),
  )
  await call('inbox_press', { press: { action: 'dismiss', id: 'i1' }, thread: 's1' }, { thread_id: 's1' })
  const after = await call('inbox', {}, codex)
  assert.equal(after.result.content[0]?.text, 'Nothing waits on the user.')
})

test('Codex’s own tool calls reach their session through the turn metadata', async () => {
  const { dir, call } = await setup(0)
  const r = await call(
    'record',
    { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' },
    { 'x-codex-turn-metadata': { session_id: 's1', thread_id: 's1' } },
  )
  assert.match(r.result.content[0]?.text ?? '', /^Recorded\. /)
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
  type NeedsYou = {
    result: {
      structuredContent: {
        needsYou: {
          questions: { id: string; state: { is: string }; item: { options: string[] } }[]
          tasks: { id: string; steps: { label: string; step: { kind: string }[] }[] }[]
        }
      }
    }
  }
  const demo = (await call('inbox_view', { demo: true }, { thread_id: 's1' })) as unknown as NeedsYou
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
  assert.equal(r.result.structuredContent.note, null)
  const copyTask = demo.result.structuredContent.needsYou.tasks.find(t =>
    t.steps[0]?.step.every(h => h.kind === 'copy'),
  )
  assert.ok(copyTask)
  const copied = await call(
    'inbox_press',
    { press: { action: 'step', id: copyTask.id, step: 0, label: copyTask.steps[0]!.label }, thread: 's1', demo: true },
    { thread_id: 's1' },
  )
  assert.equal(copied.result.structuredContent.note, null)
  assert.equal((copied.result.structuredContent as unknown as { copy: unknown }).copy, null)
  const copiedRow = (
    copied.result.structuredContent as unknown as {
      view: { needsYou: { tasks: { id: string; feedback: { is: string; result?: { state: string } } | null }[] } }
    }
  ).view.needsYou.tasks.find(t => t.id === copyTask.id)
  assert.deepEqual([copiedRow?.feedback?.is, copiedRow?.feedback?.result?.state], ['local', 'done'])
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
          from: 'record',
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
  const visibleResult = async () => {
    const result = (await readState(dir, 's1')).lastActions.i2?.result
    return result && { state: result.state, parts: result.parts, at: result.at }
  }
  await step(0, 'Open deploy.command')
  await step(1, 'Open notes.md')
  assert.deepEqual(calls, [
    ['open', '-R', join(root, 'deploy.command')],
    ['open', join(root, 'notes.md')],
  ])
  assert.deepEqual(await visibleResult(), {
    state: 'done',
    parts: [{ kind: 'open', name: 'notes.md', isCommand: false, error: null }],
    at: 100,
  })
  const moved = await step(2, 'Open moved.md')
  assert.equal(moved.result.structuredContent.error, null)
  assert.deepEqual(await visibleResult(), {
    state: 'failed',
    parts: [{ kind: 'open', name: 'moved.md', isCommand: false, error: 'it no longer exists' }],
    at: 100,
  })
  assert.equal(calls.length, 2)
})

test('an open still pending after the press timeout shows nothing on its row, and stays saved as pending', async () => {
  const { dir, call } = await setup(0)
  const pending = (at: number) => ({
    state: 'pending' as const,
    parts: [{ kind: 'open' as const, name: 'notes.md', isCommand: false, error: null }],
    at,
  })
  const opened = (at: number) => ({
    kind: 'local' as const,
    action: 'step-0',
    text: 'Open notes.md',
    at,
    result: pending(at),
  })
  const staleAt = 100 - PRESS_TIMEOUT_MS - 1
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
          from: 'record',
          ask: 'Read the notes',
          options: [],
          rec: null,
          helps: [{ kind: 'open', path: 'notes.md' }],
          turn: 1,
          at: 1,
        },
      ],
    },
    lastActions: { i1: opened(staleAt), i2: opened(100) },
  }))
  const r = (await call('inbox_view', {}, { thread_id: 's1' })) as unknown as {
    result: { structuredContent: View }
  }
  const view = r.result.structuredContent
  assert.equal(view.needsYou.questions.find(q => q.id === 'i1')?.feedback, null)
  assert.deepEqual(view.needsYou.tasks.find(t => t.id === 'i2')?.feedback, { is: 'local', result: pending(100) })
  assert.equal(view.lastActions.i1?.result, undefined)
  const saved = await readState(dir, 's1')
  assert.deepEqual([saved.lastActions.i1?.result, saved.lastActions.i2?.result], [pending(staleAt), pending(100)])
})

test('a chat saved mid-turn reads Working… until a view or a press finds the turn ended in its rollout', async () => {
  const dir = tempDir()
  const rollout = join(dir, 'rollout.jsonl')
  const turnRow = (type: string, turn: string) =>
    JSON.stringify({ type: 'event_msg', payload: { type, turn_id: turn } })
  writeFileSync(rollout, `${turnRow('task_started', 't1')}\n`)
  const running = () =>
    updateState(dir, 's1', s => ({
      ...s,
      transcriptPath: rollout,
      presence: { ...s.presence, isTurnRunning: true },
    }))
  await running()
  const handle = makeServer({
    dir,
    now: () => 100,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  type Shown = { overviewPage: { lead: { id: string; text: string }[] } }
  const call = (name: string, args: Record<string, unknown>) =>
    handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args, _meta: { thread_id: 's1' } },
    }) as Promise<{ result: { structuredContent: Shown & { view: Shown } } }>
  const viewNow = async () =>
    (await call('inbox_view', {})).result.structuredContent.overviewPage.lead.find(l => l.id === 'status')?.text ?? null

  assert.equal(await viewNow(), 'Working…')
  writeFileSync(rollout, `${turnRow('task_started', 't1')}\n${turnRow('task_complete', 't1')}\n`)
  assert.equal(await viewNow(), null)
  assert.equal((await readState(dir, 's1')).presence.isTurnRunning, false)

  await running()
  writeFileSync(rollout, `${turnRow('task_started', 't2')}\n`)
  assert.equal(await viewNow(), 'Working…')
  writeFileSync(rollout, `${turnRow('task_started', 't2')}\n${turnRow('turn_aborted', 't2')}\n`)
  const pressed = await call('inbox_press', { press: { action: 'done', id: 'i1' }, thread: 'another chat' })
  assert.equal(pressed.result.structuredContent.view.overviewPage.lead.find(l => l.id === 'status')?.text ?? null, null)
})

test('a turn another plugin’s Stop continues reads Working… again once a view finds it running in the rollout', async () => {
  const dir = tempDir()
  const rollout = join(dir, 'rollout.jsonl')
  const turnRow = (type: string) => JSON.stringify({ type: 'event_msg', payload: { type, turn_id: 't1' } })
  writeFileSync(rollout, '')
  const deps = hookDeps(dir)
  const handle = makeServer({
    dir,
    now: () => 100,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const viewNow = async () => {
    const r = (await handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'inbox_view', arguments: {}, _meta: { thread_id: 's1' } },
    })) as { result: { structuredContent: { overviewPage: { lead: { id: string; text: string }[] } } } }

    return r.result.structuredContent.overviewPage.lead.find(l => l.id === 'status')?.text ?? null
  }

  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it', turn_id: 't1', transcript_path: rollout }), deps)
  assert.equal(await viewNow(), 'Working…')
  writeFileSync(rollout, `${turnRow('task_started')}\n`)
  await handleHook(input('Stop', { last_assistant_message: '', turn_id: 't1', transcript_path: rollout }), deps)
  assert.equal((await readState(dir, 's1')).presence.isTurnRunning, false)
  assert.equal(await viewNow(), 'Working…')

  writeFileSync(rollout, `${turnRow('task_started')}\n${turnRow('task_complete')}\n`)
  assert.equal(await viewNow(), null)
})

test('Done on a task Codex just left waits while a turn runs, queues one message once the rollout shows the turn interrupted, and Undo then reads stale', async () => {
  const dir = tempDir()
  const task = (id: string, ask: string, turn: number) => ({
    id,
    kind: 'task' as const,
    label: null,
    from: 'record' as const,
    ask,
    options: [],
    rec: null,
    helps: [],
    turn,
    at: 1,
  })
  const rollout = join(dir, 'rollout.jsonl')
  const turnRow = (type: string) => JSON.stringify({ type: 'event_msg', payload: { type, turn_id: 't3' } })
  writeFileSync(rollout, `${turnRow('task_started')}\n`)
  await updateState(dir, 's1', s => ({
    ...s,
    root: '/repo',
    cliPath: '/apps/codex',
    transcriptPath: rollout,
    ledger: {
      ...s.ledger,
      turn: 2,
      nextId: 3,
      items: [task('i1', 'Water the plants', 1), task('i2', 'Sign in to npm', 2)],
    },
  }))
  let t = 100
  const runner = fakeRunner(() => ({ code: 0, stdout: 'Queued message q1\n', stderr: '' }))
  const handle = makeServer({
    dir,
    now: () => t,
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
    }) as Promise<{
      result: { structuredContent: { note: string | null } }
    }>
  const poll = () => call('inbox_view', {})

  await call('inbox_press', { press: { action: 'done', id: 'i1' }, thread: 's1' })
  await call('inbox_press', { press: { action: 'done', id: 'i2' }, thread: 's1' })
  await updateState(dir, 's1', s => ({ ...s, presence: { ...s.presence, isTurnRunning: true } }))
  t += SETTLE_WINDOW_MS
  await poll()
  const queued = () => runner.calls.filter(c => c[0] === '/apps/codex')
  assert.deepEqual(queued(), [])

  writeFileSync(rollout, `${turnRow('task_started')}\n${turnRow('turn_aborted')}\n`)
  await poll()
  await poll()
  assert.deepEqual(queued(), [['/apps/codex', 'queue', '--thread', 's1', '--message', 'Done: Sign in to npm']])
  const undo = await call('inbox_press', { press: { action: 'undo', id: 'i2' }, thread: 's1' })
  assert.equal(undo.result.structuredContent.note, 'stale')
  const s = await readState(dir, 's1')
  assert.deepEqual(
    s.ledger.closed.map(c => [c.id, c.isSentToAgent ?? false]),
    [
      ['i1', false],
      ['i2', true],
    ],
  )
  assert.deepEqual(notePrompt(s, s.sent[0]!.text, t).state.turn.press, { id: 'i2', action: 'done' })
})

const GH_VIEW = JSON.stringify({
  number: 7,
  title: 'Add the PRs tab',
  url: 'https://github.com/acme/app/pull/7',
  state: 'OPEN',
  baseRefName: 'main',
  mergeable: 'MERGEABLE',
  reviewDecision: '',
  statusCheckRollup: [{ name: 'lint', conclusion: 'FAILURE', workflowName: 'CI' }],
})
const GH_THREADS = JSON.stringify({
  data: {
    viewer: { login: 'me' },
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [
            {
              id: 'T1',
              isResolved: false,
              isOutdated: false,
              path: 'src/a.ts',
              line: 4,
              originalLine: 4,
              comments: { totalCount: 1, nodes: [{ author: { login: 'rev' }, body: 'Rename this', url: 'u' }] },
              last: { nodes: [] },
            },
          ],
        },
      },
    },
  },
})

type PrView = {
  prs: { drawn: { pr: { ref: string; threads: unknown[]; error?: string | null } }[]; count: number }
  isFetchingPrs: boolean
  isGhMissing: boolean
  lastActions: Record<string, { action: string }>
}
type PrReply = { result: { structuredContent: PrView & { error: string | null; view: PrView } } }

async function prServer(answer: (args: string[]) => { code: number; stdout: string; stderr: string }, now = () => 100) {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({ ...s, root: '/repo', cliPath: '/apps/codex' }))
  const runner = fakeRunner(answer)
  const handle = makeServer({
    dir,
    now,
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
    }) as Promise<PrReply>

  return { dir, calls: runner.calls, call }
}

const ghAnswer = (args: string[]) => {
  if (args[0] === 'gh' && args[1] === 'pr') return { code: 0, stdout: GH_VIEW, stderr: '' }
  if (args[0] === 'gh') return { code: 0, stdout: args.includes('api') ? GH_THREADS : 'gh 2.0', stderr: '' }
  return { code: 0, stdout: 'Queued message q1\n', stderr: '' }
}

test('a view starts a fetch of the session’s PRs through gh in its folder, and the next view shows them', async () => {
  const { dir, calls, call } = await prServer(ghAnswer)
  const first = await call('inbox_view', {})
  assert.equal(first.result.structuredContent.isFetchingPrs, true)
  assert.deepEqual(first.result.structuredContent.prs.drawn, [])
  await new Promise(resolve => setTimeout(resolve, 50))
  const next = await call('inbox_view', {})
  const { prs, isFetchingPrs } = next.result.structuredContent
  assert.equal(isFetchingPrs, false)
  assert.deepEqual(
    prs.drawn.map(d => [d.pr.ref, d.pr.threads.length]),
    [['acme/app#7', 1]],
  )
  assert.equal(prs.count, 1)
  assert.ok(calls.some(c => c[0] === 'gh' && c[1] === 'pr'))
  assert.equal((await readState(dir, 's1')).prViews.branchRef, 'acme/app#7')
})

test('a view says gh was not found when no gh can start', async () => {
  const { call } = await prServer(() => ({ code: -1, stdout: '', stderr: '' }))
  await call('inbox_view', {})
  await new Promise(resolve => setTimeout(resolve, 50))
  const next = await call('inbox_view', {})
  assert.equal(next.result.structuredContent.isGhMissing, true)
  assert.deepEqual(next.result.structuredContent.prs.drawn, [])
})

test('gh is found in the Homebrew folder when it is not on the PATH', async () => {
  const { calls, call } = await prServer(args =>
    args[0] === 'gh' ? { code: -1, stdout: '', stderr: '' } : ghAnswer(['gh', ...args.slice(1)]),
  )
  await call('inbox_view', {})
  await new Promise(resolve => setTimeout(resolve, 50))
  const next = await call('inbox_view', {})
  assert.equal(next.result.structuredContent.isGhMissing, false)
  assert.equal(next.result.structuredContent.prs.drawn.length, 1)
  assert.ok(calls.some(c => c[0] === '/opt/homebrew/bin/gh' && c[1] === 'pr'))
})

const PRS_STALE_MS = 3 * 60_000

async function viewAfterFetch(call: (name: string, args: Record<string, unknown>) => Promise<PrReply>) {
  await call('inbox_view', {})
  await new Promise(resolve => setTimeout(resolve, 50))

  return call('inbox_view', {})
}

test('a view says gh was not found when gh worked once and then stops starting', async () => {
  let at = 100
  let isGone = false
  const { call } = await prServer(
    args => (isGone && args[0] !== 'codex' ? { code: -1, stdout: '', stderr: '' } : ghAnswer(args)),
    () => at,
  )
  const first = await viewAfterFetch(call)
  assert.equal(first.result.structuredContent.isGhMissing, false)
  assert.equal(first.result.structuredContent.prs.drawn.length, 1)
  isGone = true
  at += PRS_STALE_MS
  const next = await viewAfterFetch(call)
  assert.equal(next.result.structuredContent.isGhMissing, true)
  assert.equal(next.result.structuredContent.prs.drawn.length, 1)
  assert.equal(next.result.structuredContent.prs.drawn[0]?.pr.error ?? null, null)
})

test('gh is found again at another path after the first one stops starting', async () => {
  let at = 100
  let hasMoved = false
  const { calls, call } = await prServer(
    args => (hasMoved && args[0] === 'gh' ? { code: -1, stdout: '', stderr: '' } : ghAnswer(['gh', ...args.slice(1)])),
    () => at,
  )
  await viewAfterFetch(call)
  hasMoved = true
  at += PRS_STALE_MS
  const next = await viewAfterFetch(call)
  assert.equal(next.result.structuredContent.isGhMissing, false)
  assert.equal(next.result.structuredContent.prs.drawn.length, 1)
  assert.equal(next.result.structuredContent.prs.drawn[0]?.pr.error ?? null, null)
  assert.ok(calls.some(c => c[0] === '/opt/homebrew/bin/gh' && c[1] === 'pr'))
})

test('Refresh PRs under a failed refresh fetches again inside the refresh window, and its row reads Refreshed', async () => {
  let at = 100
  let isFailing = false
  const { dir, calls, call } = await prServer(
    args =>
      isFailing && args[0] === 'gh' && args[1] === 'pr' ? { code: 1, stdout: '', stderr: 'HTTP 502' } : ghAnswer(args),
    () => at,
  )
  await viewAfterFetch(call)
  isFailing = true
  at += PRS_STALE_MS
  const failed = await viewAfterFetch(call)
  const pr = failed.result.structuredContent.prs.drawn[0]!.pr
  assert.equal(pr.error, 'HTTP 502')
  isFailing = false
  at += 1_000
  const lookups = () => calls.filter(c => c[0] === 'gh' && c[1] === 'pr').length
  const before = lookups()
  const r = await call('inbox_press', { press: { action: 'pr-refresh', ref: pr.ref }, thread: 's1' })
  assert.equal(r.result.structuredContent.error, null)
  assert.equal(lookups(), before + 1)
  const s = await readState(dir, 's1')
  assert.equal(s.prViews.views[pr.ref]?.error, null)
  assert.equal(
    feedbackText(feedbackOf(`pr:${pr.ref}`, s.lastActions[`pr:${pr.ref}`], undefined, s.presence, at)!, 'codex'),
    '✓ Refreshed PRs',
  )
})

test('a PR press sends its prompt through codex queue and records the press on its row', async () => {
  const { dir, calls, call } = await prServer(ghAnswer)
  const d = demoView(100, 'Codex')
  await updateState(dir, 's1', s => ({ ...s, ledger: { ...s.ledger, prs: d.ledger.prs }, prViews: d.prViews }))
  const pr = Object.values(d.prViews.views).find(v => v.threads.some(t => t.isWaiting))!
  const thread = pr.threads.find(t => t.isWaiting)!
  const r = await call('inbox_press', {
    press: { action: 'thread-address', ref: pr.ref, thread: thread.id },
    thread: 's1',
  })
  assert.equal(r.result.structuredContent.error, null)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0]?.slice(0, 4), ['/apps/codex', 'queue', '--thread', 's1'])
  assert.match(calls[0]?.[5] ?? '', new RegExp(thread.path))
  const id = `${pr.ref} thread ${thread.id}`
  assert.equal(r.result.structuredContent.view.lastActions[id]?.action, 'thread-address')
  assert.equal((await readState(dir, 's1')).sent[0]?.row, id)
})

test('a bulk PR prompt arrives on every affected row without acknowledging a newer thread press', async () => {
  let at = 100
  const { dir, call } = await prServer(ghAnswer, () => at)
  const d = demoView(100, 'Codex')
  const pr = Object.values(d.prViews.views).find(
    v => v.threads.filter(t => t.isWaiting && !t.isLinesChanged).length >= 2,
  )!
  assert.ok(pr)
  const threads = pr.threads.filter(t => t.isWaiting && !t.isLinesChanged)
  await updateState(dir, 's1', s => ({ ...s, ledger: { ...s.ledger, prs: d.ledger.prs }, prViews: d.prViews }))
  await call('inbox_press', { press: { action: 'pr-address-all', ref: pr.ref }, thread: 's1' })
  const queued = await readState(dir, 's1')
  const text = queued.sent[0]!.text
  const bulk = notePrompt(queued, text, 110).state
  const rows = [`pr:${pr.ref}`, ...threads.map(t => `${pr.ref} thread ${t.id}`)]
  for (const id of rows) {
    assert.equal(bulk.lastActions[id]?.delivery?.state, 'arrived')
    assert.equal(feedbackOf(id, bulk.lastActions[id], undefined, bulk.presence, 110)?.is, 'done')
  }
  at = 200
  await call('inbox_press', { press: { action: 'thread-discuss', ref: pr.ref, thread: threads[0]!.id }, thread: 's1' })
  const newer = await readState(dir, 's1')
  const arrived = notePrompt(newer, text, 210).state
  assert.equal(arrived.lastActions[rows[0]!]?.delivery?.state, 'arrived')
  assert.equal(arrived.lastActions[rows[2]!]?.delivery?.state, 'arrived')
  assert.deepEqual(arrived.lastActions[rows[1]!], newer.lastActions[rows[1]!])
  const discussed = notePrompt(arrived, newer.sent[1]!.text, 220).state
  assert.equal(discussed.lastActions[rows[1]!]?.delivery?.state, 'arrived')
})

test('same-millisecond identical sends on different rows acknowledge only their own delivery', async () => {
  const { dir, call } = await setup(0, () => 100)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: { ...s.ledger, items: [...s.ledger.items, { ...s.ledger.items[0]!, id: 'i2' }] },
  }))
  for (const id of ['i1', 'i2'])
    await call('inbox_press', { press: { action: 'explain', id }, thread: 's1' }, { thread_id: 's1' })
  const queued = await readState(dir, 's1')
  assert.equal(queued.sent[0]!.text, queued.sent[1]!.text)
  const first = notePrompt(queued, queued.sent[0]!.text, 110).state
  assert.equal(first.lastActions.i1?.delivery?.state, 'arrived')
  assert.equal(first.lastActions.i2?.delivery?.state, 'unconfirmed')
  const second = notePrompt(first, first.sent[0]!.text, 120).state
  assert.equal(second.lastActions.i2?.delivery?.state, 'arrived')
})

test('a settled Fix keeps its delivery unconfirmed after one indistinguishable arrival', async () => {
  let at = 100
  const { dir, call } = await setup(0, () => at)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      findings: [
        { id: 'f1', kind: 'issue', title: 'Retry loop spins', detail: 'No delay.', path: null, at: 1 },
        { id: 'f2', kind: 'issue', title: 'Retry loop spins', detail: 'No delay.', path: null, at: 2 },
      ],
    },
  }))
  await call('inbox_press', { press: { action: 'address', id: 'f1' }, thread: 's1' }, { thread_id: 's1' })
  at = 200
  await call('inbox_press', { press: { action: 'address', id: 'f2' }, thread: 's1' }, { thread_id: 's1' })
  const queued = await readState(dir, 's1')
  assert.equal(queued.sent[0]!.text, queued.sent[1]!.text)
  const first = notePrompt(queued, queued.sent[0]!.text, 210).state
  const row = viewOf(first, 210).findings.rows.find(r => r.id === 'f2')
  assert.equal(row?.state.is, 'settled')
  assert.equal(row?.state.is === 'settled' ? row.state.delivery : null, 'unconfirmed')
  const later = viewOf(first, 210 + SETTLE_WINDOW_MS + 1)
  assert.equal(later.findings.closed.find(f => f.id === 'f2')?.delivery, 'unconfirmed')
})

test('an answered question keeps unconfirmed delivery in Closed after its settle window', async () => {
  const { dir, call } = await setup(0, () => 100)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: { ...s.ledger, items: [...s.ledger.items, { ...s.ledger.items[0]!, id: 'i2' }] },
  }))
  for (const id of ['i1', 'i2'])
    await call('inbox_press', { press: { action: 'answer', id, option: 'Yes' }, thread: 's1' }, { thread_id: 's1' })
  const queued = await readState(dir, 's1')
  const first = notePrompt(queued, queued.sent[0]!.text, 110).state
  const later = viewOf(first, 110 + SETTLE_WINDOW_MS + 1)
  assert.equal(later.needsYou.closed.questions.find(q => q.id === 'i2')?.delivery, 'unconfirmed')
  assert.equal(
    later.needsYou.questions.find(q => q.id === 'i2'),
    undefined,
  )
})

test('tracked PR steps are drawn and open the same linked and branch PRs without duplicate links', async () => {
  const { dir, calls, call } = await prServer(ghAnswer)
  const d = demoView(100, 'Codex')
  assert.ok(d.prViews.branchRef)
  const branch = d.prViews.views[d.prViews.branchRef]!
  const linked = d.ledger.prs.map(ref => d.prViews.views[ref]).find(pr => pr && pr.ref !== branch.ref)!
  assert.ok(linked)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      prs: [linked.ref],
      items: [
        {
          id: 'i1',
          kind: 'question',
          ask: `Merge PR #${linked.number} and PR #${branch.number}?`,
          label: null,
          from: 'record',
          options: ['Yes', 'No'],
          rec: null,
          helps: [{ kind: 'link', url: linked.url, name: `PR #${linked.number}` }],
          at: 1,
          turn: 1,
        },
      ],
    },
    prViews: d.prViews,
  }))
  const row = viewOf(await readState(dir, 's1'), 100).needsYou.questions[0]!
  assert.equal(row.steps.length, 2)
  for (const action of row.actions) {
    if (action.press.action !== 'step') continue
    const reply = await call('inbox_press', { press: action.press, thread: 's1' })
    assert.equal(reply.result.structuredContent.error, null)
  }
  assert.deepEqual(calls, [
    ['open', linked.url],
    ['open', branch.url],
  ])
})

test('a PR press with an unknown queue outcome keeps its receipt and unconfirmed feedback', async () => {
  const { dir, call } = await prServer(args =>
    args[1] === 'queue' ? { code: 1, stdout: '', stderr: 'no such thread' } : ghAnswer(args),
  )
  const d = demoView(100, 'Codex')
  await updateState(dir, 's1', s => ({ ...s, ledger: { ...s.ledger, prs: d.ledger.prs }, prViews: d.prViews }))
  const ref = Object.values(d.prViews.views).find(v => v.mergeable === 'CONFLICTING')!.ref
  const r = await call('inbox_press', { press: { action: 'pr-conflicts', ref }, thread: 's1' })
  assert.equal(r.result.structuredContent.error, null)
  assert.equal((r.result.structuredContent as unknown as { delivery: string }).delivery, 'unconfirmed')
  const s = await readState(dir, 's1')
  assert.equal(s.lastActions[`pr:${ref}`]?.delivery?.state, 'unconfirmed')
  assert.equal(s.sent[0]?.phase, 'uncertain')
})

test('dismissing a linked PR unlinks it, and its view leaves once its settled block has', async () => {
  let t = 100
  const dir = tempDir()
  await updateState(dir, 's1', s => ({ ...s, root: '/repo', cliPath: '/apps/codex' }))
  const runner = fakeRunner(() => ({ code: -1, stdout: '', stderr: '' }))
  const handle = makeServer({ dir, now: () => t, exec: runner.exec, tabHtml: '', fallbackCli: async () => 'codex' })
  const call = (name: string, args: Record<string, unknown>) =>
    handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args, _meta: { thread_id: 's1' } },
    }) as Promise<PrReply>
  const d = demoView(100, 'Codex')
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: { ...s.ledger, prs: d.ledger.prs },
    prViews: { ...d.prViews, branchRef: null },
  }))
  const ref = d.ledger.prs.find(r => r !== d.prViews.branchRef)!
  const dismissed = await call('inbox_press', { press: { action: 'pr-dismiss', ref }, thread: 's1' })
  const drawn = (v: PrView) => v.prs.drawn.map(x => x.pr.ref)
  assert.ok(drawn(dismissed.result.structuredContent.view).includes(ref))
  assert.equal((await readState(dir, 's1')).ledger.prs.includes(ref), false)
  t += SETTLE_WINDOW_MS
  const later = await call('inbox_view', {})
  assert.equal(drawn(later.result.structuredContent).includes(ref), false)
  assert.equal(ref in (await readState(dir, 's1')).prViews.views, false)
})

for (const failure of ['none', 'checkpoint', 'completion', 'queue', 'lookup'] as const) {
  test(`Done notification batches survive ${failure} and retain honest delivery and Undo state`, async t => {
    const dir = tempDir()
    t.after(() => rm(dir, { recursive: true, force: true }))
    await updateState(dir, 's1', s => ({
      ...s,
      ledger: {
        ...s.ledger,
        turn: 1,
        nextId: 3,
        items: ['i1', 'i2'].map(id => ({
          id,
          kind: 'task' as const,
          label: null,
          from: 'record',
          ask: `Complete ${id}`,
          options: [],
          rec: null,
          helps: [],
          turn: 1,
          at: 1,
        })),
      },
    }))
    let now = 100
    let queues = 0
    let atDispatch: Awaited<ReturnType<typeof readState>> | null = null
    const temporary = `${statePath(dir, 's1')}.${process.pid}.tmp`
    const server = () =>
      makeServer({
        dir,
        now: () => now,
        tabHtml: '<html></html>',
        fallbackCli: async () => {
          if (failure === 'lookup') throw new Error('No queue command')
          return '/codex'
        },
        exec: async argv => {
          if (!argv.includes('queue')) return { code: -1, stdout: '', stderr: 'No external commands' }
          queues++
          atDispatch = await readState(dir, 's1')
          if (failure === 'completion') mkdirSync(temporary)
          return failure === 'queue'
            ? { code: 1, stdout: '', stderr: 'Lost queue outcome' }
            : { code: 0, stdout: 'Queued message done-batch', stderr: '' }
        },
      })
    let handle = server()
    const call = (name: string, args: Record<string, unknown> = {}) =>
      handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args, _meta: { thread_id: 's1' } },
      })
    for (const id of ['i1', 'i2']) {
      await call('inbox_press', { press: { action: 'done', id }, thread: 's1' })
      now++
    }
    now += SETTLE_WINDOW_MS
    if (failure === 'checkpoint') mkdirSync(temporary)
    await call('inbox_view')
    await rm(temporary, { recursive: true, force: true })
    let state = await readState(dir, 's1')
    if (failure === 'checkpoint' || failure === 'lookup') {
      assert.equal(queues, 0)
      assert.deepEqual(state.sent, [])
      assert.ok(state.ledger.closed.every(c => !c.isSentToAgent))
      const undo = await call('inbox_press', { press: { action: 'undo', id: 'i1' }, thread: 's1' })
      assert.equal((undo?.result as { structuredContent: { note: string | null } }).structuredContent.note, null)
      assert.ok((await readState(dir, 's1')).ledger.items.some(i => i.id === 'i1'))
      return
    }
    assert.equal(queues, 1)
    const intent = atDispatch as Awaited<ReturnType<typeof readState>> | null
    assert.ok(intent)
    assert.equal(intent.sent[0]?.phase, 'attempting')
    assert.ok(intent.ledger.closed.every(c => c.isSentToAgent))
    assert.ok(['i1', 'i2'].every(id => intent.lastActions[id]?.delivery?.state === 'unconfirmed'))
    assert.equal(state.sent.length, 1)
    assert.equal(
      state.sent[0]?.phase,
      failure === 'none' ? 'accepted' : failure === 'queue' ? 'uncertain' : 'attempting',
    )
    assert.equal(new Set(['i1', 'i2'].map(id => state.lastActions[id]?.delivery?.state)).size, 1)
    assert.ok(state.ledger.closed.every(c => c.isSentToAgent))
    const expected = failure === 'none' ? 'queued' : 'unconfirmed'
    assert.deepEqual(
      viewOf(state, now).needsYou.closed.tasks.map(c => c.delivery),
      [expected, expected],
    )
    handle = server()
    await call('inbox_view')
    await call('inbox_view')
    assert.equal(queues, 1)
    const undo = await call('inbox_press', { press: { action: 'undo', id: 'i1' }, thread: 's1' })
    assert.equal((undo?.result as { structuredContent: { note: string | null } }).structuredContent.note, 'stale')
    state = notePrompt(await readState(dir, 's1'), state.sent[0]!.text, now).state
    const isOutcomeLost = failure === 'queue'
    assert.equal(state.sent.length, isOutcomeLost ? 1 : 0)
    assert.deepEqual(
      viewOf(state, now).needsYou.closed.tasks.map(c => c.delivery),
      isOutcomeLost ? ['unconfirmed', 'unconfirmed'] : [null, null],
    )
  })
}

test('a server whose environment names no CLI runs its parent when that is a codex, else the codex on PATH', async () => {
  const parents: Record<string, string> = { '42': '/apps/CodexCLI.app/Contents/MacOS/codex', '43': '/bin/zsh' }
  const { exec } = fakeRunner(args => ({ code: 0, stdout: `${parents[args.at(-1) ?? ''] ?? ''}\n`, stderr: '' }))

  assert.equal(await findCli({}, exec, 42), '/apps/CodexCLI.app/Contents/MacOS/codex')
  assert.equal(await findCli({}, exec, 43), 'codex')
  assert.equal(await findCli({ CODEX_APP_RUNTIME_CLI_PATH: '/app/codex' }, exec, 43), '/app/codex')
})

function openSetup() {
  const dir = tempDir()
  const home = tempDir()
  const updates: string[] = []
  const handle = makeServer({
    dir,
    now: () => 100,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => '/apps/codex',
    openCatchUp: { codexHome: home, startUpdate: id => updates.push(id) },
  })
  const call = (name: string, id: string, meta: Record<string, unknown> = { thread_id: id }) =>
    handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {}, _meta: meta } })

  return { dir, home, updates, call }
}

test('the tab’s first view of a chat with earlier turns marks it behind and starts one catch-up, even across polls', async () => {
  const { dir, home, updates, call } = openSetup()
  const rollout = rolloutAt(home, 'c1', { cwd: '/repo' })
  await call('inbox_view', 'c1')
  await call('inbox_view', 'c1')

  const s = await readState(dir, 'c1')
  assert.equal(s.presence.ledgerState, 'behind')
  assert.equal(s.transcriptPath, rollout)
  assert.equal(s.root, '/repo')
  assert.equal(s.cliPath, '/apps/codex')
  assert.deepEqual(updates, ['c1'])

  await handleHook(input('SessionStart', { session_id: 'c1', cwd: '/repo', transcript_path: rollout }), {
    ...hookDeps(dir),
    startUpdate: id => updates.push(`hook ${id}`),
  })
  assert.deepEqual(updates, ['c1'])
})

test('the tab’s first view of a forked chat gives it the parent’s ledger and starts no catch-up', async () => {
  const { dir, home, updates, call } = openSetup()
  await updateState(dir, 'parent', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 3, turnsApplied: 3 },
    ledger: { ...s.ledger, turn: 3, updates: 1, nextId: 4 },
  }))
  rolloutAt(home, 'fork', { forked_from_id: 'parent' })
  await call('inbox_view', 'fork')

  const s = await readState(dir, 'fork')
  assert.equal(s.presence.ledgerState, 'current')
  assert.deepEqual(updates, [])
})

test('the tab changes nothing for a chat with no rollout, and does not look again once it appears', async () => {
  const { dir, home, updates, call } = openSetup()
  await call('inbox_view', 'c2')
  rolloutAt(home, 'c2')
  await call('inbox_view', 'c2')

  const s = await readState(dir, 'c2')
  assert.equal(s.presence.ledgerState, 'current')
  assert.equal(s.transcriptPath, null)
  assert.deepEqual(updates, [])
})

test('a chat whose hooks already ran is left as it is when its tab opens', async () => {
  const { dir, home, updates, call } = openSetup()
  rolloutAt(home, 'c3')
  await updateState(dir, 'c3', s => noteHook(s, 'start', 50))
  await call('inbox_view', 'c3')

  const s = await readState(dir, 'c3')
  assert.equal(s.presence.ledgerState, 'current')
  assert.equal(s.transcriptPath, null)
  assert.deepEqual(updates, [])
})

test('a call the model makes does not catch up the chat', async () => {
  const { dir, home, updates, call } = openSetup()
  rolloutAt(home, 'c4')
  const agent = { 'x-codex-turn-metadata': { session_id: 'c4', turn_id: 't1' } }
  await call('inbox', 'c4', agent)
  await call('record', 'c4', agent)

  assert.equal((await readState(dir, 'c4')).presence.ledgerState, 'current')
  assert.deepEqual(updates, [])
})

test('a chat no hook has run in says why from Codex’s hook list, asks again within seconds while the hooks are stopped and after the cache window otherwise, and says nothing when the list fails', async () => {
  let t = 1000
  const answers: ('untrusted' | 'modified' | 'trusted' | null)[] = ['untrusted', 'trusted', null, 'modified']
  const asked: string[][] = []
  const dir = tempDir()
  await updateState(dir, 's1', s => ({ ...s, root: '/repo', cliPath: '/apps/codex' }))
  const handle = makeServer({
    dir,
    now: () => t,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '',
    fallbackCli: async () => 'codex',
    hooksTrust: async (cli, cwd) => {
      asked.push([cli, cwd])
      return answers.shift() ?? null
    },
  })
  const view = async () =>
    (
      (await handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'inbox_view', arguments: {}, _meta: { thread_id: 's1' } },
      })) as { result: { structuredContent: { hooksTrust?: string } } }
    ).result.structuredContent.hooksTrust
  const settle = () => new Promise(resolve => setImmediate(resolve))

  assert.equal(await view(), undefined)
  await settle()
  assert.equal(await view(), 'untrusted')
  assert.equal(await view(), 'untrusted')
  assert.deepEqual(asked, [['/apps/codex', '/repo']])

  t += 5_000
  assert.equal(await view(), 'untrusted')
  await settle()
  assert.equal(await view(), undefined)
  t += 5_000
  await view()
  await settle()
  assert.equal(asked.length, 2)

  t += 30_000
  await view()
  await settle()
  assert.equal(await view(), undefined)

  t += 30_000
  await view()
  await settle()
  assert.equal(await view(), 'modified')
  assert.equal(asked.length, 4)

  await updateState(dir, 's1', s => noteHook(s, 'start', t))
  t += 30_000
  assert.equal(await view(), undefined)
  await settle()
  assert.equal(asked.length, 4)
})

test('a chat whose folder is not known yet asks Codex’s hook list for the home folder', async () => {
  const asked: string[] = []
  const handle = makeServer({
    dir: tempDir(),
    now: () => 1000,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '',
    fallbackCli: async () => 'codex',
    hooksTrust: async (_cli, folder) => {
      asked.push(folder)
      return 'modified'
    },
  })
  await handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'inbox_view', arguments: {}, _meta: { thread_id: 'new' } },
  })
  await new Promise(resolve => setImmediate(resolve))

  assert.deepEqual(asked, [homedir()])
})
