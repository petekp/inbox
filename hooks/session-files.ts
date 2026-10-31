import { EMPTY, KEPT_SESSIONS, upgradeLedger } from './ledger'
import { TOLD_NOTHING } from './inbox-text'
import type { Told } from './model-text'
import { upgradeLastActions } from './last-actions'
import { upgradeHostTasks } from './host-tasks'
import type { PrViews, Session, TurnDialogQuestion } from '../types'

const NO_PRS: PrViews = { views: {}, branchRef: null, isFetching: false }

export const NO_TURN: Session['turn'] = { person: null, trigger: null, activity: [], press: null }

export function emptySession(): Session {
  return {
    ledger: EMPTY,
    turn: NO_TURN,
    told: TOLD_NOTHING,
    presence: {
      turnsStarted: 0,
      turnsApplied: 0,
      ledgerState: 'current',
      hasDroppedReply: false,
      isUpdating: false,
      isTurnRunning: false,
      turnStartedAt: null,
      lastReplyAt: null,
      lastTypedMessageAt: null,
    },
    place: null,
    pending: [],
    sent: [],
    lastActions: {},
    heldRows: [],
    shownSince: null,
    prViews: NO_PRS,
    stop: null,
    overviewFailure: null,
    lastOverviewCallAt: null,
    hostTasks: [],
    dialogQuestions: [],
  }
}

const SESSION_ID = /^[\w-]{1,100}$/
const SESSION_FILE = /^[\w-]{1,100}\.json$/

/** The name of a session's saved file. Throws for an id that is not safe in a file name. */
export function sessionFile(sessionId: string): string {
  if (!SESSION_ID.test(sessionId)) throw new Error(`Not a session id: ${sessionId}`)

  return `${sessionId}.json`
}

export const isSessionFile = (name: string): boolean => SESSION_FILE.test(name)

/** For a read's `catch`: a file that is not there reads as null, and any other failure throws. */
export function missingAsNull(err: unknown): null {
  if ((err as { code?: unknown }).code === 'ENOENT') return null
  throw err
}

/**
 * The saved sessions that may be deleted: the oldest beyond the newest `KEPT_SESSIONS`, ranked by when the file
 * was last saved, never the `keep` session. `files` are the session files, with their save times.
 */
export function staleSessionFiles<F extends { name: string; mtimeMs: number }>(files: F[], keep: string): F[] {
  const ranked = [...files].sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name))

  return ranked.filter(f => f.name !== `${keep}.json`).slice(0, Math.max(0, ranked.length - KEPT_SESSIONS))
}

/** A session's shared fields as any earlier build saved them, each possibly missing. */
export type SavedSession = Partial<
  Omit<Session, 'turn' | 'told' | 'presence' | 'sent' | 'prViews' | 'dialogQuestions'>
> & {
  turn?: Partial<Session['turn']>
  /** Codex saved its dialog questions with no descriptions. */
  dialogQuestions?: (Omit<TurnDialogQuestion, 'descriptions'> & Partial<Pick<TurnDialogQuestion, 'descriptions'>>)[]
  told?: Partial<Told>
  presence?: Partial<Session['presence']>
  sent?: (Pick<Session['sent'][number], 'text' | 'press' | 'at'> & Partial<Session['sent'][number]>)[]
  prViews?: Partial<PrViews>
}

/** A saved presence without `statedStep`, which a build of the Progress tab saved and nothing reads. */
function withoutStatedStep(presence: SavedSession['presence']): SavedSession['presence'] {
  const { statedStep: _statedStep, ...rest } = (presence ?? {}) as Partial<Session['presence']> & {
    statedStep?: unknown
  }

  return rest
}

/**
 * A saved session's shared fields in the current shape. A sent record saved before the
 * row and delivery fields existed changes no row when its message arrives.
 */
export function upgradeSession(saved: SavedSession): Session {
  const base = emptySession()
  const views = saved.prViews?.views ?? {}

  return {
    ledger: saved.ledger
      ? { ...base.ledger, ...upgradeLedger({ ...saved.ledger, items: saved.ledger.items ?? [] }) }
      : base.ledger,
    turn: { ...base.turn, ...saved.turn },
    told: { ...base.told, ...saved.told },
    presence: { ...base.presence, ...withoutStatedStep(saved.presence) },
    place: saved.place ?? null,
    pending: (saved.pending ?? []).map(p => ({ ...p, ex: { ...p.ex, tasks: p.ex.tasks ?? [] } })),
    sent: (saved.sent ?? []).map(x => ({
      ...x,
      row: x.row ?? null,
      queuedId: x.queuedId ?? null,
      pressedAt: x.pressedAt ?? null,
      deliveryId: x.deliveryId ?? null,
      phase: x.phase ?? 'accepted',
    })),
    lastActions: upgradeLastActions(saved.lastActions ?? {}),
    heldRows: saved.heldRows ?? [],
    shownSince: saved.shownSince ?? null,
    prViews: {
      ...NO_PRS,
      ...saved.prViews,
      // Views saved before `isYours` and `wasSeenOpen`, and threads saved before their times and `isLinesChanged` existed.
      views: Object.fromEntries(
        Object.entries(views).map(([ref, pr]) => [
          ref,
          {
            ...pr,
            isYours: pr.isYours ?? null,
            wasSeenOpen: pr.wasSeenOpen ?? pr.state === 'OPEN',
            threads: pr.threads.map(t => ({
              ...t,
              isLinesChanged: t.isLinesChanged ?? false,
              at: t.at ?? null,
              reply: t.reply && { ...t.reply, at: t.reply.at ?? null },
            })),
          },
        ]),
      ),
      isFetching: false,
    },
    stop: saved.stop ?? null,
    overviewFailure: saved.overviewFailure ?? null,
    lastOverviewCallAt: saved.lastOverviewCallAt ?? null,
    hostTasks: upgradeHostTasks(saved.hostTasks),
    dialogQuestions: (saved.dialogQuestions ?? []).map(q => ({ ...q, descriptions: q.descriptions ?? {} })),
  }
}
