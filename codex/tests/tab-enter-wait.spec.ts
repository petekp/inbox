import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { Window } from 'happy-dom'
import { LEAVE_FADE_MS, ROW_STATE_MS } from '../../hooks/row-motion'
import TAB_HTML from '../src/tab.html'
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

type Move = { key: string; delay: number; startsAt: number; scalesEdges: boolean }
type Fade = { el: HTMLElement; from: number; to: number; delay: number }

async function inTab(run: (tab: Harness) => Promise<void>, context: TestContext) {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const window = new Window()
  const moves: Move[] = []
  const fades: Fade[] = []
  const animate = window.HTMLElement.prototype.animate
  window.HTMLElement.prototype.animate = function (this: HTMLElement, ...args: Parameters<typeof animate>) {
    const [frames, timing] = args
    const key = this.dataset.motion
    if (key && Array.isArray(frames) && frames.some(f => 'height' in f)) {
      const delay = Number((timing as KeyframeAnimationOptions | undefined)?.delay ?? 0)
      moves.push({ key, delay, startsAt: Date.now() + delay, scalesEdges: frames.some(f => 'paddingTop' in f) })
    }
    if (Array.isArray(frames) && frames.length > 1 && frames.every(f => 'opacity' in f)) {
      const delay = Number((timing as KeyframeAnimationOptions | undefined)?.delay ?? 0)
      fades.push({ el: this, from: Number(frames[0]!.opacity), to: Number(frames.at(-1)!.opacity), delay })
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
      fades,
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
  fades: Fade[]
  settle: () => Promise<void>
  after: (ms: number) => Promise<void>
}

test('a row that enters while another leaves keeps the rest of its wait and its edge scaling when a redraw lands 40 or 80 ms into the wait or 60 ms into the growth, so the list never grows before it shrinks; a row the person opens moves at once and fades its panel in once its space is nearly open, a close they turn back keeps its panel shown, a closing row’s clamped title draws the closed weight, and a dismissed open row draws only its settled line', async context => {
  await inTab(async ({ state, moves, fades, settle, after }) => {
    await import('../src/tab')
    const { read } = await import('../src/tab-read')
    await settle()
    let last = item('i2', 'Tag the release', 2)
    for (const [n, redrawAtMs] of [40, 80, 180].entries()) {
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
      for (const m of growth()) assert.ok(m.scalesEdges, `${m.key} restarts without scaling its padding and margin`)
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
    fades.length = 0
    const rowOf = (id: string) =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-motion]')).find(e => e.dataset.motion?.includes(id))!
    const press = async (id: string) => {
      rowOf(id).querySelector<HTMLElement>('button.line')!.click()
      await settle()
    }
    const panelFades = (id: string) =>
      fades
        .filter(f => f.el.matches('.panel') && rowOf(id).contains(f.el))
        .map(({ from, to, delay }) => ({ from, to, delay }))
    await press(pressed.id)
    const opens = moves.filter(m => m.key.includes(pressed.id))
    assert.ok(opens.length > 0, `pressing ${pressed.id} started no glide`)
    for (const m of opens) assert.ok(m.delay === 0, `${m.key} waits ${m.delay} ms after the person pressed it`)
    const shows = panelFades(pressed.id)
    assert.ok(
      shows.some(f => f.from === 0 && f.to === 1 && f.delay > 0),
      `the opened panel does not wait for its space: ${JSON.stringify(shows)}`,
    )
    const style = document.createElement('style')
    style.textContent = [...TAB_HTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')
    document.head.append(style)
    await after(ROW_STATE_MS.opening + 50)
    await press('i1')
    const title = (clamped: boolean) =>
      rowOf(pressed.id).querySelector<HTMLElement>(`.row.closing .line .text${clamped ? '.short' : ':not(.short)'}`)!
    assert.equal(getComputedStyle(title(false)).fontWeight, '600')
    assert.notEqual(getComputedStyle(title(true)).fontWeight, '600')
    await after(60)
    fades.length = 0
    await press(pressed.id)
    assert.deepEqual(
      panelFades(pressed.id).filter(f => f.from < 0.99),
      [],
      'a close the person turned back fades its shown panel in again from less than shown',
    )
    await after(ROW_STATE_MS.opening + 50)
    const dismissed = {
      id: pressed.id,
      kind: pressed.kind,
      ask: pressed.ask,
      outcome: 'dismissed',
      how: 'dismissed' as const,
    }
    state.ledger = {
      ...state.ledger,
      items: [item('i1', 'Check the build', 1)],
      closed: [...state.ledger.closed, { ...dismissed, at: Date.now(), item: pressed }],
    }
    await read()
    await settle()
    assert.ok(rowOf(pressed.id).querySelector('.row.settled'), 'the dismissed row does not settle in place')
    assert.ok(rowOf(pressed.id).querySelector('.panel') === null, 'the dismissed row still draws its panel')
  }, context)
})
