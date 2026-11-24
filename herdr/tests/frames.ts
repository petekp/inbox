import { HEIGHT_SPRING, springStep } from '../../core/view/springs'
import type { Block } from '../src/blocks'
import type { Paint } from '../src/paint-theme'
import { checkMotionIds, columnOf, fieldOf } from './gpui-stand-in'
import type { Painted } from './gpui-stand-in'

const { spacedEls } = await import('../src/paint-space')
const { blockEl } = await import('../src/paint-blocks')
const { moveRows, NO_TRACKS } = await import('../src/motion')
const { Heights, MOVED_TO, panelId } = await import('../src/heights')
const { holdLinesAbove, NO_LINES_ABOVE } = await import('../src/held-line')
const { LINE, LINE_HEIGHT, TEXT } = await import('../src/paint-theme')
const { CUT_OPACITY, TURNED_BACK_CUT_OPACITY } = await import('../../core/view/row-motion')
const { easeOut } = await import('../src/panel-steps')
const { HeldFades } = await import('../src/held-fades')

const FRAME_MS = 16
const PANE_WIDTH = 300
const WRAP_AT = 40
const LEADING_PX = (LINE_HEIGHT - TEXT) / 2

type Box = { top: number; height: number }
type Spring = { x: number; v: number; target: number | undefined }
type Jump = { at: number; id: string; by: number }
type TitleForm = { at: number; id: string; tall: number; short: number; box: number; isBoxResting: boolean }
type ColumnGap = { at: number; id: string; x: number; y: number }
type Cut = { at: number; box: string; text: string; share: number; opacity: number }
type Fading = { at: number; id: string; height: number; opacity: number }
type Segment = { id: string; x: number; y0: number; y1: number; runsIn: boolean; runsOn: boolean }
type Shown = { at: number; block: string; text: string; opacity: number; share: number; isFormPart: boolean }

const linesOf = (n: Painted): number =>
  n.style.isTruncated ? 1 : Math.max(1, Math.ceil((n.text ?? '').length / WRAP_AT))

export function layout(root: Painted, shown: (id: string) => number | undefined, line = 0) {
  const boxes = new Map<string, Box>()
  const placed = new Map<Painted, Box>()
  const sized: { node: Painted; height: number }[] = []
  const floating: { node: Painted; height: number }[] = []
  const fits: { id: string | null; height: number; content: number }[] = []
  const place = (n: Painted, top: number, line: number): number => {
    const lh = n.style.line ?? line
    const pt = n.style.pt ?? 0
    const flow = n.kids.filter(k => !k.style.isAbsolute)
    for (const k of n.kids)
      if (k.style.isAbsolute && k.onSize && k.text !== null)
        floating.push({ node: k, height: (k.style.line ?? lh) * linesOf(k) })
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
    const height = sprung ?? n.style.h ?? Math.min(natural, n.style.maxH ?? Infinity)
    const isSet = sprung !== undefined || n.style.h !== undefined || n.style.maxH !== undefined
    if (n.style.isClipped && isSet) fits.push({ id: n.id, height, content: natural })
    sized.push({ node: n, height })
    placed.set(n, { top, height })
    if (n.id !== null) boxes.set(n.id, { top, height })

    return height
  }
  place(root, 0, line)

  return { boxes, sized, floating, placed, fits }
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

type Fade = { shown: number; from: number; target: number; elapsed: number; duration: number; delay: number }

const FADE_PREFIXES = ['box ', 'panel ', 'buttons ', 'status ', 'tall ', 'short ', 'form ', 'trunk ', 'mark ']
const fadesOn = (id: string | null | undefined): boolean => FADE_PREFIXES.some(prefix => id?.startsWith(prefix))

function boxOf(n: Painted): string | null {
  for (let up: Painted | null = n; up; up = up.parent) if (fadesOn(up.id)) return up.id ?? null
  return null
}

const isThroughLetters = (hidden: number, line: number): boolean =>
  hidden % line > LEADING_PX && hidden % line < line - LEADING_PX

function blockOf(n: Painted): string {
  for (let up: Painted | null = n; up; up = up.parent) if (up.id?.startsWith('box ')) return up.id.slice(4)
  return ''
}

function isFormPart(n: Painted): boolean {
  for (let up: Painted | null = n; up; up = up.parent)
    if (up.id?.startsWith('size rest ') || up.id?.startsWith('mark ')) return true
  return false
}

function shownTexts(placed: Map<Painted, Box>): { node: Painted; share: number }[] {
  return [...placed].flatMap(([n, b]) => {
    const isText = n.text !== null || n.field !== null
    if (!isText || n.kids.some(k => !k.style.isAbsolute) || b.height <= 0) return []
    let top = b.top
    let bottom = b.top + b.height
    for (let up = n.parent; up; up = up.parent) {
      const clip = placed.get(up)
      if (!up.style.isClipped || !clip) continue
      top = Math.max(top, clip.top)
      bottom = Math.min(bottom, clip.top + clip.height)
    }
    return [{ node: n, share: Math.max(0, bottom - top) / b.height }]
  })
}

function cutTexts(placed: Map<Painted, Box>): { node: Painted; share: number }[] {
  return [...placed].flatMap(([n, b]) => {
    const isText = n.text !== null || n.field !== null
    if (!isText || n.kids.some(k => !k.style.isAbsolute) || b.height <= 0) return []
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

const retargetedFrom = (s: Fade): number => {
  const sinceDeclared = Math.max(0, s.elapsed + s.delay)
  const done = s.duration > 0 ? Math.min(1, sinceDeclared / s.duration) : 1

  return s.from + (s.target - s.from) * easeOut(done)
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
        if (!state) this.states.set(inBox, { shown: to, from: to, target: to, elapsed: duration, duration, delay: 0 })
        else if (to !== state.target && duration === 0 && delay === 0)
          this.states.set(inBox, { shown: to, from: to, target: to, elapsed: 0, duration, delay: 0 })
        else if (to !== state.target)
          this.states.set(inBox, {
            shown: state.shown,
            from: retargetedFrom(state),
            target: to,
            elapsed: -delay,
            duration,
            delay,
          })
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
      if (fadesOn(up.id)) opacity *= this.states.get(up.id ?? '')?.shown ?? up.style.opacity ?? 1
    return opacity
  }

  step(ms: number) {
    for (const s of this.states.values()) {
      s.elapsed = Math.min(s.duration, s.elapsed + ms)
      const done = s.duration > 0 ? Math.max(0, s.elapsed) / s.duration : s.elapsed >= 0 ? 1 : 0
      s.shown = s.from + (s.target - s.from) * easeOut(done)
    }
  }
}

const fieldState = fieldOf('Pinch ships in the beta')

function paintOf(
  motion: Paint['motion'],
  heights: InstanceType<typeof Heights>,
  isAtOnce: (key: string) => boolean,
  now: number,
  closedSeen = new Map<string, number>(),
  rowTextRoom?: number,
  fades = new HeldFades(),
): Paint {
  const noop = () => {}

  return {
    t: new Proxy({}, { get: () => '#808080' }),
    press: noop,
    select: noop,
    collapse: noop,
    pick: noop,
    motion,
    heights,
    isAtOnce,
    measure: (key: string, size: { width: number; height: number }, _cx: unknown, isWidthDrawn?: boolean) =>
      void heights.measure(key, size, 1, isWidthDrawn),
    now,
    newRows: new Map(),
    closedSeen,
    tab: 'needsYou',
    timeLeft: new Map(),
    input: () => fieldState,
    mono: 'Menlo',
    isNarrow: false,
    listRoom: null,
    fades,
    ...(rowTextRoom === undefined ? {} : { rowTextRoom }),
  } as unknown as Paint
}

export function layoutAtRest(blocks: Block[], measuredWidths: Record<string, number> = {}, rowTextRoom = PANE_WIDTH) {
  const heights = new Heights()
  for (const [key, width] of Object.entries(measuredWidths))
    heights.measure(key, { width, height: LINE_HEIGHT }, 1, true)
  const now = 1_000_000
  const moved = moveRows(blocks, NO_TRACKS, now, true, false, heights)
  const paint = paintOf(moved.motion, heights, () => true, now, new Map(), rowTextRoom)

  return layout(
    columnOf(
      spacedEls(moved.blocks, paint, b => blockEl(b, paint)),
      LINE,
    ),
    () => undefined,
  )
}

class Frames {
  private reports: { at: number; node: Painted; height: number }[] = []

  constructor(private measureLagMs: number) {}

  private tracks = NO_TRACKS
  private heights = new Heights()
  private linesAbove = NO_LINES_ABOVE
  private springs = new Springs()
  private fades = new Fades()
  private held = new HeldFades()
  private closedSeen = new Map<string, number>()
  private lastShown = new Map<string, number>()
  private last: Map<string, Box> | null = null
  private motionIds: Map<string, string> | null = null
  jumps: Jump[] = []
  titles: TitleForm[] = []
  gaps: ColumnGap[] = []
  listHeights: number[] = []
  slides: number[][] = []
  cuts: Cut[] = []
  fading: Fading[] = []
  shown: Shown[] = []

  draw(blocks: Block[], now: number, isInput = false) {
    const isFirst = this.last === null
    const resized = this.heights.takeResized()
    const held = holdLinesAbove(blocks, isFirst ? NO_LINES_ABOVE : this.linesAbove, now)
    this.linesAbove = held.held
    const moved = moveRows(held.blocks, this.tracks, now, isFirst, isInput, this.heights)
    this.tracks = moved.tracks
    const turnedBackPanels = new Set(
      [...moved.tracks.rows]
        .filter(([, t]) => t.track.state === 'opening' && (t.panelSteps?.length ?? 0) > 1)
        .map(([id]) => panelId(id)),
    )
    const paint = paintOf(
      moved.motion,
      this.heights,
      key => isFirst || resized.has(key),
      now,
      this.closedSeen,
      undefined,
      this.held,
    )
    const tree = columnOf(
      spacedEls(moved.blocks, paint, b => blockEl(b, paint)),
      LINE,
    )
    this.held.drew()
    this.motionIds = checkMotionIds(tree, this.motionIds)
    const was = this.springs.shown()
    this.springs.declare(tree)
    const shown = this.springs.shown()
    this.fades.declare(tree)
    const { boxes, sized, floating, placed } = layout(tree, id => shown.get(id))
    for (const [id, fade] of this.fades.states)
      this.fading.push({ at: now, id, height: boxes.get(id)?.height ?? 0, opacity: fade.shown })
    for (const { node, share } of cutTexts(placed)) {
      const box = boxOf(node)
      const opacity = this.fades.opacityOf(node)
      const text = node.text ?? (node.field ? `text field: ${node.field.value()}` : '')
      const maxOpacity = turnedBackPanels.has(box ?? '') ? TURNED_BACK_CUT_OPACITY : CUT_OPACITY
      if (opacity > maxOpacity) this.cuts.push({ at: now, box: box ?? '', text, share, opacity })
    }
    for (const { node, share } of shownTexts(placed)) {
      let plain = 1
      for (let up: Painted | null = node; up; up = up.parent) if (!fadesOn(up.id)) plain *= up.style.opacity ?? 1
      const opacity = this.fades.opacityOf(node) * plain
      const text = node.text ?? (node.field ? `text field: ${node.field.value()}` : '')
      this.shown.push({ at: now, block: blockOf(node), text, opacity, share, isFormPart: isFormPart(node) })
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
      const text = node.kids.find(k => k.kids.some(c => c.id === `copy whole title ${id}`))
      if (id === undefined || !text) continue
      const box = `fit title ${id}`
      const formShown = (form: string) => {
        const layer = text.kids.flatMap(c => [c, ...c.kids]).find(c => c.id === `${form} ${id}`)
        return this.fades.states.get(`${form} ${id}`)?.shown ?? layer?.style.opacity ?? NaN
      }
      const atRest = text.kids.find(k => !k.style.isAbsolute && k.id === null)
      const whole = text.kids.find(k => k.id === `copy whole title ${id}`)?.text
      const isWholeAtRest = atRest?.text === whole && !atRest?.style.isTruncated && atRest?.style.maxH === undefined
      const tall = atRest ? (isWholeAtRest ? 1 : 0) : formShown('tall')
      const short = atRest ? 1 - tall : formShown('short')
      const isBoxResting = this.springs.isResting(box)
      this.titles.push({ at: now, id, tall, short, box: shown.get(box) ?? NaN, isBoxResting })
    }
    const reports = [...sized, ...floating].map(({ node, height }) => ({ at: now + this.measureLagMs, node, height }))
    this.reports.push(...reports)
    for (const { node, height } of this.reports.filter(r => r.at <= now))
      node.onSize?.({ width: PANE_WIDTH, height }, null)
    this.reports = this.reports.filter(r => r.at > now)
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
  measureLagMs = 0,
): {
  jumps: Jump[]
  titles: TitleForm[]
  gaps: ColumnGap[]
  heights: number[]
  slides: number[][]
  cuts: Cut[]
  fading: Fading[]
  shown: Shown[]
} {
  const frames = new Frames(measureLagMs)
  const [first] = steps
  if (!first) return { jumps: [], titles: [], gaps: [], heights: [], slides: [], cuts: [], fading: [], shown: [] }
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
    shown: frames.shown.map(s => ({ ...s, at: s.at - start })),
  }
}

export const jumpsOf = (steps: Step[], ms = 1500): Jump[] => framesOf(steps, ms).jumps
