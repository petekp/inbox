import type { Block, PrBlock } from './blocks'
import type { RowMotion } from './motion'
import type { Paint } from './paint-theme'
import { stepLine, underId } from './under-line'
import type { UnderLine } from './under-line'

/** What a PR block's status line says: where the PR stands and the parts its list leaves out. */
export type PrLine = Pick<PrBlock, 'status' | 'unlisted'>

const lineOf = (b: Block): PrLine | null =>
  b.kind === 'pr' && (b.status !== null || b.unlisted.length > 0) ? { status: b.status, unlisted: b.unlisted } : null

/**
 * A PR block's status line as it comes and goes, as `stepLine` steps a row's status under its buttons. A line that
 * goes stays drawn while it fades, then its space shuts. A line in a draw that shows the page at rest (`isFirst`), as a
 * newly shown tab, is at rest.
 */
export function stepPrStatus(
  last: UnderLine<PrLine> | null,
  b: Block,
  now: number,
  isFirst: boolean,
): UnderLine<PrLine> | null {
  const line = lineOf(b)
  if (isFirst) return line && { line, since: -Infinity, isLeaving: false, isInput: false }

  return stepLine(last, line, b.kind === 'pr', now, false)
}

/**
 * The height a PR block's status line box moves to, or undefined when it takes its content's height: in a draw that
 * takes heights at once, and in a narrow pane, where the PR's number leads the line so it never comes or goes. A line
 * that comes holds no space in its first draw, so its box and the PR's box spring open together from the next draw.
 */
export function prStatusHeight(b: PrBlock, m: RowMotion | undefined, p: Paint): number | undefined {
  const key = underId(b.id)
  if (!m || p.isNarrow || p.isAtOnce(key)) return undefined
  const s = m.status

  return s === null || s.isNew ? 0 : (p.heights.get(key) ?? 0)
}
