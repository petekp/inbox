// Reads repos' working trees with git, to tell when a check's result went
// stale: the shared reader in hooks/tree.ts, with Node's child_process and
// file system in place of the engine's.

import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'

import { changed, pruned } from '../../hooks/check-tracking'
import { readRepo } from '../../hooks/tree'
import type { TreeIO } from '../../hooks/tree'
import type { Checks, Snapshot } from '../../types'

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

/** The top folder of the git repo that holds `folder`; null outside git. */
export async function repoOf(exec: Run, folder: string): Promise<string | null> {
  const r = await exec(['git', 'rev-parse', '--show-toplevel'], { cwd: folder, timeoutMs: 5000 })

  return r.code === 0 ? r.stdout.trim() || null : null
}

async function kindOf(path: string): Promise<'file' | 'dir' | 'other'> {
  return stat(path).then(
    s => (s.isFile() ? 'file' : s.isDirectory() ? 'dir' : 'other'),
    () => 'other',
  )
}

/** How the shared working-tree reader runs commands and reads a path's kind here. */
function treeIO(exec: Run): TreeIO {
  return { run: (args, opts) => exec(args, opts).then(r => (r.code === 0 ? r.stdout : null)), kindOf }
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
    const reading = await readRepo(treeIO(exec), repo, snapshots[repo])
    if (!reading) continue
    const { snapshot, changes } = reading
    snapshots[repo] = snapshot
    if (changes !== null && changes.length === 0) continue
    checks = changed(checks, repo, changes, state.root)
  }

  return { checks, snapshots }
}
