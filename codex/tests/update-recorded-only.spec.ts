import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chmod, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { RECORDED_ITEMS_ONLY } from '../../hooks/session-host'
import { readState, updateState } from '../src/state'
import type { SessionState } from '../src/state'
import { tempDir } from './helpers'
import { ex, LEDGER_ANSWER } from './update-fixtures'

for (const [value, asks] of [
  ['1', []],
  ['true', []],
  ['TRUE', ['Deploy now?']],
  ['0', ['Deploy now?']],
  ['false', ['Deploy now?']],
  [undefined, ['Deploy now?']],
] as const) {
  test(`the update process reads ${RECORDED_ITEMS_ONLY}=${value ?? 'unset'}`, async t => {
    const dir = tempDir()
    t.after(() => rm(dir, { recursive: true, force: true }))

    const cli = join(dir, 'codex')
    await writeFile(
      cli,
      `#!/usr/bin/env node
const fs = require('node:fs')
const output = process.argv.indexOf('-o')
if (output < 0) process.exit(2)
fs.writeFileSync(process.argv[output + 1], ${JSON.stringify(LEDGER_ANSWER)})
`,
    )
    await chmod(cli, 0o755)
    await updateState(dir, 's1', s => ({
      ...s,
      cliPath: cli,
      pending: [{ ex: ex(1, 'Should I deploy?'), turnsStarted: 1 }],
    }))

    const env = {
      CODEX_HOME: join(dir, 'codex-home'),
      INBOX_DATA: dir,
      PATH: process.env.PATH ?? '',
      ...(value === undefined ? {} : { [RECORDED_ITEMS_ONLY]: value }),
    }
    const update = fileURLToPath(new URL('../plugin/dist/update.mjs', import.meta.url))
    const child = spawn(process.execPath, [update, 's1'], { env, stdio: 'ignore' })
    const [code] = await once(child, 'exit')
    assert.equal(code, 0)

    const s = await readState(dir, 's1')
    assert.deepEqual(s.pending, [])
    assert.deepEqual(
      s.ledger.items.map(i => i.ask),
      asks,
    )
  })
}

test('recorded-only keeps legacy asks open without an answer, keeps TODOs, drops NEW asks, and closes on an answer', async t => {
  const dir = tempDir()
  t.after(() => rm(dir, { recursive: true, force: true }))

  const cli = join(dir, 'codex')
  const reply = join(dir, 'reply.txt')
  await writeFile(
    cli,
    `#!/usr/bin/env node
const fs = require('node:fs')
const output = process.argv.indexOf('-o')
if (output < 0) process.exit(2)
fs.copyFileSync(${JSON.stringify(reply)}, process.argv[output + 1])
`,
  )
  await chmod(cli, 0o755)
  await writeFile(
    reply,
    [
      'CLOSED: i1 | No longer applies: scope changed in this reply',
      'NEW: decide | - | Should we add another theme? | Light / dark | dark',
      'TODO: add a dark theme',
    ].join('\n'),
  )
  const legacy = {
    id: 'i1',
    kind: 'question',
    ask: 'Keep the current threshold?',
    label: null,
    options: ['Keep 5 and 15 USD', 'Keep all four'],
    rec: 'Keep 5 and 15 USD',
    helps: [],
    turn: 0,
    at: null,
  } as unknown as SessionState['ledger']['items'][number]
  await updateState(dir, 's1', s => ({
    ...s,
    cliPath: cli,
    ledger: { ...s.ledger, items: [legacy], nextId: 2 },
    pending: [{ ex: ex(1, 'I will review the current threshold.'), turnsStarted: 1 }],
  }))

  const env = {
    CODEX_HOME: join(dir, 'codex-home'),
    INBOX_DATA: dir,
    INBOX_RECORDED_ITEMS_ONLY: '1',
    PATH: process.env.PATH ?? '',
  }
  const update = fileURLToPath(new URL('../plugin/dist/update.mjs', import.meta.url))
  const run = async () => {
    const child = spawn(process.execPath, [update, 's1'], { env, stdio: 'ignore' })
    const [code] = await once(child, 'exit')
    assert.equal(code, 0)
  }

  await run()

  const afterUnansweredClose = await readState(dir, 's1')
  assert.deepEqual(
    afterUnansweredClose.ledger.items.map(i => i.ask),
    ['Keep the current threshold?', 'Ready to start on add a dark theme?'],
  )
  assert.equal(afterUnansweredClose.ledger.items[0]?.from, 'update')
  assert.deepEqual(afterUnansweredClose.ledger.closed, [])

  await writeFile(reply, 'CLOSED: i1 | Keep the current threshold')
  await updateState(dir, 's1', s => ({
    ...s,
    pending: [{ ex: ex(2, 'Keep the current threshold.'), turnsStarted: 2 }],
  }))
  await run()

  const afterAnswer = await readState(dir, 's1')
  assert.deepEqual(
    afterAnswer.ledger.items.map(i => i.id),
    ['i2'],
  )
  assert.deepEqual(
    afterAnswer.ledger.closed.map(c => [c.id, c.outcome]),
    [['i1', 'Keep the current threshold']],
  )
})
