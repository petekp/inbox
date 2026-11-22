import { REMOTE_ACTIONS } from '../../core/remote/remote-commands'
import { remoteViewerReceipts } from '../../core/runtime/remote-viewers'
import type { ViewerStore } from '../../core/runtime/remote-viewers'
import { commandsOf, remoteReceipts } from '../../core/runtime/remote-command-state'
import { ompCommandStore } from './command-log'
import { registryFiles } from './registry'
import { registryHerdr, removeRegistryEntry, writeRegistryEntry } from '../../core/runtime/session-registry'
import { mkdir, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { flattenConversation } from '../../core/domain/conversation'
import { isCompareInBackground } from '../../core/domain/press-messages'
import { screenText } from '../../core/domain/inbox-text'
import type { ScreenTab } from '../../core/domain/inbox-text'
import { ghFinder, ghIn } from '../../core/domain/gh'
import { CLEARED_TOKENS, delegatesInHerdr, herdrCheckGate, herdrTokens } from '../../core/remote/herdr'
import { publishedSession, unpublishSession } from '../../core/remote/herdr-app'
import type { PublishFiles } from '../../core/remote/herdr-app'
import { endTurn, turnEnded } from '../../core/runtime/session-turns'
import { forkedFrom, hasLedger, isUnseen, statusChanged } from '../../core/runtime/session-status'
import { sessionView } from '../../core/view/session-view'
import { delegatesSettled } from '../../core/domain/children'
import {
  askOverConversation,
  NO_CONVERSATION_SCROLL,
  orderedKeys,
  reconcileUpdateStatus,
  runUpdates,
} from '../../core/runtime/session-host'
import type { SessionHost, UpdateHost } from '../../core/runtime/session-host'
import { fetchPrs } from '../../core/runtime/host-prs'
import { wakeAfterSettle } from '../../core/runtime/host-press'
import type { StatusRecords, RecordFiles } from '../../core/runtime/status-records'
import { screenTabOf } from '../../core/view/tabs'
import { version } from '../package.json'
import { openTarget } from './commands'
import { exclusiveRun, pruneSessions, readState, updateState, viewerLeases } from './state'
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

/** Node's file calls for publishing a session. The move is a rename, which replaces the file in one step. */
const publishFiles: PublishFiles = {
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
  },
  move: (from, to) => rename(from, to),
  remove: path => rm(path, { force: true }),
  removeFolder: path => rm(path, { recursive: true, force: true }),
}

const recordFiles: RecordFiles = {
  write: async (path, text) => {
    await mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    await writeFile(tmp, text)
    await rename(tmp, path)
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
    const saved = await updateState(
      dir,
      id,
      async current => {
        const changed = await fn(current)
        isChanged = changed !== current

        return changed
      },
      deps.now,
    )
    if (isChanged) notifyChanged(id)

    return saved
  }

  const gh = ghFinder(run)

  /**
   * Reports the session omp shows to the Herdr pane or app terminal it runs in. In an app terminal, each report's turn
   * first publishes the session for the Herdr look, so the files land in the order of the changes. The labels name the
   * session only once its file is written. `left` is a session omp no longer shows, whose file that turn removes first.
   */
  function reportCounts(id: string, left?: string): void {
    if (id !== memory.shownId) return
    deps.background(reportRegistry(id, left))
    const target = deps.herdrTarget
    if (!target) return
    const appHome = target.kind === 'terminal' ? target.appHome : null
    deps.background(
      reportToHerdr(
        run,
        async () => {
          if (appHome && left) await unpublishSession(publishFiles, appHome, left).catch(() => undefined)
          const s = await readState(dir, id)
          const commands = await commandsOf(ompCommandStore(dir, id, deps.now), s)
          const now = deps.now()
          const openAsk = context.openAsks.get(id)
          const isPublished =
            target.kind === 'terminal' &&
            (await publishedSession(
              publishFiles,
              appHome,
              {
                receipts: remoteReceipts(commands),
                viewers: remoteViewerReceipts(viewerLeases.peek(id)),
                remoteProtocol: 2,
                remoteActions: REMOTE_ACTIONS,
                remoteHistoryAfter: commands.floor,
                host: 'omp',
                agent: OMP.agent,
                sessionId: id,
                terminal: target.terminal,
                writtenAt: now,
                projectFolder: memory.shownCwd?.(),
                isFetchingPrs: prFetches.isFetching(id),
                ...(openAsk && { openDialog: openAsk.kind }),
                version,
                isNextBuild: deps.isNextBuild,
              },
              s,
              context.logHerdr,
            ))
          const view = sessionView(s, now, deps.settleWindowMs)

          return {
            target,
            tokens: herdrTokens(s.ledger, s.stop, view, openAsk ? [openAsk] : []),
            session: isPublished ? id : null,
          }
        },
        deps.after,
      ),
    )
  }

  /**
   * The registry writes and removals, one after another, so a removal is never overtaken by a write before it. A
   * failure is logged, and the ones after it still run.
   */
  let registryWork: Promise<void> = Promise.resolve()
  const inRegistryOrder = (work: () => Promise<void>) =>
    (registryWork = registryWork
      .then(work)
      .catch((error: unknown) =>
        context.logHerdr(
          `inbox: the session registry could not be updated: ${error instanceof Error ? error.message : error}`,
        ),
      ))

  /** Writes the session registry entry of the session omp shows, after removing that of `left`. */
  const reportRegistry = (id: string, left?: string) =>
    inRegistryOrder(async () => {
      const folder = deps.registryFolder
      if (!folder) return
      const files = registryFiles(context.logHerdr)
      if (left) await removeRegistryEntry(files, folder, 'omp', left)
      const s = await readState(dir, id)
      const now = deps.now()
      const source = {
        host: 'omp' as const,
        sessionId: id,
        agent: OMP.agent,
        projectFolder: memory.shownCwd?.() ?? null,
        version,
        herdr: registryHerdr(deps.herdrTarget),
      }
      await writeRegistryEntry(files, folder, source, s, sessionView(s, now, deps.settleWindowMs), now, process.pid)
    })

  /** Removes the session's registry entry and published file, and clears every token and label, as omp shuts down. */
  async function reportEnded(id: string): Promise<boolean> {
    const folder = deps.registryFolder
    const removal = folder
      ? inRegistryOrder(() => removeRegistryEntry(registryFiles(context.logHerdr), folder, 'omp', id))
      : Promise.resolve()
    const target = deps.herdrTarget
    if (!target) {
      await removal
      return false
    }
    const appHome = target.kind === 'terminal' ? target.appHome : null
    const [, isTaken] = await Promise.all([
      removal,
      reportToHerdr(
        run,
        async () => {
          if (appHome) await unpublishSession(publishFiles, appHome, id).catch(() => undefined)

          return { target, tokens: CLEARED_TOKENS, session: null }
        },
        deps.after,
      ),
    ])

    return isTaken
  }

  /** The sessions whose results calls run one after another. They hold no lock, so a ledger call never waits for one. */
  const resultsOrder = orderedKeys()

  function hostFor(ctx: OmpContext): SessionHost<OmpState> & { viewers: ViewerStore } {
    const id = sessionIdOf(ctx)

    return {
      now: deps.now,
      viewers: viewerLeases.of(id, () => reportCounts(id)),
      commands: ompCommandStore(dir, id, deps.now, () => reportCounts(id)),
      read: () => readState(dir, id),
      readDurable: () => readState(dir, id),
      update: fn => change(id, fn),
      exclusive: fn => exclusiveRun(dir, id, fn),
      ask: askFor(ctx, id),
      deliver: async (_s, text) => {
        const why = await sendToAgent(ctx, text)

        return why === null ? { state: 'accepted', queuedId: null } : { state: 'rejected', reason: why }
      },
      perform: async (_s, effect) =>
        effect.kind === 'scroll'
          ? NO_CONVERSATION_SCROLL
          : effect.kind === 'copy'
            ? deps.copy(effect.text)
            : openTarget(run, effect.target, ctx.cwd, deps.home),
      refreshPrsIfDue: async () => fetchPrsWhenDue(ctx, true),
      refreshPrs: () => prFetches.fetchNow(id, () => fetchPrs(hostFor(ctx), true, true)),
      gh: {
        shared: {
          read: async () => memory.prShared,
          write: async change => {
            memory.prShared = change(memory.prShared)
          },
        },
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
      compareInBackground: isCompareInBackground('omp'),
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
      delegate: context.delegate,
      background: results => deps.background(results),
      ...(deps.isNextBuild ? { records: statusRecords(dir, id) } : {}),
      catchUp: s =>
        askOverConversation(
          host,
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
        const states = await delegatesInHerdr((await readState(dir, id)).ledger.overview, run, deps.herdrTarget)
        if (states) await change(id, s => statusChanged(s, o => delegatesSettled(o, states, deps.now())))
      })(),
    )
  }

  function fetchPrsWhenDue(ctx: OmpContext, isTabShown: boolean): void {
    const id = sessionIdOf(ctx)
    if (prFetches.isFetching(id)) return
    deps.background(
      (async () => {
        const host = hostFor(ctx)
        const s = await host.read()
        const seen = { ...s, prViews: { ...s.prViews, isGhMissing: memory.isGhMissing } }
        await prFetches.fetchWhenDue(id, seen, isTabShown, () => fetchPrs(host, true))
      })(),
    )
  }

  function wakeLater(ctx: OmpContext): void {
    ctx.setTimeout(() => deps.background(wakeAfterSettle(hostFor(ctx))), deps.settleWindowMs + WAKE_MARGIN_MS)
  }

  return {
    change,
    notifyChanged,
    endedTurn,
    hostFor,
    updateHostFor,
    reportCounts,
    reportEnded,
    prepare,
    continueFork,
    catchUpUnseen,
    fetchPrsWhenDue,
    checkDelegatesWhenDue,
    wakeLater,
  }
}

export type SessionCalls = ReturnType<typeof sessionCalls>
