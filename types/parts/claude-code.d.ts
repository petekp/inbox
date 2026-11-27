import type { Draft, LastAction, RowNote, SentPrompt } from './press'
import type { FoldKind, Ledger } from './ledger'
import type { Away, Cursor, DemoCopy, Dialog, OldPresence, PageTab, PrViews, Session, Stop, Tab } from './session'

/** What a look sets once. Each value is a difference on purpose in docs/looks.md. */
export type LookConfig = {
  /** Running marks drawn as text frames, which need a wake per frame, or pulsed by the look itself. */
  runningMarks: 'frames' | 'pulse'
  /** A title tint drawn in steps, once at its end, or animated by the look itself. */
  titleTint: 'steps' | 'end' | 'self'
  /** Undo timed from the session's close, or from the look's first read of the settled row. */
  undoClock: 'session' | 'first-read'
}

/** What the host last said about itself. */
export type HostFacts = {
  isFetchingPrs: boolean
  /** Something in the Asks tab's place waits on the person: a stop, an unreadable conversation, a host not heard. */
  hasAsksBlocker: boolean
  lastTypedMessageAt: number | null
}

export type InputKind = 'click' | 'key'

/**
 * A row tab's cursor. `id: null` means no row was picked, so the first waiting row opens. `index` is the row's place
 * among the tab's rows at the last read, or -1 for an id that is not a row, such as a fold line a look selects.
 * `guard` is the input that opened the row, which a second press by the same input cannot land on for
 * `PRESS_GUARD_MS`.
 */
export type UiCursor = { id: string | null; index: number; guard: { by: InputKind; at: number } | null }

export type PressOut = {
  pressId: number
  rowId: string
  tab: Tab | PageTab
  action: string
  isReply: boolean
  at: number
  /** The row's last action when it was pressed, as `lastActionKey` gives it, so a look can tell when a view shows the press. */
  lastBefore: string
  /** The input that pressed. A click that closes its row guards the row the cursor moves to. */
  by: InputKind
}

/** A sent reply whose draft waits for the view to say how the reply went. */
export type SentReply = {
  pressId: number
  text: string
  /** The row's last action's `at` when the reply was pressed, or null when it had none. */
  atBefore: number | null
  isConfirmed: boolean
}

/** A look's interaction state, which the shared controller in `core/view/ui-controller.ts` keeps. */
export type UiState = {
  config: LookConfig
  host: HostFacts

  tab: Tab | PageTab
  isHelpShown: boolean
  shownSince: number | null
  isVisible: boolean
  isOpening: boolean
  opensOnAsks: boolean
  /** The look opened with no tab the person chose, so its Status page gives way to Asks too. */
  isFirstOpen: boolean
  rowsSeen: Partial<Record<Tab, string[]>>
  heldArrivals: Partial<Record<Tab, string[]>>
  /** Each new row's tab, and when its tab first showed it, or null until then. */
  newRows: Record<string, { tab: string; shownAt: number | null }>
  closedSeen: Record<string, number>

  selection: Record<Tab, UiCursor>
  statusSelection: string | null
  waitingSeen: Partial<Record<Tab, string[]>>
  heldClose: Partial<Record<Tab, string>>
  /** The row an Undo brings back, which the cursor selects once it waits again, guarded when a click pressed Undo. */
  restoring: { id: string; at: number; by: InputKind } | null
  collapses: Record<string, { isCollapsed: boolean; at: number }>
  unfolded: FoldKind[]
  closedAll: FoldKind[]
  statusUnfolded: string[]
  optionsShown: string[]

  typing: string | null
  drafts: Record<string, Draft>
  discarded: Record<string, number>
  pressesOut: Record<number, PressOut>
  nextPressId: number
  sentReplies: Record<string, SentReply>
  notes: Record<string, RowNote>
  errors: Record<string, { text: string; at: number }>
  notice: { text: string; at: number; isError: boolean } | null

  /** When the person's use of the list began and when it last went on. */
  listInput: { since: number; last: number } | null
  undoSeen: Record<string, number>

  demoReplies: { pressId: number; dueAt: number }[]
}

declare module 'claude-code' {
  interface PluginState {
    inbox: {
      /** The Claude Code theme in use, such as `dark` or `light-ansi`; '' until read. */
      theme: string
      /** The drawn conversation's session. `revision` counts its writes. */
      session: Session & { revision: number }
      away: Away
      /** The pane's interaction state for the drawn conversation, as the shared controller keeps it. Null until first used. */
      ui: UiState | null
      dialogs: Dialog[]
      /** The fold under the pointer on desktop: an Asks fold's kind, or `status-` and a Status fold's id. */
      foldHover: string | null
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
      /** Builds before the shared controller kept the pane's state in these fields. `upgradeState` moves them into `ui`. */
      tab: Tab
      page: PageTab | null
      selection: Record<Tab, Cursor>
      statusSelection: string | null
      typing: string | null
      drafts: Record<string, Draft>
      discarded: Record<string, number>
      shown: { tab: Tab | PageTab; isDemo: boolean; since: number } | null
      notes: Record<string, RowNote>
      unfolded: FoldKind[]
      closedAll: FoldKind[]
      statusUnfolded: string[]
      optionsShown: string[]
      isHelpShown: boolean
    }
  }
}
