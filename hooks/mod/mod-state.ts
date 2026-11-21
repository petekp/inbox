import type { Timer } from 'claude-code'
import type { PendingUndoScroll } from '../pane/pane-selection'
import type { DemoSent } from '../../core/runtime/press-effects'
import type { ModLook } from '../../core/view/rows'
import type { HerdrAsk } from '../../core/remote/herdr-ask'
import type { UiState } from '../../core/view/ui-controller-types'
import type { DrawnVersions } from '../../core/view/press-preconditions'
import { memoryViewerStores } from '../../core/runtime/remote-viewers'

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
  /** The load revision of a conversation still loading. Until it ends, the controller sees the pane closed. */
  loadingRevision: number | null = null
  /**
   * The row versions and PR heads of the view the pane last painted. The controller's view is read again for each event,
   * so a press checks against these, which are what the person saw.
   */
  paintedVersions: DrawnVersions | null = null
  /** The last list input, kept out of the saved state so a pointer move writes nothing and redraws nothing. */
  listInput: UiState['listInput'] = null
  /**
   * The lowest id the next press may take. `$.state` starts over on `/clear`, `/resume` and `/branch`, and this does
   * not, so a late answer from the conversation left never matches a press in the next.
   */
  nextPressId = 1
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

/** The viewer leases of the Herdr looks that show a session this process publishes, kept out of the saved session. */
export const viewerLeases = memoryViewerStores()
