import type { Session } from '../types'
import { branchIn, GH_TIMEOUT_MS, TIMED_OUT_CODE, UNSTARTABLE_CODE, type Run } from './gh'
import type { PathProbe } from './open-targets'
import { placed } from './session-turns'

/** The engine calls the mod's commands use: `$.session.root()`, `$.fs.exists`, `$.fs.stat`, `$.process.run` and `$.clock.now()`. */
export type CommandCalls = {
  root: () => Promise<string>
  exists: (path: string) => Promise<boolean>
  stat: (path: string) => Promise<{ kind: string }>
  run: (
    argv: string[],
    init?: { cwd?: string; timeoutMs?: number; env?: Record<string, string> },
  ) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  now: () => Promise<number>
}

/**
 * The folder the session runs in now, or null when no folder of that name exists. `$.session.root()` follows a move
 * after the start, as when the Claude app moves a new session out of the warm-spare folder it started in and then
 * deletes that folder. A command started in a folder that is gone fails as if the program were missing.
 */
export async function sessionFolder(calls: CommandCalls): Promise<string | null> {
  const root = await calls.root().catch(() => '')
  if (!root) return null

  return (await isFolder(calls, root)) ? root : null
}

function isFolder(calls: CommandCalls, path: string): Promise<boolean> {
  return calls.stat(path).then(
    info => info.kind === 'dir',
    () => false,
  )
}

/**
 * The change that saves `folder` and its branch as the session's place. A place keeps the folder it first saved,
 * unless the session moved away from that folder (`left` is the folder it was last seen in) or that folder is gone.
 */
export async function placeChange<S extends Session>(
  calls: CommandCalls,
  saved: string | null,
  left: string,
  folder: string,
): Promise<(s: S) => S> {
  const isOtherFolder = saved !== null && saved !== folder
  const isMoved = isOtherFolder && (saved === left || !(await isFolder(calls, saved)))
  const branch = await branchIn(runOf(calls), folder)

  return s => placed(isMoved && s.place?.folder === saved ? { ...s, place: null } : s, folder, branch)
}

/**
 * `$.process.run` as the shared `Run`. It rejects when the command cannot start, and also when it is still running at
 * the timeout, with no code to tell them apart. A rejection that comes `timeoutMs` or more after the call is the
 * timeout's; one that comes sooner is a command that could not start.
 */
export function runOf(calls: CommandCalls): Run {
  return async (args, { cwd, timeoutMs, env }) => {
    const startedAt = await calls.now()
    try {
      const r = await calls.run(args, { cwd, timeoutMs, env })

      return { code: r.exitCode, stdout: r.stdout, stderr: r.stderr }
    } catch (err) {
      const isTimedOut = (await calls.now()) - startedAt >= timeoutMs

      return {
        code: isTimedOut ? TIMED_OUT_CODE : UNSTARTABLE_CODE,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

/** Whether gh cannot start. It needs no folder, so it runs in `/`. */
export async function isGhUnstartable(calls: CommandCalls): Promise<boolean> {
  const r = await runOf(calls)(['gh', '--version'], { cwd: '/', timeoutMs: GH_TIMEOUT_MS })

  return r.code === UNSTARTABLE_CODE
}

export function pathProbe(calls: CommandCalls): PathProbe {
  return {
    stat: async path => {
      if (!(await calls.exists(path))) return null
      const stat = await calls.stat(path)
      return { isFile: () => stat.kind === 'file' }
    },
    isExecutable: async path => (await calls.run(['test', '-x', path])).exitCode === 0,
  }
}
