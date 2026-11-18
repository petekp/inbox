import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { finishedResult } from '../../hooks/press-effects'
import { pendingResult } from '../../hooks/pressed'
import { shortAgo } from '../../hooks/rows'
import type { LastAction, Ledger } from '../../types'
import { updateState } from '../src/state'
import { makeServer } from '../src/server'
import TAB_HTML from '../src/tab.html'
import { fakeRunner, removeTempDir, tempDir } from './helpers'
import { task } from './row-actions-fixtures'

async function builtTab(items: Ledger['items'], lastActions: Record<string, LastAction>, { isPressHeld = false } = {}) {
  const dir = tempDir()
  const { ledger } = task()
  await updateState(dir, 'renderer', state => ({
    ...state,
    ledger: { ...ledger, items },
    lastActions,
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
    if (isPressHeld && (request.params as { name?: string } | undefined)?.name === 'inbox_press') return
    const response =
      request.method === 'ui/initialize'
        ? Promise.resolve({ jsonrpc: '2.0', id: request.id, result: {} })
        : handle({ ...request, params: { ...request.params, _meta: { thread_id: 'renderer' } } })
    void response.then(data => queueMicrotask(() => host.dispatchEvent(new host.MessageEvent('message', { data }))))
  }
  const document = host.document
  const rowWith = (text: string) => [...document.querySelectorAll('.row')].find(r => r.textContent?.includes(text))
  const until = async (isDrawn: () => boolean) => {
    for (let n = 0; n < 280 && !isDrawn(); n++) await new Promise<void>(resolve => setTimeout(resolve, 25))
  }
  document.write(resource.contents[0]!.text)

  return {
    document,
    rowWith,
    until,
    close: async () => {
      await host.happyDOM.close()
      await removeTempDir(dir, handle)
    },
  }
}

test('the built tab keeps a collapsed row’s age beside a status that has no age of its own, as Not sent', async () => {
  const now = Date.now()
  const askedAt = now - 2 * 60 * 60 * 1000
  const first = { ...task().ledger.items[0]!, at: askedAt }
  const failed = { ...first, id: 'i2', ask: 'Tag the release', helps: [] }
  const notSent: LastAction = {
    kind: 'talk',
    action: 'explain',
    text: 'Explain',
    at: now - 60_000,
    delivery: { state: 'failed', reason: 'The session ended', id: 'd1' },
  }
  const tab = await builtTab([first, failed], { i2: notSent })
  try {
    await tab.until(() => /Not sent/.test(tab.rowWith('Tag the release')?.textContent ?? ''))
    const row = tab.rowWith('Tag the release')
    assert.match(row?.textContent ?? '', /Not sent: The session ended/)
    assert.ok(!row?.classList.contains('selected'), 'the failed row is open')
    assert.equal(row?.querySelector('.side')?.textContent?.trim(), shortAgo(now - askedAt))
  } finally {
    await tab.close()
  }
})

test('the built tab draws a handed-off task’s result in the done color of its ✓', async () => {
  const now = Date.now()
  const handedOff: LastAction = {
    kind: 'handoff',
    action: 'step-0',
    text: 'Run tests',
    at: now - 60_000,
    turnsStarted: 1,
  }
  const tab = await builtTab([{ ...task().ledger.items[0]!, at: now - 120_000 }], { i1: handedOff })
  try {
    await tab.until(() => /Run tests/.test(tab.rowWith('Check the build')?.textContent ?? ''))
    const row = tab.rowWith('Check the build')
    assert.ok(row?.querySelector('.mark.done'), 'the row has no done mark')
    assert.equal(row?.querySelector('.line .after')?.className, 'after tone-done')
  } finally {
    await tab.close()
  }
})

test('the built tab draws an open row’s pending open muted, not in the error color of the failed open before it', async () => {
  const now = Date.now()
  const item = { ...task().ledger.items[0]!, at: now - 120_000, helps: [{ kind: 'open' as const, path: 'plan.md' }] }
  const effect = { kind: 'open' as const, target: 'plan.md', name: 'plan.md' }
  const failed = finishedResult(pendingResult([effect], now - 60_000), ['no such file'], now - 60_000)
  const last: LastAction = {
    kind: 'local',
    action: 'step-0',
    text: 'Open plan.md',
    at: now - 60_000,
    result: { ...failed, action: 'step-0' },
  }
  const tab = await builtTab([item], { i1: last }, { isPressHeld: true })
  const pressLine = () =>
    [...tab.document.querySelectorAll('.panel div')].find(d => d.textContent?.trim() === 'Opening plan.md…')
  try {
    await tab.until(() => /Could not open plan\.md/.test(tab.rowWith('Check the build')?.textContent ?? ''))
    ;(tab.rowWith('Check the build')!.querySelector('button.line') as { click(): void } | null)!.click()
    const open = () => [...tab.document.querySelectorAll('.panel button')].find(b => /^Open/.test(b.textContent ?? ''))
    await tab.until(() => open() !== undefined)
    ;(open() as { click(): void } | undefined)!.click()
    await tab.until(() => pressLine() !== undefined)
    assert.equal(pressLine()?.className, 'muted')
  } finally {
    await tab.close()
  }
})
