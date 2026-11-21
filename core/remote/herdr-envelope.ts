import type { remoteViewerReceipts } from '../runtime/remote-viewers'
import type { remoteReceipts } from '../runtime/remote-command-state'
import type { HerdrPressOutcome, Session } from '../../types'
import type { ClientId } from '../domain/client-features'
import { presentedSession } from '../view/session-presentation'
import { HERDR_FORMAT } from './herdr'

/**
 * Who publishes a session for the Herdr look, and when. `agent` is the name the shared texts use, as in "Tell Claude".
 * `projectFolder` is the folder the host opens a relative path against, so the look can open one itself.
 */
export type EnvelopeSource = {
  receipts?: ReturnType<typeof remoteReceipts>
  viewers?: ReturnType<typeof remoteViewerReceipts>
  remoteProtocol?: 2
  remoteActions?: readonly string[]
  remoteHistoryAfter?: number
  host: ClientId
  agent: string
  sessionId: string
  terminal: string
  writtenAt: number
  projectFolder?: string
  /** Whether the host has a PR fetch running for the session, which the saved session does not hold. */
  isFetchingPrs?: boolean
  /** Whether the host could not read the session's saved inbox, so its asks and findings may be missing. */
  isReadFailed?: boolean
  /** When Codex first failed to read whether the running turn still runs, so the look draws its working marks still. */
  turnReadFailedAt?: number
  /** The inbox build the host runs, which Help names. A file from an older host has none, and Help then names none. */
  version?: string
  /** Whether the host's folder holds `NEXT_BUILD_MARK`, which adds "next" to the version. */
  isNextBuild?: boolean
}

/**
 * The file a host publishes for the Herdr look. It has `projectFolder` only when that is an absolute path. `trimmed` is set when the host left out closed items the view does not
 * draw in place, to keep the file under `PUBLISH_LIMIT_BYTES`. `lastPress` is the session's `lastHerdrPress`.
 * `isFetchingPrs` is set only while a fetch runs, so a file without it, as from an older host, reads as not fetching.
 * `isReadFailed` is set only while the host could not read the saved inbox. `isNextBuild` is set only on a next build.
 */
export type HerdrEnvelope = Omit<EnvelopeSource, 'isFetchingPrs' | 'isReadFailed' | 'isNextBuild'> & {
  format: typeof HERDR_FORMAT
  trimmed?: true
  isFetchingPrs?: true
  isReadFailed?: true
  isNextBuild?: true
  lastPress?: HerdrPressOutcome
  receipts?: ReturnType<typeof remoteReceipts>
  session: Session
}

/** Publishes shared presentation state, without command history, viewer leases, host fields or model answers. */
export function herdrEnvelope(source: EnvelopeSource, session: Session, isTrimmed = false): HerdrEnvelope {
  const shared = presentedSession(session)

  const { lastHerdrPress } = session
  const { projectFolder, isFetchingPrs, isReadFailed, isNextBuild, ...rest } = source

  return {
    format: HERDR_FORMAT,
    ...rest,
    ...(projectFolder?.startsWith('/') && { projectFolder }),
    ...(isTrimmed && { trimmed: true }),
    ...(isFetchingPrs && { isFetchingPrs: true }),
    ...(isReadFailed && { isReadFailed: true }),
    ...(isNextBuild && { isNextBuild: true }),
    ...(lastHerdrPress && { lastPress: lastHerdrPress }),
    session: shared as Session,
  }
}
