import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { v_flex } from 'gpui-base'
import { ROW_PAD_PT } from '../../hooks/layout'
import { isOpenRow } from './blocks'
import type { Block, RowBlock } from './blocks'
import type { RowMotion } from './motion'
import { CONTROL_GAP, EDGE, GROUP_GAP, HEAD_GAP, INSET, ITEM_GAP, LINE_GAP, LINE_HEIGHT } from './paint-theme'
import type { Paint } from './paint-theme'
import { HEIGHT_SPRING } from '../../hooks/springs'

/** The padding a block keeps inside its own box, above and below, as a row's selection box. It counts toward the space. */
const padOf = (b: Block): number => (b.kind === 'row' || b.kind === 'fold' || b.kind === 'more' ? ROW_PAD_PT : 0)

const depthOf = (b: Block): number => ('depth' in b ? b.depth : 0)

/** A line of a list with nothing under it, as a subject's child, a note or a fold. */
const isOneLine = (b: Block): boolean =>
  b.kind === 'status' ? b.under.length === 0 && b.buttons.length === 0 : b.kind === 'note' || b.kind === 'fold'

/** The space between two Status items. One-liners stay close, items inside a group further apart, top-level items further still. */
function itemGap(prev: Block, b: Block): number {
  if (isOneLine(prev) && isOneLine(b)) return CONTROL_GAP
  if (depthOf(b) === 0) return ITEM_GAP

  return INSET
}

/** The space the eye sees between one block's last line and the next block's first. */
function gapBetween(prev: Block, b: Block): number {
  const isLabelled = prev.kind === 'heading' || prev.kind === 'caption' || (prev.kind === 'rule' && prev.text !== null)
  if (isLabelled) return HEAD_GAP
  if (prev.kind === 'rule' || b.kind === 'rule') return GROUP_GAP / 2
  if (prev.kind === 'note' && prev.isHead && b.kind === 'note' && b.isHead) return LINE_GAP
  if (prev.kind === 'line' && b.kind === 'line') return CONTROL_GAP
  if (prev.kind === 'line' || prev.kind === 'banner') return GROUP_GAP
  if (b.kind === 'heading') return prev.kind === 'row' || prev.kind === 'pr' ? ITEM_GAP : GROUP_GAP
  if ([prev, b].some(x => x.kind === 'row' || x.kind === 'more')) return EDGE

  return itemGap(prev, b)
}

function aboveOf(prev: Block | null, b: Block, isSection: boolean): number {
  if (prev === null) return 0
  const gap = isSection ? GROUP_GAP : gapBetween(prev, b)

  return Math.max(0, gap - padOf(prev) - padOf(b))
}

/** The key a row's panel is measured under, beside the row's own height. */
export const panelId = (id: string): string => `panel ${id}`

/** The key a row's title is measured under. */
export const titleId = (id: string): string => `title ${id}`

/** The key a row's lines under its title, with its panel, are measured under. */
export const restId = (id: string): string => `rest ${id}`

/** A drawn block and the space above it. */
export type Space = { block: Block; above: number }

/**
 * Each drawn block with the space above it, from the last block above it that is not shut. A gap block draws nothing
 * and opens a section's space above the next block. A shut block, one that enters or leaves at no height, has no space.
 */
export function spacesOf(blocks: Block[], isShut: (b: Block) => boolean): Space[] {
  const out: Space[] = []
  let prev: Block | null = null
  let isSection = false
  for (const b of blocks) {
    if (b.kind === 'gap') {
      isSection = prev !== null
      continue
    }
    if (isShut(b)) {
      out.push({ block: b, above: 0 })
      continue
    }
    out.push({ block: b, above: aboveOf(prev, b, isSection) })
    prev = b
    isSection = false
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

  return title === undefined || rest === undefined ? undefined : 2 * ROW_PAD_PT + title + rest - panel
}

/**
 * A block's content box. Its height springs to none while the block's box is shut, and to the content's measured
 * height while it is open or at rest, so a change of content glides as the block enters, leaves or changes. In a draw
 * that takes heights at once, and at rest for content whose height follows the pane's, the box takes its content's
 * height.
 */
function contentEl(b: Block, m: RowMotion | undefined, p: Paint, el: Element): Element {
  const id = b.id
  const isRow = b.kind === 'row'
  const isAtOnce = isRow ? p.isAtOnce(titleId(id)) || p.isAtOnce(restId(id)) : p.isAtOnce(id)
  const measured = fitHeight(b, m, p)
  const atRest = isAtOnce || b.kind === 'empty' ? undefined : measured
  const open = isAtOnce ? undefined : (measured ?? 0)
  const height = m?.box === 'shut' ? 0 : m?.box === 'open' ? open : atRest

  return springBox(`fit ${id}`, height).child(isRow ? el : sizeEl(id, p, el))
}

/**
 * A block's space, as a box whose height springs, so a change of the space glides from where it is drawn. In a draw
 * that takes heights at once, it takes its height from padding, which sets no target to spring from.
 */
function spaceEl(s: Space, p: Paint): Element {
  const id = `space ${s.block.id}`
  const box = springHeight(div().id(id).flex_none())

  return p.isAtOnce(id) ? box.pt(s.above) : box.h(s.above)
}

/**
 * Each block in a box that never shrinks, with its space above it. Every distance that can change is the height of a
 * box whose spring is declared in every draw: the space, and the content. So a move that starts while another glides
 * starts where each box is drawn. A block that enters or leaves also fades over the same move's length. The list
 * scrolls in a box of fixed height, and a block that could shrink loses its space, or the end of its text, whenever the
 * list overflows.
 */
export function spacedEls(blocks: Block[], p: Paint, el: (b: Block) => Element): Element[] {
  return spacesOf(blocks, b => p.motion.get(b.id)?.box === 'shut').map(s => {
    const b = s.block
    const m = p.motion.get(b.id)
    const box = v_flex()
      .id(`box ${b.id}`)
      .flex_none()
      .child(spaceEl(s, p))
      .child(contentEl(b, m, p, el(b)))
    if (!m?.box) return box
    const isOpen = m.box === 'open' && fitHeight(b, m, p) !== undefined

    return box.opacity(isOpen ? 1 : 0).transition('opacity', { duration: m.fadeMs, easing: 'ease-out' })
  })
}
