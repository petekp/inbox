import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { STATUS_REFRESH_MS } from '../../hooks/session-status'
import { handleHook } from '../src/hook'
import type { HookInput } from '../src/hook'
import { readState } from '../src/state'
import { hookDeps, input, tempDir } from './helpers'

const started = { type: 'event_msg', payload: { type: 'task_started', turn_id: 't1' } }

const commandRow = (command: string, status?: string) => ({
  type: 'event_msg',
  payload: {
    type: 'item_completed',
    turn_id: 't1',
    item: {
      type: 'CommandExecution',
      id: `exec-${command}`,
      command: ['/bin/zsh', '-lc', command],
      aggregated_output: '',
      exit_code: status === 'declined' ? null : 0,
      source: 'unified_exec_startup',
      status,
    },
  },
})

const patchRow = (path: string, status: string) => ({
  type: 'event_msg',
  payload: {
    type: 'item_completed',
    turn_id: 't1',
    item: { type: 'FileChange', id: 'exec-patch', changes: { [path]: { type: 'add' } }, status },
  },
})

const scriptOutput = (text: string) => ({
  type: 'response_item',
  payload: { type: 'custom_tool_call_output', call_id: 'c1', output: [{ type: 'input_text', text }] },
})

const shellCall = (callId: string, command: string) => ({
  type: 'response_item',
  payload: { type: 'function_call', name: 'shell_command', call_id: callId, arguments: JSON.stringify({ command }) },
})

const callOutput = (callId: string, output: string) => ({
  type: 'response_item',
  payload: { type: 'function_call_output', call_id: callId, output },
})

function rollout(rows: unknown[]): string {
  const path = join(tempDir(), 'rollout.jsonl')
  writeFileSync(path, rows.map(row => JSON.stringify(row)).join('\n'))

  return path
}

const bash = (transcript: string, command: string): HookInput =>
  input('PreToolUse', { tool_name: 'Bash', tool_input: { command }, transcript_path: transcript, turn_id: 't1' })

async function endedActivity(transcript: string, calls: HookInput[], dir = tempDir()): Promise<string[]> {
  const deps = hookDeps(dir)
  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it', turn_id: 't1', transcript_path: transcript }), deps)
  for (const call of calls) await handleHook(call, deps)
  await handleHook(input('Stop', { turn_id: 't1', transcript_path: transcript, last_assistant_message: 'Done.' }), deps)

  return (await readState(dir, 's1')).pending[0]?.ex.activity ?? []
}

test('a command or patch the person declined leaves the ended turn activity', async () => {
  const transcript = rollout([
    started,
    commandRow('npm test', 'declined'),
    patchRow('/work/app/a.txt', 'declined'),
    commandRow('ls', 'completed'),
  ])
  const patch = '*** Begin Patch\n*** Add File: a.txt\n+a\n*** End Patch'
  const activity = await endedActivity(transcript, [
    bash(transcript, 'npm test'),
    input('PreToolUse', {
      tool_name: 'apply_patch',
      tool_input: { command: patch },
      cwd: '/work/app',
      transcript_path: transcript,
    }),
    bash(transcript, 'ls'),
  ])

  assert.deepEqual(activity, ['ran: ls'])
})

test('a call a PreToolUse hook blocked leaves the ended turn activity, in code mode and as a direct call', async () => {
  const transcript = rollout([
    started,
    scriptOutput('Script error: Command blocked by PreToolUse hook: pushes wait for review. Command: git push'),
    shellCall('c2', 'rm -rf build'),
    callOutput('c2', 'Command blocked by PreToolUse hook: no deletes. Command: rm -rf build'),
    scriptOutput('Script error: Tool call blocked by PreToolUse hook: read only. Tool: mcp__linear__save_issue'),
  ])
  const activity = await endedActivity(transcript, [
    bash(transcript, 'git push'),
    bash(transcript, 'rm -rf build'),
    input('PreToolUse', { tool_name: 'mcp__linear__save_issue', transcript_path: transcript, turn_id: 't1' }),
    bash(transcript, 'git status'),
  ])

  assert.deepEqual(activity, ['ran: git status'])
})

test('a command still running when the turn ends, or that ran once and was declined once, keeps its line', async () => {
  const transcript = rollout([started, commandRow('npm test', 'declined'), commandRow('npm test', 'completed')])
  const activity = await endedActivity(transcript, [bash(transcript, 'npm run dev'), bash(transcript, 'npm test')])

  assert.deepEqual(activity, ['ran: npm run dev', 'ran: npm test'])
})

test('a call that ran keeps its line when its output quotes a block message, and so does a row with no status', async () => {
  const quote = 'Command blocked by PreToolUse hook: pushes wait for review. Command: git push'
  const transcript = rollout([
    started,
    commandRow('npm test'),
    scriptOutput(`Script completed\n${quote}`),
    shellCall('c3', 'grep -r blocked docs'),
    callOutput('c3', `docs/hooks.md: ${quote}`),
  ])
  const activity = await endedActivity(transcript, [
    bash(transcript, 'git push'),
    bash(transcript, 'npm test'),
    bash(transcript, 'grep -r blocked docs'),
  ])

  assert.deepEqual(activity, ['ran: git push', 'ran: npm test', 'ran: grep -r blocked docs'])
})

test('a declined command leaves the activity before a Status call during the turn reads it', async () => {
  const dir = tempDir()
  let clock = 1000
  const deps = hookDeps(dir, () => clock)
  const transcript = rollout([started, commandRow('git push', 'declined')])
  await handleHook(input('UserPromptSubmit', { prompt: 'Ship it', turn_id: 't1', transcript_path: transcript }), deps)
  await handleHook(bash(transcript, 'git push'), deps)
  clock = 1000 + STATUS_REFRESH_MS
  await handleHook(bash(transcript, 'git status'), deps)

  assert.deepEqual(deps.refreshes, ['s1'])
  assert.deepEqual((await readState(dir, 's1')).turn.activity, ['ran: git status'])
})
