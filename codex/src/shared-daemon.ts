import type { Run } from '../../hooks/gh'

const PS_TIMEOUT_MS = 5000

const INIT_PID = 1

/** How many parent processes to look through. A hook or server runs a few levels under Codex's app server. */
const MAX_ANCESTORS = 6

/**
 * Whether a command is the app server a Codex CLI starts as a daemon for every CLI, which listens on a Unix socket and
 * runs managed. The ChatGPT app's own app server and a `--no-daemon` CLI's run without those options.
 */
const isSharedDaemon = (command: string) =>
  /(^|\/)codex\s.*\bapp-server\b/.test(command) && /--managed-daemon\b|--listen[ =]unix:\/\//.test(command)

/** Whether `pid` runs under that daemon, whichever process started it. */
async function isUnderSharedDaemon(pid: number, run: Run): Promise<boolean> {
  let current = pid
  for (let level = 0; level < MAX_ANCESTORS && current > INIT_PID; level++) {
    const r = await run(['ps', '-o', 'ppid=,command=', '-p', String(current)], { cwd: '/', timeoutMs: PS_TIMEOUT_MS })
    const match = r.code === 0 ? /^\s*(\d+)\s+(.*)$/.exec(r.stdout.trim()) : null
    if (!match) return false
    const [, parent, command] = match
    if (isSharedDaemon(command ?? '')) return true
    current = Number(parent)
  }

  return false
}

/**
 * Removes the Herdr pane and terminal from `env` when this process runs under the shared Codex daemon. The ones it
 * names belong to the CLI that started the daemon, not to the thread's, and nothing else tells which terminal a thread
 * was typed in. The process then reports to no terminal, as it does outside Herdr, so a thread never publishes under
 * another thread's terminal. A CLI started with `codex --no-daemon` has its own app server and keeps its terminal. Logs
 * why when it removes them.
 */
export async function withoutSharedTerminal(
  env: NodeJS.ProcessEnv,
  run: Run,
  pid: number,
  log: (text: string) => void,
): Promise<void> {
  const where = env.HERDR_PANE_ID ?? env.HC_TERMINAL_ID
  if (!where) return
  if (!(await isUnderSharedDaemon(pid, run).catch(() => false))) return
  log(
    `Herdr ${where} ignored: Codex runs this thread in a daemon shared by every Codex CLI, so ${where} is where the daemon started, not necessarily where this thread runs. The inbox reports to no terminal.`,
  )
  delete env.HERDR_PANE_ID
  delete env.HC_TERMINAL_ID
}
