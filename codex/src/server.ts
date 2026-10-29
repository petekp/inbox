import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'

import { delegatesSettled } from '../../hooks/children'
import { ghFinder, ghIn } from '../../hooks/gh'
import { delegatesInHerdr, herdrCheckGate } from '../../hooks/herdr'
import type { Run } from '../../hooks/gh'
import type { PrPress } from '../../hooks/pr-tab'
import { demoAfterPress, demoReplied, demoSent, noteText, openTarget } from '../../hooks/presses'
import type { PathProbe, RowPress } from '../../hooks/presses'
import { agentTools } from '../../hooks/tools'
import { heardState, isTurnHeard, lookOnView, noteToolCall, viewOf } from './core'
import type { TabView } from './core'
import { demoState } from './demo'
import { answerMessage, noteDialogs } from './dialogs'
import { withEarlierHistory } from './history'
import { codexStore } from './host'
import { isUnseen, overviewChanged, pressOn, recorded, turnEnded, turnStarted, withHolds } from '../../hooks/session'
import type { SendOutcome } from '../../hooks/session'
import { fetchPrs, prFetchTracker, press, wakeForDone as wakeSessionForDone } from '../../hooks/session-host'
import type { SessionHost } from '../../hooks/session-host'
import { NO_HOLDS, SETTLED_MS, drawnTabOf, isShownTab } from '../../hooks/view'
import type { Holds, ShownTab } from '../../hooks/view'
import { SETTLE_WINDOW_MS } from './settle'
import { pruneSessions, readState, updateState } from './state'
import { reconcileUpdateStatus } from './update'
import type { SessionState } from './state'
import { CODEX, INBOX_DESCRIPTION, inboxToolText, VIEW_DESCRIPTION } from './texts'
import { newestTurnEvent, rolloutFor, rolloutReads, turnIn } from './transcript'
import type { HooksTrust } from './hook-trust'
import type { RowNote } from '../../types'

/**
 * The name a build's page goes by. A tab whose page has another name than the server's swaps to the server's page.
 * Tabs from earlier builds take only a name shaped `ui://inbox/tab-` and 12 hex digits (`swapPage` in tab.tsx), so the
 * name keeps that shape.
 */
export function pageName(tabHtml: string): string {
  return `ui://inbox/tab-${createHash('sha256').update(tabHtml).digest('hex').slice(0, 12)}`
}

/**
 * Codex removes an open tab once the server's tool list names another address for its page, so every build lists
 * this one. A tab then swaps to the new build's page itself.
 */
const TAB_ADDRESS = 'ui://inbox/view'
/** How long a failed or unclear answer about the hooks' trust stands before a view asks Codex again. */
const HOOKS_UNCLEAR_CACHE_MS = 30_000
/** How long an answer that Codex does not run the hooks stands, so its notice leaves soon after the person trusts them. */
const HOOKS_STOPPED_CACHE_MS = 5_000
const TAB_MIME = 'text/html;profile=mcp-app'

const APP_ONLY = { ui: { visibility: ['app'] } }

const TOOLS = [
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
      properties: {
        demo: { type: 'boolean' },
        tab: { type: 'string' },
        replies: { type: 'object' },
        discarded: { type: 'object' },
        shownSince: { type: 'number' },
      },
    },
    _meta: {
      ui: { resourceUri: TAB_ADDRESS, visibility: ['app'] },
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
        shownSince: { type: 'number' },
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

/**
 * The tab's replies in progress and discarded holds, each a time by row id, and when the tab began showing its tab.
 * Anything else in the arguments is dropped.
 */
function holdsOf(args: Record<string, unknown>): Holds {
  const times = (raw: unknown): Record<string, number> =>
    typeof raw !== 'object' || raw === null
      ? {}
      : Object.fromEntries(
          Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])),
        )

  const shownSince = typeof args.shownSince === 'number' && Number.isFinite(args.shownSince) ? args.shownSince : null

  return { replies: times(args.replies), discarded: times(args.discarded), shownSince }
}

/** The tab the page says it shows, or null for anything that is not a tab. */
function shownTabOf(raw: unknown): ShownTab | null {
  return isShownTab(raw) ? raw : null
}

function stamped(tabHtml: string): string {
  return tabHtml.replace(
    '</head>',
    () => `<script>window.__inboxPage = ${JSON.stringify(pageName(tabHtml))}</script></head>`,
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
   * What Codex lists for the inbox's hooks in a folder, the chat's or else the home folder, or null when it cannot say.
   * Without it, the tab does not say when Codex is not running the inbox's hooks.
   */
  hooksTrust?: (cli: string, folder: string) => Promise<HooksTrust | 'trusted' | null>
  build?: string
  loadError?: () => string | null
  isPluginFolderGone?: () => boolean
  isNextBuild?: boolean
  /** The page template for a comparison, beside the handler's bundle. */
  comparePage: string
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
  const gh = ghFinder(deps.exec)
  const prFetches = prFetchTracker(now)
  const prunedFor = new Set<string>()
  const checkedOnOpen = new Set<string>()
  let isGhMissing = false
  /** Codex's last answer about the hooks' trust in each chat folder. */
  const hooksTrust = new Map<string, { at: number; answer: HooksTrust | 'trusted' | null }>()
  const askingHooksIn = new Set<string>()
  /** Each chat's newest turn in its rollout, as its last view read it. */
  const newestTurns = new Map<string, string>()
  /** The unheard turn each chat last asked about. */
  const askedTurns = new Map<string, string>()

  /** The chat's newest turn, when the inbox heard neither its prompt nor its Stop, as while Codex skips the hooks. */
  function unheardTurnOf(s: SessionState, id: string): string | null {
    const newest = newestTurns.get(id)

    return newest === undefined || isTurnHeard(s, newest) ? null : newest
  }

  /**
   * Why Codex does not run the inbox's hooks in the chat's folder, from the last answer. A view starts a new call for
   * the next view to read, so no view waits on it: on a folder's first view, a few seconds after a stopped answer, a
   * while after a failed or unclear one, and after a trusted one only once the chat's view sees a turn the hooks did not
   * hear. Each chat asks once per such turn, so chats in one folder never ask in turn after each other. A plugin update,
   * which stops the hooks, also loads a new handler, whose first view asks again. A failed or unclear answer reads as
   * null.
   */
  function hooksTrustNow(s: SessionState, id: string): HooksTrust | null {
    const { hooksTrust: ask } = deps
    if (!ask) return null
    const folder = s.root || homedir()
    const known = hooksTrust.get(folder)
    const unheardTurn = unheardTurnOf(s, id)
    const isAskDue =
      known === undefined ||
      (known.answer === 'trusted'
        ? unheardTurn !== null && askedTurns.get(id) !== unheardTurn
        : now() - known.at >= (known.answer === null ? HOOKS_UNCLEAR_CACHE_MS : HOOKS_STOPPED_CACHE_MS))
    if (isAskDue && !askingHooksIn.has(folder)) {
      askingHooksIn.add(folder)
      if (unheardTurn !== null) askedTurns.set(id, unheardTurn)
      void (async () => {
        const answer = await Promise.resolve(s.cliPath ?? deps.fallbackCli())
          .then(cli => ask(cli, folder))
          .catch(() => null)
        hooksTrust.set(folder, { at: now(), answer })
        askingHooksIn.delete(folder)
      })()
    }
    const answer = known?.answer

    return answer === 'untrusted' || answer === 'modified' ? answer : null
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
      refreshPrs: () => prFetches.fetchNow(id, () => fetchPrs(hostFor(id), true)),
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
      answerMessage,
      comparePage: deps.comparePage,
    }
  }

  /** Sets whether a turn runs from the rollout's last turn row, read inside the state lock so no hook writes between. */
  async function syncTurn(id: string): Promise<SessionState> {
    return updateState(dir, id, async s => {
      const newest = s.transcriptPath === null ? null : await newestTurnEvent(s.transcriptPath)
      if (newest !== null) newestTurns.set(id, newest.id)
      const isRunning = newest === null ? null : newest.kind === 'started'
      if (isRunning === null || isRunning === s.presence.isTurnRunning) return s

      return isRunning ? turnStarted(s, null) : turnEnded(s, null)
    })
  }

  const wakeForDone = async (id: string) => {
    await wakeSessionForDone(hostFor(id), await syncTurn(id))
  }

  const currentPage = async () => (await deps.devPage?.()) ?? deps.tabHtml

  function fetchPrsWhenDue(id: string, s: SessionState) {
    void prFetches.fetchWhenDue(id, s, () => fetchPrs(hostFor(id), true))
  }

  const isHerdrCheckDue = herdrCheckGate()

  /**
   * Asks Herdr about the running delegates at most each `HERDR_CHECK_MS` while the tab shows the Overview, so a
   * delegate's row follows Herdr while the session waits. The tab's next view shows the change.
   */
  function checkDelegatesWhenDue(id: string, s: SessionState) {
    if (s.shownTab !== 'overview' || !isHerdrCheckDue(id, now())) return
    void delegatesInHerdr(s.ledger.overview, deps.exec)
      .then(states => {
        if (states) return updateState(dir, id, x => overviewChanged(x, o => delegatesSettled(o, states, now())))
      })
      .catch(() => undefined)
  }

  const served = async (s: SessionState, id: string, isDemo = false, holds: Holds = NO_HOLDS): Promise<TabView> => {
    const loadError = deps.loadError?.()
    const current = !isDemo && s.presence.isUpdating ? await reconcileUpdateStatus(dir, id) : s
    const view = viewOf(current, now(), holds)
    const trust = isDemo ? null : hooksTrustNow(current, id)

    return {
      ...view,
      ...(trust ? { hooksTrust: trust } : {}),
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

  async function onPress(id: string, p: RowPress | PrPress, thread: unknown, holds: Holds): Promise<PressReply> {
    await syncTurn(id).catch(() => undefined)
    if (!('ref' in p) && (p.action === 'answer' || p.action === 'type'))
      await linkRunningDialogs(id, p.id).catch(() => undefined)
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

  async function onDemoPress(id: string, p: RowPress | PrPress, thread: unknown, holds: Holds): Promise<PressReply> {
    const s = demoOf(id)
    const r =
      thread === id
        ? pressOn(s, p, now(), { settleWindowMs: SETTLE_WINDOW_MS, holds }, { comparePage: deps.comparePage })
        : ({ stale: true } as const)
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
    const sent = demoSent(r, after.turns)
    if (sent)
      setTimeout(() => {
        const d = demos.get(id)
        if (!d) return
        const replied = demoReplied({ lastActions: d.lastActions, turns: d.presence }, sent)
        demos.set(id, { ...d, lastActions: replied.lastActions, presence: { ...d.presence, ...replied.turns } })
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
        const sentTab = shownTabOf(args.tab)
        const s = await updateState(dir, id, s => {
          const shownTab = drawnTabOf(sentTab ?? s.shownTab, deps.isNextBuild === true)

          return { ...withHolds(lookOnView(s, shownTab, now()), holds), tabSeenAt: now(), shownTab }
        })
        fetchPrsWhenDue(id, s)
        checkDelegatesWhenDue(id, s)
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
          serverInfo: { name: 'inbox', version: '0.2.13' },
        })
      case 'tools/list':
        return ok({ tools: TOOLS })
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
        return ok({ resources: [{ uri: TAB_ADDRESS, name: 'Inbox', mimeType: TAB_MIME }] })
      case 'resources/templates/list':
        return ok({ resourceTemplates: [] })
      case 'resources/read': {
        // Codex drops the frame when the reply names another address than the one it asked for, and a tab opened
        // under an older build asks by that build's address.
        const asked = String(params?.uri ?? '')

        return ok({
          contents: [
            {
              uri: asked.startsWith('ui://inbox/') ? asked : TAB_ADDRESS,
              mimeType: TAB_MIME,
              text: stamped(deps.tabHtml),
            },
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
