import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { handleHook } from '../src/hook'
import { codexStore, herdrOnWrite } from '../src/host'
import { herdrTerminal } from '../src/herdr-terminal'
import { hookDeps, input, tempDir } from './helpers'

const quiet = () => undefined

function publishOther(appHome: string, sessionId: string, host: string, terminal: string) {
  mkdirSync(join(appHome, 'inbox/sessions'), { recursive: true })
  mkdirSync(join(appHome, 'inbox/presses', sessionId), { recursive: true })
  writeFileSync(join(appHome, 'inbox/sessions', `${sessionId}.json`), JSON.stringify({ format: 1, host, terminal }))
}

test("a Codex start in a Herdr terminal removes the files of the Codex sessions that ran there, and a session's end removes its own", async () => {
  const dir = tempDir()
  const appHome = tempDir()
  const env = { HC_TERMINAL_ID: 't1', HERDR_APP_HOME: appHome, HOME: '/home/person', CODEX_CLI_PATH: '/apps/codex' }
  const run = async () => ({ code: 1, stdout: '', stderr: 'no hc' })
  const onWrite = herdrOnWrite(env, run, dir, () => 1000, quiet)
  const deps = { ...hookDeps(dir), env, run, onWrite, herdrTerminal: herdrTerminal(env, run, dir, null, quiet) }
  const published = (id: string) => existsSync(join(appHome, 'inbox/sessions', `${id}.json`))
  const pressFolder = (id: string) => existsSync(join(appHome, 'inbox/presses', id))
  const lateWrite = (id: string) => codexStore(dir, id, () => 2000, onWrite).update(async s => s)
  publishOther(appHome, 'ended', 'codex', 't1')
  publishOther(appHome, 'elsewhere', 'codex', 't2')
  publishOther(appHome, 'claude', 'claude-code', 't1')

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'startup' }), deps)
  assert.deepEqual(
    ['s1', 'ended', 'elsewhere', 'claude'].map(id => [id, published(id), pressFolder(id)]),
    [
      ['s1', true, false],
      ['ended', false, false],
      ['elsewhere', true, true],
      ['claude', true, true],
    ],
  )

  await lateWrite('ended')
  assert.equal(published('ended'), false)

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'resume' }), deps)
  assert.equal(published('s1'), true)

  await handleHook(input('SessionEnd', { cwd: '/repo' }), deps)
  assert.equal(published('s1'), false)
  await lateWrite('s1')
  assert.equal(published('s1'), false)
  assert.deepEqual([published('elsewhere'), published('claude')], [true, true])

  await handleHook(input('SessionStart', { cwd: '/repo', source: 'resume' }), deps)
  assert.equal(published('s1'), true)
})

test("a session's end in a terminal another session took leaves that session's file", async () => {
  const dir = tempDir()
  const appHome = tempDir()
  const env = { HC_TERMINAL_ID: 't1', HERDR_APP_HOME: appHome, HOME: '/home/person' }
  const run = async () => ({ code: 1, stdout: '', stderr: 'no hc' })
  const terminal = herdrTerminal(env, run, dir, null, quiet)
  assert.ok(terminal)
  await terminal.start('first')
  await terminal.start('second')
  publishOther(appHome, 'second', 'codex', 't1')

  await terminal.end('first')
  assert.equal(existsSync(join(appHome, 'inbox/sessions/second.json')), true)
})

function terminalWorld() {
  const dir = tempDir()
  const appHome = tempDir()
  const env = { HC_TERMINAL_ID: 't1', HERDR_APP_HOME: appHome, HOME: '/home/person' }
  const run = async () => ({ code: 1, stdout: '', stderr: 'no hc' })
  const onWrite = herdrOnWrite(env, run, dir, () => 1000, quiet)
  const at = (pid: number | null) => {
    const terminal = herdrTerminal(env, run, dir, pid, quiet)
    assert.ok(terminal)
    return terminal
  }
  const published = (id: string) => existsSync(join(appHome, 'inbox/sessions', `${id}.json`))
  const write = async (id: string) => {
    await codexStore(dir, id, () => 2000, onWrite).update(async s => s)
    return published(id)
  }

  return { appHome, at, published, write }
}

test('a Codex whose hooks do not run publishes once the session that held its terminal has left', async () => {
  const { at, write } = terminalWorld()
  const deadPid = spawnSync('true').pid
  assert.ok(deadPid)

  await at(process.pid).start('running')
  assert.equal(await write('unhooked'), false)

  await at(process.pid).end('running')
  assert.equal(await write('unhooked'), true)
  assert.equal(await write('running'), false)

  await at(deadPid).start('crashed')
  assert.equal(await write('unhooked'), true)
})

test('with no claim saved, a session publishes, and its end removes its file only when it published from this terminal', async () => {
  const { appHome, at, published, write } = terminalWorld()
  publishOther(appHome, 'away', 'codex', 't2')
  assert.equal(await write('before'), true)

  await at(null).end('away')
  await at(null).end('before')
  assert.deepEqual([published('away'), published('before')], [true, false])
})
