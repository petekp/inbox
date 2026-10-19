import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'

import {
  applyPrPress,
  fetchTracked,
  isDismissing,
  isTracked,
  itemPrSteps,
  prRowId,
  splitLinked,
} from '../../hooks/pr-tab'
import type { Applied, PrPress } from '../../hooks/pr-tab'
import {
  applyPress,
  demoRecord,
  demoTurns,
  doneWake,
  localPath,
  markSentToAgent,
  recordPress,
  withDeliveryId,
  noteText,
  openCommands,
  runLocalEffects,
  runSends,
  withAcceptedSend,
  withLasts,
  withUnconfirmed,
} from '../../hooks/presses'
import type { EffectHost, RowPress } from '../../hooks/presses'
import {
  CLOSE_DESCRIPTION,
  CLOSE_SCHEMA,
  PROGRESS_SCHEMA,
  RECORD_SCHEMA,
  progressDescription,
  progressResult,
  progressText,
  recordDescription,
  recordClose,
  recordItem,
} from '../../hooks/tools'
import { noteToolCall, viewOf, withSubagentChange } from './core'
import type { TabView } from './core'
import { demoState } from './demo'
import { ghFinder, ghIn } from './gh'
import { pruneClosed } from '../../hooks/ledger'
import { NO_HOLDS, SETTLED_MS } from '../../hooks/view'
import type { ReplyHolds } from '../../hooks/view'
import { SETTLE_WINDOW_MS } from './settle'
import { pruneSessions, readState, updateState } from './state'
import { reconcileUpdateStatus } from './update'
import type { SessionState } from './state'
import { CODEX, INBOX_DESCRIPTION, inboxToolText, VIEW_DESCRIPTION } from './texts'
import type { Run } from './run'
import type { LastAction, PrViews, RowNote } from '../../types'

/** Codex keeps a tab's page by its address, even across server restarts, so a new build needs a new address for a new chat to load it. */
export function tabUri(tabHtml: string): string {
  return `ui://inbox/tab-${createHash('sha256').update(tabHtml).digest('hex').slice(0, 12)}`
}
const TAB_MIME = 'text/html;profile=mcp-app'

const APP_ONLY = { ui: { visibility: ['app'] } }
const PRS_REFRESH_MS = 120_000
const NEW_PR_FETCH_MS = 15_000

type Pressed = Exclude<Applied, { stale: true }>

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
  { name: 'record', description: recordDescription(CODEX), inputSchema: RECORD_SCHEMA },
  { name: 'close', description: CLOSE_DESCRIPTION, inputSchema: CLOSE_SCHEMA },
  { name: 'progress', description: progressDescription(CODEX), inputSchema: PROGRESS_SCHEMA },
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
  build?: string
  loadError?: () => string | null
  isPluginFolderGone?: () => boolean
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

/** For a call a subagent made, its thread id, which its hooks carry as `agent_id`; null for any other call. */
export function subagentOf(params: Record<string, unknown> | undefined): string | null {
  const meta = (params?._meta ?? {}) as Record<string, unknown>
  const turn = meta['x-codex-turn-metadata']
  if (typeof turn !== 'object' || turn === null) return null
  const t = turn as Record<string, unknown>
  const isSubagent = typeof t.parent_thread_id === 'string' && t.parent_thread_id !== ''

  return isSubagent && typeof t.thread_id === 'string' && t.thread_id ? t.thread_id : null
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
  const fetchingPrs = new Set<string>()
  const prunedFor = new Set<string>()
  const prsFetchedAt = new Map<string, number>()
  let isGhMissing = false

  async function queueMessage(
    s: SessionState,
    message: string,
    resolvedCli?: string,
  ): Promise<
    | { state: 'accepted'; queuedId: string | null }
    | { state: 'rejected'; reason: string }
    | { state: 'unconfirmed'; reason: string }
  > {
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

  function completedAttempt(
    state: SessionState,
    deliveryId: string,
    outcome: Awaited<ReturnType<typeof queueMessage>>,
  ): SessionState {
    if (outcome.state === 'rejected') return { ...state, sent: state.sent.filter(s => s.deliveryId !== deliveryId) }
    const index = state.sent.findIndex(s => s.deliveryId === deliveryId)
    const attempt = state.sent[index]
    if (!attempt) return state
    const earlierUnknown = state.sent
      .slice(0, index)
      .some(s => s.text === attempt.text && (s.phase === 'attempting' || s.phase === 'uncertain'))
    let lastActions = state.lastActions
    if (outcome.state === 'accepted' && !earlierUnknown) {
      for (const [id, action] of Object.entries(lastActions)) {
        if (action.delivery && 'id' in action.delivery && action.delivery.id === deliveryId)
          lastActions = withAcceptedSend(lastActions, [id], action.at, attempt.text, deliveryId)
      }
    }
    return {
      ...state,
      lastActions,
      sent: state.sent.map(s =>
        s.deliveryId === deliveryId
          ? {
              ...s,
              phase: outcome.state === 'accepted' ? ('accepted' as const) : ('uncertain' as const),
              queuedId: outcome.state === 'accepted' ? outcome.queuedId : null,
            }
          : s,
      ),
    }
  }

  async function wakeForDone(id: string) {
    const check = (s: SessionState) =>
      doneWake(s.ledger, { now: now(), windowMs: SETTLE_WINDOW_MS, isTurnRunning: s.turn.person !== null })
    if (!check(await readState(dir, id))) return
    await updateState(dir, id, async (s, checkpoint) => {
      const wake = check(s)
      if (!wake) return s
      const cli = s.cliPath ?? (await deps.fallbackCli())
      const deliveryId = randomUUID()
      const lastActions = { ...s.lastActions }
      for (const closed of s.ledger.closed) {
        if (!wake.ids.includes(closed.id)) continue
        const previous = lastActions[closed.id]
        const last =
          previous?.kind === 'mark' && previous.action === 'done' && previous.at === closed.at
            ? previous
            : recordPress('mark', 'done', 'Done', { now: closed.at, turnsStarted: s.presence.turnsStarted })
        lastActions[closed.id] = { ...last, delivery: { state: 'unconfirmed', message: wake.text, id: deliveryId } }
      }
      const next: SessionState = {
        ...s,
        ledger: markSentToAgent(s.ledger, wake.ids),
        lastActions,
        sent: [
          ...s.sent,
          {
            text: wake.text,
            press: { id: wake.ids[0]!, action: 'done' },
            at: now(),
            row: wake.ids[0]!,
            queuedId: null,
            pressedAt: null,
            deliveryId,
            phase: 'attempting',
          },
        ],
      }
      await checkpoint(next)
      return completedAttempt(next, deliveryId, await queueMessage(next, wake.text, cli))
    })
  }

  const currentPage = async () => (await deps.devPage?.()) ?? deps.tabHtml

  const pressOn = (
    s: SessionState,
    p: RowPress | PrPress,
    at = now(),
    localPressId?: string,
  ): Pressed | { stale: true } => {
    const ctx = { now: at, turnsStarted: s.presence.turnsStarted, localPressId }
    if ('ref' in p) return applyPrPress(s.ledger, s.prViews, s.lastActions, p, ctx)
    const item = s.ledger.items.find(i => i.id === p.id)
    const r = applyPress(s.ledger, s.lastActions[p.id], p, {
      ...ctx,
      extraSteps: item ? itemPrSteps(item, s.prViews, s.ledger.prs) : [],
    })
    if ('stale' in r) return r

    return {
      ledger: r.ledger,
      lasts: r.last ? { [p.id]: r.last } : {},
      drop: [],
      effects: r.effects,
      ...(r.reopenedId ? { reopenedId: r.reopenedId } : {}),
    }
  }

  async function fetchPrs(id: string) {
    const s = await readState(dir, id)
    const bin = await gh.find()
    isGhMissing = bin === null
    if (bin === null) return
    let sawUnstartable = false
    const fetchWith = (path: string) =>
      fetchTracked(
        ghIn(deps.exec, path, s.root, () => {
          sawUnstartable = true
        }),
        s.prViews,
        s.ledger.prs,
        true,
      )
    let fetch = await fetchWith(bin)
    if (sawUnstartable) {
      gh.forget()
      const refound = await gh.find()
      isGhMissing = refound === null
      if (refound === null) return
      if (refound !== bin) fetch = await fetchWith(refound)
    }
    const { views: fetched, branchRef } = fetch
    await updateState(dir, id, cur => {
      const at = now()
      const views = Object.fromEntries(
        Object.entries(fetched).filter(([ref]) => isTracked({ ...cur.prViews, branchRef }, cur.ledger.prs, ref)),
      )
      const dismissing = Object.fromEntries(
        Object.entries(cur.prViews.views).filter(([ref]) => isDismissing(cur.lastActions, ref, at)),
      )

      return { ...cur, prViews: { views: { ...dismissing, ...views }, branchRef, isFetching: false } }
    })
  }

  function fetchPrsWhenDue(id: string, s: SessionState) {
    if (fetchingPrs.has(id)) return
    const last = prsFetchedAt.get(id)
    const hasNewPr = splitLinked(s.ledger.prs).tracked.some(ref => !(ref in s.prViews.views))
    const isDue = last === undefined || now() - last >= PRS_REFRESH_MS || (hasNewPr && now() - last >= NEW_PR_FETCH_MS)
    if (!isDue) return
    fetchingPrs.add(id)
    void fetchPrs(id)
      .catch(() => undefined)
      .finally(() => {
        prsFetchedAt.set(id, now())
        fetchingPrs.delete(id)
      })
  }

  const served = async (
    s: SessionState,
    id: string,
    isDemo = false,
    holds: ReplyHolds = NO_HOLDS,
  ): Promise<TabView> => {
    const loadError = deps.loadError?.()
    const current = !isDemo && s.presence.isUpdating ? await reconcileUpdateStatus(dir, id) : s

    return {
      ...viewOf(current, now(), holds),
      thread: id,
      isFetchingPrs: !isDemo && fetchingPrs.has(id),
      isGhMissing: !isDemo && isGhMissing,
      devPage: tabUri(await currentPage()),
      ...(deps.build ? { serverBuild: deps.build } : {}),
      ...(loadError ? { serverLoadError: loadError } : {}),
      ...(deps.isPluginFolderGone?.() ? { isPluginFolderGone: true } : {}),
    }
  }

  async function onPress(id: string, p: RowPress | PrPress, thread: unknown, holds: ReplyHolds): Promise<PressReply> {
    const rowId = 'ref' in p ? prRowId(p) : p.id
    const localPressId = randomUUID()
    let checkpointSaved = false
    let appliedSaved = false
    let isUnconfirmed = false
    let copy: PressReply['copy'] = null
    let error: string | null = null
    let note: PressReply['note'] = thread === id ? null : 'stale'
    const pressed: { r?: Pressed; deliveryId?: string } = {}
    const hostFor = (
      change: (f: (s: SessionState) => SessionState | Promise<SessionState>) => Promise<SessionState>,
    ): EffectHost => ({
      now,
      deliveryId: () => pressed.deliveryId ?? randomUUID(),
      perform: async e => {
        if (e.kind === 'copy') {
          copy = { text: e.text, name: e.name }
          return null
        }
        return open(await readState(dir, id), e.target)
      },
      send: async (e, deliveryId) => {
        let sentOutcome: Awaited<ReturnType<typeof queueMessage>> | null = null
        return change(async s => {
          const outcome = await queueMessage(s, e.text)
          sentOutcome = outcome
          if (outcome.state === 'unconfirmed') isUnconfirmed = true
          return completedAttempt(s, deliveryId, outcome)
        }).then(
          () =>
            sentOutcome?.state === 'accepted'
              ? { state: 'accepted' as const }
              : sentOutcome?.state === 'rejected'
                ? { state: 'rejected' as const, reason: sentOutcome.reason }
                : { state: 'unconfirmed' as const, reason: sentOutcome?.reason ?? 'Queue outcome unknown' },
          (err: unknown) => ({
            state: 'unconfirmed' as const,
            reason: err instanceof Error ? err.message : String(err),
          }),
        )
      },
      saveLasts: async f => (await change(s => ({ ...s, lastActions: f(s.lastActions) }))).lastActions,
      saveLedger: async f => {
        await change(s => ({ ...s, ledger: f(s.ledger) }))
      },
    })
    await updateState(dir, id, async (saved, checkpoint) => {
      const s: SessionState = { ...saved, heldRows: Object.keys(holds.replies) }
      if (note) return s
      // Read under the lock, so the press is timed after every write that landed before it.
      const at = now()
      const r = pressOn(s, p, at, localPressId)
      if ('stale' in r) {
        note = 'stale'
        return s
      }
      pressed.r = r
      const firstSend = r.effects.find(e => e.kind === 'send')
      pressed.deliveryId = firstSend ? randomUUID() : undefined
      const pressLasts =
        firstSend && pressed.deliveryId
          ? withDeliveryId(r.lasts, Object.keys(r.lasts), at, firstSend.text, pressed.deliveryId)
          : r.lasts
      let next: SessionState = {
        ...s,
        ledger: r.ledger,
        lastActions: withLasts(s.lastActions, pressLasts, r.drop),
        told: r.reopenedId ? { ...s.told, closed: s.told.closed.filter(id => id !== r.reopenedId) } : s.told,
      }
      if (firstSend && pressed.deliveryId) {
        next = {
          ...next,
          lastActions: withUnconfirmed(next.lastActions, firstSend.text, at, pressed.deliveryId),
          sent: [
            ...next.sent,
            {
              text: firstSend.text,
              press: firstSend.by,
              at: now(),
              row: rowId,
              queuedId: null,
              pressedAt: at,
              deliveryId: pressed.deliveryId,
              phase: 'attempting',
            },
          ],
        }
        await checkpoint(next)
        checkpointSaved = true
      }
      const held = hostFor(async f => (next = await f(next)))
      const failed = await runSends(held, r.effects, rowId, Object.keys(r.lasts), at)
      if (failed?.state === 'rejected') error = `Not sent: ${failed.reason}`

      return next
    })
      .then(() => {
        appliedSaved = true
      })
      .catch((err: unknown) => {
        if (checkpointSaved) isUnconfirmed = true
        error = checkpointSaved ? null : `Not sent: ${err instanceof Error ? err.message : String(err)}`
      })
    if (pressed.r && !('ref' in p) && p.action === 'done')
      setTimeout(() => void wakeForDone(id).catch(() => undefined), SETTLE_WINDOW_MS).unref()
    if (pressed.r && (appliedSaved || checkpointSaved))
      await runLocalEffects(
        hostFor(f => updateState(dir, id, f)),
        pressed.r.effects,
        rowId,
        pressed.r.lasts[rowId]?.result,
      )

    return {
      view: await served(await readState(dir, id), id, false, holds),
      copy,
      error,
      note,
      ...(isUnconfirmed ? { delivery: 'unconfirmed' as const } : {}),
    }
  }

  /** Opens a link, or a path as `openCommands` decides. Returns why it could not, or null. */
  async function open(s: SessionState, target: string): Promise<string | null> {
    const run = (argv: string[]) => deps.exec(argv, { cwd: '/', timeoutMs: 10_000 })
    const failure = (r: { code: number; stderr: string }) => r.stderr.trim() || `open exited ${r.code}`
    if (/^https:\/\//.test(target)) {
      const r = await run(['open', target])
      return r.code === 0 ? null : failure(r)
    }
    const path = localPath(target, s.root || '/', s.home)
    const info = await stat(path).catch(() => null)
    if (!info) return 'it no longer exists'
    const isExecutable =
      info.isFile() &&
      (await access(path, constants.X_OK).then(
        () => true,
        () => false,
      ))
    const { argv, fallback } = openCommands(path, info.isFile(), isExecutable)
    const r = await run(argv)
    const retry = r.code !== 0 && fallback ? await run(fallback) : r

    return retry.code === 0 ? null : failure(retry)
  }

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
    const r = thread === id ? pressOn(s, p) : ({ stale: true } as const)
    if ('stale' in r) return { view: await served(s, id, true, holds), copy: null, error: null, note: 'stale' }
    const { lasts, isSample } = demoRecord(r.lasts, r.effects)
    const next: SessionState = {
      ...s,
      ledger: pruneClosed(r.ledger, new Set(Object.keys(holds.replies))),
      lastActions: withLasts(s.lastActions, lasts, r.drop),
      presence: { ...s.presence, ...demoTurns(s.presence, r.effects) },
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
      note: isSample ? 'sample' : null,
    }
  }

  async function callTool(
    name: string,
    args: Record<string, unknown>,
    id: string | null,
    turn: string | null | undefined,
    subagent: string | null,
  ) {
    if (!id) return { ...text('Not done: this call carries no session id.'), isError: true }
    const heard = (s: SessionState) => (turn === undefined ? s : noteToolCall(s, turn, now()))
    switch (name) {
      case 'record':
      case 'close': {
        let result = ''
        await updateState(dir, id, s => {
          const r = (name === 'close' ? recordClose : recordItem)(CODEX, s.ledger, args, now())
          result = r.result
          return heard({ ...s, ledger: r.ledger })
        })
        return text(result)
      }
      case 'progress': {
        const shown = progressText(args)
        if (shown === null) return text(progressResult.empty)
        let result = progressResult.unlisted
        await updateState(dir, id, s => {
          if (subagent !== null) {
            if (!s.subagents.some(x => x.id === subagent)) return s
            result = progressResult.shown(CODEX)
            return withSubagentChange(s, subagent, { progress: shown }, now())
          }
          if (turn === undefined) return s
          result = progressResult.shown(CODEX)
          return heard({ ...s, presence: { ...s.presence, progress: shown } })
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
        return { ...text(r.error ?? (r.note ? noteText(r.note) : 'Done')), structuredContent: r }
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
          serverInfo: { name: 'inbox', version: '0.2.8' },
        })
      case 'tools/list':
        return ok({ tools })
      case 'tools/call': {
        const name = String(params?.name ?? '')
        const args = (params?.arguments ?? {}) as Record<string, unknown>
        const session = sessionOf(params)
        try {
          const result = ok(await callTool(name, args, session, turnOf(params), subagentOf(params)))
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
