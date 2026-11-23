import { mock } from 'bun:test'

import { SESSION_LABEL } from '../../core/remote/herdr-labels'
import type { UiEvent } from '../../core/view/ui-controller-types'
import type { Session } from '../../types'
import { hostFactsOf } from '../src/controller'
import { demoEnvelopeText } from './fixtures'

type Handler = (event: unknown, cx: StandInContext) => void

export type Painted = {
  id: string | null
  label: string | null
  isDisabled: boolean
  hasHover: boolean
  click: Handler | null
  keyDown: Handler | null
  /** What a pointer moving or a wheel scrolling over the node runs. */
  pointer: Handler | null
  wheel: Handler | null
  field: StandInField | null
  parent: Painted | null
  kids: Painted[]
  flow: 'row' | 'column'
  text: string | null
  style: Partial<Record<Side | 'h' | 'maxH' | 'w' | 'gap' | 'line' | 'top' | 'bottom' | 'left', number>> & {
    opacity?: number
    isTruncated?: boolean
    isAbsolute?: boolean
    isClipped?: boolean
  }
  springs: Set<string>
  transitions: Map<string, number>
  delays: Map<string, number>
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

let isRendering = false
const refuseWhileRendering = () => {
  if (isRendering) throw new Error('FocusHandle.focus() cannot run during render or layout')
}
const rendered = <T>(draw: () => T): T => {
  isRendering = true
  try {
    return draw()
  } finally {
    isRendering = false
  }
}

class StandInField {
  text: string
  handlers = new Map<string, (event: unknown, cx: unknown) => void>()
  constructor(options?: { value?: string }) {
    this.text = options?.value ?? ''
  }
  typeIn(text: string) {
    this.text = text
    this.handlers.get('change')?.(undefined, standInContext())
  }
  focus() {
    refuseWhileRendering()
    keys = this
  }
  release() {
    if (keys === this) keys = null
    return true
  }
  value() {
    return this.text
  }
  submit() {
    this.handlers.get('submit')?.(undefined, standInContext())
  }
  on(event: string, handler: (event: unknown, cx: unknown) => void) {
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
export const fieldOf = (value: string): StandInField => new StandInField({ value })
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
        refuseWhileRendering()
        keys = 'panel'
      },
      is_focused: () => keys === 'panel',
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
    pointer: null,
    wheel: null,
    field,
    parent: null,
    kids: [],
    flow,
    text: null,
    style: {},
    springs: new Set(),
    transitions: new Map(),
    delays: new Map(),
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
          if (key === 'on_mouse_move') node.pointer = first as Handler
          if (key === 'on_scroll_wheel') node.wheel = first as Handler
          for (const side of SIDES[key] ?? []) node.style[side] = first as number
          if (key === 'h' || key === 'w' || key === 'gap' || key === 'top' || key === 'bottom' || key === 'left')
            node.style[key] = first as number
          if (key === 'opacity') node.style.opacity = first as number
          if (key === 'max_h') node.style.maxH = first as number
          if (key === 'overflow_hidden') node.style.isClipped = true
          if (key === 'line_height') node.style.line = parseFloat(String(first))
          if (key === 'truncate') node.style.isTruncated = true
          if (key === 'absolute') node.style.isAbsolute = true
          if (key === 'spring') node.springs.add(String(first))
          if (key === 'transition') node.transitions.set(String(first), (second as { duration: number }).duration)
          if (key === 'transition') node.delays.set(String(first), (second as { delay?: number }).delay ?? 0)
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

const motionOf = (n: Painted): string[] => [...n.transitions.keys(), ...n.springs].sort()

function drawnBy(n: Painted): string {
  let anchor: Painted | null = n.parent
  while (anchor && anchor.id === null) anchor = anchor.parent
  const textOf = (k: Painted): string => (k.text ?? '') + k.kids.map(textOf).join('')
  const what = n.style.isAbsolute ? `a stroke at x ${n.style.left ?? 0}` : `"${textOf(n)}"`

  return `${what} in ${anchor?.id ?? 'the root'}, moving ${motionOf(n).join(' and ')}`
}

export function checkMotionIds(root: Painted, last: Map<string, string> | null): Map<string, string> {
  const moving = allOf(root).filter(n => motionOf(n).length > 0)
  const unnamed = moving.find(n => n.id === null)
  if (unnamed) throw new Error(`an element with no id moves ${drawnBy(unnamed)}, so gpui-kit loses its move`)
  const drawn = new Map(moving.map(n => [n.id ?? '', drawnBy(n)]))
  if (last === null) return drawn
  const countOf = (all: Map<string, string>, what: string) => [...all.values()].filter(w => w === what).length
  const isOnly = (what: string) => countOf(drawn, what) === 1 && countOf(last, what) === 1
  const gone = [...last].filter(([id, what]) => !drawn.has(id) && isOnly(what))
  for (const [was, what] of gone) {
    const now = [...drawn].find(([id, w]) => w === what && !last.has(id))?.[0]
    if (now !== undefined) throw new Error(`${was} became ${now} while it drew ${what}, so gpui-kit restarts its move`)
  }

  return drawn
}

export const writtenFiles: { path: string; text: string }[] = []

const pathBuilder: Record<string, () => unknown> = new Proxy({}, { get: () => () => pathBuilder })

export const appModules = {
  'gpui-kit': {
    View: class {},
    div: () => element(),
    PathBuilder: { fill: () => pathBuilder, stroke: () => pathBuilder },
    Background: { linear_gradient: () => ({}) },
  },
  'gpui-base': {
    h_flex: () => element(null, 'row'),
    v_flex: () => element(),
    Input: { new: (state: StandInField) => element(state) },
    InputState: { new: (options?: { value?: string }) => new StandInField(options) },
    Scrollbar: { vertical: () => element() },
  },
  herdr: {
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
  },
}

export const standInWindow = { paint_path: () => element() }

Object.assign(globalThis, { window: standInWindow })
for (const [name, exports] of Object.entries(appModules)) mock.module(name, () => exports)

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

type InboxClass = typeof import('../src/main').default

export async function openPanel(built?: InboxClass) {
  const Inbox = built ?? (await import('../src/main')).default
  keys = null
  focusedTerminal = 't1'
  const panel = new Inbox()
  const cx = standInContext()
  panel.init(undefined, cx as never)
  rendered(() => panel.render(cx as never))
  await settle()
  let motionIds: Map<string, string> | null = null
  const paint = () => {
    const root = nodeOf(rendered(() => panel.render(cx as never))) as Painted
    motionIds = checkMotionIds(root, motionIds)

    return root
  }
  const PLAIN_CLICK = {
    click_count: 1,
    modifiers: { shift: false, control: false, alt: false, platform: false, function: false },
  }
  const click = (target: Painted) => {
    cx.isStopped = false
    for (let at: Painted | null = target; at !== null && !cx.isStopped; at = at.parent) {
      at.field?.focus()
      at.click?.(PLAIN_CLICK, cx)
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

  const publish = (session: Session) => {
    const read = panel.read
    if (read?.is !== 'read') throw new Error('the panel read no session')
    panel.read = { ...read, session }
    panel.apply([{ type: 'read', host: hostFactsOf(panel.read) }], cx as never)
  }

  const run = (events: UiEvent[]) => panel.apply(events, cx as never)

  return { panel, paint, click, press, settle, measure, publish, run, cx }
}
