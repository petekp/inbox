// The hooks' entry point, bundled as dist/hook.mjs.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { detachedUpdate, handleHook } from './hook'
import type { HookInput } from './hook'
import { dataDir } from './state'

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const dist = dirname(fileURLToPath(import.meta.url))
  const dir = dataDir(process.env, dirname(dist))
  const out = await handleHook(JSON.parse(raw) as HookInput, {
    dir,
    env: process.env,
    now: Date.now,
    startUpdate: detachedUpdate(dir, process.env, join(dist, 'update.mjs')),
  })
  if (out) process.stdout.write(JSON.stringify(out))
}

main().catch(() => process.exit(0))
