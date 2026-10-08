// The plugin's MCP server: Codex's record_finding and close tools, and the
// Inbox tab with the app-only tools it calls. It speaks MCP over stdio by
// hand, since it needs only a few message shapes.

import { isAbsolute, join } from 'node:path'

import { press, recordClose, recordFinding, viewOf } from './core'
import type { TabPress } from './core'
import { readState, updateState } from './state'
import type { SessionState } from './state'
import { CLOSE_DESCRIPTION, FINDING_DESCRIPTION, TAB_DESCRIPTION } from './texts'
import type { Run } from './tree'

export const TAB_URI = 'ui://inbox/tab'
const TAB_MIME = 'text/html;profile=mcp-app'

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['issue', 'opportunity'],
      description: 'issue: something wrong or risky. opportunity: something that could be better.',
    },
    title: { type: 'string', description: 'What it is, in at most 12 plain words.' },
    detail: { type: 'string', description: 'Why it matters and what you would do, in one or two sentences.' },
    path: { type: 'string', description: 'The file it is about, if one.' },
  },
  required: ['kind', 'title', 'detail'],
}

const CLOSE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The id of the open item or finding, such as i35 or f32.' },
    answer: {
      type: 'string',
      description: "The user's answer, in their words and at most 8, when their own message answered it.",
    },
    reason: {
      type: 'string',
      description: 'Otherwise, why it is closed, in at most 8 words, such as "no longer applies: Inbox kept".',
    },
  },
  required: ['id'],
}

const APP_ONLY = { ui: { visibility: ['app'] } }

const TOOLS = [
  { name: 'record_finding', description: FINDING_DESCRIPTION, inputSchema: FINDING_SCHEMA },
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
    description: 'What the Inbox tab shows for this conversation.',
    inputSchema: { type: 'object', properties: {} },
    _meta: APP_ONLY,
  },
  {
    name: 'inbox_press',
    description: 'A press in the Inbox tab.',
    inputSchema: { type: 'object', properties: { press: { type: 'object' } }, required: ['press'] },
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
    for (const target of opens) {
      const path = /^https:\/\//.test(target) || isAbsolute(target) ? target : join(s.root || '/', target)
      await deps.exec(['open', path], { cwd: '/', timeoutMs: 10_000 })
    }

    return { view: viewOf(s, now()), copy, error }
  }

  async function callTool(name: string, args: Record<string, unknown>, id: string | null) {
    if (!id) return { ...text('Not done: this call carries no session id.'), isError: true }
    switch (name) {
      case 'record_finding':
      case 'close': {
        let result = ''
        await updateState(dir, id, s => {
          const r = (name === 'close' ? recordClose : recordFinding)(s, args, now())
          result = r.result
          return r.state
        })
        return text(result)
      }
      case 'inbox': {
        const s = await readState(dir, id)
        return { ...text('Opened the Inbox tab beside the conversation.'), structuredContent: viewOf(s, now()) }
      }
      case 'inbox_view': {
        const s = await updateState(dir, id, s => ({ ...s, tabSeenAt: now() }))
        return { ...text('Inbox view'), structuredContent: viewOf(s, now()) }
      }
      case 'inbox_press': {
        const r = await onPress(id, args.press as TabPress)
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
