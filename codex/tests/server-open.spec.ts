import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import type { View } from '../src/core'
import { makeServer } from '../src/server'
import { PRESS_TIMEOUT_MS } from '../../hooks/session-view'
import { readState, statePath, updateState } from '../src/state'
import { tempDir } from './helpers'
import { setup } from './server-fixtures'

test('a local Open does not run when its press could not be saved', async () => {
  const { dir } = await setup(0)
  const root = tempDir()
  writeFileSync(join(root, 'notes.md'), '# Notes')
  await updateState(dir, 's1', s => ({
    ...s,
    root,
    ledger: {
      ...s.ledger,
      items: [
        {
          ...s.ledger.items[0]!,
          id: 'i2',
          kind: 'task',
          ask: 'Read notes',
          options: [],
          helps: [{ kind: 'open', path: 'notes.md' }],
        },
      ],
    },
  }))
  mkdirSync(`${statePath(dir, 's1')}.${process.pid}.tmp`)
  const calls: string[][] = []
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => 100,
    exec: async args => {
      calls.push(args)
      return { code: 0, stdout: '', stderr: '' }
    },
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const reply = (await handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'inbox_press',
      arguments: { press: { action: 'step', id: 'i2', step: 0, label: 'Open notes.md' }, thread: 's1' },
      _meta: { thread_id: 's1' },
    },
  })) as { result: { structuredContent: { error: string | null } } }

  assert.match(reply.result.structuredContent.error ?? '', /Not sent:/)
  assert.deepEqual(calls, [])
  assert.equal((await readState(dir, 's1')).lastActions.i2, undefined)
})

test('an Open step shows a file macOS would run in Finder, opens any other file, and records on its row what happened', async () => {
  const { dir, calls, call } = await setup(0)
  const root = tempDir()
  writeFileSync(join(root, 'deploy.command'), 'echo hi')
  writeFileSync(join(root, 'notes.md'), '# Notes')
  await updateState(dir, 's1', s => ({
    ...s,
    root,
    ledger: {
      ...s.ledger,
      items: [
        {
          id: 'i2',
          kind: 'task',
          label: null,
          from: 'record',
          ask: 'Check the deploy script',
          options: [],
          rec: null,
          helps: [
            { kind: 'open', path: 'deploy.command' },
            { kind: 'open', path: 'notes.md' },
            { kind: 'open', path: 'moved.md' },
          ],
          turn: 1,
          at: 1,
        },
      ],
    },
  }))
  const step = (step: number, label: string) =>
    call('inbox_press', { press: { action: 'step', id: 'i2', step, label }, thread: 's1' }, { thread_id: 's1' })
  const visibleResult = async () => {
    const result = (await readState(dir, 's1')).lastActions.i2?.result
    return result && { state: result.state, parts: result.parts, at: result.at }
  }
  await step(0, 'Open deploy.command')
  await step(1, 'Open notes.md')
  assert.deepEqual(calls, [
    ['open', '-R', join(root, 'deploy.command')],
    ['open', join(root, 'notes.md')],
  ])
  assert.deepEqual(await visibleResult(), {
    state: 'done',
    parts: [{ kind: 'open', name: 'notes.md', isCommand: false, error: null }],
    at: 100,
  })
  const moved = await step(2, 'Open moved.md')
  assert.equal(moved.result.structuredContent.error, null)
  assert.deepEqual(await visibleResult(), {
    state: 'failed',
    parts: [{ kind: 'open', name: 'moved.md', isCommand: false, error: 'it no longer exists' }],
    at: 100,
  })
  assert.equal(calls.length, 2)
})

test('an open still pending after the press timeout shows nothing on its row, and stays saved as pending', async () => {
  const { dir, call } = await setup(0)
  const pending = (at: number) => ({
    state: 'pending' as const,
    parts: [{ kind: 'open' as const, name: 'notes.md', isCommand: false, error: null }],
    at,
  })
  const opened = (at: number) => ({
    kind: 'local' as const,
    action: 'step-0',
    text: 'Open notes.md',
    at,
    result: pending(at),
  })
  const staleAt = 100 - PRESS_TIMEOUT_MS - 1
  await updateState(dir, 's1', s => ({
    ...s,
    ledger: {
      ...s.ledger,
      items: [
        ...s.ledger.items,
        {
          id: 'i2',
          kind: 'task',
          label: null,
          from: 'record',
          ask: 'Read the notes',
          options: [],
          rec: null,
          helps: [{ kind: 'open', path: 'notes.md' }],
          turn: 1,
          at: 1,
        },
      ],
    },
    lastActions: { i1: opened(staleAt), i2: opened(100) },
  }))
  const r = (await call('inbox_view', {}, { thread_id: 's1' })) as unknown as {
    result: { structuredContent: View }
  }
  const view = r.result.structuredContent
  assert.equal(view.needsYou.questions.find(q => q.id === 'i1')?.feedback, null)
  assert.deepEqual(view.needsYou.tasks.find(t => t.id === 'i2')?.feedback, { is: 'local', result: pending(100) })
  assert.equal(view.lastActions.i1?.result, undefined)
  const saved = await readState(dir, 's1')
  assert.deepEqual([saved.lastActions.i1?.result, saved.lastActions.i2?.result], [pending(staleAt), pending(100)])
})
