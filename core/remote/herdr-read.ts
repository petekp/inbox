import type { HerdrPressOutcome, Session } from '../../types'
import { HERDR_FORMAT } from './herdr'
import type { HerdrEnvelope } from './herdr-envelope'
import type { OpenDialog } from '../view/dialog-row'
import { upgradeSession } from '../view/session-files'
import type { SavedSession } from '../view/session-files'

/**
 * A published session file, read. `missing`: no file, as before the host's first write or after the session ended.
 * `torn`: not JSON, which a read mid-write can give, so the look reads again. `newer`: a format from a newer host.
 * `isTrimmed`: the host left out older closed items to keep the file under the 1 MiB Herdr's `readTextFile` reads.
 * `lastPress`: the last press file the host handled, and whether it applied, found its row already changed, or was
 * refused, with why.
 * `projectFolder`: the absolute folder the host opens a relative path against, or null when the host gave none.
 * `isFetchingPrs`: the host had a PR fetch running. A file from a host that does not say reads as not fetching.
 * `isReadFailed`: the host could not read the saved inbox. A file from a host that does not say reads as read.
 * `isSendHeld`: Claude Code holds the inbox's messages after the person stopped the session. A file from a host that
 * does not say reads as not held.
 * `turnReadFailedAt`: when Codex first failed to read whether the running turn still runs, or null.
 * `openDialog`: the agent's own dialog that waits on the person, or null. Its text is null from a host that names only
 * its kind.
 * `savesCollapses`: the session carries `collapsed`, so its host saves the collapses the look writes. An older host
 * deletes a collapse file unread.
 */
export type ReadSession =
  | {
      is: 'read'
      envelope: HerdrEnvelope
      session: Session
      isTrimmed: boolean
      savesCollapses: boolean
      lastPress: LastPress | null
      projectFolder: string | null
      isFetchingPrs: boolean
      isReadFailed: boolean
      isSendHeld: boolean
      turnReadFailedAt: number | null
      openDialog: OpenDialog | null
    }
  | { is: 'missing' }
  | { is: 'torn' }
  | { is: 'newer'; format: number }
  | { is: 'refused'; reason: string }

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

const SOURCE_FIELDS = ['host', 'agent', 'sessionId', 'terminal'] as const

export type LastPress = HerdrPressOutcome

function lastPressOf(x: unknown): LastPress | null {
  if (!isRecord(x) || typeof x.id !== 'string') return null
  if (x.outcome === 'refused') return typeof x.why === 'string' ? { id: x.id, outcome: 'refused', why: x.why } : null
  return x.outcome === 'applied' || x.outcome === 'stale' ? { id: x.id, outcome: x.outcome } : null
}

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
    savesCollapses: 'collapsed' in file.session,
    lastPress: lastPressOf(file.lastPress),
    projectFolder:
      typeof file.projectFolder === 'string' && file.projectFolder.startsWith('/') ? file.projectFolder : null,
    isFetchingPrs: file.isFetchingPrs === true,
    isReadFailed: file.isReadFailed === true,
    isSendHeld: file.isSendHeld === true,
    turnReadFailedAt: typeof file.turnReadFailedAt === 'number' ? file.turnReadFailedAt : null,
    openDialog:
      file.openDialog === 'question' || file.openDialog === 'permission'
        ? { kind: file.openDialog, text: typeof file.openDialogText === 'string' ? file.openDialogText : null }
        : null,
  }
}

/** A read mid-write gives torn JSON: the look reads again this soon, this many times. */
const TORN_RETRY_MS = 30
const TORN_RETRIES = 5

/** Reads the session file at `path`, again after a torn read. A read that fails is refused with its reason. */
export async function readSessionFile(
  read: (path: string) => Promise<string | null>,
  path: string,
  sleep: (ms: number) => Promise<unknown>,
): Promise<ReadSession> {
  for (let n = 0; ; n++) {
    const text = await read(path).catch((e: unknown) => e)
    const got =
      typeof text === 'string' || text === null ? readSession(text) : { is: 'refused' as const, reason: String(text) }
    if (got.is !== 'torn' || n >= TORN_RETRIES) return got
    await sleep(TORN_RETRY_MS)
  }
}
