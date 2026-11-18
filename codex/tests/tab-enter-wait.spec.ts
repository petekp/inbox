import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { Window } from 'happy-dom'
import { LEAVE_FADE_MS, ROW_STATE_MS } from '../../hooks/row-motion'
import { NO_HOLDS } from '../../hooks/timing'
import type { Item } from '../../types'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'

const item = (id: string, ask: string, at: number): Item => ({
  id,
  kind: 'task',
  label: null,
  from: 'record',
  ask,
  options: [],
  rec: null,
  helps: [],
  turn: 1,
  at,
})

type Move = { key: string; delay: number; startsAt: number }

async function inTab(run: (tab: Harness) => Promise<void>, context: TestContext) {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const window = new Window()
  const moves: Move[] = []
  const animate = window.HTMLElement.prototype.animate
  window.HTMLElement.prototype.animate = function (this: HTMLElement, ...args: Parameters<typeof animate>) {
    const [frames, timing] = args
    const key = this.dataset.motion
    if (key && Array.isArray(frames) && frames.some(f => 'height' in f)) {
      const delay = Number((timing as KeyframeAnimationOptions | undefined)?.delay ?? 0)
      moves.push({ key, delay, startsAt: Date.now() + delay })
    }
    const animation = animate.apply(this, args)
    animation.finished.catch(() => {})
    return animation
  }
  window.HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const drawn = [this, ...Array.from(this.querySelectorAll<HTMLElement>('*'))].filter(
      e => !e.closest('[style*="display: none"]'),
    )
    return new window.DOMRect(0, 0, 100, drawn.length)
  }
  const state = emptyState('enter-wait')
  state.heard.startAt = 1
  state.ledger = { ...state.ledger, items: [item('i1', 'Check the build', 1), item('i2', 'Tag the release', 2)] }
  window.document.body.innerHTML = '<div id="app"></div>'
  Object.defineProperty(window, '__inboxPage', { value: 'enter-wait-page', configurable: true })
  Object.defineProperty(window, '__inboxKept', {
    value: {
      version: 2,
      isDemo: false,
      tab: 'needsYou',
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
  Object.defineProperty(media, 'matches', { get: () => false })
  const globals = {
    window,
    document: window.document,
    Event: window.Event,
    parent: window.parent,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    KeyboardEvent: window.KeyboardEvent,
    ResizeObserver: window.ResizeObserver,
    sessionStorage: window.sessionStorage,
    matchMedia: () => media,
    getComputedStyle: window.getComputedStyle.bind(window),
    DEMO_BUTTON: false,
    DEMO_RECORDING: false,
  }
  const previous = new Map(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]))
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true })
  for (const [key, value] of Object.entries({ setTimeout, clearTimeout }))
    Object.defineProperty(window, key, { value, writable: true, configurable: true })
  window.parent.postMessage = message => {
    const request = message as { id?: number; method: string; params?: { arguments?: { shownSince?: number | null } } }
    if (request.id === undefined) return
    const view: TabView = {
      ...viewOf(state, Date.now(), { ...NO_HOLDS, shownSince: request.params?.arguments?.shownSince ?? null }),
      thread: state.sessionId,
      devPage: 'enter-wait-page',
      serverBuild: SERVER_BUILD,
      isFetchingPrs: false,
      isGhMissing: false,
    }
    const result = request.method === 'ui/initialize' ? {} : { structuredContent: view }
    queueMicrotask(() =>
      window.dispatchEvent(new window.MessageEvent('message', { data: { jsonrpc: '2.0', id: request.id, result } })),
    )
  }
  const settle = async () => {
    for (let n = 0; n < 20; n++) await new Promise<void>(resolve => setImmediate(resolve))
  }
  try {
    await run({
      window,
      state,
      moves,
      settle,
      after: async ms => {
        context.mock.timers.tick(ms)
        await settle()
      },
    })
  } finally {
    await window.happyDOM.abort()
    await window.happyDOM.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}

type Harness = {
  window: Window
  state: ReturnType<typeof emptyState>
  moves: Move[]
  settle: () => Promise<void>
  after: (ms: number) => Promise<void>
}

test('a row that enters while another leaves keeps the rest of its wait when a redraw lands 40 or 80 ms into it, so the list never grows before it shrinks', async context => {
  await inTab(async ({ state, moves, settle, after }) => {
    await import('../src/tab')
    const { read } = await import('../src/tab-read')
    await settle()
    let last = item('i2', 'Tag the release', 2)
    for (const [n, redrawAtMs] of [40, 80].entries()) {
      const arriving = item(`i${3 + n}`, `Reply to review ${n}`, 3 + n)
      state.ledger = { ...state.ledger, items: [item('i1', 'Check the build', 1), arriving] }
      moves.length = 0
      const readAt = Date.now()
      await read()
      await settle()
      const shrinksAt = readAt + LEAVE_FADE_MS
      const growth = () => moves.filter(m => m.key.includes(arriving.id))
      assert.ok(growth().length > 0, `${arriving.id} does not grow: ${JSON.stringify(moves)}`)
      assert.ok(growth().every(m => m.startsAt >= shrinksAt - 2))
      moves.length = 0
      await after(redrawAtMs)
      await read()
      await settle()
      assert.ok(growth().length > 0, `the redraw ${redrawAtMs} ms in restarted no glide of ${arriving.id}`)
      for (const m of growth())
        assert.ok(m.startsAt >= shrinksAt - 2, `${m.key} grows ${shrinksAt - m.startsAt} ms before ${last.id} shrinks`)
      await after(ROW_STATE_MS.leaving + 200)
      last = arriving
    }
    const pressed = item('i9', 'Update the changelog', 9)
    state.ledger = { ...state.ledger, items: [item('i1', 'Check the build', 1), pressed] }
    await read()
    await settle()
    await after(40)
    moves.length = 0
    const line = Array.from(document.querySelectorAll<HTMLElement>('[data-motion]'))
      .find(e => e.dataset.motion?.includes(pressed.id))
      ?.querySelector<HTMLElement>('button.line')
    line!.click()
    await settle()
    const opens = moves.filter(m => m.key.includes(pressed.id))
    assert.ok(opens.length > 0, `pressing ${pressed.id} started no glide`)
    for (const m of opens) assert.ok(m.delay === 0, `${m.key} waits ${m.delay} ms after the person pressed it`)
  }, context)
})
