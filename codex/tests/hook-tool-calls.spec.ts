import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { addAgentItem } from '../../hooks/ledger-update'
import { STATUS_REFRESH_MS } from '../../hooks/session-status'
import { handleHook } from '../src/hook'
import type { HookInput } from '../src/hook'
import { codexStore, herdrOnWrite } from '../src/host'
import { readState, statePath, updateState } from '../src/state'
import type { SessionState } from '../src/state'
import { fakeRunner, hookDeps, input, tempDir } from './helpers'
import { reportedLabels, reportedTokens } from '../../tests/session-script'

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

test('a subagent is named by the task name in its own rollout, and never by the default role', async () => {
  const dir = tempDir()
  const deps = hookDeps(dir)
  const rollout = (agentPath?: string) => {
    const path = join(tempDir(), 'rollout.jsonl')
    writeFileSync(path, `${JSON.stringify({ type: 'session_meta', payload: { agent_path: agentPath } })}\n`)
    return path
  }

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  const named = { agent_id: 'a', agent_type: 'default', transcript_path: rollout('/root/fix_login_test') }
  await handleHook(input('SubagentStart', named), deps)
  await handleHook(input('SubagentStart', { agent_id: 'b', agent_type: 'default', transcript_path: rollout() }), deps)
  const names = ((await readState(dir, 's1')).ledger.overview?.children ?? []).map(c => c.name)

  assert.deepEqual(names, ['fix login test', 'subagent'])
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
  const [firstSeq, secondSeq] = herdr.calls.map(args => Number(args[args.indexOf('--seq') + 1]))
  assert.ok(firstSeq! < secondSeq!)
})

test('a Herdr report that fails to send is sent again at the next write, and saved only once Herdr takes it', async () => {
  const dir = tempDir()
  let isHerdrUp = false
  const herdr = fakeRunner(() =>
    isHerdrUp ? { code: 0, stdout: '', stderr: '' } : { code: 1, stdout: '', stderr: 'no server' },
  )
  let at = 100
  const deps = { ...hookDeps(dir), onWrite: herdrOnWrite({ HERDR_PANE_ID: 'p1' }, herdr.exec, dir, () => ++at) }

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  assert.equal(herdr.calls.length, 1)
  assert.equal((await readState(dir, 's1')).herdrReport, undefined)

  isHerdrUp = true
  await handleHook(input('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } }), deps)
  assert.equal(herdr.calls.length, 2)
  assert.deepEqual(reportedTokens(herdr.calls[1]!), reportedTokens(herdr.calls[0]!))
  assert.ok((await readState(dir, 's1')).herdrReport)
})

const HERDR_ENV = { HERDR_PANE_ID: 'p1' }

const addAsk = (text: string) => (s: SessionState) => ({
  ...s,
  ledger: addAgentItem(s.ledger, { kind: 'question', ask: text, options: [], rec: null, helps: [] }, 1000).ledger,
})

function herdrThatOrdersBySeq() {
  let lastSeq = -Infinity
  let shown: Record<string, string | null> = {}
  const herdr = fakeRunner(args => {
    const seq = Number(args[args.indexOf('--seq') + 1])
    if (seq > lastSeq) {
      lastSeq = seq
      shown = reportedTokens(args)
    }
    return { code: 0, stdout: '', stderr: '' }
  })

  return { ...herdr, shown: () => shown }
}

test('of two writes from separate processes, Herdr shows the later state, and the report that runs last sends nothing new', async () => {
  const dir = tempDir()
  const herdr = herdrThatOrdersBySeq()
  let at = 100
  const now = () => ++at
  let release = () => {}
  const held = new Promise<void>(resolve => (release = resolve))
  let markWritten = () => {}
  const written = new Promise<void>(resolve => (markWritten = resolve))
  const reportFirst = herdrOnWrite(HERDR_ENV, herdr.exec, dir, now)!
  const first = codexStore(dir, 's1', now, async s => {
    markWritten()
    await held
    await reportFirst(s)
  })
  const second = codexStore(dir, 's1', now, herdrOnWrite(HERDR_ENV, herdr.exec, dir, now))

  const firstWrite = first.update(addAsk('Ship it?'))
  await written
  await second.update(addAsk('Tag it?'))
  release()
  await firstWrite

  assert.equal(herdr.calls.length, 1)
  assert.equal(herdr.shown()['inbox-needs-you'], '2')
})

test('in a Herdr app terminal, each write publishes the session, and a change of counts or a start labels the terminal', async () => {
  const dir = tempDir()
  const appHome = tempDir()
  const herdr = fakeRunner(() => ({ code: 0, stdout: '', stderr: '' }))
  let at = 100
  const env = { HC_TERMINAL_ID: 't1', HERDR_APP_HOME: appHome, HOME: '/home/person' }
  const hookProcess = () => ({ ...hookDeps(dir), onWrite: herdrOnWrite(env, herdr.exec, dir, () => ++at) })
  const deps = hookProcess()
  const published = () => JSON.parse(readFileSync(join(appHome, 'inbox/sessions/s1.json'), 'utf8'))
  const toolUse = input('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } })

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  assert.deepEqual(herdr.calls[0]!.slice(0, 3), ['hc', 'label', 't1'])
  assert.equal(reportedLabels(herdr.calls[0]!)['inbox.session'], 's1')
  const started = published()
  assert.deepEqual(
    { format: started.format, host: started.host, agent: started.agent, terminal: started.terminal },
    { format: 1, host: 'codex', agent: 'Codex', terminal: 't1' },
  )

  await handleHook(toolUse, deps)
  assert.equal(herdr.calls.length, 1)
  assert.ok(published().writtenAt > started.writtenAt)

  await updateState(dir, 's1', addAsk('Ship it?'))
  await handleHook(toolUse, deps)
  assert.equal(herdr.calls.length, 2)
  assert.equal(reportedLabels(herdr.calls[1]!)['inbox.needs-you'], '1')
  assert.equal(published().session.ledger.items[0].ask, 'Ship it?')
  assert.deepEqual(readdirSync(join(appHome, 'inbox/sessions')), ['s1.json'])

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'resume' }), hookProcess())
  assert.equal(herdr.calls.length, 3)
  assert.equal(reportedLabels(herdr.calls[2]!)['inbox.session'], 's1')
})

test('an update that changes nothing reports a change the MCP server made, and Herdr shows it', async () => {
  const dir = tempDir()
  const herdr = herdrThatOrdersBySeq()
  let at = 100
  const now = () => ++at
  const store = () => codexStore(dir, 's1', now, herdrOnWrite(HERDR_ENV, herdr.exec, dir, now))

  await store().update(addAsk('Ship it?'))
  await updateState(dir, 's1', addAsk('Tag it?'))
  await store().update(s => s)

  assert.equal(herdr.calls.length, 2)
  assert.equal(herdr.shown()['inbox-needs-you'], '2')
})

test('outside Herdr, an update that changes nothing writes nothing', async () => {
  const dir = tempDir()
  const store = codexStore(
    dir,
    's1',
    () => 1000,
    herdrOnWrite({}, fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec, dir, () => 1000),
  )
  await store.update(addAsk('Ship it?'))
  const written = statSync(statePath(dir, 's1')).ino

  await store.update(s => s)

  assert.equal(statSync(statePath(dir, 's1')).ino, written)
  assert.equal((await readState(dir, 's1')).writtenAt, undefined)
})
