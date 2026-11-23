import { cutAtWord, wordCuts } from '../../core/domain/text'
import { LINE_PT } from '../../core/view/layout'
import { COLLAPSED_TITLE_LINES } from '../../core/view/row-parts'
import { isOpenRow } from './blocks'
import type { Block, RowBlock } from './blocks'
import type { FormSwap } from './form-swap'
import type { Sizes } from './heights'

/** The height of `COLLAPSED_TITLE_LINES` lines, the most a collapsed title shows. */
export const CLIPPED_HEIGHT = COLLAPSED_TITLE_LINES * LINE_PT

/** The most a title's measured height can be and still fit `COLLAPSED_TITLE_LINES` lines, with half a px for rounding. */
const CUT_ROOM = CLIPPED_HEIGHT + 0.5

/** The key a row's whole title is measured under, wrapped at the title's width, whatever form the title draws in. */
const wholeId = (id: string): string => `whole title ${id}`

/** The key one cut of a row's title is measured under. */
const cutId = (id: string, cut: string): string => `title cut ${id} ${cut}`

/** A settled row's title and a Closed line's take one line, so the row folds into its one-line Closed line in place. */
const isOneLineRow = (r: RowBlock): boolean => r.settled !== null || r.depth === 1

/**
 * How a row's title draws when the row is not open: `text` on one line cut with an ellipsis, or wrapped, `isClipped`
 * to `COLLAPSED_TITLE_LINES` lines while the look has not yet measured where it is cut, and the height it rests at,
 * undefined until the whole title is measured.
 */
export type ShortTitle = { text: string; isOneLine: boolean; isClipped: boolean; height: number | undefined }

/** Whether the look has measured every cut of a row's title at the width it measured the whole title. */
function isCutMeasured(r: RowBlock, sizes: Sizes): boolean {
  const width = sizes.widthOf(wholeId(r.id))

  return wordCuts(r.title).every(cut => sizes.widthOf(cutId(r.id, cut)) === width)
}

/**
 * A row's title cut to `COLLAPSED_TITLE_LINES` lines: whole when it fits them, else cut after its last word that fits
 * them beside an ellipsis (`cutAtWord`), as the look measures each cut wrapped. A title with no word that fits draws
 * on one line, cut inside its first word.
 */
export function cutTitleOf(r: RowBlock, sizes: Sizes): ShortTitle {
  const whole = sizes.get(wholeId(r.id))
  if (whole !== undefined && whole <= CUT_ROOM)
    return { text: r.title, isOneLine: false, isClipped: false, height: whole }
  if (whole === undefined || !isCutMeasured(r, sizes))
    return {
      text: r.title,
      isOneLine: false,
      isClipped: true,
      height: whole === undefined ? undefined : CLIPPED_HEIGHT,
    }
  const heightOf = (cut: string) => sizes.get(cutId(r.id, cut)) ?? Infinity
  const head = cutAtWord(r.title, cut => heightOf(cut) <= CUT_ROOM)
  if (head === null) return { text: r.title, isOneLine: true, isClipped: false, height: LINE_PT }

  return { text: `${head}…`, isOneLine: false, isClipped: false, height: heightOf(`${head}…`) }
}

/**
 * The form a row's title rests in when the row is not open. A row that settles takes one line at once, and one that
 * Undo brings back keeps it while its settled lines still show (`fromShown`), so the title changes form as its row does.
 */
export function shortTitleOf(r: RowBlock, fromShown: RowBlock | null, sizes: Sizes): ShortTitle {
  const isOneLine = isOneLineRow(r) || (fromShown !== null && isOneLineRow(fromShown))

  return isOneLine ? { text: r.title, isOneLine, isClipped: false, height: LINE_PT } : cutTitleOf(r, sizes)
}

/** The form a row changes from that it still draws, while its lines fade out. */
const fromShownOf = (s: FormSwap | null): RowBlock | null => (s !== null && s.inAt === null ? s.from : null)

/** What a row's title glide reads of a block in a draw: whether it is open, rests on one line, and its resting height. */
export type TitleRest = { isOpen: boolean; isOneLine: boolean; height: number }

export function titleRestOf(b: Block | undefined, swap: FormSwap | null, sizes: Sizes): TitleRest | null {
  if (b?.kind !== 'row') return null
  const short = shortTitleOf(b, fromShownOf(swap), sizes)

  return { isOpen: isOpenRow(b), isOneLine: short.isOneLine, height: short.height ?? LINE_PT }
}

/** A copy of a row's title the look draws hidden at the title's width, to measure it under `key`. */
type TitleCopy = { key: string; text: string; isWidthDrawn: boolean }

/**
 * The copies of a row's title the look measures: the whole title, and while a title too long for its lines has cuts
 * not measured at that width, each of them (`wordCuts`). A change of the whole title's width alone draws again, so the
 * cuts are measured at the new width.
 */
export function titleCopiesOf(r: RowBlock, sizes: Sizes): TitleCopy[] {
  const whole = sizes.get(wholeId(r.id))
  const isCutDrawn = !isOneLineRow(r) && whole !== undefined && whole > CUT_ROOM && !isCutMeasured(r, sizes)
  const cuts = isCutDrawn
    ? wordCuts(r.title).map(cut => ({ key: cutId(r.id, cut), text: cut, isWidthDrawn: false }))
    : []

  return [{ key: wholeId(r.id), text: r.title, isWidthDrawn: true }, ...cuts]
}
