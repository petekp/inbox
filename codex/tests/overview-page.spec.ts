import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Window } from 'happy-dom'
import { EMPTY } from '../../hooks/ledger'
import { EMPTY_OVERVIEW } from '../../hooks/overview'
import { recordItem } from '../../hooks/tools'
import { TABS } from '../../hooks/view'
import { CODEX } from '../src/texts'
import { emptyState } from '../src/state'
import { lookOnView, viewOf } from '../src/core'
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
  const spokenText = (b: Element) =>
    [...b.children]
      .filter(c => c.getAttribute('aria-hidden') !== 'true')
      .map(c => c.textContent)
      .join('')
  const tabLabels = () => [...root.querySelectorAll('.tab')].map(spokenText)
  const shownTab = () => {
    const shown = root.querySelector('.tab.shown')

    return shown ? spokenText(shown) : undefined
  }
  const key = (k: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
  try {
    await import('../src/tab')
    await until(() => root.querySelector('.overview-goal') !== null)
    assert.deepEqual(tabLabels(), ['Overview', 'Asks', 'Finds', 'PRs'])
    assert.deepEqual(
      [...root.querySelectorAll('.tab')].map(b => [
        b.getAttribute('title'),
        b.querySelector('.tab-symbol')?.textContent,
      ]),
      TABS.map(t => [t.label, t.symbol]),
    )
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
        ['mark running', '●', 'Check the omp panelReading the draw code'],
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
    assert.deepEqual(tabLabels(), ['Overview', 'Asks', 'Finds1', 'PRs'])

    key('3')
    assert.equal(shownTab(), 'Finds1')
    assert.match(root.textContent ?? '', /The bar wraps at 320 px/)
    key('1')
    assert.equal(shownTab(), 'Overview')
    assert.ok(root.querySelector('.overview-goal'))

    isOlderServer = true
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    assert.equal(shownTab(), 'Asks')
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

test('a look starts when the tab shows the Overview, ends when it shows another tab, and ends at the last request when the pane closed', () => {
  const state = emptyState('look')
  state.ledger = {
    ...EMPTY,
    overview: { ...EMPTY_OVERVIEW, headline: 'h', since: [{ status: 'done', text: 'Changed', detail: null }] },
  }
  state.tabSeenAt = 1000
  const open = lookOnView(state, 'overview', 2000)
  assert.equal(open.ledger.overview?.look?.startedAt, 2000)

  const seen = lookOnView({ ...open, tabSeenAt: 2000 }, 'needsYou', 3000)
  assert.equal(seen.ledger.overview?.look, null)
  assert.equal(seen.ledger.overview?.lastLookAt, 3000)
  assert.deepEqual(seen.ledger.overview?.since, [])

  const closed = lookOnView({ ...open, tabSeenAt: 2000 }, 'needsYou', 2000 + 60_000)
  assert.equal(closed.ledger.overview?.lastLookAt, 2000)

  const never = lookOnView(state, 'needsYou', 2000)
  assert.equal(never.ledger.overview?.lastLookAt, null)
  assert.equal(never.ledger.overview?.since.length, 1)
})
