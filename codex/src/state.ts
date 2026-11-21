import { readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { KEPT_SESSIONS } from '../../core/domain/ledger'
import type { CallFailure, CallKind, Child, Exchange, Session } from '../../types'
import { checkVersion, SESSION_VERSION } from '../../core/domain/session-version'
import {
  emptySession,
  isSessionFile,
  missingAsNull,
  sessionFile,
  staleSessionFiles,
  upgradeSession,
  NO_CALL_FAILURES,
} from '../../core/view/session-files'
import { pruned } from '../../core/runtime/session-presses'
import type { AnswerDoc } from '../../core/domain/earlier-answers'
import { historyStep, recordMatches } from '../../core/runtime/history-store'
import type { HistoryPlace } from '../../core/runtime/history-store'
import { diagnosticLines } from './diagnostics'
import { tryWithLock, withLock } from './lock'
import { readViewers, removeViewers } from './viewers'
import { codexCommandStore, commandsPath, removeCommands } from './command-log'
import { followCommandRows, movedLegacyCommands } from '../../core/runtime/command-store'
import { herdrLog } from './herdr-log'
import { isShownTab } from '../../core/view/tabs'
import type { ShownTab } from '../../core/view/tabs'

/** A failed `codex exec` call as builds before `callFailures` saved it, with the fields each build added. */
type SavedModelFailure = {
  at: number
  cli: string
  code: number
  stderr: string
  signal?: string | null
  errorCode?: string | null
  timeoutMs?: number | null
  call?: CallKind['call'] | null
  reads?: CallKind['reads'] | null
  isRetry?: boolean | null
  elapsedMs?: number | null
}

/**
 * The call records of a state an earlier build saved: its saved failure in its call's record, the ledger's when it
 * named none. The failure reads as recovered when the session shows its call working since: for the ledger call, a
 * ledger that is not failed and no pending exchange that failed; for the Status call, no saved Status failure. That
 * build did not save when the call recovered, so `recoveredAt` is the failure's own time.
 */
function withSavedFailure(saved: Saved): Session['callFailures'] {
  const f = saved.lastModelFailure
  if (!f) return NO_CALL_FAILURES
  const call = f.call ?? 'ledger'
  const isLedgerFailing = saved.presence?.ledgerState === 'failed' || (saved.pending ?? []).some(p => p.failed)
  const isFailing = call === 'ledger' ? isLedgerFailing : Boolean(saved.overviewFailure)

  return { ...NO_CALL_FAILURES, [call]: { lastFailure: callFailureOf(f), recoveredAt: isFailing ? null : f.at } }
}

/** An earlier build's saved failure as the shared record. That build kept all of its stderr, so it is filtered here. */
function callFailureOf(f: SavedModelFailure): CallFailure {
  return {
    at: f.at,
    call: f.call ?? null,
    reads: f.reads ?? null,
    isRetry: f.isRetry ?? null,
    cause: f.code === 0 ? 'no-reply' : 'process',
    model: null,
    error: null,
    answerChars: null,
    ms: f.elapsedMs ?? null,
    process: {
      cli: f.cli,
      code: f.code,
      stderr: diagnosticLines(f.stderr),
      signal: f.signal ?? null,
      errorCode: f.errorCode ?? null,
      timeoutMs: f.timeoutMs ?? null,
    },
  }
}

export type SessionState = Session & {
  version: typeof SESSION_VERSION
  sessionId: string
  root: string
  /** The session's rollout file, from the latest hook input that named one. Null until a hook does. */
  transcriptPath: string | null
  home: string
  /** The codex binary the desktop app runs, as a hook's environment names it or the server found it. */
  cliPath: string | null
  tabSeenAt: number
  /** When the Inbox tab last had each Status subject row on screen in the look under way, by the row's id. Codex only. */
  lookRows: Record<string, number>
  /** The tab the Inbox tab last showed, from its latest view request. Codex only. */
  shownTab: ShownTab
  heard: Heard
  /**
   * The newest turn whose end the inbox has covered, by its turn id: its Stop ran, or an update was started to catch
   * up to it. A turn that ended after it in the rollout reached no Stop. Null when the inbox has covered none.
   */
  coveredTurn: string | null
  /**
   * The ledger and turns, from `openCatchUpKey`, when the tab's view last started a catch-up for a ledger that failed or
   * fell behind. The view starts another only once the ledger takes an answer or a turn starts. Null until one starts.
   */
  openCatchUpKey: string | null
  /**
   * The running turn's `herdr agent` commands, oldest first: each with when PreToolUse noted its delegates, and the
   * rows those delegates had before. Codex runs PreToolUse before a call is approved, so the rows of a command that
   * did not run go back to these.
   */
  delegateCalls: DelegateCall[]
  /**
   * The newest report Herdr took from a hook or an update: its key from `herdrReportKey`, and its `seq`. Each runs in
   * its own process, so this is how a later one knows its report would change nothing.
   */
  herdrReport?: { key: string; seq: number }
  /**
   * The process id of the Inbox tab's server while it runs a PR fetch for this chat. The hooks and updates publish the
   * chat for the Herdr look from their own processes, so the server saves it for them. Codex only.
   */
  prFetchPid?: number
  /**
   * When the Inbox tab's server first failed to read, from the rollout, whether the running turn still runs. The hooks
   * and updates publish the chat for the Herdr look from their own processes, so the server saves it for them. Codex only.
   */
  turnReadFailedAt?: number
  /**
   * When a hook, an update or the MCP server in Herdr last changed this state, in ms, and always above the change
   * before it. Each of their changes sets it, even one that changes nothing else. A report to a Herdr pane carries it as
   * `seq`, so Herdr drops a report of an earlier state that arrives after a later one. A session published for the
   * Herdr look carries it as its `writtenAt`.
   */
  writtenAt?: number
}

type DelegateCall = { command: string; at: number; before: Child[] }

/**
 * Codex skips a hook
 * until the person trusts it, so a hook that never ran means items are missing.
 * Times are null until the hook first runs.
 */
export type Heard = {
  startAt: number | null
  promptAt: number | null
  prompts: number
  /** The turn ids UserPromptSubmit recorded last, oldest first. */
  promptTurns: string[]
  stopAt: number | null
  stops: number
  /** When Codex called a tool in a turn UserPromptSubmit did not record. */
  promptMissedAt: number | null
}

const NOTHING_HEARD: Heard = {
  startAt: null,
  promptAt: null,
  prompts: 0,
  promptTurns: [],
  stopAt: null,
  stops: 0,
  promptMissedAt: null,
}

export function emptyState(sessionId: string): SessionState {
  return {
    version: SESSION_VERSION,
    sessionId,
    root: '',
    transcriptPath: null,
    home: homedir(),
    cliPath: null,
    ...emptySession(),
    tabSeenAt: 0,
    lookRows: {},
    shownTab: 'needsYou',
    heard: NOTHING_HEARD,
    coveredTurn: null,
    openCatchUpKey: null,
    delegateCalls: [],
  }
}

/** Whether a server saved a PR fetch for this chat and still runs. A server that quit mid-fetch leaves its id behind. */
export function isPrFetchRunning(s: SessionState): boolean {
  if (s.prFetchPid === undefined) return false
  try {
    process.kill(s.prFetchPid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

export function statePath(dir: string, sessionId: string): string {
  return join(dir, 'sessions', sessionFile(sessionId))
}

/** State an earlier build saved, with the keys it kept for session checks and the claim send-back. */
type Saved = Omit<Partial<SessionState>, 'turn' | 'pending' | 'sent'> & {
  lastModelFailure?: SavedModelFailure | null
  sent?: (Omit<SessionState['sent'][number], 'row' | 'queuedId' | 'pressedAt' | 'deliveryId'> &
    Partial<SessionState['sent'][number]>)[]
  checks?: unknown
  snapshots?: unknown
  recordedRuns?: unknown
  top?: unknown
  subagents?: unknown
  remoteViewers?: unknown
  turn?: Partial<SessionState['turn']> & { sentBack?: unknown }
  pending?: { ex: Exchange & { checks?: unknown }; turnsStarted: number; failed?: true }[]
}

/** State saved by an earlier build, with any field it lacks, and without the keys it no longer has. */
function upgraded(saved: Saved, sessionId: string): SessionState {
  checkVersion(saved)
  const base = emptyState(sessionId)
  const {
    lastModelFailure: _modelFailure,
    checks: _checks,
    snapshots: _snapshots,
    recordedRuns: _runs,
    top: _top,
    subagents: _subagents,
    remoteViewers: _viewers,
    ...kept
  } = saved
  const { sentBack: _sentBack, ...turn } = saved.turn ?? {}
  // A file saved before the hooks kept this record came from hooks that ran, so it reads as heard.
  // Its turns were not recorded, so `promptAt` is set too: a tool call then falls back to the time rule.
  const heard: Heard = saved.heard
    ? { ...NOTHING_HEARD, ...saved.heard }
    : {
        ...NOTHING_HEARD,
        startAt: 0,
        promptAt: 0,
        prompts: saved.presence?.turnsStarted ?? 0,
        stops: saved.presence?.turnsStarted ?? 0,
      }

  return {
    ...base,
    ...kept,
    ...upgradeSession({
      ...kept,
      turn,
      pending: (saved.pending ?? []).map(({ ex: { checks: _exChecks, ...ex }, ...p }) => ({ ...p, ex })),
    }),
    shownTab: isShownTab(saved.shownTab) ? saved.shownTab : base.shownTab,
    heard,
    ...(saved.callFailures ? {} : { callFailures: withSavedFailure(saved) }),
    coveredTurn: saved.coveredTurn !== undefined ? saved.coveredTurn : coveredBefore(heard, turn.person ?? null),
  }
}

/**
 * The newest turn a build that kept no `coveredTurn` covered: the turn of the last prompt it recorded, or the turn before
 * that while the last one's Stop has not run, since a Stop clears the recorded prompt.
 */
function coveredBefore(heard: Heard, person: string | null): string | null {
  return heard.promptTurns.at(person === null ? -1 : -2) ?? null
}

async function readSaved(dir: string, sessionId: string): Promise<{ state: SessionState; isSaved: boolean }> {
  const saved = await readFile(statePath(dir, sessionId), 'utf8').catch(missingAsNull)

  return saved === null
    ? { state: emptyState(sessionId), isSaved: false }
    : { state: upgraded(JSON.parse(saved), sessionId), isSaved: true }
}

/** A session's saved state. A missing file is a new session; a file that cannot be read or converted throws. */
export async function readState(dir: string, sessionId: string): Promise<SessionState> {
  return (await readSaved(dir, sessionId)).state
}

let questionHistory: HistoryPlace | null = null

/**
 * Turns on the question history for this process's saves: each save then searches it for the questions it adds and
 * records the questions it closes. Only the entry points turn it on, so a test never reaches the person's history.
 */
export function useQuestionHistory(place: HistoryPlace | null): void {
  questionHistory = place
}

/** The earlier answers the `record` answer lists for a call, from this process's question history. */
export function recordMatchesNow(input: Record<string, unknown>, now: number): Promise<AnswerDoc[]> {
  return recordMatches(questionHistory, input, now)
}

/** Changes a session under its lock. Every save prunes it with `pruned`. */
export async function updateState(
  dir: string,
  sessionId: string,
  change: (s: SessionState) => SessionState | Promise<SessionState>,
  now: () => number = Date.now,
): Promise<SessionState> {
  const path = statePath(dir, sessionId)

  return withLock(`${path}.lock`, async () => {
    const { state: current, isSaved } = await readSaved(dir, sessionId)
    const changed = await historyStep(questionHistory, sessionId, current, await change(current), Date.now())
    if (isSaved && changed === current) return current
    const commands = codexCommandStore(dir, sessionId, now)
    const log = herdrLog(dir)
    const next = await movedLegacyCommands(
      commands,
      pruned(changed, now(), (await readViewers(dir, sessionId)).leases),
      log,
    )
    const tmp = `${path}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(next))
    await rename(tmp, path)
    await followCommandRows(commands, commandsPath(dir, sessionId), next, log)

    return next
  })
}

/**
 * Deletes the oldest saved sessions beyond the newest `KEPT_SESSIONS`, ranked by when the file was last saved.
 * Only readable files of a version this build supports count and can go, and the `keep` session never does. A file
 * whose lock or update lock is held, or that was saved again since the ranking, stays.
 */
export async function pruneSessions(dir: string, keep: string): Promise<void> {
  const folder = join(dir, 'sessions')
  const names = (await readdir(folder)).filter(isSessionFile)
  if (names.length <= KEPT_SESSIONS) return
  const readable = await Promise.all(
    names.map(async name => {
      const path = join(folder, name)
      try {
        const { mtimeMs } = await stat(path)
        upgraded(JSON.parse(await readFile(path, 'utf8')), name.slice(0, -'.json'.length))
        return { name, path, mtimeMs }
      } catch {
        return null
      }
    }),
  )
  for (const { name, path, mtimeMs } of staleSessionFiles(
    readable.filter(f => f !== null),
    keep,
  )) {
    try {
      await tryWithLock(`${path}.updating`, () =>
        tryWithLock(`${path}.lock`, async () => {
          if ((await stat(path)).mtimeMs !== mtimeMs) return
          await unlink(path)
          await removeViewers(dir, name.slice(0, -'.json'.length))
          await removeCommands(dir, name.slice(0, -'.json'.length))
        }),
      )
    } catch {
      continue
    }
  }
}
