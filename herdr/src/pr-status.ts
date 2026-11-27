import type { Block, Button, PrBlock } from './blocks'
import type { RowMotion } from './motion'
import type { Paint } from './paint-theme'
import { stepLine, underId, underMotion, underTimes } from './under-line'
import type { UnderLine, UnderMotion } from './under-line'

/** What a PR block's status line says: where the PR stands and the parts its list leaves out. */
export type PrLine = Pick<PrBlock, 'status' | 'unlisted'>

/** A PR block's press result, as "Merging…", at the block's foot. */
type PrResult = NonNullable<PrBlock['feedback']>

/** The lines under a PR block's status line, each as it comes and goes: its error, its buttons and its press result. */
export type PrTail = {
  error: UnderLine<string> | null
  buttons: UnderLine<Button[]> | null
  result: UnderLine<PrResult> | null
}

/** How each line under a PR block's status line draws, as `underMotion` says. */
export type PrTailMotion = {
  error: UnderMotion<string> | null
  buttons: UnderMotion<Button[]> | null
  result: UnderMotion<PrResult> | null
}

export type PrTailPart = keyof PrTail

const lineOf = (b: Block): PrLine | null =>
  b.kind === 'pr' && (b.status !== null || b.unlisted.length > 0) ? { status: b.status, unlisted: b.unlisted } : null

/**
 * A line of a PR block as it comes and goes, as `stepLine` steps a row's status under its buttons. A line that goes
 * stays drawn while it fades, then its space shuts. A line in a draw that shows the page at rest (`isFirst`), as a
 * newly shown tab, is at rest.
 */
function stepPrLine<L>(
  last: UnderLine<L> | null,
  line: L | null,
  b: Block,
  now: number,
  isFirst: boolean,
  isInput: boolean,
  isSameLine?: (a: L, b: L) => boolean,
) {
  if (isFirst) return line && { line, since: -Infinity, isLeaving: false, isInput: false }

  return stepLine(last, line, b.kind === 'pr', now, isInput, isSameLine)
}

/** A press result that keeps its tone is the same line, so "Refreshing PR #31…" and "Could not refresh PR #31" differ. */
const isSameResult = (a: PrResult, b: PrResult) => a.tone === b.tone

/** A PR block's status line as it comes and goes. */
export const stepPrStatus = (last: UnderLine<PrLine> | null, b: Block, now: number, isFirst: boolean) =>
  stepPrLine(last, lineOf(b), b, now, isFirst, false)

/**
 * The lines under a PR block's status line as they come and go. An error or press result that comes in a draw that
 * follows the person's input shows faint at once, as a row's status under its buttons does.
 */
export function stepPrTail(last: PrTail | null, b: Block, now: number, isFirst: boolean, isInput: boolean): PrTail {
  const pr = b.kind === 'pr' ? b : null
  const buttons = pr && pr.buttons.length > 0 ? pr.buttons : null

  return {
    error: stepPrLine(last?.error ?? null, pr?.error ?? null, b, now, isFirst, isInput),
    buttons: stepPrLine(last?.buttons ?? null, buttons, b, now, isFirst, false),
    result: stepPrLine(last?.result ?? null, pr?.feedback ?? null, b, now, isFirst, isInput, isSameResult),
  }
}

/** The key a line under a PR block's status line is measured and faded under. */
export const prTailId = (part: PrTailPart, id: string): string => `status ${part} ${id}`

export const PR_TAIL_PARTS: PrTailPart[] = ['error', 'buttons', 'result']

export const prTailMotion = (t: PrTail, id: string, now: number, heightOf: (key: string) => number | undefined) => ({
  error: underMotion(t.error, now, heightOf(prTailId('error', id))),
  buttons: underMotion(t.buttons, now, heightOf(prTailId('buttons', id))),
  result: underMotion(t.result, now, heightOf(prTailId('result', id))),
})

export const prTailTimes = (t: PrTail | null): number[] =>
  t ? [...underTimes(t.error), ...underTimes(t.buttons), ...underTimes(t.result)] : []

/**
 * The height a line's box moves to, as a PR block's or a stopped warning's, or undefined when it takes its content's height: in a draw that takes
 * heights at once. A line that comes holds no space in its first draw, so its box and the PR's box spring open together
 * from the next draw.
 */
export function lineHeight(
  key: string,
  s: UnderMotion<unknown> | null,
  m: RowMotion | undefined,
  p: Paint,
): number | undefined {
  if (!m || p.isAtOnce(key)) return undefined

  return s === null || s.isNew ? 0 : (p.heights.get(key) ?? 0)
}

/**
 * The height a PR block's status line box moves to, as `lineHeight` says. In a narrow pane the PR's number leads the
 * line, so it never comes or goes.
 */
export const prStatusHeight = (b: PrBlock, m: RowMotion | undefined, p: Paint): number | undefined =>
  p.isNarrow ? undefined : lineHeight(underId(b.id), m?.status ?? null, m, p)

/** The height the box of a line under a PR block's status line moves to, as `lineHeight` says. */
export const prTailHeight = (b: PrBlock, part: PrTailPart, m: RowMotion | undefined, p: Paint): number | undefined =>
  lineHeight(prTailId(part, b.id), m?.prTail?.[part] ?? null, m, p)
