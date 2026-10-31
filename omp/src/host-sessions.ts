import { mkdir, readdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { flattenConversation } from '../../hooks/conversation'
import { screenText } from '../../hooks/inbox-text'
import type { ScreenTab } from '../../hooks/inbox-text'
import { ghFinder, ghIn } from '../../hooks/gh'
import { delegatesInHerdr, herdrCheckGate, herdrTokens } from '../../hooks/herdr'
import { endTurn, turnEnded } from '../../hooks/session-turns'
import { forkedFrom, hasLedger, isUnseen, statusChanged } from '../../hooks/session-status'
import { sessionView } from '../../hooks/session-view'
import { delegatesSettled } from '../../hooks/children'
import {
  askOverConversation,
  fetchPrs,
  orderedKeys,
  reconcileUpdateStatus,
  runUpdates,
  wakeForDone,
} from '../../hooks/session-host'
import type { StatusRecords, RecordFiles, SessionHost, UpdateHost } from '../../hooks/session-host'
import { screenTabOf } from '../../hooks/view'
import { openTarget } from './commands'
import { exclusiveRun, pruneSessions, readState, updateState } from './state'
import type { OmpState } from './state'
import { OMP } from './texts'
import { sessionIdOf } from './host-context'
import type { HostContext, OmpContext } from './host-context'
import { conversationOf } from './omp-messages'

/** Added to the settle window so the timer fires after the window has fully passed. */
const WAKE_MARGIN_MS = 250

/** The session id in a session file's name, `<timestamp>_<sessionId>.jsonl`. Null for any other name. */
function sessionIdInFile(file: string): string | null {
  return /(?:^|[\\/])[^_\\/]+_([^\\/]+)\.jsonl$/.exec(file)?.[1] ?? null
}

const recordFiles: RecordFiles = {
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  },
  list: folder => readdir(folder).catch(() => []),
  removeFiles: async paths => void (await Promise.all(paths.map(p => rm(p, { force: true })))),
  removeFolder: path => rmdir(path),
}

/** A next build's Status call records for the session, beside the inbox's saved sessions. */
const statusRecords = (dir: string, sessionId: string): StatusRecords => ({
  host: 'omp',
  folder: join(dir, 'overview-calls'),
  session: sessionId,
  files: recordFiles,
})

export function sessionCalls(context: HostContext) {
  const { deps, dir, openPanels, prepared, prFetches, listeners, reportToHerdr, run, memory, sendToAgent, askFor } =
    context

  function panelScreenTab(id: string): ScreenTab | null {
    const tab = openPanels.get(id)

    return tab === undefined ? null : screenTabOf(tab)
  }

  /** Queues the running turn's exchange with its reply, and marks the turn ended at `at`. */
  function endedTurn(
    id: string,
    s: OmpState,
    reply: string,
    at: number,
    { hostTasks, queuesEmptyReply = false }: { hostTasks: OmpState['hostTasks']; queuesEmptyReply?: boolean },
  ): OmpState {
    const ended = endTurn(OMP, { ...s, hostTasks }, reply, openPanels.has(id), {
      tab: panelScreenTab(id),
      queuesEmptyReply,
    })

    return turnEnded(ended, at)
  }

  /** Changes a session's saved state, then tells whoever draws it and the Herdr pane. */
  const notifyChanged = (id: string) => {
    listeners.get(id)?.forEach(listener => listener())
    reportCounts(id)
  }

  const change = async (id: string, fn: Parameters<typeof updateState>[2]) => {
    let isChanged = false
    const saved = await updateState(dir, id, async current => {
      const changed = await fn(current)
      isChanged = changed !== current

      return changed
    })
    if (isChanged) notifyChanged(id)

    return saved
  }

  const gh = ghFinder(run)

  function reportCounts(id: string): void {
    const pane = deps.herdrPane
    if (!pane || id !== memory.shownId) return
    deps.background(
      reportToHerdr(run, async () => {
        const s = await readState(dir, id)
        const view = sessionView(s, deps.now(), deps.settleWindowMs, true)

        return { pane, tokens: herdrTokens(s.ledger, s.stop, view, []) }
      }),
    )
  }

  /** The sessions whose results calls run one after another. They hold no lock, so a ledger call never waits for one. */
  const resultsOrder = orderedKeys()

  function hostFor(ctx: OmpContext): SessionHost<OmpState> {
    const id = sessionIdOf(ctx)

    return {
      now: deps.now,
      read: () => readState(dir, id),
      update: fn => change(id, fn),
      exclusive: fn => exclusiveRun(dir, id, fn),
      ask: askFor(ctx, id),
      deliver: async (_s, text) => {
        const why = sendToAgent(ctx, text)

        return why === null ? { state: 'accepted', queuedId: null } : { state: 'rejected', reason: why }
      },
      perform: async (_s, effect) =>
        effect.kind === 'copy' ? deps.copy(effect.text) : openTarget(run, effect.target, ctx.cwd, deps.home),
      refreshPrs: () => prFetches.fetchNow(id, () => fetchPrs(hostFor(ctx), true)),
      gh: {
        find: gh.find,
        forget: gh.forget,
        run: (_s, bin, onUnstartable) => ghIn(run, bin, ctx.cwd, onUnstartable),
        noteMissing: isMissing => {
          memory.isGhMissing = isMissing
        },
      },
      settleWindowMs: deps.settleWindowMs,
      newId: deps.newId,
      comparePage: deps.comparePage,
    }
  }

  /** The session branch's conversation as the inbox model reads it. Empty when there is none or it cannot be read. */
  const conversationText = (ctx: OmpContext): string => {
    try {
      return flattenConversation(conversationOf(ctx.sessionManager.getBranch()))
    } catch {
      return ''
    }
  }

  /** The host for an update, which catches up over the branch's conversation when the ledger may have missed turns. */
  function updateHostFor(ctx: OmpContext): UpdateHost<OmpState> {
    const host = hostFor(ctx)
    const id = sessionIdOf(ctx)

    return {
      ...host,
      names: OMP,
      inOrder: fn => resultsOrder.run(id, fn),
      background: results => deps.background(results),
      ...(deps.isNextBuild ? { records: statusRecords(dir, id) } : {}),
      catchUp: s =>
        askOverConversation(
          host.ask,
          OMP,
          s,
          screenText(OMP, openPanels.has(id), panelScreenTab(id)),
          conversationText(ctx),
        ),
    }
  }

  /**
   * A session that holds turns the inbox never saw, as when it is resumed or forked, or the extension was turned on
   * in it, is marked `behind`, and its first update catches up over the branch.
   */
  async function catchUpUnseen(ctx: OmpContext): Promise<void> {
    if (conversationText(ctx) === '') return
    let isMarked = false
    await change(sessionIdOf(ctx), s => {
      if (!isUnseen(s)) return s
      isMarked = true

      return { ...s, presence: { ...s.presence, ledgerState: 'behind' } }
    })
    if (isMarked) await runUpdates(updateHostFor(ctx))
  }

  /**
   * A forked session continues its parent's ledger, as the mod's fork does, when the parent saved one. The Status, items,
   * the task list and closed records carry over, so the fork's catch-up does not offer back what the person already closed.
   * A parent with no saved ledger leaves the fork to catch up over its branch.
   */
  async function continueFork(ctx: OmpContext, parentFile: string | undefined): Promise<void> {
    const parentId = parentFile === undefined ? null : sessionIdInFile(parentFile)
    if (parentId === null || parentId === sessionIdOf(ctx)) return
    const parent = await readState(dir, parentId).catch(() => null)
    if (parent === null || !hasLedger(parent)) return
    await change(sessionIdOf(ctx), s => forkedFrom(s, parent))
  }

  /** Runs once for each session in this process: clears an update flag a crashed process left, and prunes old sessions. */
  function prepare(ctx: OmpContext): void {
    const id = sessionIdOf(ctx)
    if (prepared.has(id)) return
    prepared.add(id)
    deps.background(reconcileUpdateStatus(hostFor(ctx)))
    deps.background(pruneSessions(dir, id))
  }

  const isHerdrCheckDue = herdrCheckGate()

  function checkDelegatesWhenDue(ctx: OmpContext): void {
    const id = sessionIdOf(ctx)
    if (!isHerdrCheckDue(id, deps.now())) return
    deps.background(
      (async () => {
        const states = await delegatesInHerdr((await readState(dir, id)).ledger.overview, run)
        if (states) await change(id, s => statusChanged(s, o => delegatesSettled(o, states, deps.now())))
      })(),
    )
  }

  function fetchPrsWhenDue(ctx: OmpContext): void {
    const id = sessionIdOf(ctx)
    if (prFetches.isFetching(id)) return
    deps.background(
      (async () => {
        const host = hostFor(ctx)
        const fetching = prFetches.fetchWhenDue(id, await host.read(), () => fetchPrs(host, true))
        if (!fetching) return
        notifyChanged(id)
        await fetching
        notifyChanged(id)
      })(),
    )
  }

  function wakeLater(ctx: OmpContext): void {
    ctx.setTimeout(() => deps.background(wakeForDone(hostFor(ctx))), deps.settleWindowMs + WAKE_MARGIN_MS)
  }

  return {
    change,
    endedTurn,
    hostFor,
    updateHostFor,
    reportCounts,
    prepare,
    continueFork,
    catchUpUnseen,
    fetchPrsWhenDue,
    checkDelegatesWhenDue,
    wakeLater,
  }
}

export type SessionCalls = ReturnType<typeof sessionCalls>
