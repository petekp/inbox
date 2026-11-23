import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { tempDir } from './helpers'

const serverScript = fileURLToPath(new URL('../plugin/dist/server.mjs', import.meta.url))

function exitsAfterInputEnds(env: Record<string, string>, ms: number): Promise<boolean> {
  const server = spawn(process.execPath, [serverScript], { env, stdio: ['pipe', 'ignore', 'ignore'] })
  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }
  server.stdin.end(`${JSON.stringify(initialize)}\n`)
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      server.kill()
      resolve(false)
    }, ms)
    server.once('exit', () => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

test('the server exits once Codex closes its input, in a Herdr app terminal and outside one', async t => {
  const home = tempDir()
  t.after(() => rm(home, { recursive: true, force: true }))
  const [data, appHome, bin] = [join(home, 'data'), join(home, 'herdr-app'), join(home, 'bin')]
  for (const folder of [data, appHome, bin]) mkdirSync(folder, { recursive: true })
  const env = { HOME: home, PATH: bin, INBOX_DATA: data, XDG_STATE_HOME: join(home, 'state') }

  assert.equal(await exitsAfterInputEnds(env, 10_000), true)
  assert.equal(await exitsAfterInputEnds({ ...env, HC_TERMINAL_ID: 't1', HERDR_APP_HOME: appHome }, 10_000), true)
})
