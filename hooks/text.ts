const NL = '\n'

const FENCE = /```[^\n]*\n([\s\S]*?)```/g

export function codeBlocks(reply: string): string[] {
  return [...reply.matchAll(FENCE)].map(m => (m[1] ?? '').replace(/\n$/, ''))
}

export function numberBlocks(reply: string): string {
  let n = 0

  return reply.replace(FENCE, block => `[block ${(n += 1)}]${NL}${block}`)
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max) + ' …[cut]'
}

export function clipLabel(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function clipMiddle(text: string, max: number, head: number): string {
  if (text.length <= max) return text

  return `${text.slice(0, head)}${NL}…[cut]${NL}${text.slice(text.length - (max - head))}`
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cc}\p{Cf}]+$/u
const EMOJI = /\p{Emoji_Presentation}|\uFE0F/u
const WIDE =
  /^[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u

/** The cells a terminal draws `text` in: two for an emoji or a wide East Asian character, however many code points it takes. */
export function cellWidth(text: string): number {
  let cells = 0
  for (const { segment } of graphemes.segment(text)) cells += graphemeCells(segment)

  return cells
}

/** The longest start of `text` that fits in `cells`, never splitting a character. */
export function cutToCells(text: string, cells: number): string {
  let out = ''
  let used = 0
  for (const { segment } of graphemes.segment(text)) {
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
