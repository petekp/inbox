import type { Run } from '../../hooks/gh'

/**
 * The codex binary the environment names, or null. The ChatGPT app sets `CODEX_APP_RUNTIME_CLI_PATH` on the
 * app-server it starts, and passes on `CODEX_CLI_PATH` only when the app itself was started with one. Hooks run with
 * the app-server's environment.
 */
export function namedCli(env: NodeJS.ProcessEnv): string | null {
  return env.CODEX_CLI_PATH || env.CODEX_APP_RUNTIME_CLI_PATH || null
}

/**
 * The codex binary to run when the session saved none: the one the environment names, else this process's parent when
 * it is a codex, else the `codex` on PATH. Codex gives an MCP server only the variables `.mcp.json` lists, so the
 * server finds the app's binary as its parent. The app puts its binary's folder last on PATH, so the `codex` on PATH
 * can be an older install that the person's account rejects.
 */
export async function findCli(env: NodeJS.ProcessEnv, exec: Run, parentPid: number): Promise<string> {
  const named = namedCli(env)
  if (named) return named
  const r = await exec(['ps', '-o', 'comm=', '-p', String(parentPid)], { cwd: '/', timeoutMs: 5000 })
  const parent = r.stdout.trim()

  return r.code === 0 && /(^|\/)codex$/.test(parent) ? parent : 'codex'
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
