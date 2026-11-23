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

/** Column `c` from `top`, down to `height` or to the end of its box. */
function lineEl(c: Column, top: number, height: number | null, t: Theme): Element {
  const el = div()
    .absolute()
    .left(PATH_X + c.depth * NEST)
    .top(top)
    .w(1)
    .border_l_1()
    .border_color(lineColor(t))
  const sized = height === null ? el.bottom(0) : el.h(height)

  return c.isDashed ? sized.border_dashed() : sized
}

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

/**
 * The columns that run past each block where its own strokes do not run on below it: those the nearest block above
 * runs on and the nearest block below runs in. A block between them that enters or leaves, as the Later label or a
 * last row whose column ends at its arm, then keeps the column whole across its gliding box. A block whose box is
 * shutting is no neighbor.
 */
export function passingOf(blocks: Block[], isShut: (b: Block) => boolean): Column[][] {
  const isNeighbor = (b: Block) => b.kind !== 'gap' && !isShut(b)

  return blocks.map((b, i) => {
    const above = blocks.slice(0, i).findLast(isNeighbor)
    const below = blocks.slice(i + 1).find(isNeighbor)
    if (!above || !below) return []
    const own = new Set(runsOn(b).map(c => c.depth))
    const into = new Set(runsIn(below).map(c => c.depth))

    return runsOn(above).filter(c => !own.has(c.depth) && into.has(c.depth))
  })
}

/** Gives an element a block's fade, or leaves it as it is. */
type Fade = (el: Element) => Element

const NO_FADE: Fade = el => el

/**
 * The fade each part of a block's strokes takes: its arms take the block's own, and a column, above the block's first
 * line or below it, takes the fade of the block it joins there.
 */
type StrokeFades = { own: Fade; above: (depth: number) => Fade; below: (depth: number) => Fade }

/** What a block of the list is to its strokes: whether it enters or leaves, and whether it has left. */
type StrokeMove = { isMoving: boolean; isGone: boolean }

/**
 * Who each block's strokes fade with, so a connector shows only while both things it joins show. A column that runs
 * from a block that stays to another that stays never fades, so it stays whole past a block that comes or goes. A
 * column that ends at a block that enters or leaves fades with that block, in the block's own box and in the box it
 * joins, as a fold's rows fade with the column from their parent. A block that has left joins nothing.
 */
export function strokeFadesOf(blocks: Block[], passing: Column[][], moves: StrokeMove[], fades: Fade[]): StrokeFades[] {
  const depths = (cs: Column[], i: number) => new Set([...cs, ...(passing[i] ?? [])].map(c => c.depth))
  const ins = blocks.map((b, i) => depths(runsIn(b), i))
  const ons = blocks.map((b, i) => depths(runsOn(b), i))
  const reach = (i: number, depth: number, by: 1 | -1): { stays: boolean; first: number | null } => {
    let first: number | null = null
    for (let j = i + by; j >= 0 && j < blocks.length; j += by) {
      const move = moves[j]
      if (move?.isGone) continue
      if (!(by === 1 ? ins[j] : ons[j])?.has(depth)) break
      if (!move?.isMoving) return { stays: true, first }
      first ??= j
      if (!(by === 1 ? ons[j] : ins[j])?.has(depth)) break
    }

    return { stays: false, first }
  }

  return blocks.map((_, i) => {
    const own = fades[i] ?? NO_FADE
    if (moves[i]?.isMoving) {
      const isThrough = (depth: number) =>
        ins[i]?.has(depth) === true &&
        ons[i]?.has(depth) === true &&
        reach(i, depth, -1).stays &&
        reach(i, depth, 1).stays
      const side = (depth: number) => (isThrough(depth) ? NO_FADE : own)

      return { own, above: side, below: side }
    }
    const side = (by: 1 | -1) => (depth: number) => {
      const { stays, first } = reach(i, depth, by)

      return stays || first === null ? NO_FADE : (fades[first] ?? NO_FADE)
    }

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
    const depth = 'depth' in b ? b.depth : 0
    const own = new Set(runsOn(b).map(c => c.depth))

    return runsIn(below).filter(c => c.depth === depth && !c.isDashed && !own.has(c.depth))
  })
}

/** A column drawn across a block's space, which the column joins from above. */
export const spaceColumnEl = (c: Column, f: StrokeFades, t: Theme): Element => f.above(c.depth)(lineEl(c, 0, null, t))

/**
 * The path's line and the nesting connectors beside a block's content, each in the column under the marks of rows at
 * its depth, the column the path's line takes at depth 0. An arm starts a pixel right of its column, and a column that
 * ends at an arm takes the arm's row, so no two strokes cover the same pixel. Arms belong to their row and fade with it.
 * A column fades above and below the block's first line as `f` says, split at the arm where the two differ. `top` is
 * the block's padding above its first line.
 */
export function contentStrokeEls(
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
  const whole = (c: Column): Element[] => {
    const up = f.above(c.depth)
    const down = f.below(c.depth)

    return up === down
      ? [up(lineEl(c, 0, null, t))]
      : [up(lineEl(c, 0, armAt + 1, t)), down(lineEl(c, armAt + 1, null, t))]
  }
  const below = (c: Column): Element => f.below(c.depth)(lineEl(c, top + LINE_HEIGHT, null, t))
  const pathEls = (side: PathSide): Element[] =>
    side.is === 'work'
      ? pathColumn(side.line).flatMap(whole)
      : [...pathColumn(side.above).map(c => f.above(0)(lineEl(c, 0, top, t))), ...pathColumn(side.below).map(below)]
  const treeEls = tree.flatMap(({ depth, is }): Element[] => {
    const c = { depth, isDashed: false }
    const arm = f.own(
      div()
        .absolute()
        .left(PATH_X + depth * NEST + 1)
        .top(armAt)
        .w(NEST - (PATH_X - EDGE) - 1 - SMALL_GAP)
        .h(1)
        .border_t_1()
        .border_color(lineColor(t)),
    )
    if (is === 'down') return [below(c)]
    if (is === 'past') return whole(c)
    if (is === 'arm') return [arm]
    if (is === 'last') return [f.above(depth)(lineEl(c, 0, armAt + 1, t)), arm]

    return [...whole(c), arm]
  })

  return [...(path ? pathEls(path) : []), ...treeEls, ...passes.flatMap(whole), ...feeds.map(below)]
}
