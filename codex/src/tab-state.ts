import type { JSX } from 'preact'
import type { IconName } from './row-actions'
import type { ActionEmphasis, RowView } from '../../hooks/rows'
import type { DrawnEntry, DrawnLists } from '../../hooks/action-plan'
import type { Feedback } from '../../hooks/feedback'
import type { ShownTab } from '../../hooks/tabs'
import type { Draft, Finding, Tab } from '../../types'
import type { FoldGroup, SeenRows } from './arrivals'
import type { TabView as View } from './core'
import type { RowTrack } from './rows'
import type { HostContext } from './tab-host'
import type { DrawnPrs, OpenPrBlock } from './tab-pr-steps'

export type Tone = 'needsYou' | 'issue' | 'findings' | 'done' | 'error'

type Emphasis = ActionEmphasis

export type Key = {
  hotkey?: string
  label: string
  emphasis: Emphasis
  isDismiss?: boolean
  icon?: IconName
  isOut?: boolean
  run: () => void
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
  /** Why the agent recommends an answer, as "Why Redis: it survives restarts". */
  recLine?: string
  age?: string
  body?: JSX.Element | null
  keys: Key[]
  more: Key[]
  fold?: { note?: string }
  typing?: { hint: string; send: (text: string) => void }
  feedback: Feedback | null
}

export type Entry = DrawnEntry<Row>

export const selection: Record<Tab, { id: string; openedAt: number; index?: number } | null> = {
  needsYou: null,
  findings: null,
  prs: null,
}

export const drafts = new Map<string, Draft>()
export const optionsShown = new Set<string>()
export const unfolded = new Set<FoldGroup>()
/** The Status's done folds whose finished rows show, by the fold's id. Each starts folded. */
export const statusUnfolded = new Set<string>()
/**
 * The latest press on its way, by row id: its request number, its pending Local result or null for a message, which
 * reads SENDING, and its action, so its button draws as out before the view says so. A reply's action is null, since
 * a reply is never out. `lastBefore` is the row's saved last press when the press started, from `lastPressKey`.
 */
export const sending = new Map<
  string,
  { seq: number; pending: Feedback | null; action: string | null; lastBefore: string }
>()
export const SENDING = 'Sending…'
export const errors = new Map<string, string>()
export const notes = new Map<string, { text: string; at: number }>()
export const copies = new Map<string, { name: string; text: string }>()
export const entering = new Set<string>()
export const undoing = new Set<string>()
/** Folds whose list still shrinks after a press folded them, by the list's motion key after `closed-`. */
export const closingFolds = new Set<string>()
/** A row's or PR block's track, and what it drew open, which it still draws while its height shrinks over it. */
type DrawnRow = { track: RowTrack; openRow?: Row; openBlock?: OpenPrBlock }
export const drawnRows = new Map<string, DrawnRow>()

export type Kept = {
  /** 2 while a page tab shows. An older page reads only version 1, so it drops the whole kept state instead of a tab it cannot draw. */
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
}
export type CandidatePage = {
  initialize: () => Promise<boolean>
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
  tab: ShownTab = 'needsYou'
  /** When this page began showing `tab`. A row that closes since then stays in place no longer than that, as `isSettledInPlace` says. */
  shownSince = Date.now()
  /** Whether Help shows in place of the tab's body. Switching tabs closes it. */
  isHelpShown = false
  typing: string | null = null
  focusTyping = false
  discarded: Record<string, number> = {}
  lineNote: { text: string; at: number; isError?: boolean } | null = null
  seen = new Map<string, number>()
  rowsSeen: SeenRows = {}
  lastLists: Lists | null = null
  /** The PRs tab as the last draw drew it, or null when that draw showed another tab. */
  lastPrs: DrawnPrs | null = null
  requested = 0
  shown = 0
  activePresses = 0
  viewGeneration = 0
  isDisposed = false
  isActive = handoff === null
  requestedPage: string | null = null
  updateError: { page: string; text: string } | null = null
  /** tab.tsx's draw, set when tab.tsx loads. draw renders App, which depends on every other tab file, so they call it here instead of importing tab.tsx. */
  draw!: () => void
}

export const tabState = new TabState()
