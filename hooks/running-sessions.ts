/** The engine calls that tell which Claude Code conversations run. */
type SessionsFolder = {
  /** Claude Code's configuration folder, or null when it is not known. */
  configFolder: () => Promise<string | null>
  /** The id of the conversation this process runs now. */
  sessionId: () => Promise<string>
  list: (folder: string) => Promise<{ name: string; kind: string }[]>
  read: (path: string) => Promise<string>
  run: (argv: string[], init: { timeoutMs: number }) => Promise<{ stdout: string }>
}

type SessionFile = { pid: number; sessionId: string }

const PID_FILE = /^\d+\.json$/
const PS_TIMEOUT_MS = 5_000

function sessionFileOf(text: string): SessionFile | null {
  try {
    const { pid, sessionId } = (JSON.parse(text) ?? {}) as Partial<SessionFile>
    return Number.isInteger(pid) && typeof sessionId === 'string' ? { pid: pid!, sessionId } : null
  } catch {
    return null
  }
}

/**
 * The ids of the conversations Claude Code runs under this configuration folder, or null when they cannot be told.
 * Each running Claude Code process keeps `sessions/<pid>.json` there, with its `pid` and the `sessionId` of the
 * conversation it runs now. A file whose process has exited is not running. When `ps` cannot tell, every file counts.
 * When no file names this process's conversation, the folder is not what this reads, so the answer is null.
 */
export async function runningSessions(f: SessionsFolder): Promise<ReadonlySet<string> | null> {
  const config = await f.configFolder()
  if (!config) return null
  const folder = `${config}/sessions`
  const names = (await f.list(folder)).filter(entry => entry.kind === 'file' && PID_FILE.test(entry.name))
  const read = await Promise.all(names.map(entry => f.read(`${folder}/${entry.name}`).then(sessionFileOf, () => null)))
  const files = read.filter((file): file is SessionFile => file !== null)
  const ownId = await f.sessionId()
  const own = files.find(file => file.sessionId === ownId)
  if (!own) return null
  const live = await livePids(
    f,
    files.map(file => file.pid),
  )
  // `ps` lists this process whenever its answer can be trusted.
  const isLiveKnown = live?.has(own.pid) ?? false

  return new Set(files.filter(file => !isLiveKnown || live!.has(file.pid)).map(file => file.sessionId))
}

/** The pids among `pids` whose process runs, by one `ps`. Null when `ps` cannot run. */
async function livePids(f: SessionsFolder, pids: number[]): Promise<ReadonlySet<number> | null> {
  try {
    const r = await f.run(['ps', '-p', pids.join(','), '-o', 'pid='], { timeoutMs: PS_TIMEOUT_MS })

    return new Set(
      r.stdout
        .split('\n')
        .map(Number)
        .filter(pid => pid > 0),
    )
  } catch {
    return null
  }
}
