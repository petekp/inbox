import type { GhRun } from './pr-fetch'

/**
 * Runs a command and never throws: a command still running at `timeoutMs` ends with code -2, and one that cannot
 * start, is killed or overflows its output ends with code -1. A runner that can tell also gives the `signal` that
 * ended the command, and the `errorCode` of a command that could not start or overflowed, such as `ENOENT`.
 */
export type Run = (
  args: string[],
  opts: { cwd: string; timeoutMs: number; env?: Record<string, string> },
) => Promise<{ code: number; stdout: string; stderr: string; signal?: string; errorCode?: string }>

const CANDIDATES = ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh']

export const GH_TIMEOUT_MS = 20_000

export const UNSTARTABLE_CODE = -1

export const TIMED_OUT_CODE = -2

const GIT_TIMEOUT_MS = 5000

/**
 * Where `folder` is in Git now: its branch, null when git names none, as outside a repository or on a detached HEAD,
 * and the GitHub repository of its `origin` remote as "owner/name", null when it has none on GitHub.
 */
export type GitPlace = { branch: string | null; repo: string | null }

export async function gitPlaceIn(run: Run, folder: string): Promise<GitPlace> {
  const opts = { cwd: folder, timeoutMs: GIT_TIMEOUT_MS }
  const [branch, remote] = await Promise.all([
    run(['git', 'branch', '--show-current'], opts),
    run(['git', 'remote', 'get-url', 'origin'], opts),
  ])

  return {
    branch: branch.code === 0 ? branch.stdout.trim() || null : null,
    repo: remote.code === 0 ? githubRepoOf(remote.stdout.trim()) : null,
  }
}

/** The forms of a GitHub remote's URL that git accepts: https, ssh and scp-like, each with or without ".git". */
const GITHUB_REMOTE =
  /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|ssh:\/\/git@github\.com(?::\d+)?\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/

/** "owner/name" of a GitHub remote's URL, or null for a remote elsewhere. */
export function githubRepoOf(url: string): string | null {
  return GITHUB_REMOTE.exec(url)?.[1] ?? null
}

/**
 * Finds the first gh that starts: `exec` ends with code -1 for a command it cannot start, and a gh that timed out
 * started. The one found is kept until `forget` is called; while none starts, each call looks again, since the
 * person may install gh without restarting the host.
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
 * `onUnstartable` is called when a run ends with code -1, which also covers an output overflow. A run that timed out
 * started, so it does not call it.
 */
export function ghIn(exec: Run, bin: string, cwd: string, onUnstartable: () => void): GhRun {
  return async args => {
    const r = await exec([bin, ...args], { cwd: cwd || '/', timeoutMs: GH_TIMEOUT_MS })
    if (r.code === UNSTARTABLE_CODE) onUnstartable()

    return { exitCode: r.code, stdout: r.stdout, stderr: r.stderr }
  }
}
