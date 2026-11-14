import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { ROW_PAD_PT } from '../../hooks/layout'
import type { Block } from './blocks'
import { CONTROL_GAP, EDGE, GROUP_GAP, HEAD_GAP, INSET, ITEM_GAP, LINE_GAP } from './paint-theme'

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
  const isLabelled = prev.kind === 'heading' || (prev.kind === 'rule' && prev.text !== null)
  if (isLabelled) return HEAD_GAP
  if (prev.kind === 'rule' || b.kind === 'rule') return GROUP_GAP / 2
  if (prev.kind === 'note' && prev.isHead && b.kind === 'note' && b.isHead) return LINE_GAP
  if (prev.kind === 'line' && b.kind === 'line') return CONTROL_GAP
  if (prev.kind === 'line' || prev.kind === 'banner') return GROUP_GAP
  if (b.kind === 'heading') return prev.kind === 'row' || prev.kind === 'pr' ? ITEM_GAP : GROUP_GAP
  if ([prev, b].some(x => x.kind === 'row' || x.kind === 'more')) return EDGE

  return itemGap(prev, b)
}

/**
 * Each block in a box that never shrinks, with the space above it. The list scrolls in a box of fixed height, and a
 * block that could shrink loses its space, or the end of its text, whenever the list overflows. A gap block draws
 * nothing and opens a section's space above the block after it.
 */
export function spacedEls(blocks: Block[], el: (b: Block) => Element): Element[] {
  const out: Element[] = []
  let prev: Block | null = null
  let isSection = false
  for (const b of blocks) {
    if (b.kind === 'gap') {
      isSection = prev !== null
      continue
    }
    const gap = prev === null ? 0 : isSection ? GROUP_GAP : gapBetween(prev, b)
    const above = Math.max(0, gap - (prev === null ? 0 : padOf(prev)) - padOf(b))
    out.push(div().flex_none().pt(above).child(el(b)))
    prev = b
    isSection = false
  }

  return out
}
