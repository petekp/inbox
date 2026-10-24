import assert from 'node:assert/strict'
import { chmodSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { listHooksTrust, trustOfHooks } from '../src/hook-trust'
import { tempDir } from './helpers'

test('the inbox’s hooks read modified when any changed, untrusted when any was never trusted, and trusted when all are', () => {
  const hook = (pluginId: string | null, trustStatus: string) => ({ pluginId, trustStatus })

  assert.equal(trustOfHooks([hook('inbox@inbox', 'trusted'), hook('inbox@inbox', 'trusted')]), 'trusted')
  assert.equal(trustOfHooks([hook('inbox@inbox', 'trusted'), hook('inbox@inbox', 'untrusted')]), 'untrusted')
  assert.equal(trustOfHooks([hook('inbox@inbox', 'untrusted'), hook('inbox@inbox', 'modified')]), 'modified')
  assert.equal(trustOfHooks([hook('inbox@mine', 'modified')]), 'modified')
  assert.equal(trustOfHooks([hook('other@inbox', 'modified'), hook(null, 'untrusted')]), null)
  assert.equal(trustOfHooks([]), null)
})

test('listHooksTrust answers for the chat’s folder after an update deleted the folder the MCP server runs in', async () => {
  const cli = join(tempDir(), 'codex')
  writeFileSync(
    cli,
    [
      `#!${process.execPath}`,
      `process.cwd()`,
      `const rl = require('node:readline').createInterface({ input: process.stdin })`,
      `rl.on('line', line => {`,
      `  const m = JSON.parse(line)`,
      `  if (m.id === 1) console.log(JSON.stringify({ id: 1, result: {} }))`,
      `  if (m.id === 2) {`,
      `    const status = m.params.cwds[0] === '/repo' ? 'modified' : 'trusted'`,
      `    console.log(JSON.stringify({ id: 2, result: { data: [{ hooks: [{ pluginId: 'inbox@inbox', trustStatus: status }] }] } }))`,
      `  }`,
      `})`,
    ].join('\n'),
  )
  chmodSync(cli, 0o755)
  const before = process.cwd()
  const gone = tempDir()
  process.chdir(gone)
  rmSync(gone, { recursive: true })
  try {
    assert.equal(await listHooksTrust(cli, '/repo'), 'modified')
  } finally {
    process.chdir(before)
  }
})
