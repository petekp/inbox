import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Window } from 'happy-dom'
import { EMPTY } from '../../hooks/ledger'
import { EMPTY_OVERVIEW } from '../../hooks/overview'
import { recordItem } from '../../hooks/tools'
import { CODEX } from '../src/texts'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'
import { POLL_MS } from '../src/settle'

const window = new Window()
Object.assign(globalThis, { window, document: window.document, Event: window.Event })
after(() => window.happyDOM.close())

test('the Codex tab draws the Overview page from the view, and new rows, j and k leave it in place', async () => {
  const now = Date.now()
  const state = emptyState('overview')
  state.heard.startAt = 1
  state.ledger = {
    ...EMPTY,
    overview: {
      ...EMPTY_OVERVIEW,
      headline: 'Shipping the Overview tab',
      status: 'Reviewing the diff.',
      queue: [
        { status: 'working', text: 'Check the omp panel', detail: 'Reading the draw code' },
        { status: 'waits-on-you', text: 'Pick the label', detail: null },
        { status: 'done', text: 'Built the page', detail: null },
      ],
    },
  }
  state.presence = { ...state.presence, isTurnRunning: true }
  document.body.innerHTML = '<div id="app"></div>'
  Object.defineProperty(window, '__inboxPage', { value: 'overview-page', configurable: true })
  Object.defineProperty(window, '__inboxKept', {
    value: {
      version: 2,
      isDemo: false,
      tab: 'overview',
      selection: { needsYou: null, findings: null, prs: null },
      typing: null,
      drafts: [],
      optionsShown: [],
      unfolded: [],
    },
    configurable: true,
    writable: true,
  })
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
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
  const shownTabs: unknown[] = []
  let isOlderServer = false
  window.parent.postMessage = message => {
    const request = message as {
      id?: number
      method: string
      params?: { name?: string; arguments?: { tab?: unknown } }
    }
    if (request.id === undefined) return
    let result: unknown
    if (request.method === 'ui/initialize') result = {}
    else if (request.params?.name === 'inbox_view') {
      shownTabs.push(request.params.arguments?.tab)
      const view: TabView = {
        ...viewOf(state, Date.now()),
        thread: state.sessionId,
        devPage: 'overview-page',
        serverBuild: SERVER_BUILD,
        isFetchingPrs: false,
        isGhMissing: false,
      }
      if (isOlderServer) Reflect.deleteProperty(view, 'overviewPage')
      result = { structuredContent: view }
    } else throw new Error(`Unexpected request: ${request.method} ${request.params?.name ?? ''}`)
    queueMicrotask(() =>
      window.dispatchEvent(new window.MessageEvent('message', { data: { jsonrpc: '2.0', id: request.id, result } })),
    )
  }
  const root = document.getElementById('app')!
  const until = async (ready: () => boolean) => {
    for (let n = 0; n < 50 && !ready(); n++) await new Promise<void>(resolve => setImmediate(resolve))
    assert.ok(ready())
  }
  const tabLabels = () => [...root.querySelectorAll('.tab')].map(b => b.textContent)
  const shownTab = () => root.querySelector('.tab.shown')?.textContent
  const key = (k: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  try {
    await import('../src/tab')
    await until(() => root.querySelector('.overview-goal') !== null)
    assert.deepEqual(tabLabels(), ['Needs you', 'Findings', 'PRs', 'Overview'])
    assert.equal(shownTab(), 'Overview')
    assert.equal(shownTabs[0], 'overview')
    assert.equal(root.querySelector('.overview-goal')?.textContent, 'Shipping the Overview tab')
    assert.equal(root.querySelector('.overview-now')?.textContent, 'Working…')
    assert.deepEqual(
      [...root.querySelectorAll('main .row')].map(r => [
        r.querySelector('.mark')?.className,
        r.querySelector('.mark')?.textContent,
        r.querySelector('.content')?.textContent,
      ]),
      [
        ['mark', '●', 'Check the omp panelReading the draw code'],
        ['mark needsYou', '◆', 'Pick the label'],
        ['mark done', '✓', 'Built the page'],
      ],
    )
    assert.equal(root.querySelectorAll('main button').length, 0)

    key('j')
    key('k')
    state.ledger = recordItem(
      CODEX,
      state.ledger,
      { kind: 'finding', title: 'The bar wraps at 320 px', detail: 'Four tabs need two lines.' },
      Date.now(),
    ).ledger
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    assert.equal(shownTab(), 'Overview')
    assert.equal(root.querySelector('.row.selected'), null)
    assert.deepEqual(tabLabels(), ['Needs you', 'Findings1', 'PRs', 'Overview'])

    key('2')
    assert.equal(shownTab(), 'Findings1')
    assert.match(root.textContent ?? '', /The bar wraps at 320 px/)
    key('4')
    assert.equal(shownTab(), 'Overview')
    assert.ok(root.querySelector('.overview-goal'))

    isOlderServer = true
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    assert.equal(shownTab(), 'Needs you')
    assert.equal(root.querySelector('.overview-goal'), null)
    assert.equal(shownTabs.at(-1), 'overview')
    isOlderServer = false
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    assert.equal(shownTab(), 'Overview')
    assert.ok(root.querySelector('.overview-goal'))
  } finally {
    await window.happyDOM.abort()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
