import { isMaybeStale } from '../../core/view/band'
import { reconcileUpdateStatus } from './update'
import { HOOKS_TRUST_TEXT } from './hook-trust-text'
import { SETTLE_WINDOW_MS } from './settle'
import { lstat } from 'node:fs/promises'
import { basename } from 'node:path'
import { emptySession } from '../../core/view/session-files'
import { sessionView } from '../../core/view/session-view'
import { commandsOf, remoteReceipts } from '../../core/runtime/remote-command-state'
import { codexCommandStore } from './command-log'
import { remoteViewerReceipts } from '../../core/runtime/remote-viewers'
import { REMOTE_ACTIONS } from '../../core/remote/remote-commands'
import { presentedSession } from '../../core/view/session-presentation'
import { readState, statePath, isPrFetchRunning } from './state'
import { readViewers } from './viewers'
import type { SessionState } from './state'
import type { HerdrFile } from '../../core/remote/herdr-press-file'
import type { ServerDeps } from './server'
import type { HooksTrust } from './hook-trust'
import type { CompanionHandler, CompanionView } from '../../core/remote/companion-protocol'

export function makeCompanion(
  deps: ServerDeps,
  operations: {
    opened(id: string): Promise<string[]>
    apply(id: string, file: HerdrFile): Promise<void>
    fetch(id: string, state: SessionState): Promise<void>
    trust(state: SessionState, id: string): HooksTrust | null
  },
): CompanionHandler {
  const known = async (id: string) => {
    const path = statePath(deps.dir, id)
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await lstat(path)
      if (!before.isFile() || before.isSymbolicLink() || before.size > 16 * 1024 * 1024)
        throw new Error('This chat has no readable saved Inbox.')
      const state = await readState(deps.dir, id)
      const after = await lstat(path)
      if (before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) continue
      if (state.sessionId !== id) throw new Error('The saved Inbox belongs to another chat.')
      return { state, savedAt: before.mtimeMs }
    }
    throw new Error('This Inbox changed while it was being read. Try again.')
  }
  return async (request, configured) => {
    if (request.operation === 'list') {
      const sessions = []
      for (const entry of configured) {
        try {
          const { state, savedAt } = await known(entry.id)
          const view = sessionView(state, deps.now(), SETTLE_WINDOW_MS)
          sessions.push({
            available: true,
            fresh: !isMaybeStale(view.sync.ledger),
            error: '',
            id: entry.id,
            name: entry.name || basename(state.root) || 'Codex chat',
            project: state.root,
            working: state.presence.isTurnRunning,
            asks: view.needsYou.count,
            findings: view.findings.count,
            prs: view.prs.count,
            writtenAt: savedAt,
          })
        } catch {
          sessions.push({
            id: entry.id,
            name: entry.name || 'Codex chat',
            available: false,
            fresh: false,
            error: 'This saved Inbox could not be read.',
            project: '',
            working: false,
            asks: 0,
            findings: 0,
            prs: 0,
            writtenAt: 0,
          })
        }
      }
      return { version: 1, sessions }
    }
    const entry = configured.find(s => s.id === request.session)
    if (!entry) throw new Error('This chat is not shared with the companion.')
    await known(entry.id)
    const warnings = request.operation === 'view' && request.opened ? await operations.opened(entry.id) : []
    if (request.operation === 'apply') await operations.apply(entry.id, request.file)
    let captured = await known(entry.id)
    if (request.operation === 'view' && request.opened && captured.state.presence.isUpdating) {
      await reconcileUpdateStatus(deps.dir, entry.id)
      captured = await known(entry.id)
    }
    const { state, savedAt } = captured
    const viewers = await readViewers(deps.dir, entry.id)
    const commands = await commandsOf(codexCommandStore(deps.dir, entry.id, deps.now), state)
    if (request.operation === 'view' && request.opened) void operations.fetch(entry.id, state)
    const trust = request.operation === 'view' && request.opened ? operations.trust(state, entry.id) : null
    const result: CompanionView = {
      sessionId: entry.id,
      name: entry.name || basename(state.root) || 'Codex chat',
      projectFolder: state.root,
      writtenAt: Math.max(savedAt, viewers.writtenAt, commands.writtenAt),
      serverNow: deps.now(),
      version: VERSION,
      isFetchingPrs: isPrFetchRunning(state),
      remoteActions: REMOTE_ACTIONS.filter(action => action !== 'resume'),
      remoteHistoryAfter: commands.floor,
      receipts: remoteReceipts(commands),
      viewers: remoteViewerReceipts(viewers.leases),
      session: { ...emptySession(), ...presentedSession(state) },
      warnings: [...warnings, ...(trust ? [HOOKS_TRUST_TEXT[trust]] : [])],
    }
    return result
  }
}
