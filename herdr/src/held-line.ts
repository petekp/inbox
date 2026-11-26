import { isFailure, isStatusUnderActions } from '../../core/view/feedback'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import { heldLineEndsAt, isPressUnderWay, stepHeldLine } from '../../core/view/held-line'
import type { HeldLine } from '../../core/view/held-line'
import { agedText, isOpenRow } from './blocks'
import type { AddedOptions, Aged, Block, RowBlock, Tone } from './blocks'
import { HOLD_MS, NEXT_FRAME_MS } from './block-glide'
import { aboveId, aboveLineId, addedId, addedLinesId } from './heights'
import type { Sizes } from './heights'

/** A row's status line that the panel draws on its own line between the row's title and its buttons. `aged` keeps a status's age counting while the line is held. */
type LineAbove = { text: string; tone: Tone; aged?: Aged; cameAt?: number }

/**
 * What each row holds above its buttons, by row id: the line it last drew there, or null for a row that drew none
 * there when its press went out, so its status stays under its buttons. `lineless` names the rows that last drew their
 * buttons with no line above them. `options` gives each open row's option ids as last drawn, and `added` the options
 * a row added while their box opens.
 */
export type LinesAbove = {
  held: ReadonlyMap<string, HeldLine<LineAbove> | null>
  lineless: ReadonlySet<string>
  options: ReadonlyMap<string, string[]>
  added: ReadonlyMap<string, AddedOptions>
}

export const NO_LINES_ABOVE: LinesAbove = { held: new Map(), lineless: new Set(), options: new Map(), added: new Map() }

/** How long a line whose hold let go stays drawn: its fade, then its space closing. */
const HELD_LEAVE_MS = HOLD_MS + HEIGHT_SETTLE_MS

/** How long a status that comes above a row's buttons takes to come: its box opening, then the line fading in. */
const LINE_COMES_MS = NEXT_FRAME_MS + HEIGHT_SETTLE_MS

/** Undo takes the place of a settled row's buttons, so a settled row holds nothing from its open form. */
const heldKey = (r: RowBlock): string => (r.settled ? `settled ${r.id}` : r.id)

const hasActions = (r: RowBlock): boolean => r.buttons.length > 0 || r.field !== null

/** Whether a row's status goes under its buttons: where `isStatusUnderActions` places it, or held there. */
export const isStatusUnder = (r: RowBlock): boolean =>
  r.feedback !== null && (r.isStatusHeldUnder === true || isStatusUnderActions(r.feedback.source, hasActions(r)))

const lineOf = (f: NonNullable<RowBlock['feedback']>, cameAt?: number): LineAbove => ({
  text: f.text,
  tone: f.tone,
  ...(f.aged ? { aged: f.aged } : {}),
  ...(cameAt === undefined ? {} : { cameAt }),
})

const isComing = (l: LineAbove | undefined, now: number): l is LineAbove & { cameAt: number } =>
  l?.cameAt !== undefined && now < l.cameAt + LINE_COMES_MS

/**
 * The options an open row added at `now`, after `was`, given the option ids it drew last, `last`, and now, `ids`: the
 * ones it adds after those it kept, as "All N options" does, while their box opens. A draw that takes heights at once
 * draws them at rest.
 */
function stepAdded(
  was: AddedOptions | undefined,
  last: string[] | undefined,
  ids: string[],
  now: number,
  isAtOnce: boolean,
) {
  if (isAtOnce) return null
  if (was && ids.includes(was.firstId) && now < was.cameAt + LINE_COMES_MS) return was
  const isAdded =
    last !== undefined && last.length > 0 && ids.length > last.length && last.every((id, n) => ids[n] === id)
  const firstId = isAdded ? ids[last.length] : undefined

  return firstId === undefined ? null : { firstId, cameAt: now }
}

/**
 * The blocks with the options each open row added, as `stepAdded` gives them. They open a box of their own, so the
 * buttons under them glide down as the row's box grows.
 */
function addOptions(blocks: Block[], last: LinesAbove, now: number, isAtOnce: boolean) {
  const options = new Map<string, string[]>()
  const added = new Map<string, AddedOptions>()
  const shown = blocks.map((b): Block => {
    if (b.kind !== 'row' || !isOpenRow(b) || !hasActions(b)) return b
    const ids = b.buttons.filter(x => x.isOption).map(x => x.id)
    options.set(b.id, ids)
    const a = stepAdded(last.added.get(b.id), last.options.get(b.id), ids, now, isAtOnce)
    if (a) added.set(b.id, a)
    return a ? { ...b, addedOptions: a } : b
  })
  const ends = [...added.values()].flatMap(a => [a.cameAt + NEXT_FRAME_MS, a.cameAt + LINE_COMES_MS])

  return { blocks: shown, options, added, ends: ends.filter(at => at > now) }
}

/**
 * The blocks with each row's held line, the lines to hold at the next draw, and when a held line next changes how it
 * draws. The panel draws a status that follows the title on its own line above the buttons, where the other looks put
 * it in the title's text. The line keeps its place while a press puts the row's status under the buttons, so they hold
 * their place, and lets go as `stepHeldLine` says. A line that lets go fades out while its space holds, then its space
 * closes.
 *
 * A row whose press went out with no line above keeps its status under its buttons, where the press under way read, as
 * with "✓ Explained". A row drawn without buttons during its press, such as one deselected, keeps what it holds for
 * when it shows them again. A row that settles or comes back from settled starts holding afresh.
 *
 * A status that comes above the buttons of a row that last drew them with no line above opens a box for itself, so the
 * buttons glide down (`lineCameAt`). A row that shows its buttons again, such as one selected, draws its line at rest,
 * as does a draw that takes heights at once, `isAtOnce`.
 */
export function holdLinesAbove(
  blocks: Block[],
  last: LinesAbove,
  now: number,
  isAtOnce = false,
): { blocks: Block[]; held: LinesAbove; nextAt: number | null } {
  const next = new Map<string, HeldLine<LineAbove> | null>()
  const lineless = new Set<string>()
  const shown = blocks.map((b): Block => {
    if (b.kind !== 'row') return b
    const key = heldKey(b)
    const kept = last.held.get(key)
    const f = b.feedback
    const source = f?.source ?? null
    const isUnderWay = isPressUnderWay(source)
    if (!hasActions(b)) {
      if (kept !== undefined && isUnderWay) next.set(key, kept)
      return b
    }
    const isUnder = isStatusUnder(b)
    const isStarting = kept === undefined && f !== null && isUnder && (isUnderWay || source?.is === 'queued')
    if (kept === null || isStarting) {
      next.set(key, null)
      lineless.add(key)
      return kept === null && f !== null && !isUnder ? { ...b, isStatusHeldUnder: true } : b
    }
    const isNewLine = kept === undefined && !isAtOnce && last.lineless.has(key)
    const cameAt = isNewLine ? now : kept?.leftAt === null ? kept.line.cameAt : undefined
    const own = f !== null && !isUnder ? lineOf(f, cameAt) : null
    const isOwnFailure = f !== null && isFailure(f.source)
    const step = stepHeldLine(
      kept,
      { own, isOwnFailure, isUnder: f !== null && isUnder, isPressUnderWay: isUnderWay },
      now,
      HELD_LEAVE_MS,
    )
    if (step.kept) next.set(key, step.kept)
    const d = step.drawn
    if (!d && !own) lineless.add(key)
    if (!d) return own && isComing(own, now) ? { ...b, lineCameAt: own.cameAt } : b
    const text = d.line.aged ? agedText(d.line.aged, now) : d.line.text

    return {
      ...b,
      heldLine: { text, tone: d.line.tone, isHidden: d.isHidden, ...(d.leftAt === null ? {} : { leftAt: d.leftAt }) },
    }
  })
  const withAdded = addOptions(shown, last, now, isAtOnce)
  const ends = [...next.values()].flatMap(k => {
    if (isComing(k?.line, now))
      return [k.line.cameAt + NEXT_FRAME_MS, k.line.cameAt + LINE_COMES_MS].filter(at => at > now)
    const end = heldLineEndsAt(k, HELD_LEAVE_MS)
    return end === null || k?.leftAt == null
      ? []
      : [k.leftAt + NEXT_FRAME_MS, k.leftAt + HOLD_MS, end].filter(at => at > now)
  })

  ends.push(...withAdded.ends)
  const held = { held: next, lineless, options: withAdded.options, added: withAdded.added }

  return { blocks: withAdded.blocks, held, nextAt: ends.length === 0 ? null : Math.min(...ends) }
}

/** Whether a row's held line that let go has faded, so its box shuts. */
const isHeldLineShutting = (r: RowBlock, now: number): boolean =>
  r.heldLine?.leftAt !== undefined && now >= r.heldLine.leftAt + HOLD_MS

/**
 * How far a row's measured rest is over the height it moves to while its held line's box shuts: the box's height as
 * last measured. The row's box then springs with the line's box, as one move.
 */
export const heldLineDrop = (r: RowBlock, now: number, heights: Sizes): number =>
  isHeldLineShutting(r, now) ? (heights.get(aboveId(r.id)) ?? 0) : 0

/**
 * How far a row's measured rest is under the height it moves to while the box of a status that came above its buttons
 * opens: the line's height less its box's, from the draw after it came. The row's box then springs with the line's box.
 */
export const lineRise = (r: RowBlock, now: number, heights: Sizes): number =>
  r.lineCameAt === undefined || now === r.lineCameAt
    ? 0
    : Math.max(0, (heights.get(aboveLineId(r.id)) ?? 0) - (heights.get(aboveId(r.id)) ?? 0))

/** As `lineRise`, for the box of the options an open row added. */
export const addedRise = (r: RowBlock, now: number, heights: Sizes): number =>
  r.addedOptions === undefined || now === r.addedOptions.cameAt
    ? 0
    : Math.max(0, (heights.get(addedLinesId(r.id)) ?? 0) - (heights.get(addedId(r.id)) ?? 0))
