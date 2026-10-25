import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'

import { ghFinder, ghIn } from '../../hooks/gh'
import type { Run } from '../../hooks/gh'
import { isDismissing, isTracked } from '../../hooks/pr-tab'
import type { PrPress } from '../../hooks/pr-tab'
import { demoAfterPress, demoTurns, noteText, openTarget } from '../../hooks/presses'
import type { PathProbe, RowPress } from '../../hooks/presses'
import { agentTools } from '../../hooks/tools'
import { heardState, noteToolCall, viewOf } from './core'
import type { TabView } from './core'
import { demoState } from './demo'
import { noteDialogs } from './dialogs'
import { withEarlierHistory } from './history'
import { codexStore } from './host'
import { isUnseen, pressOn, recorded } from '../../hooks/session'
import type { SendOutcome } from '../../hooks/session'
import { fetchPrs, prFetchTracker, press, wakeForDone as wakeSessionForDone } from '../../hooks/session-host'
import type { SessionHost } from '../../hooks/session-host'
import { NO_HOLDS, SETTLED_MS } from '../../hooks/view'
import type { ReplyHolds } from '../../hooks/view'
import { SETTLE_WINDOW_MS } from './settle'
import { pruneSessions, readState, updateState } from './state'
import { reconcileUpdateStatus } from './update'
import type { SessionState } from './state'
import { CODEX, INBOX_DESCRIPTION, inboxToolText, VIEW_DESCRIPTION } from './texts'
import { rolloutFor, turnIn } from './transcript'
import type { HooksTrust } from './hook-trust'
import type { LastAction, PrViews, RowNote } from '../../types'

/** Codex keeps a tab's page by its address, even across server restarts, so a new build needs a new address for a new chat to load it. */
export function tabUri(tabHtml: string): string {
  return `ui://inbox/tab-${createHash('sha256').update(tabHtml).digest('hex').slice(0, 12)}`
}
/** How long an answer about the hooks' trust stands before a view asks Codex again. */
const HOOKS_TRUST_CACHE_MS = 30_000
const TAB_MIME = 'text/html;profile=mcp-app'

const APP_ONLY = { ui: { visibility: ['app'] } }

function viewsStillShown(
  prs: PrViews,
  linked: string[],
  lastActions: Record<string, LastAction>,
  at: number,
): PrViews['views'] {
  return Object.fromEntries(
    Object.entries(prs.views).filter(([ref]) => isTracked(prs, linked, ref) || isDismissing(lastActions, ref, at)),
  )
}

const toolsFor = (uri: string) => [
  ...agentTools(CODEX),
  // No resourceUri: Codex mounts every model-called MCP App inline in the transcript.
  { name: 'inbox', description: INBOX_DESCRIPTION, inputSchema: { type: 'object', properties: {} } },
  {
    // The side panel names the tab from this title. Entrypoints ignore `visibility`, so the tab still opens.
    name: 'inbox_view',
    title: 'Inbox',
    description: VIEW_DESCRIPTION,
    inputSchema: {
      type: 'object',
      properties: { demo: { type: 'boolean' }, replies: { type: 'object' }, discarded: { type: 'object' } },
    },
    _meta: {
      ui: { resourceUri: uri, visibility: ['app'] },
      'openai/ui': { entrypoints: [{ type: 'thread' }] },
    },
  },
  {
    name: 'inbox_press',
    description: 'A press in the Inbox tab.',
    inputSchema: {
      type: 'object',
      properties: {
        press: { type: 'object' },
        thread: { type: 'string' },
        demo: { type: 'boolean' },
        replies: { type: 'object' },
        discarded: { type: 'object' },
      },
      required: ['press'],
    },
    _meta: APP_ONLY,
  },
  {
    name: 'inbox_tab_page',
    description: 'The tab page the server serves now.',
    inputSchema: { type: 'object', properties: {} },
    _meta: APP_ONLY,
  },
]

/** The tab's replies in progress and discarded holds, each a time by row id. Anything else in the arguments is dropped. */
function holdsOf(args: Record<string, unknown>): ReplyHolds {
  const times = (raw: unknown): Record<string, number> =>
    typeof raw !== 'object' || raw === null
      ? {}
      : Object.fromEntries(
          Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])),
        )

  return { replies: times(args.replies), discarded: times(args.discarded) }
}

function stamped(tabHtml: string): string {
  return tabHtml.replace(
    '</head>',
    () => `<script>window.__inboxPage = ${JSON.stringify(tabUri(tabHtml))}</script></head>`,
  )
}

export type ServerDeps = {
  dir: string
  now: () => number
  exec: Run
  tabHtml: string
  /** The codex binary to run `queue` with when no hook has named one yet. */
  fallbackCli: () => Promise<string>
  devPage?: () => Promise<string | null>
  /**
   * What Codex lists for the inbox's hooks in a folder, the chat's or else the home folder, or null when it cannot say. Without it, the tab does not say why
   * a chat has heard from no hook.
   */
  hooksTrust?: (cli: string, folder: string) => Promise<HooksTrust | 'trusted' | null>
  build?: string
  loadError?: () => string | null
  isPluginFolderGone?: () => boolean
  /**
   * Where a chat the inbox has not seen is caught up from when its tab opens. Without it, the chat catches up at its
   * first hook.
   */
  openCatchUp?: {
    codexHome: string
    startUpdate: (sessionId: string) => void
  }
}

type Message = { jsonrpc: '2.0'; id?: number | string; method?: string; params?: Record<string, unknown> }

/**
 * The session a call belongs to. Codex's own tool calls carry it in their
 * turn metadata, and the tab's calls as the thread id, which is the same id.
 */
export function sessionOf(params: Record<string, unknown> | undefined): string | null {
  const meta = (params?._meta ?? {}) as Record<string, unknown>
  const turn = (meta['x-codex-turn-metadata'] ?? {}) as Record<string, unknown>
  const id = turn.session_id ?? meta.thread_id ?? meta.threadId

  return typeof id === 'string' && id ? id : null
}

/**
 * For a call Codex's model made in the session's own thread, the turn it came
 * in: its turn id, or null when the metadata has none. Undefined for a call that
 * says nothing about the session's prompts: the tab's calls carry no turn
 * metadata, and a subagent's or a forked chat's call can carry the root's
 * session id for a turn whose prompt the root's UserPromptSubmit never saw.
 */
export function turnOf(params: Record<string, unknown> | undefined): string | null | undefined {
  const meta = (params?._meta ?? {}) as Record<string, unknown>
  const turn = meta['x-codex-turn-metadata']
  if (typeof turn !== 'object' || turn === null) return undefined
  const t = turn as Record<string, unknown>
  const isOtherThread = typeof t.thread_id === 'string' && t.thread_id !== t.session_id
  if (t.parent_thread_id || t.forked_from_thread_id || isOtherThread) return undefined

  return typeof t.turn_id === 'string' && t.turn_id ? t.turn_id : null
}

const text = (t: string) => ({ content: [{ type: 'text', text: t }] })

export type PressReply = {
  view: TabView
  copy: { text: string; name: string } | null
  error: string | null
  note: RowNote['note'] | null
  delivery?: 'unconfirmed'
}

export function makeServer(deps: ServerDeps): (m: Message) => Promise<Record<string, unknown> | null> {
  const { dir, now } = deps
  const uri = tabUri(deps.tabHtml)
  const tools = toolsFor(uri)
  const gh = ghFinder(deps.exec)
  const prFetches = prFetchTracker(now)
  const prunedFor = new Set<string>()
  const checkedOnOpen = new Set<string>()
  let isGhMissing = false
  let hooksTrust: { at: number; value: HooksTrust | null } | null = null
  let isAskingHooks = false

  /**
   * Why Codex does not run the inbox's hooks, from the last answer. When that answer is older than the cache window,
   * a new call starts for the next view to read, so no view waits on it. A failed or unclear answer reads as null.
   */
  function hooksTrustNow(s: SessionState): HooksTrust | null {
    const { hooksTrust: ask } = deps
    if (!ask) return null
    if (!isAskingHooks && (hooksTrust === null || now() - hooksTrust.at >= HOOKS_TRUST_CACHE_MS)) {
      isAskingHooks = true
      void (async () => {
        try {
          const cli = s.cliPath ?? (await deps.fallbackCli())
          const answer = await ask(cli, s.root || homedir())
          hooksTrust = { at: now(), value: answer === 'untrusted' || answer === 'modified' ? answer : null }
        } catch {
          hooksTrust = { at: now(), value: null }
        } finally {
          isAskingHooks = false
        }
      })()
    }

    return hooksTrust?.value ?? null
  }

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
    let isBehind = false
    await updateState(dir, id, async s => {
      const r = await withEarlierHistory(s, { dir, rolloutPath: rollout.path, cwd: rollout.cwd })
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

  async function queueMessage(s: SessionState, message: string, resolvedCli?: string): Promise<SendOutcome> {
    let cli: string
    try {
      cli = resolvedCli ?? s.cliPath ?? (await deps.fallbackCli())
    } catch (err) {
      return { state: 'rejected', reason: err instanceof Error ? err.message : String(err) }
    }
    try {
      const r = await deps.exec([cli, 'queue', '--thread', s.sessionId, '--message', message], {
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
      ...codexStore(dir, id, now),
      prepare: async s => {
        preparedCli = s.cliPath ?? (await deps.fallbackCli())
      },
      deliver: (s, message) => queueMessage(s, message, preparedCli),
      perform: async (s, e) => (e.kind === 'copy' ? null : open(s, e.target)),
      gh: {
        find: gh.find,
        forget: gh.forget,
        run: (s, bin, onUnstartable) => ghIn(deps.exec, bin, s.root, onUnstartable),
        noteMissing: isMissing => {
          isGhMissing = isMissing
        },
      },
      settleWindowMs: SETTLE_WINDOW_MS,
      newId: randomUUID,
    }
  }

  const wakeForDone = (id: string) => wakeSessionForDone(hostFor(id))

  const currentPage = async () => (await deps.devPage?.()) ?? deps.tabHtml

  function fetchPrsWhenDue(id: string, s: SessionState) {
    void prFetches.fetchWhenDue(id, s, () => fetchPrs(hostFor(id), true))
  }

  const served = async (
    s: SessionState,
    id: string,
    isDemo = false,
    holds: ReplyHolds = NO_HOLDS,
  ): Promise<TabView> => {
    const loadError = deps.loadError?.()
    const current = !isDemo && s.presence.isUpdating ? await reconcileUpdateStatus(dir, id) : s
    const view = viewOf(current, now(), holds)
    const trust = !isDemo && view.heard === 'none' ? hooksTrustNow(current) : null

    return {
      ...view,
      ...(trust ? { hooksTrust: trust } : {}),
      thread: id,
      isFetchingPrs: !isDemo && prFetches.isFetching(id),
      isGhMissing: !isDemo && isGhMissing,
      devPage: tabUri(await currentPage()),
      ...(deps.build ? { serverBuild: deps.build } : {}),
      ...(loadError ? { serverLoadError: loadError } : {}),
      ...(deps.isPluginFolderGone?.() ? { isPluginFolderGone: true } : {}),
    }
  }

  /** Links the dialogs of the rollout's newest turn first, so an answer pressed while that turn runs answers its dialog. */
  async function linkRunningDialogs(id: string) {
    const { transcriptPath } = await readState(dir, id)
    const { dialogs } = await turnIn(transcriptPath, undefined)
    if (dialogs.length > 0) await updateState(dir, id, s => noteDialogs(s, dialogs))
  }

  async function onPress(id: string, p: RowPress | PrPress, thread: unknown, holds: ReplyHolds): Promise<PressReply> {
    if (!('ref' in p) && (p.action === 'answer' || p.action === 'type'))
      await linkRunningDialogs(id).catch(() => undefined)
    const outcome = await press(hostFor(id), p, thread !== id, holds)
    if (outcome.wakesForDone) setTimeout(() => void wakeForDone(id).catch(() => undefined), SETTLE_WINDOW_MS).unref()
    const { isUnconfirmed, wakesForDone: _wakes, ...rest } = outcome

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

  const demos = new Map<string, SessionState>()
  const demoOf = (id: string) => {
    const s = demos.get(id) ?? demoState(now())
    demos.set(id, s)
    return s
  }

  async function onDemoPress(
    id: string,
    p: RowPress | PrPress,
    thread: unknown,
    holds: ReplyHolds,
  ): Promise<PressReply> {
    const s = demoOf(id)
    const r = thread === id ? pressOn(s, p, now()) : ({ stale: true } as const)
    if ('stale' in r) return { view: await served(s, id, true, holds), copy: null, error: null, note: 'stale' }
    const after = demoAfterPress(
      { lastActions: s.lastActions, turns: s.presence },
      r,
      new Set(Object.keys(holds.replies)),
    )
    const next: SessionState = {
      ...s,
      ledger: after.ledger,
      lastActions: after.lastActions,
      presence: { ...s.presence, ...after.turns },
    }
    demos.set(id, next)
    if (r.effects.some(e => e.kind === 'send'))
      setTimeout(() => {
        const d = demos.get(id)
        if (d) demos.set(id, { ...d, presence: { ...d.presence, ...demoTurns(d.presence, [], true) } })
      }, SETTLED_MS).unref()

    return {
      view: await served(next, id, true, holds),
      copy: null,
      error: null,
      note: null,
    }
  }

  async function callTool(
    name: string,
    args: Record<string, unknown>,
    id: string | null,
    turn: string | null | undefined,
  ) {
    if (!id) return { ...text('Not done: this call carries no session id.'), isError: true }
    const heard = (s: SessionState) => (turn === undefined ? s : noteToolCall(s, turn, now()))
    switch (name) {
      case 'record':
      case 'close': {
        let result = ''
        await updateState(dir, id, s => {
          const r = recorded(CODEX, s, name, args, now())
          result = r.result
          return heard(r.state)
        })
        return text(result)
      }
      case 'inbox': {
        const s = turn === undefined ? await readState(dir, id) : await updateState(dir, id, heard)
        return text(inboxToolText(viewOf(s, now())))
      }
      case 'inbox_view': {
        const holds = holdsOf(args)
        if (args.demo === true)
          return { ...text('Inbox demo'), structuredContent: await served(demoOf(id), id, true, holds) }
        await wakeForDone(id).catch(() => undefined)
        await catchUpOnOpen(id).catch(() => undefined)
        const s = await updateState(dir, id, s => ({
          ...s,
          heldRows: Object.keys(holds.replies),
          tabSeenAt: now(),
          prViews: { ...s.prViews, views: viewsStillShown(s.prViews, s.ledger.prs, s.lastActions, now()) },
        }))
        fetchPrsWhenDue(id, s)
        return { ...text('Inbox view'), structuredContent: await served(s, id, false, holds) }
      }
      case 'inbox_tab_page':
        return { ...text('Tab page'), structuredContent: { html: stamped(await currentPage()) } }
      case 'inbox_press': {
        const p = args.press as RowPress | PrPress
        const holds = holdsOf(args)
        const r = await (args.demo === true
          ? onDemoPress(id, p, args.thread, holds)
          : onPress(id, p, args.thread, holds))
        return { ...text(r.error ?? (r.note ? noteText() : 'Done')), structuredContent: r }
      }
    }

    return { ...text(`Unknown tool: ${name}`), isError: true }
  }

  return async m => {
    const { id, method, params } = m
    const ok = (result: unknown) => ({ jsonrpc: '2.0', id, result })
    switch (method) {
      case 'initialize':
        return ok({
          protocolVersion: (params?.protocolVersion as string) ?? '2025-06-18',
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'inbox', version: '0.2.10' },
        })
      case 'tools/list':
        return ok({ tools })
      case 'tools/call': {
        const name = String(params?.name ?? '')
        const args = (params?.arguments ?? {}) as Record<string, unknown>
        const session = sessionOf(params)
        try {
          const result = ok(await callTool(name, args, session, turnOf(params)))
          if (session && !prunedFor.has(session)) {
            prunedFor.add(session)
            void pruneSessions(dir, session).catch(() => undefined)
          }
          return result
        } catch (err) {
          return ok({ ...text(`Failed: ${err instanceof Error ? err.message : String(err)}`), isError: true })
        }
      }
      case 'resources/list':
        return ok({ resources: [{ uri, name: 'Inbox', mimeType: TAB_MIME }] })
      case 'resources/templates/list':
        return ok({ resourceTemplates: [] })
      case 'resources/read': {
        // Codex asks by the address from the tools/list it read when the server started, and drops the frame when
        // the reply names another. A build loaded since then has a new address, so answer under the one asked for.
        const asked = String(params?.uri ?? '')

        return ok({
          contents: [
            { uri: asked.startsWith('ui://inbox/tab-') ? asked : uri, mimeType: TAB_MIME, text: stamped(deps.tabHtml) },
          ],
        })
      }
      case 'ping':
        return ok({})
    }
    if (id === undefined) return null

    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }
  }
}
