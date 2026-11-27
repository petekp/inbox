import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import type { Block, PathSide } from './blocks'
import type { PathLine } from '../../core/view/status-path'
import { EDGE, LINE_HEIGHT, NEST, SMALL_GAP, flatten, mixInto } from './paint-theme'
import type { Theme } from './paint-theme'

/**
 * The path's line and the nesting connectors: the text mixed into the panel's background at the Codex tab's `--tree-line`
 * share, or into `under`, laid over the panel's background, where a connector runs through a box that has a translucent color of
 * its own, as a selected row's.
 */
const TREE_LINE_SHARE = 0.2
export const lineColor = (t: Theme, under: Theme[keyof Theme] = t.background) =>
  mixInto(t.foreground, flatten(under, t.background), TREE_LINE_SHARE)

/** Where the path's line runs: under the middle of a milestone's mark. */
export const PATH_X = EDGE + 4

/** A column a stroke takes at `depth`, dashed where it is the path's line into the milestone that reads next. */
type Column = { depth: number; isDashed: boolean }

/** Column `c` from `top`, down to `height` or to the end of its box, named `id` so its fade keeps its state. */
function lineEl(id: string, c: Column, top: number, height: number | null, t: Theme): Element {
  const el = div()
    .id(id)
    .absolute()
    .left(PATH_X + c.depth * NEST)
    .top(top)
    .w(1)
    .border_l_1()
    .border_color(lineColor(t))
  const sized = height === null ? el.bottom(0) : el.h(height)

  return c.isDashed ? sized.border_dashed() : sized
}

/** The path's column, solid. */
const PATH: Column = { depth: 0, isDashed: false }

const pathColumn = (line: PathLine): Column[] => (line === null ? [] : [{ depth: 0, isDashed: line === 'to-next' }])

/** The columns a block's strokes run in on from above it. */
export function runsIn(b: Block): Column[] {
  const path = 'path' in b ? b.path : undefined
  const tree = 'tree' in b ? (b.tree ?? []) : []
  const line = path === undefined ? null : path.is === 'work' ? path.line : path.above
  const columns = tree.filter(s => s.is === 'past' || s.is === 'mid' || s.is === 'last')

  return [...pathColumn(line), ...columns.map(s => ({ depth: s.depth, isDashed: false }))]
}

/** The columns a block's strokes run on to below it. */
function runsOn(b: Block): Column[] {
  const path = 'path' in b ? b.path : undefined
  const tree = 'tree' in b ? (b.tree ?? []) : []
  const line = path === undefined ? null : path.is === 'work' ? path.line : path.below
  const columns = tree.filter(s => s.is === 'down' || s.is === 'past' || s.is === 'mid')

  return [...pathColumn(line), ...columns.map(s => ({ depth: s.depth, isDashed: false }))]
}

const depthOf = (b: Block): number => ('depth' in b ? b.depth : 0)

/** Whether a block's own mark or arm meets the column at `depth`, so the column ends or branches there. */
function meetsAt(b: Block, depth: number): boolean {
  const tree = 'tree' in b ? (b.tree ?? []) : []
  const isMilestone = 'path' in b && b.path?.is === 'milestone'

  return (isMilestone && depth === 0) || tree.some(s => s.depth === depth && s.is !== 'past')
}

/**
 * The columns that run past each block where its own strokes do not run on below it: those the nearest block above
 * runs on, or has running past it, and the nearest block below runs in. A block nested deeper than a column, with no
 * stroke in it, is no nearest block for that column. A block between them that enters or leaves, as the Later label
 * or a last row whose column ends at its arm, then keeps the column whole across its gliding box, and so does each
 * row nested under the row above it. A block whose box is shutting is no neighbor.
 */
export function passingOf(blocks: Block[], isShut: (b: Block) => boolean): Column[][] {
  const ins = blocks.map(runsIn)
  const ons = blocks.map(runsOn)
  const depths = [...new Set([...ins, ...ons].flat().map(c => c.depth))]
  const out: Column[][] = []
  const has = (cs: Column[] | undefined, depth: number) => cs?.some(c => c.depth === depth) === true
  const isNearest = (j: number, depth: number) => {
    const b = blocks[j]
    if (!b || b.kind === 'gap' || isShut(b)) return false

    return depthOf(b) <= depth || meetsAt(b, depth) || has(ins[j], depth) || has(ons[j], depth)
  }
  const indices = blocks.map((_, j) => j)
  for (const i of indices) {
    const above = (depth: number) => indices.slice(0, i).findLast(j => isNearest(j, depth))
    const below = (depth: number) => indices.slice(i + 1).find(j => isNearest(j, depth))
    out.push(
      depths.flatMap(depth => {
        const from = above(depth)
        const into = below(depth)
        if (has(ons[i], depth) || from === undefined || into === undefined || !has(ins[into], depth)) return []
        const c = [...(ons[from] ?? []), ...(out[from] ?? [])].find(o => o.depth === depth)

        return c ? [c] : []
      }),
    )
  }

  return out
}

/**
 * How long each block's content waits before it fades in, from `waits`, each block's own wait, or null for one that does
 * not wait for its space. Blocks that wait and that a column joins one to the next wait for the longest of them, so they
 * fade in together, and a short line's connector never shows while the taller line it joins is still hidden.
 */
export function joinedWaits(blocks: Block[], passing: Column[][], waits: (number | null)[]): number[] {
  const depths = (cs: Column[], i: number) => new Set([...cs, ...(passing[i] ?? [])].map(c => c.depth))
  const isJoined = (i: number) => {
    const above = blocks[i - 1]
    const b = blocks[i]
    if (!above || !b || waits[i - 1] == null || waits[i] == null) return false
    const ons = depths(runsOn(above), i - 1)

    return [...depths(runsIn(b), i)].some(d => ons.has(d))
  }
  const out: number[] = []
  let start = 0
  for (let i = 0; i <= blocks.length; i++) {
    if (i < blocks.length && i > 0 && isJoined(i)) continue
    const run = waits.slice(start, i).map(w => w ?? 0)
    const longest = Math.max(0, ...run)
    out.push(...waits.slice(start, i).map(w => (w === null ? 0 : longest)))
    start = i
  }

  return out
}

/** Gives an element a block's fade, or leaves it as it is. */
type Fade = (el: Element) => Element

const NO_FADE: Fade = el => el

/** A column of a block that has left, where the column no longer joins two blocks. */
const HIDDEN: Fade = el => el.opacity(0)

/**
 * The fade each part of a block's strokes takes: its arms take the block's own, and a column, above the block's first
 * line or below it, takes the fade of the block it joins there.
 */
type StrokeFades = { own: Fade; above: (depth: number) => Fade; below: (depth: number) => Fade }

/**
 * Where a column runs from a block, up or down: to a block that stays, or to the block that enters or leaves where it
 * ends, `end`, past `first`, the nearest such block it passes.
 */
type ColumnReach = { stays: boolean; first: number | null; end: number | null }

/**
 * What a block of the list is to its strokes: whether it enters or leaves, whether it has left, and whether its content
 * hides, as it does while it leaves or while it enters and waits for its space.
 */
type StrokeMove = { isMoving: boolean; isGone: boolean; isHiding: boolean }

/**
 * Who each block's strokes fade with, so a connector shows only while both things it joins show. Up and down, a column
 * joins the nearest block that stays or where it ends. It runs past a row that stays nested beside it, a block that has
 * left, and a block that enters or leaves while the column runs on below it, as the path runs past a subject's mark. A
 * column whose two ends stay never fades, so it stays whole past a block that comes or goes. Otherwise it fades along
 * its whole way with an end that enters or leaves: the upper end whose content hides, as while it leaves or waits for
 * its space, else the upper end. So a fold's rows fade with the column from their
 * parent, and a column stays whole past a copy that has left while both its ends show. A column of a block that has left
 * that no longer joins two blocks hides at once, since its content has already faded.
 */
export function strokeFadesOf(blocks: Block[], passing: Column[][], moves: StrokeMove[], fades: Fade[]): StrokeFades[] {
  const depths = (cs: Column[], i: number) => new Set([...cs, ...(passing[i] ?? [])].map(c => c.depth))
  const ins = blocks.map((b, i) => depths(runsIn(b), i))
  const ons = blocks.map((b, i) => depths(runsOn(b), i))
  const isPassed = (j: number, depth: number) => {
    const b = blocks[j]

    return b !== undefined && ins[j]?.has(depth) === true && ons[j]?.has(depth) === true && !meetsAt(b, depth)
  }
  const reach = (i: number, depth: number, by: 1 | -1): ColumnReach => {
    let first: number | null = null
    for (let j = i + by; j >= 0 && j < blocks.length; j += by) {
      const move = moves[j]
      if (move?.isGone) continue
      if (!(by === 1 ? ins[j] : ons[j])?.has(depth)) break
      if (!move?.isMoving && !isPassed(j, depth)) return { stays: true, first, end: null }
      if (!move?.isMoving) continue
      first ??= j
      if (!(by === 1 ? ons[j] : ins[j])?.has(depth)) return { stays: false, first, end: j }
    }

    return { stays: false, first, end: null }
  }
  const joinsAt = (r: ColumnReach): number | null | undefined => (r.stays ? null : (r.end ?? undefined))
  /** The fade of the upper end among `ends` whose content hides, else of the upper end, where null is an end that stays. */
  const shownLast = (ends: (number | null)[]): Fade => {
    const moving = ends.filter(j => j !== null)
    const end = moving.find(j => moves[j]?.isHiding) ?? moving[0]

    return end === undefined ? NO_FADE : (fades[end] ?? NO_FADE)
  }

  return blocks.map((_, i) => {
    const own = fades[i] ?? NO_FADE
    if (moves[i]?.isMoving) {
      const off = moves[i]?.isGone ? HIDDEN : own
      const side = (depth: number): Fade => {
        const hasIn = ins[i]?.has(depth) === true
        const hasOn = ons[i]?.has(depth) === true
        const isThrough = hasIn && hasOn
        if (moves[i]?.isGone && !isThrough) return off
        const above = hasIn ? joinsAt(reach(i, depth, -1)) : i
        const below = hasOn ? joinsAt(reach(i, depth, 1)) : i
        if (above === undefined || below === undefined) return off

        return shownLast([above, below])
      }

      return { own, above: side, below: side }
    }
    const endOf = (depth: number, by: 1 | -1) => {
      const { stays, first, end } = reach(i, depth, by)

      return stays ? null : (end ?? first)
    }
    const side = (by: 1 | -1) => (depth: number) =>
      isPassed(i, depth) ? shownLast([endOf(depth, -1), endOf(depth, 1)]) : shownLast([endOf(depth, by)])

    return { own, above: side(-1), below: side(1) }
  })
}

/**
 * The columns a parent that stays runs down to rows that leave, once its own form has lost them, as a fold shuts: those
 * the next block, while it leaves, runs in under the parent's mark.
 */
export function feedsOf(blocks: Block[], moves: StrokeMove[]): Column[][] {
  return blocks.map((b, i) => {
    if (moves[i]?.isMoving || moves[i]?.isGone) return []
    const next = blocks.findIndex((_, j) => j > i && moves[j]?.isGone !== true)
    const below = blocks[next]
    if (!below || !moves[next]?.isMoving) return []
    const depth = depthOf(b)
    const own = new Set(runsOn(b).map(c => c.depth))

    return runsIn(below).filter(c => c.depth === depth && !c.isDashed && !own.has(c.depth))
  })
}

/** How far a nesting column reaches beside a block: to its end, to the arm, or from `lowerFrom` down. */
type Reach = { isDashed: boolean; toEnd: boolean; toArm: boolean; lowerFrom: number | null }

/** A column drawn across the space of the block drawn under `key`, which the column joins from above. */
export const spaceColumnEl = (key: string, c: Column, f: StrokeFades, t: Theme): Element =>
  f.above(c.depth)(lineEl(`space column ${key} ${c.depth}`, c, 0, null, t))

/**
 * The path's line and the nesting connectors beside a block's content, each in the column under the marks of rows at
 * its depth, the column the path's line takes at depth 0. An arm starts a pixel right of its column, and a column that
 * ends at an arm takes the arm's row, so no two strokes cover the same pixel. Arms belong to their row and fade with it.
 * A column fades above and below the block's first line as `f` says, split at the arm where the two differ. `top` is
 * the block's padding above its first line. Each stroke is named for the block's `key`, its depth and its part, never
 * for the row or column it serves, so a line keeps its name, and the state of its fade, while what it joins changes.
 * Each depth draws one upper and one lower part, the reach of every stroke at that depth, and a part it lacks at no
 * height, so it is there to fade when it shows.
 */
export function contentStrokeEls(
  key: string,
  b: Block,
  top: number,
  t: Theme,
  f: StrokeFades,
  passes: Column[],
  feeds: Column[],
): Element[] {
  const path = 'path' in b ? b.path : undefined
  const tree = 'tree' in b ? (b.tree ?? []) : []
  const armAt = Math.round(top + LINE_HEIGHT / 2)
  const idOf = (name: string, part: 'top' | 'bottom' | 'arm') => `stroke ${key} ${name} ${part}`
  const upper = (c: Column, name: string, height: number): Element =>
    f.above(c.depth)(lineEl(idOf(name, 'top'), c, 0, height, t))
  const lower = (c: Column, name: string, from: number): Element =>
    f.below(c.depth)(lineEl(idOf(name, 'bottom'), c, from, null, t))
  const whole = (c: Column, name: string): Element[] => {
    const isSplit = f.above(c.depth) !== f.below(c.depth)
    const abovePart = f.above(c.depth)(lineEl(idOf(name, 'top'), c, 0, isSplit ? armAt + 1 : null, t))
    const belowPart = f.below(c.depth)(lineEl(idOf(name, 'bottom'), c, armAt + 1, isSplit ? null : 0, t))

    return [abovePart, belowPart]
  }
  const below = (c: Column, name: string): Element => lower(c, name, top + LINE_HEIGHT)
  const lacking = (part: 'top' | 'bottom'): Element =>
    (part === 'top' ? f.above(0) : f.below(0))(lineEl(idOf('path', part), PATH, armAt + 1, 0, t))
  const pathEls = (side: PathSide): Element[] => {
    if (side.is === 'work') {
      const [line] = pathColumn(side.line)
      return line ? whole(line, 'path') : [lacking('top'), lacking('bottom')]
    }
    const [above] = pathColumn(side.above)
    const [under] = pathColumn(side.below)

    return [above ? upper(above, 'path', top) : lacking('top'), under ? below(under, 'path') : lacking('bottom')]
  }
  const reaches = new Map<number, Reach>()
  const reachOf = (c: Column): Reach => {
    const r = reaches.get(c.depth) ?? { isDashed: true, toEnd: false, toArm: false, lowerFrom: null }
    r.isDashed &&= c.isDashed
    reaches.set(c.depth, r)

    return r
  }
  const reachWhole = (c: Column) => void (reachOf(c).toEnd = true)
  const reachBelow = (c: Column) => {
    const r = reachOf(c)
    r.lowerFrom = Math.min(r.lowerFrom ?? Infinity, top + LINE_HEIGHT)
  }
  const arms = tree.flatMap(({ depth, is }): Element[] => {
    const c = { depth, isDashed: false }
    if (is === 'down') reachBelow(c)
    else if (is === 'last') reachOf(c).toArm = true
    else if (is !== 'arm') reachWhole(c)
    if (is === 'down' || is === 'past') return []

    return [
      f.own(
        div()
          .id(`stroke ${key} arm ${depth}`)
          .absolute()
          .left(PATH_X + depth * NEST + 1)
          .top(armAt)
          .w(NEST - (PATH_X - EDGE) - 1 - SMALL_GAP)
          .h(1)
          .border_t_1()
          .border_color(lineColor(t)),
      ),
    ]
  })
  passes.forEach(reachWhole)
  feeds.forEach(reachBelow)
  const columnEls = [...reaches].flatMap(([depth, r]): Element[] => {
    const c = { depth, isDashed: r.isDashed }
    const isSplit = f.above(depth) !== f.below(depth)
    const hasUpper = r.toEnd || r.toArm
    const upperHeight = r.toEnd && !isSplit ? null : hasUpper ? armAt + 1 : 0
    const lowerFrom = r.toEnd ? armAt + 1 : (r.lowerFrom ?? armAt + 1)
    const lowerHeight = r.toEnd ? (isSplit ? null : 0) : r.lowerFrom === null ? 0 : null
    const id = (part: 'top' | 'bottom') => `stroke ${key} column ${depth} ${part}`

    return [
      f.above(depth)(lineEl(id('top'), c, hasUpper ? 0 : armAt + 1, upperHeight, t)),
      f.below(depth)(lineEl(id('bottom'), c, lowerFrom, lowerHeight, t)),
    ]
  })

  return [...(path ? pathEls(path) : []), ...columnEls, ...arms]
}
