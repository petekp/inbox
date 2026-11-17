import { existsSync } from 'node:fs'
import { mkdir, statfs } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildRoot, command, sdkRevision, sdkRoot } from './paths'

await mkdir(buildRoot, { recursive: true })
const available = await statfs(buildRoot)
const availableBytes = Number(available.bavail) * Number(available.bsize)
if (availableBytes < 75_000_000_000) throw new Error('Setup needs enough space for its build budget and 50 GB free.')
if (!existsSync(resolve(sdkRoot, '.git'))) {
  await command(['git', 'clone', '--filter=blob:none', '--no-checkout', 'https://github.com/expo/exact.git', sdkRoot])
  await command(['git', 'fetch', '--depth=1', 'origin', sdkRevision], { cwd: sdkRoot })
  await command(['git', 'checkout', '--detach', sdkRevision], { cwd: sdkRoot })
}
const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: sdkRoot })
if (revision.exitCode !== 0 || revision.stdout.toString().trim() !== sdkRevision)
  throw new Error('The Exact checkout differs from this prototype’s pinned revision.')
await command([
  'rustup',
  'toolchain',
  'install',
  '1.99.1',
  '--profile',
  'minimal',
  '--component',
  'rustfmt',
  '--component',
  'clippy',
  '--target',
  'wasm32-unknown-unknown',
])
await command(['rustup', 'target', 'add', '--toolchain', '1.99.1', 'aarch64-apple-ios-sim', 'aarch64-apple-ios'])
await command([process.execPath, 'install', '--frozen-lockfile'], { cwd: sdkRoot })
await command(['cargo', '+1.99.1', 'fetch', '--locked', '--manifest-path', 'Cargo.toml'], { cwd: sdkRoot })
await command(
  [
    'cargo',
    '+1.99.1',
    'run',
    '--locked',
    '--manifest-path',
    'vendor/ibex/crates/hermes-lean-sys-installer/Cargo.toml',
    '--',
    '--target',
    'aarch64-apple-ios-sim',
    '--target',
    'aarch64-apple-ios',
  ],
  { cwd: sdkRoot },
)
