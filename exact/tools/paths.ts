import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export const appRoot = resolve(import.meta.dir, '..')
export const repoRoot = resolve(appRoot, '..')
export const buildRoot = resolve(repoRoot, '.derived-data')
export const sdkRoot = resolve(buildRoot, 'exact-framework')
export const runtimeRoot = resolve(process.env.INBOX_RUNTIME_ROOT ?? resolve(repoRoot, '.scratch/exact-prototype'))
export const sdkRevision = 'bb6e5a8c9d9eef3e9f28a534ab06451339d15d63'

function buildEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${resolve(buildRoot, 'exact-cargo/bin')}:${process.env.PATH ?? ''}`,
    EXACT_FEEDBACK: '0',
    EXACT_TOOLS_ORIGIN: 'none',
    EXACT_SHOW_SIMULATOR: '0',
    ...(existsSync(resolve(buildRoot, 'exact-cargo/bin/cargo'))
      ? { CARGO_HOME: resolve(buildRoot, 'exact-cargo') }
      : {}),
    ...(existsSync(resolve(buildRoot, 'exact-rustup/toolchains'))
      ? { RUSTUP_HOME: resolve(buildRoot, 'exact-rustup') }
      : {}),
    CARGO_TARGET_DIR: resolve(buildRoot, 'exact-target'),
    BUN_INSTALL_CACHE_DIR: resolve(buildRoot, 'exact-bun-cache'),
    CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? '2',
    CHROME: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  }
}

export async function command(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const child = Bun.spawn(args, {
    cwd: options.cwd ?? appRoot,
    env: options.env ?? buildEnvironment(),
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const code = await child.exited
  if (code !== 0) throw new Error(`${args[0]} ${args[1] ?? ''} exited ${code}`)
}
