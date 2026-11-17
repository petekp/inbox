import assert from 'node:assert/strict'
import { test } from 'node:test'

import { makeServer } from '../src/server'
import { updateState } from '../src/state'
import { tempDir } from './helpers'

type Reply = {
  result: {
    structuredContent: {
      copy: { text: string; name: string } | null
      error: string | null
      view: { needsYou: { tasks: { id: string; feedback: { is: string; result?: { state: string } } | null }[] } }
    }
  }
}

async function copyServer(copyCode: number) {
  const dir = tempDir()
  await updateState(dir, 's1', s => ({
    ...s,
    root: '/repo',
    ledger: {
      ...s.ledger,
      nextId: 2,
      items: [
        {
          id: 't1',
          kind: 'task',
          label: null,
          from: 'record',
          ask: 'Sign in to npm',
          options: [],
          rec: null,
          turn: 1,
          at: 1,
          helps: [{ kind: 'terminal', command: 'npm login', name: 'npm login' }],
        },
      ],
    },
  }))
  const copied: { argv: string[]; input?: string }[] = []
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: () => 100,
    exec: async (argv, opts) => {
      copied.push({ argv, input: opts.input })
      return { code: copyCode, stdout: '', stderr: '' }
    },
    tabHtml: '<html></html>',
    fallbackCli: async () => 'codex',
  })
  const press = (await handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'inbox_press',
      arguments: { press: { action: 'step', id: 't1', step: 0, label: 'Copy npm login' }, thread: 's1' },
      _meta: { thread_id: 's1' },
    },
  })) as unknown as Reply

  return { copied, reply: press.result.structuredContent }
}

test('a copy press puts the text on the clipboard from the server and reads as copied, with no text box for the tab', async () => {
  const { copied, reply } = await copyServer(0)
  assert.equal(copied[0]?.input, 'npm login')
  assert.equal(reply.copy, null)
  assert.equal(reply.error, null)
  const row = reply.view.needsYou.tasks.find(t => t.id === 't1')
  assert.deepEqual([row?.feedback?.is, row?.feedback?.result?.state], ['local', 'done'])
})

test('a copy press whose clipboard command fails reads as failed and gives the tab the text to show in a box', async () => {
  const { reply } = await copyServer(1)
  assert.deepEqual(reply.copy, { text: 'npm login', name: 'npm login' })
  const row = reply.view.needsYou.tasks.find(t => t.id === 't1')
  assert.deepEqual([row?.feedback?.is, row?.feedback?.result?.state], ['local', 'failed'])
})
