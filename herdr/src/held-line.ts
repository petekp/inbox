import { isFailure, isStatusUnderActions } from '../../core/view/feedback'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import { heldLineEndsAt, isPressUnderWay, stepHeldLine } from '../../core/view/held-line'
import type { HeldLine } from '../../core/view/held-line'
import { agedText } from './blocks'
import type { Aged, Block, RowBlock, Tone } from './blocks'
import { HOLD_MS, NEXT_FRAME_MS } from './block-glide'
import { aboveId } from './heights'
import type { Sizes } from './heights'

/** A row's status line that the panel draws on its own line between the row's title and its buttons. `aged` keeps a status's age counting while the line is held. */
type LineAbove = { text: string; tone: Tone; aged?: Aged }

/**
 * What each row holds above its buttons, by row id: the line it last drew there, or null for a row that drew none
 * there when its press went out, so its status stays under its buttons.
 */
export type LinesAbove = ReadonlyMap<string, HeldLine<LineAbove> | null>

export const NO_LINES_ABOVE: LinesAbove = new Map()

/** How long a line whose hold let go stays drawn: its fade, then its space closing. */
const HELD_LEAVE_MS = HOLD_MS + HEIGHT_SETTLE_MS

/** Undo takes the place of a settled row's buttons, so a settled row holds nothing from its open form. */
const heldKey = (r: RowBlock): string => (r.settled ? `settled ${r.id}` : r.id)

const hasActions = (r: RowBlock): boolean => r.buttons.length > 0 || r.field !== null

/** Whether a row's status goes under its buttons: where `isStatusUnderActions` places it, or held there. */
export const isStatusUnder = (r: RowBlock): boolean =>
  r.feedback !== null && (r.isStatusHeldUnder === true || isStatusUnderActions(r.feedback.source, hasActions(r)))

const lineOf = (f: NonNullable<RowBlock['feedback']>): LineAbove => ({
  text: f.text,
  tone: f.tone,
  ...(f.aged ? { aged: f.aged } : {}),
})

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
 */
export function holdLinesAbove(
  blocks: Block[],
  held: LinesAbove,
  now: number,
): { blocks: Block[]; held: LinesAbove; nextAt: number | null } {
  const next = new Map<string, HeldLine<LineAbove> | null>()
  const shown = blocks.map((b): Block => {
    if (b.kind !== 'row') return b
    const key = heldKey(b)
    const kept = held.get(key)
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
      return kept === null && f !== null && !isUnder ? { ...b, isStatusHeldUnder: true } : b
    }
    const own = f !== null && !isUnder ? lineOf(f) : null
    const isOwnFailure = f !== null && isFailure(f.source)
    const step = stepHeldLine(
      kept,
      { own, isOwnFailure, isUnder: f !== null && isUnder, isPressUnderWay: isUnderWay },
      now,
      HELD_LEAVE_MS,
    )
    if (step.kept) next.set(key, step.kept)
    const d = step.drawn
    if (!d) return b
    const text = d.line.aged ? agedText(d.line.aged, now) : d.line.text

    return {
      ...b,
      heldLine: { text, tone: d.line.tone, isHidden: d.isHidden, ...(d.leftAt === null ? {} : { leftAt: d.leftAt }) },
    }
  })
  const ends = [...next.values()].flatMap(k => {
    const end = heldLineEndsAt(k, HELD_LEAVE_MS)
    return end === null || k?.leftAt == null
      ? []
      : [k.leftAt + NEXT_FRAME_MS, k.leftAt + HOLD_MS, end].filter(at => at > now)
  })

  return { blocks: shown, held: next, nextAt: ends.length === 0 ? null : Math.min(...ends) }
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
