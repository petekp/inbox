import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Run } from '../../core/domain/gh'
import { CLEARED_TOKENS, herdrReporter, herdrTarget } from '../../core/remote/herdr'
import { isPublishedHere, unpublishSession } from '../../core/remote/herdr-app'
import { unpublishOthersHere } from '../../core/remote/herdr-sweep'
import type { SweepFiles } from '../../core/remote/herdr-sweep'
import { statePath } from './state'
import { withLock } from './lock'

/**
 * The Codex session that runs in a Herdr app terminal, as its SessionStart hook saved it, with the Codex process it runs
 * in when the hook found one. `sessionId` is null once that session's SessionEnd hook ran, until another one starts.
 */
type TerminalClaim = { sessionId: string | null; pid: number | null }

/**
 * The longest a SessionEnd hook waits for the session's Herdr lock. Codex gives a SessionEnd hook at most 3 seconds, and
 * the hook still has to start Node and clear the terminal's labels.
 */
const END_LOCK_WAIT_MS = 1500

const claimPath = (dir: string, terminal: string) =>
  join(dir, 'herdr-terminals', `${encodeURIComponent(terminal)}.json`)

const isPid = (value: unknown): value is number | null => value === null || Number.isSafeInteger(value)

/** The terminal's claim, or null when no session's hook saved one, as before this build, or the file is not one. */
export async function readClaim(dir: string, terminal: string): Promise<TerminalClaim | null> {
  const text = await readFile(claimPath(dir, terminal), 'utf8').catch(() => null)
  try {
    const c = JSON.parse(text ?? 'null') as { sessionId?: unknown; pid?: unknown } | null
    const isClaim = (c?.sessionId === null || typeof c?.sessionId === 'string') && isPid(c?.pid)

    return isClaim ? { sessionId: c.sessionId as string | null, pid: c.pid as number | null } : null
  } catch {
    return null
  }
}

async function writeClaim(dir: string, terminal: string, claim: TerminalClaim): Promise<void> {
  const path = claimPath(dir, terminal)
  const temporary = `${path}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`
  await mkdir(join(dir, 'herdr-terminals'), { recursive: true })
  await writeFile(temporary, JSON.stringify(claim))
  await rename(temporary, path).catch(async (err: unknown) => {
    await rm(temporary, { force: true })
    throw err
  })
}

/**
 * Whether a process may publish and report `sessionId` to the terminal: when the claim names it, or no claim was saved.
 * A late write from a session that ended, or that another session replaced, then never brings its file back.
 */
export const mayReport = (claim: TerminalClaim | null, sessionId: string): boolean =>
  claim === null || claim.sessionId === sessionId

/** Whether the terminal's server applies the presses for `sessionId`: it may report it, and its Codex still runs. */
export const runsHere = (claim: TerminalClaim | null, sessionId: string, isRunning: (pid: number) => boolean) =>
  mayReport(claim, sessionId) && (claim?.pid == null || isRunning(claim.pid))

const files: SweepFiles = {
  list: folder => readdir(folder),
  read: path => readFile(path, 'utf8'),
  remove: path => rm(path, { force: true }),
  removeFolder: path => rm(path, { recursive: true, force: true }),
}

/** What a Codex session's hooks do to the Herdr app terminal it runs in, as it starts and as it ends. */
export type HerdrTerminal = { start: (sessionId: string) => Promise<void>; end: (sessionId: string) => Promise<void> }

/**
 * The terminal calls of a session whose hooks run in the Herdr app terminal `env` names, or undefined outside one.
 * `pid` is the Codex process the session runs in, when the hook found it.
 *
 * `start` claims the terminal for the session, then removes the files of the other Codex sessions published from it,
 * which no longer run there. `end` runs only while the session holds the terminal, or published from it before any
 * claim: it marks the terminal as running no session, removes the session's file and clears the terminal's labels.
 * It runs under the session's Herdr lock, as each report does, so no report of the session lands after it.
 */
export function herdrTerminal(
  env: NodeJS.ProcessEnv,
  run: Run,
  dir: string,
  pid: number | null,
  log: (text: string) => void,
): HerdrTerminal | undefined {
  const target = herdrTarget(env)
  if (target?.kind !== 'terminal' || !target.appHome) return undefined
  const { appHome, terminal } = target

  return {
    start: async sessionId => {
      await writeClaim(dir, terminal, { sessionId, pid })
      await unpublishOthersHere(files, appHome, 'codex', terminal, sessionId)
    },
    end: async sessionId => {
      const ended = async () => {
        const claim = await readClaim(dir, terminal)
        const isHere = claim
          ? claim.sessionId === sessionId
          : await isPublishedHere(files.read, appHome, sessionId, 'codex', terminal)
        if (!isHere) return
        await writeClaim(dir, terminal, { sessionId: null, pid: null })
        await unpublishSession(files, appHome, sessionId)
        await herdrReporter(log)(run, async () => ({ target, tokens: CLEARED_TOKENS, session: null }))
      }
      await withLock(`${statePath(dir, sessionId)}.herdr`, ended, END_LOCK_WAIT_MS).catch(ended)
    },
  }
}
