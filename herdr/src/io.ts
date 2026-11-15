import type { Run } from '../../hooks/gh'
import type { PathProbe } from '../../hooks/open-targets'
import { PRESS_LABEL } from './press-file'
import { claimedPath } from './press-queue'
import type { QueueIo } from './press-queue'

type Ran = { code: number; stdout: string; stderr: string }

/** The calls of the Herdr app the look's files and commands go through. Only `main.ts` imports them. */
type HerdrCalls = {
  exec: (command: string, args: string[], options: { cwd: string; timeout: number }) => Promise<Ran>
  hc: (args: string[]) => Promise<Ran>
  readTextFile: (path: string) => Promise<string | null>
  writeTextFile: (path: string, text: string, expected: null) => Promise<null>
}

/** How the look runs commands, probes paths and writes its press files, through Herdr's `calls`. */
export function herdrIo({ exec, hc, readTextFile, writeTextFile }: HerdrCalls) {
  const herdrRun: Run = (args, opts) =>
    exec(args[0] ?? '', args.slice(1), { cwd: opts.cwd, timeout: opts.timeoutMs }).catch((e: unknown) => ({
      code: 127,
      stdout: '',
      stderr: String(e),
    }))

  const isTrue = (args: string[]) => herdrRun(['test', ...args], { cwd: '/', timeoutMs: 5_000 }).then(r => r.code === 0)

  const probe: PathProbe = {
    async stat(path) {
      if (!(await isTrue(['-e', path]))) return null
      const isFile = await isTrue(['-f', path])
      return { isFile: () => isFile }
    },
    isExecutable: path => isTrue(['-x', path]),
  }

  const queueIo: QueueIo = {
    now: () => Date.now(),
    random: () => Math.random(),
    write: (path, text) =>
      writeTextFile(path, text, null).then(
        () => null,
        (e: unknown) => String(e),
      ),
    isGone: async path => (await readTextFile(path).catch(() => null)) === null,
    async claim(path) {
      const moved = await herdrRun(['mv', path, claimedPath(path)], { cwd: '/', timeoutMs: 5_000 })
      if (moved.code !== 0) return false
      await herdrRun(['rm', '-f', claimedPath(path)], { cwd: '/', timeoutMs: 5_000 })
      return true
    },
    async wake(terminal, pressId) {
      await hc(['label', terminal, `${PRESS_LABEL}=${pressId}`]).catch(() => null)
    },
  }

  return { herdrRun, probe, queueIo }
}
