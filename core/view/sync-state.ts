import type { PrFetchFailure, PrView, Session } from '../../types'
import { GH_TIMEOUT_MS } from '../domain/gh'
import { PR_POLL_MS, PR_SHARED_MS, PRS_REFRESH_MS } from '../domain/pr-fetch'
import { isStatusQuiet } from '../domain/status-freshness'

/**
 * Whether what a look draws from one source is current. `checking`: a read or update runs over data that was not
 * current when it began, so a routine read over current data stays `fresh`. `stale`: the data drawn is known to be
 * behind, and the host tries again. `unavailable`: the host cannot read the source, so data may be missing.
 */
type SyncState<Stale, Unavailable = never> =
  | { is: 'fresh' }
  | { is: 'checking' }
  | { is: 'stale'; since: number | null; why: Stale }
  | ([Unavailable] extends [never] ? never : { is: 'unavailable'; why: Unavailable })

/**
 * Why the asks and findings may be behind. They are `checking` while an update runs over turns no update read yet, or
 * while such turns wait for the catch-up the host has on its way. `failed`: the last update failed, `failed-again` its
 * retry too, and `retrying`: a retry of it runs. `read-failed`: the host could not read the saved inbox.
 * `unreadable`: the last catch-up could not read the conversation.
 */
export type LedgerSync = SyncState<'failed' | 'failed-again' | 'retrying', 'read-failed' | 'unreadable'>

/** Why the Status page may be behind: its last call failed, or several calls after agent activity changed nothing. */
export type StatusSync = SyncState<'failed' | 'quiet'>

/**
 * Why one PR's block may be behind. `error`: the last fetch could not read it. `fetch-failed`: a fetch after its read
 * read no PR. `old`: its read is older than a fetch keeps it, or has no time. `dropped`: its saved view was dropped to keep the session small, and the next fetch reads it again.
 */
export type PrSync = SyncState<'error' | 'fetch-failed' | 'old', 'dropped'>

/** Why gh read no PR at the last fetch: it is missing, signed out, or the fetch failed as a whole. */
export type GhSync = SyncState<{ kind: 'fetch-failed'; failure: PrFetchFailure }, 'gh-missing' | 'gh-signed-out'>

/** Whether the agent's turn state is known: Codex reads it from the rollout, which the server could not read. */
export type TurnSync = SyncState<'rollout-unread'>

export type ViewSync = {
  ledger: LedgerSync
  status: StatusSync
  turn: TurnSync
  gh: GhSync
  prs: Record<string, PrSync>
}

/**
 * What a host knows about its sources outside the saved session. `isReadFailed`: it could not read the saved inbox.
 * `isFetchingPrs`: a PR fetch runs; the mod saves this in `prViews.isFetching`. `turnReadFailedAt`: when Codex last
 * failed to read whether a turn runs, or null. `isDemo`: it draws the sample, whose PRs no fetch reads, so they count as read.
 */
export type SyncInputs = {
  isReadFailed: boolean
  isFetchingPrs: boolean
  turnReadFailedAt: number | null
  isDemo: boolean
}

export const NO_SYNC_INPUTS: SyncInputs = {
  isReadFailed: false,
  isFetchingPrs: false,
  turnReadFailedAt: null,
  isDemo: false,
}

const FRESH = { is: 'fresh' } as const

/**
 * How old a PR's read may be and still count as current: the age of a view a fetch takes from another session, one
 * refresh while the PRs tab shows, the poll tick that notices it is due, and the longest a fetch runs. A read is older
 * only once its next fetch is late.
 */
const PR_FRESH_MS = PR_SHARED_MS + PRS_REFRESH_MS + PR_POLL_MS + GH_TIMEOUT_MS

function ledgerSync(s: Session, inputs: SyncInputs): LedgerSync {
  const p = s.presence
  if (inputs.isReadFailed) return { is: 'unavailable', why: 'read-failed' }
  if (p.ledgerState === 'current') return FRESH
  const isUnreadable = !p.isUpdating && s.pending.length === 0 && p.isConversationUnreadable
  if (isUnreadable) return { is: 'unavailable', why: 'unreadable' }
  if (p.ledgerState === 'behind') return { is: 'checking' }
  const why = p.isUpdating ? 'retrying' : p.failedAttempts > 1 ? 'failed-again' : 'failed'

  return { is: 'stale', since: null, why }
}

export function statusSync(s: {
  ledger: { overview: Session['ledger']['overview'] }
  overviewFailure?: Session['overviewFailure']
}): StatusSync {
  if (s.overviewFailure) return { is: 'stale', since: s.overviewFailure.at, why: 'failed' }
  const o = s.ledger.overview

  return o !== null && isStatusQuiet(o) ? { is: 'stale', since: o.changedAt, why: 'quiet' } : FRESH
}

function turnSync(s: Session, inputs: SyncInputs): TurnSync {
  const isUnknown = inputs.turnReadFailedAt !== null && s.presence.isTurnRunning

  return isUnknown ? { is: 'stale', since: inputs.turnReadFailedAt, why: 'rollout-unread' } : FRESH
}

/** A failed fetch stays `stale` while the next one runs, so its notice stays in place until a fetch reads the PRs. */
function ghSync(prViews: Session['prViews']): GhSync {
  if (prViews.isGhMissing) return { is: 'unavailable', why: 'gh-missing' }
  if (prViews.isGhSignedOut) return { is: 'unavailable', why: 'gh-signed-out' }
  const { failure } = prViews

  return failure ? { is: 'stale', since: failure.at, why: { kind: 'fetch-failed', failure } } : FRESH
}

function prSync(view: PrView, failure: PrFetchFailure | null | undefined, isFetching: boolean, now: number): PrSync {
  const readAt = view.fetchedAt ?? null
  const isFailedSince = failure != null && (readAt === null || failure.at > readAt)
  const why = view.error
    ? 'error'
    : isFailedSince
      ? 'fetch-failed'
      : readAt === null || now - readAt >= PR_FRESH_MS
        ? 'old'
        : null
  if (why === null) return FRESH

  return isFetching ? { is: 'checking' } : { is: 'stale', since: readAt, why }
}

/** Each source's state, from the saved session and what the host knows besides. */
export function viewSync(s: Session, now: number, inputs: SyncInputs): ViewSync {
  const isFetchingPrs = inputs.isFetchingPrs || s.prViews.isFetching === true
  const prs = Object.fromEntries(
    Object.values(s.prViews.views).map(v => [
      v.ref,
      inputs.isDemo ? FRESH : prSync(v, s.prViews.failure, isFetchingPrs, now),
    ]),
  )

  return {
    ledger: ledgerSync(s, inputs),
    status: statusSync(s),
    turn: turnSync(s, inputs),
    gh: ghSync(s.prViews),
    prs,
  }
}

/** The view's sync once the host could not read the saved inbox again, as omp learns after it drew the view. */
export function withReadFailed(sync: ViewSync): ViewSync {
  return { ...sync, ledger: { is: 'unavailable', why: 'read-failed' } }
}
