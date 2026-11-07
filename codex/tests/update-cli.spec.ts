import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { readState, updateState } from '../src/state'
import { codexAsk, runUpdates as runBothCalls } from '../src/update'
import { findCli } from '../src/cli'
import { run } from '../src/run'
import { TIMED_OUT_CODE } from '../../hooks/gh'
import { PARTS_STATUS_SYSTEM } from '../../hooks/status-prompt'
import type { CallReport } from '../../hooks/session-host'
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

test('the update process runs the CLI its session saved, else the one its environment names', async t => {
  const updateScript = fileURLToPath(new URL('../plugin/dist/update.mjs', import.meta.url))
  const failedCli = async (savedCli: string | null) => {
    const dir = tempDir()
    t.after(() => rm(dir, { recursive: true, force: true }))
    await updateState(dir, 's1', s => ({
      ...s,
      cliPath: savedCli,
      pending: [{ ex: ex(1, 'Should I deploy?'), turnsStarted: 1 }],
    }))
    execFileSync(process.execPath, [updateScript, 's1'], {
      env: { PATH: process.env.PATH, INBOX_DATA: dir, CODEX_HOME: dir, CODEX_CLI_PATH: '/missing/env/codex' },
    })

    return (await readState(dir, 's1')).callFailures.ledger.lastFailure?.process?.cli
  }

  assert.equal(await failedCli('/missing/saved/codex'), '/missing/saved/codex')
  assert.equal(await failedCli(null), '/missing/env/codex')
})

test('a failed update saves the CLI it ran, its exit code, only the error and warning lines of its stderr, and which call failed, beside the failed state', async t => {
  const dir = tempDir()
  const personHome = tempDir()
  t.after(() => Promise.all([dir, personHome].map(d => rm(d, { recursive: true, force: true }))))
  await updateState(dir, 's1', s => ({ ...s, pending: [{ ex: ex(1, 'Should I deploy?'), turnsStarted: 1 }] }))
  const error = 'ERROR: {"status":400,"error":{"code":"model_not_found"}}'
  const streamError = '2026-11-03T10:00:00.000Z ERROR codex_core::client: stream error: idle timeout, retrying 1/5'
  const stderr = [
    ...Array(500).fill('session header'),
    'user',
    'Should I deploy? The key is in .env as API_KEY=abc123',
    'thinking',
    '**Weighing the deploy** The person asked whether to deploy the app.',
    streamError,
    'codex',
    'Deploy now? The person said the key is in .env.',
    error,
  ].join('\n')
  const { exec } = fakeRunner(() => ({ code: 1, stdout: '', stderr }))

  await runBothCalls(dir, 's1', codexAsk(exec, '/old/codex', dir, personHome), () => 7)

  const s = await readState(dir, 's1')
  assert.equal(s.presence.ledgerState, 'failed')
  assert.equal(s.callFailures.ledger.lastFailure?.process?.cli, '/old/codex')
  assert.equal(s.callFailures.ledger.lastFailure?.process?.code, 1)
  assert.equal(s.callFailures.ledger.lastFailure?.at, 7)
  assert.equal(s.callFailures.ledger.lastFailure?.process?.stderr, `${streamError}\n${error}`)
  assert.doesNotMatch(JSON.stringify(s.callFailures), /deploy the app|API_KEY|Deploy now|Weighing/)
  assert.deepEqual(
    [
      s.callFailures.ledger.lastFailure.cause,
      s.callFailures.ledger.lastFailure.call,
      s.callFailures.ledger.lastFailure.reads,
      s.callFailures.ledger.lastFailure.isRetry,
    ],
    ['process', 'ledger', 'reply', false],
  )
  assert.match(s.callFailures.ledger.lastFailure.error ?? '', /^codex exec exited 1: /)
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
    JSON.stringify({
      [PARTS_STATUS_SYSTEM]: 'HEAD: Building the deploy script | Writing a script that deploys the app',
    }),
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

  await runBothCalls(dir, 's1', codexAsk(run, cli, dir, personHome), () => 7)

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
  assert.equal(s.callFailures.ledger.lastFailure, null)
  assert.equal(received.length, 2)
  assert.ok(received.every(prompt => prompt.includes(reply)))
})

test('an update whose codex command cannot start saves why as its failure beside the failed state', async t => {
  const dir = tempDir()
  const personHome = tempDir()
  t.after(() => Promise.all([dir, personHome].map(d => rm(d, { recursive: true, force: true }))))
  await updateState(dir, 's1', s => ({ ...s, pending: [{ ex: ex(1, 'Should I deploy?'), turnsStarted: 1 }] }))
  const cli = '/apps/co\0dex'

  await runBothCalls(dir, 's1', codexAsk(run, cli, dir, personHome), () => 7)

  const s = await readState(dir, 's1')
  assert.equal(s.presence.ledgerState, 'failed')
  assert.equal(s.callFailures.ledger.lastFailure?.process?.cli, cli)
  assert.equal(s.callFailures.ledger.lastFailure?.process?.code, -1)
  assert.equal(s.callFailures.ledger.lastFailure?.process?.errorCode, 'ERR_INVALID_ARG_VALUE')
  assert.match(s.callFailures.ledger.lastFailure?.error ?? '', /^codex exec failed with ERR_INVALID_ARG_VALUE$/)
})

test('a failed codex call reports the signal that ended codex, the error of a codex that could not start, the timeout it ran out, and a codex that exited 0 with no reply as no reply', async t => {
  const dir = tempDir()
  const personHome = tempDir()
  const bin = tempDir()
  t.after(() => Promise.all([dir, personHome, bin].map(d => rm(d, { recursive: true, force: true }))))
  const killed = join(bin, 'codex')
  writeFileSync(
    killed,
    [`#!${process.execPath}`, `console.error('warning: slow start')`, `process.kill(process.pid, 'SIGTERM')`].join(
      '\n',
    ),
  )
  chmodSync(killed, 0o755)
  const timedOut = fakeRunner(() => ({ code: TIMED_OUT_CODE, stdout: '', stderr: '' })).exec
  const quiet = fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec
  const reportOf = async (exec: Parameters<typeof codexAsk>[0], cli: string) => {
    const reports: CallReport[] = []
    const kind = { call: 'ledger', reads: 'reply', isRetry: false } as const
    await codexAsk(exec, cli, dir, personHome)('prompt', 'ledger system', kind, r => reports.push(r))

    return { ...reports[0]!.process, cause: reports[0]!.cause, error: reports[0]!.error ?? '' }
  }

  const bySignal = await reportOf(run, killed)
  const unstartable = await reportOf(run, join(bin, 'missing-codex'))
  const late = await reportOf(timedOut, killed)
  const noReply = await reportOf(quiet, killed)

  assert.deepEqual(
    [bySignal.cause, bySignal.code, bySignal.signal, bySignal.errorCode, bySignal.timeoutMs],
    ['process', -1, 'SIGTERM', null, null],
  )
  assert.match(bySignal.stderr ?? '', /warning: slow start/)
  assert.match(bySignal.error, /^codex exec was ended by SIGTERM: warning: slow start/)
  assert.deepEqual(
    [unstartable.cause, unstartable.code, unstartable.signal, unstartable.errorCode],
    ['process', -1, null, 'ENOENT'],
  )
  assert.equal(unstartable.stderr, '')
  assert.match(unstartable.error, /^codex exec failed with ENOENT/)
  assert.deepEqual([late.cause, late.code, late.signal, late.timeoutMs], ['process', TIMED_OUT_CODE, null, 120_000])
  assert.match(late.error, /^codex exec timed out after 120 s/)
  assert.deepEqual([noReply.cause, noReply.code], ['no-reply', 0])
  assert.match(noReply.error, /^codex exec exited 0 and wrote no reply/)
})
