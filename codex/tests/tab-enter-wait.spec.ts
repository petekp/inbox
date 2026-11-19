import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { Window } from 'happy-dom'
import { LEAVE_FADE_MS, ROW_STATE_MS, TURNED_BACK_CUT_OPACITY } from '../../hooks/row-motion'
import { FRAME_MS } from '../../hooks/springs'
import TAB_HTML from '../src/tab.html'
import { NO_HOLDS } from '../../hooks/timing'
import { EMPTY_SESSION_STATUS } from '../../hooks/status-limits'
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
type Fade = {
  el: HTMLElement
  from: number
  to: number
  delay: number
  startsAt: number
  duration: number
  fill: FillMode
  anim: Animation
}

function opacityNow(f: Fade | undefined, at = Date.now()): number | null {
  if (!f || f.anim.playState === 'idle') return null
  const elapsed = at - f.startsAt
  const holdsFirst = f.fill === 'backwards' || f.fill === 'both'
  const holdsLast = f.fill === 'forwards' || f.fill === 'both'
  if (elapsed < 0) return holdsFirst ? f.from : null
  if (elapsed >= f.duration) return holdsLast ? f.to : null

  return f.from + ((f.to - f.from) * elapsed) / f.duration
}

async function inTab(run: (tab: Harness) => Promise<void>, context: TestContext) {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const now = performance.now
  performance.now = () => Date.now()
  const window = new Window()
  const moves: Move[] = []
  const fades: Fade[] = []
  const lastFades = new WeakMap<object, Fade>()
  const animate = window.HTMLElement.prototype.animate
  window.HTMLElement.prototype.animate = function (this: HTMLElement, ...args: Parameters<typeof animate>) {
    const [frames, timing] = args
    const key = this.dataset.motion
    if (key && Array.isArray(frames) && frames.some(f => 'height' in f)) {
      const delay = Number((timing as KeyframeAnimationOptions | undefined)?.delay ?? 0)
      moves.push({ key, delay, startsAt: Date.now() + delay, scalesEdges: frames.some(f => 'paddingTop' in f) })
    }
    const animation = animate.apply(this, args)
    animation.finished.catch(() => {})
    const startedAt = Date.now()
    Object.defineProperty(animation, 'currentTime', { get: () => Date.now() - startedAt, configurable: true })
    if (Array.isArray(frames) && frames.length > 1 && frames.every(f => 'opacity' in f)) {
      const options = (timing ?? {}) as KeyframeAnimationOptions
      const delay = Number(options.delay ?? 0)
      const [from, to] = [Number(frames[0]!.opacity), Number(frames.at(-1)!.opacity)]
      const fade = {
        el: this,
        from,
        to,
        delay,
        startsAt: Date.now() + delay,
        duration: Number(options.duration ?? 0),
        fill: options.fill ?? 'none',
        anim: animation as unknown as Animation,
      }
      fades.push(fade)
      lastFades.set(this, fade)
    }
    return animation
  }
  window.HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const drawn = [this, ...Array.from(this.querySelectorAll<HTMLElement>('*'))].filter(
      e => !e.closest('[style*="display: none"]'),
    )
    return new window.DOMRect(0, 0, 100, drawn.length * 20)
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
    getComputedStyle: (el: Parameters<typeof window.getComputedStyle>[0]) => {
      const style = window.getComputedStyle(el)
      const opacity = opacityNow(lastFades.get(el))
      if (opacity === null) return style
      return new Proxy(style, {
        get: (s, k) => {
          if (k === 'opacity') return String(opacity)
          const value = Reflect.get(s, k, s)
          return typeof value === 'function' ? value.bind(s) : value
        },
      })
    },
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
    performance.now = now
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

test('a row that enters while another leaves keeps the rest of its wait and its edge scaling when a redraw lands 40 or 80 ms into the wait or 60 ms into the growth, so the list never grows before it shrinks; a row the person opens grows once the panel of the row it closes has faded out, and fades its own panel in once its space is nearly open, a close they turn back fades its panel back from where it is, at once, held faint while its row regrows from a shrink, a moving row’s clamped title draws the closed weight and never shows with its full title, and a dismissed open row draws only its settled line', async context => {
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
    const subject = {
      id: 's1',
      name: 'Changelog',
      status: 'working' as const,
      text: 'notes for the release',
      was: null,
      merged: null,
      createdAt: 1,
      changedAt: 1,
      closedAt: null,
      into: null,
    }
    state.ledger = {
      ...state.ledger,
      overview: { ...EMPTY_SESSION_STATUS, subjects: [subject], askSubjects: { [pressed.id]: [subject.id] } },
      items: [item('i1', 'Check the build', 1), pressed],
    }
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
        .filter(f => f.el.closest('.panel') && rowOf(id).contains(f.el))
        .map(({ from, to, delay }) => ({ from, to, delay }))
    const pressedAt = Date.now()
    await press(pressed.id)
    const titleForms = (id: string, at: number) =>
      (['.text.short', '.text:not(.short)'] as const).map(form => {
        const el = rowOf(id).querySelector<HTMLElement>(`.line > ${form}`)
        const shown = opacityNow(
          fades.findLast(f => f.el === el),
          at,
        )
        return shown ?? (form === '.text.short' ? 0 : 1)
      })
    for (const id of ['i1', pressed.id])
      for (let t = 0; t <= ROW_STATE_MS.opening; t += FRAME_MS) {
        const [short, full] = titleForms(id, pressedAt + t)
        assert.ok(short! < 0.02 || full! < 0.02, `${id} shows both title forms ${t} ms in: ${short} and ${full}`)
      }
    assert.deepEqual(titleForms('i1', pressedAt), [1, 0], 'the closing title does not take its closed form at once')
    assert.deepEqual(titleForms(pressed.id, pressedAt + ROW_STATE_MS.opening), [0, 1])
    const shrinks = moves.filter(m => m.key.includes('i1'))
    assert.ok(shrinks.length > 0, 'closing i1 started no glide')
    for (const m of shrinks)
      assert.ok(m.delay >= LEAVE_FADE_MS, `${m.key} shrinks ${m.delay} ms in, before its panel fades`)
    assert.ok(
      panelFades('i1').some(f => f.from === 1 && f.to === 0 && f.delay === 0),
      `the closing panel does not fade out at once: ${JSON.stringify(panelFades('i1'))}`,
    )
    const opens = moves.filter(m => m.key.includes(pressed.id))
    assert.ok(opens.length > 0, `pressing ${pressed.id} started no glide`)
    for (const m of opens)
      assert.ok(
        Math.abs(m.delay - LEAVE_FADE_MS) < 1,
        `${m.key} waits ${m.delay} ms, not until the closing panel fades`,
      )
    const shows = panelFades(pressed.id)
    assert.ok(
      shows.some(f => f.from === 0 && f.to === 1 && f.delay > LEAVE_FADE_MS),
      `the opened panel does not wait for its space: ${JSON.stringify(shows)}`,
    )
    const style = document.createElement('style')
    style.textContent = [...TAB_HTML.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')
    document.head.append(style)
    await after(ROW_STATE_MS.closing + 50)
    await press('i1')
    const opening = rowOf('i1').querySelector<HTMLElement>('.row.selected .line .text.short')!
    assert.notEqual(getComputedStyle(opening).fontWeight, '600')
    const title = (clamped: boolean) =>
      rowOf(pressed.id).querySelector<HTMLElement>(`.row.closing .line .text${clamped ? '.short' : ':not(.short)'}`)!
    assert.equal(getComputedStyle(title(false)).fontWeight, '600')
    assert.notEqual(getComputedStyle(title(true)).fontWeight, '600')
    const fadesOut = () => fades.filter(f => f.to === 0 && f.el.closest('.panel') && rowOf(pressed.id).contains(f.el))
    const stillFadingOut = () => fadesOut().filter(f => f.anim.playState !== 'idle').length
    for (const turnsBackAtMs of [60, 0]) {
      await after(turnsBackAtMs)
      assert.ok(fadesOut().length > 0, `closing ${pressed.id} faded no panel out`)
      fades.splice(0, fades.length, ...fadesOut())
      await press(pressed.id)
      assert.deepEqual(
        panelFades(pressed.id).filter(f => f.from === 0),
        [],
        `a close the person turned back ${turnsBackAtMs} ms in fades its panel in again from nothing`,
      )
      assert.equal(stillFadingOut(), 0, `a close turned back ${turnsBackAtMs} ms in leaves its panel fading out`)
      if (turnsBackAtMs)
        assert.ok(
          panelFades(pressed.id).some(f => f.from > 0 && f.from < 1 && f.to === 1),
          `a close turned back ${turnsBackAtMs} ms in does not fade its panel back from what it shows`,
        )
      await after(ROW_STATE_MS.opening + 50)
      fades.length = 0
      if (turnsBackAtMs) await press('i1')
    }
    await press(pressed.id)
    await after(LEAVE_FADE_MS + 40)
    fades.length = 0
    await press(pressed.id)
    const lateFades = () => fades.filter(f => f.el.closest('.panel') && rowOf(pressed.id).contains(f.el) && f.to > 0)
    const dims = lateFades()
    assert.ok(
      dims.length > 0 && dims.every(f => f.delay === 0 && f.to === TURNED_BACK_CUT_OPACITY),
      `a close turned back once its row began to shrink does not fade its panel at once to a faint opacity: ${JSON.stringify(dims.map(({ to, delay }) => ({ to, delay })))}`,
    )
    await after(Math.max(...dims.map(f => f.duration)) + FRAME_MS)
    assert.ok(
      lateFades().some(f => f.from === TURNED_BACK_CUT_OPACITY && f.to === 1),
      'a turned-back panel held faint does not fade on to full once its space is nearly open',
    )
    await after(ROW_STATE_MS.opening + 50)
    fades.length = 0
    assert.ok(
      rowOf(pressed.id).querySelector('.panel .branch.holds-up') !== null,
      `${pressed.id} draws no Holds up line`,
    )
    const third = item('i7', 'Answer the review', 7)
    state.ledger = { ...state.ledger, items: [...state.ledger.items, third] }
    await read()
    await settle()
    await after(ROW_STATE_MS.entering + 200)
    const opensNow = async (id: string, what: string) => {
      moves.length = 0
      await press(id)
      const opens = moves.filter(m => m.key.includes(id))
      assert.ok(opens.length > 0, `pressing ${id} started no glide`)
      for (const m of opens) assert.equal(m.delay, 0, `${m.key} waits ${m.delay} ms after ${what}`)
    }
    await press('i1')
    const i1Shows = panelFades('i1').find(f => f.from === 0 && f.to === 1)
    assert.ok(i1Shows && i1Shows.delay >= LEAVE_FADE_MS, `i1's panel shows too soon: ${JSON.stringify(i1Shows)}`)
    await after(LEAVE_FADE_MS)
    await press(pressed.id)
    await opensNow(third.id, 'the close of a turned-back row whose panel shows nothing yet')
    await after(ROW_STATE_MS.closing + 50)
    await press('i1')
    await after(60)
    await press(third.id)
    const arriving = item('i8', 'Rerun the checks', 8)
    state.ledger = { ...state.ledger, items: [...state.ledger.items, arriving] }
    moves.length = 0
    await after(20)
    await read()
    await settle()
    const grows = moves.filter(m => m.key.includes(arriving.id))
    assert.ok(grows.length > 0, `${arriving.id} does not grow`)
    for (const m of grows) assert.equal(m.delay, 0, `${m.key} waits ${m.delay} ms for a close that was turned back`)
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
      items: [item('i1', 'Check the build', 1), third, arriving],
      closed: [...state.ledger.closed, { ...dismissed, at: Date.now(), item: pressed }],
    }
    await read()
    await settle()
    assert.ok(rowOf(pressed.id).querySelector('.row.settled') !== null, 'the dismissed row does not settle in place')
    assert.ok(rowOf(pressed.id).querySelector('.panel') === null, 'the dismissed row still draws its panel')
  }, context)
})
