import type { PrPress } from './pr-press'
import type { RowPress } from './presses'
import type { ShownTab } from './tabs'
import type { Holds } from './timing'
import { SETTLED_MS } from './timing'
import type { FoldKind, HostFacts, InputKind, LookConfig, Tab, UiCursor, UiState } from '../types'

export type { HostFacts, InputKind, LookConfig, PressOut, UiCursor, UiState } from '../types'

/** How long the demo's stand-in agent takes to answer a press, in every look that runs the demo. */
export const DEMO_REPLY_MS = SETTLED_MS

/** How long a collapse the person made waits for the view to show it, for a host that does not save collapses. */
export const COLLAPSE_WAIT_MS = 30_000

/** How many other sessions' states a host keeps, besides the one it shows. */
export const MAX_KEPT_UI = 20

export const ROW_TAB_IDS: readonly Tab[] = ['needsYou', 'findings', 'prs']

/** The fields of a press's outcome the controller reads. The host keeps the copy line and the Done wake. */
export type SettledOutcome = {
  error: string | null
  note: 'stale' | null
  isUnconfirmed: boolean
  isRowFailed?: boolean
  isDemoSent?: boolean
}

export type UiEvent =
  /** `isFirst`: the look opens with no tab of its own, as a page with nothing kept. */
  | { type: 'opened'; isFirst?: boolean }
  | { type: 'closed' }
  | { type: 'reset' }
  | { type: 'read'; host: HostFacts }
  | { type: 'visible'; isVisible: boolean }
  | { type: 'show-tab'; tab: ShownTab }
  | { type: 'show-help'; isShown: boolean }
  | { type: 'show-ask'; id: string; by: InputKind }
  | { type: 'select'; tab: ShownTab; id: string | null; by: InputKind }
  | { type: 'step'; by: 1 | -1; ids: string[] }
  | { type: 'title-press'; id: string; by: InputKind }
  | { type: 'collapse'; id: string; isCollapsed: boolean }
  | { type: 'fold'; fold: FoldKind; isOpen: boolean }
  | { type: 'status-fold'; id: string; isOpen: boolean }
  | { type: 'earlier'; fold: FoldKind }
  | { type: 'show-options'; id: string }
  | { type: 'fold-all'; isOpening: boolean | null }
  | { type: 'open-field'; id: string; seed?: string }
  | { type: 'edit-draft'; id: string; text: string }
  | { type: 'close-field'; id: string; isDiscard: boolean }
  | { type: 'press'; press: RowPress | PrPress; by: InputKind }
  | { type: 'undo-key' }
  | { type: 'press-settled'; pressId: number; outcome: SettledOutcome }
  | { type: 'list-input' }
  | { type: 'tick' }

export type UiCommand =
  | { kind: 'press'; pressId: number; press: RowPress | PrPress; holds: Holds }
  | { kind: 'save-collapse'; id: string; isCollapsed: boolean }
  | { kind: 'read' }
  | { kind: 'focus-field'; id: string }
  | { kind: 'reveal'; tab: Tab; id: string; closedId: string | null }
  | { kind: 'tab-shown'; tab: ShownTab }
  | { kind: 'demo-reply'; pressId: number }

export type UiStep = { ui: UiState; commands: UiCommand[] }

export const NO_UI_CURSOR: UiCursor = { id: null, index: -1, guard: null }

const NO_FACTS: HostFacts = { isFetchingPrs: false, hasAsksBlocker: false, lastTypedMessageAt: null }

export function freshUi(config: LookConfig, tab: ShownTab = 'needsYou'): UiState {
  return {
    config,
    host: NO_FACTS,
    tab,
    isHelpShown: false,
    shownSince: null,
    isVisible: true,
    isOpening: false,
    opensOnAsks: false,
    isFirstOpen: false,
    rowsSeen: {},
    heldArrivals: {},
    newRows: {},
    closedSeen: {},
    selection: { needsYou: NO_UI_CURSOR, findings: NO_UI_CURSOR, prs: NO_UI_CURSOR },
    statusSelection: null,
    waitingSeen: {},
    heldClose: {},
    restoring: null,
    collapses: {},
    unfolded: [],
    closedAll: [],
    statusUnfolded: [],
    optionsShown: [],
    typing: null,
    drafts: {},
    discarded: {},
    pressesOut: {},
    nextPressId: 1,
    sentReplies: {},
    notes: {},
    errors: {},
    notice: null,
    listInput: null,
    undoSeen: {},
    demoReplies: [],
  }
}

export const withCommands = (ui: UiState, ...commands: UiCommand[]): UiStep => ({ ui, commands })

/** Runs each step on the state the last one left, and gathers their commands. */
export function chain(start: UiStep, ...steps: ((ui: UiState) => UiStep)[]): UiStep {
  return steps.reduce<UiStep>((acc, step) => {
    const next = step(acc.ui)
    return { ui: next.ui, commands: [...acc.commands, ...next.commands] }
  }, start)
}
