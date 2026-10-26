import assert from 'node:assert/strict'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { linkDialogs } from '../../hooks/dialogs'
import { addAgentItem, EMPTY } from '../../hooks/ledger'
import { inboxText } from '../../hooks/model-text'
import { EMPTY_OVERVIEW } from '../../hooks/overview'
import { applied, parsedReply } from '../../hooks/session'
import { feedbackText } from '../../hooks/view'
import { notePrompt, noteToolCall, viewOf } from '../src/core'
import { handleHook } from '../src/hook'
import { herdrOnWrite } from '../src/host'
import type { OnWrite } from '../src/host'
import { readState, statePath, updateState } from '../src/state'
import { CODEX } from '../src/texts'
import { runUpdates as runBothCalls } from '../src/update'
import { fakeRunner, hookDeps, input, ledgerOnly, rolloutCopy, tempDir } from './helpers'

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

test('a start after compaction carries the Overview headline and status', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      updates: 1,
      overview: { ...EMPTY_OVERVIEW, headline: 'Adding caching', status: 'Waiting on a choice.' },
    },
  }))
  const context = JSON.stringify(await handleHook(input('SessionStart', { cwd: '/repo', source: 'compact' }), deps))
  assert.match(context, /Working on: Adding caching/)
  assert.match(context, /Status: Waiting on a choice\./)
})

test('a main-agent prompt reads Working… until Stop or a start that is not a compact, and a subagent prompt does not', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  const now = async () =>
    viewOf(await readState(dir, 's1'), 1000).overviewPage.lead.find(l => l.id === 'status')?.text ?? null

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
  assert.match(reports[0] ?? '', /--clear-token inbox-stop --clear-token inbox-needs-you --clear-token inbox-findings/)
  assert.match(reports.at(-1) ?? '', /--token inbox=Allow edits\? --clear-token inbox-stop --token inbox-needs-you=1 /)
  const seqs = herdr.calls.map(args => Number(args[args.indexOf('--seq') + 1]))
  assert.deepEqual(
    seqs,
    [...seqs].sort((a, b) => a - b),
  )
  assert.equal(new Set(seqs).size, seqs.length)
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
