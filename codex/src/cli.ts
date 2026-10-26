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
