import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Window } from 'happy-dom'
import { EMPTY } from '../../hooks/ledger'
import { closeItem } from '../../hooks/ledger-close'
import { parseStatus } from '../../hooks/status'
import { LOOK_MIN_MS } from '../../hooks/status-children'
import { applyStatus } from '../../hooks/status-ops'
import { goalPressed } from '../../hooks/goal-press'
import type { RowPress } from '../../hooks/presses'
import { recordItem } from '../../hooks/tools'
import { shownTabs } from '../../hooks/tabs'
import { CODEX } from '../src/texts'
import { emptyState } from '../src/state'
import { lookOnView, viewOf } from '../src/core'
import type { TabView } from '../src/core'
import { POLL_MS } from '../src/settle'

const window = new Window()
Object.assign(globalThis, { window, document: window.document, Event: window.Event })
after(() => window.happyDOM.close())

test('the Codex tab draws the Status page from a next build’s view, and new rows and keys leave it in place, a held subject’s View shows Asks with its ask selected until the ask closes, while a release build’s view draws Asks for it, only a next build names on an Asks row the subject it holds up, and a proposed goal, a set goal with its Now line and Change goal’s field draw in place', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const now = Date.now()
  const state = emptyState('overview')
  state.heard.startAt = 1
  const asked = recordItem(
    CODEX,
    EMPTY,
    { kind: 'question', ask: 'Which label?', options: ['Tab', 'Page'] },
    now,
  ).ledger
  const shownStatus = {
    ...applyStatus(
      null,
      parseStatus(
        [
          'HEAD: Shipping the Status tab | Drawing the Status in the Codex tab',
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
  state.ledger = { ...asked, overview: shownStatus }
  state.presence = { ...state.presence, isTurnRunning: true }
  document.body.innerHTML = '<div id="app"></div>'
  Object.defineProperty(window, '__inboxPage', { value: 'status-page', configurable: true })
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
    DEMO_BUTTON: false,
    DEMO_RECORDING: false,
  }
  const previous = new Map(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  const windowTimers = { setTimeout, clearTimeout }
  for (const [key, value] of Object.entries(windowTimers))
    Object.defineProperty(window, key, { value, writable: true, configurable: true })
  const sentTabs: unknown[] = []
  const presses: RowPress[] = []
  let isOlderServer = false
  let isNextBuild = true
  window.parent.postMessage = message => {
    const request = message as {
      id?: number
      method: string
      params?: { name?: string; arguments?: { tab?: unknown; press?: RowPress } }
    }
    if (request.id === undefined) return
    let result: unknown
    const viewNow = (): TabView => ({
      ...viewOf(state, Date.now()),
      thread: state.sessionId,
      devPage: 'status-page',
      serverBuild: SERVER_BUILD,
      isFetchingPrs: false,
      isGhMissing: false,
      ...(isNextBuild ? { isNextBuild: true } : {}),
    })
    if (request.method === 'ui/initialize') result = {}
    else if (request.params?.name === 'inbox_view') {
      sentTabs.push(request.params.arguments?.tab)
      const view = viewNow()
      if (isOlderServer) Reflect.deleteProperty(view, 'statusPage')
      result = { structuredContent: view }
    } else if (request.params?.name === 'inbox_press' && request.params.arguments?.press) {
      const press = request.params.arguments.press
      presses.push(press)
      const at = Date.now()
      const r = goalPressed(state.ledger, press, kind => ({ kind, action: press.action, text: '', at }), at)
      if ('ledger' in r) state.ledger = r.ledger
      result = { structuredContent: { view: viewNow(), error: null, note: null } }
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
  const afterPoll = async () => {
    context.mock.timers.tick(POLL_MS + 100)
    await new Promise<void>(resolve => setImmediate(resolve))
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
    await until(() => root.querySelector('.status-head') !== null)
    assert.deepEqual(tabLabels(), ['Status', 'Asks1', 'Finds', 'PRs'])
    assert.deepEqual(
      [...root.querySelectorAll('.tab')].map(b => [
        b.getAttribute('title'),
        b.querySelector('.tab-symbol')?.textContent,
      ]),
      shownTabs(true).map(t => [t.label, t.symbol]),
    )
    assert.equal(shownTab(), 'Status')
    assert.equal(sentTabs[0], 'overview')
    assert.equal(root.querySelector('.status-head h1')?.textContent, 'Shipping the Status tab')
    assert.deepEqual(
      [...root.querySelectorAll('main .row')].map(r => [
        r.querySelector('.mark')?.className,
        r.querySelector('.mark')?.textContent,
        [...(r.querySelector('.content')?.children ?? [])].map(line => line.textContent),
      ]),
      [
        ['mark tone-needsYou', '◆', ['Label · waiting', 'pick one', 'View question']],
        ['mark running', '●', ['omp panel', 'reading the draw code']],
        ['mark done', '✓', ['Page', 'built']],
      ],
    )
    assert.deepEqual(
      [...root.querySelectorAll('main button')].map(b => [b.textContent, b.className]),
      [
        ['Set a goal', 'key ghost'],
        ['View question', 'key'],
      ],
    )

    key('j')
    key('k')
    key('v')
    state.ledger = recordItem(
      CODEX,
      state.ledger,
      { kind: 'finding', title: 'The bar wraps at 320 px', detail: 'Four tabs need two lines.' },
      Date.now(),
    ).ledger
    await afterPoll()
    assert.equal(shownTab(), 'Status')
    assert.ok(root.querySelector('.row.selected') === null, 'a row is open')
    assert.deepEqual(tabLabels(), ['Status', 'Asks1', 'Finds1', 'PRs'])

    key('3')
    assert.equal(shownTab(), 'Finds1')
    assert.match(root.textContent ?? '', /The bar wraps at 320 px/)
    key('1')
    assert.equal(shownTab(), 'Status')
    assert.ok(root.querySelector('.status-head'))
    key('2')
    assert.equal(shownTab(), 'Asks1')
    assert.equal(root.querySelector('main .holds-up')?.textContent, '◆ Holds up Label')
    key('1')
    assert.equal(shownTab(), 'Status')
    ;(root.querySelector('main.status-page .list .actions button') as HTMLElement).click()
    assert.equal(shownTab(), 'Asks1')
    assert.match(root.querySelector('.row.selected')?.textContent ?? '', /Which label\?/)
    key('1')
    assert.equal(shownTab(), 'Status')

    isOlderServer = true
    await afterPoll()
    assert.equal(shownTab(), 'Asks1')
    assert.ok(root.querySelector('.status-head') === null, 'the Status page is drawn')
    assert.equal(sentTabs.at(-1), 'overview')
    isOlderServer = false
    await afterPoll()
    assert.equal(shownTab(), 'Status')
    assert.ok(root.querySelector('.status-head'))

    isNextBuild = false
    await afterPoll()
    assert.deepEqual(tabLabels(), ['Asks1', 'Finds1', 'PRs'])
    assert.deepEqual(
      [...root.querySelectorAll('.tab')].map(b => b.getAttribute('title')),
      shownTabs(false).map(t => t.label),
    )
    assert.equal(shownTab(), 'Asks1')
    assert.ok(root.querySelector('.status-head') === null, 'the Status page is drawn')
    assert.ok(root.querySelector('main .holds-up') === null, 'a row names what it holds up')
    key('4')
    assert.equal(shownTab(), 'Asks1')
    isNextBuild = true
    await afterPoll()
    assert.equal(shownTab(), 'Status')
    isNextBuild = false
    await afterPoll()
    key('3')
    assert.equal(shownTab(), 'PRs')
    key('1')
    assert.equal(shownTab(), 'Asks1')

    isNextBuild = true
    state.ledger = closeItem(state.ledger, asked.items[0]!.id, { how: 'claude', outcome: 'answered in chat' }, now)
    await afterPoll()
    key('1')
    assert.equal(shownTab(), 'Status')
    assert.ok(root.querySelector('.status-head'))
    assert.ok(![...root.querySelectorAll('main .mark')].some(m => m.textContent === '◆'))
    assert.deepEqual(
      [...root.querySelectorAll('main button')].map(b => b.textContent),
      ['Set a goal'],
    )

    const proposing = applyStatus(
      state.ledger.overview,
      parseStatus('GOAL: Status tab shipped | done Page; queued Label')!,
      now,
      new Set(),
    )!
    state.ledger = { ...state.ledger, overview: proposing }
    await afterPoll()
    const buttons = () => [...root.querySelectorAll('main button')].map(b => b.textContent)
    assert.equal(root.querySelector('.goal-proposed')?.textContent, '✓ Page○ Label')
    assert.deepEqual(buttons(), ['Use this goal', 'Edit', 'Not now', 'Set a goal'])

    const click = async (label: string) => {
      ;([...root.querySelectorAll('main button')].find(b => b.textContent === label) as HTMLElement).click()
      await new Promise<void>(resolve => setImmediate(resolve))
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    await click('Use this goal')
    assert.deepEqual(presses, [{ action: 'use-goal', id: 'goal' }])
    assert.deepEqual(
      [...root.querySelectorAll('.status-head.goal > *')].map(e => e.textContent),
      ['Goal · 1 of 2 done', 'Status tab shipped'],
    )
    assert.equal(
      root.querySelector('.status-head:not(.goal) p')?.textContent,
      'Now: Drawing the Status in the Codex tab',
    )
    assert.equal(root.querySelector('.status-head:not(.goal) h1'), null)
    assert.deepEqual(buttons(), ['Change goal'])
    await click('Change goal')
    assert.equal((root.querySelector('#type-goal') as HTMLInputElement | null)?.value, 'Status tab shipped')
    assert.equal(root.querySelector('.status-head.goal h1'), null)
    await click('Cancel')
    assert.equal(root.querySelector('#type-goal'), null)
    assert.equal(root.querySelector('.status-head.goal h1')?.textContent, 'Status tab shipped')

    await click('Change goal')
    const field = window.document.querySelector('#type-goal')!
    Object.assign(field, { value: 'Status tab in the store' })
    field.dispatchEvent(new window.Event('input', { bubbles: true }))
    await click('Set goal')
    assert.deepEqual(presses.at(-1), { action: 'type', id: 'goal', text: 'Status tab in the store' })
    assert.equal(root.querySelector('#type-goal'), null)
    assert.equal(root.querySelector('.status-head.goal h1')?.textContent, 'Status tab in the store')
    assert.equal(root.querySelector('.status-head.goal p:last-child')?.textContent, 'Milestones after the next reply')
  } finally {
    for (const key of Object.keys(windowTimers)) Reflect.deleteProperty(window, key)
    await window.happyDOM.abort()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

test('a look starts when the tab shows the Status, ends when it shows another tab, ends at the last request when the pane closed, and counts once it lasted five seconds', () => {
  const state = emptyState('look')
  state.ledger = {
    ...EMPTY,
    overview: applyStatus(
      null,
      parseStatus('HEAD: Ship it | Shipping the first version\nNEW: queued | Docs | after the code')!,
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
