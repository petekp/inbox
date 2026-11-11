import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'

import { ghFinder, ghIn } from '../../hooks/gh'
import { isCompareInBackground } from '../../hooks/clients'
import { isPrPress } from '../../hooks/pr-press'
import type { PrPress } from '../../hooks/pr-press'
import { openTarget } from '../../hooks/open-targets'
import type { PathProbe } from '../../hooks/open-targets'
import type { RowPress } from '../../hooks/presses'
import { turnEnded, turnStarted } from '../../hooks/session-turns'
import type { SendOutcome } from '../../hooks/session-presses'
import { fetchPrs, prFetchTracker } from '../../hooks/host-prs'
import { NO_PR_SHARED } from '../../hooks/pr-fetch'
import type { PrShared } from '../../hooks/pr-fetch'
import { press, wakeAfterSettle as wakeSessionAfterSettle } from '../../hooks/host-press'
import type { SessionHost } from '../../hooks/session-host'
import { NO_HOLDS } from '../../hooks/timing'
import { applyLookPress } from '../../hooks/herdr-app'
import type { PressFile } from '../../hooks/herdr-press-file'
import type { Holds } from '../../hooks/timing'
import { viewOf } from './core'
import type { TabView } from './core'
import { answerMessage, noteDialogs } from './dialogs'
import type { HooksTrust } from './hook-trust'
import { codexStore } from './host'
import type { PressReply, ServerDeps } from './server'
import { pageName } from './server-tools'
import { SETTLE_WINDOW_MS } from './settle'
import { readState, updateState } from './state'
import type { SessionState } from './state'
import { newestTurnEvent, turnIn, withCurrentRollout } from './transcript'
import { reconcileUpdateStatus } from './update'

const ROLLOUT_LOOKUP_MS = 60_000

export function makeSessionHost(
  deps: ServerDeps,
  newestTurns: Map<string, string>,
  hooksTrustNow: (s: SessionState, id: string) => HooksTrust | null,
  currentPage: () => Promise<string>,
) {
  const { dir, now } = deps
  const gh = ghFinder(deps.exec)
  const prFetches = prFetchTracker(now)
  let isGhMissing = false
  let prShared: PrShared = NO_PR_SHARED

  async function queueMessage(s: SessionState, message: string, resolvedCli?: string): Promise<SendOutcome> {
    let cli: string
    try {
      cli = resolvedCli ?? s.cliPath ?? (await deps.fallbackCli())
    } catch (err) {
      return { state: 'rejected', reason: err instanceof Error ? err.message : String(err) }
    }
    try {
      const resume = (await deps.queueResumes?.(cli)) ? ['--resume'] : []
      const r = await deps.exec([cli, 'queue', ...resume, '--thread', s.sessionId, '--message', message], {
        cwd: s.root || '/',
        timeoutMs: 15_000,
      })
      if (r.code !== 0) return { state: 'unconfirmed', reason: r.stderr.trim() || `codex queue exited ${r.code}` }
      return { state: 'accepted', queuedId: /Queued message (\S+)/.exec(r.stdout)?.[1] ?? null }
    } catch (err) {
      return { state: 'unconfirmed', reason: err instanceof Error ? err.message : String(err) }
    }
  }

  const hostFor = (id: string): Omit<SessionHost<SessionState>, 'ask'> => {
    let preparedCli: string | undefined
    return {
      ...codexStore(dir, id, now, deps.onWrite),
      prepare: async s => {
        preparedCli = s.cliPath ?? (await deps.fallbackCli())
      },
      deliver: (s, message) => queueMessage(s, message, preparedCli),
      perform: async (s, e) => (e.kind === 'copy' ? null : open(s, e.target)),
      refreshPrs: () => prFetches.fetchNow(id, () => fetchPrs(hostFor(id), true, true)),
      gh: {
        shared: {
          read: async () => prShared,
          write: async change => {
            prShared = change(prShared)
          },
        },
        find: gh.find,
        forget: gh.forget,
        run: (s, bin, onUnstartable) => ghIn(deps.exec, bin, s.root, onUnstartable),
        noteMissing: isMissing => {
          isGhMissing = isMissing
        },
      },
      settleWindowMs: SETTLE_WINDOW_MS,
      newId: randomUUID,
      answerMessage,
      comparePage: deps.comparePage,
      compareInBackground: isCompareInBackground('codex'),
    }
  }

  /** When each chat last looked for a rollout Codex moved. A miss walks every day folder, and the tab polls often. */
  const rolloutLookups = new Map<string, number>()
  const currentRollout = async (s: SessionState): Promise<SessionState> => {
    const last = rolloutLookups.get(s.sessionId)
    if (last !== undefined && now() - last < ROLLOUT_LOOKUP_MS) return s
    rolloutLookups.set(s.sessionId, now())

    return withCurrentRollout(s)
  }

  /**
   * Sets whether a turn runs from the rollout's last turn row, read inside the state lock so no hook writes between.
   * It first finds a rollout Codex moved again, so the reads after it use the path it saves.
   */
  async function syncTurn(id: string): Promise<SessionState> {
    return updateState(dir, id, async saved => {
      const s = await currentRollout(saved)
      const newest = s.transcriptPath === null ? null : await newestTurnEvent(s.transcriptPath)
      if (newest !== null) newestTurns.set(id, newest.id)
      const isRunning = newest === null ? null : newest.kind === 'started'
      if (isRunning === null || isRunning === s.presence.isTurnRunning) return s

      return isRunning ? turnStarted(s, null) : turnEnded(s, null)
    })
  }

  const wakeAfterSettle = async (id: string) => {
    await wakeSessionAfterSettle(hostFor(id), await syncTurn(id))
  }

  function fetchPrsWhenDue(id: string, s: SessionState) {
    void prFetches.fetchWhenDue(id, s, s.shownTab === 'prs', () => fetchPrs(hostFor(id), true))
  }

  const served = async (s: SessionState, id: string, isDemo = false, holds: Holds = NO_HOLDS): Promise<TabView> => {
    const loadError = deps.loadError?.()
    const current = !isDemo && s.presence.isUpdating ? await reconcileUpdateStatus(dir, id) : s
    const view = viewOf(current, now(), holds)
    const trust = isDemo ? null : hooksTrustNow(current, id)
    const herdrAsk = isDemo ? null : await deps.herdrAsk?.view().catch(() => null)

    return {
      ...view,
      ...(trust ? { hooksTrust: trust } : {}),
      ...(herdrAsk ? { herdrAsk } : {}),
      thread: id,
      isFetchingPrs: !isDemo && prFetches.isFetching(id),
      isGhMissing: !isDemo && isGhMissing,
      devPage: pageName(await currentPage()),
      ...(deps.build ? { serverBuild: deps.build } : {}),
      ...(loadError ? { serverLoadError: loadError } : {}),
      ...(deps.isPluginFolderGone?.() ? { isPluginFolderGone: true } : {}),
      ...(deps.isNextBuild ? { isNextBuild: true } : {}),
    }
  }

  /**
   * Links the dialogs of the rollout's newest turn first, so an answer pressed while that turn runs answers its dialog.
   * Stop notes a turn's dialogs, so only an unlinked question from the turn still running needs the rollout read.
   */
  async function linkRunningDialogs(id: string, itemId: string) {
    const s = await readState(dir, id)
    const item = s.ledger.items.find(i => i.id === itemId)
    const canLink = item?.kind === 'question' && !item.dialog && item.turn === s.ledger.turn && s.presence.isTurnRunning
    if (!canLink) return
    const { dialogs } = await turnIn(s.transcriptPath, undefined)
    if (dialogs.length > 0) await updateState(dir, id, x => noteDialogs(x, dialogs))
  }

  /** Applies a press from the tab, or with `look` one the Herdr look wrote, whose opens and copies it may have run. */
  async function onPress(
    id: string,
    p: RowPress | PrPress,
    thread: unknown,
    holds: Holds,
    look: PressFile | null = null,
  ): Promise<PressReply> {
    await syncTurn(id).catch(() => undefined)
    if (!isPrPress(p) && (p.action === 'answer' || p.action === 'type'))
      await linkRunningDialogs(id, p.id).catch(() => undefined)
    const outcome = await (look ? applyLookPress(hostFor(id), look) : press(hostFor(id), p, thread !== id, holds))
    if (outcome.wakesAfterSettle)
      setTimeout(() => void wakeAfterSettle(id).catch(() => undefined), SETTLE_WINDOW_MS).unref()
    const { isUnconfirmed, wakesAfterSettle: _wakes, ...rest } = outcome

    return {
      view: await served(await readState(dir, id), id, false, holds),
      ...rest,
      ...(isUnconfirmed ? { delivery: 'unconfirmed' as const } : {}),
    }
  }

  const files: PathProbe = {
    stat: path => stat(path).catch(() => null),
    isExecutable: path =>
      access(path, constants.X_OK).then(
        () => true,
        () => false,
      ),
  }
  const open = (s: SessionState, target: string) => openTarget(deps.exec, files, target, s.root, s.home)

  return { wakeAfterSettle, fetchPrsWhenDue, served, onPress }
}
