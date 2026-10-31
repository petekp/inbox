import type { Timer } from 'claude-code'
import type { Tab } from '../types'
import type { RowRecord } from './arrivals'
import type { PendingUndoScroll } from './pane-selection'
import type { ModLook } from './rows'

class PaneState {
  recordedRows: { isDemo: boolean; ids: RowRecord<Tab> } | null = null
  isInlinePane = false
  isInlineTerminalPane = false
  terminalInlineSize: string | null = null
  inlineSize: string | null = null
  pendingUndoScroll: PendingUndoScroll | null = null
  undoScrollRevision = 0
  /**
   * The desktop app takes the focus off the pane when the Button holding it leaves the drawing, and
   * the next click there only brings it back (anthropics/claude-code#100874).
   */
  focusedKey: string | null = null
  focusHint: string | null = null
  paneLook: ModLook = 'terminal'
  paneClosesOnEscape = true
  /** The row whose field opened while the keys stayed elsewhere, as over text in the prompt. */
  fieldWithoutKeys: string | null = null
  undoRedrawsUntil = -Infinity
  compareRedrawAt: number | null = null
  herdrCheckTimer: Timer | null = null
}

export const paneState = new PaneState()

class SessionState {
  /** The conversation whose first prompt has had the Status tab's headline and status carried beside it. */
  carriedFor: string | null = null
  /** Why the last conversation ended, until the next conversation loads. */
  endReason: string | null = null
  stepTexts: string[] = []
  /** True once an API error has set this turn's stop. */
  hasStopFromError = false
  turnBox: string | null = null
  isDialogDismissed = false
  loadRevision = 0
  applyingConversation: Promise<void> = Promise.resolve()
  isReadingAgain = false
  resuming: { is: 'sending' } | { is: 'refused'; why: string } | null = null
  stopGeneration = 0
  saving: Promise<void> = Promise.resolve()
  /** How many changes went to a saved session that is not drawn, so a load can tell its read is out of date. */
  savedWrites = 0
  shellCommand: string | null = null
}

export const sessionState = new SessionState()

class ModState {
  isOn = false
  turningOn: Promise<void> | null = null
  intervals: Timer[] = []
  /** True once a classic.PermissionRequest hook has run, which makes the tool.check fallback unnecessary. */
  hasPermissionRequestHook = false
  queue: Promise<void> = Promise.resolve()
  toolsRefused = false
  version: string | null = null
  isNextBuild = false
  /** Where a next build keeps its Status call records, or null on a release build. */
  statusRecordsFolder: string | null = null
  fetchingPrs: Promise<void> = Promise.resolve()
  nextFetchFindsBranchPr: boolean | null = null
  prFetchEndedAt: number | undefined
}

export const mod = new ModState()
