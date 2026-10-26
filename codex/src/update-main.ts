import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dataDir } from './data-dir'
import { herdrOnWrite } from './host'
import { readState } from './state'
import { run } from './run'
import { codexAsk, runUpdates } from './update'

async function main() {
  const sessionId = process.argv[2] ?? ''
  const dir = dataDir(process.env, dirname(dirname(fileURLToPath(import.meta.url))))
  const { cliPath } = await readState(dir, sessionId)
  const personHome = process.env.CODEX_HOME || join(homedir(), '.codex')
  const ask = codexAsk(run, cliPath ?? 'codex', dir, personHome)
  await runUpdates(dir, sessionId, ask, Date.now, herdrOnWrite(process.env, run, dir, Date.now))
}

main().catch(() => process.exit(0))
