import { cellWidth, closeOpenLink, cutForEllipsis, cutToCells, OSC8 } from '../../hooks/text'
import { parseInline } from '../../hooks/inline'

const ANSI = new RegExp(`\\x1b\\[[0-9;]*m|${OSC8.source}`, 'g')
const ANSI_SPLIT = new RegExp(`(\\x1b\\[[0-9;]*m|${OSC8.source})`, 'g')
const ANSI_PART = new RegExp(`^(?:\\x1b\\[[0-9;]*m|${OSC8.source})$`)
export const visibleLength = (s: string): number => cellWidth(s.replace(ANSI, ''))

export function linkedText(text: string, link?: (url: string, text: string) => string): string {
  return parseInline(text)
    .map(s => (s.link ? (link ? `\x1b[4m${link(s.link, s.text)}\x1b[24m` : s.text) : s.text))
    .join('')
}

export function fit(s: string, width: number): string {
  if (visibleLength(s) <= width) return s
  let out = ''
  let n = 0
  for (const part of s.split(ANSI_SPLIT)) {
    if (ANSI_PART.test(part)) {
      out += part
      continue
    }
    const cells = cellWidth(part)
    if (n + cells > width - 1) return `${closeOpenLink(out + cutToCells(part, width - 1 - n))}…\x1b[0m`
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

  if (visibleLength(title) <= cells) return title
  let out = ''
  let used = 0
  for (const part of title.split(ANSI_SPLIT)) {
    if (ANSI_PART.test(part)) {
      out += part
      continue
    }
    const shown = cutToCells(part, cells - 1 - used)
    out += shown
    used += cellWidth(shown)
    if (shown !== part) break
  }

  return `${closeOpenLink(out)}…`
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

export function indentedLinks(
  text: string,
  indent: number,
  width: number,
  maxLines: number,
  paint: (s: string) => string,
  link?: (url: string, text: string) => string,
): string[] {
  const room = Math.max(10, width - indent - 1)
  const lines: { text: string; url?: string }[][] = [[]]
  let used = 0
  let hasSpace = false
  for (const span of parseInline(text)) {
    const value = span.link && !link ? `${span.text} (${span.link})` : span.text
    for (const part of value.split(/(\n|[^\S\n]+)/).filter(Boolean)) {
      if (part === '\n') {
        lines.push([])
        used = 0
        hasSpace = false
        continue
      }
      if (/^\s+$/.test(part)) {
        hasSpace = true
        continue
      }
      const gap = used > 0 && hasSpace ? 1 : 0
      const shown = cellWidth(part) > room ? `${cutToCells(part, room - 1)}…` : part
      const url = span.link && link ? span.link : undefined
      if (used > 0 && used + cellWidth(shown) + gap > room) {
        lines.push([])
        used = 0
      }
      const current = lines.at(-1)!
      if (used > 0 && hasSpace) current.push({ text: ' ', ...(url ? { url } : {}) })
      current.push({ text: shown, ...(url ? { url } : {}) })
      used += (used > 0 && hasSpace ? 1 : 0) + cellWidth(shown)
      hasSpace = false
    }
  }
  const shown = lines.slice(0, maxLines)
  if (lines.length > maxLines && shown.length > 0) {
    const last = shown.at(-1)!
    const cut = cutForEllipsis(last.map(part => part.text).join(''), value => cellWidth(value) <= room)
    last.splice(0, last.length, { text: `${cut}…` })
  }

  return shown.map(parts => {
    const runs = parts.reduce<{ text: string; url?: string }[]>((out, part) => {
      const last = out.at(-1)
      if (last && last.url === part.url) last.text += part.text
      else out.push({ ...part })
      return out
    }, [])
    return (
      ' '.repeat(indent) +
      paint(runs.map(part => (part.url && link ? `\x1b[4m${link(part.url, part.text)}\x1b[24m` : part.text)).join(''))
    )
  })
}
