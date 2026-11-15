import createDOMPurify from 'dompurify'
import { marked, Renderer } from 'marked'
import { httpsHref } from '../../hooks/inline'

const escapeText = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

export function documentHtml(text: string, deniedLink?: string | null): string {
  const renderer = new Renderer()
  renderer.html = token => escapeText(token.text)
  renderer.image = token => escapeText(token.text)
  renderer.link = function ({ href, tokens }) {
    const label = this.parser.parseInline(tokens)
    const safe = httpsHref(href ?? '')

    return !safe
      ? label
      : safe === deniedLink
        ? `${label} (${escapeText(safe)})`
        : `<a href="${escapeText(safe)}">${label}</a>`
  }

  return createDOMPurify(window).sanitize(marked.parse(text, { renderer, async: false }))
}
