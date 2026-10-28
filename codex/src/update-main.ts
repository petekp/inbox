import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findCli } from './cli'
import { dataDir } from './data-dir'
import { herdrOnWrite } from './host'
import { readState } from './state'
import { run } from './run'
import { NEXT_BUILD_MARK } from '../../hooks/view'
import { codexAsk, overviewRecords, recordModelFailure, refreshOverview, runUpdates } from './update'
import { OVERVIEW_REFRESH } from './detached-update'

async function main() {
  const sessionId = process.argv[2] ?? ''
  const isOverviewRefresh = process.argv[3] === OVERVIEW_REFRESH
  const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)))
  const dir = dataDir(process.env, pluginRoot)
  const { cliPath } = await readState(dir, sessionId)
  const cli = cliPath ?? (await findCli(process.env, run, process.ppid))
  const personHome = process.env.CODEX_HOME || join(homedir(), '.codex')
  const ask = codexAsk(run, cli, dir, personHome, recordModelFailure(dir, sessionId, Date.now))
  const onWrite = herdrOnWrite(process.env, run, dir, Date.now)
  const records = existsSync(join(pluginRoot, NEXT_BUILD_MARK)) ? overviewRecords(dir, sessionId) : undefined
  if (isOverviewRefresh) await refreshOverview(dir, sessionId, ask, Date.now, onWrite, records)
  else await runUpdates(dir, sessionId, ask, Date.now, onWrite, records)
}

main().catch(() => process.exit(0))
