import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { v_flex } from 'gpui-base'
import { OPEN_ROW_PAD_PT, ROW_PAD_PT } from '../../hooks/layout'
import { isOpenRow } from './blocks'
import type { Block, PathSide, RowBlock, TreeStroke } from './blocks'
import type { PathLine } from '../../hooks/status-path'
import type { RowMotion } from './motion'
import {
  CHILD_GAP,
  CONTROL_GAP,
  EDGE,
  HEAD_GAP,
  INSIDE_GAP,
  ITEM_GAP,
  LINE_HEIGHT,
  LIST_GAP,
  NEST,
  SECTION_GAP,
  SMALL_GAP,
  mixInto,
} from './paint-theme'
import type { Paint, Theme } from './paint-theme'
import { SLIDE_PX } from '../../hooks/row-motion'
import { HEIGHT_SPRING } from '../../hooks/springs'

/**
 * The padding a block keeps inside its own box, above and below, as a row's selection box. It counts toward the space.
 * A selected row's box shows, so it keeps half an item's gap.
 */
export function padOf(b: Block): number {
  if (b.kind === 'row') return b.isSelected ? OPEN_ROW_PAD_PT : ROW_PAD_PT

  return b.kind === 'fold' || b.kind === 'more' ? ROW_PAD_PT : 0
}

/** A row that draws only its title line, with no box showing. */
const isOneLineRow = (r: RowBlock): boolean =>
  !r.isSelected && r.body.length === 0 && r.settled === null && r.feedback === null && r.heldLine === undefined

/** A line of a list with nothing under it, as a subject's child, a closed row, a note or a fold. */
function isOneLine(b: Block): boolean {
  if (b.kind === 'status') return b.under.length === 0 && b.buttons.length === 0
  if (b.kind === 'row') return isOneLineRow(b)

  return b.kind === 'note' || b.kind === 'fold' || b.kind === 'more'
}

const depthOf = (b: Block): number => ('depth' in b ? b.depth : 0)

/**
 * The space between two items of a list. One-liners stay close. An item with more than one line stands apart, less
 * far from its siblings under one parent than from the next top-level item.
 */
function itemGap(prev: Block, b: Block): number {
  if (isOneLine(prev) && isOneLine(b)) return LIST_GAP

  return depthOf(b) > 0 ? CHILD_GAP : ITEM_GAP
}

const isMilestone = (b: Block): boolean => 'path' in b && b.path?.is === 'milestone'

/** The space the eye sees between one block's last line and the next block's first. */
function gapBetween(prev: Block, b: Block): number {
  if ('gapAbove' in b && b.gapAbove !== undefined) return b.gapAbove
  if (isMilestone(prev)) return isMilestone(b) ? LIST_GAP : HEAD_GAP
  const isLabelled = prev.kind === 'heading' || prev.kind === 'caption' || (prev.kind === 'rule' && prev.text !== null)
  if (isLabelled) return HEAD_GAP
  if (prev.kind === 'rule' || b.kind === 'rule') return SECTION_GAP / 2
  if (prev.kind === 'note' && prev.isHead && b.kind === 'note' && b.isHead) return INSIDE_GAP
  if (prev.kind === 'line' && b.kind === 'line') return CONTROL_GAP
  if (prev.kind === 'line' || prev.kind === 'banner' || b.kind === 'heading') return SECTION_GAP

  return itemGap(prev, b)
}

/** The space above `b`, after `prev`: `section`, the space a gap block opened, or else the space between the two. */
function aboveOf(prev: Block | null, b: Block, section: number | null): number {
  if (prev === null) return 0
  const gap = section ?? gapBetween(prev, b)

  return Math.max(0, gap - padOf(prev) - padOf(b))
}

/** The key a row's panel is measured under, beside the row's own height. */
export const panelId = (id: string): string => `panel ${id}`

/** The key a row's title is measured under. */
const titleId = (id: string): string => `title ${id}`

/** The key a row's lines under its title, with its panel, are measured under. */
export const restId = (id: string): string => `rest ${id}`

/** A drawn block and the space above it. */
type Space = { block: Block; above: number }

/**
 * Each drawn block with the space above it, from the last block above it that is not shut. A gap block draws nothing
 * and opens a section's space above the next block, or a milestone step's smaller space. A shut block, one that enters
 * or leaves at no height, has no space, and a shut gap opens none, so the space a gap held closes in the same glide as the
 * rows beside it instead of waiting for the gap to leave the list.
 */
export function spacesOf(blocks: Block[], isShut: (b: Block) => boolean): Space[] {
  const out: Space[] = []
  let prev: Block | null = null
  let section: number | null = null
  for (const b of blocks) {
    if (b.kind === 'gap') {
      if (isShut(b)) continue
      section = prev === null ? null : b.isMilestoneStep ? ITEM_GAP : SECTION_GAP
      continue
    }
    if (isShut(b)) {
      out.push({ block: b, above: 0 })
      continue
    }
    out.push({ block: b, above: aboveOf(prev, b, section) })
    prev = b
    section = null
  }

  return out
}

/** Springs later changes of an element's height. */
const springHeight = <E extends Element>(el: E): E => el.spring('height', HEIGHT_SPRING)

/** A box whose height spring is always declared, at `height`, or at its content's height when undefined. */
const springBox = (id: string, height: number | undefined): Element =>
  springHeight(
    v_flex()
      .id(id)
      .flex_none()
      .overflow_hidden()
      .when(height !== undefined, e => e.h(height ?? 0)),
  )

/**
 * The padding a selected row adds past `ROW_PAD_PT`, above or below its lines, as a box whose height springs, so the
 * row's lines glide with its box as it is selected or left.
 */
export function rowPadEl(r: RowBlock, edge: 'top' | 'bottom', p: Paint): Element {
  const id = `pad ${edge} ${r.id}`
  const box = springHeight(div().id(id).flex_none())
  const extra = padOf(r) - ROW_PAD_PT

  return p.isAtOnce(id) ? box.pt(extra) : box.h(extra)
}

/** Content that reports its size under `key`. */
export const sizeEl = (key: string, p: Paint, el: Element): Element =>
  div()
    .id(`size ${key}`)
    .flex_none()
    .on_size_change((size, cx) => p.measure(key, size, cx))
    .child(el)

/**
 * Content in a box at its measured height, as the tab bar or the banners above the list. When the content changes
 * height, as a banner goes, the box keeps its old height for the draw that measures the new one, then springs to it. In
 * a draw that takes heights at once, and always for content whose height follows the pane's, the box takes its
 * content's height.
 */
export function fitEl(key: string, p: Paint, el: Element, isPaneSized = false): Element {
  const height = isPaneSized || p.isAtOnce(key) ? undefined : p.heights.get(key)

  return springBox(`fit ${key}`, height).child(sizeEl(key, p, el))
}

/**
 * The height a row's title box moves to: one line unless the row is open, else the title's measured height, which is
 * undefined until its first measure.
 */
const titleHeightOf = (r: RowBlock, p: Paint): number | undefined =>
  isOpenRow(r) ? p.heights.get(titleId(r.id)) : LINE_HEIGHT

/**
 * A row's title in a box whose height springs to `titleHeightOf`. The box clips, so a title that keeps its wrap while
 * the row closes loses the lines under its first as the box glides to one line. An open row's title box takes its
 * content's height in a draw that takes heights at once.
 */
export function titleEl(r: RowBlock, p: Paint, el: Element): Element {
  const key = titleId(r.id)
  const height = isOpenRow(r) && p.isAtOnce(key) ? undefined : titleHeightOf(r, p)

  return springBox(`fit ${key}`, height).child(sizeEl(key, p, el))
}

/**
 * The height a block's content box moves to: its measured height, less a closing row's panel while `isPanelLeftOut`.
 * A row's height is its padding, its title's and the rest's, each measured on its own, so the row's box springs in step
 * with its title's box. Undefined until the block's first measure.
 */
function fitHeight(b: Block, m: RowMotion | undefined, p: Paint): number | undefined {
  const id = b.id
  const panel = m?.isPanelLeftOut ? (p.heights.get(panelId(id)) ?? 0) : 0
  if (b.kind !== 'row') {
    const measured = p.heights.get(id)

    return measured === undefined ? undefined : measured - panel
  }
  const title = titleHeightOf(b, p)
  const rest = p.heights.get(restId(id))

  return title === undefined || rest === undefined ? undefined : 2 * padOf(b) + title + rest - panel
}

/**
 * A block's content box. Its height springs to none while the block's box is shut, and to the content's measured
 * height while it is open or at rest, so a change of content glides as the block enters, leaves or changes. In a draw
 * that takes heights at once, and at rest for content whose height follows the pane's, the box takes its content's
 * height.
 */
function contentEl(b: Block, m: RowMotion | undefined, p: Paint, el: Element, strokes: Element[]): Element {
  const id = b.id
  const isRow = b.kind === 'row'
  const isAtOnce = isRow ? p.isAtOnce(titleId(id)) || p.isAtOnce(restId(id)) : p.isAtOnce(id)
  const measured = fitHeight(b, m, p)
  const atRest = isAtOnce || b.kind === 'empty' ? undefined : measured
  const open = isAtOnce ? undefined : (measured ?? 0)
  const height = m?.box === 'shut' ? 0 : m?.box === 'open' ? open : atRest

  return springBox(`fit ${id}`, height)
    .when(strokes.length > 0, e => e.relative())
    .child(isRow ? el : sizeEl(id, p, el))
    .children(strokes)
}

/**
 * A block's space, as a box whose height springs, so a change of the space glides from where it is drawn. In a draw
 * that takes heights at once, it takes its height from padding, which sets no target to spring from. The columns that
 * run on into the block draw across the whole box, at the height it is drawn.
 */
function spaceEl(s: Space, p: Paint, columns: Element[]): Element {
  const id = `space ${s.block.id}`
  const box = springHeight(div().id(id).flex_none())
    .when(columns.length > 0, e => e.relative())
    .children(columns)

  return p.isAtOnce(id) ? box.pt(s.above) : box.h(s.above)
}

/**
 * The path's line and the nesting connectors: the text mixed into the panel's background at the Codex tab's `--tree-line`
 * share, or into `under` where a connector runs through a box that has a color of its own, as a selected row's.
 */
const TREE_LINE_SHARE = 0.2
export const lineColor = (t: Theme, under: Theme[keyof Theme] = t.background) =>
  mixInto(t.foreground, under, TREE_LINE_SHARE)

/** Where the path's line runs: under the middle of a milestone's mark. */
export const PATH_X = EDGE + 4

/** A stretch of the path's line from `top`, down to `height` or to the end of its box. Dashed into the milestone that reads next. */
function pathLineEl(line: PathLine, top: number, height: number | null, t: Theme): Element[] {
  if (line === null) return []
  const el = div().absolute().left(PATH_X).top(top).w(1).border_l_1().border_color(lineColor(t))
  const sized = height === null ? el.bottom(0) : el.h(height)

  return [line === 'to-next' ? sized.border_dashed() : sized]
}

/** A tree column at `depth`, from `top` down to `height` or to the end of its box. */
const columnEl = (depth: number, top: number, height: number | null, t: Theme): Element => {
  const el = div()
    .absolute()
    .left(PATH_X + depth * NEST)
    .top(top)
    .w(1)
    .border_l_1()
    .border_color(lineColor(t))

  return height === null ? el.bottom(0) : el.h(height)
}

/** A column a stroke takes at `depth`, dashed where it is the path's line into the milestone that reads next. */
type Column = { depth: number; isDashed: boolean }

const pathColumn = (line: PathLine): Column[] => (line === null ? [] : [{ depth: 0, isDashed: line === 'to-next' }])

/** The columns a block's strokes run in on from above it. */
function runsIn(b: Block): Column[] {
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
function passingOf(blocks: Block[], isShut: (b: Block) => boolean): Column[][] {
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

/** A column drawn across the whole of its box. */
const wholeColumnEl = (c: Column, t: Theme): Element =>
  c.isDashed ? pathLineEl('to-next', 0, null, t)[0]! : columnEl(c.depth, 0, null, t)

/**
 * The path's line and the nesting connectors beside a block's content, each in the column under the marks of rows at
 * its depth, the column the path's line takes at depth 0. An arm starts a pixel right of its column, and a column that
 * ends at an arm takes the arm's row, so no two strokes cover the same pixel. Arms belong to their row and fade with it.
 */
function contentStrokeEls(b: Block, t: Theme, fade: (el: Element) => Element): Element[] {
  const path = 'path' in b ? b.path : undefined
  const tree = 'tree' in b ? (b.tree ?? []) : []
  const top = Math.round(padOf(b))
  const armAt = Math.round(top + LINE_HEIGHT / 2)
  const pathEls = (side: PathSide): Element[] =>
    side.is === 'work'
      ? pathLineEl(side.line, 0, null, t)
      : [...pathLineEl(side.above, 0, top, t), ...pathLineEl(side.below, top + LINE_HEIGHT, null, t)]
  const treeEls = tree.flatMap(({ depth, is }: TreeStroke): Element[] => {
    const arm = fade(
      div()
        .absolute()
        .left(PATH_X + depth * NEST + 1)
        .top(armAt)
        .w(NEST - (PATH_X - EDGE) - 1 - SMALL_GAP)
        .h(1)
        .border_t_1()
        .border_color(lineColor(t)),
    )
    if (is === 'down') return [columnEl(depth, top + LINE_HEIGHT, null, t)]
    if (is === 'past') return [columnEl(depth, 0, null, t)]
    if (is === 'arm') return [arm]
    if (is === 'last') return [columnEl(depth, 0, armAt + 1, t), arm]

    return [columnEl(depth, 0, null, t), arm]
  })

  return [...(path ? pathEls(path) : []), ...treeEls]
}

/**
 * Each block in a box that never shrinks, with its space above it. Every distance that can change is the height of a
 * box whose spring is declared in every draw: the space, and the content. So a move that starts while another glides
 * starts where each box is drawn. A block that enters or leaves also fades its own drawing over the same move's length.
 * The path's line and the tree columns beside it do not fade, so they stay whole past a block that comes or goes. The
 * list scrolls in a box of fixed height, and a block that could shrink loses its space, or the end of its text,
 * whenever the list overflows.
 */
export function spacedEls(blocks: Block[], p: Paint, el: (b: Block) => Element): Element[] {
  const isShut = (b: Block) => p.motion.get(b.id)?.box === 'shut'
  const spaces = spacesOf(blocks, isShut)
  const passing = passingOf(
    spaces.map(s => s.block),
    isShut,
  )

  return spaces.map((s, i) => {
    const b = s.block
    const passes = passing[i] ?? []
    const comesIn = runsIn(b)
    const intoSpace = [...comesIn, ...passes.filter(c => !comesIn.some(o => o.depth === c.depth))]
    const m = p.motion.get(b.id)
    const isOpen = m?.box === 'open' && fitHeight(b, m, p) !== undefined
    const fade = (e: Element): Element =>
      m?.box ? e.opacity(isOpen ? 1 : 0).transition('opacity', { duration: m.fadeMs, easing: 'ease-out' }) : e
    const slide = (e: Element): Element =>
      m?.box
        ? e
            .relative()
            .top(isOpen ? 0 : -SLIDE_PX)
            .transition('top', { duration: m.fadeMs, easing: 'ease-out' })
        : e

    return v_flex()
      .id(`box ${b.id}`)
      .flex_none()
      .child(
        spaceEl(
          s,
          p,
          intoSpace.map(c => wholeColumnEl(c, p.t)),
        ),
      )
      .child(
        contentEl(b, m, p, slide(fade(el(b))), [
          ...contentStrokeEls(b, p.t, fade),
          ...passes.map(c => wholeColumnEl(c, p.t)),
        ]),
      )
  })
}
