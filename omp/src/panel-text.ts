import { cellWidth, cutForEllipsis, cutToCells } from '../../hooks/text'

const ANSI = /\x1b\[[0-9;]*m/g
export const visibleLength = (s: string): number => cellWidth(s.replace(ANSI, ''))

export function fit(s: string, width: number): string {
  if (visibleLength(s) <= width) return s
  let out = ''
  let n = 0
  for (const part of s.split(/(\x1b\[[0-9;]*m)/)) {
    if (part.startsWith('\x1b[')) {
      out += part
      continue
    }
    const cells = cellWidth(part)
    if (n + cells > width - 1) return `${out}${cutToCells(part, width - 1 - n)}…\x1b[0m`
    out += part
    n += cells
  }

  return out
}

/** The fewest cells a title keeps when it is cut so the result mark after it stays in view. */
const MARKED_TITLE_CELLS = 12

/** A title cut to `room` cells, but never below `MARKED_TITLE_CELLS`, so a line's result mark is not cut off. */
export function cutTitle(title: string, room: number): string {
  const cells = Math.max(MARKED_TITLE_CELLS, room)

  return cellWidth(title) <= cells ? title : `${cutToCells(title, cells - 1)}…`
}

export function spread(left: string, right: string, width: number): string {
  const gap = width - visibleLength(left) - visibleLength(right)

  return gap >= 2 ? left + ' '.repeat(gap) + right : fit(left, width)
}

export function wrapText(text: string, width: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const long = cellWidth(word) > width ? cutToCells(word, width - 1) + '…' : word
      if (line === '') line = long
      else if (cellWidth(line) + 1 + cellWidth(long) <= width) line += ` ${long}`
      else {
        out.push(line)
        line = long
      }
    }
    out.push(line)
  }

  return out
}

export function indented(
  text: string,
  indent: number,
  width: number,
  maxLines: number,
  paint: (s: string) => string,
): string[] {
  const room = Math.max(10, width - indent - 1)
  const wrapped = wrapText(text, room)
  const shown = wrapped.slice(0, maxLines)
  if (wrapped.length > maxLines)
    shown[maxLines - 1] = `${cutForEllipsis(shown[maxLines - 1]!, t => cellWidth(t) <= room)}…`

  return shown.map(l => ' '.repeat(indent) + paint(l))
}
