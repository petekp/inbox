import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import { after, test } from 'node:test'
import { Window } from 'happy-dom'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { EMPTY } from '../../hooks/ledger'
import type { Ledger } from '../../types'
import { applyPress } from '../../hooks/presses'
import type { PressResult, RowPress } from '../../hooks/presses'
import { inboxView, PRESS_GUARD_MS } from '../../hooks/view'
import type { ReplyHolds } from '../../hooks/view'
import { ledgerActions, RowActions } from '../src/row-actions'
import { recordClose, recordItem } from '../../hooks/tools'
import { CODEX } from '../src/texts'
import { emptyState, updateState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'
import { makeServer } from '../src/server'
import { POLL_MS } from '../src/settle'
import TAB_HTML from '../src/tab.html'
import { fakeRunner, tempDir } from './helpers'

const window = new Window()
Object.assign(globalThis, { window, document: window.document, Event: window.Event })
after(() => window.happyDOM.close())

function task() {
  const ledger: Ledger = {
    ...EMPTY,
    items: [
      {
        id: 'i1',
        kind: 'task' as const,
        label: null,
        from: 'record',
        ask: 'Check the build',
        options: [],
        rec: null,
        helps: [{ kind: 'run' as const, command: 'npm test', name: 'tests' }],
        turn: 1,
        at: 1,
      },
    ],
  }
  const view = inboxView({
    ledger,
    lastActions: {},
    notes: {},
    turns: { turnsStarted: 1, turnsApplied: 1 },
    extraSteps: {},
    settleWindowMs: 5120,
    status: { isUpdating: false, error: null },
    now: 10,
    replies: {},
    discarded: {},
  })
  return { ledger, row: view.needsYou.tasks[0]! }
}

function buttons(root: HTMLElement) {
  return [...root.querySelectorAll('button')]
}

function named(root: HTMLElement, label: string) {
  const button = buttons(root).find(b => b.textContent === label)
  assert.ok(button, `${label} is available`)
  return button
}

test('the Codex renderer preserves retry, folded-option and finding action order, maps emphasis, and guards presses', async () => {
  const { row, ledger } = task()
  let state = ledger
  let retried: PressResult | null = null
  const actions = ledgerActions(
    {
      ...row,
      feedback: {
        is: 'notSent',
        reason: 'queue failed',
        retry: { action: 'step', id: row.id, step: 0, label: 'Run tests' },
      },
    },
    false,
    null,
    {
      press: p => {
        const result = applyPress(state, undefined, p, { now: 20, turnsStarted: 1, extraSteps: [] })
        assert.ok(!('stale' in result))
        retried = result
        state = result.ledger
      },
      reply: () => {},
      discard: () => {},
      showOptions: () => {},
    },
  )
  const root = document.createElement('div')
  document.body.append(root)
  let guarded = true
  const draw = () =>
    render(h(RowActions, { actions: [...actions.keys, ...actions.more], reply: null, isBlocked: () => guarded }), root)
  await act(draw)
  assert.deepEqual(
    buttons(root).map(b => b.textContent),
    ['Try again', 'Run tests', 'Done', 'Reply', 'Explain'],
  )
  assert.equal(named(root, 'Done').classList.contains('primary'), true)
  assert.equal(named(root, 'Run tests').classList.contains('primary'), false)
  await act(() => named(root, 'Done').click())
  assert.equal(state.closed.length, 0)
  guarded = false
  await act(draw)
  await act(() => named(root, 'Try again').click())
  const retriedPress = retried as PressResult | null
  assert.ok(retriedPress && !('stale' in retriedPress))
  assert.ok(retriedPress.effects.some(effect => effect.kind === 'send' && effect.text.includes('npm test')))
  assert.equal(state.closed.length, 0)
  const questionLedger: Ledger = {
    ...ledger,
    items: [
      {
        ...ledger.items[0]!,
        kind: 'question',
        ask: 'Which option?',
        options: ['A', 'B', 'C', 'D', 'E', 'F'],
        rec: 'A',
        isDesignChoice: true,
      },
    ],
  }
  const question = inboxView({
    ledger: questionLedger,
    lastActions: {},
    notes: {},
    turns: { turnsStarted: 1, turnsApplied: 1 },
    extraSteps: {},
    settleWindowMs: 5120,
    status: { isUpdating: false, error: null },
    now: 10,
    replies: {},
    discarded: {},
  }).needsYou.questions[0]!
  let allOptions = false
  let answer: PressResult | null = null
  const drawQuestion = () => {
    const choices = ledgerActions(question, allOptions, null, {
      press: p => {
        answer = applyPress(questionLedger, undefined, p, { now: 20, turnsStarted: 1, extraSteps: [] })
      },
      reply: () => {},
      discard: () => {},
      showOptions: () => {
        allOptions = true
        drawQuestion()
      },
    })
    render(h(RowActions, { actions: [...choices.keys, ...choices.more], reply: null, isBlocked: () => false }), root)
  }
  await act(drawQuestion)
  assert.deepEqual(
    buttons(root).map(b => b.textContent),
    ['A (recommended)', 'B', 'C', 'D', 'All 6 options', 'Run tests', 'Reply', 'Explain', 'Compare', 'Dismiss'],
  )
  await act(() => named(root, 'All 6 options').click())
  assert.ok(named(root, 'F'))
  await act(() => named(root, 'F').click())
  const answered = answer as PressResult | null
  assert.ok(answered && !('stale' in answered))
  assert.equal(answered.ledger.closed[0]?.outcome, 'F')
  const findingLedger = recordItem(
    CODEX,
    EMPTY,
    { kind: 'finding', finding_kind: 'issue', title: 'Missing retry limit', detail: 'The request loops.' },
    1,
  ).ledger
  const finding = inboxView({
    ledger: findingLedger,
    lastActions: {},
    notes: {},
    turns: { turnsStarted: 1, turnsApplied: 1 },
    extraSteps: {},
    settleWindowMs: 5120,
    status: { isUpdating: false, error: null },
    now: 10,
    replies: {},
    discarded: {},
  }).findings.rows[0]!
  let discussion: PressResult | null = null
  const followUps = ledgerActions(finding, false, null, {
    press: p => {
      discussion = applyPress(findingLedger, undefined, p, { now: 20, turnsStarted: 1, extraSteps: [] })
    },
    reply: () => {},
    discard: () => {},
    showOptions: () => {},
  })
  await act(() =>
    render(
      h(RowActions, { actions: [...followUps.keys, ...followUps.more], reply: null, isBlocked: () => false }),
      root,
    ),
  )
  assert.deepEqual(
    buttons(root).map(b => b.textContent),
    ['Fix', 'File issue', 'Reply', 'Explain', 'Discuss', 'Dismiss'],
  )
  await act(() => named(root, 'Discuss').click())
  const discussed = discussion as PressResult | null
  assert.ok(discussed && !('stale' in discussed))
  assert.equal(discussed.last?.kind, 'talk')
  assert.equal(discussed.ledger.findings[0]?.id, finding.id)
  await act(() => render(null, root))
  root.remove()
})

test('the actual Codex tab replaces actions and shortcuts while replying, restores a cancelled draft, sends its current words, and keeps them when the send cannot be confirmed', async () => {
  const state = emptyState('renderer')
  state.ledger = task().ledger
  state.heard.startAt = 1
  state.presence = {
    turnsStarted: 1,
    turnsApplied: 1,
    isUpdating: false,
    isTurnRunning: false,
    ledgerState: 'current',
    hasDroppedReply: false,
  }
  document.body.innerHTML = '<div id="app"></div>'
  Object.defineProperty(window, '__inboxPage', { value: 'renderer-page', configurable: true })
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  Object.defineProperty(media, 'matches', { value: true })
  const globals = {
    parent: window.parent,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    KeyboardEvent: window.KeyboardEvent,
    sessionStorage: window.sessionStorage,
    matchMedia: () => media,
    getComputedStyle: window.getComputedStyle.bind(window),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    DEMO_BUTTON: false,
    DEMO_RECORDING: false,
  }
  const previous = new Map(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  const presses: RowPress[] = []
  let isUnconfirmed = false
  let pressesAnswered = 0
  const tabView = (holds?: Partial<ReplyHolds>): TabView => ({
    ...viewOf(state, Date.now(), { replies: holds?.replies ?? {}, discarded: holds?.discarded ?? {} }),
    thread: state.sessionId,
    devPage: 'renderer-page',
    serverBuild: SERVER_BUILD,
    isFetchingPrs: false,
    isGhMissing: false,
  })
  window.parent.postMessage = message => {
    const request = message as {
      id?: number
      method: string
      params?: { name?: string; arguments?: { press?: RowPress } & Partial<ReplyHolds> }
    }
    if (request.id === undefined) return
    let result: unknown
    if (request.method === 'ui/initialize') result = {}
    else if (request.params?.name === 'inbox_view') result = { structuredContent: tabView(request.params.arguments) }
    else if (request.params?.name === 'inbox_press') {
      const press = request.params.arguments?.press
      assert.ok(press)
      presses.push(press)
      const applied = applyPress(state.ledger, state.lastActions[press.id], press, {
        now: Date.now(),
        turnsStarted: 1,
        extraSteps: [],
      })
      assert.ok(!('stale' in applied))
      state.ledger = applied.ledger
      if (applied.last) state.lastActions[press.id] = applied.last
      result = {
        structuredContent: {
          view: tabView(request.params.arguments),
          copy: null,
          error: null,
          note: null,
          ...(isUnconfirmed ? { delivery: 'unconfirmed' } : {}),
        },
      }
    } else throw new Error(`Unexpected request: ${request.method} ${request.params?.name ?? ''}`)
    queueMicrotask(() => {
      window.dispatchEvent(new window.MessageEvent('message', { data: { jsonrpc: '2.0', id: request.id, result } }))
      if (request.params?.name === 'inbox_press') pressesAnswered++
    })
  }
  const root = document.getElementById('app')!
  const until = async (ready: () => boolean) => {
    for (let n = 0; n < 50 && !ready(); n++) await new Promise<void>(resolve => setImmediate(resolve))
    assert.ok(ready())
  }
  try {
    await import('../src/tab')
    await until(() => buttons(root).some(b => b.textContent === 'Reply'))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    await until(() => presses.length === 1)
    assert.deepEqual(presses[0], { action: 'explain', id: 'i1' })
    assert.equal(state.ledger.items[0]?.id, 'i1')
    assert.equal(state.lastActions.i1?.kind, 'talk')
    named(root, 'Reply').click()
    const input = root.querySelector('input')!
    assert.ok(input)
    assert.equal(document.activeElement, input)
    assert.deepEqual(
      buttons(root).filter(b => ['Run tests', 'Done', 'Reply', 'Explain'].includes(b.textContent ?? '')),
      [],
    )
    named(root, 'Cancel').focus()
    named(root, 'Cancel').dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))
    named(root, 'Cancel').dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }))
    assert.equal(presses.length, 1)
    named(root, 'Send').click()
    assert.equal(presses.length, 1)
    assert.equal(root.querySelector('input'), input)
    input.value = '  Waiting for access  '
    input.dispatchEvent(new Event('input', { bubbles: true }))
    named(root, 'Cancel').click()
    assert.equal(root.querySelector('input'), null)
    named(root, 'Reply').click()
    assert.equal(root.querySelector('input')!.value, '  Waiting for access  ')
    assert.equal(document.activeElement, root.querySelector('input'))
    named(root, 'Send').click()
    await until(() => state.lastActions.i1?.kind === 'handoff' && root.querySelector('input') === null)
    assert.deepEqual(presses, [
      { action: 'explain', id: 'i1' },
      { action: 'type', id: 'i1', text: 'Waiting for access' },
    ])
    assert.equal(state.ledger.items[0]?.id, 'i1')
    assert.equal(root.querySelector('input'), null)

    const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
    await until(() => root.querySelector('.row.selected') === null)
    root.querySelector<HTMLElement>('.row .line')!.click()
    await pause(PRESS_GUARD_MS + 50)
    named(root, 'Reply').click()
    const unconfirmed = root.querySelector('input')!
    unconfirmed.value = 'Still blocked'
    unconfirmed.dispatchEvent(new Event('input', { bubbles: true }))
    isUnconfirmed = true
    named(root, 'Send').click()
    await until(() => pressesAnswered === 3 && root.querySelector('input') === null)
    isUnconfirmed = false
    named(root, 'Reply').click()
    const held = root.querySelector('input')!
    assert.equal(held.value, 'Still blocked')
    state.ledger = recordClose(CODEX, state.ledger, { id: 'i1', reason: 'the build passed' }, Date.now()).ledger
    await pause(POLL_MS + 100)
    assert.equal(root.querySelector('input'), held)
    assert.equal(held.value, 'Still blocked')
    assert.equal(document.activeElement, held)
    assert.match(root.textContent ?? '', /Closed by Codex: the build passed/)
    assert.deepEqual(
      buttons(root)
        .map(b => b.textContent)
        .filter(label => label === 'Cancel' || label === 'Discard'),
      ['Discard'],
    )
    named(root, 'Discard').click()
    assert.equal(root.querySelector('input'), null)
    await until(() => !buttons(root).some(b => b.textContent === 'Reply' || b.textContent === 'Discard'))
    assert.doesNotMatch(root.textContent ?? '', /the build passed/)
    await pause(POLL_MS + 100)
    assert.doesNotMatch(root.textContent ?? '', /the build passed/)
    assert.equal(presses.length, 3)
  } finally {
    await window.happyDOM.abort()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

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
    assert.equal(document.getElementById('app'), workingRoot)
    assert.equal(document.querySelector('input')?.value, 'Keep these exact words')
    assert.equal(document.activeElement, input)
    html = TAB_HTML.replace('</head>', '<meta name="test-page" content="next"></head>')
    await until(() => initialized === 2 && host.document.querySelector('input')?.value === 'Keep these exact words')
    assert.equal(host.document.activeElement, host.document.querySelector('input'))
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
    assert.equal(document.querySelector('input'), null)
    button('Reply')!.click()
    assert.equal(document.querySelector('input')?.value, 'Keep these exact words')
    button('Send')!.click()
    await until(() => document.getElementById('app')?.textContent?.includes('Not confirmed') ?? false)
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
