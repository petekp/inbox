import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findCli } from './cli'
import { dataDir } from './data-dir'
import { herdrOnWrite } from './host'
import { readState } from './state'
import { run } from './run'
import { codexAsk, recordModelFailure, refreshOverview, runUpdates } from './update'
import { OVERVIEW_REFRESH } from './detached-update'

async function main() {
  const sessionId = process.argv[2] ?? ''
  const isOverviewRefresh = process.argv[3] === OVERVIEW_REFRESH
  const dir = dataDir(process.env, dirname(dirname(fileURLToPath(import.meta.url))))
  const { cliPath } = await readState(dir, sessionId)
  const cli = cliPath ?? (await findCli(process.env, run, process.ppid))
  const personHome = process.env.CODEX_HOME || join(homedir(), '.codex')
  const ask = codexAsk(run, cli, dir, personHome, recordModelFailure(dir, sessionId, Date.now))
  const onWrite = herdrOnWrite(process.env, run, dir, Date.now)
  if (isOverviewRefresh) await refreshOverview(dir, sessionId, ask, Date.now, onWrite)
  else await runUpdates(dir, sessionId, ask, Date.now, onWrite)
}

main().catch(() => process.exit(0))
