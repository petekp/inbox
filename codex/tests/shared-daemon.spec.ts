import assert from 'node:assert/strict'
import { test } from 'node:test'

import { withoutSharedTerminal } from '../src/shared-daemon'
import { fakeRunner } from './helpers'

const processes = (table: Record<number, string>) =>
  fakeRunner(args => {
    const pid = Number(args[args.length - 1])

    return table[pid] ? { code: 0, stdout: `${table[pid]}\n`, stderr: '' } : { code: 1, stdout: '', stderr: '' }
  })

test('a thread under the daemon every Codex CLI shares reports to no terminal, and says why', async () => {
  const { exec } = processes({
    300: '200 /bin/sh -c node server.mjs',
    200: '100 /usr/local/bin/codex app-server --listen unix:// --analytics-default-enabled --managed-daemon',
    100: '50 codex',
    50: '1 -zsh',
  })
  const env: NodeJS.ProcessEnv = { HC_TERMINAL_ID: 't7', HERDR_APP_HOME: '/app' }
  const logged: string[] = []
  await withoutSharedTerminal(env, exec, 300, text => logged.push(text))

  assert.equal(env.HC_TERMINAL_ID, undefined)
  assert.equal(env.HERDR_APP_HOME, '/app')
  assert.match(logged.join('\n'), /t7 ignored/)
})

test('a Codex CLI that runs its own app server keeps its terminal', async () => {
  const { exec } = processes({
    300: '200 /bin/sh -c node server.mjs',
    200: '100 /usr/local/bin/codex app-server',
    100: '50 codex --no-daemon',
    50: '1 -zsh',
  })
  const env: NodeJS.ProcessEnv = { HC_TERMINAL_ID: 't7' }
  await withoutSharedTerminal(env, exec, 300, () => assert.fail('nothing to log'))

  assert.equal(env.HC_TERMINAL_ID, 't7')
})

test("the Codex app's own app server keeps its terminal", async () => {
  const { exec } = processes({
    300: '200 /bin/sh -c node server.mjs',
    200: '491 /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex -c features.code_mode_host=true app-server --analytics-default-enabled',
    491: '1 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT',
  })
  const env: NodeJS.ProcessEnv = { HC_TERMINAL_ID: 't7' }
  await withoutSharedTerminal(env, exec, 300, () => assert.fail('nothing to log'))

  assert.equal(env.HC_TERMINAL_ID, 't7')
})

test('a multiplexer pane under the shared daemon is dropped as well', async () => {
  const { exec } = processes({
    300: '200 /bin/sh -c node server.mjs',
    200: '100 codex app-server --listen unix:// --managed-daemon',
  })
  const env: NodeJS.ProcessEnv = { HERDR_PANE_ID: 'p1' }
  await withoutSharedTerminal(env, exec, 300, () => undefined)

  assert.equal(env.HERDR_PANE_ID, undefined)
})
