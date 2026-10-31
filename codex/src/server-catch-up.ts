import { isAbsolute } from 'node:path'

import { isUnseen } from '../../hooks/session-status'
import { heardState } from './core'
import { withEarlierHistory } from './history'
import type { ServerDeps } from './server'
import { readState, updateState } from './state'
import { rolloutFor, rolloutReads } from './transcript'

export function makeCatchUpOnOpen(deps: ServerDeps) {
  const { dir } = deps
  const checkedOnOpen = new Set<string>()

  /**
   * Codex runs no hook when a chat opens, so the tab's first view of a chat the inbox has not seen does what the
   * chat's first hook would: it copies a fork's ledger and, when the rollout holds earlier turns, starts a catch-up.
   * It runs once per chat in this process, and changes nothing when the rollout cannot be found.
   */
  async function catchUpOnOpen(id: string) {
    const { openCatchUp } = deps
    if (!openCatchUp || checkedOnOpen.has(id)) return
    checkedOnOpen.add(id)
    const before = await readState(dir, id)
    if (before.transcriptPath !== null || heardState(before.heard) !== 'none' || !isUnseen(before)) return
    const rollout = await rolloutFor(openCatchUp.codexHome, id)
    if (rollout === null) return
    const cli = await deps.fallbackCli().catch(() => null)
    const history = { dir, cwd: rollout.cwd, reads: rolloutReads(rollout.path) }
    // Reads the rollout before the state lock. The check under the lock reuses what it read.
    await withEarlierHistory(before, history)
    let isBehind = false
    await updateState(dir, id, async s => {
      const r = await withEarlierHistory(s, history)
      isBehind = r.isBehind
      if (r.state === s) return s

      return {
        ...r.state,
        root: s.root || rollout.cwd,
        transcriptPath: rollout.path,
        cliPath: s.cliPath ?? (cli !== null && isAbsolute(cli) ? cli : null),
      }
    })
    if (isBehind) openCatchUp.startUpdate(id)
  }

  return catchUpOnOpen
}
