import type { JSX } from 'preact'
import { freshUi } from '../../core/view/ui-controller-types'
import type { InputKind, LookConfig, UiState } from '../../core/view/ui-controller-types'
import type { IconName } from './row-actions'
import type { ActionEmphasis, RowView } from '../../core/view/rows'
import type { DrawnEntry, DrawnLists } from '../../core/view/action-plan'
import type { Feedback } from '../../core/view/feedback'
import type { RowPart } from '../../core/view/row-parts'
import type { ShownTab } from '../../core/view/tabs'
import type { Draft, Finding, PressKind, Tab } from '../../types'
import type { FoldGroup } from './arrivals'
import type { TabView as View } from './core'
import type { RowTrack } from '../../core/view/row-motion'
import type { HostContext } from './tab-host'
import type { DrawnPrs, OpenPrBlock } from './tab-pr-steps'
import type { DrawnStatus } from './tab-status-steps'
import type { BannerLine } from './tab-line-steps'
import type { HerdrAsk } from '../../core/remote/herdr-ask'

export type Tone = 'needsYou' | 'issue' | 'findings' | 'tasks' | 'done' | 'opportunity' | 'error'

type Emphasis = ActionEmphasis

export type Key = {
  hotkey?: string
  label: string
  note?: string
  emphasis: Emphasis
  isDismiss?: boolean
  icon?: IconName
  isOut?: boolean
  run: (by: InputKind) => void
}

export type Row = {
  id: string
  view?: RowView
  handle: string
  handleTone?: Tone
  /** The mark is a running mark, which fades while what the row sent is on its way. */
  isHandleRunning?: boolean
  /** A PR row's mark says its work is done. */
  isMarkDone?: boolean
  kind?: Finding['kind']
  lead?: string
  title: string
  meta?: string
  /** The open subjects an ask holds up, as "Holds up Offline sync, Hotfix release". */
  holdsUp?: string
  /** Whether the open row draws a tree under its title, which its ◆ or □ in the mark column starts. */
  hasTree?: boolean
  age?: string
  /** Draws the open row's body at each render, so a decision a draw makes after rendering, such as whether a question's answers fit one line, reaches it. */
  body?: () => JSX.Element
  /**
   * The last part an open ask's body draws, at each render. Each part of the body carries its own gap from the part
   * above. A row without it, as a PR row, draws its body as one part, its `detail`.
   */
  bodyEnd?: () => RowPart
  /** An open question's answers, which its tree draws as buttons. Their hotkeys press them. */
  options: Key[]
  keys: Key[]
  more: Key[]
  fold?: { note?: string }
  typing?: { hint: string; send: (text: string) => void }
  feedback: Feedback | null
}

export type Entry = DrawnEntry<Row>

/** The Codex tab's settings for the shared controller: running marks pulse, the page animates title tints, and Undo times from the first read. */
export const CODEX_LOOK: LookConfig = { runningMarks: 'pulse', titleTint: 'self', undoClock: 'first-read' }

/**
 * What the tab keeps of each press the controller has out, by its press id: its row, its pending Local result or null
 * for a message, which reads SENDING, `lastBefore`, the row's saved last press when the press started, from
 * `lastPressKey`, and `kind`, the kind of the plan action pressed, or null for a press no plan action makes, such as
 * Undo or a typed reply.
 */
export const localOuts = new Map<
  number,
  { rowId: string; pending: Feedback | null; lastBefore: string; kind: PressKind | null }
>()

export const SENDING = 'Sending…'
export const copies = new Map<string, { name: string; text: string }>()
export const entering = new Set<string>()
/** Folds whose list still shrinks after a press folded them, by the list's motion key after `closed-`. */
export const closingFolds = new Set<string>()
/**
 * A row's or PR block's track, the PR block it drew open, which it still draws while its height shrinks over it, and
 * the entry of the form a row leaves, which it draws over the form it takes while `drawsFormLeft` holds.
 */
type DrawnRow = { track: RowTrack; openBlock?: OpenPrBlock; left?: Entry }
export const drawnRows = new Map<string, DrawnRow>()

export type Kept = {
  /**
   * 2 while a page tab shows. A page before the Status page reads only version 1, so it drops the whole kept state
   * instead of a tab it cannot draw. The fields up to `statusUnfolded` are what pages before `ui` read.
   */
  version: 1 | 2
  isDemo: boolean
  tab: ShownTab
  selection: Record<Tab, string | null>
  typing: string | null
  /** An earlier page kept each draft as its text alone. */
  drafts: [string, Draft | string][]
  optionsShown: string[]
  /** An earlier page kept 'finding' for the one fold the Finds tab had. */
  unfolded: (FoldGroup | 'finding')[]
  /** Missing on a state an earlier page kept. */
  shownSince?: number
  /** Missing on a state an earlier page kept. */
  statusUnfolded?: string[]
  /** The shared controller's state, from `restoredUi`. Missing on a state an earlier page kept. */
  ui?: { version: 3; state: UiState }
}
/**
 * A page a swap starts beside the one it replaces. `prepare` reads its first view with the state the old page keeps,
 * before it shows, and resolves whether it has one. A page from before `prepare` reads its first view once it starts.
 */
export type CandidatePage = {
  initialize: () => Promise<boolean>
  prepare?: (kept: Kept) => Promise<boolean>
  activate: (kept: Kept) => void
  start: () => void
  dispose: () => void
}
export type PageHandoff = {
  page: string
  root: HTMLDivElement
  aborted: boolean
  dispose?: () => void
  ready: (candidate: CandidatePage) => void
}

export const inboxWindow = window as Window & {
  __inboxPage?: string
  __inboxKept?: Kept
  __inboxRequestId?: number
  __inboxHandoff?: PageHandoff
}
export const handoff = inboxWindow.__inboxHandoff ?? null
export const root = handoff?.root ?? document.getElementById('app')!
export const instanceAbort = new AbortController()
export const timers = new Set<number>()
export const animations = new Set<Animation>()
export const pending = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer?: number }
>()

export type Lists = DrawnLists<Row>
class TabState {
  view: View | null = null
  isDemo = false
  readError: string | null = null
  serverNote: { text: string; kind: 'server-gone' | 'server-load-failed' | 'server-builds-differ' } | null = null
  isConnected = false
  stagedHostChanges: HostContext = {}
  pollFailures = 0
  readAt = 0
  /** The person's state in the tab, which the shared controller runs. A page with nothing kept opens on the Status page. */
  ui: UiState = freshUi(CODEX_LOOK, 'overview')
  /** The last view the server sent, which the controller reads. `view` is it as drawn, with the collapses the person made. */
  serverView: View | null = null
  /** The field the next draw focuses. */
  focusField: string | null = null
  /** Whether the draw under way shows a read of the view, not the person's input. */
  isReadDraw = false
  /** Whether the read under way carries the answer to a press, so what it brings shows at once, as a press does. */
  isAnswerDraw = false
  lastLists: Lists | null = null
  /** The PRs tab as the last draw drew it, or null when that draw showed another tab. */
  lastPrs: DrawnPrs | null = null
  /** The Status page's lists as the last draw drew them, or null when that draw showed another tab. */
  lastStatus: DrawnStatus | null = null
  /** The banners under the tab bar as the last draw drew them, or null before a view. */
  lastBanners: BannerLine[] | null = null
  requested = 0
  shown = 0
  activePresses = 0
  viewGeneration = 0
  isDisposed = false
  isActive = handoff === null
  requestedPage: string | null = null
  updateError: { page: string; text: string } | null = null
  /** The Herdr question as this tab's last press left it, drawn in place of the server's until `SETTLED_MS` after the answer. */
  herdrAsk: HerdrAsk | null = null
  /** Why the tab's last Install press failed. */
  herdrFailure: string | null = null
  /** tab.tsx's draw, set when tab.tsx loads. draw renders App, which depends on every other tab file, so they call it here instead of importing tab.tsx. */
  draw!: () => void
}

export const tabState = new TabState()
