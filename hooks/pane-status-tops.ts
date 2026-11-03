import { lineCount } from './terminal-text'
import { cellWidth } from './text'

/** Where a Status row's first line sits within what draws it, or `unknown` when a line above it is not known exactly. */
export type RowTop = number | 'unknown'

/**
 * A part of the Status as the pane draws it, with how many terminal lines it takes: null on desktop, and when the
 * terminal cannot know exactly. `tops` holds each subject row it draws, by id, with the row's first line in the part.
 * Every drawing function returns its element and its lines together, so a part that draws a line counts it.
 */
export type Drawn = { el: JSX.Element; lines: number | null; tops?: [string, RowTop][] }

/** Parts drawn one under another, `gap` lines apart: their lines, and each subject row's first line from the first part's top. */
export function stacked(parts: Drawn[], gap = 0): { lines: number | null; tops: [string, RowTop][] } {
  let line = 0
  let isKnown = true
  const tops: [string, RowTop][] = []
  for (const [n, part] of parts.entries()) {
    if (n > 0) line += gap
    for (const [id, top] of part.tops ?? []) tops.push([id, isKnown && top !== 'unknown' ? line + top : 'unknown'])
    if (part.lines === null) isKnown = false
    else line += part.lines
  }

  return { lines: isKnown ? line : null, tops }
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
export function inkLines(text: string, width: number): number | null {
  if (cellWidth(text) !== text.length) return null
  const lines = lineCount(text, width)

  return lines === lineCount(text, width - 1) ? lines : null
}
