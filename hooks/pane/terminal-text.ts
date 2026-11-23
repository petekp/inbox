import { desktopLines, desktopTextPt } from './desktop-metrics'
import { cellWidth, cutAtWord, cutForEllipsis, cutLine } from '../../core/domain/text'
import { ROW_COLUMNS } from './pane-sizes'
import { DOT } from '../../core/view/rows'
import { parseInline, type Span } from '../../core/view/inline'
import type { NameLevel } from '../../core/view/status-page-parts'

/**
 * `spans` cut to what desktop draws in `limit` lines `widthPt` wide, with an ellipsis when cut. With `isCutAtWord`, the
 * cut falls between words, and inside a word only when no word of the last line fits beside the ellipsis.
 */
export function desktopSpanLines(
  spans: TerminalSpan[],
  widthPt: number,
  limit: number,
  { isCutAtWord = false } = {},
): TerminalSpan[] {
  const words = spans.map(s => ({ ...s, text: s.text.replace(/[^\S\u00a0]+/g, ' ') }))
  const text = words.map(s => s.text).join('')
  const lines = desktopLines(text, widthPt)
  if (lines.length <= limit) return words
  const fits = (withEllipsis: string) => desktopTextPt(withEllipsis) <= widthPt
  const lastLine = lines[limit - 1]!
  const last = (isCutAtWord ? cutAtWord(lastLine, fits) : null) ?? cutForEllipsis(lastLine, fits)
  let shownEnd = 0
  for (const line of lines.slice(0, limit - 1)) shownEnd = text.indexOf(line, shownEnd) + line.length
  let room = text.indexOf(lines[limit - 1]!, shownEnd) + last.length
  const kept: TerminalSpan[] = []
  for (const s of words) {
    if (room <= 0) break
    kept.push({ ...s, text: s.text.slice(0, room) })
    room -= s.text.length
  }
  const { isMuted, isFaint, isOnSelection } = kept.at(-1) ?? {}

  return [
    ...kept,
    {
      text: '…',
      ...(isMuted ? { isMuted } : {}),
      ...(isFaint ? { isFaint } : {}),
      ...(isOnSelection ? { isOnSelection } : {}),
    },
  ]
}
export const LEADING_DOT = new RegExp(`^${DOT}`)
export type TreePos = 'mid' | 'last' | 'pass'
const TREE_DEPTH = 200
export const SELECTION_BAR = Array<string>(TREE_DEPTH).fill('▌').join('\n')
const treeTexts = new Map<string, string>()

export function treeText(pos: TreePos, lead: number): string {
  const key = `${pos}:${lead}`
  const cached = treeTexts.get(key)
  if (cached !== undefined) return cached
  const text = [
    ...Array<string>(lead).fill('│'),
    pos === 'last' ? '└─' : pos === 'mid' ? '├─' : '│',
    ...Array<string>(TREE_DEPTH).fill(pos === 'last' ? ' ' : '│'),
  ].join('\n')
  treeTexts.set(key, text)

  return text
}

export function lineCount(text: string, width: number): number {
  return wrapped(text, width).length
}

export type TerminalSpan = Span & {
  isLinkAddress?: true
  isMuted?: true
  isFaint?: true
  /** The span sits on the selection color, so faint text takes the palette's `selectionFaint`. */
  isOnSelection?: true
  isNeedsYou?: true
  isDone?: true
  isUnbroken?: true
}

export function terminalTextLines(text: string, width: number, limit = Infinity): TerminalSpan[][] {
  if (!text) return []
  const spans: TerminalSpan[] = parseInline(text).flatMap(span =>
    span.link ? [span, { text: ` ${span.link}`, isLinkAddress: true as const }] : [span],
  )

  return terminalSpanLines(spans, width, limit)
}

/** `spans` wrapped at word breaks to `width` cells, cut after `limit` lines with an ellipsis. */
export function terminalSpanLines(spans: TerminalSpan[], width: number, limit = Infinity): TerminalSpan[][] {
  if (spans.every(s => !s.text) || limit < 1) return []
  const size = Math.max(1, width)
  type Character = { text: string; span: TerminalSpan }
  const lines: Character[][] = []
  let line: Character[] = []
  let used = 0
  let word: Character[] = []
  let spaces: Character[] = []
  let endsWithNewline = false
  const columns = (characters: Character[]) => characters.reduce((n, c) => n + c.text.length, 0)
  const nextLine = () => {
    lines.push(line)
    line = []
    used = 0
  }
  const append = (characters: Character[]) => {
    for (const character of characters) {
      if (line.length > 0 && used + character.text.length > size) nextLine()
      line.push(character)
      used += character.text.length
    }
  }
  const appendWord = () => {
    if (word.length === 0) return
    if (line.length > 0 && used + columns(spaces) + columns(word) > size) {
      nextLine()
      spaces = []
    }
    append(spaces)
    append(word)
    spaces = []
    word = []
  }
  for (const span of spans) {
    for (const character of span.text) {
      endsWithNewline = character === '\n'
      if (endsWithNewline) {
        appendWord()
        nextLine()
        spaces = []
      } else if (/\s/.test(character) && !span.isUnbroken) {
        appendWord()
        spaces.push({ text: character, span })
      } else word.push({ text: character, span })
    }
  }
  appendWord()
  if (line.length > 0 || endsWithNewline) nextLine()
  const kept = lines.slice(0, limit)
  if (kept.length < lines.length) {
    const last = kept.at(-1)!
    const shown = cutForEllipsis(last.map(c => c.text).join(''), t => t.length <= size)
    while (columns(last) > shown.length) last.pop()
    const { isMuted, isFaint, isOnSelection } = last.at(-1)?.span ?? {}
    const marks = {
      ...(isMuted ? { isMuted } : {}),
      ...(isFaint ? { isFaint } : {}),
      ...(isOnSelection ? { isOnSelection } : {}),
    }
    last.push({ text: '…', span: { text: '…', ...marks } })
  }
  return kept.map(characters => {
    const runs: TerminalSpan[] = []
    let previous: TerminalSpan | undefined
    for (const character of characters) {
      if (previous === character.span) runs.at(-1)!.text += character.text
      else {
        runs.push({ ...character.span, text: character.text })
        previous = character.span
      }
    }
    return runs
  })
}

/** `text` wrapped at spaces to lines of `width` characters, a word longer than a line split across lines. */
export function wrapped(text: string, width: number): string[] {
  const size = Math.max(1, width)
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word
    if (longer.length <= size) {
      line = longer
      continue
    }
    if (line) lines.push(line)
    let rest = word
    while (rest.length > size) {
      lines.push(rest.slice(0, size))
      rest = rest.slice(size)
    }
    line = rest
  }
  if (line) lines.push(line)

  return lines
}

export const glued = (after: string) => after.replace(/(?<=.)[ \u2002]/gs, c => (c === ' ' ? '\u00a0' : '\u2007'))

/**
 * A status drawn after a title, `after`, which starts with DOT. It stays beside the title when the title and the whole
 * status fit on one line. Otherwise it starts a line of its own under the title, without the DOT, since no line starts
 * or ends in a separator. There it wraps between words when it is too long for one line, as the Codex tab's does, and
 * a status of several DOT-joined parts takes `partedLines`, one line feed between lines.
 */
export function statusAfterTitle(
  after: string,
  title: string,
  fits: (text: string) => boolean,
): { text: string; isUnder: boolean } {
  if (fits(title + after)) return { text: glued(after), isUnder: false }
  const rest = after.replace(LEADING_DOT, '')
  const firstBreak = rest.indexOf(' ')
  if (rest.includes(DOT)) return { text: partedLines(rest.split(DOT), fits).join('\n'), isUnder: true }
  const text = fits(rest) || firstBreak < 0 ? glued(rest) : glued(rest.slice(0, firstBreak)) + rest.slice(firstBreak)

  return { text, isUnder: true }
}

/**
 * `parts` set in lines that `fits`, joined by DOT within a line. A part that does not fit beside the line before it
 * starts a new line without DOT, so no line starts or ends in a separator. A part longer than a line wraps by itself.
 */
export function partedLines(parts: string[], fits: (text: string) => boolean): string[] {
  const separator = glued(DOT)

  return parts.reduce<string[]>((lines, part) => {
    const joined = `${lines.at(-1)}${separator}${part}`
    return lines.length > 0 && fits(joined) ? [...lines.slice(0, -1), joined] : [...lines, part]
  }, [])
}

/**
 * A settled row's title and result label as `fits` measures a line. Every look cuts a settled title to one line at a
 * word (`cutLine`), so the list does not jump when the row folds into the one-line Closed fold. The label, cut to one
 * line, follows `statusAfterTitle`.
 */
export function settledTitleLine(title: string, label: string, fits: (text: string) => boolean) {
  const shown = cutLine(title, fits)
  const cutLabel = fits(label) ? label : `${cutForEllipsis(label, fits)}…`

  return { title: shown, after: statusAfterTitle(`${DOT}${cutLabel}`, shown, fits) }
}

/**
 * A terminal settled row's title cut at a word to one line (`cutLine`): the cells right of its mark, or of its tree
 * arm on a row with no mark, less the cell its row keeps at the right edge.
 */
export function terminalSettledTitle(title: string, listColumns: number, hasMark: boolean): string {
  const { handleAt, textAt } = ROW_COLUMNS.tree
  const cells = listColumns - 1 - (hasMark ? textAt : handleAt)

  return cutLine(title, text => cellWidth(text) <= cells)
}

/** A Status name or line as one span at its level: plain, muted or faint, on the selection color when `isOnSelection`. */
export const levelSpan = (text: string, level: NameLevel, isOnSelection = false): TerminalSpan =>
  level === 'faint'
    ? { text, isFaint: true, ...(isOnSelection ? { isOnSelection: true as const } : {}) }
    : level === 'muted'
      ? { text, isMuted: true }
      : { text }
