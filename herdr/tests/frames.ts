import { HEIGHT_SPRING, springStep } from '../../hooks/springs'
import type { Block } from '../src/blocks'
import type { Paint } from '../src/paint-theme'
import { columnOf } from './gpui-stand-in'
import type { Painted } from './gpui-stand-in'

const { spacedEls } = await import('../src/paint-space')
const { blockEl } = await import('../src/paint-blocks')
const { moveRows, NO_TRACKS } = await import('../src/motion')
const { Heights } = await import('../src/heights')
const { holdLinesAbove, NO_LINES_ABOVE } = await import('../src/held-line')
const { LINE } = await import('../src/paint-theme')

export const FRAME_MS = 16
const PANE_WIDTH = 300
const WRAP_AT = 40

type Box = { top: number; height: number }
type Spring = { x: number; v: number; target: number | undefined }
export type Jump = { at: number; id: string; by: number }
export type TitleForm = { at: number; id: string; isCut: boolean; box: number; isBoxResting: boolean }

const linesOf = (n: Painted): number =>
  n.style.isTruncated ? 1 : Math.max(1, Math.ceil((n.text ?? '').length / WRAP_AT))

function layout(root: Painted, shown: (id: string) => number | undefined) {
  const boxes = new Map<string, Box>()
  const sized: { node: Painted; height: number }[] = []
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
    const height = sprung ?? n.style.h ?? pt + content + (n.style.pb ?? 0)
    sized.push({ node: n, height })
    if (n.id !== null) boxes.set(n.id, { top, height })

    return height
  }
  place(root, 0, 0)

  return { boxes, sized }
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

export class Frames {
  private tracks = NO_TRACKS
  private heights = new Heights()
  private linesAbove = NO_LINES_ABOVE
  private springs = new Springs()
  private lastShown = new Map<string, number>()
  private last: Map<string, Box> | null = null
  jumps: Jump[] = []
  titles: TitleForm[] = []

  draw(blocks: Block[], now: number) {
    const isFirst = this.last === null
    const resized = this.heights.takeResized()
    const held = holdLinesAbove(blocks, isFirst ? NO_LINES_ABOVE : this.linesAbove, now)
    this.linesAbove = held.held
    const moved = moveRows(held.blocks, this.tracks, now, isFirst)
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
      measure: (key: string, size: { width: number; height: number }) => void this.heights.measure(key, size),
      now,
      timeLeft: new Map(),
      input: () => null,
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
    const { boxes, sized } = layout(tree, id => shown.get(id))
    if (this.last) {
      const stillAt = (id: string) => (was.has(id) && shown.has(id) ? this.lastShown.get(id) : shown.get(id))
      for (const [id, box] of layout(tree, stillAt).boxes) {
        const before = this.last.get(id)
        const isSprung = /^(box|fit) /.test(id)
        if (!before || !(isSprung || /^(size|panel) /.test(id))) continue
        const by = Math.max(Math.abs(box.top - before.top), isSprung ? Math.abs(box.height - before.height) : 0)
        if (by >= 0.5) this.jumps.push({ at: now, id, by })
      }
    }
    for (const { node } of sized) {
      const id = node.id?.match(/^title (.+)$/)?.[1]
      const text = node.kids[1]
      if (id === undefined || !text) continue
      const box = `fit title ${id}`
      const isCut = text.style.isTruncated === true
      this.titles.push({ at: now, id, isCut, box: shown.get(box) ?? NaN, isBoxResting: this.springs.isResting(box) })
    }
    for (const { node, height } of sized) node.onSize?.({ width: PANE_WIDTH, height }, null)
    this.lastShown = shown
    this.springs.step(FRAME_MS)
    this.last = boxes
  }
}

export function framesOf(steps: [number, Block[]][], ms = 1500): { jumps: Jump[]; titles: TitleForm[] } {
  const frames = new Frames()
  const [first] = steps
  if (!first) return { jumps: [], titles: [] }
  const start = 1_000_000
  for (let at = -500; at < ms; at += FRAME_MS) {
    const step = steps.findLast(([from]) => at >= from) ?? first
    frames.draw(step[1], start + at)
  }

  return {
    jumps: frames.jumps.map(j => ({ ...j, at: j.at - start })),
    titles: frames.titles.map(t => ({ ...t, at: t.at - start })),
  }
}

export const jumpsOf = (steps: [number, Block[]][], ms = 1500): Jump[] => framesOf(steps, ms).jumps
