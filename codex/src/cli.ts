import { existsSync } from 'node:fs'

import type { Run } from '../../hooks/gh'

/**
 * The codex binary the environment names, or null. The ChatGPT app sets `CODEX_APP_RUNTIME_CLI_PATH` on the
 * app-server it starts, and passes on `CODEX_CLI_PATH` only when the app itself was started with one. Hooks run with
 * the app-server's environment.
 */
export function namedCli(env: NodeJS.ProcessEnv): string | null {
  return env.CODEX_CLI_PATH || env.CODEX_APP_RUNTIME_CLI_PATH || null
}

/** Where the ChatGPT app keeps the copy of codex it bundles. */
export const BUNDLED_CLI = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'

const MAX_ANCESTORS = 8

/**
 * The codex binary that is `startPid` or one of its ancestors, by its full path, or null. A hook's own parent can be a
 * shell or a node process, and Codex 0.169 runs threads in a daemon that outlives the CLI that started it, so the
 * running codex can sit a few levels up.
 */
export async function ancestorCli(exec: Run, startPid: number): Promise<string | null> {
  let pid = startPid
  for (let level = 0; level < MAX_ANCESTORS && pid > 1; level++) {
    const r = await exec(['ps', '-o', 'ppid=,comm=', '-p', String(pid)], { cwd: '/', timeoutMs: 5000 }).catch(
      () => null,
    )
    const match = r && r.code === 0 ? /^\s*(\d+)\s+(.+?)\s*$/.exec(r.stdout) : null
    if (!match) return null
    if (/^\/(.*\/)?codex$/.test(match[2]!)) return match[2]!
    pid = Number(match[1])
  }

  return null
}

/**
 * The codex binary to run when the session saved none: the one the environment names, else a codex among this
 * process's ancestors, else the ChatGPT app's bundled copy when it exists, else the `codex` on PATH. Codex gives an MCP
 * server only the variables `.mcp.json` lists, so the server finds the app's binary as its parent. The app puts its
 * binary's folder last on PATH, so the `codex` on PATH can be an older install that the person's account rejects.
 */
export async function findCli(
  env: NodeJS.ProcessEnv,
  exec: Run,
  parentPid: number,
  hasBundled: () => boolean = () => existsSync(BUNDLED_CLI),
): Promise<string> {
  const named = namedCli(env)
  if (named) return named
  const running = await ancestorCli(exec, parentPid)
  if (running) return running

  return hasBundled() ? BUNDLED_CLI : 'codex'
}

/**
 * Whether a codex binary's `queue` takes `--resume`, read from its `queue --help` once per binary. From 0.166.0, a
 * thread unloads one minute after its last client leaves, and a message queued to an unloaded thread waits until
 * something resumes it; `--resume` resumes it. Older binaries reject the flag, as 0.166.0 rejects any option `queue`
 * does not take. A help run that fails answers no and is asked again next time.
 */
export function queueResumeCheck(exec: Run): (cli: string) => Promise<boolean> {
  const known = new Map<string, boolean>()
  return async cli => {
    const cached = known.get(cli)
    if (cached !== undefined) return cached
    const r = await exec([cli, 'queue', '--help'], { cwd: '/', timeoutMs: 5000 }).catch(() => null)
    if (r === null || r.code !== 0) return false
    const takesResume = /^\s*--resume\b/m.test(r.stdout)
    known.set(cli, takesResume)

    return takesResume
  }
}
