import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

import type { RegistryEntry } from '../../core/runtime/session-registry'
import { registryOnWrite } from '../src/registry'
import { readState, updateState } from '../src/state'
import { tempDir } from './helpers'

const endedPid = (): number => {
  const pid = spawnSync(process.execPath, ['-e', '']).pid
  if (pid === undefined) throw new Error('the child process has no pid')
  return pid
}

const entryAt = async (path: string): Promise<RegistryEntry> =>
  JSON.parse(await readFile(path, 'utf8')) as RegistryEntry

test('a Codex state write saves the session registry entry for its owner only, and a process with no pid only updates an entry that exists', async () => {
  const dir = tempDir()
  const stateHome = tempDir()
  const env = { XDG_STATE_HOME: stateHome }
  const folder = join(stateHome, 'inbox', 'registry')
  const path = join(folder, 'codex-s1.json')
  await updateState(dir, 's1', s => ({ ...s, root: '/repo' }))
  const saved = await readState(dir, 's1')

  await registryOnWrite(env, dir, () => 500, null)?.(saved)
  await assert.rejects(stat(path))

  await registryOnWrite(env, dir, () => 1000, process.pid)?.(saved)
  const first = await entryAt(path)
  assert.deepEqual(
    { ...first, version: null },
    {
      format: 1,
      host: 'codex',
      sessionId: 's1',
      agent: 'Codex',
      projectFolder: '/repo',
      version: null,
      herdr: null,
      title: null,
      pid: process.pid,
      startedAt: 1000,
      isTurnRunning: false,
      counts: { needsYou: 0, findings: 0, prs: 0 },
      writtenAt: 1000,
    },
  )
  assert.equal((await stat(path)).mode & 0o777, 0o600)
  assert.equal((await stat(folder)).mode & 0o777, 0o700)

  await registryOnWrite(env, dir, () => 1500, process.pid)?.(saved)
  assert.equal((await entryAt(path)).writtenAt, 1000)

  await writeFile(path, JSON.stringify({ ...first, counts: { needsYou: 0, findings: 1, prs: 0 } }))
  await registryOnWrite(env, dir, () => 1700, process.pid)?.(saved)
  assert.deepEqual((await entryAt(path)).counts, { needsYou: 0, findings: 0, prs: 0 })

  const running = await updateState(dir, 's1', s => ({ ...s, presence: { ...s.presence, isTurnRunning: true } }))
  await registryOnWrite(env, dir, () => 2000, null)?.(running)
  const second = await entryAt(path)
  assert.equal(second.pid, process.pid)
  assert.equal(second.startedAt, 1000)
  assert.equal(second.writtenAt, 2000)
  assert.equal(second.isTurnRunning, true)
})

test("a registry write removes the Codex entries whose process ended, and keeps running ones, unreadable ones and other hosts' entries", async () => {
  const dir = tempDir()
  const stateHome = tempDir()
  const folder = join(stateHome, 'inbox', 'registry')
  const ended = endedPid()
  const entry = (pid: number) => JSON.stringify({ format: 1, pid, startedAt: 1 })
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'codex-ended.json'), entry(ended))
  await writeFile(join(folder, 'codex-running.json'), entry(process.pid))
  await writeFile(join(folder, 'codex-unreadable.json'), 'not json')
  await writeFile(join(folder, 'omp-ended.json'), entry(ended))
  await updateState(dir, 's2', s => s)

  await registryOnWrite({ XDG_STATE_HOME: stateHome }, dir, () => 1000, process.pid)?.(await readState(dir, 's2'))

  assert.deepEqual((await readdir(folder)).sort(), [
    'codex-running.json',
    'codex-s2.json',
    'codex-unreadable.json',
    'omp-ended.json',
  ])
})
