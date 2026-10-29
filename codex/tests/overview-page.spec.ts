import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Window } from 'happy-dom'
import { closeItem, EMPTY } from '../../hooks/ledger'
import { applyOverview, LOOK_MIN_MS, parseOverview } from '../../hooks/overview'
import { recordItem } from '../../hooks/tools'
import { shownTabs } from '../../hooks/view'
import { CODEX } from '../src/texts'
import { emptyState } from '../src/state'
import { lookOnView, viewOf } from '../src/core'
import type { TabView } from '../src/core'
import { POLL_MS } from '../src/settle'

const window = new Window()
Object.assign(globalThis, { window, document: window.document, Event: window.Event })
after(() => window.happyDOM.close())

test('the Codex tab draws the Overview page from a next build’s view, and new rows and keys leave it in place, a held subject’s Answer shows Asks with its ask selected until the ask closes, while a release build’s view draws Asks for it, and only a next build names on an Asks row the subject it holds up', async () => {
  const now = Date.now()
  const state = emptyState('overview')
  state.heard.startAt = 1
  const asked = recordItem(
    CODEX,
    EMPTY,
    { kind: 'question', ask: 'Which label?', options: ['Tab', 'Page'] },
    now,
  ).ledger
  const shownOverview = {
    ...applyOverview(
      null,
      parseOverview(
        [
          'HEAD: Shipping the Overview tab | Drawing the Overview in the Codex tab',
          'NEW: working | omp panel | reading the draw code',
          'NEW: working | Label | pick one',
          `LINK: ${asked.items[0]!.id} | Label`,
          'NEW: working | Page | being built',
          'DONE: s3 | built',
        ].join('\n'),
      )!,
      now,
      new Set(asked.items.map(i => i.id)),
    )!,
    look: { startedAt: now },
  }
  state.ledger = { ...asked, overview: shownOverview }
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
  const sentTabs: unknown[] = []
  let isOlderServer = false
  let isNextBuild = true
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
      sentTabs.push(request.params.arguments?.tab)
      const view: TabView = {
        ...viewOf(state, Date.now()),
        thread: state.sessionId,
        devPage: 'overview-page',
        serverBuild: SERVER_BUILD,
        isFetchingPrs: false,
        isGhMissing: false,
        ...(isNextBuild ? { isNextBuild: true } : {}),
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
    await until(() => root.querySelector('.overview-head') !== null)
    assert.deepEqual(tabLabels(), ['Overview', 'Asks1', 'Finds', 'PRs'])
    assert.deepEqual(
      [...root.querySelectorAll('.tab')].map(b => [
        b.getAttribute('title'),
        b.querySelector('.tab-symbol')?.textContent,
      ]),
      shownTabs(true).map(t => [t.label, t.symbol]),
    )
    assert.equal(shownTab(), 'Overview')
    assert.equal(sentTabs[0], 'overview')
    assert.equal(root.querySelector('.overview-head h1')?.textContent, 'Shipping the Overview tab')
    assert.deepEqual(
      [...root.querySelectorAll('main .row')].map(r => [
        r.querySelector('.mark')?.className,
        r.querySelector('.mark')?.textContent,
        [...(r.querySelector('.content')?.children ?? [])].map(line => line.textContent),
      ]),
      [
        ['mark tone-needsYou', '◆', ['Label · waiting', 'pick one', 'Answer']],
        ['mark running', '●', ['omp panel', 'reading the draw code']],
        ['mark done', '✓', ['Page', 'built']],
      ],
    )
    assert.deepEqual(
      [...root.querySelectorAll('main button')].map(b => b.textContent),
      ['Answer'],
    )

    key('j')
    key('k')
    key('a')
    state.ledger = recordItem(
      CODEX,
      state.ledger,
      { kind: 'finding', title: 'The bar wraps at 320 px', detail: 'Four tabs need two lines.' },
      Date.now(),
    ).ledger
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    assert.equal(shownTab(), 'Overview')
    assert.equal(root.querySelector('.row.selected'), null)
    assert.deepEqual(tabLabels(), ['Overview', 'Asks1', 'Finds1', 'PRs'])

    key('3')
    assert.equal(shownTab(), 'Finds1')
    assert.match(root.textContent ?? '', /The bar wraps at 320 px/)
    key('1')
    assert.equal(shownTab(), 'Overview')
    assert.ok(root.querySelector('.overview-head'))
    key('2')
    assert.equal(shownTab(), 'Asks1')
    assert.equal(root.querySelector('main .holds-up')?.textContent, 'Holds up Label')
    key('1')
    assert.equal(shownTab(), 'Overview')
    ;(root.querySelector('main.overview .actions button') as HTMLElement).click()
    assert.equal(shownTab(), 'Asks1')
    assert.match(root.querySelector('.row.selected')?.textContent ?? '', /Which label\?/)
    key('1')
    assert.equal(shownTab(), 'Overview')

    isOlderServer = true
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    assert.equal(shownTab(), 'Asks1')
    assert.equal(root.querySelector('.overview-head'), null)
    assert.equal(sentTabs.at(-1), 'overview')
    isOlderServer = false
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    assert.equal(shownTab(), 'Overview')
    assert.ok(root.querySelector('.overview-head'))

    isNextBuild = false
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    assert.deepEqual(tabLabels(), ['Asks1', 'Finds1', 'PRs'])
    assert.deepEqual(
      [...root.querySelectorAll('.tab')].map(b => b.getAttribute('title')),
      shownTabs(false).map(t => t.label),
    )
    assert.equal(shownTab(), 'Asks1')
    assert.equal(root.querySelector('.overview-head'), null)
    assert.equal(root.querySelector('main .holds-up'), null)
    key('4')
    assert.equal(shownTab(), 'Asks1')
    isNextBuild = true
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    assert.equal(shownTab(), 'Overview')
    isNextBuild = false
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    key('3')
    assert.equal(shownTab(), 'PRs')
    key('1')
    assert.equal(shownTab(), 'Asks1')

    isNextBuild = true
    state.ledger = closeItem(state.ledger, asked.items[0]!.id, { how: 'claude', outcome: 'answered in chat' }, now)
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    key('1')
    assert.equal(shownTab(), 'Overview')
    assert.ok(root.querySelector('.overview-head'))
    assert.ok(![...root.querySelectorAll('main .mark')].some(m => m.textContent === '◆'))
    assert.equal(root.querySelectorAll('main button').length, 0)
  } finally {
    await window.happyDOM.abort()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

test('a look starts when the tab shows the Overview, ends when it shows another tab, ends at the last request when the pane closed, and counts once it lasted five seconds', () => {
  const state = emptyState('look')
  state.ledger = {
    ...EMPTY,
    overview: applyOverview(
      null,
      parseOverview('HEAD: Ship it | Shipping the first version\nNEW: queued | Docs | after the code')!,
      500,
      new Set(),
    ),
  }
  state.tabSeenAt = 1000
  const open = lookOnView(state, 'overview', 2000)
  assert.equal(open.ledger.overview?.look?.startedAt, 2000)

  const seen = lookOnView({ ...open, tabSeenAt: 2000 }, 'needsYou', 2000 + LOOK_MIN_MS)
  assert.equal(seen.ledger.overview?.look, null)
  assert.equal(seen.ledger.overview?.lastLookAt, 2000 + LOOK_MIN_MS)

  const passed = lookOnView({ ...open, tabSeenAt: 2000 }, 'needsYou', 3000)
  assert.equal(passed.ledger.overview?.look, null)
  assert.equal(passed.ledger.overview?.lastLookAt, null)

  const closed = lookOnView({ ...open, tabSeenAt: 2000 + LOOK_MIN_MS }, 'needsYou', 2000 + 60_000)
  assert.equal(closed.ledger.overview?.lastLookAt, 2000 + LOOK_MIN_MS)

  const never = lookOnView(state, 'needsYou', 2000)
  assert.equal(never.ledger.overview?.lastLookAt, null)
})
