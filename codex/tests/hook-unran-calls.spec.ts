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

const script = (callId: string, input: string) => ({
  type: 'response_item',
  payload: { type: 'custom_tool_call', name: 'exec', call_id: callId, input },
})

const scriptCall = (callId: string, command: string) =>
  script(callId, `text(await tools.exec_command({cmd:${JSON.stringify(command)}}));\n`)

const scriptOutput = (text: string, callId = 'c1') => {
  const [status, ...printed] = text.split('\n')
  const isFailed = status?.startsWith('Script error:') === true
  const header = `${isFailed ? 'Script failed' : status}\nWall time 0.0 seconds\nOutput:\n`
  const parts = isFailed ? [text] : printed

  return {
    type: 'response_item',
    payload: {
      type: 'custom_tool_call_output',
      call_id: callId,
      output: [header, ...parts].map(part => ({ type: 'input_text', text: part })),
    },
  }
}

const SCRIPT_DECLINED =
  'Script error: \nexec_command failed: CreateProcess { message: "Rejected(\\"rejected by user\\")" }'

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
    script('c1', 'await tools.exec_command({cmd:"git status"});\nawait tools.exec_command({cmd:"git push"});\n'),
    scriptOutput('Script error: Command blocked by PreToolUse hook: pushes wait for review. Command: git push'),
    shellCall('c2', 'rm -rf build'),
    callOutput('c2', 'Command blocked by PreToolUse hook: no deletes. Command: rm -rf build'),
    scriptOutput('Script error: Tool call blocked by PreToolUse hook: read only. Tool: mcp__linear__save_issue'),
  ])
  const activity = await endedActivity(transcript, [
    bash(transcript, 'git status'),
    bash(transcript, 'git push'),
    bash(transcript, 'rm -rf build'),
    input('PreToolUse', { tool_name: 'mcp__linear__save_issue', transcript_path: transcript, turn_id: 't1' }),
  ])

  assert.deepEqual(activity, ['ran: git status'])
})

const twoCommands = (first: string, second: string) =>
  `await tools.exec_command({cmd:${JSON.stringify(first)}});\nawait tools.exec_command({cmd:${JSON.stringify(second)}});\n`

test('a declined script takes back the line of its one command with no row and keeps the lines of those that ran', async () => {
  const transcript = rollout([
    started,
    script('c1', twoCommands('git status', 'git push')),
    commandRow('git status', 'completed'),
    scriptOutput(SCRIPT_DECLINED, 'c1'),
  ])
  const activity = await endedActivity(transcript, [bash(transcript, 'git status'), bash(transcript, 'git push')])

  assert.deepEqual(activity, ['ran: git status'])
})

test('a declined script keeps every line when more than one command could be the declined one', async () => {
  const transcript = rollout([
    started,
    script('c1', twoCommands('npm run dev', 'git push')),
    scriptOutput(SCRIPT_DECLINED, 'c1'),
    script(
      'c2',
      'const c = "npm test";\nawait tools.exec_command({cmd:"npm ci"});\nawait tools.exec_command({cmd: c});\n',
    ),
    commandRow('npm test', 'completed'),
    scriptOutput(SCRIPT_DECLINED, 'c2'),
    script('c4', twoCommands('npm run build', 'gh pr create')),
    shellCall('c5', 'ls'),
    commandRow('npm run build', 'completed'),
    callOutput('c5', ''),
    scriptOutput(SCRIPT_DECLINED, 'c4'),
  ])
  const commands = ['npm run dev', 'git push', 'npm ci', 'npm test', 'gh pr create', 'npm run build']
  const activity = await endedActivity(
    transcript,
    commands.map(command => bash(transcript, command)),
  )

  assert.deepEqual(
    activity,
    commands.map(command => `ran: ${command}`),
  )
})

test('a command the person declined inside a code-mode script leaves the ended turn activity', async () => {
  const transcript = rollout([
    started,
    scriptCall('c1', 'git push'),
    scriptOutput(SCRIPT_DECLINED, 'c1'),
    scriptCall('c2', 'npm test'),
    scriptOutput(`Script completed\n${SCRIPT_DECLINED}`, 'c2'),
  ])
  const activity = await endedActivity(transcript, [bash(transcript, 'git push'), bash(transcript, 'npm test')])

  assert.deepEqual(activity, ['ran: npm test'])
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

const delegateRows = async (dir: string) =>
  ((await readState(dir, 's1')).ledger.overview?.children ?? []).map(c => [c.name, c.endedAt === null, c.delegateState])

test('a herdr command the person declined, in code mode too, or a hook blocked leaves no delegate row, and one that ran keeps its row', async () => {
  const dir = tempDir()
  const transcript = rollout([
    started,
    commandRow('herdr agent start alpha --cmd codex', 'declined'),
    shellCall('c2', 'herdr agent start beta --cmd codex'),
    callOutput('c2', 'Command blocked by PreToolUse hook: no agents. Command: herdr agent start beta --cmd codex'),
    commandRow('herdr agent start gamma --cmd codex', 'completed'),
    scriptCall('c3', 'herdr agent start kappa --cmd codex'),
    scriptOutput(SCRIPT_DECLINED, 'c3'),
  ])
  await endedActivity(
    transcript,
    [
      bash(transcript, 'herdr agent start alpha --cmd codex'),
      bash(transcript, 'herdr agent start beta --cmd codex'),
      bash(transcript, 'herdr agent start kappa --cmd codex'),
      bash(transcript, 'herdr agent start gamma --cmd codex'),
    ],
    dir,
  )

  assert.deepEqual(await delegateRows(dir), [['gamma', true, null]])
})

test('a delegate row stays when another call names its agent and ran or still runs, and a declined prompt restores it', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  const turn = async (id: string, rows: unknown[], commands: string[]) => {
    const transcript = rollout([{ type: 'event_msg', payload: { type: 'task_started', turn_id: id } }, ...rows])
    await handleHook(input('UserPromptSubmit', { prompt: 'Go', turn_id: id, transcript_path: transcript }), deps)
    for (const command of commands)
      await handleHook(input('PreToolUse', { tool_name: 'Bash', tool_input: { command }, turn_id: id }), deps)
    await handleHook(input('Stop', { turn_id: id, transcript_path: transcript, last_assistant_message: 'Ok.' }), deps)
  }
  await turn(
    't1',
    [
      commandRow('herdr agent start delta', 'declined'),
      commandRow('herdr agent start delta --cmd codex', 'completed'),
      commandRow('herdr agent wait delta', 'completed'),
      commandRow('herdr agent prompt omega "go"', 'declined'),
      shellCall('c4', 'herdr agent prompt omega "check"'),
    ],
    [
      'herdr agent start delta',
      'herdr agent start delta --cmd codex',
      'herdr agent wait delta',
      'herdr agent prompt omega "go"',
      'herdr agent prompt omega "check"',
    ],
  )
  await turn('t2', [commandRow('herdr agent prompt delta "again"', 'declined')], ['herdr agent prompt delta "again"'])

  assert.deepEqual(await delegateRows(dir), [
    ['delta', false, null],
    ['omega', true, 'working'],
  ])
})
