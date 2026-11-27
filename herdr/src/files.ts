import { publishedSessionPath, publishedSessionsFolder } from '../../core/remote/herdr'

/**
 * Whether a batch of changed paths from `watchFolder` can change the session's file: it names that file, or names the
 * folder, which means everything in it changed. A host writes a temporary file beside the session's and renames it into
 * place, so the temporary file's own changes are not the session's.
 */
export function isSessionChange(changed: readonly string[], appHome: string, sessionId: string): boolean {
  const folder = publishedSessionsFolder(appHome)
  const file = publishedSessionPath(appHome, sessionId)

  return changed.some(p => p === file || p === folder || p === `${folder}/`)
}
