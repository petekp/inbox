import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { parseStatus } from '../../hooks/status'
import { applyStatus } from '../../hooks/status-ops'
import { QUEUED_AFTER_MS } from '../../hooks/timing'
import { notePrompt, viewOf } from '../src/core'
import { makeServer } from '../src/server'
import { readState, updateState } from '../src/state'
import { handleHook } from '../src/hook'
import { findCli, queueResumeCheck } from '../src/cli'
import { fakeRunner, hookDeps, input, tempDir } from './helpers'
import { ANSWER, setup } from './server-fixtures'

test('a press sends its message into the tab’s thread with the codex binary the hooks saw, and the next prompt reads it as a press', async () => {
  const { dir, calls, call } = await setup(0)
  const r = await call('inbox_press', { ...ANSWER, shownSince: 0 }, { thread_id: 's1' })
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

test('a press passes --resume only to a codex whose queue help lists it, and asks each binary once', async () => {
  const helps: Record<string, string> = {
    '/apps/codex-0.166':
      'Options:\n      --thread <THREAD>\n      --message <TEXT>\n      --resume\n          After queueing',
    '/apps/codex-0.164': 'Options:\n      --thread <THREAD>\n      --message <TEXT>\n  -i, --image <FILE>...',
  }
  const helpRuns: string[] = []
  const queueResumes = queueResumeCheck(async args => {
    helpRuns.push(args[0]!)
    return { code: 0, stdout: helps[args[0]!]!, stderr: '' }
  })
  const queueCalls = async (cli: string) => {
    const { dir } = await setup(0)
    await updateState(dir, 's1', s => ({
      ...s,
      cliPath: cli,
      ledger: {
        ...s.ledger,
        nextId: 3,
        items: [...s.ledger.items, { ...s.ledger.items[0]!, id: 'i2', ask: 'Tag it?' }],
      },
    }))
    const runner = fakeRunner(() => ({ code: 0, stdout: 'Queued message q1\n', stderr: '' }))
    const handle = makeServer({
      comparePage: '/plugin/dist/compare-page.html',
      dir,
      now: () => 100,
      exec: runner.exec,
      tabHtml: '<html></html>',
      fallbackCli: async () => 'codex',
      queueResumes,
    })
    for (const id of ['i1', 'i2'])
      await handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'inbox_press',
          arguments: { press: { action: 'answer', id, option: 'Yes' }, thread: 's1', shownSince: 0 },
          _meta: { thread_id: 's1' },
        },
      })

    return runner.calls
  }

  const newer = await queueCalls('/apps/codex-0.166')
  const older = await queueCalls('/apps/codex-0.164')
  assert.equal(newer.length, 2)
  assert.equal(older.length, 2)
  assert.deepEqual(newer[0], [
    '/apps/codex-0.166',
    'queue',
    '--resume',
    '--thread',
    's1',
    '--message',
    'Re "Ship it?": Yes',
  ])
  assert.deepEqual(older[0], ['/apps/codex-0.164', 'queue', '--thread', 's1', '--message', 'Re "Ship it?": Yes'])
  assert.deepEqual(helpRuns, ['/apps/codex-0.166', '/apps/codex-0.164'])
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

test('a server whose environment names no CLI runs its parent when that is a codex, else the codex on PATH', async () => {
  const parents: Record<string, string> = { '42': '/apps/CodexCLI.app/Contents/MacOS/codex', '43': '/bin/zsh' }
  const { exec } = fakeRunner(args => ({ code: 0, stdout: `${parents[args.at(-1) ?? ''] ?? ''}\n`, stderr: '' }))

  assert.equal(await findCli({}, exec, 42), '/apps/CodexCLI.app/Contents/MacOS/codex')
  assert.equal(await findCli({}, exec, 43), 'codex')
  assert.equal(await findCli({ CODEX_APP_RUNTIME_CLI_PATH: '/app/codex' }, exec, 43), '/app/codex')
})

test('on a next build, Use this goal sets the proposed goal and a typed goal replaces it, each saved at once and sent nowhere', async () => {
  const { dir, calls, call } = await setup(
    0,
    () => 100,
    async () => 'codex',
    true,
  )
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      overview: applyStatus(
        null,
        parseStatus('HEAD: Pilot | Shipping it\nGOAL: Pilot ready to announce | done Fixes built; queued Announced')!,
        50,
        new Set(),
      ),
    },
  }))
  const used = await call(
    'inbox_press',
    { press: { action: 'use-goal', id: 'goal' }, thread: 's1' },
    { thread_id: 's1' },
  )
  assert.equal(used.result.structuredContent.error, null)
  const goalOf = async () => (await readState(dir, 's1')).ledger.overview
  assert.deepEqual(
    [(await goalOf())?.goal?.text, (await goalOf())?.milestones.map(m => m.name), (await goalOf())?.proposedGoal],
    ['Pilot ready to announce', ['Fixes built', 'Announced'], null],
  )

  await call(
    'inbox_press',
    { press: { action: 'type', id: 'goal', text: 'Pilot live for every team' }, thread: 's1' },
    { thread_id: 's1' },
  )
  assert.deepEqual(
    [(await goalOf())?.goal?.text, (await goalOf())?.goal?.isAwaitingMilestones],
    ['Pilot live for every team', true],
  )
  assert.deepEqual(calls, [])
})
