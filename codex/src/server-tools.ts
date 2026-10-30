import { createHash } from 'node:crypto'

import { agentTools } from '../../hooks/tools'
import { isShownTab } from '../../hooks/view'
import type { Holds, ShownTab } from '../../hooks/view'
import { CODEX, INBOX_DESCRIPTION, VIEW_DESCRIPTION } from './texts'

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
export const TAB_ADDRESS = 'ui://inbox/view'
export const TAB_MIME = 'text/html;profile=mcp-app'

const APP_ONLY = { ui: { visibility: ['app'] } }

export const TOOLS = [
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
export function holdsOf(args: Record<string, unknown>): Holds {
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
export function shownTabOf(raw: unknown): ShownTab | null {
  return isShownTab(raw) ? raw : null
}

export function stamped(tabHtml: string): string {
  return tabHtml.replace(
    '</head>',
    () => `<script>window.__inboxPage = ${JSON.stringify(pageName(tabHtml))}</script></head>`,
  )
}

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
