import { execFile } from 'node:child_process'

import type { Run } from '../../hooks/gh'

/** A `Run` that also writes `input` to the command's stdin. */
export type RunWithInput = (args: string[], opts: Parameters<Run>[1] & { input?: string }) => ReturnType<Run>

/** Runs a command, never throwing: a command that can't start ends with code -1. */
export const run: RunWithInput = (args, { cwd, timeoutMs, env, input }) =>
  new Promise(resolve => {
    const [file = '', ...rest] = args
    try {
      const child = execFile(
        file,
        rest,
        { cwd, env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
        (err, stdout, stderr) => {
          const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0
          resolve({ code, stdout: String(stdout), stderr: String(stderr) })
        },
      )
      // A command that exits before reading all its input fails the write with EPIPE, which Node throws when nothing listens.
      child.stdin?.on('error', () => {})
      child.stdin?.end(input)
    } catch (err) {
      // execFile throws before it starts a command it cannot run, as for an argument holding a NUL byte.
      resolve({ code: -1, stdout: '', stderr: err instanceof Error ? err.message : String(err) })
    }
  })
