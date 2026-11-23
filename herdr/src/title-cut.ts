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

/** The most a title's measured height can be and still fit one line, with half a px for rounding. */
const LINE_ROOM = LINE_PT + 0.5

/** The punctuation a title ends with, such as "?" or ")". */
const END_PUNCTUATION = /[^\p{L}\p{N}\s]+$/u

/** The key a row's whole title is measured under, wrapped at the title's width, whatever form the title draws in. */
const wholeId = (id: string): string => `whole title ${id}`

/** The key one cut of a row's title is measured under. It ends with the row's id, as a moved row's copy reads it. */
const cutId = (id: string, cut: string): string => `title cut "${cut}" ${id}`

/** The key a row's title is measured under without the punctuation it ends with. */
const bareId = (id: string): string => `bare title ${id}`

/**
 * A row's title as the look draws it wrapped whole. Herdr's text layout can break a line between a word and the
 * punctuation after it, so a title that measures taller than its copy without its last punctuation has that
 * punctuation alone on its last line. That title breaks before its last word instead, which takes the same lines.
 */
export function wrappedTitleOf(r: RowBlock, sizes: Sizes): string {
  const whole = sizes.get(wholeId(r.id))
  const bare = sizes.get(bareId(r.id))
  const lastSpace = r.title.lastIndexOf(' ')
  const isBareMeasured = bare !== undefined && sizes.widthOf(bareId(r.id)) === sizes.widthOf(wholeId(r.id))
  const isEndAlone = whole !== undefined && isBareMeasured && whole > bare + 0.5 && lastSpace > 0

  return isEndAlone ? `${r.title.slice(0, lastSpace)}\n${r.title.slice(lastSpace + 1)}` : r.title
}

/** A settled row's title and a Closed line's take one line, so the row folds into its one-line Closed line in place. */
const isOneLineRow = (r: RowBlock): boolean => r.settled !== null || r.depth === 1

/**
 * How a row's title draws when the row is not open: `text` on one line cut with an ellipsis, or wrapped, `isClipped`
 * to `COLLAPSED_TITLE_LINES` lines while the look has not yet measured where it is cut, and the height it rests at,
 * undefined until the whole title is measured. With `secondLine`, `text` is the first line and `secondLine` the next,
 * cut on one line with an ellipsis, as for a word wider than a line.
 */
export type ShortTitle = {
  text: string
  secondLine?: string
  isOneLine: boolean
  isClipped: boolean
  height: number | undefined
}

/** Whether the look has measured every cut of a row's title at the width it measured the whole title. */
function isCutMeasured(r: RowBlock, sizes: Sizes): boolean {
  const width = sizes.widthOf(wholeId(r.id))

  return width !== undefined && wordCuts(r.title).every(cut => sizes.widthOf(cutId(r.id, cut)) === width)
}

/**
 * A row's title cut to `COLLAPSED_TITLE_LINES` lines: whole when it fits them, else cut after its last word that fits
 * them beside an ellipsis (`cutAtWord`), as the look measures each cut wrapped. When that cut takes one line, the word
 * after it is wider than a line, so the second line holds that word and the rest, cut inside it. A title with no word
 * that fits draws on one line, cut inside its first word.
 */
export function cutTitleOf(r: RowBlock, sizes: Sizes): ShortTitle {
  const whole = sizes.get(wholeId(r.id))
  if (whole !== undefined && whole <= CUT_ROOM)
    return { text: wrappedTitleOf(r, sizes), isOneLine: false, isClipped: false, height: whole }
  if (whole === undefined || !isCutMeasured(r, sizes))
    return {
      text: wrappedTitleOf(r, sizes),
      isOneLine: false,
      isClipped: true,
      height: whole === undefined ? undefined : CLIPPED_HEIGHT,
    }
  const heightOf = (cut: string) => sizes.get(cutId(r.id, cut)) ?? Infinity
  const head = cutAtWord(r.title, cut => heightOf(cut) <= CUT_ROOM)
  if (head === null) return { text: r.title, isOneLine: true, isClipped: false, height: LINE_PT }
  const height = heightOf(`${head}…`)
  const lineEnd = r.title.indexOf(' ', head.length)
  if (height <= LINE_PT + 0.5 && lineEnd > 0)
    return {
      text: r.title.slice(0, lineEnd),
      secondLine: r.title.slice(lineEnd + 1),
      isOneLine: false,
      isClipped: false,
      height: CLIPPED_HEIGHT,
    }

  return { text: `${head}…`, isOneLine: false, isClipped: false, height }
}

/**
 * A row's title cut to one line: whole when it fits, else after its last word that fits beside an ellipsis
 * (`cutAtWord`), as the look measures each cut wrapped. Until the cuts are measured, or when not even the first word
 * fits, it is the whole title, which the look truncates inside a word.
 */
export function oneLineTitleOf(r: RowBlock, sizes: Sizes): ShortTitle {
  const whole = sizes.get(wholeId(r.id))
  const isCut = whole !== undefined && whole > LINE_ROOM && isCutMeasured(r, sizes)
  const head = isCut ? cutAtWord(r.title, cut => (sizes.get(cutId(r.id, cut)) ?? Infinity) <= LINE_ROOM) : null

  return { text: head === null ? r.title : `${head}…`, isOneLine: true, isClipped: false, height: LINE_PT }
}

/**
 * The form a row's title rests in when the row is not open. A row that settles takes one line at once, and one that
 * Undo brings back keeps it while its settled lines still show (`fromShown`), so the title changes form as its row does.
 */
export function shortTitleOf(r: RowBlock, fromShown: RowBlock | null, sizes: Sizes): ShortTitle {
  const isOneLine = isOneLineRow(r) || (fromShown !== null && isOneLineRow(fromShown))

  return isOneLine ? oneLineTitleOf(r, sizes) : cutTitleOf(r, sizes)
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
type TitleCopy = { key: string; text: string }

/**
 * The copies of a row's title the look measures: the whole title, the title without the punctuation it ends with while
 * the whole title may wrap (`wrappedTitleOf`), and while a title wider than a line has cuts not measured at that width,
 * each of them (`wordCuts`). Every title that wraps has its cuts measured, so a row that settles takes its one-line
 * cut in its first draw. A change of the whole title's width alone draws again, so the cuts are measured at the new
 * width.
 */
export function titleCopiesOf(r: RowBlock, sizes: Sizes): TitleCopy[] {
  const whole = sizes.get(wholeId(r.id))
  const mayWrap = whole === undefined || whole > LINE_ROOM
  const bare = r.title.replace(END_PUNCTUATION, '')
  const bareCopy = mayWrap && bare !== r.title ? [{ key: bareId(r.id), text: bare }] : []
  const isCutDrawn = whole !== undefined && whole > LINE_ROOM && !isCutMeasured(r, sizes)
  const cuts = isCutDrawn ? wordCuts(r.title).map(cut => ({ key: cutId(r.id, cut), text: cut })) : []

  return [{ key: wholeId(r.id), text: r.title }, ...bareCopy, ...cuts]
}
