import assert from 'node:assert/strict'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

import { readState, updateState } from '../src/state'
import { codexAsk, recordModelFailure, runUpdates as runBothCalls } from '../src/update'
import { findCli } from '../src/cli'
import { run } from '../src/run'
import { STATUS_SYSTEM } from '../../hooks/model-text'
import { fakeRunner, tempDir } from './helpers'
import { ex, LEDGER_ANSWER } from './update-fixtures'

test('an update for a session with no saved CLI runs the CLI its environment names, else the codex on PATH', async () => {
  const { exec } = fakeRunner(() => ({ code: 0, stdout: 'node\n', stderr: '' }))

  assert.equal(await findCli({ CODEX_APP_RUNTIME_CLI_PATH: '/app/codex' }, exec, 1), '/app/codex')
  assert.equal(
    await findCli({ CODEX_CLI_PATH: '/person/codex', CODEX_APP_RUNTIME_CLI_PATH: '/app/codex' }, exec, 1),
    '/person/codex',
  )
  assert.equal(await findCli({}, exec, 1), 'codex')
})

test('a failed update saves the CLI it ran, its exit code and the end of its stderr beside the failed state', async t => {
  const dir = tempDir()
  const personHome = tempDir()
  t.after(() => Promise.all([dir, personHome].map(d => rm(d, { recursive: true, force: true }))))
  await updateState(dir, 's1', s => ({ ...s, pending: [{ ex: ex(1, 'Should I deploy?'), turnsStarted: 1 }] }))
  const error = 'ERROR: {"status":400,"error":{"code":"model_not_found"}}\n'
  const stderr = `${'session header and prompt\n'.repeat(500)}${error}`
  const { exec } = fakeRunner(() => ({ code: 1, stdout: '', stderr }))

  await runBothCalls(
    dir,
    's1',
    codexAsk(
      exec,
      '/old/codex',
      dir,
      personHome,
      recordModelFailure(dir, 's1', () => 7),
    ),
    () => 7,
  )

  const s = await readState(dir, 's1')
  assert.equal(s.presence.ledgerState, 'failed')
  assert.equal(s.lastModelFailure?.cli, '/old/codex')
  assert.equal(s.lastModelFailure?.code, 1)
  assert.equal(s.lastModelFailure?.at, 7)
  assert.ok(s.lastModelFailure?.stderr.endsWith(error))
  assert.ok(s.lastModelFailure.stderr.length < stderr.length)
})

test('a reply with a NUL byte reaches codex on stdin, and both calls of its update apply', async t => {
  const dir = tempDir()
  const personHome = tempDir()
  const bin = tempDir()
  t.after(() => Promise.all([dir, personHome, bin].map(d => rm(d, { recursive: true, force: true }))))
  const reply = 'Pasted \0 from a file. Should I deploy?'
  await updateState(dir, 's1', s => ({ ...s, pending: [{ ex: ex(1, reply), turnsStarted: 1 }] }))
  const cli = join(bin, 'codex')
  const prompts = join(bin, 'prompts.jsonl')
  const answers = join(bin, 'answers.json')
  writeFileSync(
    answers,
    JSON.stringify({ [STATUS_SYSTEM]: 'HEAD: Building the deploy script | Writing a script that deploys the app' }),
  )
  writeFileSync(
    cli,
    [
      `#!${process.execPath}`,
      `const fs = require('node:fs')`,
      `const args = process.argv.slice(2)`,
      `fs.appendFileSync(${JSON.stringify(prompts)}, JSON.stringify(fs.readFileSync(0, 'utf8')) + '\\n')`,
      `const system = args.find(a => a.startsWith('model_instructions_file=')).slice('model_instructions_file='.length)`,
      `const answer = JSON.parse(fs.readFileSync(${JSON.stringify(answers)}, 'utf8'))[fs.readFileSync(JSON.parse(system), 'utf8')]`,
      `fs.writeFileSync(args[args.indexOf('-o') + 1], answer ?? ${JSON.stringify(LEDGER_ANSWER)})`,
    ].join('\n'),
  )
  chmodSync(cli, 0o755)

  await runBothCalls(
    dir,
    's1',
    codexAsk(
      run,
      cli,
      dir,
      personHome,
      recordModelFailure(dir, 's1', () => 7),
    ),
    () => 7,
  )

  const s = await readState(dir, 's1')
  const received: string[] = readFileSync(prompts, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  assert.equal(s.presence.ledgerState, 'current')
  assert.deepEqual(
    s.ledger.items.map(i => i.ask),
    ['Deploy now?'],
  )
  assert.equal(s.ledger.overview?.head?.title, 'Building the deploy script')
  assert.equal(s.lastModelFailure, null)
  assert.equal(received.length, 2)
  assert.ok(received.every(prompt => prompt.includes(reply)))
})

test('an update whose codex command cannot start saves why as its failure beside the failed state', async t => {
  const dir = tempDir()
  const personHome = tempDir()
  t.after(() => Promise.all([dir, personHome].map(d => rm(d, { recursive: true, force: true }))))
  await updateState(dir, 's1', s => ({ ...s, pending: [{ ex: ex(1, 'Should I deploy?'), turnsStarted: 1 }] }))
  const cli = '/apps/co\0dex'

  await runBothCalls(
    dir,
    's1',
    codexAsk(
      run,
      cli,
      dir,
      personHome,
      recordModelFailure(dir, 's1', () => 7),
    ),
    () => 7,
  )

  const s = await readState(dir, 's1')
  assert.equal(s.presence.ledgerState, 'failed')
  assert.equal(s.lastModelFailure?.cli, cli)
  assert.equal(s.lastModelFailure?.code, -1)
  assert.match(s.lastModelFailure?.stderr ?? '', /null bytes/)
})
