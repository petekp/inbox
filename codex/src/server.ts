import { delegatesSettled } from '../../hooks/children'
import type { Run } from '../../hooks/gh'
import { delegatesInHerdr, herdrCheckGate } from '../../hooks/herdr'
import type { PrPress } from '../../hooks/pr-press'
import { noteText } from '../../hooks/presses'
import type { RowPress } from '../../hooks/presses'
import { statusChanged } from '../../hooks/session-status'
import { recorded, withHolds } from '../../hooks/session-presses'
import { drawnTabOf } from '../../hooks/view'
import type { RowNote } from '../../types'
import { lookOnView, noteToolCall, viewOf } from './core'
import type { TabView } from './core'
import type { HooksTrust } from './hook-trust'
import { makeCatchUpOnOpen } from './server-catch-up'
import { makeDemo } from './server-demo'
import { makeSessionHost } from './server-host'
import { holdsOf, sessionOf, shownTabOf, stamped, TAB_ADDRESS, TAB_MIME, TOOLS, turnOf } from './server-tools'
import { makeHooksTrustNow } from './server-trust'
import { pruneSessions, readState, updateState } from './state'
import type { SessionState } from './state'
import { CODEX, inboxToolText } from './texts'

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
  /** Whether `codex queue` on a binary takes `--resume`. Without it, a press never passes `--resume`. */
  queueResumes?: (cli: string) => Promise<boolean>
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
  const prunedFor = new Set<string>()
  /** Each chat's newest turn in its rollout, as its last view read it. */
  const newestTurns = new Map<string, string>()
  const hooksTrustNow = makeHooksTrustNow(deps, newestTurns)
  const catchUpOnOpen = makeCatchUpOnOpen(deps)

  const currentPage = async () => (await deps.devPage?.()) ?? deps.tabHtml
  const { wakeForDone, fetchPrsWhenDue, served, onPress } = makeSessionHost(
    deps,
    newestTurns,
    hooksTrustNow,
    currentPage,
  )
  const { demoOf, onDemoPress } = makeDemo(deps, served)

  const isHerdrCheckDue = herdrCheckGate()

  /**
   * Asks Herdr about the running delegates at most each `HERDR_CHECK_MS` while the tab shows the Status, so a
   * delegate's row follows Herdr while the session waits. The tab's next view shows the change.
   */
  function checkDelegatesWhenDue(id: string, s: SessionState) {
    if (s.shownTab !== 'overview' || !isHerdrCheckDue(id, now())) return
    void delegatesInHerdr(s.ledger.overview, deps.exec)
      .then(states => {
        if (states) return updateState(dir, id, x => statusChanged(x, o => delegatesSettled(o, states, now())))
      })
      .catch(() => undefined)
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
      case 'close':
      case 'order_prs': {
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
          serverInfo: { name: 'inbox', version: VERSION },
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
