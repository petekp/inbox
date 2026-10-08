// Reads repos' working trees with git, to tell when a check's result went
// stale. The same steps as the mod's refreshTree in hooks/register.tsx, with
// Node's child_process in place of the engine's.

import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'

import { changed, pruned } from '../../hooks/check-tracking'
import { candidates, changedPaths, readChanged, readLsTree, sameSnapshot } from '../../hooks/git'
import type { Checks, Snapshot } from '../../types'

// A dirtier tree is read only this far, so changes past it go unseen.
const SNAPSHOT_MAX = 2000

export type Run = (
  args: string[],
  opts: { cwd: string; stdin?: string; timeoutMs: number },
) => Promise<{ code: number; stdout: string; stderr: string }>

/** Runs a command, never throwing: a command that can't start ends with code -1. */
export const run: Run = (args, { cwd, stdin, timeoutMs }) =>
  new Promise(resolve => {
    const [file = '', ...rest] = args
    const child = execFile(
      file,
      rest,
      { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0
        resolve({ code, stdout: String(stdout), stderr: String(stderr) })
      },
    )
    if (stdin !== undefined) child.stdin?.end(stdin)
    else child.stdin?.end()
  })

/** Runs a git command that reads a repo's working tree; null when it fails. Optional locks are off, so it never takes the index lock from a commit. */
async function git(exec: Run, repo: string, args: string[], stdin?: string): Promise<string | null> {
  const r = await exec(['git', '--no-optional-locks', ...args], {
    cwd: repo,
    timeoutMs: 15_000,
    ...(stdin === undefined ? {} : { stdin }),
  })

  return r.code === 0 ? r.stdout : null
}

/** The top folder of the git repo that holds `folder`; null outside git. */
export async function repoOf(exec: Run, folder: string): Promise<string | null> {
  const r = await exec(['git', 'rev-parse', '--show-toplevel'], { cwd: folder, timeoutMs: 5000 })

  return r.code === 0 ? r.stdout.trim() || null : null
}

async function kindOf(path: string): Promise<string> {
  return stat(path).then(
    s => (s.isFile() ? 'file' : s.isDirectory() ? 'directory' : 'other'),
    () => 'other',
  )
}

/** Each file's blob id, as a commit would store it. A folder, such as a submodule's, gets a mark of its own. */
async function hashFiles(exec: Run, repo: string, paths: string[]): Promise<string[] | null> {
  const out = await git(exec, repo, ['hash-object', '--stdin-paths'], `${paths.join('\n')}\n`)
  if (out !== null) return out.split('\n')
  // One path git cannot hash fails the whole call, so hash the files alone.
  const kinds = await Promise.all(paths.map(p => kindOf(`${repo}/${p}`)))
  const files = paths.filter((_p, i) => kinds[i] === 'file')
  const hashed =
    files.length > 0 ? await git(exec, repo, ['hash-object', '--stdin-paths'], `${files.join('\n')}\n`) : ''
  if (hashed === null) return null
  const ids = hashed.split('\n')

  return paths.map((p, i) => (kinds[i] === 'file' ? (ids[files.indexOf(p)] ?? '') : `${kinds[i]}`))
}

/** A repo's working tree content, read without writing to the repo. */
export async function readSnapshot(exec: Run, repo: string): Promise<Snapshot | null> {
  const [out, headOut] = await Promise.all([
    git(exec, repo, ['status', '--porcelain=v1', '-z', '-uall']),
    git(exec, repo, ['rev-parse', '--verify', '-q', 'HEAD']),
  ])
  if (out === null) return null
  const head = headOut?.trim() || null
  const changes = readChanged(out).slice(0, SNAPSHOT_MAX)
  const dirty: Snapshot['dirty'] = {}
  for (const c of changes) if (c.isDeleted) dirty[c.path] = ''
  const present = changes.filter(c => !c.isDeleted && !c.path.includes('\n')).map(c => c.path)
  if (present.length > 0) {
    const ids = await hashFiles(exec, repo, present)
    if (!ids) return null
    present.forEach((path, i) => {
      dirty[path] = ids[i] ?? ''
    })
  }

  return { head, dirty }
}

/** Each path's object id in a commit, for the paths it has. */
async function lsTree(exec: Run, repo: string, head: string, paths: string[]): Promise<Record<string, string> | null> {
  const ids: Record<string, string> = {}
  for (let i = 0; i < paths.length; i += 200) {
    const out = await git(exec, repo, ['ls-tree', '-z', '--full-tree', head, '--', ...paths.slice(i, i + 200)])
    if (out === null) return null
    Object.assign(ids, readLsTree(out))
  }

  return ids
}

/** The paths whose content differs between two snapshots of a repo, or null when git could not tell. A commit only moves content into HEAD, so it changes nothing. */
async function contentChanges(exec: Run, repo: string, a: Snapshot, b: Snapshot): Promise<string[] | null> {
  if (a.head !== b.head && !b.head) return null
  let committed: string[] = []
  if (a.head && b.head && a.head !== b.head) {
    const out = await git(exec, repo, ['diff', '--name-only', '-z', '--no-renames', a.head, b.head])
    if (out === null) return null
    committed = out.split('\0').filter(Boolean)
  }
  const paths = candidates(a, b, committed)
  if (paths.length === 0) return []
  const none = Promise.resolve<Record<string, string>>({})
  const reading = a.head ? lsTree(exec, repo, a.head, paths) : none
  const [before, after] = await Promise.all([
    reading,
    b.head === a.head ? reading : b.head ? lsTree(exec, repo, b.head, paths) : none,
  ])
  if (!before || !after) return null

  return changedPaths(a, b, paths, before, after)
}

/**
 * Reads the working tree of each repo in `repos`, or of each repo a recorded
 * check ran in, after dropping the checks whose folder is gone. A repo whose
 * content differs from its last reading makes the checks that ran there
 * stale. Returns the new checks and readings; git runs outside any lock.
 */
export async function refreshTree(
  exec: Run,
  state: { checks: Checks; snapshots: Record<string, Snapshot>; root: string },
  repos?: string[],
): Promise<{ checks: Checks; snapshots: Record<string, Snapshot> }> {
  const folders = [...new Set(state.checks.results.flatMap(c => (c.folder ? [c.folder] : [])))]
  const found = await Promise.all(folders.map(f => kindOf(f).then(k => k !== 'other')))
  const gone = new Set(folders.filter((_f, i) => !found[i]))
  let checks = gone.size > 0 ? pruned(state.checks, gone) : state.checks
  const snapshots = { ...state.snapshots }
  const checked = repos ?? checks.results.flatMap(c => (c.repo ? [c.repo] : []))
  for (const repo of new Set(checked)) {
    const snapshot = await readSnapshot(exec, repo)
    const last = snapshots[repo]
    if (!snapshot || (last && sameSnapshot(last, snapshot))) continue
    // A path list git could not read counts as a change to code.
    const changes = last ? await contentChanges(exec, repo, last, snapshot) : []
    snapshots[repo] = snapshot
    if (changes !== null && changes.length === 0) continue
    checks = changed(checks, repo, changes, state.root)
  }

  return { checks, snapshots }
}
