import { makeCompanion } from './server-companion'
import type { CompanionHandler } from '../../core/remote/companion-protocol'
import type { RunWithInput } from './run'
import type { DelegateSession } from '../../core/remote/hc-terminals'
import type { PrPress } from '../../core/view/pr-press'
import { noteText } from '../../core/view/press-reducer'
import type { RowPress } from '../../core/domain/presses'
import { preconditionsOf } from '../../core/domain/preconditions'
import { recorded, withHolds } from '../../core/runtime/session-presses'
import type { RowNote } from '../../types'
import type { HerdrFile } from '../../core/remote/herdr-press-file'
import type { StartedFile } from '../../core/remote/herdr-app'
import { withCollapse } from '../../core/view/collapse'
import { lookOnView, noteToolCall, viewOf } from './core'
import type { TabView } from './core'
import type { HooksTrust } from './hook-trust'
import { codexStore } from './host'
import type { OnWrite } from './host'
import { makeCatchUpOnOpen } from './server-catch-up'
import { makeDemo } from './server-demo'
import { makeSessionHost } from './server-host'
import { linkedPrReads } from './server-pr-links'
import {
  holdsOf,
  listedToolFields,
  noteToolsListed,
  sessionOf,
  shownRowsOf,
  shownTabOf,
  stamped,
  TAB_ADDRESS,
  TAB_MIME,
  TOOLS,
  turnOf,
} from './server-tools'
import { makeHooksTrustNow } from './server-trust'
import { makeBackground } from './background'
import { pruneSessions, readState, recordMatchesNow, updateState } from './state'
import { readViewers } from './viewers'
import { isPrsTabViewed } from '../../core/runtime/remote-viewers'
import { addsTabPr } from '../../core/runtime/host-prs'
import type { SessionState } from './state'
import { CODEX, inboxToolText } from './texts'
import type { CodexHerdrAsk } from './server-herdr'
import type { SteerResult, SteerTarget } from './app-steer'
import { withPreviewPages } from '../../core/runtime/preview-pages'
import type { PreviewPages } from '../../core/runtime/preview-pages'

export type ServerDeps = {
  dir: string
  now: () => number
  exec: RunWithInput
  tabHtml: string
  /** The codex binary to run `queue` with when no hook has named one yet. */
  fallbackCli: () => Promise<string>
  devPage?: () => Promise<string | null>
  /**
   * What Codex lists for the inbox's hooks in a folder, the chat's or else the home folder, or null when it cannot say.
   * Without it, the tab does not say when Codex is not running the inbox's hooks.
   */
  hooksTrust?: (cli: string, folder: string) => Promise<HooksTrust | 'trusted' | null>
  /** Puts a press's message into a running turn the ChatGPT app owns. Without it, every press queues. */
  steer?: (to: SteerTarget) => Promise<SteerResult>
  /** Whether `codex queue` on a binary takes `--resume`. Without it, a press never passes `--resume`. */
  queueResumes?: (cli: string) => Promise<boolean>
  build?: string
  loadError?: () => string | null
  isPluginFolderGone?: () => boolean
  isNextBuild?: boolean
  /** The page template for a comparison, beside the handler's bundle. */
  comparePage: string
  /** Where each session's previews pages go, and the write that fills them. Without it, no page is written. */
  previewPages?: PreviewPages
  /**
   * Where a chat the inbox has not seen is caught up from when its tab opens. Without it, the chat catches up at its
   * first hook.
   */
  openCatchUp?: {
    codexHome: string
    startUpdate: (sessionId: string) => void
  }
  /** Reports each state the server writes to the Herdr app terminal Codex runs in. */
  onWrite?: OnWrite
  /** Starts applying the presses the Herdr look writes, with `apply`. */
  followHerdrPresses?: (apply: (sessionId: string, file: HerdrFile) => Promise<StartedFile>) => void
  /**
   * Starts calling `heard` with each session whose saved state changed, as when a hook saved it. The server then reads
   * the PRs when the save shows a PR on the tab that no read has tried.
   */
  followSaves?: (heard: (sessionId: string) => void) => void
  /** The question before the tab installs the inbox's Herdr mod. Without it, the tab never asks. */
  herdrAsk?: CodexHerdrAsk
  /** The delegate session Codex runs as, as `core/remote/hc-terminals.ts:delegateSession` reads it. Without it, none. */
  delegate?: () => Promise<DelegateSession | null>
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

/**
 * Answers one message. `settled` resolves once the PR fetches, their state updates, the prune, the delegate check and
 * the reads of heard saves it started have ended.
 */
export type Server = ((m: Message) => Promise<Record<string, unknown> | null>) & {
  settled(): Promise<void>
  companion: CompanionHandler
}

export function makeServer(given: ServerDeps): Server {
  const { onWrite } = given
  // Each report reads the newest state itself, so a tool call or press answers without waiting on `hc label`.
  const deps = { ...given, onWrite: onWrite && (async (s: SessionState) => void onWrite(s).catch(() => undefined)) }
  const { dir, now } = deps
  const prunedFor = new Set<string>()
  /** Each chat's newest turn in its rollout, as its last view read it. */
  const newestTurns = new Map<string, string>()
  const hooksTrustNow = makeHooksTrustNow(deps, newestTurns)
  const catchUpOnOpen = makeCatchUpOnOpen(deps)

  const currentPage = async () => (await deps.devPage?.()) ?? deps.tabHtml
  const background = makeBackground()
  const { wakeAfterSettle, fetchPrsNow, fetchPrsWhenDue, checkDelegatesWhenDue, served, onPress, onHerdrFile } =
    makeSessionHost(deps, newestTurns, hooksTrustNow, currentPage, background)
  const { demoOf, onDemoPress, collapseDemo } = makeDemo(deps, served)
  const linkedPrs = linkedPrReads(id => readState(dir, id), fetchPrsNow)
  deps.followHerdrPresses?.(onHerdrFile)
  deps.followSaves?.(id => background.track(linkedPrs.heard(id)))

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
        let added = null as SessionState | null
        const delegate = (await deps.delegate?.().catch(() => null)) ?? null
        const earlier = name === 'record' ? await recordMatchesNow(args, now()) : []
        const place = deps.previewPages?.placeOf(id) ?? null
        const saved = await codexStore(dir, id, now, deps.onWrite).update(s => {
          const r = recorded(CODEX, s, name, args, now(), listedToolFields(), delegate, earlier)
          result = r.result
          if (addsTabPr(s, r.state)) added = r.state
          return withPreviewPages(heard(r.state), place)
        })
        if (place) await deps.previewPages?.write(place, saved.ledger)
        if (added) {
          linkedPrs.asked(added)
          fetchPrsNow(id)
        }
        return text(result)
      }
      case 'inbox': {
        const s = turn === undefined ? await readState(dir, id) : await updateState(dir, id, heard, now)
        return text(inboxToolText(viewOf(s, now())))
      }
      case 'inbox_view': {
        const holds = holdsOf(args)
        if (args.demo === true)
          return { ...text('Inbox demo'), structuredContent: await served(demoOf(id), id, true, holds) }
        await wakeAfterSettle(id).catch(() => undefined)
        await catchUpOnOpen(id).catch(() => undefined)
        const sentTab = shownTabOf(args.tab)
        const s = await updateState(
          dir,
          id,
          s => {
            const shownTab = sentTab ?? s.shownTab

            const looked = lookOnView(s, shownTab, now(), shownRowsOf(args))
            return { ...withHolds(looked, holds), tabSeenAt: now(), shownTab }
          },
          now,
        )
        fetchPrsWhenDue(id, s)
        checkDelegatesWhenDue(id, s)
        return { ...text('Inbox view'), structuredContent: await served(s, id, false, holds) }
      }
      case 'inbox_tab_page':
        return { ...text('Tab page'), structuredContent: { html: stamped(await currentPage()) } }
      case 'inbox_press': {
        const asked = args.press as { action?: unknown; isYes?: unknown; id?: unknown; isCollapsed?: unknown }
        if (asked.action === 'herdr-ask' && deps.herdrAsk) {
          const r = await deps.herdrAsk.answer(asked.isYes === true)
          return { ...text(r.failure ?? 'Done'), structuredContent: r }
        }
        if (asked.action === 'collapse' && typeof asked.id === 'string') {
          const [row, isCollapsed, holds] = [asked.id, asked.isCollapsed === true, holdsOf(args)]
          const view =
            args.demo === true
              ? await collapseDemo(id, row, isCollapsed, holds)
              : await served(
                  await codexStore(dir, id, now, deps.onWrite).update(s => withCollapse(s, row, isCollapsed, now())),
                  id,
                  false,
                  holds,
                )
          return { ...text('Done'), structuredContent: { view, copy: null, error: null, note: null } }
        }
        const p = args.press as RowPress | PrPress
        const holds = holdsOf(args)
        const when = preconditionsOf(args.when)
        if (when === null) return { ...text('when is not a list of known checks'), isError: true }
        const r = await (args.demo === true
          ? onDemoPress(id, p, args.thread, holds)
          : onPress(id, p, args.thread, holds, when))
        return { ...text(r.error ?? (r.note ? noteText() : 'Done')), structuredContent: r }
      }
    }

    return { ...text(`Unknown tool: ${name}`), isError: true }
  }

  const handle = async (m: Message) => {
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
        noteToolsListed()
        return ok({ tools: TOOLS })
      case 'tools/call': {
        const name = String(params?.name ?? '')
        const args = (params?.arguments ?? {}) as Record<string, unknown>
        const session = sessionOf(params)
        try {
          const result = ok(await callTool(name, args, session, turnOf(params)))
          if (session && !prunedFor.has(session)) {
            prunedFor.add(session)
            background.track(pruneSessions(dir, session))
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

  const companion = makeCompanion(deps, {
    opened: async id => {
      const errors: string[] = []
      for (const recover of [wakeAfterSettle, catchUpOnOpen]) {
        try {
          await recover(id)
        } catch (error) {
          errors.push(error instanceof Error ? error.message : 'Inbox recovery could not finish.')
        }
      }
      return errors
    },
    apply: async (id, file) => void (await (await onHerdrFile(id, file)).waiting?.()),
    fetch: async (id, state) =>
      fetchPrsWhenDue(id, state, isPrsTabViewed((await readViewers(deps.dir, id)).leases, now())),
    trust: hooksTrustNow,
  })
  return Object.assign(handle, { settled: background.settled, companion })
}
