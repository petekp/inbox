import assert from 'node:assert/strict'
import { test } from 'node:test'

import { makeServer } from '../src/server'
import { readState, updateState } from '../src/state'
import { runUpdates } from '../src/update'
import { fakeRunner, ledgerOnly, tempDir } from './helpers'
import { ex } from './update-fixtures'

const DELEGATE = async () => ({ parent: 't1' })
const META = { 'x-codex-turn-metadata': { session_id: 's1', thread_id: 's1' } }

function server(dir: string, delegate?: typeof DELEGATE) {
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => 100,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
    ...(delegate ? { delegate } : {}),
  })

  return async (args: Record<string, unknown>) => {
    const r = (await handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'record', arguments: args, _meta: META },
    })) as { result: { content: { text: string }[] } }
    return r.result.content[0]?.text ?? ''
  }
}

const QUESTION = { kind: 'question', ask: 'Which cache should the API use?', options: ['Redis', 'Memory'] }
const FINDING = { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' }

test('in a delegate session, Codex’s record tool refuses a question or task and records a finding', async () => {
  const dir = tempDir()
  const record = server(dir, DELEGATE)

  assert.match(await record(QUESTION), /^Not recorded: this is a delegate session.*Herdr terminal t1/)
  assert.match(await record({ kind: 'task', ask: 'Sign in to npm' }), /^Not recorded: this is a delegate session/)
  assert.match(await record(FINDING), /^Recorded\. /)
  const s = await readState(dir, 's1')
  assert.deepEqual(s.ledger.items, [])
  assert.deepEqual(
    s.ledger.findings.map(f => f.title),
    ['No lint script'],
  )
})

test('in a session that is no delegate, Codex’s record tool records the question', async () => {
  const dir = tempDir()

  assert.match(await server(dir)(QUESTION), /^Recorded\. /)
  assert.deepEqual(
    (await readState(dir, 's1')).ledger.items.map(i => i.ask),
    ['Which cache should the API use?'],
  )
})

test('in a delegate session, the Codex update adds no question or task from the inbox model’s answer', async () => {
  const answer = 'NEW: decide | - | Deploy the API now? | Yes / No | Yes\nNEW: do | - | Sign in to npm | - | -'
  const asks = async (delegate?: typeof DELEGATE) => {
    const dir = tempDir()
    await updateState(dir, 's1', s => ({
      ...s,
      presence: { ...s.presence, turnsStarted: 1 },
      pending: [{ ex: ex(1, 'Deploy the API now?'), turnsStarted: 1 }],
    }))
    await runUpdates(
      dir,
      's1',
      ledgerOnly(async () => answer),
      () => 5,
      undefined,
      undefined,
      delegate,
    )
    return (await readState(dir, 's1')).ledger.items.map(i => i.ask)
  }

  assert.deepEqual(await asks(DELEGATE), [])
  assert.deepEqual(await asks(), ['Deploy the API now?', 'Sign in to npm'])
})
