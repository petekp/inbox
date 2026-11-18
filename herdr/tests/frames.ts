import { HEIGHT_SPRING, springStep } from '../../hooks/springs'
import type { Block } from '../src/blocks'
import type { Paint } from '../src/paint-theme'
import { columnOf } from './gpui-stand-in'
import type { Painted } from './gpui-stand-in'

const { spacedEls } = await import('../src/paint-space')
const { blockEl } = await import('../src/paint-blocks')
const { moveRows, NO_TRACKS } = await import('../src/motion')
const { Heights, MOVED_TO } = await import('../src/heights')
const { holdLinesAbove, NO_LINES_ABOVE } = await import('../src/held-line')
const { LINE, LINE_HEIGHT, TEXT } = await import('../src/paint-theme')

const FRAME_MS = 16
const PANE_WIDTH = 300
const WRAP_AT = 40
const CUT_MAX_OPACITY = 0.2
const LEADING_PX = (LINE_HEIGHT - TEXT) / 2

type Box = { top: number; height: number }
type Spring = { x: number; v: number; target: number | undefined }
type Jump = { at: number; id: string; by: number }
type TitleForm = { at: number; id: string; wrapped: number; box: number; isBoxResting: boolean }
type ColumnGap = { at: number; id: string; x: number; y: number }
type Cut = { at: number; box: string; text: string; share: number; opacity: number }
type Fading = { at: number; id: string; height: number; opacity: number }
type Segment = { id: string; x: number; y0: number; y1: number; runsIn: boolean; runsOn: boolean }

const linesOf = (n: Painted): number =>
  n.style.isTruncated ? 1 : Math.max(1, Math.ceil((n.text ?? '').length / WRAP_AT))

export function layout(root: Painted, shown: (id: string) => number | undefined, line = 0) {
  const boxes = new Map<string, Box>()
  const placed = new Map<Painted, Box>()
  const sized: { node: Painted; height: number }[] = []
  const fits: { id: string | null; height: number; content: number }[] = []
  const place = (n: Painted, top: number, line: number): number => {
    const lh = n.style.line ?? line
    const pt = n.style.pt ?? 0
    const flow = n.kids.filter(k => !k.style.isAbsolute)
    let content = 0
    if (flow.length === 0 && (n.text !== null || n.field !== null)) content = lh * linesOf(n)
    else if (n.flow === 'row')
      for (const k of flow) content = Math.max(content, (k.style.mt ?? 0) + place(k, top + pt + (k.style.mt ?? 0), lh))
    else {
      let y = top + pt
      flow.forEach((k, i) => {
        y += (i > 0 ? (n.style.gap ?? 0) : 0) + (k.style.mt ?? 0)
        y += place(k, y, lh) + (k.style.mb ?? 0)
      })
      content = y - top - pt
    }
    const sprung = n.id !== null && n.springs.has('height') ? shown(n.id) : undefined
    const natural = pt + content + (n.style.pb ?? 0)
    const height = sprung ?? n.style.h ?? natural
    const isSet = sprung !== undefined || n.style.h !== undefined
    if (n.style.isClipped && isSet) fits.push({ id: n.id, height, content: natural })
    sized.push({ node: n, height })
    placed.set(n, { top, height })
    if (n.id !== null) boxes.set(n.id, { top, height })

    return height
  }
  place(root, 0, line)

  return { boxes, sized, placed, fits }
}

const lengthIn = (length: number | string, height: number): number =>
  typeof length === 'string' && length.endsWith('%') ? (parseFloat(length) / 100) * height : Number(length)

function segmentsOf(root: Painted, placed: Map<Painted, Box>): Segment[] {
  const out: Segment[] = []
  const walk = (n: Painted, clip: [number, number], id: string) => {
    const box = placed.get(n)
    if (!box) return
    const own: [number, number] = n.style.isClipped
      ? [Math.max(clip[0], box.top), Math.min(clip[1], box.top + box.height)]
      : clip
    for (const k of n.kids) {
      if (!k.style.isAbsolute) {
        walk(k, own, k.id ?? id)
        continue
      }
      if (k.style.w !== 1) continue
      const y0 = box.top + lengthIn(k.style.top ?? 0, box.height)
      const runsOn = k.style.h === undefined
      const y1 = runsOn
        ? box.top + box.height - lengthIn(k.style.bottom ?? 0, box.height)
        : y0 + lengthIn(k.style.h ?? 0, box.height)
      const shown = { y0: Math.max(y0, own[0]), y1: Math.min(y1, own[1]) }
      if (shown.y1 < shown.y0) {
        const isBelowClip = y0 > own[1] && Number.isFinite(own[1])
        if (isBelowClip) out.push({ id, x: k.style.left ?? 0, y0: own[1], y1: own[1], runsIn: false, runsOn })
        continue
      }
      out.push({ id, x: k.style.left ?? 0, ...shown, runsIn: (k.style.top ?? 0) === 0, runsOn })
    }
  }
  walk(root, [-Infinity, Infinity], '')

  return out
}

function gapsOf(segments: Segment[], end: number): { id: string; x: number; y: number }[] {
  const isMet = (s: Segment, y: number) =>
    segments.some(o => o !== s && o.x === s.x && o.y0 <= y + 0.5 && o.y1 >= y - 0.5)
  const ends = segments.flatMap(s => [
    ...(s.runsIn && s.y0 > 0.5 ? [{ s, y: s.y0 }] : []),
    ...(s.runsOn && s.y1 < end - 0.5 ? [{ s, y: s.y1 }] : []),
  ])

  return ends.filter(({ s, y }) => !isMet(s, y)).map(({ s, y }) => ({ id: s.id, x: s.x, y }))
}

class Springs {
  states = new Map<string, Spring>()

  declare(root: Painted) {
    const seen = new Set<string>()
    const walk = (n: Painted) => {
      if (n.id !== null && n.springs.has('height')) {
        seen.add(n.id)
        const h = n.style.h
        const state = this.states.get(n.id)
        if (h === undefined) this.states.set(n.id, { x: NaN, v: 0, target: undefined })
        else if (!state || state.target === undefined) this.states.set(n.id, { x: h, v: 0, target: h })
        else state.target = h
      }
      n.kids.forEach(walk)
    }
    walk(root)
    for (const id of [...this.states.keys()]) if (!seen.has(id)) this.states.delete(id)
  }

  isResting(id: string): boolean {
    const s = this.states.get(id)

    return s === undefined || s.target === undefined || (Math.abs(s.x - s.target) < 0.5 && Math.abs(s.v) < 0.5)
  }

  shown(): Map<string, number> {
    return new Map([...this.states].flatMap(([id, s]) => (Number.isNaN(s.x) ? [] : [[id, s.x] as const])))
  }

  step(ms: number) {
    for (const s of this.states.values()) {
      if (s.target === undefined) continue
      const next = springStep({ x: s.x, v: s.v }, s.target, ms, HEIGHT_SPRING)
      s.x = next.x
      s.v = next.v
    }
  }
}

/** The progress of a CSS `ease-out` curve, cubic-bezier(0, 0, .58, 1), after the share `x` of its time. */
function easeOut(x: number): number {
  const at = (t: number, control: number) => 3 * (1 - t) * t * t * control + t ** 3
  let lo = 0
  let hi = 1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (at(mid, 0.58) < x) lo = mid
    else hi = mid
  }

  return at((lo + hi) / 2, 1)
}

type Fade = { shown: number; from: number; target: number; elapsed: number; duration: number }

const FADE_PREFIXES = ['box ', 'panel ', 'wrapped ', 'one line ']
const fadesOn = (id: string | null | undefined): boolean => FADE_PREFIXES.some(prefix => id?.startsWith(prefix))

function boxOf(n: Painted): string | null {
  for (let up: Painted | null = n; up; up = up.parent) if (fadesOn(up.id)) return up.id ?? null
  return null
}

const isThroughLetters = (hidden: number, line: number): boolean =>
  hidden % line > LEADING_PX && hidden % line < line - LEADING_PX

function cutTexts(placed: Map<Painted, Box>): { node: Painted; share: number }[] {
  return [...placed].flatMap(([n, b]) => {
    if (n.text === null || n.kids.some(k => !k.style.isAbsolute) || b.height <= 0) return []
    let top = b.top
    let bottom = b.top + b.height
    for (let up = n.parent; up; up = up.parent) {
      const clip = placed.get(up)
      if (!up.style.isClipped || !clip) continue
      top = Math.max(top, clip.top)
      bottom = Math.min(bottom, clip.top + clip.height)
    }
    const line = b.height / linesOf(n)
    const isCut =
      bottom > top && (isThroughLetters(top - b.top, line) || isThroughLetters(b.top + b.height - bottom, line))

    return isCut ? [{ node: n, share: (bottom - top) / b.height }] : []
  })
}

/** The opacity of the content of each block's box that fades. A change of the declared opacity starts an eased fade. */
class Fades {
  states = new Map<string, Fade>()

  declare(root: Painted) {
    const seen = new Set<string>()
    const walk = (n: Painted, box: string | null) => {
      const inBox = fadesOn(n.id) ? (n.id ?? null) : box
      const duration = n.transitions.get('opacity')
      if (inBox !== null && duration !== undefined && n.style.opacity !== undefined && !n.style.isAbsolute) {
        seen.add(inBox)
        const state = this.states.get(inBox)
        const to = n.style.opacity
        const delay = n.delays.get('opacity') ?? 0
        if (!state) this.states.set(inBox, { shown: to, from: to, target: to, elapsed: duration, duration })
        else if (to !== state.target)
          this.states.set(inBox, { ...state, from: state.shown, target: to, elapsed: -delay, duration })
        return n.kids.forEach(k => walk(k, null))
      }
      n.kids.forEach(k => walk(k, inBox))
    }
    walk(root, null)
    for (const id of [...this.states.keys()]) if (!seen.has(id)) this.states.delete(id)
  }

  opacityOf(n: Painted): number {
    let opacity = 1
    for (let up: Painted | null = n; up; up = up.parent)
      if (fadesOn(up.id)) opacity *= this.states.get(up.id ?? '')?.shown ?? 1
    return opacity
  }

  step(ms: number) {
    for (const s of this.states.values()) {
      s.elapsed = Math.min(s.duration, s.elapsed + ms)
      s.shown = s.from + (s.target - s.from) * easeOut(Math.max(0, s.elapsed) / s.duration)
    }
  }
}

class Frames {
  private tracks = NO_TRACKS
  private heights = new Heights()
  private linesAbove = NO_LINES_ABOVE
  private springs = new Springs()
  private fades = new Fades()
  private closedSeen = new Map<string, number>()
  private lastShown = new Map<string, number>()
  private last: Map<string, Box> | null = null
  jumps: Jump[] = []
  titles: TitleForm[] = []
  gaps: ColumnGap[] = []
  listHeights: number[] = []
  slides: number[][] = []
  cuts: Cut[] = []
  fading: Fading[] = []

  draw(blocks: Block[], now: number, isInput = false) {
    const isFirst = this.last === null
    const resized = this.heights.takeResized()
    const held = holdLinesAbove(blocks, isFirst ? NO_LINES_ABOVE : this.linesAbove, now)
    this.linesAbove = held.held
    const moved = moveRows(held.blocks, this.tracks, now, isFirst, isInput, id => this.heights.get(`title ${id}`))
    this.tracks = moved.tracks
    const noop = () => {}
    const paint = {
      t: new Proxy({}, { get: () => '#808080' }),
      press: noop,
      select: noop,
      collapse: noop,
      pick: noop,
      motion: moved.motion,
      heights: this.heights,
      isAtOnce: (key: string) => isFirst || resized.has(key),
      measure: (key: string, size: { width: number; height: number }, _cx: unknown, isWidthDrawn?: boolean) =>
        void this.heights.measure(key, size, 1, isWidthDrawn),
      now,
      newRows: new Map(),
      closedSeen: this.closedSeen,
      tab: 'needsYou',
      timeLeft: new Map(),
      input: () => null,
      mono: 'Menlo',
      isNarrow: false,
      listRoom: null,
    } as unknown as Paint
    const tree = columnOf(
      spacedEls(moved.blocks, paint, b => blockEl(b, paint)),
      LINE,
    )
    const was = this.springs.shown()
    this.springs.declare(tree)
    const shown = this.springs.shown()
    this.fades.declare(tree)
    const { boxes, sized, placed } = layout(tree, id => shown.get(id))
    for (const [id, fade] of this.fades.states)
      this.fading.push({ at: now, id, height: boxes.get(id)?.height ?? 0, opacity: fade.shown })
    for (const { node, share } of cutTexts(placed)) {
      const box = boxOf(node)
      const opacity = this.fades.opacityOf(node)
      if (opacity >= CUT_MAX_OPACITY) this.cuts.push({ at: now, box: box ?? '', text: node.text ?? '', share, opacity })
    }
    const end = placed.get(tree)?.height ?? 0
    this.listHeights.push(end)
    this.slides.push(sized.flatMap(({ node }) => (node.transitions.has('top') ? [node.style.top ?? 0] : [])))
    for (const gap of gapsOf(segmentsOf(tree, placed), end)) this.gaps.push({ at: now, ...gap })
    const startsHere = [...moved.motion].filter(([, m]) => m.springId?.endsWith(`${MOVED_TO}${now}`)).map(([id]) => id)
    const isInMovedBlock = (id: string) => startsHere.some(b => id.endsWith(` ${b}`))
    if (this.last) {
      const stillAt = (id: string) => (was.has(id) && shown.has(id) ? this.lastShown.get(id) : shown.get(id))
      for (const [id, box] of layout(tree, stillAt).boxes) {
        const before = this.last.get(id)
        const isSprung = /^(box|fit) /.test(id)
        if (!before || !(isSprung || /^(size|panel) /.test(id)) || isInMovedBlock(id)) continue
        const by = Math.max(Math.abs(box.top - before.top), isSprung ? Math.abs(box.height - before.height) : 0)
        if (by >= 0.5) this.jumps.push({ at: now, id, by })
      }
    }
    for (const { node } of sized) {
      const id = node.id?.match(/^title (.+)$/)?.[1]
      const isTitleText = (k: Painted) => k.kids.some(c => c.id === `wrapped ${id}`) || (k.text?.length ?? 0) > 3
      const text = node.kids.find(isTitleText)
      if (id === undefined || !text) continue
      const box = `fit title ${id}`
      const layer = this.fades.states.get(`wrapped ${id}`)
      const wrapped = text.text !== null ? (text.style.isTruncated ? 0 : 1) : (layer?.shown ?? NaN)
      this.titles.push({ at: now, id, wrapped, box: shown.get(box) ?? NaN, isBoxResting: this.springs.isResting(box) })
    }
    for (const { node, height } of sized) node.onSize?.({ width: PANE_WIDTH, height }, null)
    this.lastShown = shown
    this.springs.step(FRAME_MS)
    this.fades.step(FRAME_MS)
    this.last = boxes
  }
}

export type Step = [number, Block[]] | [number, Block[], 'input']

export function framesOf(
  steps: Step[],
  ms = 1500,
): {
  jumps: Jump[]
  titles: TitleForm[]
  gaps: ColumnGap[]
  heights: number[]
  slides: number[][]
  cuts: Cut[]
  fading: Fading[]
} {
  const frames = new Frames()
  const [first] = steps
  if (!first) return { jumps: [], titles: [], gaps: [], heights: [], slides: [], cuts: [], fading: [] }
  const start = 1_000_000
  let drawn: Step | null = null
  for (let at = -500; at < ms; at += FRAME_MS) {
    const step = steps.findLast(([from]) => at >= from) ?? first
    frames.draw(step[1], start + at, step !== drawn && step[2] === 'input')
    drawn = step
  }

  return {
    jumps: frames.jumps.map(j => ({ ...j, at: j.at - start })),
    titles: frames.titles.map(t => ({ ...t, at: t.at - start })),
    gaps: frames.gaps.map(g => ({ ...g, at: g.at - start })),
    heights: frames.listHeights,
    slides: frames.slides,
    cuts: frames.cuts.map(c => ({ ...c, at: c.at - start })),
    fading: frames.fading.map(f => ({ ...f, at: f.at - start })),
  }
}

export const jumpsOf = (steps: Step[], ms = 1500): Jump[] => framesOf(steps, ms).jumps
