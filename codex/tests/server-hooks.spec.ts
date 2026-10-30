import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { noteHook } from '../src/core'
import { makeServer } from '../src/server'
import { readState, updateState } from '../src/state'
import { fakeRunner, tempDir, turnRow } from './helpers'
import { setup } from './server-fixtures'

test('Codex’s own tool calls reach their session through the turn metadata', async () => {
  const { dir, call } = await setup(0)
  const r = await call(
    'record',
    { kind: 'finding', finding_kind: 'issue', title: 'No lint script', detail: 'Only tests run.' },
    { 'x-codex-turn-metadata': { session_id: 's1', thread_id: 's1' } },
  )
  assert.match(r.result.content[0]?.text ?? '', /^Recorded\. /)
  assert.equal((await readState(dir, 's1')).ledger.findings[0]?.title, 'No lint script')
})

test('a tool call from Codex in a turn UserPromptSubmit never recorded shows the hook skipped; the tab’s own calls show nothing', async () => {
  const { dir, call } = await setup(0)
  await updateState(dir, 's1', s => noteHook(noteHook(s, 'start', 10), 'prompt', 20, 't1'))
  const viewed = async () => {
    const r = (await call('inbox_view', {}, { thread_id: 's1' })) as unknown as {
      result: { structuredContent: { heard: string } }
    }
    return r.result.structuredContent.heard
  }
  assert.equal(await viewed(), 'heard')
  await call('close', { id: 'i1', reason: 'done' }, { 'x-codex-turn-metadata': { session_id: 's1', turn_id: 't1' } })
  assert.equal(await viewed(), 'heard')
  await call('inbox', {}, { 'x-codex-turn-metadata': { session_id: 's1', thread_id: 'sub1', turn_id: 'u1' } })
  await call('inbox', {}, { 'x-codex-turn-metadata': { session_id: 's1', parent_thread_id: 's1', turn_id: 'u2' } })
  assert.equal(await viewed(), 'heard')
  await call('inbox', {}, { 'x-codex-turn-metadata': { session_id: 's1', turn_id: 't2' } })
  assert.equal((await readState(dir, 's1')).heard.promptMissedAt, 100)
  assert.equal(await viewed(), 'partial')
})

test('a chat says why Codex is not running the inbox’s hooks from Codex’s hook list, asks again within seconds while they are stopped and a while after the list fails, and after a trusted answer only once a turn runs that the hooks did not hear', async () => {
  let t = 1000
  const answers: ('untrusted' | 'modified' | 'trusted' | null)[] = [
    'untrusted',
    'trusted',
    'modified',
    'trusted',
    null,
    'trusted',
  ]
  const asked: string[][] = []
  const dir = tempDir()
  const rollout = join(tempDir(), 'rollout.jsonl')
  const turns = (...ids: string[]) =>
    writeFileSync(rollout, ids.map(turnId => turnRow('task_started', turnId)).join('\n'))
  turns('h1')
  await updateState(dir, 's1', s => ({
    ...s,
    root: '/repo',
    cliPath: '/apps/codex',
    transcriptPath: rollout,
    coveredTurn: 'h1',
    heard: { ...s.heard, startAt: 1 },
  }))
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => t,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '',
    fallbackCli: async () => 'codex',
    hooksTrust: async (cli, cwd) => {
      asked.push([cli, cwd])
      return answers.shift() ?? null
    },
  })
  const view = async () =>
    (
      (await handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'inbox_view', arguments: {}, _meta: { thread_id: 's1' } },
      })) as { result: { structuredContent: { hooksTrust?: string } } }
    ).result.structuredContent.hooksTrust
  const settle = () => new Promise(resolve => setImmediate(resolve))

  assert.equal(await view(), undefined)
  await settle()
  assert.equal(await view(), 'untrusted')
  assert.equal(await view(), 'untrusted')
  assert.deepEqual(asked, [['/apps/codex', '/repo']])

  t += 5_000
  assert.equal(await view(), 'untrusted')
  await settle()
  assert.equal(await view(), undefined)
  t += 60 * 60_000
  await view()
  await settle()
  assert.equal(asked.length, 2)

  turns('h1', 'u1')
  assert.equal(await view(), undefined)
  await settle()
  assert.equal(await view(), 'modified')
  assert.equal(asked.length, 3)

  t += 5_000
  await view()
  await settle()
  assert.equal(await view(), undefined)
  t += 60 * 60_000
  await view()
  await settle()
  assert.equal(asked.length, 4)

  await updateState(dir, 's1', s => noteHook(s, 'prompt', t, 'h2'))
  turns('h1', 'u1', 'h2')
  await view()
  await settle()
  assert.equal(asked.length, 4)

  turns('h1', 'u1', 'h2', 'u2')
  await view()
  await settle()
  assert.equal(await view(), undefined)
  assert.equal(asked.length, 5)
  t += 30_000
  await view()
  await settle()
  assert.equal(asked.length, 6)
})

test('each chat folder gets its own answer about the hooks’ trust, and each chat asks once about each turn its hooks did not hear', async () => {
  const asked: string[] = []
  const dir = tempDir()
  const rolloutStarting = (turnId: string) => {
    const path = join(tempDir(), 'rollout.jsonl')
    writeFileSync(path, turnRow('task_started', turnId))
    return path
  }
  for (const [id, root] of [
    ['a', '/one'],
    ['b', '/two'],
    ['c', '/one'],
  ] as const)
    await updateState(dir, id, s => ({
      ...s,
      root,
      cliPath: '/apps/codex',
      transcriptPath: rolloutStarting(`${id}-compact`),
    }))
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => 1000,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '',
    fallbackCli: async () => 'codex',
    hooksTrust: async (_cli, folder) => {
      asked.push(folder)
      return folder === '/two' ? 'modified' : 'trusted'
    },
  })
  const view = async (thread: string) =>
    (
      (await handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'inbox_view', arguments: {}, _meta: { thread_id: thread } },
      })) as { result: { structuredContent: { hooksTrust?: string } } }
    ).result.structuredContent.hooksTrust

  const settle = () => new Promise(resolve => setImmediate(resolve))
  const asksFor = (folder: string) => asked.filter(f => f === folder).length

  for (const thread of ['a', 'b', 'c']) await view(thread)
  await settle()
  assert.deepEqual(await Promise.all(['a', 'b', 'c'].map(view)), [undefined, 'modified', undefined])

  for (let round = 0; round < 3; round++)
    for (const thread of ['a', 'c']) {
      await view(thread)
      await settle()
    }
  assert.equal(asksFor('/one'), 2)
  assert.equal(asksFor('/two'), 1)
})

test('a chat whose folder is not known yet asks Codex’s hook list for the home folder', async () => {
  const asked: string[] = []
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir: tempDir(),
    now: () => 1000,
    exec: fakeRunner(() => ({ code: 0, stdout: '', stderr: '' })).exec,
    tabHtml: '',
    fallbackCli: async () => 'codex',
    hooksTrust: async (_cli, folder) => {
      asked.push(folder)
      return 'modified'
    },
  })
  await handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'inbox_view', arguments: {}, _meta: { thread_id: 'new' } },
  })
  await new Promise(resolve => setImmediate(resolve))

  assert.deepEqual(asked, [homedir()])
})
