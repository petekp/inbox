import { desktopButtonPt, desktopLines, desktopTextPt } from './desktop-metrics'
import { RUNNING_SVG_CELLS } from './desktop-svg'
import { DESKTOP_BUTTON_PT, DESKTOP_CELL_PT, DESKTOP_HAIR_LINES, DESKTOP_ROW_PT } from './pane-sizes'
import { STALL_GAP, type StatusCount } from './status-page'
import { lineCount } from './terminal-text'
import { cellWidth } from './text'

/**
 * How many lines of the pane's scroll a part takes, at least and at most. The terminal knows them exactly. Desktop
 * estimates its text from above, so `most` never counts fewer lines than desktop draws, and `least` counts a line for
 * each text.
 */
export type Lines = { least: number; most: number }

/** Where a Status row's first line sits within what draws it, or `unknown` when a line above it is not counted. */
export type RowTop = Lines | 'unknown'

/**
 * A part of the Status as the pane draws it, with the lines it takes, or null when they are not counted. `tops` holds
 * each subject row it draws, by id, with the row's first line in the part. Every drawing function returns its element
 * and its lines together, so a part that draws a line counts it.
 */
export type Drawn = { el: JSX.Element; lines: Lines | null; tops?: [string, RowTop][] }

export const exactly = (n: number): Lines => ({ least: n, most: n })

/** The lines of `a` and `b` one under another, or null when either is not counted. */
export function plus(a: Lines | null, b: Lines | null): Lines | null {
  return a && b ? { least: a.least + b.least, most: a.most + b.most } : null
}

/** Parts drawn one under another, `gap` lines apart: their lines, and each subject row's first line from the first part's top. */
export function stacked(parts: Drawn[], gap = 0): { lines: Lines | null; tops: [string, RowTop][] } {
  let line: Lines | null = exactly(0)
  const tops: [string, RowTop][] = []
  for (const [n, part] of parts.entries()) {
    if (n > 0) line = plus(line, exactly(gap))
    for (const [id, top] of part.tops ?? []) tops.push([id, (top !== 'unknown' && plus(line, top)) || 'unknown'])
    line = plus(line, part.lines)
  }

  return { lines: line, tops }
}

/** `parts` drawn one under another in `el`, which keeps their lines and rows. */
export function stackedIn(el: JSX.Element, parts: Drawn[], gap = 0): Drawn {
  return { el, ...stacked(parts, gap) }
}

/**
 * The lines Claude Code wraps `text` to in a box `width` wide, or null when that is not known exactly: when the text
 * holds a character wider than one cell, or when one cell less would wrap it differently, since a box's width may
 * differ from the one counted here by a cell.
 */
export function inkLines(text: string, width: number): Lines | null {
  if (cellWidth(text) !== text.length) return null
  const lines = lineCount(text, width)

  return lines === lineCount(text, width - 1) ? exactly(lines) : null
}

/**
 * The lines desktop wraps `text` to in a column about `widthPt` wide: one at least, and at most the lines `desktopLines`
 * estimates in a column one cell narrower, since the column's width is itself estimated from cells.
 */
export function desktopTextLines(text: string, widthPt: number): Lines {
  return { least: 1, most: Math.max(1, desktopLines(text, widthPt - DESKTOP_CELL_PT).length) }
}

/** A desktop Box's padding, margin or gap of `cells` on one side, in lines: the hooks tree counts them in half lines. */
export const desktopSpaceLines = (cells: number) => cells / 2

/** The lines a desktop row frame adds around its text: `padY` above and below, and its 1 pt border on each side. */
export const desktopFrameLines = (padY: number) => exactly(2 * desktopSpaceLines(padY) + 2 * DESKTOP_HAIR_LINES)

/** A line of native buttons on desktop: as tall as a button, and at least a line of text. */
export const DESKTOP_BUTTON_LINES = DESKTOP_BUTTON_PT / DESKTOP_ROW_PT

/**
 * The lines a desktop Box that wraps items `widthsPt` wide, `gapPt` apart, takes in a column about `widthPt` wide. Each
 * item moves to the next line whole when the room left on its line is narrower.
 */
function desktopWrapLines(widthsPt: number[], gapPt: number, widthPt: number): number {
  const room = widthPt - DESKTOP_CELL_PT
  let lines = 1
  let used = 0
  for (const pt of widthsPt) {
    const next = used === 0 ? pt : used + gapPt + pt
    if (used > 0 && next > room) {
      lines += 1
      used = pt
    } else used = next
  }

  return lines
}

/**
 * The lines a desktop row of native buttons with `labels` takes in a column about `widthPt` wide, as its Box wraps them
 * a cell apart and a line of buttons apart. Each button is as wide as `desktopButtonPt` says, counting each as primary since a label does not say.
 */
export function desktopButtonLines(labels: string[], widthPt: number): Lines {
  const widths = labels.map(label => desktopButtonPt(label, true))
  const rows = desktopWrapLines(widths, DESKTOP_CELL_PT, widthPt)

  return { least: 1, most: rows * DESKTOP_BUTTON_LINES + (rows - 1) * desktopSpaceLines(1) }
}

/**
 * The lines Other work's counts take on desktop in a column about `widthPt` wide, as `markRun` wraps them. Each mark
 * counts at least the two cells of a mark's Svg, and each count moves to the next line whole, with the gap before it.
 */
export function desktopCountsLines(counts: StatusCount[], widthPt: number): Lines {
  const gapPt = desktopTextPt(STALL_GAP)
  const widths = counts.map(
    (x, n) =>
      (n > 0 ? gapPt : 0) +
      Math.max(desktopTextPt(x.mark), RUNNING_SVG_CELLS * DESKTOP_CELL_PT) +
      desktopTextPt(` ${x.text}`),
  )

  return { least: 1, most: desktopWrapLines(widths, 0, widthPt) }
}
