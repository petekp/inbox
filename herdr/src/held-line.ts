import { isStatusUnderActions } from '../../hooks/feedback'
import type { Block, RowBlock, Tone } from './blocks'

/** A row's status line that the panel draws on its own line between the row's title and its buttons. */
export type LineAbove = { text: string; tone: Tone }

/** Each open row's line above its buttons, by row id, as the last draw showed it with no status under them. */
export type LinesAbove = ReadonlyMap<string, LineAbove>

export const NO_LINES_ABOVE: LinesAbove = new Map()

const hasActions = (r: RowBlock): boolean => r.buttons.length > 0 || r.field !== null

/** Whether an open row's status goes under its buttons, as `isStatusUnderActions` places it. */
export const isStatusUnder = (r: RowBlock): boolean =>
  r.feedback !== null && isStatusUnderActions(r.feedback.source, hasActions(r))

/**
 * The blocks with each open row's held line, and the lines to hold at the next draw. The panel draws a status that
 * follows the title on its own line above the buttons, where the other looks put it in the title's text. When a press
 * moves the row's status under its buttons, the row keeps the line it had above them, so the buttons hold their place.
 * The row lets the line go once its status leaves the place under the buttons, or the row closes.
 */
export function holdLinesAbove(blocks: Block[], held: LinesAbove): { blocks: Block[]; held: LinesAbove } {
  const next = new Map<string, LineAbove>()
  const shown = blocks.map((b): Block => {
    if (b.kind !== 'row' || !hasActions(b)) return b
    if (!isStatusUnder(b)) {
      if (b.feedback) next.set(b.id, { text: b.feedback.text, tone: b.feedback.tone })
      return b
    }
    const line = held.get(b.id)
    if (!line) return b
    next.set(b.id, line)

    return { ...b, heldLine: line }
  })

  return { blocks: shown, held: next }
}
