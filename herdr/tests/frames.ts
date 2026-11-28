import { HEIGHT_SPRING, springStep } from '../../core/view/springs'
import type { Block } from '../src/blocks'
import type { Paint } from '../src/paint-theme'
import { checkMotionIds, columnOf, fieldOf } from './gpui-stand-in'
import type { Painted } from './gpui-stand-in'
import { boxOf, checkFadeIds, fadesOn } from './fade-boxes'
import { type Box, layout, linesOf } from './layout'
import { gapsOf, segmentsOf } from './connector-gaps'
import type { Gap, Hidden } from './connector-gaps'
import { StrokeFades } from './stroke-fades'
import type { StrokeShown } from './stroke-fades'

const { spacedEls } = await import('../src/paint-space')
const { blockEl } = await import('../src/paint-blocks')
const { moveRows } = await import('../src/motion')
const { fetchedIn } = await import('./fetched-steps')
const { filledRows, offSpringBy } = await import('./off-spring')
const { NO_TRACKS } = await import('../src/tracks')
const { Heights, MOVED_TO } = await import('../src/heights')
const { holdLinesAbove, NO_LINES_ABOVE } = await import('../src/held-line')
const { heldAsDrawn } = await import('../src/held-drawn')
const { LINE, LINE_HEIGHT, TEXT } = await import('../src/paint-theme')
const { CUT_OPACITY } = await import('../../core/view/row-motion')
const { easeOut } = await import('../src/panel-steps')
const { HeldFades } = await import('../src/held-fades')

const FRAME_MS = 16
const PANE_WIDTH = 300
const LEADING_PX = (LINE_HEIGHT - TEXT) / 2

type Spring = { x: number; v: number; target: number | undefined }
type Jump = { at: number; id: string; by: number }
type TitleForm = { at: number; id: string; tall: number; short: number; box: number; isBoxResting: boolean }
type ColumnGap = Gap & { at: number }
type Cut = { at: number; box: string; text: string; share: number; opacity: number }
type Fading = { at: number; id: string; height: number; opacity: number }
type Shown = { at: number; block: string; text: string; opacity: number; share: number; isFormPart: boolean }
type ShownLine = { block: string; text: string; top: number; height: number; opacity: number }
type Rest = { fits: { id: string | null; height: number; content: number }[]; lines: ShownLine[] }

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

const isBoxFade = (n: Painted): boolean =>
  n.transitions.get('opacity') !== undefined &&
  n.style.opacity !== undefined &&
  !n.style.isAbsolute &&
  boxOf(n) !== null

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
  private strokeFades = new StrokeFades()
  private held = new HeldFades()
  private closedSeen = new Map<string, number>()
  private lastShown = new Map<string, number>()
  private last: Map<string, Box> | null = null
  private motionIds: Map<string, string> | null = null
  private fadeEnds = new Map<string, number>()
  private drawnIds = new Set<string>()
  jumps: Jump[] = []
  shrinks: Jump[] = []
  titles: TitleForm[] = []
  gaps: ColumnGap[] = []
  listHeights: number[] = []
  slides: number[][] = []
  cuts: Cut[] = []
  fading: Fading[] = []
  shown: Shown[] = []
  strokes: StrokeShown[] = []
  rest: Rest = { fits: [], lines: [] }

  showPage() {
    this.last = null
    this.tracks = NO_TRACKS
    this.linesAbove = NO_LINES_ABOVE
    this.motionIds = null
  }

  private hiddenStrokes(root: Painted, now: number): (n: Painted) => Hidden {
    const fadeEnds = new Map<string, number>()
    const drawn = new Set<string>()
    const walk = (n: Painted) => {
      if (n.id) drawn.add(n.id)
      if (n.id && n.style.opacity === 0) {
        const startsNow = this.drawnIds.has(n.id) ? now + (n.transitions.get('opacity') ?? 0) : -Infinity
        fadeEnds.set(n.id, this.fadeEnds.get(n.id) ?? startsNow)
      }
      n.kids.forEach(walk)
    }
    walk(root)
    this.fadeEnds = fadeEnds
    this.drawnIds = drawn
    const hiddenAs = (n: Painted): Hidden => {
      const end = n.id ? (fadeEnds.get(n.id) ?? Infinity) : Infinity
      return now < end ? null : end === -Infinity ? 'unopened' : 'faded'
    }

    return n => {
      for (let up: Painted | null = n; up; up = up.parent) if (hiddenAs(up)) return hiddenAs(up)
      return null
    }
  }

  draw(blocks: Block[], now: number, isInput = false, fetched?: ReadonlySet<string>) {
    const isFirst = this.last === null
    const resized = this.heights.takeResized()
    const isForming = this.heights.isForming(isFirst, now)
    const lastAbove = isFirst ? NO_LINES_ABOVE : this.linesAbove
    const held = holdLinesAbove(blocks, lastAbove, now, isForming, isInput)
    const moved = moveRows(held.blocks, this.tracks, now, isFirst, isInput, this.heights, fetched)
    this.linesAbove = heldAsDrawn(held, lastAbove, moved)
    this.tracks = moved.tracks
    const paint = paintOf(
      moved.motion,
      this.heights,
      key => isForming || resized.has(key),
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
    checkFadeIds(tree)
    const was = this.springs.shown()
    this.springs.declare(tree)
    const shown = this.springs.shown()
    this.fades.declare(tree)
    this.strokeFades.declare(tree)
    const { boxes, sized, floating, placed, fits } = layout(tree, id => shown.get(id))
    const lines: ShownLine[] = []
    for (const [id, fade] of this.fades.states)
      this.fading.push({ at: now, id, height: boxes.get(id)?.height ?? 0, opacity: fade.shown })
    const plainOf = (node: Painted) => {
      let plain = 1
      for (let up: Painted | null = node; up; up = up.parent)
        if (!fadesOn(up.id) && !isBoxFade(up)) plain *= up.style.opacity ?? 1
      return plain
    }
    for (const { node, share } of cutTexts(placed)) {
      const box = boxOf(node)
      const opacity = this.fades.opacityOf(node) * plainOf(node)
      const text = node.text ?? (node.field ? `text field: ${node.field.value()}` : '')
      if (opacity >= CUT_OPACITY) this.cuts.push({ at: now, box: box ?? '', text, share, opacity })
    }
    for (const { node, share } of shownTexts(placed)) {
      const opacity = this.fades.opacityOf(node) * plainOf(node)
      const text = node.text ?? (node.field ? `text field: ${node.field.value()}` : '')
      this.shown.push({ at: now, block: blockOf(node), text, opacity, share, isFormPart: isFormPart(node) })
      const box = placed.get(node)
      if (box && share > 0) lines.push({ block: blockOf(node), text, opacity, ...box })
    }
    const end = placed.get(tree)?.height ?? 0
    this.listHeights.push(end)
    this.slides.push(sized.flatMap(({ node }) => (node.transitions.has('top') ? [node.style.top ?? 0] : [])))
    for (const gap of gapsOf(segmentsOf(tree, placed, this.hiddenStrokes(tree, now)), end))
      this.gaps.push({ at: now, ...gap })
    this.rest = { fits, lines }
    this.strokes.push(...this.strokeFades.shownIn(placed, now))
    const startsHere = [...moved.motion].filter(([, m]) => m.springId?.endsWith(`${MOVED_TO}${now}`)).map(([id]) => id)
    const isInMovedBlock = (id: string) => startsHere.some(b => id.endsWith(` ${b}`))
    if (this.last && !isForming) {
      const stillAt = (id: string) => (was.has(id) && shown.has(id) ? this.lastShown.get(id) : shown.get(id))
      const filled = filledRows(tree)
      for (const [id, box] of layout(tree, stillAt).boxes) {
        const before = this.last.get(id)
        if (!before || isInMovedBlock(id)) continue
        const by = offSpringBy(id, box, before)
        if (by !== null && by >= 0.5) this.jumps.push({ at: now, id, by })
        const shrank = filled.has(id) ? before.height - box.height : 0
        if (shrank >= 0.5) this.shrinks.push({ at: now, id, by: shrank })
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
    this.strokeFades.step(FRAME_MS)
    this.last = boxes
  }
}

export type Step = [number, Block[]] | [number, Block[], 'input' | 'page']

export function framesOf(
  steps: Step[],
  ms = 1500,
  measureLagMs = 0,
  fetchedAt: ReadonlyMap<number, ReadonlySet<string>> = new Map(),
): {
  jumps: Jump[]
  shrinks: Jump[]
  titles: TitleForm[]
  gaps: ColumnGap[]
  heights: number[]
  slides: number[][]
  cuts: Cut[]
  fading: Fading[]
  shown: Shown[]
  strokes: StrokeShown[]
  rest: Rest
} {
  const frames = new Frames(measureLagMs)
  const [first] = steps
  if (!first)
    return {
      jumps: [],
      shrinks: [],
      titles: [],
      gaps: [],
      heights: [],
      slides: [],
      cuts: [],
      fading: [],
      shown: [],
      strokes: [],
      rest: frames.rest,
    }
  const start = 1_000_000
  let drawn = -1
  for (let at = -500; at < ms; at += FRAME_MS) {
    const index = Math.max(
      steps.findLastIndex(([from]) => at >= from),
      0,
    )
    const step = steps[index] ?? first
    const isNewPage = steps.some(([from, , kind]) => kind === 'page' && from > at - FRAME_MS && from <= at)
    if (isNewPage) frames.showPage()
    const isInput = index !== drawn && step[2] === 'input'
    const fetched = isInput ? fetchedIn(steps.slice(drawn + 1, index + 1), fetchedAt) : undefined
    frames.draw(step[1], start + at, isInput, fetched)
    drawn = index
  }

  return {
    jumps: frames.jumps.map(j => ({ ...j, at: j.at - start })),
    shrinks: frames.shrinks.map(j => ({ ...j, at: j.at - start })),
    titles: frames.titles.map(t => ({ ...t, at: t.at - start })),
    gaps: frames.gaps.map(g => ({ ...g, at: g.at - start })),
    heights: frames.listHeights,
    slides: frames.slides,
    cuts: frames.cuts.map(c => ({ ...c, at: c.at - start })),
    fading: frames.fading.map(f => ({ ...f, at: f.at - start })),
    shown: frames.shown.map(s => ({ ...s, at: s.at - start })),
    strokes: frames.strokes.map(s => ({ ...s, at: s.at - start })),
    rest: frames.rest,
  }
}

export const jumpsOf = (steps: Step[], ms = 1500): Jump[] => framesOf(steps, ms).jumps
