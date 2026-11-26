import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { v_flex } from 'gpui-base'
import { ROW_PAD_PT } from '../../core/view/layout'
import { isOpenRow } from './blocks'
import type { Block, RowBlock } from './blocks'
import type { RowMotion } from './motion'
import {
  CHILD_GAP,
  CONTROL_GAP,
  HEAD_GAP,
  INSIDE_GAP,
  ITEM_GAP,
  LIST_GAP,
  LIST_MARGIN,
  SECTION_GAP,
} from './paint-theme'
import type { Paint } from './paint-theme'
import { panelId, prHeadId, restId, titleId } from './heights'
import { PR_TAIL_PARTS, prStatusHeight, prTailHeight, prTailId } from './pr-status'
import { heldLineDrop } from './held-line'
import { underId } from './under-line'
import { shortTitleOf } from './title-cut'
import { shutTo } from './block-glide'
import { contentStrokeEls, feedsOf, passingOf, runsIn, spaceColumnEl, strokeFadesOf } from './paint-strokes'
import { SLIDE_PX, enterDelayMs } from '../../core/view/row-motion'
import { HEIGHT_SPRING } from '../../core/view/springs'
import { fadeEl } from './paint-parts'

/** A group's Closed fold, which ends its list. */
const isClosedFold = (b: Block): boolean => b.kind === 'fold' && 'closedFold' in b.change

/** A PR's head in its dismissed form, which draws its title, its outcome and Undo. */
const isSettledPr = (b: Block): boolean => b.kind === 'row' && b.settled !== null && b.id.startsWith('pr:')

/**
 * The padding a block keeps inside its own box, above and below. It counts toward the space. A Closed fold pads
 * `LIST_MARGIN`, so its label sits that far under the last row's box while the two boxes meet. A dismissed PR pads
 * nothing, so it is no taller than the open PR it replaces and Undo shows whole while the box moves.
 */
export function padOf(b: Block): number {
  if (isClosedFold(b)) return LIST_MARGIN
  if (isSettledPr(b)) return 0

  return b.kind === 'row' || b.kind === 'fold' || b.kind === 'more' ? ROW_PAD_PT : 0
}

/** From a group's title, or the last line of its list, to the text of the next block: a row's padding past its box. */
const LIST_MARGIN_TO_TEXT = LIST_MARGIN + ROW_PAD_PT

/** A group's title, or a caption over a list, as "Other PRs". A label over a part, as the goal's, is not one. */
const isTitle = (b: Block): boolean => (b.kind === 'heading' && !b.isLabel) || b.kind === 'caption'

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
  if (isTitle(prev) || isClosedFold(b)) return LIST_MARGIN_TO_TEXT
  const isLabelled = prev.kind === 'heading' || (prev.kind === 'rule' && prev.text !== null)
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

/** A drawn block and the space above it. */
type Space = { block: Block; above: number }

/**
 * Each drawn block with the space above it, from the last block above it that is not shut. A gap block draws nothing
 * and opens a section's space above the next block, or a milestone step's smaller space. A shut block, one that enters
 * or leaves at no height, has no space, and a shut gap opens none, so the space a gap held closes in the same glide as the
 * rows beside it instead of waiting for the gap to leave the list. `formOf` gives the form a block's spaces are measured
 * from, so a block whose content box keeps its former form's height keeps that form's spaces too, and both start to
 * glide in the same draw.
 */
export function spacesOf(
  blocks: Block[],
  isShut: (b: Block) => boolean,
  formOf: (b: Block) => Block = b => b,
): Space[] {
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
    const form = formOf(b)
    out.push({ block: b, above: aboveOf(prev, form, section) })
    prev = form
    section = null
  }

  return out
}

/** Springs later changes of an element's height. */
const springHeight = <E extends Element>(el: E): E => el.spring('height', HEIGHT_SPRING)

/** A box whose height spring is always declared, at `height`, or at its content's height when undefined. */
export const springBox = (id: string, height: number | undefined): Element =>
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
 * The height a row's title box moves to: the title's measured height while the row is open or holds its height, which
 * is undefined until its first measure, and never under the height its short form rests at. Else that height, which
 * is undefined until the whole title is measured (`shortTitleOf`).
 */
const titleHeightOf = (r: RowBlock, p: Paint): number | undefined => {
  const m = p.motion.get(r.id)
  const rest = shortTitleOf(r, m?.swap?.from ?? null, p.heights).height
  if (!isOpenRow(r) && m?.isHeightHeld !== true) return rest
  const measured = p.heights.get(titleId(r.id))

  return measured === undefined || rest === undefined ? measured : Math.max(measured, rest)
}

/**
 * A row's title in a box whose height springs to `titleHeightOf`. The box clips. An opening title fades to its wrapped
 * form once its box comes to rest, and a closing title fades to its closed form while its box holds, before the box shrinks
 * (`stepTitle`). An open row's title box takes its content's height in a draw that takes heights at once.
 */
export function titleEl(r: RowBlock, p: Paint, el: Element): Element {
  const key = titleId(r.id)
  const height = isOpenRow(r) && p.isAtOnce(key) ? undefined : titleHeightOf(r, p)

  return springBox(`fit ${key}`, height).child(sizeEl(key, p, el))
}

/**
 * The height a block's content box moves to: its measured height, less a closing row's panel while `isPanelLeftOut`.
 * A row's height is its padding, its title's and the rest's, each measured on its own, so the row's box springs in step
 * with its title's box. A PR's is its title's, its status line box's and the lines' under it, so its box springs in step
 * with its status line's box. A block that changed kind takes its former form's height until its new form measures, so its
 * box glides between the two. Undefined until the block's first measure.
 */
function fitHeight(b: Block, m: RowMotion | undefined, p: Paint): number | undefined {
  const id = b.id
  const panel = m?.isPanelLeftOut ? (p.heights.get(panelId(id)) ?? 0) : 0
  const former = () => (m?.former ? fitHeight(m.former, undefined, p) : undefined)
  if (b.kind === 'pr') {
    const head = p.heights.get(prHeadId(id))
    const status = p.heights.get(underId(id))
    const tail = PR_TAIL_PARTS.map(part => prTailHeight(b, part, m, p) ?? p.heights.get(prTailId(part, id)))
    if (head === undefined || status === undefined || tail.some(h => h === undefined)) return former()

    return head + (prStatusHeight(b, m, p) ?? status) + tail.reduce((sum: number, h) => sum + (h ?? 0), 0)
  }
  if (b.kind !== 'row') {
    const measured = p.heights.get(id)

    return measured === undefined ? former() : measured - panel
  }
  const title = titleHeightOf(b, p)
  const rest = p.heights.get(restId(id))

  if (title === undefined || rest === undefined) return former()

  return 2 * padOf(b) + title + rest - panel - heldLineDrop(b, p.now, p.heights)
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

  return springBox(`fit ${m?.springId ?? id}`, height)
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
  const id = `space ${p.motion.get(s.block.id)?.springId ?? s.block.id}`
  const box = springHeight(div().id(id).flex_none())
    .when(columns.length > 0, e => e.relative())
    .children(columns)

  return p.isAtOnce(id) ? box.pt(s.above) : box.h(s.above)
}

/**
 * Each block in a box that never shrinks, with its space above it. Every distance that can change is the height of a
 * box whose spring is declared in every draw: the space, and the content. So a move that starts while another glides
 * starts where each box is drawn. A block that enters or leaves also fades its own drawing: out while its space holds,
 * and in once its space is nearly open. Its connectors fade with it, and so does a column that joins it to a block that
 * stays, so no connector shows while what it joins does not (`strokeFadesOf`). A column that runs on past it between
 * two blocks that stay does not fade. The fade and slide go on a box named for the block, since gpui-kit keys a
 * transition to its element's identity, and an element with no id takes its place in the tree as its identity, which
 * shifts as blocks enter or leave above it. The list scrolls in a box of fixed height, and a block that could shrink loses its
 * space, or the end of its text, whenever the list overflows.
 */
export function spacedEls(blocks: Block[], p: Paint, el: (b: Block) => Element): Element[] {
  const isShut = (b: Block) => p.motion.get(b.id)?.box === 'shut'
  const heldForm = (b: Block) => {
    const m = p.motion.get(b.id)
    if (!m?.former) return b
    const isNewFormUnmeasured = fitHeight(b, { ...m, former: null }, p) === undefined

    return isNewFormUnmeasured ? m.former : b
  }
  const spaces = spacesOf(blocks, isShut, heldForm)
  const drawn = spaces.map(s => s.block)
  const passing = passingOf(drawn, isShut)
  const looks = drawn.map(b => {
    const m = p.motion.get(b.id)
    const height = fitHeight(b, m, p)
    const isShown = m?.box === 'open' && m.isShown && height !== undefined
    const delay = m?.waitsForSpace && height !== undefined ? enterDelayMs(height, shutTo(height, m.shutForMs)) : 0
    const glide = { duration: m?.fadeMs ?? 0, delay, easing: 'ease-out' as const }
    const fade = (e: Element): Element =>
      m?.box ? fadeEl(e, `box ${m.springId ?? b.id}`, isShown ? 1 : 0, glide, p) : e
    const isMoving = m?.box != null
    const move = { isMoving, isGone: isMoving && m?.state === 'leaving' && m.box === 'shut' }

    return { m, isShown, glide, fade, move }
  })
  const moves = looks.map(l => l.move)
  const strokeFades = strokeFadesOf(
    drawn,
    passing,
    moves,
    looks.map(l => l.fade),
  )
  const feeds = feedsOf(drawn, moves)

  return spaces.map((s, i) => {
    const b = s.block
    const passes = passing[i] ?? []
    const comesIn = runsIn(b)
    const intoSpace = [...comesIn, ...passes.filter(c => !comesIn.some(o => o.depth === c.depth))]
    const look = looks[i]
    const f = strokeFades[i]
    if (!look || !f) throw new Error(`no look for block ${b.id}`)
    const { m, isShown, glide, fade } = look
    const key = m?.springId ?? b.id
    const drawing = v_flex().id(`drawing ${key}`).child(el(b))
    const slide = (e: Element): Element =>
      m?.box
        ? e
            .relative()
            .top(isShown ? 0 : -SLIDE_PX)
            .transition('top', glide)
        : e

    return v_flex()
      .id(`box ${key}`)
      .flex_none()
      .child(
        spaceEl(
          s,
          p,
          intoSpace.map(c => spaceColumnEl(key, c, f, p.t)),
        ),
      )
      .child(
        contentEl(
          b,
          m,
          p,
          slide(fade(drawing)),
          contentStrokeEls(key, b, Math.round(padOf(b)), p.t, f, passes, feeds[i] ?? []),
        ),
      )
  })
}
