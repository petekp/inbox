// Runs a command with Node's child_process, for `codex queue` and `codex exec`.

import { execFile } from 'node:child_process'

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
