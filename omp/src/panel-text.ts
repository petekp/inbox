import type { IsCollapsed } from '../../core/view/status-folds'
import { cellWidth, cutForEllipsis, cutLine, cutToCells } from '../../core/domain/text'

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

/** The separator between the parts of a line, as ` · ` joins them. A line never starts or ends with it. */
const SEPARATOR = '·'
const TRAILING_SEPARATOR = / ·$/

export function wrapText(text: string, width: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const long = cellWidth(word) > width ? cutToCells(word, width - 1) + '…' : word
      if (line === '') line = word === SEPARATOR ? '' : long
      else if (cellWidth(line) + 1 + cellWidth(long) <= width) line += ` ${long}`
      else {
        out.push(line.replace(TRAILING_SEPARATOR, ''))
        line = word === SEPARATOR ? '' : long
      }
    }
    out.push(line.replace(TRAILING_SEPARATOR, ''))
  }

  return out
}

/**
 * `title` wrapped at spaces to `first` cells on its first line and `next` on each line after it, in at most `maxLines`
 * lines. The last line is cut with an ellipsis when the rest does not fit.
 */
export function titleLines(title: string, first: number, next: number, maxLines: number): string[] {
  const [head = ''] = wrapText(title, first)
  const rest = title.trim().split(/\s+/).slice(head.split(' ').length).join(' ')
  if (!rest) return [head]
  const after = wrapText(rest, next)
  if (after.length < maxLines) return [head, ...after]
  const last = after.slice(maxLines - 2).join(' ')
  const cut = cutLine(last, t => cellWidth(t) <= next)

  return [head, ...after.slice(0, maxLines - 2), cut]
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

/** Whether the person folded the Status parent `id`, as the view's saved `collapsed` says. */
export const collapsedIn =
  (view: { collapsed: string[] }): IsCollapsed =>
  id =>
    view.collapsed.includes(id)
