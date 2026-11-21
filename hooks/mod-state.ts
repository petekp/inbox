import type { Timer } from 'claude-code'
import type { PendingUndoScroll } from './pane-selection'
import type { DemoSent } from './press-effects'
import type { ModLook } from './rows'
import type { HerdrAsk } from './herdr-ask'
import type { UiState } from './ui-controller-types'

class PaneState {
  /** The shared controller's events run one batch at a time, each on the state the last batch saved. */
  uiQueue: Promise<void> = Promise.resolve()
  /** The one timer the controller asks for. `isRead` when the view changes then, not only a drawn frame. */
  uiWake: { at: number; isRead: boolean; timer: Timer } | null = null
  /** The terminal look draws the pane, so the timer keeps its frames and steps while desktop draws beside it. */
  drawsTerminal = false
  /** The terminal drew the last frame. A frame due before then waits for that render, so no frame supersedes it. */
  isTerminalFrameLanded = false
  /** The pane was asked to open and the controller has not heard yet, so a render draws the open's move. */
  isOpenUnheard = false
  /**
   * The states of other conversations this process showed that hold a draft or a sent reply, by conversation id. The
   * engine keeps plugin state per session, and `/clear` starts a new one, so they live here.
   */
  keptUi: Record<string, { ui: UiState; shownAt: number }> = {}
  /** The sample's sent messages, by the controller's press id, which the stand-in agent answers when it is due. */
  demoSends = new Map<number, DemoSent>()
  isInlinePane = false
  isInlineTerminalPane = false
  terminalInlineSize: string | null = null
  inlineSize: string | null = null
  pendingUndoScroll: PendingUndoScroll | null = null
  undoScrollRevision = 0
  /** The desktop app gives a field opened by a press the keys only through `$.ui.focus`, once the field is drawn. */
  focusedKey: string | null = null
  focusHint: string | null = null
  paneLook: ModLook = 'terminal'
  paneClosesOnEscape = true
  /** The row whose field opened while the keys stayed elsewhere, as over text in the prompt. */
  fieldWithoutKeys: string | null = null
  herdrCheckTimer: Timer | null = null
}

export const paneState = new PaneState()

export function cancelUndoScroll(): number {
  paneState.pendingUndoScroll = null
  return ++paneState.undoScrollRevision
}
export function suspendUndoReveal(): number {
  if (paneState.pendingUndoScroll) paneState.pendingUndoScroll.revealUndo = false
  return ++paneState.undoScrollRevision
}

class SessionState {
  /** The conversation whose first prompt has had the Status's head and open subjects carried beside it. */
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

export function resetTurn() {
  sessionState.stepTexts = []
  sessionState.turnBox = null
  sessionState.isDialogDismissed = false
}

class ModState {
  isOn = false
  turningOn: Promise<void> | null = null
  intervals: Timer[] = []
  /** True once a classic.PermissionRequest hook has run, which makes the tool.check fallback unnecessary. */
  hasPermissionRequestHook = false
  queue: Promise<void> = Promise.resolve()
  toolsRefused = false
  version: string | null = null
  /** Whether the installed copy holds `NEXT_BUILD_MARK`, which adds "next" to the version label and keeps Status call records. */
  isNextBuild = false
  /** Where a next build keeps its Status call records, or null on a release build. */
  statusRecordsFolder: string | null = null
  fetchingPrs: Promise<void> = Promise.resolve()
  /** The ask of the fetch that runs next, or null when none waits. A second ask joins it. */
  nextFetch: { findsBranchPr: boolean; isPress: boolean } | null = null
  /** Whether a PR fetch runs now. The poll reads this, since the saved `prViews.isFetching` stays set when the save that clears it fails. */
  isFetchingPrsNow = false
  prFetchEndedAt: number | undefined
  /** Stops following the presses the Herdr look writes, in a Herdr app terminal. */
  stopHerdrPresses: (() => void) | null = null
  /** Why the last turn-on could not install or update the inbox's Herdr mod, or null. */
  herdrModFailure: string | null = null
  /** The question before the mod installs the inbox's Herdr mod, while it shows. */
  herdrAsk: HerdrAsk | null = null
}

export const mod = new ModState()
