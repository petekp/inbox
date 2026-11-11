import type { Timer } from 'claude-code'
import type { Tab } from '../types'
import type { RowRecord } from './arrivals'
import type { PendingUndoScroll } from './pane-selection'
import type { ModLook } from './rows'
import type { ListInput } from './timing'
import type { HerdrAsk } from './herdr-ask'

class PaneState {
  recordedRows: { isDemo: boolean; ids: RowRecord<Tab> } | null = null
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
  /** The ends of the Undos whose end work has yet to run. */
  undoEnds = new Set<number>()
  isUndoLoopRunning = false
  compareRedrawAt: number | null = null
  /** The person's latest run of input on the pane's list, which keeps a row due to fold in place. */
  listInput: ListInput | null = null
  foldRedrawAt: number | null = null
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
  /** The ask of the fetch that runs next, or null when none waits. A second ask joins it. */
  nextFetch: { findsBranchPr: boolean; isPress: boolean } | null = null
  prFetchEndedAt: number | undefined
  /** Stops following the presses the Herdr look writes, in a Herdr app terminal. */
  stopHerdrPresses: (() => void) | null = null
  /** Why the last turn-on could not install or update the inbox's Herdr mod, or null. */
  herdrModFailure: string | null = null
  /** The question before the mod installs the inbox's Herdr mod, while it shows. */
  herdrAsk: HerdrAsk | null = null
}

export const mod = new ModState()
