import type { Session } from '../../types'
import { HERDR_FORMAT } from '../../hooks/herdr'
import type { HerdrEnvelope } from '../../hooks/herdr'
import { upgradeSession } from '../../hooks/session-files'
import type { SavedSession } from '../../hooks/session-files'

/** Where a host publishes its session for the look, under the Herdr app's home folder. */
export const sessionPath = (appHome: string, sessionId: string) => `${appHome}/inbox/sessions/${sessionId}.json`

/** The folder the look watches for a host's writes. */
export const sessionsFolder = (appHome: string) => `${appHome}/inbox/sessions`

/**
 * Whether a batch of changed paths from `watchFolder` can change the session's file: it names that file, or names the
 * folder, which means everything in it changed. A host writes a temporary file beside the session's and renames it into
 * place, so the temporary file's own changes are not the session's.
 */
export function isSessionChange(changed: readonly string[], appHome: string, sessionId: string): boolean {
  const folder = sessionsFolder(appHome)

  return changed.some(p => p === sessionPath(appHome, sessionId) || p === folder || p === `${folder}/`)
}

/**
 * A published session file, read. `missing`: no file, as before the host's first write or after the session ended.
 * `torn`: not JSON, which a read mid-write can give, so the look reads again. `newer`: a format from a newer host.
 * `isTrimmed`: the host left out older closed items to keep the file under the 1 MiB Herdr's `readTextFile` reads.
 */
export type ReadSession =
  | { is: 'read'; envelope: HerdrEnvelope; session: Session; isTrimmed: boolean }
  | { is: 'missing' }
  | { is: 'torn' }
  | { is: 'newer'; format: number }
  | { is: 'refused'; reason: string }

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

const SOURCE_FIELDS = ['host', 'agent', 'sessionId', 'terminal'] as const

/** A session file's text, read and checked, with its session in the current shape. */
export function readSession(text: string | null): ReadSession {
  if (text === null) return { is: 'missing' }
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    return { is: 'torn' }
  }
  if (!isRecord(file)) return { is: 'refused', reason: 'not an object' }
  const { format } = file
  if (typeof format === 'number' && format > HERDR_FORMAT) return { is: 'newer', format }
  if (format !== HERDR_FORMAT) return { is: 'refused', reason: `unknown format ${String(format)}` }
  const missing = SOURCE_FIELDS.find(field => typeof file[field] !== 'string' || file[field] === '')
  if (missing) return { is: 'refused', reason: `no ${missing}` }
  if (typeof file.writtenAt !== 'number') return { is: 'refused', reason: 'no writtenAt' }
  if (!isRecord(file.session)) return { is: 'refused', reason: 'no session' }
  const envelope = file as HerdrEnvelope

  return {
    is: 'read',
    envelope,
    session: upgradeSession(file.session as SavedSession),
    isTrimmed: file.trimmed === true,
  }
}
