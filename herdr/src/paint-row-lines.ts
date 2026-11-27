import { ENTER_FADE_MS, FAINT_OPACITY, LEAVE_FADE_MS, enterDelayMs } from '../../core/view/row-motion'
import type { Element } from 'gpui-kit'
import { div } from 'gpui-kit'
import { v_flex } from 'gpui-base'
import type { BodyLine, RowBlock, Tone } from './blocks'
import { HOLD_MS, NEXT_FRAME_MS } from './block-glide'
import { addedAt, bodyKey, isStatusUnder } from './held-line'
import { aboveId, aboveLineId, addedId, addedLinesId } from './heights'
import { sizeEl, springBox } from './paint-space'
import type { RowMotion } from './motion'
import { fadeEl } from './paint-parts'
import type { Paint } from './paint-theme'

/**
 * A line a row draws between its title and its panel. `isStatus` marks the row's status or held line, which sits in a
 * box of its own.
 */
type TitleLine = {
  text: string
  tone: Tone
  isHidden?: boolean
  leftAt?: number
  cameAt?: number
  isAgain?: boolean
  isSwapped?: boolean
  isStatus?: true
}

/** The lines a row's form draws between its title and its panel: its settled label, a status after the title, its held line. */
const linesOf = (r: RowBlock): TitleLine[] => [
  ...(r.settled ? [{ text: r.settled.label, tone: r.settled.tone }] : []),
  ...(r.feedback && !isStatusUnder(r) && !r.isLineWaiting
    ? [
        {
          ...r.feedback,
          cameAt: r.lineCameAt,
          isAgain: r.isLineAgain,
          isSwapped: r.isLineSwapped,
          isStatus: true as const,
        },
      ]
    : []),
  ...(r.heldLine ? [{ ...r.heldLine, isStatus: true as const }] : []),
]

/** `el` with the trunk beside it, `trunk`, outside its fade, so the tree stays whole while the line fades or hides. */
const withTrunk = (el: Element, trunk: Element | null): Element =>
  trunk ? v_flex().relative().child(el).child(trunk) : el

/**
 * The lines a row draws between its title and its panel, drawn by `lineEl`, for `shown`, the form the row draws, each
 * with the trunk `trunkOf` gives beside it, which fades only with the panel. A
 * closing row keeps the lines of the open form it closes from while its panel holds its height, as it keeps that
 * form's panel, so a line its closed form adds, such as a press's "Sending…" that its buttons held under them, does
 * not push the fading panel down. A kept line its closed form drops fades out with the panel (`withPanel`). When a press
 * closed the row (`isPanelPressed`), a line its closed form adds shows faint at once over the top of the panel, in
 * `over`, which takes no space, so the press shows in its first draw. Once the panel is left out, a line the closed
 * form adds fades in from the next draw, from the opacity it shows, while the row's box shrinks to its closed height, so no line pops in or out. A status that comes or goes after that, as `holdLinesAbove` gives it, moves
 * in its own box, as on a row at rest, so it keeps its fade when the close ends.
 */
export function titleLineEls(
  r: RowBlock,
  shown: RowBlock,
  m: RowMotion | undefined,
  p: Paint,
  lineEl: (l: TitleLine, n: number) => Element,
  trunkOf: (n: number) => Element | null,
  withPanel: (el: Element) => Element,
): { lines: Element[]; over: Element[] } {
  const drawn = (l: TitleLine, n: number) =>
    leavingEl(r, l, lineEl(l, n).id(`status above ${r.id} line ${n}`), n, p, trunkOf(n))
  const closing = m?.closing ?? null
  const lines = linesOf(shown)
  if (closing === null) return { lines: lines.map(drawn), over: [] }
  const kept = linesOf(closing)
  const isAdded = (l: TitleLine) => !kept.some(k => k.text === l.text)
  const isDropped = (l: TitleLine) => !lines.some(s => s.text === l.text)
  const fadeName = (n: number) => `status above ${r.id} ${n}`
  if (!m?.isPanelLeftOut) {
    const opacity = m?.isPanelPressed ? FAINT_OPACITY : 0
    const added = lines.flatMap((l, n) =>
      isAdded(l) ? [fadeEl(lineEl(l, n).id(fadeName(n)), fadeName(n), opacity, { duration: 0, delay: 0 }, p)] : [],
    )
    const over = m?.isPanelPressed && added.length > 0 ? [overEl(added)] : []
    return { lines: kept.map((l, n) => (isDropped(l) ? withPanel(drawn(l, n)) : drawn(l, n))), over }
  }

  const comes = lines.map((l, n) => {
    const isMovedByHold = l.cameAt !== undefined || l.leftAt !== undefined
    if (!isAdded(l) || isMovedByHold) return drawn(l, n)
    const name = fadeName(n)
    return withTrunk(
      fadeEl(lineEl(l, n).id(name), name, 1, { duration: ENTER_FADE_MS, delay: NEXT_FRAME_MS }, p),
      trunkOf(n),
    )
  })

  return { lines: comes, over: [] }
}

/** Lines drawn over what follows them, from where they start, taking no space. */
const overEl = (els: Element[]): Element =>
  div()
    .relative()
    .child(div().absolute().top(0).left(0).w_full().child(v_flex().children(els)))

/**
 * A held line whose hold let go, as `holdLinesAbove` gives it: it fades out while its box holds the line's height, then
 * the box shuts, with the row's box, so the buttons under it glide up and no empty space stays. A status at rest
 * reports its height as its box's, so a status that comes in its place moves the box from where it is drawn. Other
 * lines draw as they are.
 */
function leavingEl(r: RowBlock, l: TitleLine, el: Element, n: number, p: Paint, trunk: Element | null): Element {
  const leftAt = l.leftAt
  if (l.cameAt !== undefined) return comingEl(r, l, l.cameAt, el, n, p, trunk)
  const whole = withTrunk(el, trunk)
  if (leftAt === undefined) return l.isStatus ? sizeEl(aboveId(r.id), p, sizeEl(aboveLineId(r.id), p, whole)) : whole
  const isFading = p.now < leftAt + HOLD_MS
  const name = `status above ${r.id} line ${n}`
  const faded = l.isHidden ? el : fadeEl(el, name, p.now === leftAt ? 1 : 0, { duration: LEAVE_FADE_MS, delay: 0 }, p)
  const shown = withTrunk(faded, trunk)
  const box = springBox(`fit ${aboveId(r.id)}`, isFading ? p.heights.get(aboveLineId(r.id)) : 0)

  return sizeEl(aboveId(r.id), p, box.child(sizeEl(aboveLineId(r.id), p, shown)))
}

/**
 * A status that came above a row's buttons, as `holdLinesAbove` gives it: its box opens from none, with the row's box,
 * so the buttons under it glide down, and the line shows faint in its first draw, so a press shows at once, then fades
 * in once the box is nearly open. A status that came in place of one of another kind moves its box from the height it
 * was drawn at, as a status under the buttons comes again. One that came in the space of a line that faded out starts
 * hidden.
 */
function comingEl(
  r: RowBlock,
  l: TitleLine,
  cameAt: number,
  el: Element,
  n: number,
  p: Paint,
  trunk: Element | null,
): Element {
  const isStart = p.now === cameAt
  const height = p.heights.get(aboveLineId(r.id))
  const from = l.isAgain ? (p.heights.get(aboveId(r.id)) ?? 0) : 0
  const name = `status above ${r.id} line ${n}`
  const fade = { duration: ENTER_FADE_MS, delay: isStart ? 0 : enterDelayMs(height ?? 0, { x: from, v: 0 }) }
  const shown = withTrunk(fadeEl(el, name, isStart ? (l.isSwapped ? 0 : FAINT_OPACITY) : 1, fade, p), trunk)
  const box = springBox(`fit ${aboveId(r.id)}`, isStart ? from : height)

  return sizeEl(aboveId(r.id), p, box.child(sizeEl(aboveLineId(r.id), p, shown)))
}

/**
 * A row's body lines, `els` drawn for `lines`, a group for each line, with the lines the open row added, as
 * `holdLinesAbove` gives them, in a box of their own: it opens from none, with the row's box, so the buttons under it
 * glide down. The lines show faint until they have measured, so a press shows at once, then fade in once the box is
 * nearly open.
 */
export function addedLinesEls(r: RowBlock, lines: BodyLine[], els: Element[][], p: Paint): Element[] {
  const added = r.addedLines
  const from = added ? addedAt(lines.map(bodyKey), added) : -1
  if (!added || from < 0) return els.flat()
  const end = from + added.keys.length
  const height = p.heights.get(addedLinesId(r.id))
  const isStart = p.now === added.cameAt || height === undefined
  const name = addedId(r.id)
  const fade = { duration: ENTER_FADE_MS, delay: isStart ? 0 : enterDelayMs(height ?? 0) }
  const shown = fadeEl(
    v_flex().id(name).children(els.slice(from, end).flat()),
    name,
    isStart ? FAINT_OPACITY : 1,
    fade,
    p,
  )
  const box = springBox(`fit ${name}`, isStart ? 0 : height)

  return [
    ...els.slice(0, from).flat(),
    sizeEl(name, p, box.child(sizeEl(addedLinesId(r.id), p, shown))),
    ...els.slice(end).flat(),
  ]
}
