// Reads a repo's working tree with git, to tell when a check's result went
// stale. Each app passes in how it runs a command and reads a path's kind.

import { candidates, changedPaths, readChanged, readLsTree, sameSnapshot } from './git'
import type { Snapshot } from '../types'

// A dirtier tree is read only this far, so changes past it go unseen.
const SNAPSHOT_MAX = 2000

export type TreeIO = {
  /** Runs a command in `cwd`: its stdout when it exits 0, otherwise null. Never throws. */
  run: (args: string[], opts: { cwd: string; stdin?: string; timeoutMs: number }) => Promise<string | null>
  /** What a path leads to; 'other' when it is neither a file nor a folder, or cannot be read. */
  kindOf: (path: string) => Promise<'file' | 'dir' | 'other'>
}

/** Runs a git command that reads a repo's working tree; null when it fails. Optional locks are off, so it never takes the index lock from a commit. */
function git(io: TreeIO, repo: string, args: string[], stdin?: string): Promise<string | null> {
  return io.run(['git', '--no-optional-locks', ...args], {
    cwd: repo,
    timeoutMs: 15_000,
    ...(stdin === undefined ? {} : { stdin }),
  })
}

/** Each file's blob id, as a commit would store it. A folder, such as a submodule's, gets a mark of its own. */
async function hashFiles(io: TreeIO, repo: string, paths: string[]): Promise<string[] | null> {
  const out = await git(io, repo, ['hash-object', '--stdin-paths'], `${paths.join('\n')}\n`)
  if (out !== null) return out.split('\n')
  // One path git cannot hash fails the whole call, so hash the files alone.
  const kinds = await Promise.all(paths.map(p => io.kindOf(`${repo}/${p}`)))
  const files = paths.filter((_p, i) => kinds[i] === 'file')
  const hashed = files.length > 0 ? await git(io, repo, ['hash-object', '--stdin-paths'], `${files.join('\n')}\n`) : ''
  if (hashed === null) return null
  const ids = hashed.split('\n')

  return paths.map((p, i) => (kinds[i] === 'file' ? (ids[files.indexOf(p)] ?? '') : `${kinds[i]}`))
}

/** A repo's working tree content, read without writing to the repo. */
async function readSnapshot(io: TreeIO, repo: string): Promise<Snapshot | null> {
  const [out, headOut] = await Promise.all([
    git(io, repo, ['status', '--porcelain=v1', '-z', '-uall']),
    git(io, repo, ['rev-parse', '--verify', '-q', 'HEAD']),
  ])
  if (out === null) return null
  const head = headOut?.trim() || null
  const changes = readChanged(out).slice(0, SNAPSHOT_MAX)
  const dirty: Snapshot['dirty'] = {}
  for (const c of changes) if (c.isDeleted) dirty[c.path] = ''
  const present = changes.filter(c => !c.isDeleted && !c.path.includes('\n')).map(c => c.path)
  if (present.length > 0) {
    const ids = await hashFiles(io, repo, present)
    if (!ids) return null
    present.forEach((path, i) => {
      dirty[path] = ids[i] ?? ''
    })
  }

  return { head, dirty }
}

/** Each path's object id in a commit, for the paths it has. */
async function lsTree(io: TreeIO, repo: string, head: string, paths: string[]): Promise<Record<string, string> | null> {
  const ids: Record<string, string> = {}
  for (let i = 0; i < paths.length; i += 200) {
    const out = await git(io, repo, ['ls-tree', '-z', '--full-tree', head, '--', ...paths.slice(i, i + 200)])
    if (out === null) return null
    Object.assign(ids, readLsTree(out))
  }

  return ids
}

/** The paths whose content differs between two snapshots of a repo, or null when git could not tell. A commit only moves content into HEAD, so it changes nothing. */
async function contentChanges(io: TreeIO, repo: string, a: Snapshot, b: Snapshot): Promise<string[] | null> {
  if (a.head !== b.head && !b.head) return null
  let committed: string[] = []
  if (a.head && b.head && a.head !== b.head) {
    const out = await git(io, repo, ['diff', '--name-only', '-z', '--no-renames', a.head, b.head])
    if (out === null) return null
    committed = out.split('\0').filter(Boolean)
  }
  const paths = candidates(a, b, committed)
  if (paths.length === 0) return []
  const none = Promise.resolve<Record<string, string>>({})
  const reading = a.head ? lsTree(io, repo, a.head, paths) : none
  const [before, after] = await Promise.all([
    reading,
    b.head === a.head ? reading : b.head ? lsTree(io, repo, b.head, paths) : none,
  ])
  if (!before || !after) return null

  return changedPaths(a, b, paths, before, after)
}

/**
 * Reads a repo's working tree and compares it with its last reading. Returns
 * null when it could not be read or did not change. Otherwise returns the new
 * reading and the paths whose content changed: none on a first reading, and
 * null when git could not tell, which counts as a change to code.
 */
export async function readRepo(
  io: TreeIO,
  repo: string,
  last: Snapshot | undefined,
): Promise<{ snapshot: Snapshot; changes: string[] | null } | null> {
  const snapshot = await readSnapshot(io, repo)
  if (!snapshot || (last && sameSnapshot(last, snapshot))) return null

  return { snapshot, changes: last ? await contentChanges(io, repo, last, snapshot) : [] }
}
