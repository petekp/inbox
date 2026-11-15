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
  /`([^`\n]+)`|\*\*(?=\S)(.+?)(?<=\S)\*\*(?!\*)|~~(?=\S)(.+?)(?<=\S)~~|(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])|(?<!\w)_(?=\S)([^_\n]+?)(?<=\S)_(?!\w)|\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/gi

/** A normalized HTTPS href the desktop Link accepts, or null for an unsafe or overlong destination. */
export function httpsHref(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null
    const href = parsed.origin + [parsed.pathname, parsed.search, parsed.hash].join('').replace(/@/g, '%40')

    return href.length <= 2048 ? href : null
  } catch {
    return null
  }
}

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
    else {
      const href = httpsHref(url ?? '')
      spans.push(
        href ? { ...outer, text: label ?? '', link: href } : { ...outer, text: `${label ?? ''} (${url ?? ''})` },
      )
    }
    at = m.index + m[0].length
  }
  if (at < text.length) spans.push({ ...outer, text: text.slice(at) })

  return spans
}

/** The visible labels in `text`, without valid link destinations. */
export function linkLabel(text: string): string {
  return parseInline(text)
    .map(span => span.text)
    .join('')
}

/** The HTTPS links in `text`, in order. */
export function inlineLinks(text: string): { label: string; url: string }[] {
  return parseInline(text).flatMap(span => (span.link ? [{ label: span.text, url: span.link }] : []))
}

/** Cuts by visible characters; if it must cut markup, the visible label is kept without a partial link. */
export function cutInline(text: string, max: number): string {
  const visible = linkLabel(text)

  return visible.length > max ? visible.slice(0, max) : text.trim()
}
