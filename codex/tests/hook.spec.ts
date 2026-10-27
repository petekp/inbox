import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { linkDialogs } from '../../hooks/dialogs'
import { addAgentItem, EMPTY } from '../../hooks/ledger'
import { inboxText } from '../../hooks/model-text'
import { applyOverview, parseOverview } from '../../hooks/overview'
import { applied, parsedReply } from '../../hooks/session'
import { feedbackText } from '../../hooks/view'
import { notePrompt, noteToolCall, viewOf } from '../src/core'
import { handleHook } from '../src/hook'
import type { HookInput } from '../src/hook'
import { herdrOnWrite } from '../src/host'
import type { OnWrite } from '../src/host'
import { readState, statePath, updateState } from '../src/state'
import { CODEX } from '../src/texts'
import { runUpdates as runBothCalls } from '../src/update'
import { fakeRunner, hookDeps, input, ledgerOnly, ROLLOUT_FIXTURE, rolloutCopy, tempDir } from './helpers'
import { reportedTokens } from '../../tests/session-script'

const runUpdates = (
  dir: string,
  id: string,
  ask: (prompt: string) => Promise<string | null>,
  now: () => number,
  onWrite?: OnWrite,
) => runBothCalls(dir, id, ledgerOnly(ask), now, onWrite)

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

test('a hook without CODEX_CLI_PATH saves the CLI the app names in CODEX_APP_RUNTIME_CLI_PATH, and CODEX_CLI_PATH wins when both are set', async () => {
  const dir = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  const start = (id: string, env: NodeJS.ProcessEnv) =>
    handleHook(input('SessionStart', { session_id: id, cwd: tempDir(), transcript_path: transcript }), {
      ...hookDeps(dir),
      env,
    })

  await start('app', { CODEX_APP_RUNTIME_CLI_PATH: '/app/codex' })
  await start('override', { CODEX_CLI_PATH: '/person/codex', CODEX_APP_RUNTIME_CLI_PATH: '/app/codex' })
  await start('unnamed', {})

  assert.equal((await readState(dir, 'app')).cliPath, '/app/codex')
  assert.equal((await readState(dir, 'override')).cliPath, '/person/codex')
  assert.equal((await readState(dir, 'unnamed')).cliPath, null)
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

test('a start after compaction carries the Overview goal and where each open subject stands', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      updates: 1,
      overview: applyOverview(
        null,
        parseOverview('GOAL: Adding caching\nNEW: waits-on-you | Cache | Redis or memory')!,
        1,
      )!,
    },
  }))
  const context = JSON.stringify(await handleHook(input('SessionStart', { cwd: '/repo', source: 'compact' }), deps))
  assert.match(context, /Working on: Adding caching/)
  assert.match(context, /- Cache: Redis or memory \(waits-on-you\)/)
})

test('a main-agent prompt reads Working… until Stop or a start that is not a compact, and a subagent prompt does not', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  const now = async () =>
    viewOf(await readState(dir, 's1'), 1000).overviewPage.live === 'Working…' ? 'Working…' : null

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  await handleHook(input('UserPromptSubmit', { prompt: 'Look around', agent_id: 'a1' }), deps)
  assert.equal(await now(), null)
  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it', turn_id: 't1' }), deps)
  assert.equal(await now(), 'Working…')
  await handleHook(input('SessionStart', { cwd: '/repo', source: 'compact' }), deps)
  assert.equal(await now(), 'Working…')
  await handleHook(input('Stop', { last_assistant_message: '', turn_id: 't1' }), deps)
  assert.equal(await now(), null)

  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it again', turn_id: 't2' }), deps)
  await handleHook(input('SessionStart', { cwd: '/repo', source: 'resume' }), deps)
  assert.equal(await now(), null)
})

test('a dialog question links to the question the agent recorded for it or the update added from it, in the same turn, only when no other question shares the match', async () => {
  const dir = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  const deps = hookDeps(dir)
  const started = (turn: string) => ({ type: 'event_msg', payload: { type: 'task_started', turn_id: turn } })
  const dialog = (callId: string, questions: unknown[]) => ({
    type: 'response_item',
    payload: {
      type: 'function_call',
      name: 'request_user_input_async',
      call_id: callId,
      arguments: JSON.stringify({ questions }),
    },
  })
  const rows: unknown[] = []
  const write = (...more: unknown[]) => {
    rows.push(...more)
    writeFileSync(transcript, rows.map(row => JSON.stringify(row)).join('\n'))
  }
  const applyAnswer = (answer: string) =>
    updateState(dir, 's1', s => applied(s, parsedReply(s.pending[0]!.ex, answer), 2000, 2000))
  const links = async () => (await readState(dir, 's1')).ledger.items.map(i => [i.ask, i.dialog ?? null])
  const linkedQuestions = async () => (await readState(dir, 's1')).dialogQuestions.map(q => q.itemId !== null)
  const record = (ask: string, options: string[]) =>
    updateState(dir, 's1', s => ({
      ...s,
      ledger: addAgentItem(s.ledger, { kind: 'question', ask, options, rec: null, helps: [] }, 1000).ledger,
    }))

  await handleHook(input('UserPromptSubmit', { prompt: 'Fix the build', turn_id: 't1' }), deps)
  write(
    started('t1'),
    dialog('call_a', [
      { title: 'May I push the fix to the branch?', options: ['Push now (Recommended)', 'Keep it local'] },
      { title: 'Which branch gets the tag?', options: ['main', 'release'] },
    ]),
  )
  await record('Push the fix?', ['Push now', 'Keep it local'])
  await handleHook(
    input('Stop', { turn_id: 't1', transcript_path: transcript, last_assistant_message: 'Asked.' }),
    deps,
  )
  assert.deepEqual(await links(), [
    ['Push the fix?', { callId: 'call_a', index: 0, question: 'May I push the fix to the branch?' }],
  ])
  assert.deepEqual(await linkedQuestions(), [true, false])
  await applyAnswer('NONE')

  await handleHook(input('UserPromptSubmit', { prompt: 'Deploy it', turn_id: 't2' }), deps)
  write(started('t2'), dialog('call_b', [{ title: 'Deploy to production now?', options: ['Deploy', 'Wait'] }]))
  await handleHook(
    input('Stop', { turn_id: 't2', transcript_path: transcript, last_assistant_message: 'Asked.' }),
    deps,
  )
  assert.deepEqual(await linkedQuestions(), [false])
  await applyAnswer('NEW: decide | - | Deploy now? | Deploy / Wait | -')
  assert.deepEqual((await links()).slice(1), [
    ['Deploy now?', { callId: 'call_b', index: 0, question: 'Deploy to production now?' }],
  ])
  await handleHook(input('UserPromptSubmit', { prompt: 'Clean up', turn_id: 't3' }), deps)
  write(
    started('t3'),
    dialog('call_c', [
      { title: 'Delete the old branch before merging?', options: ['Yes', 'No'] },
      { title: 'Rename the main file?', options: ['Yes', 'No'] },
    ]),
  )
  await record('Delete the old branch?', ['Yes', 'No'])
  await record('Bump the version?', ['Yes', 'No'])
  await handleHook(
    input('Stop', { turn_id: 't3', transcript_path: transcript, last_assistant_message: 'Asked.' }),
    deps,
  )
  assert.deepEqual((await links()).slice(2), [
    ['Delete the old branch?', { callId: 'call_c', index: 0, question: 'Delete the old branch before merging?' }],
    ['Bump the version?', null],
  ])
  assert.deepEqual(await linkedQuestions(), [true, false])
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

test('a session takes its folder from the rollout, and the branch that folder is on at its start and at each turn’s end', async () => {
  const dir = tempDir()
  const folder = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  writeFileSync(transcript, `${JSON.stringify({ type: 'session_meta', payload: { cwd: folder } })}\n`)
  let branch = 'main'
  const deps = hookDeps(dir)
  deps.run = async (args, { cwd }) =>
    args.join(' ') === 'git branch --show-current' && cwd === folder
      ? { code: 0, stdout: `${branch}\n`, stderr: '' }
      : { code: 1, stdout: '', stderr: 'not a repository' }
  const place = async () => (await readState(dir, 's1')).place

  await handleHook(input('SessionStart', { cwd: folder, source: 'startup', transcript_path: transcript }), deps)
  assert.deepEqual(await place(), { folder, branch: 'main' })
  branch = 'fix-login'
  await handleHook(input('UserPromptSubmit', { prompt: 'Switch', turn_id: 't1', transcript_path: transcript }), deps)
  await handleHook(input('Stop', { turn_id: 't1', cwd: folder, transcript_path: transcript }), deps)
  assert.deepEqual(await place(), { folder, branch: 'fix-login' })
})

test('a subagent runs as a child from SubagentStart to SubagentStop, its tool calls move its activity at most each 30 seconds, and a start that is not a compact ends it', async () => {
  const dir = tempDir()
  let clock = 1000
  const deps = hookDeps(dir, () => clock)
  const children = async () =>
    ((await readState(dir, 's1')).ledger.overview?.children ?? []).map(c => [c.name, c.endedAt, c.lastActivityAt])
  const sub = { agent_id: 'sub1', agent_type: 'explorer' }
  const read = { ...sub, tool_name: 'Read', tool_input: {} }

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  await handleHook(input('SubagentStart', sub), deps)
  assert.deepEqual(await children(), [['explorer', null, 1000]])
  clock = 5000
  await handleHook(input('PreToolUse', read), deps)
  assert.deepEqual(await children(), [['explorer', null, 1000]])
  clock = 31_000
  await handleHook(input('PreToolUse', read), deps)
  assert.deepEqual(await children(), [['explorer', null, 31_000]])
  clock = 39_000
  await handleHook(input('SubagentStop', sub), deps)
  assert.deepEqual(await children(), [['explorer', 39_000, 31_000]])

  await handleHook(input('SubagentStart', { ...sub, agent_id: 'sub2' }), deps)
  await handleHook(input('SessionStart', { cwd: '/repo', source: 'compact' }), deps)
  assert.equal((await children())[1]?.[1], null)
  clock = 12000
  await handleHook(input('SessionStart', { cwd: '/repo', source: 'resume' }), deps)
  assert.equal((await children())[1]?.[1], 12000)
})

test('a Herdr delegate runs as a child from the command that starts it until a turn that waited on it ends, or Herdr shows it no longer working at a turn’s end', async () => {
  const dir = tempDir()
  let at = 1000
  const deps = hookDeps(dir, () => at)
  const listed: string[][] = []
  deps.run = async args => {
    listed.push(args)
    const agents = [
      { name: 'reviewer', agent_status: 'idle' },
      { name: 'helper', agent_status: 'working' },
      { name: 'scout', agent_status: 'idle' },
    ]
    return { code: 0, stdout: JSON.stringify({ id: 'q', result: { type: 'agent_list', agents } }), stderr: '' }
  }
  const transcript = join(tempDir(), 'rollout.jsonl')
  const delegates = async () =>
    ((await readState(dir, 's1')).ledger.overview?.children ?? []).map(c => [c.name, c.endedAt === null])
  const bash = (command: string) => input('PreToolUse', { tool_name: 'Bash', tool_input: { command } })

  await handleHook(input('UserPromptSubmit', { prompt: 'Hand it off', turn_id: 't1' }), deps)
  await handleHook(bash('herdr agent start fixer --cmd codex'), deps)
  await handleHook(bash('herdr agent start reviewer --cmd codex && herdr agent start helper --cmd codex'), deps)
  assert.deepEqual(await delegates(), [
    ['fixer', true],
    ['reviewer', true],
    ['helper', true],
  ])
  at += 60_000
  await handleHook(bash('herdr agent prompt scout "look around"'), deps)
  at += 5_000
  writeFileSync(
    transcript,
    [
      { type: 'event_msg', payload: { type: 'task_started', turn_id: 't1' } },
      {
        type: 'event_msg',
        payload: {
          type: 'item_completed',
          item: {
            type: 'CommandExecution',
            command: ['/bin/zsh', '-lc', 'herdr agent wait fixer'],
            aggregated_output: '',
            exit_code: 0,
          },
        },
      },
    ]
      .map(row => JSON.stringify(row))
      .join('\n'),
  )
  await handleHook(input('Stop', { turn_id: 't1', transcript_path: transcript, last_assistant_message: 'Done.' }), deps)
  assert.deepEqual(listed, [['herdr', 'agent', 'list']])
  assert.deepEqual(await delegates(), [
    ['fixer', false],
    ['reviewer', false],
    ['helper', true],
    ['scout', true],
  ])
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
    dialogQuestions: [
      { callId: 'call_1', index: 0, question: 'Ship it now?', options: ['Yes', 'No'], turn: 1, itemId: null },
    ],
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
          from: 'record',
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
  assert.deepEqual(s.turn, { person: 'Run the tests', trigger: null, activity: [], press: null })
  assert.equal('checks' in (s.pending[0]?.ex ?? {}), false)
  assert.equal(s.pending[0]?.ex.reply, 'Hello')
  assert.deepEqual(
    linkDialogs(s).ledger.items.map(i => [i.id, i.dialog]),
    [['i1', { callId: 'call_1', index: 0, question: 'Ship it now?' }]],
  )
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
        from: 'record' as const,
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
    ledger: { ...s.ledger, turn: 7 },
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

test('a Stop reads the ending turn’s shell commands: local URLs become activity and gh pr create links the PR', async () => {
  const dir = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  const deps = hookDeps(dir)
  const started = (turn: string) => ({ type: 'event_msg', payload: { type: 'task_started', turn_id: turn } })
  const ran = (command: string, output: string) => ({
    type: 'event_msg',
    payload: {
      type: 'item_completed',
      item: {
        type: 'CommandExecution',
        command: ['/bin/zsh', '-lc', command],
        aggregated_output: output,
        exit_code: 0,
      },
    },
  })
  const call = (id: string, command: string[]) => ({
    type: 'response_item',
    payload: { type: 'function_call', name: 'shell', call_id: id, arguments: JSON.stringify({ command }) },
  })
  const result = (id: string, output: string) => ({
    type: 'response_item',
    payload: { type: 'function_call_output', call_id: id, output: JSON.stringify({ output }) },
  })
  writeFileSync(
    transcript,
    [
      started('t1'),
      ran('gh pr create --fill', 'https://github.com/acme/app/pull/3\n'),
      started('t2'),
      ran('npm run dev', 'ready at http://localhost:5173/\n'),
      ran('gh pr create --fill', 'https://github.com/acme/app/pull/12\n'),
      ran('cat notes.txt', 'https://github.com/acme/app/pull/77\n'),
    ]
      .map(row => JSON.stringify(row))
      .join('\n'),
  )
  await handleHook(input('UserPromptSubmit', { prompt: 'Open a PR', turn_id: 't2' }), deps)
  await handleHook(input('Stop', { turn_id: 't2', transcript_path: transcript, last_assistant_message: 'Done.' }), deps)
  const ended = await readState(dir, 's1')
  assert.deepEqual(ended.pending[0]?.ex.activity, ['URL in output: http://localhost:5173/'])
  assert.deepEqual(ended.ledger.prs, ['acme/app#12'])

  const older = join(tempDir(), 'older.jsonl')
  writeFileSync(
    older,
    [
      started('t3'),
      call('c1', ['bash', '-lc', 'gh pr create']),
      result('c1', 'https://github.com/acme/app/pull/20\n'),
      call('c2', ['bash', '-lc', 'npm run dev']),
      result('c2', 'on http://127.0.0.1:8080/x'),
    ]
      .map(row => JSON.stringify(row))
      .join('\n'),
  )
  await handleHook(input('UserPromptSubmit', { prompt: 'Again', turn_id: 't3' }), deps)
  await handleHook(input('Stop', { turn_id: 't3', transcript_path: older, last_assistant_message: 'Done.' }), deps)
  const after = await readState(dir, 's1')
  assert.deepEqual(after.pending[1]?.ex.activity, ['URL in output: http://127.0.0.1:8080/x'])
  assert.deepEqual(after.ledger.prs, ['acme/app#12', 'acme/app#20'])
})

const execDeps = (dir: string) => {
  const deps = hookDeps(dir)

  return { ...deps, env: { ...deps.env, INBOX_IN_EXEC: '1' } }
}

const CATCH_UP_REPLY = 'NEW: decide | - | Allow edits? | Yes / No | Yes'

test('a session resumed with earlier turns is marked behind at its first hook and catches up over the rollout, and each write reports to its Herdr pane', async () => {
  const dir = tempDir()
  const herdr = fakeRunner(() => ({ code: 0, stdout: '', stderr: '' }))
  let at = 100
  const onWrite = herdrOnWrite({ HERDR_PANE_ID: 'p1' }, herdr.exec, dir, () => ++at)
  const deps = { ...execDeps(dir), onWrite }
  const transcript = rolloutCopy()
  const prompts: string[] = []

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'resume', transcript_path: transcript }), deps)
  const started = await readState(dir, 's1')
  assert.equal(started.presence.ledgerState, 'behind')
  assert.equal(started.transcriptPath, transcript)
  assert.deepEqual(deps.updates, ['s1'])

  await runUpdates(
    dir,
    's1',
    async prompt => (prompts.push(prompt), CATCH_UP_REPLY),
    () => 7,
    onWrite,
  )
  const caught = await readState(dir, 's1')
  assert.equal(prompts.length, 1)
  assert.match(prompts[0] ?? '', /<conversation>\n[\s\S]*Person: List the files here and say what each does/)
  assert.equal(caught.presence.ledgerState, 'current')
  assert.deepEqual(
    caught.ledger.items.map(i => i.ask),
    ['Allow edits?'],
  )

  const reports = herdr.calls.map(args => args.join(' '))
  assert.ok(reports.every(r => r.startsWith('herdr pane report-metadata p1 --source inbox ')))
  const tokens = herdr.calls.map(reportedTokens)
  const cleared = {
    inbox: null,
    'inbox-stop': null,
    'inbox-needs-you': null,
    'inbox-findings': null,
    'inbox-prs': null,
  }
  assert.deepEqual(tokens[0], cleared)
  assert.deepEqual(tokens.at(-1), { ...cleared, inbox: 'Allow edits?', 'inbox-needs-you': '1' })
  const seqs = herdr.calls.map(args => Number(args[args.indexOf('--seq') + 1]))
  assert.deepEqual(
    seqs,
    [...seqs].sort((a, b) => a - b),
  )
  assert.equal(new Set(seqs).size, seqs.length)
})

test('a hook in a new process sends no Herdr report that would change nothing, and reports a change the MCP server made', async () => {
  const dir = tempDir()
  const herdr = fakeRunner(() => ({ code: 0, stdout: '', stderr: '' }))
  let at = 100
  const hookProcess = () => ({
    ...hookDeps(dir),
    onWrite: herdrOnWrite({ HERDR_PANE_ID: 'p1' }, herdr.exec, dir, () => ++at),
  })
  const toolUse = input('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } })

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), hookProcess())
  await handleHook(toolUse, hookProcess())
  assert.equal(herdr.calls.length, 1)

  await updateState(dir, 's1', s => ({
    ...s,
    ledger: addAgentItem(s.ledger, { kind: 'question', ask: 'Ship it?', options: [], rec: null, helps: [] }, 1000)
      .ledger,
  }))
  await handleHook(toolUse, hookProcess())
  assert.equal(herdr.calls.length, 2)
  assert.equal(reportedTokens(herdr.calls[1]!)['inbox-needs-you'], '1')
})

function forkRollout(parentId: string): string {
  const [first, ...rest] = readFileSync(rolloutCopy(), 'utf8').split('\n')
  const meta = JSON.parse(first ?? '')
  const path = join(tempDir(), 'fork.jsonl')
  writeFileSync(
    path,
    [JSON.stringify({ ...meta, payload: { ...meta.payload, forked_from_id: parentId } }), ...rest].join('\n'),
  )

  return path
}

test('a forked chat takes its parent’s ledger at its first hook, and catches up when the parent has none', async () => {
  const dir = tempDir()
  const deps = execDeps(dir)
  await updateState(dir, 'parent', s => ({
    ...s,
    presence: { ...s.presence, turnsStarted: 3, turnsApplied: 3 },
    ledger: { ...s.ledger, turn: 3, updates: 1, nextId: 4 },
  }))

  await handleHook(
    input('SessionStart', {
      session_id: 'child',
      cwd: '/repo',
      source: 'startup',
      transcript_path: forkRollout('parent'),
    }),
    deps,
  )
  const child = await readState(dir, 'child')
  assert.equal(child.ledger.turn, 3)
  assert.equal(child.presence.turnsStarted, 0)
  assert.equal(child.presence.ledgerState, 'current')
  assert.deepEqual(deps.updates, [])

  await handleHook(
    input('SessionStart', {
      session_id: 'orphan',
      cwd: '/repo',
      source: 'startup',
      transcript_path: forkRollout('missing-parent'),
    }),
    deps,
  )
  assert.equal((await readState(dir, 'orphan')).presence.ledgerState, 'behind')
  assert.deepEqual(deps.updates, ['orphan'])
})

test('a failed catch-up leaves the ledger behind, and the next Stop catches up again before the exchange', async () => {
  const dir = tempDir()
  const deps = execDeps(dir)
  const transcript = rolloutCopy()
  const prompts: string[] = []
  let answer: string | null = null
  const ask = async (prompt: string) => (prompts.push(prompt), answer)

  await handleHook(input('UserPromptSubmit', { prompt: 'What now?', turn_id: 't9', transcript_path: transcript }), deps)
  await handleHook(
    input('Stop', { turn_id: 't9', transcript_path: transcript, last_assistant_message: 'Try adding tests.' }),
    deps,
  )
  await runUpdates(dir, 's1', ask, () => 7)
  assert.equal((await readState(dir, 's1')).presence.ledgerState, 'failed')
  assert.equal(prompts.length, 1)

  answer = CATCH_UP_REPLY
  await handleHook(input('Stop', { turn_id: 't9', transcript_path: transcript, last_assistant_message: '' }), deps)
  assert.equal(deps.updates.length, 3)
  await runUpdates(dir, 's1', ask, () => 8)
  const caught = await readState(dir, 's1')
  assert.equal(prompts.length, 2)
  assert.match(prompts[1] ?? '', /<conversation>/)
  assert.equal(caught.presence.ledgerState, 'current')
  assert.deepEqual(caught.pending, [])
})

test('turns that ended without a Stop, interrupted ones included, are caught up at the next hook, also in a session saved before the covered turn existed or whose covered turn the rollout lacks; a prompt recorded for one of them does not join the next turn’s; and a clear start covers them instead', async () => {
  const dir = tempDir()
  const deps = execDeps(dir)
  const rows = readFileSync(ROLLOUT_FIXTURE, 'utf8').split('\n')
  const path = join(tempDir(), 'rollout.jsonl')
  const rolloutThrough = (row: number) => writeFileSync(path, rows.slice(0, row + 1).join('\n'))
  const [first, second, third, fourth] = [1, 20, 30, 38].map(row => JSON.parse(rows[row] ?? '').payload.turn_id)
  const hook = (event: string, turnId: string, fields: Partial<HookInput> = {}) =>
    handleHook(input(event, { turn_id: turnId, transcript_path: path, ...fields }), deps)
  const prompts: string[] = []

  rolloutThrough(1)
  await hook('UserPromptSubmit', first, { prompt: 'List the files here and say what each does' })
  rolloutThrough(19)
  await hook('Stop', first, { last_assistant_message: 'Here are the files.' })
  assert.equal((await readState(dir, 's1')).coveredTurn, first)

  rolloutThrough(30)
  await hook('UserPromptSubmit', third, { prompt: 'In one sentence, what did we discuss so far?' })
  const behind = await readState(dir, 's1')
  assert.equal(behind.presence.ledgerState, 'behind')
  assert.equal(behind.coveredTurn, second)
  assert.deepEqual(deps.updates, ['s1', 's1'])

  rolloutThrough(38)
  await hook('UserPromptSubmit', fourth, { prompt: 'SYNTHETIC: what do you suggest?' })
  const dropped = await readState(dir, 's1')
  assert.equal(dropped.coveredTurn, third)
  assert.equal(dropped.turn.person, 'SYNTHETIC: what do you suggest?')

  await runUpdates(
    dir,
    's1',
    async prompt => (prompts.push(prompt), CATCH_UP_REPLY),
    () => 7,
  )
  const caught = await readState(dir, 's1')
  assert.equal(prompts.length, 1)
  assert.match(prompts[0] ?? '', /Person: Now add a subtract function to calc\.py/)
  assert.equal(caught.presence.ledgerState, 'current')
  assert.deepEqual(caught.pending, [])
  assert.deepEqual(
    caught.ledger.items.map(i => i.ask),
    ['Allow edits?'],
  )

  rolloutThrough(44)
  await hook('Stop', fourth, { last_assistant_message: 'Add tests next.' })
  const after = await readState(dir, 's1')
  assert.equal(after.presence.ledgerState, 'current')
  assert.equal(after.coveredTurn, fourth)
  assert.deepEqual(
    after.pending.map(p => p.ex.person),
    ['SYNTHETIC: what do you suggest?'],
  )

  await updateState(dir, 's1', s => ({ ...s, coveredTurn: first }))
  const updates = deps.updates.length
  await handleHook(input('SessionStart', { source: 'clear', cwd: '/repo', transcript_path: path }), deps)
  const cleared = await readState(dir, 's1')
  assert.equal(cleared.presence.ledgerState, 'current')
  assert.equal(cleared.coveredTurn, fourth)
  assert.equal(deps.updates.length, updates)

  rolloutThrough(38)
  await updateState(dir, 's2', s => ({
    ...s,
    heard: { ...s.heard, startAt: 1, promptAt: 2, prompts: 1, promptTurns: [first], stopAt: 3, stops: 1 },
  }))
  const { coveredTurn: _covered, ...savedBefore } = JSON.parse(readFileSync(statePath(dir, 's2'), 'utf8'))
  writeFileSync(statePath(dir, 's2'), JSON.stringify(savedBefore))
  await updateState(dir, 's3', s => ({ ...s, heard: { ...s.heard, startAt: 1 }, coveredTurn: 'gone' }))
  for (const id of ['s2', 's3']) {
    await handleHook(
      input('UserPromptSubmit', { session_id: id, turn_id: fourth, prompt: 'Go', transcript_path: path }),
      deps,
    )
    const caughtUp = await readState(dir, id)
    assert.equal(caughtUp.presence.ledgerState, 'behind', id)
    assert.equal(caughtUp.coveredTurn, third, id)
  }

  const interrupted = join(tempDir(), 'rollout.jsonl')
  const turnRows = (rows: [string, string][]) =>
    writeFileSync(
      interrupted,
      rows
        .map(([type, turnId]) => JSON.stringify({ type: 'event_msg', payload: { type, turn_id: turnId } }))
        .join('\n'),
    )
  await updateState(dir, 's4', s => ({ ...s, heard: { ...s.heard, startAt: 1 }, coveredTurn: 'p' }))
  const prompt = (turnId: string, text: string) =>
    handleHook(
      input('UserPromptSubmit', { session_id: 's4', turn_id: turnId, prompt: text, transcript_path: interrupted }),
      deps,
    )
  turnRows([
    ['task_started', 'p'],
    ['task_complete', 'p'],
    ['task_started', 'a'],
  ])
  await prompt('a', 'Rename the module')
  assert.equal((await readState(dir, 's4')).presence.ledgerState, 'current')
  turnRows([
    ['task_started', 'p'],
    ['task_complete', 'p'],
    ['task_started', 'a'],
    ['turn_aborted', 'a'],
    ['task_started', 'b'],
  ])
  const updatesBefore = deps.updates.length
  await prompt('b', 'Keep the old name')
  const afterInterrupt = await readState(dir, 's4')
  assert.equal(afterInterrupt.presence.ledgerState, 'behind')
  assert.equal(afterInterrupt.coveredTurn, 'a')
  assert.equal(afterInterrupt.turn.person, 'Keep the old name')
  assert.deepEqual(deps.updates.slice(updatesBefore), ['s4'])
})

test('a new session, a compaction start, a subagent and a session with recorded turns are not marked behind', async () => {
  const dir = tempDir()
  const deps = execDeps(dir)
  const fresh = join(tempDir(), 'fresh.jsonl')
  writeFileSync(fresh, JSON.stringify({ type: 'event_msg', payload: { type: 'task_started', turn_id: 't1' } }))
  const earlier = rolloutCopy()

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup', transcript_path: fresh }), deps)
  await handleHook(input('UserPromptSubmit', { prompt: 'Hi', turn_id: 't1', transcript_path: fresh }), deps)
  assert.equal((await readState(dir, 's1')).presence.ledgerState, 'current')

  await handleHook(input('SessionStart', { session_id: 's2', source: 'compact', transcript_path: earlier }), deps)
  assert.equal((await readState(dir, 's2')).presence.ledgerState, 'current')

  await handleHook(
    input('UserPromptSubmit', { session_id: 's3', agent_id: 'a1', prompt: 'Review', transcript_path: earlier }),
    deps,
  )
  const subagent = await readState(dir, 's3')
  assert.equal(subagent.presence.ledgerState, 'current')
  assert.equal(subagent.transcriptPath, null)

  await updateState(dir, 's4', s => ({ ...s, presence: { ...s.presence, turnsStarted: 2, turnsApplied: 2 } }))
  await handleHook(
    input('UserPromptSubmit', { session_id: 's4', prompt: 'Go', turn_id: 't9', transcript_path: earlier }),
    deps,
  )
  assert.equal((await readState(dir, 's4')).presence.ledgerState, 'current')
  assert.deepEqual(deps.updates, [])
})

test('a Stop reads the turn’s last update_plan into the agent task list, and a turn with no plan leaves it', async () => {
  const dir = tempDir()
  const transcript = join(tempDir(), 'rollout.jsonl')
  const deps = hookDeps(dir)
  const plan = (rows: unknown[]) => ({
    type: 'response_item',
    payload: { type: 'function_call', name: 'update_plan', arguments: JSON.stringify({ plan: rows }) },
  })
  writeFileSync(
    transcript,
    [
      { type: 'event_msg', payload: { type: 'task_started', turn_id: 't1' } },
      plan([{ step: 'Read the parser', status: 'in_progress' }]),
      plan([
        { step: 'Read the parser', status: 'completed' },
        { step: 'Fix it', status: 'in_progress' },
      ]),
    ]
      .map(row => JSON.stringify(row))
      .join('\n'),
  )

  await handleHook(input('UserPromptSubmit', { prompt: 'Fix the parser', turn_id: 't1' }), deps)
  await handleHook(
    input('Stop', { turn_id: 't1', transcript_path: transcript, last_assistant_message: 'Working.' }),
    deps,
  )
  assert.deepEqual((await readState(dir, 's1')).hostTasks, [
    { id: '1', text: 'Read the parser', status: 'done' },
    { id: '2', text: 'Fix it', status: 'in-progress' },
  ])

  await handleHook(input('UserPromptSubmit', { prompt: 'Go on', turn_id: 't2' }), deps)
  await handleHook(
    input('Stop', {
      turn_id: 't2',
      transcript_path: join(tempDir(), 'missing.jsonl'),
      last_assistant_message: 'Done.',
    }),
    deps,
  )
  assert.equal((await readState(dir, 's1')).hostTasks.length, 2)
})
