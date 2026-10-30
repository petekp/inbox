import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { addAgentItem } from '../../hooks/ledger'
import { applied, parsedReply } from '../../hooks/session'
import { handleHook } from '../src/hook'
import { readState, updateState } from '../src/state'
import { hookDeps, input, tempDir } from './helpers'

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
