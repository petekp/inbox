import { isFailure, isStatusUnderActions, pressUnderWaySince } from '../../core/view/feedback'
import type { Feedback } from '../../core/view/feedback'
import { agedText } from './blocks'
import type { Aged, Block, RowBlock, Tone } from './blocks'

/**
 * A row's status line that the panel draws on its own line between the row's title and its buttons. `isHidden` keeps
 * a failure's space without its words, since the press under way retries what it says failed. `aged` keeps a status's
 * age counting while the line is held.
 */
type LineAbove = { text: string; tone: Tone; isHidden: boolean; aged?: Aged }

/**
 * What each row holds above its buttons, by row id: the line it last drew there, or null for a row that drew none
 * there when its press went out, so its status stays under its buttons.
 */
export type LinesAbove = ReadonlyMap<string, LineAbove | null>

export const NO_LINES_ABOVE: LinesAbove = new Map()

/** Undo takes the place of a settled row's buttons, so a settled row holds nothing from its open form. */
const heldKey = (r: RowBlock): string => (r.settled ? `settled ${r.id}` : r.id)

const hasActions = (r: RowBlock): boolean => r.buttons.length > 0 || r.field !== null

/** Whether a row's status goes under its buttons: where `isStatusUnderActions` places it, or held there. */
export const isStatusUnder = (r: RowBlock): boolean =>
  r.feedback !== null && (r.isStatusHeldUnder === true || isStatusUnderActions(r.feedback.source, hasActions(r)))

/** A press still under way, or its message waiting in the queue to enter. */
const isUnderWay = (f: Feedback | null): boolean => f?.is === 'queued' || pressUnderWaySince(f) !== null

const lineOf = (f: NonNullable<RowBlock['feedback']>): LineAbove => ({
  text: f.text,
  tone: f.tone,
  isHidden: isFailure(f.source),
  ...(f.aged ? { aged: f.aged } : {}),
})

const drawn = (l: LineAbove, now: number): NonNullable<RowBlock['heldLine']> => ({
  text: l.aged ? agedText(l.aged, now) : l.text,
  tone: l.tone,
  isHidden: l.isHidden,
})

/**
 * The blocks with each row's held line, and the lines to hold at the next draw. The panel draws a status that follows
 * the title on its own line above the buttons, where the other looks put it in the title's text. So a row keeps its
 * shape while it shows its buttons, and they hold their place:
 * - A row with a line above its buttons keeps that line's place. While its status goes under the buttons, during a
 *   press and after it, as with "Not confirmed", the line keeps its words. A status that belongs above takes its
 *   place. With no status, the place stays empty.
 * - A row whose press went out with no line above keeps its status under its buttons, where the press under way read,
 *   as with "✓ Explained".
 *
 * A row drawn without buttons during its press, such as one deselected, keeps what it holds for when it shows them
 * again. A row that settles or comes back from settled starts holding afresh.
 */
export function holdLinesAbove(blocks: Block[], held: LinesAbove, now: number): { blocks: Block[]; held: LinesAbove } {
  const next = new Map<string, LineAbove | null>()
  const shown = blocks.map((b): Block => {
    if (b.kind !== 'row') return b
    const key = heldKey(b)
    const kept = held.get(key)
    const f = b.feedback
    if (!hasActions(b)) {
      if (kept !== undefined && isUnderWay(f?.source ?? null)) next.set(key, kept)
      return b
    }
    if (f === null) {
      if (kept === undefined) return b
      const empty = kept && { ...kept, isHidden: true }
      next.set(key, empty)
      return empty ? { ...b, heldLine: drawn(empty, now) } : b
    }
    if (!isStatusUnder(b)) {
      next.set(key, kept === null ? null : lineOf(f))
      return kept === null ? { ...b, isStatusHeldUnder: true } : b
    }
    if (kept === undefined) {
      if (isUnderWay(f.source)) next.set(key, null)
      return b
    }
    next.set(key, kept)

    return kept ? { ...b, heldLine: drawn(kept, now) } : b
  })

  return { blocks: shown, held: next }
}
