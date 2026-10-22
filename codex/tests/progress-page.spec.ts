import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { Window } from 'happy-dom'
import { EMPTY } from '../../hooks/ledger'
import { DOT } from '../../hooks/view'
import { recordItem } from '../../hooks/tools'
import { CODEX } from '../src/texts'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'
import { POLL_MS } from '../src/settle'

const window = new Window()
Object.assign(globalThis, { window, document: window.document, Event: window.Event })
after(() => window.happyDOM.close())

test('the Codex tab draws the Progress page from the view, and new rows, j and k leave it in place', async () => {
  const now = Date.now()
  const state = emptyState('progress')
  state.heard.startAt = 1
  state.ledger = {
    ...EMPTY,
    card: { goal: 'Ship the Progress tab', done: [], now: 'Reviewing the diff', running: ['npm test'] },
    milestones: [
      { id: 'm1', source: 'answered', text: 'Use the done tone', detail: 'yes', ref: 'i9', at: now - 120_000 },
      { id: 'm2', source: 'done', text: 'Built the page', detail: null, ref: null, at: now - 60_000 },
    ],
  }
  state.presence = { ...state.presence, isTurnRunning: true, statedStep: 'Measuring the tab bar' }
  state.subagents = [
    {
      id: 'a1',
      task: 'Check the omp panel',
      state: 'running',
      toolStep: 'Reading panel.ts',
      statedStep: null,
      result: null,
      startedAt: now - 30_000,
      at: now - 30_000,
      transcriptPath: null,
    },
    {
      id: 'a2',
      task: 'Check the desktop pane',
      state: 'stopped',
      toolStep: null,
      statedStep: null,
      result: null,
      startedAt: now - 90_000,
      at: now - 80_000,
      transcriptPath: null,
    },
  ]
  document.body.innerHTML = '<div id="app"></div>'
  Object.defineProperty(window, '__inboxPage', { value: 'progress-page', configurable: true })
  Object.defineProperty(window, '__inboxKept', {
    value: {
      version: 2,
      isDemo: false,
      tab: 'progress',
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
        devPage: 'progress-page',
        serverBuild: SERVER_BUILD,
        isFetchingPrs: false,
        isGhMissing: false,
      }
      if (isOlderServer) Reflect.deleteProperty(view, 'progressPage')
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
    await until(() => root.querySelector('.progress-goal') !== null)
    assert.deepEqual(tabLabels(), ['Needs you', 'Findings', 'PRs', 'Progress'])
    assert.equal(shownTab(), 'Progress')
    assert.equal(shownTabs[0], 'progress')
    assert.equal(root.querySelector('.progress-goal')?.textContent, 'Ship the Progress tab')
    assert.equal(root.querySelector('.progress-now')?.textContent, `Now${DOT}Measuring the tab bar`)
    assert.deepEqual(
      [...root.querySelectorAll('main .row')].map(r => [
        r.querySelector('.mark')?.className,
        r.querySelector('.mark')?.textContent,
        r.querySelector('.content')?.textContent,
      ]),
      [
        ['mark', '●', 'Check the omp panelReading panel.ts'],
        ['mark error', '✕', 'Check the desktop pane'],
        ['mark', '', 'npm test'],
        ['mark done', '✓', 'Built the page'],
        ['mark done', '✓', 'Use the done toneYou answered: yes'],
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
    assert.equal(shownTab(), 'Progress')
    assert.equal(root.querySelector('.row.selected'), null)
    assert.deepEqual(tabLabels(), ['Needs you', 'Findings1', 'PRs', 'Progress'])

    key('2')
    assert.equal(shownTab(), 'Findings1')
    assert.match(root.textContent ?? '', /The bar wraps at 320 px/)
    key('4')
    assert.equal(shownTab(), 'Progress')
    assert.ok(root.querySelector('.progress-goal'))

    isOlderServer = true
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    assert.equal(shownTab(), 'Needs you')
    assert.equal(root.querySelector('.progress-goal'), null)
    assert.equal(shownTabs.at(-1), 'progress')
    isOlderServer = false
    await new Promise<void>(resolve => setTimeout(resolve, POLL_MS + 100))
    assert.equal(shownTab(), 'Progress')
    assert.ok(root.querySelector('.progress-goal'))
  } finally {
    await window.happyDOM.abort()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
