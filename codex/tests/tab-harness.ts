import type { TestContext } from 'node:test'
import { Window } from 'happy-dom'
import { NO_HOLDS } from '../../core/view/timing'
import type { Item } from '../../types'
import { emptyState } from '../src/state'
import { viewOf } from '../src/core'
import type { TabView } from '../src/core'

export const item = (id: string, ask: string, at: number): Item => ({
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

export function opacityNow(f: Fade | undefined, at = Date.now()): number | null {
  if (!f || f.anim.playState === 'idle') return null
  const elapsed = at - f.startsAt
  const holdsFirst = f.fill === 'backwards' || f.fill === 'both'
  const holdsLast = f.fill === 'forwards' || f.fill === 'both'
  if (elapsed < 0) return holdsFirst ? f.from : null
  if (elapsed >= f.duration) return holdsLast ? f.to : null

  return f.from + ((f.to - f.from) * elapsed) / f.duration
}

export async function inTab(run: (tab: Harness) => Promise<void>, context: TestContext) {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
  const now = performance.now
  performance.now = () => Date.now()
  const window = new Window()
  const moves: Move[] = []
  const lineRests = new Map<string, number>()
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
    const lineOf = this.classList.contains('line') && this.closest<HTMLElement>('[data-motion]')?.dataset.motion
    if (lineOf && Array.isArray(frames) && frames.some(f => 'height' in f)) {
      const options = (timing ?? {}) as KeyframeAnimationOptions
      lineRests.set(lineOf, Date.now() + Number(options.delay ?? 0) + Number(options.duration ?? 0))
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
      lineRests,
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
  lineRests: Map<string, number>
  fades: Fade[]
  settle: () => Promise<void>
  after: (ms: number) => Promise<void>
}
