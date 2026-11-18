import type { Run } from '../../hooks/gh'
import { PRESS_LABEL } from '../../hooks/herdr-labels'
import type { PathProbe } from '../../hooks/open-targets'
import { claimedPath } from './press-queue'
import type { QueueIo } from './press-queue'
import type { HereIo } from './run-here'

type Ran = { code: number; stdout: string; stderr: string }

/** The calls of the Herdr app the look's files and commands go through. Only `main.ts` imports them. */
type HerdrCalls = {
  exec: (command: string, args: string[], options: { cwd: string; timeout: number }) => Promise<Ran>
  hc: (args: string[]) => Promise<Ran>
  readTextFile: (path: string) => Promise<string | null>
  writeTextFile: (path: string, text: string, expected: null) => Promise<null>
  home: () => string
}

/** How the look runs commands, probes paths and writes its press files, through Herdr's `calls`. */
export function herdrIo({ exec, hc, readTextFile, writeTextFile, home }: HerdrCalls) {
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

  /** What a press's opens and copies run with: the session's project folder and the clipboard of the task `cx`. */
  const hereIo = (projectFolder: string | null, cx: { write_to_clipboard(text: string): void }): HereIo => ({
    run: herdrRun,
    probe,
    home: home(),
    projectFolder,
    copy: text => cx.write_to_clipboard(text),
  })

  return { queueIo, hereIo }
}
