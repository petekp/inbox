import type { Run } from '../../hooks/gh'

const PS_TIMEOUT_MS = 5000

/** How many parent processes to look through. A hook or server runs a few levels under Codex's app server. */
const MAX_ANCESTORS = 6

const INIT_PID = 1

const isAppServer = (command: string) => /(^|\/)codex\s.*\bapp-server\b/.test(command)

/**
 * Whether `pid` runs under a Codex app server that no terminal owns: one whose parent is `launchd`, which is what a
 * daemon the first Codex CLI started becomes once that CLI exits. Every thread of every CLI then runs in that one
 * process, whichever terminal it was typed in.
 */
async function isUnderSharedDaemon(pid: number, run: Run): Promise<boolean> {
  let current = pid
  for (let level = 0; level < MAX_ANCESTORS && current > INIT_PID; level++) {
    const r = await run(['ps', '-o', 'ppid=,command=', '-p', String(current)], { cwd: '/', timeoutMs: PS_TIMEOUT_MS })
    const match = r.code === 0 ? /^\s*(\d+)\s+(.*)$/.exec(r.stdout.trim()) : null
    if (!match) return false
    const [, parent, command] = match
    if (isAppServer(command ?? '') && Number(parent) === INIT_PID) return true
    current = Number(parent)
  }

  return false
}

/**
 * Removes the Herdr terminal from `env` when this process runs under a shared Codex daemon, since the terminal it
 * names is the one that started the daemon, not the one the thread was typed in. The process then reports to no
 * terminal, as it does outside Herdr, so a thread never publishes under another thread's terminal. A terminal started
 * with `codex --no-daemon` has its own app server and keeps its terminal. Logs why when it removes the terminal.
 */
export async function withoutSharedTerminal(
  env: NodeJS.ProcessEnv,
  run: Run,
  pid: number,
  log: (text: string) => void,
): Promise<void> {
  if (!env.HC_TERMINAL_ID || env.HERDR_PANE_ID) return
  if (!(await isUnderSharedDaemon(pid, run).catch(() => false))) return
  log(
    `Herdr terminal ${env.HC_TERMINAL_ID} ignored: Codex runs this thread in a daemon shared by every Codex CLI, so the terminal is the one that started it. Start Codex with codex --no-daemon, as Herdr does.`,
  )
  delete env.HC_TERMINAL_ID
}
