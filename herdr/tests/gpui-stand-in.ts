import { mock } from 'bun:test'

import { SESSION_LABEL } from '../src/follow'
import { demoEnvelopeText } from './fixtures'

type Handler = (event: unknown, cx: StandInContext) => void

export type Painted = {
  id: string | null
  label: string | null
  isDisabled: boolean
  hasHover: boolean
  click: Handler | null
  listeners: Map<string, Handler>
  field: StandInField | null
  parent: Painted | null
  kids: Painted[]
}

class StandInField {
  text: string
  constructor(options?: { value?: string }) {
    this.text = options?.value ?? ''
  }
  focus() {
    keys = this
  }
  release() {
    if (keys === this) keys = null
    return true
  }
  value() {
    return this.text
  }
  on() {
    return true
  }
}

let keys: 'panel' | StandInField | null = null
export const keysHolder = () => keys
export const giveKeysElsewhere = () => {
  keys = null
}

type StandInContext = ReturnType<typeof standInContext>

function standInContext() {
  const timer = { cancel() {} }
  const cx = {
    isStopped: false,
    notify() {},
    stop_propagation() {
      cx.isStopped = true
    },
    focus_handle: () => ({
      focus() {
        keys = 'panel'
      },
    }),
    spawn(run: (cx: unknown) => Promise<void>) {
      void run(cx)
    },
    sleep: () => Promise.resolve(),
    timer: { every: () => timer, after: () => timer },
    write_to_clipboard() {},
  }

  return cx
}

const NODE = Symbol('painted')

function element(field: StandInField | null = null): unknown {
  const node: Painted = {
    id: null,
    label: null,
    isDisabled: false,
    hasHover: false,
    click: null,
    listeners: new Map(),
    field,
    parent: null,
    kids: [],
  }
  const adopt = (kid: unknown) => {
    const painted = nodeOf(kid)
    if (painted === null) return
    painted.parent = node
    node.kids.push(painted)
  }
  const proxy: unknown = new Proxy(
    {},
    {
      has: (_target, key) => key === NODE,
      get(_target, key) {
        if (key === NODE) return node
        if (typeof key !== 'string' || key === 'then') return undefined

        return (...args: unknown[]) => {
          const [first, second] = args
          if (key === 'when') return first ? (second as (e: unknown) => unknown)(proxy) : proxy
          if (key === 'child') adopt(first)
          if (key === 'children') (first as unknown[]).forEach(adopt)
          if (key === 'id') node.id = String(first)
          if (key === 'accessibility_label') node.label = String(first)
          if (key === 'disabled') node.isDisabled = Boolean(first)
          if (key === 'hover') node.hasHover = true
          if (key === 'on_click') node.click = first as Handler
          if (key.startsWith('on_')) node.listeners.set(key, (key === 'on_mouse_down' ? second : first) as Handler)

          return proxy
        }
      },
    },
  )

  return proxy
}

const nodeOf = (e: unknown): Painted | null =>
  typeof e === 'object' && e !== null && NODE in e ? (e as Record<typeof NODE, Painted>)[NODE] : null

export const allOf = (root: Painted): Painted[] => [root, ...root.kids.flatMap(allOf)]

mock.module('gpui-kit', () => ({
  View: class {},
  div: () => element(),
}))

mock.module('gpui-base', () => ({
  h_flex: () => element(),
  v_flex: () => element(),
  Input: { new: (state: StandInField) => element(state) },
  InputState: { new: (options?: { value?: string }) => new StandInField(options) },
  Scrollbar: { vertical: () => element() },
}))

export const app = {
  isActive: true,
  shownTab: 'tab1',
  written: [] as { path: string; text: string }[],
  labels: [] as string[][],
}

mock.module('herdr', () => ({
  window: () => ({ active: app.isActive }),
  spaces: () => [{ active: true, tabs: [{ id: app.shownTab, active: true, zoomed: false }] }],
  appHome: () => '/app',
  home: () => '/home',
  props: () => ({ pane: 'p-inbox' }),
  panes: () => [
    { pane: 'p-inbox', tab: 'tab1', terminal: null },
    { pane: 'p-agent', tab: 'tab1', terminal: 't1' },
  ],
  focused: () => ({ tab: 'tab1', terminal: 't1' }),
  terminals: () => [
    { address: 't1', labels: { [SESSION_LABEL]: 's1' }, program: { name: 'Claude Code', shell: false } },
  ],
  theme: () => new Proxy({}, { get: () => '#808080' }),
  readTextFile: async (path: string) => (path.endsWith('s1.json') ? demoEnvelopeText() : ''),
  writeTextFile: async (path: string, text: string) => {
    app.written.push({ path, text })
    return null
  },
  watchFolder: () => new Promise(() => {}),
  exec: async () => ({ code: 0, stdout: '', stderr: '' }),
  hc: async (args: string[]) => {
    app.labels.push(args)
    return null
  },
  run() {},
}))

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

export async function openPanel() {
  const { default: Inbox } = await import('../src/main')
  keys = null
  const panel = new Inbox()
  const cx = standInContext()
  panel.init(undefined, cx as never)
  panel.render(cx as never)
  await settle()
  const paint = () => nodeOf(panel.render(cx as never)) as Painted
  const click = (target: Painted) => {
    cx.isStopped = false
    for (let at: Painted | null = target; at !== null && !cx.isStopped; at = at.parent) {
      at.field?.focus()
      at.click?.(null, cx)
    }
  }

  return { panel, cx, paint, click, settle }
}
