import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { shortAgo } from '../../hooks/rows'
import type { LastAction } from '../../types'
import { updateState } from '../src/state'
import { makeServer } from '../src/server'
import TAB_HTML from '../src/tab.html'
import { fakeRunner, removeTempDir, tempDir } from './helpers'
import { task } from './row-actions-fixtures'

test('the built tab keeps a collapsed row’s age beside a status that has no age of its own, as Not sent', async () => {
  const dir = tempDir()
  const now = Date.now()
  const askedAt = now - 2 * 60 * 60 * 1000
  const { ledger } = task()
  const first = { ...ledger.items[0]!, at: askedAt }
  const failed = { ...first, id: 'i2', ask: 'Tag the release', helps: [] }
  const notSent: LastAction = {
    kind: 'talk',
    action: 'explain',
    text: 'Explain',
    at: now - 60_000,
    delivery: { state: 'failed', reason: 'The session ended', id: 'd1' },
  }
  await updateState(dir, 'renderer', state => ({
    ...state,
    ledger: { ...ledger, items: [first, failed] },
    lastActions: { i2: notSent },
    heard: { ...state.heard, startAt: 1 },
    presence: { ...state.presence, turnsStarted: 1, turnsApplied: 1 },
  }))
  const runner = fakeRunner(() => ({ code: 1, stdout: '', stderr: 'No external commands in this test' }))
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: Date.now,
    exec: runner.exec,
    tabHtml: TAB_HTML,
    fallbackCli: async () => '/codex',
    build: SERVER_BUILD,
  })
  const page = await handle({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'ui://inbox/view' } })
  const resource = page!.result as { contents: { text: string }[] }
  const host = new Window({
    url: 'https://inbox.test/',
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
      device: { prefersReducedMotion: 'reduce' },
    },
  })
  host.parent.postMessage = message => {
    const request = message as Parameters<typeof handle>[0]
    if (typeof request.id !== 'number') return
    const response =
      request.method === 'ui/initialize'
        ? Promise.resolve({ jsonrpc: '2.0', id: request.id, result: {} })
        : handle({ ...request, params: { ...request.params, _meta: { thread_id: 'renderer' } } })
    void response.then(data => queueMicrotask(() => host.dispatchEvent(new host.MessageEvent('message', { data }))))
  }
  const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
  const document = host.document
  const failedRow = () => [...document.querySelectorAll('.row')].find(r => r.textContent?.includes('Tag the release'))
  try {
    document.write(resource.contents[0]!.text)
    for (let n = 0; n < 280 && !/Not sent/.test(failedRow()?.textContent ?? ''); n++) await pause(25)
    const row = failedRow()
    assert.match(row?.textContent ?? '', /Not sent: The session ended/)
    assert.ok(!row?.classList.contains('selected'), 'the failed row is open')
    assert.equal(row?.querySelector('.side')?.textContent?.trim(), shortAgo(now - askedAt))
  } finally {
    await host.happyDOM.close()
    await removeTempDir(dir, handle)
  }
})
