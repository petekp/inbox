import { isOpenRow } from './blocks'
import type { Block } from './blocks'
import type { RowMotion } from './motion'
import type { Paint } from './paint-theme'
import { lineHeight } from './pr-status'
import { stepLine } from './under-line'
import type { UnderLine } from './under-line'

/** The stopped warning a block draws: an open row's, a PR block's or the Rank again line's, or null. */
const warningOf = (b: Block): string | null =>
  b.kind === 'row' || b.kind === 'pr' || b.kind === 'line' ? (b.warning ?? null) : null

/** Whether a block keeps the form it drew its warning in: a PR block and a line do, and a row while it stays open. */
const keepsForm = (b: Block): boolean =>
  b.kind === 'row' ? isOpenRow(b) && !b.settled : b.kind === 'pr' || b.kind === 'line'

/**
 * A block's stopped warning as it comes and goes, as `stepLine` steps a row's status under its buttons, after `last`,
 * with `was` the block as last drawn. A warning that comes with its block, or with the panel of a row that opens, is
 * at rest, as is every warning in a draw that shows the page at rest (`isFirst`). A row that closes takes its warning
 * away with its panel.
 */
export function stepWarning(
  last: UnderLine<string> | null,
  was: Block | undefined,
  b: Block,
  now: number,
  isFirst: boolean,
  isInput: boolean,
): UnderLine<string> | null {
  const line = warningOf(b)
  const isNewForm = was === undefined || (b.kind === 'row' && !(was.kind === 'row' && isOpenRow(was)))
  if (line !== null && (isFirst || isNewForm)) return { line, since: -Infinity, isLeaving: false, isInput: false }

  return stepLine(last, line, keepsForm(b), now, isInput)
}

/** The key a block's stopped warning is measured and faded under. */
export const warningId = (id: string): string => `warning ${id}`

/** The key a block's stopped warning box is measured under, at the height it is drawn. */
export const warningBoxId = (id: string): string => `warning box ${id}`

/**
 * Whether a row draws its warning with no motion: while its panel shows the open form it closes from, or the form it
 * leaves as it changes form.
 */
const isWarningAtRest = (b: Block, m: RowMotion | undefined): boolean =>
  b.kind === 'row' && (m?.closing ?? m?.swap?.from ?? b) !== b

/**
 * The height block `id`'s stopped warning box moves to, as `lineHeight` says, or undefined when it takes its content's
 * height: at rest, and once the warning has come.
 */
export const warningHeight = (id: string, m: RowMotion | undefined, p: Paint, isAtRest: boolean): number | undefined =>
  isAtRest || m?.warning?.opacity === null ? undefined : lineHeight(warningId(id), m?.warning ?? null, m, p)

/**
 * How far a block's measured height is under the height it moves to while its stopped warning's box springs: the
 * height the box moves to less its height as last measured. The block's box then springs with the warning's box. A row
 * draws the box only while it is open.
 */
export function warningRise(b: Block, m: RowMotion | undefined, p: Paint): number {
  const isDrawn = b.kind === 'pr' || b.kind === 'line' || (b.kind === 'row' && isOpenRow(b) && !b.settled)
  const to = isDrawn ? warningHeight(b.id, m, p, isWarningAtRest(b, m)) : undefined

  return to === undefined ? 0 : to - (p.heights.get(warningBoxId(b.id)) ?? 0)
}
