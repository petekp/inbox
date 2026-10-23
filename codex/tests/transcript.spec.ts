import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { readRollout, rolloutFor } from '../src/transcript'
import { ROLLOUT_FIXTURE, rolloutAt, tempDir } from './helpers'

const rows = (...list: unknown[]) => list.map(row => (typeof row === 'string' ? row : JSON.stringify(row))).join('\n')

const started = (turn: string) => ({ type: 'event_msg', payload: { type: 'task_started', turn_id: turn } })

const completed = (turn: string) => ({ type: 'event_msg', payload: { type: 'task_complete', turn_id: turn } })

const response = (payload: Record<string, unknown>) => ({ type: 'response_item', payload })

const message = (role: string, text: string) =>
  response({
    type: 'message',
    role,
    content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text }],
  })

function rolloutOf(text: string): string {
  const path = join(tempDir(), 'rollout.jsonl')
  writeFileSync(path, text)

  return path
}

test('the fixture rollout reads as the conversation, with no injected context, environment rows or compaction', async () => {
  const rollout = await readRollout(ROLLOUT_FIXTURE, '/repo', undefined)

  assert.equal(
    rollout?.conversation,
    [
      'Person: List the files here and say what each does',
      'Agent: I’ll list the files in this directory and read them to see what each does.',
      "Agent ran: pwd && rg --files -g '!node_modules' -g '!.git' -g '!vendor' -g '!dist' -g '!build' && ls -la",
      'Agent ran: cat README.md calc.py',
      'Agent: There are two files and one hidden directory:',
      '',
      '- **`README.md`** — Describes the project as “Toy,” a tiny calculator.',
      '- **`calc.py`** — Defines `add(a, b)`, which returns `a + b`.',
      '- **`.git/`** — Stores Git history and repository metadata.',
      'Person: Now add a subtract function to calc.py (just try to apply a patch) and tell me what happened',
      'Agent: I’ll try applying a patch to add `subtract(a, b)` to `calc.py`.',
      'Agent edited /repo/calc.py',
      'Agent: The patch was rejected because the sandbox is read-only and approval settings block writes. `calc.py` is unchanged.',
      '',
      'The attempted addition was:',
      '',
      '```python',
      'def subtract(a, b):',
      '    return a - b',
      '```',
      'Person: In one sentence, what did we discuss so far?',
      'Agent: We reviewed the repo’s files, then tried adding a `subtract` function to `calc.py`, but the read-only sandbox rejected the patch.',
      'Person: SYNTHETIC: what do you suggest?',
      'Agent ran: cat calc.py',
      'Agent: SYNTHETIC: add tests.',
    ].join('\n'),
  )
})

test('earlier turns are the finished turns and the turns with a person message, other than the turn a hook runs in', async () => {
  assert.equal((await readRollout(ROLLOUT_FIXTURE, '/repo', undefined))?.earlierTurns, 4)
  assert.equal((await readRollout(ROLLOUT_FIXTURE, '/repo', '00000000-0000-7000-8000-000000000004'))?.earlierTurns, 3)
  const current = rolloutOf(rows(started('t1'), message('user', '<environment_context>x</environment_context>')))
  assert.equal((await readRollout(current, '/repo', undefined))?.earlierTurns, 0)
  const interrupted = rolloutOf(rows(started('t1'), message('user', 'Fix it'), started('t2')))
  assert.equal((await readRollout(interrupted, '/repo', 't2'))?.earlierTurns, 1)
})

test('a rollout of older shapes reads shell calls, patches, spawned agents, dialogs and MCP calls', async () => {
  const path = rolloutOf(
    rows(
      'not json',
      '[1, 2]',
      { type: 'something_new', payload: { type: 'other' } },
      started('t1'),
      message('user', 'Ship the fix'),
      message('user', 'inbox: carried context'),
      message('assistant', 'On it.'),
      response({
        type: 'function_call',
        name: 'shell',
        arguments: JSON.stringify({ command: ['bash', '-lc', 'npm test'] }),
      }),
      response({ type: 'function_call', name: 'shell', arguments: JSON.stringify({ command: ['ls', '-la'] }) }),
      response({ type: 'local_shell_call', action: { type: 'exec', command: ['/bin/zsh', '-lc', 'git status'] } }),
      response({
        type: 'function_call',
        name: 'apply_patch',
        arguments: JSON.stringify({
          input: '*** Begin Patch\n*** Update File: src/a.ts\n*** Add File: /abs/b.ts\n*** End Patch',
        }),
      }),
      response({ type: 'function_call', name: 'spawn_agent', arguments: JSON.stringify({ task_name: 'review' }) }),
      response({
        type: 'function_call',
        name: 'request_user_input_async',
        arguments: JSON.stringify({ questions: [{ title: 'Push now?', options: ['Yes', 'No'] }] }),
      }),
      response({ type: 'function_call', namespace: 'mcp__docs__', name: 'search', arguments: '{}' }),
      response({ type: 'function_call', name: 'update_plan', arguments: '{}' }),
      response({ type: 'function_call_output', call_id: 'c1', output: 'ok' }),
      { type: 'compacted', payload: { message: '' } },
      message('assistant', 'Fixed.'),
      completed('t1'),
    ),
  )
  const conversation = (await readRollout(path, '/repo', undefined))?.conversation.split('\n')

  assert.deepEqual(conversation, [
    'Person: Ship the fix',
    'Agent: On it.',
    'Agent ran: npm test',
    'Agent ran: ls -la',
    'Agent ran: git status',
    'Agent edited /repo/src/a.ts',
    'Agent edited /abs/b.ts',
    'Agent started agent: review',
    `Agent asked the user in a dialog: "Push now?" (options: Yes / No); still open, waiting on the user's answer`,
    'Agent called docs__search',
    'Agent: Fixed.',
  ])
})

test('a rollout over the size limit keeps its newest turns and drops the cut line', async () => {
  const filler = 'x'.repeat(1024 * 1024)
  const old = Array.from({ length: 10 }, (_, n) => message('user', `Old ${n} ${filler}`))
  const path = rolloutOf(rows(started('t1'), ...old, started('t2'), message('user', 'Newest question')))
  const rollout = await readRollout(path, '/repo', undefined)

  assert.ok(rollout?.conversation.endsWith('Person: Newest question'))
  assert.ok((rollout?.conversation.match(/Person: Old/g)?.length ?? 0) < 10)
})

test('a rollout that cannot be read gives nothing', async () => {
  assert.equal(await readRollout(null, '/repo', undefined), null)
  assert.equal(await readRollout(join(tempDir(), 'missing.jsonl'), '/repo', undefined), null)
})

test('rolloutFor finds a chat’s newest rollout by its thread id and reads its folder', async () => {
  const home = tempDir()
  rolloutAt(home, 'chat-1', { cwd: '/old' }, { day: '2026/09/30' })
  const newest = rolloutAt(home, 'chat-1', { cwd: '/repo' }, { day: '2026/10/20' })
  rolloutAt(home, 'chat-2', {}, { day: '2026/10/21' })

  assert.deepEqual(await rolloutFor(home, 'chat-1'), { path: newest, cwd: '/repo' })
  const reverted = rolloutAt(home, 'chat-1', { cwd: '/reverted' }, { day: '2026/10/22', rolloutId: 'rollout-2' })
  assert.deepEqual(await rolloutFor(home, 'chat-1'), { path: reverted, cwd: '/reverted' })
  assert.equal(await rolloutFor(home, 'chat-3'), null)
  assert.equal(await rolloutFor(join(home, 'missing'), 'chat-1'), null)
  assert.equal(await rolloutFor(home, ''), null)
})

test('rolloutFor skips a compressed rollout, a subagent’s and a codex exec run’s', async () => {
  const home = tempDir()
  rolloutAt(home, 'packed', {}, { ext: 'jsonl.zst' })
  rolloutAt(home, 'sub', { parent_thread_id: 'chat-1' })
  rolloutAt(home, 'exec', { originator: 'codex_exec', source: 'exec' })

  for (const id of ['packed', 'sub', 'exec']) assert.equal(await rolloutFor(home, id), null)
})
