export type Span = {
  text: string
  bold?: true
  italic?: true
  code?: true
  strike?: true
  /** An https URL. A link to anything else stays plain text. */
  link?: string
}

// Code first, so markers inside it stay literal.
const INLINE =
  /`([^`\n]+)`|\*\*(?=\S)(.+?)(?<=\S)\*\*(?!\*)|~~(?=\S)(.+?)(?<=\S)~~|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])|(?<!\w)_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)|\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g

/** The spans of `text`, with bold, italic, strikethrough, code and https links. Bold may hold italic. */
export function parseInline(text: string, outer: Omit<Span, 'text'> = {}): Span[] {
  const spans: Span[] = []
  let at = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) spans.push({ ...outer, text: text.slice(at, m.index) })
    const [, code, bold, strike, star, under, label, url] = m
    if (code !== undefined) spans.push({ ...outer, text: code, code: true })
    else if (bold !== undefined) spans.push(...parseInline(bold, { ...outer, bold: true }))
    else if (strike !== undefined) spans.push(...parseInline(strike, { ...outer, strike: true }))
    else if (star !== undefined || under !== undefined)
      spans.push({ ...outer, text: star ?? under ?? '', italic: true })
    else spans.push({ ...outer, text: label ?? '', link: url })
    at = m.index + m[0].length
  }
  if (at < text.length) spans.push({ ...outer, text: text.slice(at) })

  return spans
}
