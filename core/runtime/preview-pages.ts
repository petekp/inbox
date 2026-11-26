import type { Item, Ledger, Session } from '../../types'
import type { ClientId } from '../domain/client-features'
import { hasPreviews, previewPageText } from '../domain/option-previews'
import { inboxStateFolder } from '../domain/question-history'

/** The file calls that write and remove previews pages. `list` gives a folder's file names, and none for a missing folder. */
export type PreviewFiles = {
  list(folder: string): Promise<string[]>
  /** The file's text, or null when it does not exist. */
  read(path: string): Promise<string | null>
  /** Writes the file, first making its folder when it is missing. */
  write(path: string, text: string): Promise<void>
  remove(path: string): Promise<void>
}

/** Where one session's previews pages go: its folder, and the start of each page's file name. */
export type PreviewPlace = { folder: string; prefix: string }

/**
 * The previews pages' place for a host's session: `$XDG_STATE_HOME/inbox/previews`, else
 * `~/.local/state/inbox/previews`. Null with neither.
 */
export function previewPlace(
  env: Readonly<Record<string, string | undefined>>,
  host: ClientId,
  sessionId: string,
): PreviewPlace | null {
  const inbox = inboxStateFolder(env)

  return inbox ? { folder: `${inbox}/previews`, prefix: `${host}-${sessionId.replace(/[^\w.-]/g, '_')}-` } : null
}

const pagePath = (place: PreviewPlace, itemId: string) => `${place.folder}/${place.prefix}${itemId}.html`

/** `s` with the page path on each open question that has a preview, and on no other item. */
export function withPreviewPages<S extends Session>(s: S, place: PreviewPlace | null): S {
  const pageOf = (item: Item) => (place && hasPreviews(item) ? pagePath(place, item.id) : undefined)
  if (s.ledger.items.every(item => item.previewPage === pageOf(item))) return s
  const items = s.ledger.items.map((item): Item => {
    const previewPage = pageOf(item)
    if (previewPage === item.previewPage) return item
    if (previewPage) return { ...item, previewPage }
    const unpaged = { ...item }
    delete unpaged.previewPage
    return unpaged
  })

  return { ...s, ledger: { ...s.ledger, items } }
}

/** A host's previews pages: where a session's go, and the write that fills them, which logs a failure. */
export type PreviewPages = {
  placeOf(sessionId: string): PreviewPlace | null
  write(place: PreviewPlace, ledger: Ledger): Promise<void>
}

/** The previews pages of a host whose state folder `env` names, from the comparison page template at `template`. */
export function previewPages(
  files: PreviewFiles,
  env: Readonly<Record<string, string | undefined>>,
  host: ClientId,
  template: string,
  log: (text: string) => void,
): PreviewPages {
  return {
    placeOf: sessionId => previewPlace(env, host, sessionId),
    write: (place, ledger) =>
      writePreviewPages(files, place, ledger, template).catch((error: unknown) => log(previewFailure(error))),
  }
}

/** The log line for a previews page that could not be written. */
export function previewFailure(error: unknown): string {
  return `inbox: a previews page could not be written: ${error instanceof Error ? error.message : error}`
}

/**
 * Writes the page of each open item in `ledger` that names one, from the comparison page template at `template`, and
 * removes the session's pages that no open item names. A page whose text is unchanged is not written again.
 */
export async function writePreviewPages(
  files: PreviewFiles,
  place: PreviewPlace,
  ledger: Ledger,
  template: string,
): Promise<void> {
  const pages = ledger.items.flatMap(item => (item.previewPage ? [{ item, path: item.previewPage }] : []))
  const named = new Set(pages.map(p => p.path))
  const shown = (await files.list(place.folder)).filter(name => name.startsWith(place.prefix))
  const left = shown.map(name => `${place.folder}/${name}`).filter(path => !named.has(path))
  const text = pages.length > 0 ? await files.read(template) : null
  if (pages.length > 0 && text === null) throw new Error(`The comparison page template is missing: ${template}`)
  await Promise.all([
    ...pages.map(async ({ item, path }) => {
      const page = previewPageText(text ?? '', item)
      if ((await files.read(path)) !== page) await files.write(path, page)
    }),
    ...left.map(path => files.remove(path)),
  ])
}
