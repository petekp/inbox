// Each session's state, one JSON file per session in the plugin's data
// folder. Hooks and MCP server processes are short-lived and run at once, so
// every change reads, changes and writes the file under a lock.

import { mkdir, readFile, rename, rmdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { EMPTY, TOLD_NOTHING, upgradeLedger } from '../../hooks/ledger'
import type { Exchange, Press, Told } from '../../hooks/ledger'
import { upgradeLastActions } from '../../hooks/presses'
import type { LastAction, Ledger } from '../../types'

export type SessionState = {
  version: 1
  sessionId: string
  /** The folder the session started in. */
  root: string
  home: string
  /** The codex binary the desktop app runs, from the hooks' CODEX_CLI_PATH. */
  cliPath: string | null
  ledger: Ledger
  /** What the turn running now gathered for the per-reply update. */
  turn: {
    person: string | null
    activity: string[]
    press: Press | null
  }
  /** The inbox text Codex last read beside a prompt, and the closed items it was told about. */
  told: Told
  presence: {
    /** Prompts that started a turn, and how many of those turns the inbox model has summarized. */
    turnsStarted: number
    turnsApplied: number
    ledgerState: 'current' | 'failed'
    isUpdating: boolean
  }
  /** Exchanges waiting for the inbox model, oldest first, with the turns started when each ended. */
  pending: { ex: Exchange; turnsStarted: number }[]
  /**
   * Messages the tab sent with `codex queue`, so UserPromptSubmit can tell them
   * from the person's own words, and mark the press on `row` arrived. `queuedId`
   * is the id `codex queue` gave the message. Both are null on one an earlier build saved.
   */
  sent: { text: string; press: Press | null; at: number; row: string | null; queuedId: string | null }[]
  lastActions: Record<string, LastAction>
  /** When the tab last asked for its view, so the inbox texts can say whether it is open. */
  tabSeenAt: number
}

export function emptyState(sessionId: string): SessionState {
  return {
    version: 1,
    sessionId,
    root: '',
    home: homedir(),
    cliPath: null,
    ledger: EMPTY,
    turn: { person: null, activity: [], press: null },
    told: TOLD_NOTHING,
    presence: { turnsStarted: 0, turnsApplied: 0, ledgerState: 'current', isUpdating: false },
    pending: [],
    sent: [],
    lastActions: {},
    tabSeenAt: 0,
  }
}

/**
 * The plugin's data folder. Hooks get it as PLUGIN_DATA. MCP server
 * processes get no Codex variables, so they take the folder Codex gives
 * hooks for the installed copy they run from: the cache path
 * `<codex home>/plugins/cache/<market>/<plugin>/<version>` maps to
 * `<codex home>/plugins/data/<plugin>-<market>`.
 */
export function dataDir(env: NodeJS.ProcessEnv, pluginRoot: string): string {
  const fromEnv = env.INBOX_DATA || env.PLUGIN_DATA
  if (fromEnv) return fromEnv
  const m = pluginRoot.match(/^(.*)\/plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+$/)
  if (m) return `${m[1]}/plugins/data/${m[3]}-${m[2]}`

  return join(homedir(), '.codex', 'inbox-dev')
}

/** Session ids name files, so only the characters Codex's ids use pass. */
function fileName(sessionId: string): string {
  if (!/^[\w-]{1,100}$/.test(sessionId)) throw new Error(`Not a session id: ${sessionId}`)

  return sessionId
}

export function statePath(dir: string, sessionId: string): string {
  return join(dir, 'sessions', `${fileName(sessionId)}.json`)
}

/** State an earlier build saved, with the keys it kept for session checks and the claim send-back. */
type Saved = Omit<Partial<SessionState>, 'turn' | 'pending' | 'sent'> & {
  sent?: (Omit<SessionState['sent'][number], 'row' | 'queuedId'> & Partial<SessionState['sent'][number]>)[]
  checks?: unknown
  snapshots?: unknown
  recordedRuns?: unknown
  top?: unknown
  turn?: Partial<SessionState['turn']> & { sentBack?: unknown }
  pending?: { ex: Exchange & { checks?: unknown }; turnsStarted: number }[]
}

/** State saved by an earlier build, with any field it lacks, and without the keys it no longer has. */
function upgraded(saved: Saved, sessionId: string): SessionState {
  const base = emptyState(sessionId)
  const { checks: _checks, snapshots: _snapshots, recordedRuns: _runs, top: _top, ...kept } = saved
  const { sentBack: _sentBack, ...turn } = saved.turn ?? {}

  return {
    ...base,
    ...kept,
    // The ledger's shape is the mod's, so a saved one converts the way the mod's does. It converts
    // before the defaults fill in, since an empty `closed` would hide an old `decided`.
    ledger: saved.ledger
      ? { ...base.ledger, ...upgradeLedger({ ...saved.ledger, items: saved.ledger.items ?? [] }) }
      : base.ledger,
    turn: { ...base.turn, ...turn },
    told: { ...base.told, ...saved.told },
    presence: { ...base.presence, ...saved.presence },
    pending: (saved.pending ?? []).map(({ ex: { checks: _exChecks, ...ex }, ...p }) => ({ ...p, ex })),
    // A message sent before the server kept its row changes no row when it arrives.
    sent: (saved.sent ?? []).map(x => ({ ...x, row: x.row ?? null, queuedId: x.queuedId ?? null })),
    lastActions: upgradeLastActions(saved.lastActions ?? {}),
  }
}

/** A session's saved state. A missing file is a new session; a file that cannot be read or converted throws. */
export async function readState(dir: string, sessionId: string): Promise<SessionState> {
  const saved = await readFile(statePath(dir, sessionId), 'utf8').catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return null
    throw err
  })

  return saved === null ? emptyState(sessionId) : upgraded(JSON.parse(saved), sessionId)
}

const LOCK_WAIT_MS = 10_000
/** A lock older than this was left by a process that died holding it. */
const LOCK_STALE_MS = 15_000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Runs `fn` holding the lock folder at `path`, which mkdir creates atomically. */
export async function withLock<T>(path: string, fn: () => Promise<T>, waitMs = LOCK_WAIT_MS): Promise<T> {
  await mkdir(dirname(path), { recursive: true })
  const until = Date.now() + waitMs
  for (;;) {
    try {
      await mkdir(path)
      break
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      const age = await stat(path).then(
        s => Date.now() - s.mtimeMs,
        () => 0,
      )
      if (age > LOCK_STALE_MS) await rmdir(path).catch(() => undefined)
      else if (Date.now() > until) throw new Error(`Timed out waiting for ${path}`)
      else await sleep(15)
    }
  }
  try {
    return await fn()
  } finally {
    await rmdir(path).catch(() => undefined)
  }
}

/** Changes a session's state under its lock, and returns the state written. */
export async function updateState(
  dir: string,
  sessionId: string,
  change: (s: SessionState) => SessionState | Promise<SessionState>,
): Promise<SessionState> {
  const path = statePath(dir, sessionId)

  return withLock(`${path}.lock`, async () => {
    // A file this build cannot read, as one a newer build wrote, is kept beside
    // it for recovery, and the session starts over instead of failing every write.
    const current = await readState(dir, sessionId).catch(async () => {
      await rename(path, `${path}.unreadable-${Date.now()}`)
      return emptyState(sessionId)
    })
    const next = await change(current)
    const tmp = `${path}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(next))
    await rename(tmp, path)

    return next
  })
}
