import { isFailure, isStatusUnderActions, pressUnderWaySince } from '../../hooks/feedback'
import type { Feedback } from '../../hooks/feedback'
import type { Block, RowBlock, Tone } from './blocks'

/**
 * A row's status line that the panel draws on its own line between the row's title and its buttons. `isHidden` keeps
 * a failure's space without its words, since the press under way retries what it says failed.
 */
export type LineAbove = { text: string; tone: Tone; isHidden: boolean }

/** Each row's line above its buttons, by row id, from the last draw that showed it there. */
export type LinesAbove = ReadonlyMap<string, LineAbove>

export const NO_LINES_ABOVE: LinesAbove = new Map()

const hasActions = (r: RowBlock): boolean => r.buttons.length > 0 || r.field !== null

/** Whether a row's status goes under its buttons, as `isStatusUnderActions` places it. */
export const isStatusUnder = (r: RowBlock): boolean =>
  r.feedback !== null && isStatusUnderActions(r.feedback.source, hasActions(r))

/** A press still under way, or its message waiting in the queue to enter. */
const isUnderWay = (f: Feedback | null): boolean => f?.is === 'queued' || pressUnderWaySince(f) !== null

/**
 * The blocks with each row's held line, and the lines to hold at the next draw. The panel draws a status that follows
 * the title on its own line above the buttons, where the other looks put it in the title's text. While a press under
 * way puts the row's status under its buttons, the row keeps the line it had above them, so the buttons hold their
 * place. A row drawn without buttons meanwhile, such as one deselected, keeps the line for when it shows them again.
 */
export function holdLinesAbove(blocks: Block[], held: LinesAbove): { blocks: Block[]; held: LinesAbove } {
  const next = new Map<string, LineAbove>()
  const shown = blocks.map((b): Block => {
    if (b.kind !== 'row') return b
    const line = held.get(b.id)
    const isPressUnderWay = isUnderWay(b.feedback?.source ?? null)
    if (!hasActions(b)) {
      if (line && isPressUnderWay) next.set(b.id, line)
      return b
    }
    if (!isStatusUnder(b)) {
      const f = b.feedback
      if (f) next.set(b.id, { text: f.text, tone: f.tone, isHidden: isFailure(f.source) })
      return b
    }
    if (!line || !isPressUnderWay) return b
    next.set(b.id, line)

    return { ...b, heldLine: line }
  })

  return { blocks: shown, held: next }
}
