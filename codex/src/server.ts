// The plugin's MCP server: Codex's record_finding and close tools, and the
// Inbox tab with the app-only tools it calls. It speaks MCP over stdio by
// hand, since it needs only a few message shapes.

import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'

import { baseName, localPath, openCommands } from '../../hooks/presses'
import {
  CLOSE_DESCRIPTION,
  CLOSE_SCHEMA,
  FINDING_SCHEMA,
  findingDescription,
  recordClose,
  recordFinding,
} from '../../hooks/tools'
import { press, viewOf } from './core'
import type { TabPress } from './core'
import { demoState } from './demo'
import { readState, updateState } from './state'
import type { SessionState } from './state'
import { CODEX, TAB_DESCRIPTION } from './texts'
import type { Run } from './tree'

export const TAB_URI = 'ui://inbox/tab'
const TAB_MIME = 'text/html;profile=mcp-app'

const APP_ONLY = { ui: { visibility: ['app'] } }

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
      properties: { press: { type: 'object' }, demo: { type: 'boolean' } },
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

const text = (t: string) => ({ content: [{ type: 'text', text: t }] })

export function makeServer(deps: ServerDeps): (m: Message) => Promise<Record<string, unknown> | null> {
  const { dir, now } = deps

  /** Sends a message into the session as the person's own: it runs after any running turn. */
  async function queue(s: SessionState, message: string): Promise<void> {
    const cli = s.cliPath ?? (await deps.fallbackCli())
    const r = await deps.exec([cli, 'queue', '--thread', s.sessionId, '--message', message], {
      cwd: s.root || '/',
      timeoutMs: 15_000,
    })
    if (r.code !== 0) throw new Error(r.stderr.trim() || `codex queue exited ${r.code}`)
  }

  async function onPress(id: string, p: TabPress) {
    let copy: { text: string; name: string } | null = null
    const opens: string[] = []
    let error: string | null = null
    const s = await updateState(dir, id, async s => {
      const r = press(s, p, now())
      if (!r) return s
      // Sent while the lock is held, so a send that fails leaves the row as it was.
      for (const e of r.effects) {
        if (e.kind === 'send') await queue(r.state, e.text)
        else if (e.kind === 'open') opens.push(e.target)
        else copy = { text: e.text, name: e.name }
      }

      return r.state
    }).catch(async (err: unknown) => {
      error = `Not sent: ${err instanceof Error ? err.message : String(err)}`
      return readState(dir, id)
    })
    for (const target of opens) error = (await open(s, target)) ?? error

    return { view: viewOf(s, now()), copy, error }
  }

  /** Opens a link, or a path as `openCommands` decides, and says why when it could not. */
  async function open(s: SessionState, target: string): Promise<string | null> {
    const run = (argv: string[]) => deps.exec(argv, { cwd: '/', timeoutMs: 10_000 })
    if (/^https:\/\//.test(target)) return (await run(['open', target])).code === 0 ? null : `Could not open ${target}`
    const path = localPath(target, s.root || '/', s.home)
    const info = await stat(path).catch(() => null)
    if (!info) return `${baseName(path)} is not there anymore`
    const isExecutable =
      info.isFile() &&
      (await access(path, constants.X_OK).then(
        () => true,
        () => false,
      ))
    const { argv, fallback } = openCommands(path, info.isFile(), isExecutable)
    const r = await run(argv)
    const retry = r.code !== 0 && fallback ? await run(fallback) : r

    return retry.code === 0 ? null : `Could not open ${baseName(path)}: ${retry.stderr.trim()}`
  }

  // Each conversation's demo, kept in memory only: it starts over when the server does.
  const demos = new Map<string, SessionState>()
  const demoOf = (id: string) => {
    const s = demos.get(id) ?? demoState(now())
    demos.set(id, s)
    return s
  }

  /** A press in the demo changes only its copy and sends nothing. */
  function onDemoPress(id: string, p: TabPress) {
    const r = press(demoOf(id), p, now())
    if (r) demos.set(id, r.state)
    const copy = r?.effects.find(e => e.kind === 'copy')

    return { view: viewOf(demoOf(id), now()), copy: copy ? { text: copy.text, name: copy.name } : null, error: null }
  }

  async function callTool(name: string, args: Record<string, unknown>, id: string | null) {
    if (!id) return { ...text('Not done: this call carries no session id.'), isError: true }
    switch (name) {
      case 'record_finding':
      case 'close': {
        let result = ''
        await updateState(dir, id, s => {
          const r = (name === 'close' ? recordClose : recordFinding)(CODEX, s.ledger, args, now())
          result = r.result
          return { ...s, ledger: r.ledger }
        })
        return text(result)
      }
      case 'inbox': {
        const s = await readState(dir, id)
        return { ...text('Opened the Inbox tab beside the conversation.'), structuredContent: viewOf(s, now()) }
      }
      case 'inbox_view': {
        if (args.demo === true) return { ...text('Inbox demo'), structuredContent: viewOf(demoOf(id), now()) }
        const s = await updateState(dir, id, s => ({ ...s, tabSeenAt: now() }))
        return { ...text('Inbox view'), structuredContent: viewOf(s, now()) }
      }
      case 'inbox_press': {
        const r =
          args.demo === true ? onDemoPress(id, args.press as TabPress) : await onPress(id, args.press as TabPress)
        return { ...text(r.error ?? 'Done'), structuredContent: r }
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
          return ok(await callTool(name, args, sessionOf(params)))
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
