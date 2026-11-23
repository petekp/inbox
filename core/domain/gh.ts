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
 * Where `folder` is in Git now. `branch` is null when git names none, as outside a repository or on a detached HEAD.
 * `repo` is the GitHub repository gh would pick among the remotes, as "owner/name": `upstream`, then `github`, then
 * `origin`, then any other. It is null when no remote is on GitHub, and undefined when git could not list them.
 */
export type GitPlace = { branch: string | null; repo: string | null | undefined }

const REMOTE_ORDER = ['upstream', 'github', 'origin']

export async function gitPlaceIn(run: Run, folder: string): Promise<GitPlace> {
  const opts = { cwd: folder, timeoutMs: GIT_TIMEOUT_MS }
  const [branch, remotes] = await Promise.all([
    run(['git', 'branch', '--show-current'], opts),
    run(['git', 'remote', '-v'], opts),
  ])

  return {
    branch: branch.code === 0 ? branch.stdout.trim() || null : null,
    repo: remotes.code === 0 ? githubRepoIn(remotes.stdout) : undefined,
  }
}

/** The GitHub repository of the first remote in `REMOTE_ORDER` that is on GitHub, from `git remote -v`. */
function githubRepoIn(listed: string): string | null {
  const onGithub = listed.split('\n').flatMap(line => {
    const [name = '', url = ''] = line.split(/\s+/)
    const repo = githubRepoOf(url)
    return repo ? [{ name, repo }] : []
  })
  const rank = (name: string) => (REMOTE_ORDER.includes(name) ? REMOTE_ORDER.indexOf(name) : REMOTE_ORDER.length)

  return onGithub.toSorted((a, b) => rank(a.name) - rank(b.name))[0]?.repo ?? null
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
