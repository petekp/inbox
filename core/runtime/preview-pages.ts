import type { Item, Ledger, Session } from '../../types'
import type { ClientId } from '../domain/client-features'
import { hasPreviews, previewPageText } from '../domain/option-previews'
import { closedAt } from '../domain/ledger-close'
import { inboxStateFolder } from '../domain/question-history'

/**
 * The file calls that write and remove previews pages. `list` gives a folder's files with when each last changed, and
 * none for a missing folder.
 */
export type PreviewFiles = {
  list(folder: string): Promise<readonly { name: string; mtimeMs: number }[]>
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

/**
 * How long a page stays after nothing names it: a closed question's page stays this long after it closed, so Undo
 * finds it, and a page unchanged this long is removed whichever session wrote it, since an ended session never removes
 * its own. A page still named is written again once a day, so it never ages out.
 */
export const PREVIEW_PAGE_KEEP_MS = 14 * 24 * 60 * 60 * 1000
const PREVIEW_PAGE_REFRESH_MS = 24 * 60 * 60 * 1000

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
      writePreviewPages(files, place, ledger, template, Date.now()).catch((error: unknown) =>
        log(previewFailure(error)),
      ),
  }
}

/** The log line for a previews page that could not be written. */
export function previewFailure(error: unknown): string {
  return `inbox: a previews page could not be written: ${error instanceof Error ? error.message : error}`
}

const queues = new Map<string, Promise<void>>()

/**
 * Writes the page of each open item in `ledger` that names one, from the comparison page template at `template`, and
 * removes the session's pages that neither an open item nor a question closed in the last `PREVIEW_PAGE_KEEP_MS`
 * names, and any page in the folder unchanged that long. Writes for one session run in the order they were called, so
 * a write from an older ledger never removes a page a newer one wrote.
 */
export function writePreviewPages(
  files: PreviewFiles,
  place: PreviewPlace,
  ledger: Ledger,
  template: string,
  now: number,
): Promise<void> {
  const key = place.folder + '/' + place.prefix
  const run = (queues.get(key) ?? Promise.resolve()).then(() => syncPages(files, place, ledger, template, now))
  const settled = run.catch(() => {})
  queues.set(key, settled)
  void settled.then(() => queues.get(key) === settled && queues.delete(key))

  return run
}

async function syncPages(files: PreviewFiles, place: PreviewPlace, ledger: Ledger, template: string, now: number) {
  const pages = ledger.items.flatMap(item => (item.previewPage ? [{ item, path: item.previewPage }] : []))
  const recentlyClosed = ledger.closed.flatMap(c =>
    c.item?.previewPage && now - closedAt(c) < PREVIEW_PAGE_KEEP_MS ? [c.item.previewPage] : [],
  )
  const kept = new Set([...pages.map(p => p.path), ...recentlyClosed])
  const shown = await files.list(place.folder)
  const changedAt = new Map(shown.map(f => [`${place.folder}/${f.name}`, f.mtimeMs]))
  const isStale = (path: string) => now - (changedAt.get(path) ?? now) >= PREVIEW_PAGE_KEEP_MS
  const left = [...changedAt.keys()].filter(path => {
    const isThisSession = path.startsWith(`${place.folder}/${place.prefix}`)
    return !kept.has(path) && (isThisSession || isStale(path))
  })
  const text = pages.length > 0 ? await files.read(template) : null
  if (pages.length > 0 && text === null) throw new Error(`The comparison page template is missing: ${template}`)
  await Promise.all([
    ...pages.map(async ({ item, path }) => {
      const page = previewPageText(text ?? '', item)
      const isDue = now - (changedAt.get(path) ?? 0) >= PREVIEW_PAGE_REFRESH_MS
      if (isDue || (await files.read(path)) !== page) await files.write(path, page)
    }),
    ...left.map(path => files.remove(path)),
  ])
}
