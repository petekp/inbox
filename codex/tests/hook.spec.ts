import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { EMPTY } from '../../hooks/ledger'
import { inboxText, progressRule } from '../../hooks/model-text'
import { feedbackText } from '../../hooks/view'
import { notePrompt, noteToolCall, viewOf } from '../src/core'
import { handleHook } from '../src/hook'
import { makeServer } from '../src/server'
import { readState, statePath, updateState } from '../src/state'
import { CODEX } from '../src/texts'
import { fakeRunner, hookDeps, input, tempDir } from './helpers'

test('a session starts with the guidance, records the prompt, and ends the turn into the update', async () => {
  const dir = tempDir()
  const root = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  const deps = hookDeps(dir)

  const start = await handleHook(
    input('SessionStart', { cwd: root, source: 'startup', transcript_path: transcript }),
    deps,
  )
  assert.match(JSON.stringify(start), /mcp__inbox__record/)
  const started = await readState(dir, 's1')
  assert.equal(started.root, root)
  assert.equal(started.cliPath, '/apps/codex')
  assert.equal(
    await handleHook(input('SessionStart', { cwd: root, source: 'resume', transcript_path: transcript }), deps),
    null,
  )

  await handleHook(input('UserPromptSubmit', { prompt: 'Run the tests', turn_id: 't1' }), deps)
  assert.equal(
    await handleHook(
      input('Stop', {
        turn_id: 't1',
        transcript_path: transcript,
        last_assistant_message: 'All tests pass.',
      }),
      deps,
    ),
    null,
  )
  const ended = await readState(dir, 's1')
  assert.equal(ended.pending[0]?.ex.person, 'Run the tests')
  assert.equal(ended.pending[0]?.ex.reply, 'All tests pass.')
  assert.deepEqual(deps.updates, ['s1'])
})

test('a Stop notes the dialogs the agent opened in the ending turn as open, and leaves earlier turns out', async () => {
  const dir = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  const deps = hookDeps(dir)
  const started = (turn: string) => ({ type: 'event_msg', payload: { type: 'task_started', turn_id: turn } })
  const dialog = (questions: unknown[]) => ({
    type: 'response_item',
    payload: { type: 'function_call', name: 'request_user_input_async', arguments: JSON.stringify({ questions }) },
  })
  writeFileSync(
    transcript,
    [
      started('t1'),
      dialog([{ title: 'Use Node or Python?', options: ['Node', 'Python'] }]),
      started('t2'),
      dialog([
        { title: 'Push the fix now?', options: ['Push now (Recommended)', 'Wait'] },
        { title: 'Tag it?', options: ['Yes', 'No'] },
      ]),
      { type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: '{}' } },
    ]
      .map(row => JSON.stringify(row))
      .join('\n'),
  )

  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it', turn_id: 't2' }), deps)
  await handleHook(
    input('Stop', { turn_id: 't2', transcript_path: transcript, last_assistant_message: 'Asked in the dialog.' }),
    deps,
  )
  const activity = (await readState(dir, 's1')).pending[0]?.ex.activity ?? []
  assert.equal(activity.length, 1)
  assert.match(activity[0]!, /Push the fix now\?.*Tag it\?/)
  assert.doesNotMatch(activity[0]!, /Node or Python/)

  await handleHook(
    input('Stop', {
      turn_id: 't9',
      transcript_path: join(tempDir(), 'missing.jsonl'),
      last_assistant_message: 'Done.',
    }),
    deps,
  )
  assert.deepEqual((await readState(dir, 's1')).pending[1]?.ex.activity, [])
})

test('the Map reads Working… from a main-agent prompt until Stop or Interrupt, and a compact start mid-turn keeps it', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir, () => 1000)
  const now = async () => viewOf(await readState(dir, 's1'), 1000).map.now

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  await handleHook(input('UserPromptSubmit', { prompt: 'Look around', agent_id: 'a1' }), deps)
  assert.equal(await now(), null)
  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it', turn_id: 't1' }), deps)
  assert.equal(await now(), 'Working…')
  await handleHook(input('SessionStart', { cwd: '/repo', source: 'compact' }), deps)
  assert.equal(await now(), 'Working…')
  await handleHook(input('Interrupt', {}), deps)
  assert.equal(await now(), null)

  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it again', turn_id: 't2' }), deps)
  await handleHook(input('Stop', { last_assistant_message: '', turn_id: 't2' }), deps)
  assert.equal(await now(), null)
})

test('the Map lists a subagent by its spawn call’s task name, with its step or its own progress, then its result until the next prompt', async () => {
  const dir = tempDir()
  let clock = 1000
  const deps = hookDeps(dir, () => clock)
  const rows = async () => viewOf(await readState(dir, 's1'), clock).map.subagents?.rows ?? []
  const server = makeServer({
    dir,
    now: () => clock,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '',
    fallbackCli: async () => 'codex',
  })
  const progress = async (text: string, turn: Record<string, unknown>) => {
    const r = (await server({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'progress', arguments: { text }, _meta: { 'x-codex-turn-metadata': turn } },
    })) as { result: { content: { text: string }[] } }
    return r.result.content[0]?.text
  }

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it', turn_id: 't1' }), deps)
  await handleHook(
    input('PostToolUse', {
      tool_name: 'collaborationspawn_agent',
      tool_response: { task_name: '/root/find_export_code' },
    }),
    deps,
  )
  assert.deepEqual(await handleHook(input('SubagentStart', { agent_id: 'a1' }), deps), {
    hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: progressRule(CODEX) },
  })
  await handleHook(
    input('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'rg export src' }, agent_id: 'a1' }),
    deps,
  )
  assert.deepEqual(
    (await rows()).map(r => [r.mark, r.text, r.detail]),
    [['●', 'Find export code', 'Running rg export src']],
  )

  const subagent = { session_id: 's1', thread_id: 'a1', parent_thread_id: 's1', turn_id: 'u1' }
  assert.equal(await progress('Tracing the CSV path', subagent), 'Shown in the Map section of the Inbox tab.')
  await handleHook(
    input('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'rg csv src' }, agent_id: 'a1' }),
    deps,
  )
  assert.deepEqual(
    (await rows()).map(r => r.detail),
    ['Tracing the CSV path'],
  )
  assert.match(
    (await progress('Deep in', { ...subagent, thread_id: 'a9', parent_thread_id: 'a1' })) ?? '',
    /^Not shown/,
  )
  await progress('Reading the release notes', { session_id: 's1', thread_id: 's1', turn_id: 't1' })
  assert.equal(viewOf(await readState(dir, 's1'), clock).map.now, 'Reading the release notes')

  await handleHook(
    input('SubagentStop', { agent_id: 'a1', last_assistant_message: 'Found it in src/export.ts.\nMore.' }),
    deps,
  )
  await handleHook(input('Stop', { last_assistant_message: '', turn_id: 't1' }), deps)
  assert.deepEqual(
    (await rows()).map(r => [r.mark, r.detail]),
    [['✓', 'Found it in src/export.ts.']],
  )
  assert.equal(viewOf(await readState(dir, 's1'), clock).map.now, null)

  clock = 2000
  await handleHook(input('UserPromptSubmit', { prompt: 'Next', turn_id: 't2' }), deps)
  assert.deepEqual(await rows(), [])
})

test('each hook records that it ran, with the turn UserPromptSubmit saw, and the tab reads the session as heard', async () => {
  const dir = tempDir()
  let clock = 1000
  const deps = hookDeps(dir, () => clock)
  const heard = async () => (await readState(dir, 's1')).heard
  assert.equal(viewOf(await readState(dir, 's1'), clock).heard, 'none')

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  assert.deepEqual(await heard(), {
    startAt: 1000,
    promptAt: null,
    prompts: 0,
    promptTurns: [],
    stopAt: null,
    stops: 0,
    promptMissedAt: null,
  })
  clock = 2000
  await handleHook(input('UserPromptSubmit', { prompt: 'Hi', turn_id: 't1' }), deps)
  assert.deepEqual(
    { ...(await heard()), startAt: undefined },
    {
      startAt: undefined,
      promptAt: 2000,
      prompts: 1,
      promptTurns: ['t1'],
      stopAt: null,
      stops: 0,
      promptMissedAt: null,
    },
  )
  await handleHook(input('UserPromptSubmit', { prompt: 'Review', turn_id: 'a1', agent_id: 'agent-1' }), deps)
  assert.deepEqual([(await heard()).prompts, (await heard()).promptTurns], [1, ['t1']])
  clock = 3000
  await handleHook(input('Stop', { turn_id: 't1', last_assistant_message: '' }), deps)
  const h = await heard()
  assert.deepEqual([h.stopAt, h.stops], [3000, 1])
  assert.equal(viewOf(await readState(dir, 's1'), clock).heard, 'heard')
})

test('a patch notes each edited file, resolved against the folder it ran in', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  const patch = '*** Begin Patch\n*** Add File: ../new/b.txt\n+b\n*** End Patch'
  await handleHook(
    input('PreToolUse', { tool_name: 'apply_patch', tool_input: { command: patch }, cwd: '/work/app' }),
    deps,
  )
  const s = await readState(dir, 's1')
  assert.deepEqual(s.turn.activity, ['edited /work/new/b.txt'])
})

test('hooks do nothing in a codex exec run or an ephemeral thread', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  const transcript = join(tempDir(), 'rollout.jsonl')
  writeFileSync(
    transcript,
    `${JSON.stringify({ type: 'session_meta', payload: { originator: 'codex_exec', source: 'exec' } })}\n`,
  )
  const out = await handleHook(input('SessionStart', { cwd: '/', transcript_path: transcript }), deps)
  assert.equal(out, null)
  assert.equal((await readState(dir, 's1')).root, '')

  for (const event of ['SessionStart', 'UserPromptSubmit', 'Stop'])
    assert.equal(
      await handleHook(
        input(event, {
          cwd: '/',
          transcript_path: null,
          prompt: 'Suggest the next message',
          last_assistant_message: 'Fix the failing test.',
        }),
        deps,
      ),
      null,
    )
  assert.equal((await readState(dir, 's1')).root, '')
  assert.deepEqual(deps.updates, [])
})

test('a session saved by an older build loads converted, as the mod converts its own', async () => {
  const dir = tempDir()
  const old = {
    version: 1,
    sessionId: 's1',
    top: '/repo',
    checks: { results: [], repos: ['/repo'] },
    snapshots: { '/repo': { head: null, dirty: {} } },
    recordedRuns: ['e1'],
    turn: { person: 'Run the tests', activity: [], press: null, sentBack: ['Tests pass.'] },
    sent: [{ text: 'Re "Ship it?": Yes', press: { id: 'i1', action: 'answer' }, at: 1 }],
    pending: [
      {
        ex: {
          person: 'Hi',
          trigger: null,
          activity: [],
          reply: 'Hello',
          turn: 1,
          press: null,
          screen: '',
          checks: ['✓ npm test'],
        },
        turnsStarted: 1,
      },
    ],
    ledger: {
      items: [
        {
          id: 'i1',
          kind: 'decide',
          label: null,
          ask: 'Ship it?',
          options: ['Yes', 'No'],
          rec: 'Yes',
          helps: [],
          turn: 1,
        },
      ],
      decided: [{ id: 'i0', ask: 'Rename it?', outcome: 'dismissed', at: 1 }],
      notes: [{ id: 'f1', kind: 'issue', title: 'No lint', detail: '', path: null, at: 1 }],
    },
    lastActions: {
      i1: { action: 'explain', text: 'Explain sent', at: 1 },
      i2: { action: 'typed', text: 'Reply sent', at: 1, isHandoff: true, turnsStarted: 1 },
      i3: { action: 'step-0', text: 'Run seed script sent', at: 1, isHandoff: true, turnsStarted: 1 },
      f2: { action: 'address', text: 'Sent to Codex to fix', at: 1, title: 'No tests' },
      f3: { action: 'discuss', text: 'Discuss sent', at: 1, title: 'No docs' },
      f4: { action: 'typedFinding', text: 'Reply sent', at: 1, title: 'No types' },
    },
  }
  mkdirSync(join(dir, 'sessions'), { recursive: true })
  writeFileSync(statePath(dir, 's1'), JSON.stringify(old))
  const s = await readState(dir, 's1')
  const ledger = s.ledger
  assert.deepEqual(s.lastActions, {
    i1: { kind: 'talk', action: 'explain', text: 'Explain', at: 1 },
    i2: { kind: 'handoff', action: 'type', text: 'Reply', at: 1, turnsStarted: 1 },
    i3: { kind: 'handoff', action: 'step-0', text: 'Run seed script', at: 1, turnsStarted: 1 },
    f2: { kind: 'handoff', action: 'address', text: 'Address', at: 1 },
    f3: { kind: 'talk', action: 'discuss', text: 'Discuss', at: 1 },
  })
  const question = viewOf(s, 2).needsYou.questions[0]
  assert.equal(question && question.feedback && feedbackText(question.feedback, 'codex'), '✓ Explained')
  assert.ok(question?.actions.some(a => a.label === 'Explain again'))
  assert.deepEqual(
    s.sent.map(x => [x.row, x.queuedId]),
    [[null, null]],
  )
  assert.deepEqual(notePrompt(s, 'Re "Ship it?": Yes', 2).state.lastActions, s.lastActions)
  await updateState(dir, 's1', x => x)
  assert.deepEqual((await readState(dir, 's1')).lastActions, s.lastActions)
  for (const key of ['top', 'checks', 'snapshots', 'recordedRuns']) assert.equal(key in s, false, key)
  assert.equal(viewOf(s, 2).heard, 'heard')
  assert.equal(viewOf(noteToolCall(s, 't9', 3), 3).heard, 'heard')
  assert.deepEqual(s.turn, { person: 'Run the tests', activity: [], press: null })
  assert.equal('checks' in (s.pending[0]?.ex ?? {}), false)
  assert.equal(s.pending[0]?.ex.reply, 'Hello')
  assert.deepEqual(
    ledger.items.map(i => [i.kind, i.at]),
    [['question', null]],
  )
  assert.deepEqual(
    ledger.closed.map(d => [d.id, d.kind, d.how]),
    [['i0', 'question', 'dismissed']],
  )
  assert.deepEqual(
    ledger.findings.map(f => f.id),
    ['f1'],
  )
  assert.equal(ledger.nextId, EMPTY.nextId)
})

test('the inbox line Codex reads names the Inbox tab, never the mod’s /inbox pane', () => {
  const ledger = {
    ...EMPTY,
    items: [
      {
        id: 'i1',
        kind: 'question' as const,
        label: null,
        ask: 'Ship it?',
        options: ['Yes'],
        rec: null,
        helps: [],
        turn: 1,
        at: 1,
      },
    ],
  }
  for (const isOpen of [true, false]) {
    const text = inboxText(CODEX, ledger, isOpen)
    assert.match(text, /Inbox tab/)
    assert.doesNotMatch(text, /\/inbox|pane/)
  }
})

test('a session file this build cannot read remains intact after a routine update', async () => {
  const dir = tempDir()
  const initial = await updateState(dir, 's1', s => ({
    ...s,
    ledger: { ...s.ledger, card: { goal: 'Keep me', done: [], now: '', running: [] } },
  }))
  const path = statePath(dir, 's1')
  for (const saved of [
    '{"ledger": ',
    JSON.stringify({ ...initial, pending: { broken: true } }),
    JSON.stringify({ ...initial, version: 2 }),
  ]) {
    writeFileSync(path, saved)
    await assert.rejects(readState(dir, 's1'))
    await assert.rejects(updateState(dir, 's1', s => ({ ...s, tabSeenAt: 5 })))
    assert.equal(readFileSync(path, 'utf8'), saved)
  }
  assert.deepEqual(readdirSync(join(dir, 'sessions')), ['s1.json'])
})

test('a PR link in the agent’s reply is linked to the session', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  await handleHook(input('UserPromptSubmit', { prompt: 'Open a PR', turn_id: 't1' }), deps)
  await handleHook(
    input('Stop', { turn_id: 't1', last_assistant_message: 'Opened https://github.com/acme/app/pull/12 for review.' }),
    deps,
  )
  assert.deepEqual((await readState(dir, 's1')).ledger.prs, ['acme/app#12'])
})
