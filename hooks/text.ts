const NL = '\n'

const FENCE = /```[^\n]*\n([\s\S]*?)```/g

export function codeBlocks(reply: string): string[] {
  return [...reply.matchAll(FENCE)].map(m => (m[1] ?? '').replace(/\n$/, ''))
}

export function numberBlocks(reply: string): string {
  let n = 0

  return reply.replace(FENCE, block => `[block ${(n += 1)}]${NL}${block}`)
}

/**
 * A turn's reply for the inbox model: each text the agent wrote to the person, in order, a blank line apart. `final`
 * is the turn's last message as the host reports it apart from `texts`. It ends the reply unless `texts` ends with it.
 */
export function turnReply(texts: readonly string[], final = ''): string {
  const written = texts.filter(text => text.trim() !== '')
  const isFinalWritten = final.trim() === '' || written.at(-1)?.trim() === final.trim()

  return (isFinalWritten ? written : [...written, final]).join(`${NL}${NL}`)
}

/** A model's field, trimmed. Null when it is empty or a lone dash, which a model writes for none. */
export function dash(value: string | undefined): string | null {
  const v = (value ?? '').trim()

  return v === '' || v === '-' ? null : v
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + ' …[cut]'
}

export function clipLabel(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** The longest start of `line` that `fits` with an ellipsis after it, with no space or punctuation before the ellipsis. */
export function cutForEllipsis(line: string, fits: (withEllipsis: string) => boolean): string {
  const parts = graphemesOf(line)
  while (parts.length > 0 && !fits(`${parts.join('')}…`)) parts.pop()

  return parts.join('').replace(/[\s.,;:]+$/, '')
}

/** Where a phrase ends: after a comma or semicolon, or before "and". */
const PHRASE_END = /[,;](?=\s)|\s(?=and\s)/g

/**
 * `text` whole when it `fits`, or else cut with an ellipsis at the last phrase end that fits. When no phrase fits, it
 * keeps the first phrase whole, which may not fit, so it never ends in the middle of a phrase.
 */
export function cutAtPhrase(text: string, fits: (text: string) => boolean): string {
  if (fits(text)) return text
  const heads = [...text.matchAll(PHRASE_END)].map(m => `${text.slice(0, m.index).replace(/[\s.,;:]+$/, '')}…`)

  return heads.findLast(fits) ?? heads[0] ?? text
}

export function clipMiddle(text: string, max: number, head: number): string {
  if (text.length <= max) return text

  return `${text.slice(0, head)}${NL}…[cut]${NL}${text.slice(text.length - (max - head))}`
}

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

/**
 * A grapheme where `Intl.Segmenter` is missing, as in Herdr's mod runtime: a base character keeps its combining marks
 * and emoji modifiers, and U+200D joins the next character to it.
 */
const GRAPHEME =
  /[\p{M}\p{Emoji_Modifier}\u200D]+|[^\p{M}\p{Emoji_Modifier}\u200D](?:[\p{M}\p{Emoji_Modifier}]|\u200D[^\p{M}\p{Emoji_Modifier}\u200D]?)*/gu

/** The characters a reader sees in `text`, in order. */
function graphemesOf(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), s => s.segment) : (text.match(GRAPHEME) ?? [])
}
const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cc}\p{Cf}]+$/u
const EMOJI = /\p{Emoji_Presentation}|\uFE0F/u
const WIDE =
  /^[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u

/** The cells a terminal draws `text` in: two for an emoji or a wide East Asian character, however many code points it takes. */
export function cellWidth(text: string): number {
  let cells = 0
  for (const segment of graphemesOf(text)) cells += graphemeCells(segment)

  return cells
}

/** The longest start of `text` that fits in `cells`, never splitting a character. */
export function cutToCells(text: string, cells: number): string {
  let out = ''
  let used = 0
  for (const segment of graphemesOf(text)) {
    used += graphemeCells(segment)
    if (used > cells) break
    out += segment
  }

  return out
}

function graphemeCells(grapheme: string): number {
  if (ZERO_WIDTH.test(grapheme)) return 0

  return EMOJI.test(grapheme) || WIDE.test(grapheme) ? 2 : 1
}

export function ago(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.round(min / 60)
  if (h < 48) return `${h}h ago`

  return `${Math.round(h / 24)}d ago`
}
