import { execFile } from 'node:child_process'
import type { ExecFileException } from 'node:child_process'

import { TIMED_OUT_CODE, UNSTARTABLE_CODE } from '../../hooks/gh'
import type { Run } from '../../hooks/gh'

/** A `Run` that also writes `input` to the command's stdin. */
export type RunWithInput = (args: string[], opts: Parameters<Run>[1] & { input?: string }) => ReturnType<Run>

/** Runs a command, never throwing: a command still running at `timeoutMs` ends with code -2, and one that can't start with code -1. */
export const run: RunWithInput = (args, { cwd, timeoutMs, env, input }) =>
  new Promise(resolve => {
    const [file = '', ...rest] = args
    try {
      const child = execFile(
        file,
        rest,
        { cwd, env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' },
        (err, stdout, stderr) => {
          resolve({ code: exitCodeOf(err), stdout: String(stdout), stderr: String(stderr) })
        },
      )
      // A command that exits before reading all its input fails the write with EPIPE, which Node throws when nothing listens.
      child.stdin?.on('error', () => {})
      child.stdin?.end(input)
    } catch (err) {
      // execFile throws, instead of calling back, for an argument it rejects, such as one holding a NUL byte.
      resolve({ code: UNSTARTABLE_CODE, stdout: '', stderr: err instanceof Error ? err.message : String(err) })
    }
  })

/** execFile sets `killed` when the timeout ended the command. An output overflow sets a string `code` instead. */
function exitCodeOf(err: ExecFileException | null): number {
  if (!err) return 0
  if (err.killed) return TIMED_OUT_CODE

  return typeof err.code === 'number' ? err.code : UNSTARTABLE_CODE
}
