import type { OnWrite } from '../src/host'
import { runUpdates as runBothCalls } from '../src/update'
import { hookDeps, ledgerOnly } from './helpers'

export const runUpdates = (
  dir: string,
  id: string,
  ask: (prompt: string) => Promise<string | null>,
  now: () => number,
  onWrite?: OnWrite,
) => runBothCalls(dir, id, ledgerOnly(ask), now, onWrite)

export const execDeps = (dir: string) => {
  const deps = hookDeps(dir)

  return { ...deps, env: { ...deps.env, INBOX_IN_EXEC: '1' } }
}

export const CATCH_UP_REPLY = 'NEW: decide | - | Allow edits? | Yes / No | Yes'
