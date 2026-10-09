// The plugin's MCP server: Codex's record_finding and close tools, and the
// Inbox tab with the app-only tools it calls. It speaks MCP over stdio by
// hand, since it needs only a few message shapes.

import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'

import { applyPress, finishedResult, localPath, noteText, openCommands, withResult } from '../../hooks/presses'
import type { Effect, RowPress } from '../../hooks/presses'
import {
  CLOSE_DESCRIPTION,
  CLOSE_SCHEMA,
  FINDING_SCHEMA,
  findingDescription,
  recordClose,
  recordFinding,
} from '../../hooks/tools'
import { noteToolCall, viewOf } from './core'
import type { TabView } from './core'
import { demoState } from './demo'
import { readState, updateState } from './state'
import type { SessionState } from './state'
import { CODEX, TAB_DESCRIPTION } from './texts'
import type { Run } from './run'
import type { LastAction, LocalResult, RowNote } from '../../types'

export const TAB_URI = 'ui://inbox/tab'
const TAB_MIME = 'text/html;profile=mcp-app'

const APP_ONLY = { ui: { visibility: ['app'] } }
const MAX_SENT = 20

const TOOLS = [
  { name: 'record_finding', description: findingDescription(CODEX), inputSchema: FINDING_SCHEMA },
  { name: 'close', description: CLOSE_DESCRIPTION, inputSchema: CLOSE_SCHEMA },
  {
    name: 'inbox',
    title: 'Inbox',
    description: TAB_DESCRIPTION,
    inputSchema: { type: 'object', properties: {} },
    _meta: { ui: { resourceUri: TAB_URI }, 'openai/ui': { entrypoints: [{ type: 'thread' }] } },
  },
  {
    name: 'inbox_view',
    description: 'What the Inbox tab shows for this conversation, or its demo.',
    inputSchema: { type: 'object', properties: { demo: { type: 'boolean' } } },
    _meta: APP_ONLY,
  },
  {
    name: 'inbox_press',
    description: 'A press in the Inbox tab.',
    inputSchema: {
      type: 'object',
      properties: { press: { type: 'object' }, thread: { type: 'string' }, demo: { type: 'boolean' } },
      required: ['press'],
    },
    _meta: APP_ONLY,
  },
]

export type ServerDeps = {
  dir: string
  now: () => number
  exec: Run
  tabHtml: string
  /** The codex binary to run `queue` with when no hook has named one yet. */
  fallbackCli: () => Promise<string>
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

function withoutDelivery({ delivery: _delivery, ...last }: LastAction): LastAction {
  return last
}

/** What the tab hears back from a press: the view after it, text to copy, why it failed, or a note for its row. */
type PressReply = {
  view: TabView
  copy: { text: string; name: string } | null
  error: string | null
  note: RowNote['note'] | null
}

export function makeServer(deps: ServerDeps): (m: Message) => Promise<Record<string, unknown> | null> {
  const { dir, now } = deps

  /**
   * Sends a message into the session as the person's own: it runs after any
   * running turn. Returns the id `codex queue` printed for it, or null when it printed none.
   */
  async function queue(s: SessionState, message: string): Promise<string | null> {
    const cli = s.cliPath ?? (await deps.fallbackCli())
    const r = await deps.exec([cli, 'queue', '--thread', s.sessionId, '--message', message], {
      cwd: s.root || '/',
      timeoutMs: 15_000,
    })
    if (r.code !== 0) throw new Error(r.stderr.trim() || `codex queue exited ${r.code}`)

    return /Queued message (\S+)/.exec(r.stdout)?.[1] ?? null
  }

  /** The view for the tab, with the session it was read for. */
  const served = (s: SessionState, id: string): TabView => ({ ...viewOf(s, now()), thread: id })

  /**
   * Applies a press drawn for `thread` in session `id`'s state. A press drawn
   * for another session, or for a row that changed, sends nothing and returns a stale note.
   */
  async function onPress(id: string, p: RowPress, thread: unknown): Promise<PressReply> {
    let copy: PressReply['copy'] = null
    let local = null as { effects: Effect[]; pending: LocalResult } | null
    let error: string | null = null
    let note: PressReply['note'] = thread === id ? null : 'stale'
    let s = await updateState(dir, id, async s => {
      if (note) return s
      const r = applyPress(s.ledger, s.lastActions[p.id], p, {
        now: now(),
        turnsStarted: s.presence.turnsStarted,
        extraSteps: [],
      })
      if ('stale' in r) {
        note = 'stale'
        return s
      }
      let next: SessionState = {
        ...s,
        ledger: r.ledger,
        lastActions: r.last ? { ...s.lastActions, [p.id]: r.last } : s.lastActions,
        // Codex was told of the close; with the id out of `told`, a second close of the row is reported too.
        told: p.action === 'undo' ? { ...s.told, closed: s.told.closed.filter(id => id !== p.id) } : s.told,
      }
      if (r.last?.result?.state === 'pending') local = { effects: r.effects, pending: r.last.result }
      // Sent while the lock is held, so no other write lands between the press and its undoing.
      for (const e of r.effects) {
        if (e.kind === 'send') {
          try {
            const queuedId = await queue(next, e.text)
            next = {
              ...next,
              sent: [...next.sent, { text: e.text, press: e.by, at: now(), row: p.id, queuedId }].slice(-MAX_SENT),
            }
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err)
            error = `Not sent: ${reason}`
            copy = null
            // The press is undone: the state before it, and its row says why.
            const failed = r.last && { ...r.last, delivery: { state: 'failed' as const, reason } }
            return failed ? { ...s, lastActions: { ...s.lastActions, [p.id]: failed } } : s
          }
        } else if (e.kind === 'copy') copy = { text: e.text, name: e.name }
      }

      return next
    }).catch(async (err: unknown) => {
      error = `Not sent: ${err instanceof Error ? err.message : String(err)}`
      return readState(dir, id)
    })
    // Opens run outside the lock. The tab copies, and shows the text to copy by hand when its frame has no clipboard.
    const ran = local
    if (ran) {
      const errors: (string | null)[] = []
      for (const e of ran.effects)
        if (e.kind !== 'send') errors.push(e.kind === 'open' ? await open(s, e.target) : null)
      const result = finishedResult(ran.pending, errors, now())
      s = await updateState(dir, id, s => ({
        ...s,
        lastActions: withResult(s.lastActions, p.id, ran.pending.at, result),
      }))
    }

    return { view: served(s, id), copy, error, note }
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

  // Each conversation's demo, kept in memory only: it starts over when the server does.
  const demos = new Map<string, SessionState>()
  const demoOf = (id: string) => {
    const s = demos.get(id) ?? demoState(now())
    demos.set(id, s)
    return s
  }

  /** A press in the demo changes only its copy and performs nothing: each send, open or copy gives its row the sample note. */
  function onDemoPress(id: string, p: RowPress, thread: unknown): PressReply {
    const s = demoOf(id)
    const r =
      thread === id
        ? applyPress(s.ledger, s.lastActions[p.id], p, {
            now: now(),
            turnsStarted: s.presence.turnsStarted,
            extraSteps: [],
          })
        : ({ stale: true } as const)
    if ('stale' in r) return { view: served(s, id), copy: null, error: null, note: 'stale' }
    // The demo opens nothing, so a Local press records no result there. A sample
    // send goes nowhere, so nothing would ever clear its Queued.
    const isLocal = r.last?.result !== undefined
    const sample = r.last && !isLocal ? withoutDelivery(r.last) : null
    demos.set(id, {
      ...s,
      ledger: r.ledger,
      lastActions: sample ? { ...s.lastActions, [p.id]: sample } : s.lastActions,
    })

    return {
      view: served(demoOf(id), id),
      copy: null,
      error: null,
      note: r.effects.length > 0 ? 'sample' : null,
    }
  }

  async function callTool(
    name: string,
    args: Record<string, unknown>,
    id: string | null,
    turn: string | null | undefined,
  ) {
    if (!id) return { ...text('Not done: this call carries no session id.'), isError: true }
    // A call from Codex's model shows whether UserPromptSubmit recorded its turn. The tab's calls show nothing.
    const heard = (s: SessionState) => (turn === undefined ? s : noteToolCall(s, turn, now()))
    switch (name) {
      case 'record_finding':
      case 'close': {
        let result = ''
        await updateState(dir, id, s => {
          const r = (name === 'close' ? recordClose : recordFinding)(CODEX, s.ledger, args, now())
          result = r.result
          return heard({ ...s, ledger: r.ledger })
        })
        return text(result)
      }
      case 'inbox': {
        const s = turn === undefined ? await readState(dir, id) : await updateState(dir, id, heard)
        return { ...text('Opened the Inbox tab beside the conversation.'), structuredContent: viewOf(s, now()) }
      }
      case 'inbox_view': {
        if (args.demo === true) return { ...text('Inbox demo'), structuredContent: served(demoOf(id), id) }
        const s = await updateState(dir, id, s => ({ ...s, tabSeenAt: now() }))
        return { ...text('Inbox view'), structuredContent: served(s, id) }
      }
      case 'inbox_press': {
        const p = args.press as RowPress
        const r = args.demo === true ? onDemoPress(id, p, args.thread) : await onPress(id, p, args.thread)
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
          serverInfo: { name: 'inbox', version: '0.1.0' },
        })
      case 'tools/list':
        return ok({ tools: TOOLS })
      case 'tools/call': {
        const name = String(params?.name ?? '')
        const args = (params?.arguments ?? {}) as Record<string, unknown>
        try {
          return ok(await callTool(name, args, sessionOf(params), turnOf(params)))
        } catch (err) {
          return ok({ ...text(`Failed: ${err instanceof Error ? err.message : String(err)}`), isError: true })
        }
      }
      case 'resources/list':
        return ok({ resources: [{ uri: TAB_URI, name: 'Inbox', mimeType: TAB_MIME }] })
      case 'resources/templates/list':
        return ok({ resourceTemplates: [] })
      case 'resources/read':
        return ok({ contents: [{ uri: TAB_URI, mimeType: TAB_MIME, text: deps.tabHtml }] })
      case 'ping':
        return ok({})
    }
    if (id === undefined) return null

    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }
  }
}
