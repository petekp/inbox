import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { detachedUpdate, STATUS_REFRESH } from './detached-update'
import { ancestorCodex } from './cli'
import { herdrOnWrite } from './host'
import { eachOnWrite, registryOnWrite } from './registry'
import { herdrLog } from './herdr-log'
import { herdrTerminal } from './herdr-terminal'
import { withoutSharedTerminal } from './shared-daemon'
import { handleHook } from './hook'
import type { HookInput } from './hook'
import { dataDir } from './data-dir'
import { run } from './run'
import { useQuestionHistory } from './state'
import { questionHistoryPlace } from './question-history'

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const dist = dirname(fileURLToPath(import.meta.url))
  const dir = dataDir(process.env, dirname(dist))
  await withoutSharedTerminal(process.env, run, process.ppid, herdrLog(dir))
  useQuestionHistory(questionHistoryPlace(process.env, dir))
  const startUpdate = detachedUpdate(dir, process.env, join(dist, 'update.mjs'))
  const input = JSON.parse(raw) as HookInput
  const codexPid =
    input.hook_event_name === 'SessionStart' ? ((await ancestorCodex(run, process.ppid))?.pid ?? null) : null
  const out = await handleHook(input, {
    dir,
    env: process.env,
    now: Date.now,
    startUpdate: id => startUpdate(id),
    startStatusRefresh: id => startUpdate(id, STATUS_REFRESH),
    onWrite: eachOnWrite(
      herdrOnWrite(process.env, run, dir, Date.now),
      registryOnWrite(process.env, dir, Date.now, codexPid),
    ),
    herdrTerminal: herdrTerminal(process.env, run, dir, codexPid, herdrLog(dir)),
    run,
    parentPid: process.ppid,
  })
  if (out) process.stdout.write(JSON.stringify(out))
}

main().catch(() => process.exit(0))
