import { useEffect, useRef, useState } from 'preact/hooks'
import { httpsHref } from '../../hooks/inline'
import { request } from './tab-host'
import { documentHtml } from './document-markdown'
import type { DocumentView } from './tab-state'

export function DocumentReader({ document, close }: { document: DocumentView; close: () => void }) {
  const reader = useRef<HTMLElement>(null)
  const [deniedLink, setDeniedLink] = useState<string | null>(null)
  useEffect(() => reader.current?.focus(), [])
  const openLink = (event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest('a') : null
    const href = httpsHref(anchor?.getAttribute('href') ?? '')
    if (!anchor || !href) return
    event.preventDefault()
    void request('ui/open-link', { url: href }, 10_000).catch(() => setDeniedLink(href))
  }

  return (
    <main class="document-reader" ref={reader} tabIndex={-1}>
      <header class="keys">
        <h1>{document.title}</h1>
        <button type="button" class="key ghost" onClick={close}>
          Back to inbox <kbd>b</kbd>
        </button>
      </header>
      {document.error ? (
        <p class="tone-error">{document.error}</p>
      ) : document.text === null ? (
        <p class="muted">Opening report…</p>
      ) : document.text ? (
        <div
          class="body"
          onClick={openLink}
          dangerouslySetInnerHTML={{ __html: documentHtml(document.text, deniedLink) }}
        />
      ) : null}
    </main>
  )
}
