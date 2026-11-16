import { mock } from 'bun:test'

import { SESSION_LABEL } from '../../hooks/herdr'
import { demoEnvelopeText } from './fixtures'

type Handler = (event: unknown, cx: StandInContext) => void

export type Painted = {
  id: string | null
  label: string | null
  isDisabled: boolean
  hasHover: boolean
  click: Handler | null
  keyDown: Handler | null
  field: StandInField | null
  parent: Painted | null
  kids: Painted[]
  flow: 'row' | 'column'
  text: string | null
  style: Partial<Record<Side | 'h' | 'w' | 'gap' | 'line' | 'top' | 'bottom' | 'left', number>> & {
    isTruncated?: boolean
    isAbsolute?: boolean
    isClipped?: boolean
  }
  springs: Set<string>
  transitions: Map<string, number>
  onSize: ((size: { width: number; height: number }, cx: unknown) => void) | null
}

type Side = 'pt' | 'pb' | 'mt' | 'mb'
const SIDES: Record<string, Side[]> = {
  pt: ['pt'],
  pb: ['pb'],
  py: ['pt', 'pb'],
  p: ['pt', 'pb'],
  mt: ['mt'],
  mb: ['mb'],
  my: ['mt', 'mb'],
}

class StandInField {
  text: string
  handlers = new Map<string, () => void>()
  constructor(options?: { value?: string }) {
    this.text = options?.value ?? ''
  }
  typeIn(text: string) {
    this.text = text
    this.handlers.get('change')?.()
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
  on(event: string, handler: () => void) {
    this.handlers.set(event, handler)
    return true
  }
}

let keys: 'panel' | StandInField | null = null
let zoom = 1
export const setZoom = (to: number) => {
  zoom = to
}
let focusedTerminal = 't1'
export const focusTerminal = (address: string) => {
  focusedTerminal = address
}
export const typeIn = (state: unknown, text: string) => (state as StandInField).typeIn(text)
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

function element(field: StandInField | null = null, flow: Painted['flow'] = 'column'): unknown {
  const node: Painted = {
    id: null,
    label: null,
    isDisabled: false,
    hasHover: false,
    click: null,
    keyDown: null,
    field,
    parent: null,
    kids: [],
    flow,
    text: null,
    style: {},
    springs: new Set(),
    transitions: new Map(),
    onSize: null,
  }
  const adopt = (kid: unknown) => {
    if (typeof kid === 'string') node.text = (node.text ?? '') + kid
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
          if (key === 'on_key_down') node.keyDown = first as Handler
          for (const side of SIDES[key] ?? []) node.style[side] = first as number
          if (key === 'h' || key === 'w' || key === 'gap' || key === 'top' || key === 'bottom' || key === 'left')
            node.style[key] = first as number
          if (key === 'overflow_hidden') node.style.isClipped = true
          if (key === 'line_height') node.style.line = parseFloat(String(first))
          if (key === 'truncate') node.style.isTruncated = true
          if (key === 'absolute') node.style.isAbsolute = true
          if (key === 'spring') node.springs.add(String(first))
          if (key === 'transition') node.transitions.set(String(first), (second as { duration: number }).duration)
          if (key === 'on_size_change') node.onSize = first as Painted['onSize']

          return proxy
        }
      },
    },
  )

  return proxy
}

const nodeOf = (e: unknown): Painted | null =>
  typeof e === 'object' && e !== null && NODE in e ? (e as Record<typeof NODE, Painted>)[NODE] : null

export const columnOf = (kids: unknown[], lineHeight: string): Painted =>
  nodeOf(
    (element() as { line_height: (h: string) => { children: (k: unknown[]) => unknown } })
      .line_height(lineHeight)
      .children(kids),
  )!

export const allOf = (root: Painted): Painted[] => [root, ...root.kids.flatMap(allOf)]

export const writtenFiles: { path: string; text: string }[] = []

const pathBuilder: Record<string, () => unknown> = new Proxy({}, { get: () => () => pathBuilder })

mock.module('gpui-kit', () => ({
  View: class {},
  div: () => element(),
  PathBuilder: { fill: () => pathBuilder, stroke: () => pathBuilder },
  Background: { linear_gradient: () => ({}) },
}))

Object.assign(globalThis, { window: { paint_path: () => element() } })

mock.module('gpui-base', () => ({
  h_flex: () => element(null, 'row'),
  v_flex: () => element(),
  Input: { new: (state: StandInField) => element(state) },
  InputState: { new: (options?: { value?: string }) => new StandInField(options) },
  Scrollbar: { vertical: () => element() },
}))

mock.module('herdr', () => ({
  appHome: () => '/app',
  home: () => '/home',
  props: () => ({ pane: 'p-inbox' }),
  panes: () => [
    { pane: 'p-inbox', tab: 'tab1', terminal: null },
    { pane: 'p-agent', tab: 'tab1', terminal: 't1' },
    { pane: 'p-shell', tab: 'tab1', terminal: 't2' },
  ],
  focused: () => ({ tab: 'tab1', terminal: focusedTerminal }),
  spaces: () => [{ active: true, tabs: [{ id: 'tab1', active: true, zoomed: false }] }],
  window: () => ({ active: true }),
  terminals: () => [
    { address: 't1', labels: { [SESSION_LABEL]: 's1' }, program: { name: 'Claude Code', shell: false } },
    { address: 't2', labels: {}, program: { name: 'zsh', shell: true } },
  ],
  theme: () => new Proxy({}, { get: () => '#808080' }),
  settings: () => ({ zoom }),
  readTextFile: async (path: string) => (path.endsWith('s1.json') ? demoEnvelopeText() : ''),
  writeTextFile: async (path: string, text: string) => (writtenFiles.push({ path, text }), null),
  watchFolder: () => new Promise(() => {}),
  exec: async () => ({ code: 0, stdout: '', stderr: '' }),
  hc: async () => null,
  run() {},
}))

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

export async function openPanel() {
  const { default: Inbox } = await import('../src/main')
  keys = null
  focusedTerminal = 't1'
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

  const press = (key: string) => {
    const root = paint()
    allOf(root)
      .find(n => n.keyDown !== null)
      ?.keyDown?.({ keystroke: key }, cx)
  }

  const measure = (size: (node: Painted) => { width: number; height: number }, root = paint()) => {
    for (const node of allOf(root)) node.onSize?.(size(node), cx)
  }

  return { panel, paint, click, press, settle, measure }
}
