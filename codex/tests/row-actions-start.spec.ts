import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { test } from 'node:test'
import { Window } from 'happy-dom'
import { handleHook } from '../src/hook'
import { readState, updateState } from '../src/state'
import { makeServer } from '../src/server'
import { POLL_MS } from '../src/settle'
import TAB_HTML from '../src/tab.html'
import { fakeRunner, hookDeps, input, rolloutCopy, tempDir } from './helpers'
import { task } from './row-actions-fixtures'

test('the built tab starts without randomUUID and reloads without losing its host or reusing numeric request IDs', async () => {
  const dir = tempDir()
  await updateState(dir, 'renderer', state => ({
    ...state,
    ledger: task().ledger,
    heard: { ...state.heard, startAt: 1 },
    presence: { ...state.presence, turnsStarted: 1, turnsApplied: 1 },
  }))
  let html = TAB_HTML
  const runner = fakeRunner(() => ({ code: 1, stdout: '', stderr: 'No external commands in this test' }))
  const handle = makeServer({
    comparePage: '/plugin/dist/compare-page.html',
    dir,
    now: Date.now,
    exec: runner.exec,
    tabHtml: TAB_HTML,
    devPage: async () => html,
    fallbackCli: async () => '/codex',
    build: SERVER_BUILD,
  })
  const page = await handle({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: 'ui://inbox/view' } })
  assert.ok(page)
  const resource = page.result as { contents: { text: string }[] }
  const host = new Window({
    url: 'https://inbox.test/',
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
      device: { prefersReducedMotion: 'reduce' },
    },
  })
  Object.defineProperty(host, 'crypto', {
    value: new Proxy(host.crypto, {
      get(target, key) {
        if (key === 'randomUUID') return undefined
        const value = Reflect.get(target, key, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }),
    configurable: true,
  })
  const requestIds: number[] = []
  let initialized = 0
  let polls = 0
  let acknowledgements = 0
  let holdPresses = false
  const heldPresses: (() => void)[] = []
  host.parent.postMessage = message => {
    const request = message as Parameters<typeof handle>[0]
    if (request.method === 'ui/notifications/initialized') {
      initialized++
      return
    }
    if (request.id === 'host-check' && !request.method) {
      acknowledgements++
      return
    }
    if (typeof request.id !== 'number') return
    requestIds.push(request.id)
    if (request.params?.name === 'inbox_view') polls++
    const response =
      request.method === 'ui/initialize'
        ? Promise.resolve({ jsonrpc: '2.0', id: request.id, result: {} })
        : handle({ ...request, params: { ...request.params, _meta: { thread_id: 'renderer' } } })
    const deliver = () =>
      void response.then(data => queueMicrotask(() => host.dispatchEvent(new host.MessageEvent('message', { data }))))
    if (holdPresses && request.params?.name === 'inbox_press') heldPresses.push(deliver)
    else deliver()
  }
  const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
  const until = async (ready: () => boolean) => {
    for (let n = 0; n < 280 && !ready(); n++) await pause(25)
    assert.ok(ready())
  }
  const button = (label: string) => [...host.document.querySelectorAll('button')].find(b => b.textContent === label)
  try {
    host.document.write(resource.contents[0]!.text)
    await until(() => button('Reply') !== undefined)
    const document = host.document
    const body = document.body
    const hostControl = document.createElement('button')
    hostControl.textContent = 'Host control'
    body.append(hostControl)
    let hostEvents = 0
    document.addEventListener('host-check', () => hostEvents++)
    button('Reply')!.click()
    const input = document.querySelector('input')!
    input.value = 'Keep these exact words'
    input.dispatchEvent(new host.Event('input', { bubbles: true }))
    const workingRoot = document.getElementById('app')
    html = TAB_HTML.replace(
      /(<script id="inbox-script">)[\s\S]*?(<\/script>)/,
      '$1throw new Error("broken candidate");$2',
    )
    await until(() => button('Try again') !== undefined)
    assert.ok(document.getElementById('app') === workingRoot, 'the tab root was replaced')
    assert.equal(document.querySelector('input')?.value, 'Keep these exact words')
    assert.ok(document.activeElement === input, 'the reply field has focus')
    html = TAB_HTML.replace('</head>', '<meta name="test-page" content="next"></head>')
    await until(() => initialized === 2 && host.document.querySelector('input')?.value === 'Keep these exact words')
    assert.ok(host.document.activeElement === host.document.querySelector('input'), 'the reply field has focus')
    assert.ok(host.document === document, 'page replacement preserves the host document')
    assert.ok(host.document.body === body, 'page replacement preserves the host body')
    assert.ok(hostControl.isConnected)
    hostControl.dispatchEvent(new host.Event('host-check', { bubbles: true }))
    assert.equal(hostEvents, 1)
    host.dispatchEvent(
      new host.MessageEvent('message', {
        data: { jsonrpc: '2.0', id: 'host-check', method: 'ui/notifications/host-context-changed', params: {} },
      }),
    )
    assert.equal(acknowledgements, 1)
    const beforePoll = polls
    await pause(POLL_MS + 100)
    assert.equal(polls - beforePoll, 1)
    assert.ok(requestIds.every(Number.isSafeInteger))
    assert.equal(new Set(requestIds).size, requestIds.length)
    assert.ok(requestIds.every((id, n) => n === 0 || id > requestIds[n - 1]!))
    button('Cancel')!.click()
    assert.ok(document.querySelector('input') === null, 'the reply field is still drawn')
    button('Reply')!.click()
    assert.equal(document.querySelector('input')?.value, 'Keep these exact words')
    button('Send')!.click()
    await until(() => document.getElementById('app')?.textContent?.includes('Reply not confirmed') ?? false)
    assert.match(document.querySelector('.row.selected')?.textContent ?? '', /Check the build/)
    button('Reply')!.click()
    assert.equal(document.querySelector('input')?.value, 'Keep these exact words')
    holdPresses = true
    const first = document.querySelector('input')!
    first.value = 'First overlapping reply'
    first.dispatchEvent(new host.Event('input', { bubbles: true }))
    button('Send')!.click()
    await until(() => heldPresses.length === 1)
    button('Reply')!.click()
    const second = document.querySelector('input')!
    second.value = 'Second overlapping reply'
    second.dispatchEvent(new host.Event('input', { bubbles: true }))
    button('Send')!.click()
    await until(() => heldPresses.length === 2)
    heldPresses[0]!()
    await pause(40)
    assert.match(document.getElementById('app')?.textContent ?? '', /Sending…/)
    heldPresses[1]!()
    await until(() => !(document.getElementById('app')?.textContent?.includes('Sending…') ?? false))
  } finally {
    await host.happyDOM.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('the built tab keeps polling after a view it cannot draw, so a queued Explain moves on once Codex takes it', async () => {
  const dir = tempDir()
  const rollout = rolloutCopy()
  await updateState(dir, 's1', state => ({
    ...state,
    root: '/repo',
    cliPath: '/apps/codex',
    transcriptPath: rollout,
    heard: { ...state.heard, startAt: 1 },
    ledger: {
      ...state.ledger,
      turn: 1,
      findings: [{ id: 'f1', kind: 'issue', title: 'Retry loop spins', detail: 'No delay.', path: null, at: 1 }],
    },
    presence: { ...state.presence, turnsStarted: 1, turnsApplied: 1 },
  }))
  const runner = fakeRunner(args =>
    args[1] === 'queue' && args[2] !== '--help'
      ? { code: 0, stdout: 'Queued message q1\n', stderr: '' }
      : { code: 1, stdout: '', stderr: 'No other commands in this test' },
  )
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
    settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true },
  })
  let isNextViewUndrawable = false
  let views = 0
  const drawErrors: unknown[] = []
  host.console.error = (...args: unknown[]) => void drawErrors.push(args[0])
  host.parent.postMessage = message => {
    const request = message as Parameters<typeof handle>[0]
    if (typeof request.id !== 'number') return
    const isView = request.params?.name === 'inbox_view'
    const response =
      request.method === 'ui/initialize'
        ? Promise.resolve({ jsonrpc: '2.0', id: request.id, result: {} })
        : handle({ ...request, params: { ...request.params, _meta: { thread_id: 's1' } } })
    void response.then(answer => {
      let data: unknown = answer
      if (isView) views++
      if (isView && isNextViewUndrawable) {
        isNextViewUndrawable = false
        const undrawable = JSON.parse(JSON.stringify(answer)) as {
          result: { structuredContent: { findings: { rows: { feedback: unknown }[] } } }
        }
        undrawable.result.structuredContent.findings.rows[0]!.feedback = { is: 'local', result: null }
        data = undrawable
      }
      queueMicrotask(() => host.dispatchEvent(new host.MessageEvent('message', { data })))
    })
  }
  const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
  const until = async (ready: () => boolean) => {
    for (let n = 0; n < 400 && !ready(); n++) await pause(25)
    assert.ok(ready())
  }
  const text = () => host.document.getElementById('app')?.textContent ?? ''
  const button = (label: string) => [...host.document.querySelectorAll('button')].find(b => b.textContent === label)
  try {
    host.document.write(resource.contents[0]!.text)
    await until(() => button('Explain') !== undefined)
    button('Explain')!.click()
    await until(() => text().includes('Queued: Explain'))
    isNextViewUndrawable = true
    const before = views
    await until(() => views > before)
    const queued = await readState(dir, 's1')
    const deps = hookDeps(dir, Date.now)
    await handleHook(
      input('UserPromptSubmit', { prompt: queued.sent[0]!.text, turn_id: 't9', transcript_path: rollout }),
      { ...deps, env: { ...deps.env, INBOX_IN_EXEC: '1' } },
    )
    await until(() => text().includes('Explaining…'))
    assert.doesNotMatch(text(), /Queued: Explain/)
    assert.equal(drawErrors.length, 1)
    assert.ok(drawErrors[0] instanceof host.TypeError)
  } finally {
    await host.happyDOM.close()
    await rm(dir, { recursive: true, force: true })
  }
})
