import type { GhRun } from './pr-tab'

/** Runs a command and never throws: a command that cannot start, times out, is killed or overflows its output ends with code -1. */
export type Run = (
  args: string[],
  opts: { cwd: string; timeoutMs: number; env?: Record<string, string> },
) => Promise<{ code: number; stdout: string; stderr: string }>

const CANDIDATES = ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh']

const GH_TIMEOUT_MS = 20_000

export const UNSTARTABLE_CODE = -1

const GIT_TIMEOUT_MS = 5000

/** The branch `folder` is on now. Null when git names none, as outside a repository or on a detached HEAD. */
export async function branchIn(run: Run, folder: string): Promise<string | null> {
  const r = await run(['git', 'branch', '--show-current'], { cwd: folder, timeoutMs: GIT_TIMEOUT_MS })

  return r.code === 0 ? r.stdout.trim() || null : null
}

/**
 * Finds the first gh that starts: `exec` ends with code -1 for a command it cannot start. The one found is kept
 * until `forget` is called; while none starts, each call looks again, since the person may install gh without
 * restarting the host.
 */
export function ghFinder(exec: Run): { find: () => Promise<string | null>; forget: () => void } {
  let found: string | null = null

  return {
    find: async () => {
      if (found) return found
      for (const candidate of CANDIDATES) {
        const r = await exec([candidate, '--version'], { cwd: '/', timeoutMs: 5000 })
        if (r.code !== UNSTARTABLE_CODE) {
          found = candidate
          return found
        }
      }

      return null
    },
    forget: () => {
      found = null
    },
  }
}

/**
 * `onUnstartable` is called when a run ends with code -1, which also covers a timeout kill and an output overflow.
 */
export function ghIn(exec: Run, bin: string, cwd: string, onUnstartable: () => void): GhRun {
  return async args => {
    const r = await exec([bin, ...args], { cwd: cwd || '/', timeoutMs: GH_TIMEOUT_MS })
    if (r.code === UNSTARTABLE_CODE) onUnstartable()

    return { exitCode: r.code, stdout: r.stdout, stderr: r.stderr }
  }
}
