import { constants } from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'

import type { DocumentFile } from '../../hooks/document'
import { httpsHref } from '../../hooks/inline'

const BLOCKED_DOCUMENT_LINK = 'inbox-blocked-document-link'

export const documentFile: DocumentFile = {
  stat: async path => {
    const target = await realpath(path)
    const info = await stat(target)
    return { path: target, isFile: info.isFile(), size: info.size }
  },
  read: async (path, limit) => {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      if (!(await file.stat()).isFile()) return new Uint8Array(limit + 1)
      const bytes = new Uint8Array(limit + 1)
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
      return bytes.subarray(0, bytesRead)
    } finally {
      await file.close()
    }
  },
}

export function documentLinkTarget(href: string): string {
  return httpsHref(href) ?? BLOCKED_DOCUMENT_LINK
}

type MarkdownApi = {
  Markdown: new (
    text: string,
    indent: number,
    margin: number,
    theme: Record<string, unknown>,
  ) => { render(width: number): Iterable<string> }
  getMarkdownTheme(): Record<string, unknown>
}

export async function documentMarkdown(load: () => Promise<unknown>) {
  const { Markdown, getMarkdownTheme } = (await load()) as MarkdownApi
  return (text: string, width: number) => {
    const theme = {
      ...getMarkdownTheme(),
      link: (text: string) => text,
      linkUrl: () => '',
      underline: (text: string) => text,
      resolveLink: documentLinkTarget,
    }
    return [...new Markdown(text, 0, 0, theme).render(width)].map(line =>
      line.replaceAll(`\x1b]8;;${BLOCKED_DOCUMENT_LINK}\x07`, ''),
    )
  }
}

type HyperlinkApi = {
  isHyperlinkEnabled(): boolean
  urlHyperlink(url: string, text: string): string
}

export async function panelLink(
  load: () => Promise<unknown>,
): Promise<((url: string, text: string) => string) | undefined> {
  try {
    const { isHyperlinkEnabled, urlHyperlink } = (await load()) as HyperlinkApi
    return isHyperlinkEnabled() ? urlHyperlink : undefined
  } catch {
    return undefined
  }
}
