import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rmdir,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { KEPT_SESSIONS, pruneClosed } from '../../hooks/ledger'
import type { Exchange } from '../../hooks/ledger'
import {
  emptySession,
  isSessionFile,
  missingAsNull,
  sessionFile,
  staleSessionFiles,
  upgradeSession,
} from '../../hooks/session'
import type { Session } from '../../hooks/session'
import { TABS } from '../../hooks/view'
import type { ShownTab } from '../../hooks/view'

export type SessionState = Session & {
  version: 1
  sessionId: string
  root: string
  /** The session's rollout file, from the latest hook input that named one. Null until a hook does. */
  transcriptPath: string | null
  home: string
  /** The codex binary the desktop app runs, from the hooks' CODEX_CLI_PATH. */
  cliPath: string | null
  tabSeenAt: number
  /** The tab the Inbox tab last showed, from its latest view request. Codex only. */
  shownTab: ShownTab
  heard: Heard
}

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

export const NOTHING_HEARD: Heard = {
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
    version: 1,
    sessionId,
    root: '',
    transcriptPath: null,
    home: homedir(),
    cliPath: null,
    ...emptySession(),
    tabSeenAt: 0,
    shownTab: 'needsYou',
    heard: NOTHING_HEARD,
  }
}

export function statePath(dir: string, sessionId: string): string {
  return join(dir, 'sessions', sessionFile(sessionId))
}

/** State an earlier build saved, with the keys it kept for session checks and the claim send-back. */
type Saved = Omit<Partial<SessionState>, 'turn' | 'pending' | 'sent'> & {
  sent?: (Omit<SessionState['sent'][number], 'row' | 'queuedId' | 'pressedAt' | 'deliveryId'> &
    Partial<SessionState['sent'][number]>)[]
  checks?: unknown
  snapshots?: unknown
  recordedRuns?: unknown
  top?: unknown
  subagents?: unknown
  turn?: Partial<SessionState['turn']> & { sentBack?: unknown }
  pending?: { ex: Exchange & { checks?: unknown }; turnsStarted: number }[]
}

/** State saved by an earlier build, with any field it lacks, and without the keys it no longer has. */
function upgraded(saved: Saved, sessionId: string): SessionState {
  if (saved.version !== undefined && saved.version !== 1)
    throw new Error(`Unsupported inbox state version: ${saved.version}`)
  const base = emptyState(sessionId)
  const {
    checks: _checks,
    snapshots: _snapshots,
    recordedRuns: _runs,
    top: _top,
    subagents: _subagents,
    ...kept
  } = saved
  const { sentBack: _sentBack, ...turn } = saved.turn ?? {}

  return {
    ...base,
    ...kept,
    ...upgradeSession({
      ...kept,
      turn,
      pending: (saved.pending ?? []).map(({ ex: { checks: _exChecks, ...ex }, ...p }) => ({ ...p, ex })),
    }),
    shownTab: TABS.some(t => t.id === saved.shownTab) ? (saved.shownTab ?? base.shownTab) : base.shownTab,
    // A file saved before the hooks kept this record came from hooks that ran, so it reads as heard.
    // Its turns were not recorded, so `promptAt` is set too: a tool call then falls back to the time rule.
    heard: saved.heard
      ? { ...NOTHING_HEARD, ...saved.heard }
      : {
          ...NOTHING_HEARD,
          startAt: 0,
          promptAt: 0,
          prompts: saved.presence?.turnsStarted ?? 0,
          stops: saved.presence?.turnsStarted ?? 0,
        },
  }
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

const LOCK_WAIT_MS = 10_000
const LOCK_CHILD = 'held'
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
class LockBusyError extends Error {}

type LockOwner = { pid: number; identity: string | null }
let bootSession: string | null = null
let ownIdentity: string | null = null

function lockOwner(suffix: string): LockOwner | null {
  const match = /^(\d+)-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}(?:-([a-f\d]{32}))?$/.exec(suffix)
  const pid = Number(match?.[1])

  return Number.isSafeInteger(pid) && pid > 0 ? { pid, identity: match?.[2] ?? null } : null
}

function processIdentity(pid: number): string | null {
  if (pid === process.pid && ownIdentity) return ownIdentity
  try {
    const options = {
      encoding: 'utf8' as const,
      env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
      stdio: 'pipe' as const,
      timeout: 1_000,
    }
    const boot = bootSession ?? execFileSync('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'], options).trim()
    const started = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], options).trim()
    if (!boot || !started) return null
    bootSession = boot
    const identity = createHash('sha256').update(boot).update('\0').update(started).digest('hex').slice(0, 32)
    if (pid === process.pid) ownIdentity = identity
    return identity
  } catch {
    return null
  }
}

function isLive(owner: LockOwner, generation: string, observedLiveAt: Map<string, number>): boolean {
  try {
    process.kill(owner.pid, 0)
  } catch (err) {
    return (err as NodeJS.ErrnoException).code !== 'ESRCH'
  }
  if (owner.identity === null) return true
  const checkedAt = observedLiveAt.get(generation)
  if (checkedAt !== undefined && Date.now() - checkedAt < 250) return true
  const identity = processIdentity(owner.pid)
  if (identity !== null && identity !== owner.identity) return false
  observedLiveAt.set(generation, Date.now())
  return true
}

async function lockTarget(path: string): Promise<string | null> {
  return readlink(path).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT' || err.code === 'EINVAL') return null
    throw err
  })
}

async function removeOwnedLock(path: string, target: string, owner: string, source: string): Promise<boolean> {
  const identity = processIdentity(process.pid)
  const claimed = `${owner}.recover-${process.pid}-${randomUUID()}${identity ? `-${identity}` : ''}`
  const isDirectory = await lstat(source).then(
    s => s.isDirectory(),
    (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return false
      throw err
    },
  )
  if (!isDirectory) return false
  try {
    await rename(source, claimed)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw err
  }
  if ((await lockTarget(path)) === target) await unlink(path)
  await rmdir(claimed)

  return true
}

async function recoverLock(path: string, observedLiveAt: Map<string, number>): Promise<boolean> {
  const target = await lockTarget(path)
  if (!target || !isAbsolute(target)) return false
  const owner = basename(target) === LOCK_CHILD ? dirname(target) : target
  if (target !== owner && target !== join(owner, LOCK_CHILD)) return false
  const prefix = `${basename(path)}.owner-`
  if (!basename(owner).startsWith(prefix)) return false
  if ((await realpath(dirname(owner)).catch(() => null)) !== dirname(path)) return false
  const holder = lockOwner(basename(owner).slice(prefix.length))
  if (!holder || isLive(holder, owner, observedLiveAt)) return false
  if (await removeOwnedLock(path, target, owner, owner)) return true
  const recoverPrefix = `${basename(owner)}.recover-`
  const entries = await readdir(dirname(path))
  for (const entry of entries) {
    if (!entry.startsWith(recoverPrefix)) continue
    const recovering = lockOwner(entry.slice(recoverPrefix.length))
    if (!recovering || isLive(recovering, entry, observedLiveAt)) continue
    if (await removeOwnedLock(path, target, owner, join(dirname(path), entry))) return true
  }

  return false
}

/** Runs `fn` under an owned lock; ownerless locks from older builds time out rather than risk a live writer. */
export async function withLock<T>(path: string, fn: () => Promise<T>, waitMs = LOCK_WAIT_MS): Promise<T> {
  path = resolve(path)
  await mkdir(dirname(path), { recursive: true })
  path = join(await realpath(dirname(path)), basename(path))
  const identity = processIdentity(process.pid)
  const owner = `${path}.owner-${process.pid}-${randomUUID()}${identity ? `-${identity}` : ''}`
  const target = join(owner, LOCK_CHILD)
  await mkdir(owner)
  const until = Date.now() + waitMs
  const observedLiveAt = new Map<string, number>()
  try {
    for (;;) {
      try {
        await symlink(target, path)
        break
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
        if (await recoverLock(path, observedLiveAt)) continue
        if (Date.now() > until) throw new LockBusyError(`Timed out waiting for ${path}`)
        await sleep(15)
      }
    }
    return await fn()
  } finally {
    await removeOwnedLock(path, target, owner, owner)
  }
}

export async function tryWithLock<T>(
  path: string,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  let acquired = false
  try {
    return {
      acquired: true,
      value: await withLock(
        path,
        () => {
          acquired = true
          return fn()
        },
        0,
      ),
    }
  } catch (err) {
    if (!acquired && err instanceof LockBusyError) return { acquired: false }
    throw err
  }
}

/** Changes a session under its lock. Every save prunes the closed lists but keeps the records of `heldRows`. */
export async function updateState(
  dir: string,
  sessionId: string,
  change: (s: SessionState) => SessionState | Promise<SessionState>,
): Promise<SessionState> {
  const path = statePath(dir, sessionId)

  return withLock(`${path}.lock`, async () => {
    const { state: current, isSaved } = await readSaved(dir, sessionId)
    const changed = await change(current)
    if (isSaved && changed === current) return current
    const next = { ...changed, ledger: pruneClosed(changed.ledger, new Set(changed.heldRows)) }
    const tmp = `${path}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(next))
    await rename(tmp, path)

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
  for (const { path, mtimeMs } of staleSessionFiles(
    readable.filter(f => f !== null),
    keep,
  )) {
    try {
      await tryWithLock(`${path}.updating`, () =>
        tryWithLock(`${path}.lock`, async () => {
          if ((await stat(path)).mtimeMs === mtimeMs) await unlink(path)
        }),
      )
    } catch {
      continue
    }
  }
}
