import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { PRESS_GUARD_MS } from '../../hooks/timing'
import { updateState } from '../src/state'
import { makeServer } from '../src/server'
import { POLL_MS } from '../src/settle'
import TAB_HTML from '../src/tab.html'
import { fakeRunner, tempDir } from './helpers'
import { task } from './row-actions-fixtures'

test('the built tab closes the reply field of a row it collapses and keeps the draft, and two quick collapses stay collapsed whatever order the answers arrive in', async () => {
  const dir = tempDir()
  const { ledger } = task()
  const second = { ...ledger.items[0]!, id: 'i2', ask: 'Tag the release', helps: [], at: 2 }
  await updateState(dir, 'renderer', state => ({
    ...state,
    ledger: { ...ledger, items: [...ledger.items, second] },
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
  let isHolding = false
  const held: { name: string; deliver: () => void }[] = []
  host.parent.postMessage = message => {
    const request = message as Parameters<typeof handle>[0]
    if (typeof request.id !== 'number') return
    const response =
      request.method === 'ui/initialize'
        ? Promise.resolve({ jsonrpc: '2.0', id: request.id, result: {} })
        : handle({ ...request, params: { ...request.params, _meta: { thread_id: 'renderer' } } })
    const deliver = () =>
      void response.then(data => queueMicrotask(() => host.dispatchEvent(new host.MessageEvent('message', { data }))))
    const name = String(request.params?.name ?? '')
    if (isHolding && (name === 'inbox_press' || name === 'inbox_view')) held.push({ name, deliver })
    else deliver()
  }
  const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
  const until = async (ready: () => boolean) => {
    for (let n = 0; n < 280 && !ready(); n++) await pause(25)
    assert.ok(ready())
  }
  const document = host.document
  const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent === label)
  const openRow = () => document.querySelector('.row.selected')
  const pressTitle = (title: string) => {
    const row = [...document.querySelectorAll('.row')].find(r => r.textContent?.includes(title))
    const line = row?.querySelector('button.line') as { click(): void } | null | undefined
    line!.click()
  }
  try {
    document.write(resource.contents[0]!.text)
    await until(() => /Check the build/.test(openRow()?.textContent ?? ''))
    await pause(PRESS_GUARD_MS + 50)
    button('Reply')!.click()
    const input = document.querySelector('input')!
    input.value = 'Waiting for access'
    input.dispatchEvent(new host.Event('input', { bubbles: true }))
    pressTitle('Check the build')
    assert.ok(document.querySelector('input') === null, 'the reply field is still drawn')
    assert.ok(openRow() === null, 'a row is open')
    await pause(100)
    assert.ok(openRow() === null, 'a row opened after the answer')
    pressTitle('Check the build')
    await until(() => /Check the build/.test(openRow()?.textContent ?? ''))
    assert.ok(document.querySelector('input') === null, 'the reply field opened again')
    await pause(PRESS_GUARD_MS + 50)
    button('Reply')!.click()
    assert.equal(document.querySelector('input')?.value, 'Waiting for access')
    button('Cancel')!.click()

    await pause(PRESS_GUARD_MS + 50)
    isHolding = true
    pressTitle('Check the build')
    assert.ok(openRow() === null, 'a row is open')
    pressTitle('Tag the release')
    assert.match(openRow()?.textContent ?? '', /Tag the release/)
    await pause(Math.max(PRESS_GUARD_MS, POLL_MS) + 50)
    pressTitle('Tag the release')
    assert.ok(openRow() === null, 'a row is open')
    assert.equal(held.filter(h => h.name === 'inbox_press').length, 2)
    isHolding = false
    for (const h of held.splice(0)) {
      h.deliver()
      await pause(40)
      assert.ok(openRow() === null, `a row opened after a held ${h.name} answer`)
    }
    await pause(POLL_MS + 100)
    assert.ok(openRow() === null, 'a row opened after the next poll')
  } finally {
    await host.happyDOM.close()
    await rm(dir, { recursive: true, force: true })
  }
})
