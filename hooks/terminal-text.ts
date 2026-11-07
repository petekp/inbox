import { desktopLines, desktopTextPt } from './desktop-metrics'
import { cutForEllipsis } from './text'
import { DOT } from './rows'
import { parseInline, type Span } from './inline'

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
  const isMuted = kept.at(-1)?.isMuted

  return [...kept, { text: '…', ...(isMuted ? { isMuted } : {}) }]
}
/** The most words from the start of `line` that `fit` with an ellipsis after them, or null when not even one does. */
function cutAtWord(line: string, fits: (withEllipsis: string) => boolean): string | null {
  const lineWords = line.split(' ')
  for (let n = lineWords.length; n > 0; n--) {
    const head = lineWords
      .slice(0, n)
      .join(' ')
      .replace(/[\s.,;:]+$/, '')
    if (head && fits(`${head}…`)) return head
  }
  return null
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
    const isMuted = last.at(-1)?.span.isMuted
    last.push({ text: '…', span: { text: '…', ...(isMuted ? { isMuted } : {}) } })
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

function wrapped(text: string, width: number): string[] {
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
// The Codex tab wraps a suffix too long for one line between words, so this does too. Claude Code's terminal
// wraps only at a plain space, not at DOT's en space, so a suffix that moves to the next line follows a plain one.
export const unbroken = (after: string, title: string, fits: (text: string) => boolean) => {
  const lastWord = title.slice(Math.max(0, title.trimEnd().lastIndexOf(' ') + 1))
  if (fits(lastWord + after)) return glued(after)
  const dot = after.startsWith(DOT) ? `${DOT.trimEnd()} ` : ''
  const rest = after.slice(dot.length)
  const firstBreak = rest.indexOf(' ')

  return dot + (fits(rest) || firstBreak < 0 ? glued(rest) : glued(rest.slice(0, firstBreak)) + rest.slice(firstBreak))
}
