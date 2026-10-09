// Each session's state, one JSON file per session in the plugin's data
// folder. Hooks and MCP server processes are short-lived and run at once, so
// every change reads, changes and writes the file under a lock.

import { mkdir, readFile, rename, rmdir, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { NO_CHECKS } from '../../hooks/check-tracking'
import { EMPTY, TOLD_NOTHING, upgradeLedger } from '../../hooks/ledger'
import type { Exchange, Press, Told } from '../../hooks/ledger'
import type { Checks, Ledger, Snapshot } from '../../types'

/** What a row's last press did, shown on the row so the person sees it went through. */
export type LastAction = {
  action: string
  text: string
  at: number
  /** The press handed the row's work to Codex, so the row folds until the turn it started is summarized. */
  isHandoff?: boolean
  turnsStarted?: number
  /** For a finding the press removed: its title, shown in its place for a few seconds. */
  title?: string
}

export type SessionState = {
  version: 1
  sessionId: string
  /** The folder the session started in. */
  root: string
  /** The top folder of the git repo holding `root`; null outside git. */
  top: string | null
  home: string
  /** The codex binary the desktop app runs, from the hooks' CODEX_CLI_PATH. */
  cliPath: string | null
  ledger: Ledger
  checks: Checks
  snapshots: Record<string, Snapshot>
  /** What the turn running now gathered for the per-reply update. */
  turn: {
    person: string | null
    activity: string[]
    press: Press | null
    /** Replies the Stop hook sent Codex back from, which never became the turn's final answer. */
    sentBack: string[]
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
  /** Messages the tab sent with `codex queue`, so UserPromptSubmit can tell them from the person's own words. */
  sent: { text: string; press: Press | null; at: number }[]
  lastActions: Record<string, LastAction>
  /** The transcript's CommandExecution ids already recorded as checks. */
  recordedRuns: string[]
  /** When the tab last asked for its view, so the inbox texts can say whether it is open. */
  tabSeenAt: number
}

export function emptyState(sessionId: string): SessionState {
  return {
    version: 1,
    sessionId,
    root: '',
    top: null,
    home: homedir(),
    cliPath: null,
    ledger: EMPTY,
    checks: NO_CHECKS,
    snapshots: {},
    turn: { person: null, activity: [], press: null, sentBack: [] },
    told: TOLD_NOTHING,
    presence: { turnsStarted: 0, turnsApplied: 0, ledgerState: 'current', isUpdating: false },
    pending: [],
    sent: [],
    lastActions: {},
    recordedRuns: [],
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

/** State saved by an earlier build, with any field it lacks. */
function upgraded(saved: Partial<SessionState>, sessionId: string): SessionState {
  const base = emptyState(sessionId)

  return {
    ...base,
    ...saved,
    // The ledger's shape is the mod's, so a saved one converts the way the mod's does. It converts
    // before the defaults fill in, since an empty `closed` would hide an old `decided`.
    ledger: saved.ledger
      ? { ...base.ledger, ...upgradeLedger({ ...saved.ledger, items: saved.ledger.items ?? [] }) }
      : base.ledger,
    turn: { ...base.turn, ...saved.turn },
    told: { ...base.told, ...saved.told },
    presence: { ...base.presence, ...saved.presence },
    snapshots: upgradeSnapshots(saved.snapshots ?? base.snapshots),
  }
}

/** Readings saved before the shared reader marked a dirty folder 'directory'; it now writes the engine's 'dir'. */
function upgradeSnapshots(snapshots: Record<string, Snapshot>): Record<string, Snapshot> {
  return Object.fromEntries(
    Object.entries(snapshots).map(([repo, s]) => [
      repo,
      {
        ...s,
        dirty: Object.fromEntries(Object.entries(s.dirty).map(([p, id]) => [p, id === 'directory' ? 'dir' : id])),
      },
    ]),
  )
}

export async function readState(dir: string, sessionId: string): Promise<SessionState> {
  try {
    return upgraded(JSON.parse(await readFile(statePath(dir, sessionId), 'utf8')), sessionId)
  } catch {
    return emptyState(sessionId)
  }
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
    const next = await change(await readState(dir, sessionId))
    const tmp = `${path}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(next))
    await rename(tmp, path)

    return next
  })
}
