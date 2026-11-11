import type { Session } from '../types'
import { herdrEnvelope } from './herdr'
import type { EnvelopeSource } from './herdr'
import { sessionFile } from './session-files'

/** The file calls a host publishes with. `move` replaces `to` in one step, so the Herdr look never reads half a file. */
export type PublishFiles = {
  write: (path: string, text: string) => Promise<void>
  move: (from: string, to: string) => Promise<void>
  remove: (path: string) => Promise<void>
}

/** Where a host publishes a session for the Herdr look, under the app's settings folder. Throws for an unsafe id. */
function publishedSessionPath(appHome: string, sessionId: string): string {
  return `${appHome}/inbox/sessions/${sessionFile(sessionId)}`
}

/**
 * Writes the session's envelope beside its file, then moves it over the file. A temporary name never ends in `.json`.
 * A failed write or move removes the temporary file and rejects.
 */
export async function publishSession(
  files: PublishFiles,
  appHome: string,
  source: EnvelopeSource,
  session: Session,
): Promise<void> {
  const path = publishedSessionPath(appHome, source.sessionId)
  const temporary = `${path}.${source.writtenAt}-${Math.random().toString(36).slice(2)}.tmp`
  try {
    await files.write(temporary, JSON.stringify(herdrEnvelope(source, session)))
    await files.move(temporary, path)
  } catch (err) {
    await files.remove(temporary).catch(() => undefined)
    throw err
  }
}

/**
 * Publishes the session when there is an app home, and resolves whether its file now holds it. A host labels its
 * terminal with the session only then, so the labels never name a file that was not written. A failure goes to `log`.
 */
export function publishedSession(
  files: PublishFiles,
  appHome: string | null,
  source: EnvelopeSource,
  session: Session,
  log: (text: string) => void,
): Promise<boolean> {
  if (!appHome) return Promise.resolve(false)

  return publishSession(files, appHome, source, session).then(
    () => true,
    (err: unknown) => {
      log(`Herdr publish failed: ${err instanceof Error ? err.message : String(err)}`)
      return false
    },
  )
}

/** Removes the session's published file, as when the session ends. */
export async function unpublishSession(files: PublishFiles, appHome: string, sessionId: string): Promise<void> {
  return files.remove(publishedSessionPath(appHome, sessionId))
}
