import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { addAgentItem } from '../../hooks/ledger-update'
import { STATUS_REFRESH_MS } from '../../hooks/session-status'
import { handleHook } from '../src/hook'
import type { HookInput } from '../src/hook'
import { herdrOnWrite } from '../src/host'
import { readState, updateState } from '../src/state'
import { fakeRunner, hookDeps, input, tempDir } from './helpers'
import { reportedTokens } from '../../tests/session-script'

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

test('the main agent’s tool call starts the Status call once the running turn is due one, and only once, and a subagent’s never does', async () => {
  const dir = tempDir()
  let clock = 1000
  const deps = hookDeps(dir, () => clock)
  const bash = (command: string, fields: Partial<HookInput> = {}) =>
    input('PreToolUse', { tool_name: 'Bash', tool_input: { command }, ...fields })

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  await handleHook(input('UserPromptSubmit', { prompt: 'add caching', turn_id: 't1' }), deps)
  await handleHook(bash('ls'), deps)
  assert.deepEqual(deps.refreshes, [])
  clock = 1000 + STATUS_REFRESH_MS
  await handleHook(bash('npm test', { agent_id: 'sub1' }), deps)
  assert.deepEqual(deps.refreshes, [])
  await handleHook(bash('npm test'), deps)
  await handleHook(bash('npm run build'), deps)
  assert.deepEqual(deps.refreshes, ['s1'])
  assert.equal((await readState(dir, 's1')).lastOverviewCallAt, 1000 + STATUS_REFRESH_MS)
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
