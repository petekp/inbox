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
 * The Codex session that last started in a Herdr app terminal, as its SessionStart hook saved it, with the Codex
 * process it runs in when the hook found one. `isEnded` is whether its SessionEnd hook ran since.
 */
type TerminalClaim = { sessionId: string; pid: number | null; isEnded: boolean }

/**
 * The longest a SessionEnd hook waits for the session's Herdr lock. Codex gives a SessionEnd hook at most 3 seconds, and
 * the hook still has to start Node and clear the terminal's labels.
 */
const END_LOCK_WAIT_MS = 1500
/** The longest a hook waits for another session's start or end to finish with the terminal's claim. */
const CLAIM_LOCK_WAIT_MS = 1000

const claimPath = (dir: string, terminal: string) =>
  join(dir, 'herdr-terminals', `${encodeURIComponent(terminal)}.json`)

const isPid = (value: unknown): value is number | null => value === null || Number.isSafeInteger(value)

/** The terminal's claim, or null when no session's hook saved one, as before this build, or the file is not one. */
export async function readClaim(dir: string, terminal: string): Promise<TerminalClaim | null> {
  const text = await readFile(claimPath(dir, terminal), 'utf8').catch(() => null)
  try {
    const c = JSON.parse(text ?? 'null') as { sessionId?: unknown; pid?: unknown; isEnded?: unknown } | null
    const isClaim = typeof c?.sessionId === 'string' && isPid(c.pid) && typeof c.isEnded === 'boolean'

    return isClaim
      ? { sessionId: c.sessionId as string, pid: c.pid as number | null, isEnded: c.isEnded as boolean }
      : null
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

type IsRunning = (pid: number) => boolean

/** Whether the claim's session has left the terminal: its end ran, or the Codex process it ran in is gone. */
const hasLeft = (claim: TerminalClaim, isRunning: IsRunning): boolean =>
  claim.isEnded || (claim.pid !== null && !isRunning(claim.pid))

/**
 * Whether a process may publish and report `sessionId` to the terminal. The claim's session may until its end runs.
 * Another session may once the claim's session has left, as a Codex whose hooks do not run, or when no claim was saved.
 * A late write from a session that ended, or that a running session replaced, then never brings its file back.
 */
export const mayReport = (claim: TerminalClaim | null, sessionId: string, isRunning: IsRunning): boolean =>
  claim === null || (claim.sessionId === sessionId ? !claim.isEnded : hasLeft(claim, isRunning))

/**
 * Whether the terminal's server applies the presses for `sessionId`: it may report it, and when the claim names it, the
 * Codex process the claim names still runs.
 */
export const runsHere = (claim: TerminalClaim | null, sessionId: string, isRunning: IsRunning): boolean =>
  mayReport(claim, sessionId, isRunning) && !(claim?.sessionId === sessionId && hasLeft(claim, isRunning))

const files: SweepFiles = {
  list: folder => readdir(folder),
  read: path => readFile(path, 'utf8'),
  remove: path => rm(path, { force: true }),
  removeFolder: path => rm(path, { recursive: true, force: true }),
}

/** What a Codex session's hooks do to the Herdr app terminal it runs in, as it starts and as it ends. */
export type HerdrTerminal = { start: (sessionId: string) => Promise<void>; end: (sessionId: string) => Promise<void> }

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * The terminal calls of a session whose hooks run in the Herdr app terminal `env` names, or undefined outside one.
 * `pid` is the Codex process the session runs in, when the hook found it. Each logs its failure rather than throw, so
 * the rest of the hook still runs.
 *
 * `start` claims the terminal for the session, then removes the files of the other Codex sessions published from it,
 * which no longer run there. `end` runs only while the session holds the terminal, or published from it before any
 * claim: it marks the claim ended, removes the session's file and clears the terminal's labels. It runs under the
 * session's Herdr lock, as each report does, so no report of the session lands after it. Both change the claim under
 * the terminal's lock, so an end never marks ended a session that started there since.
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
  const withClaim = <T>(fn: () => Promise<T>) => withLock(`${claimPath(dir, terminal)}.lock`, fn, CLAIM_LOCK_WAIT_MS)
  const logged = (what: string, fn: () => Promise<void>) =>
    fn().catch((err: unknown) => log(`Herdr ${terminal}: the session's ${what} was not noted: ${message(err)}`))

  return {
    start: sessionId =>
      logged('start', async () => {
        await withClaim(() => writeClaim(dir, terminal, { sessionId, pid, isEnded: false }))
        await unpublishOthersHere(files, appHome, 'codex', terminal, sessionId)
      }),
    end: sessionId =>
      logged('end', async () => {
        const ended = async () => {
          const isHere = await withClaim(async () => {
            const claim = await readClaim(dir, terminal)
            if (!claim) return isPublishedHere(files.read, appHome, sessionId, 'codex', terminal)
            if (claim.sessionId !== sessionId || claim.isEnded) return false
            await writeClaim(dir, terminal, { ...claim, isEnded: true })
            return true
          })
          if (!isHere) return
          await unpublishSession(files, appHome, sessionId)
          await herdrReporter(log)(run, async () => ({ target, tokens: CLEARED_TOKENS, session: null }))
        }
        let isLocked = false
        const locked = () => ((isLocked = true), ended())
        await withLock(`${statePath(dir, sessionId)}.herdr`, locked, END_LOCK_WAIT_MS).catch((err: unknown) => {
          if (isLocked) throw err
          return ended()
        })
      }),
  }
}
