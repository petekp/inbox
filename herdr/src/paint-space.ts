import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { v_flex } from 'gpui-base'
import { ROW_PAD_PT } from '../../hooks/layout'
import type { Block } from './blocks'
import type { RowMotion } from './motion'
import { CONTROL_GAP, EDGE, GROUP_GAP, HEAD_GAP, INSET, ITEM_GAP, LINE_GAP } from './paint-theme'
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

/**
 * A drawn block and its space: `above` before it, and for the last of a run of moving blocks, `below` after it while
 * open and `floor`, the height its box keeps while shut.
 */
export type Space = { block: Block; above: number; below: number; floor: number }

/**
 * Each drawn block with the space above it. A gap block draws nothing and opens a section's space above the block after
 * it. A moving block's box glides its height, and padding cannot glide. So the block under a run of moving blocks keeps
 * the space it has while they are shut, against the last resting block above them, and the run's last box holds the
 * rest of the space it has while they are open, or keeps what the shut space has beyond that.
 */
export function spacesOf(blocks: Block[], isMoving: (b: Block) => boolean): Space[] {
  const out: Space[] = []
  let prev: Block | null = null
  let isSection = false
  let resting: Block | null = null
  let isSectionSinceResting = false
  for (const b of blocks) {
    if (b.kind === 'gap') {
      isSection = prev !== null
      isSectionSinceResting = resting !== null
      continue
    }
    const above = aboveOf(prev, b, isSection)
    const run = out.at(-1)
    const isUnderRun = run !== undefined && isMoving(run.block) && !isMoving(b)
    const shut = isUnderRun ? aboveOf(resting, b, isSectionSinceResting) : above
    const held = Math.min(shut, above)
    if (run && isUnderRun) Object.assign(run, { below: above - held, floor: shut - held })
    out.push({ block: b, above: held, below: 0, floor: 0 })
    prev = b
    isSection = false
    if (!isMoving(b)) {
      resting = b
      isSectionSinceResting = false
    }
  }

  return out
}

/** Springs later changes of an element's height. */
const springHeight = <E extends Element>(el: E): E => el.spring('height', HEIGHT_SPRING)

/**
 * The height a block's content box moves to: its measured height, less a closing row's panel while `isPanelLeftOut`.
 * Undefined until the block's first measure.
 */
function fitHeight(id: string, m: RowMotion | undefined, p: Paint): number | undefined {
  const measured = p.heights.get(id)
  if (measured === undefined) return undefined

  return measured - (m?.isPanelLeftOut ? (p.heights.get(panelId(id)) ?? 0) : 0)
}

/**
 * Content in a box at its measured height, whose height spring is always declared, as a list block, the tab bar or
 * the banners above the list. When the content changes height, as a row opens, a status line comes, or a banner goes,
 * the box keeps its old height for the draw that measures the new one, then springs to it. In a draw that takes
 * heights at once, and always for content whose height follows the pane's, the box takes its content's height.
 */
export function fitEl(id: string, m: RowMotion | undefined, p: Paint, el: Element, isPaneSized = false): Element {
  const height = isPaneSized || p.isAtOnce(id) ? undefined : fitHeight(id, m, p)
  const sized = div()
    .id(`size ${id}`)
    .flex_none()
    .on_size_change((size, cx) => p.measure(id, size, cx))
    .child(el)

  return springHeight(
    v_flex()
      .id(`fit ${id}`)
      .flex_none()
      .overflow_hidden()
      .when(height !== undefined, e => e.h(height ?? 0)),
  ).child(sized)
}

/**
 * A block's outer box. A block that enters or leaves springs its height between none and its content's height with its
 * space, and fades its opacity over the same move's length. Until the block's first measure, its box stays shut. At
 * rest the box takes its content's height.
 */
function boxEl(s: Space, m: RowMotion | undefined, p: Paint, inner: Element): Element {
  const id = s.block.id
  const box = v_flex().id(`box ${id}`).flex_none().child(inner)
  if (!m?.box) return box
  const height = fitHeight(id, m, p)
  const isOpen = m.box === 'open' && height !== undefined
  const sized = box.overflow_hidden().h(isOpen ? s.above + (height ?? 0) + s.below : s.floor)

  return springHeight(sized)
    .opacity(isOpen ? 1 : 0)
    .transition('opacity', { duration: m.fadeMs, easing: 'ease-out' })
}

/**
 * Each block in a box that never shrinks, with its space. The list scrolls in a box of fixed height, and a block that
 * could shrink loses its space, or the end of its text, whenever the list overflows.
 */
export function spacedEls(blocks: Block[], p: Paint, el: (b: Block) => Element): Element[] {
  return spacesOf(blocks, b => (p.motion.get(b.id)?.box ?? null) !== null).map(s => {
    const id = s.block.id
    const m = p.motion.get(id)
    const spaced = div()
      .flex_none()
      .pt(s.above)
      .pb(s.below)
      .child(fitEl(id, m, p, el(s.block), s.block.kind === 'empty'))

    return boxEl(s, m, p, spaced)
  })
}
