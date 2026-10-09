// The per-reply update's entry point, bundled as dist/update.mjs. The Stop
// hook starts it with the session id and INBOX_DATA set.

import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dataDir, readState } from './state'
import { run } from './run'
import { codexAsk, runUpdates } from './update'

async function main() {
  const sessionId = process.argv[2] ?? ''
  const dir = dataDir(process.env, dirname(dirname(fileURLToPath(import.meta.url))))
  const { cliPath } = await readState(dir, sessionId)
  await runUpdates(dir, sessionId, codexAsk(run, cliPath ?? 'codex', dir), Date.now)
}

main().catch(() => process.exit(0))
