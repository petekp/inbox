import type { Draft, LastAction, RowNote, SentPrompt } from './press'
import type { FoldKind, Ledger } from './ledger'
import type { Away, Cursor, DemoCopy, Dialog, OldPresence, PageTab, PrViews, Session, Stop, Tab } from './session'

declare module 'claude-code' {
  /**
   * The inbox's `order_prs` call, as `hooks/tools.ts:ORDER_SCHEMA` gives it. A session writes the MCP tool types only
   * for the tools it had connected, so an older build's session leaves this one out.
   */
  interface McpToolInputs {
    mcp__inbox__order_prs: { repo?: string; numbers: number[]; label?: string; why?: string }
  }
  interface PluginState {
    inbox: {
      /** The Claude Code theme in use, such as `dark` or `light-ansi`; '' until read. */
      theme: string
      /** The drawn conversation's session. `revision` counts its writes. */
      session: Session & { revision: number }
      away: Away
      tab: Tab
      /** The page tab shown in place of `tab`, or null while a row tab shows. */
      page: PageTab | null
      selection: Record<Tab, Cursor>
      /** The Status row whose keys work, by id. Null until j or k moves it. */
      statusSelection: string | null
      dialogs: Dialog[]
      /** The row whose free-text field is open, if any. */
      typing: string | null
      /** Each row's unsent typed words, by the row's id, kept while the field closes or another row opens. */
      drafts: Record<string, Draft>
      /** When the person discarded each held row's reply, by the row's id, so the row folds without settling. */
      discarded: Record<string, number>
      /**
       * The tab the pane shows, whether it shows the sample, and since when. Rows that close since then stay in place.
       * Null while the pane is closed.
       */
      shown: { tab: Tab | PageTab; isDemo: boolean; since: number } | null
      /** Each row's latest note, by the row's id. */
      notes: Record<string, RowNote>
      /** The Asks groups and the kinds of finding whose closed items show. Each starts folded. */
      unfolded: FoldKind[]
      foldHover: FoldKind | null
      /** The questions whose every option shows, by the row's id. */
      optionsShown: string[]
      /** Whether the pane shows its Help page in place of the shown tab's body. */
      isHelpShown: boolean
      /** The sample entries the band and pane show instead of the session's own, while `/inbox demo` is on. */
      demo: DemoCopy | null
      /** Whether `/inbox demo recording` started the demo, which then leaves out the notices that mark its samples. */
      isDemoRecording: boolean
      /** The conversation whose saved session the store could not read. Saves skip it until a read succeeds. */
      unreadable: string | null
      /** A fresh value redraws the pane, as when a row's note or a Queued label is due. */
      redraw: number
      /** A fresh value redraws only the pane, for the next frame of a running mark. */
      runningFrame: number
      /** The line the person sees under each inbox tool call that has one, by the call's `tool_use_id`. */
      personLines: Record<string, string>
      /** Builds before the shared session kept the session in these fields. `upgradeDrawn` moves them into `session`. */
      ledger: Ledger
      presence: OldPresence
      prViews: PrViews
      stop: Stop | null
      lastActions: Record<string, LastAction>
      sent: SentPrompt[]
      untrackedSent: { sessionId: string; text: string }[]
    }
  }
}
