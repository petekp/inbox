import type { Run } from './gh'

export function baseName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}

function localPath(raw: string, root: string, home: string): string {
  if (raw.startsWith('~/')) return home + raw.slice(1)
  if (raw.startsWith('/')) return raw

  return `${root.replace(/\/$/, '')}/${raw.replace(/^\.\//, '')}`
}

// Files macOS `open` would run or install instead of showing.
const LAUNCHES =
  /\.(app|command|tool|terminal|workflow|scpt|scptd|applescript|pkg|mpkg|dmg|webloc|inetloc|fileloc|prefpane|kext)$/i

/**
 * The commands that open a local path. A folder, an executable, or anything
 * `open` would launch is shown in Finder instead. A file opens in the app
 * macOS assigns to its type, and `fallback` opens one with no assigned app
 * in the default text editor.
 */
function openCommands(
  path: string,
  isFile: boolean,
  isExecutable: boolean,
): { argv: string[]; fallback: string[] | null } {
  if (!isFile || isExecutable || LAUNCHES.test(path)) return { argv: ['open', '-R', path], fallback: null }

  return { argv: ['open', path], fallback: ['open', '-t', path] }
}

/** What a host can ask of the file system: a path's stat, or null when it is gone, and whether it can be run. */
export type PathProbe = {
  stat(path: string): Promise<{ isFile(): boolean } | null>
  isExecutable(path: string): Promise<boolean>
}

const OPEN_TIMEOUT_MS = 10_000

/** Opens a link, or a path as `openCommands` decides. Returns why it could not, or null. */
export async function openTarget(
  run: Run,
  probe: PathProbe,
  target: string,
  root: string,
  home: string,
): Promise<string | null> {
  const open = (argv: string[]) => run(argv, { cwd: '/', timeoutMs: OPEN_TIMEOUT_MS })
  const failure = (r: { code: number; stderr: string }) => r.stderr.trim() || `open exited ${r.code}`
  if (/^https?:\/\//.test(target)) {
    const r = await open(['open', target])
    return r.code === 0 ? null : failure(r)
  }
  const path = localPath(target, root || '/', home)
  const info = await probe.stat(path)
  if (!info) return 'it no longer exists'
  const isFile = info.isFile()
  const isExecutable = isFile && (await probe.isExecutable(path))
  const { argv, fallback } = openCommands(path, isFile, isExecutable)
  const r = await open(argv)
  const retry = r.code !== 0 && fallback ? await open(fallback) : r

  return retry.code === 0 ? null : failure(retry)
}
