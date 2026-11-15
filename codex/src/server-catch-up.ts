import { isAbsolute } from 'node:path'

import { isUnseen } from '../../hooks/session-status'
import { heardState } from './core'
import { withEarlierHistory } from './history'
import type { ServerDeps } from './server'
import { readState, updateState } from './state'
import type { SessionState } from './state'
import { rolloutFor, rolloutReads } from './transcript'

/** The ledger's applied answers and the turns started, which change when the ledger or the chat moves on. */
const openCatchUpKey = (s: SessionState): string => `${s.ledger.updates}:${s.presence.turnsStarted}`

/** Whether the tab's view starts a catch-up: the ledger failed or fell behind, no turn runs, and none was started for it. */
const needsRetry = (s: SessionState): boolean =>
  s.presence.ledgerState !== 'current' && !s.presence.isTurnRunning && s.openCatchUpKey !== openCatchUpKey(s)

export function makeCatchUpOnOpen(deps: ServerDeps) {
  const { dir } = deps
  const checkedOnOpen = new Set<string>()

  /**
   * Codex runs no hook when a chat opens, so the tab's first view of a chat the inbox has not seen does what the
   * chat's first hook would: it copies a fork's ledger and, when the rollout holds earlier turns, starts a catch-up.
   * A chat the inbox has seen gets a catch-up when its ledger failed or fell behind, since an archived chat runs no
   * hooks. The saved `openCatchUpKey` limits that to once until the ledger or the chat moves on, across the server
   * processes Codex starts. It checks once per chat in this process, and changes nothing when the rollout cannot be
   * found.
   */
  async function catchUpOnOpen(id: string) {
    const { openCatchUp } = deps
    if (!openCatchUp || checkedOnOpen.has(id)) return
    checkedOnOpen.add(id)
    const before = await readState(dir, id)
    if (before.transcriptPath !== null) {
      if (!needsRetry(before)) return
      let isStarted = false
      await updateState(dir, id, s => {
        isStarted = needsRetry(s)
        return isStarted ? { ...s, openCatchUpKey: openCatchUpKey(s) } : s
      })
      if (isStarted) openCatchUp.startUpdate(id)
      return
    }
    if (heardState(before.heard) !== 'none' || !isUnseen(before)) return
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
