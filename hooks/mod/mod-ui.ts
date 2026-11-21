import { titleTintEndsAt } from '../../core/view/arrivals'
import { upgradedUnfolded } from '../pane/fold-keys'
import { allRows, type ModLook } from '../../core/view/rows'
import type { SessionView } from '../../core/view/session-view'
import { isRowTab, isShownTab, type ShownTab } from '../../core/view/tabs'
import { reduceUi } from '../../core/view/ui-controller'
import { readWakeAt } from '../../core/view/ui-controller-clock'
import { newRowsOf } from '../../core/view/ui-controller-tabs'
import { earliestOf, SETTLED_MS } from '../../core/view/timing'
import {
  freshUi,
  NO_UI_CURSOR,
  type HostFacts,
  type LookConfig,
  type UiCommand,
  type UiCursor,
  type UiEvent,
  type UiState,
} from '../../core/view/ui-controller-types'
import type { Cursor, Draft, FoldKind, RowNote, Tab } from '../../types'

/** The terminal draws running marks as text frames and the title tint in steps. */
const MOD_TERMINAL_LOOK: LookConfig = { runningMarks: 'frames', titleTint: 'steps', undoClock: 'session' }

/** Desktop pulses running marks and draws the title tint once at its end, since a redraw loop there blocks clicks. */
const MOD_DESKTOP_LOOK: LookConfig = { runningMarks: 'pulse', titleTint: 'end', undoClock: 'session' }

export const lookConfigOf = (look: ModLook): LookConfig => (look === 'desktop' ? MOD_DESKTOP_LOOK : MOD_TERMINAL_LOOK)

/** The saved state, or a fresh one, with the config of the look that draws the pane. */
export function modUiOf(saved: UiState | null, look: ModLook): UiState {
  const config = lookConfigOf(look)

  return saved === null ? freshUi(config) : { ...saved, config }
}

/** What the drawn session says about its host. A stop and an unread conversation hold the Asks tab's place. */
export function hostFactsOf(drawn: {
  prViews: { isFetching: boolean }
  stop: unknown
  isUnread: boolean
  lastTypedMessageAt: number | null
}): HostFacts {
  return {
    isFetchingPrs: drawn.prViews.isFetching,
    hasAsksBlocker: drawn.stop !== null || drawn.isUnread,
    lastTypedMessageAt: drawn.lastTypedMessageAt,
  }
}

type UiApplied = { ui: UiState; commands: UiCommand[]; nextWakeAt: number | null }

/** Runs `events` through the shared controller in order, each on the state the last one left. */
export function applyUiEvents(ui: UiState, view: SessionView, events: readonly UiEvent[], now: number): UiApplied {
  let applied: UiApplied = { ui, commands: [], nextWakeAt: null }
  for (const event of events) {
    const step = reduceUi(applied.ui, view, event, now)
    applied = { ui: step.ui, commands: [...applied.commands, ...step.commands], nextWakeAt: step.nextWakeAt }
  }

  return applied
}

/**
 * Whether the wake at `at` reads the view again and redraws both looks: the view changes on the clock, or a title tint
 * ends. A running mark's frame or a tint or Undo step redraws only the terminal.
 */
export function isReadWake(ui: UiState, view: SessionView, at: number, now: number): boolean {
  const readAt = readWakeAt(ui, view, now)
  const tintEndsAt = titleTintEndsAt(newRowsOf(ui), view, new Map(Object.entries(ui.closedSeen)), now)

  return [readAt, tintEndsAt].some(t => t !== null && t <= at)
}

/** How many times the terminal draws an Undo while its fill drains, two for each cell of the fill. */
const UNDO_STEPS = 24

/** The next step of an Undo fill the terminal draws, which no controller wake covers, or null when none drains. */
export function undoStepAt(view: SessionView, now: number): number | null {
  const step = Math.ceil(SETTLED_MS / UNDO_STEPS)
  const states = [...allRows(view).map(r => r.state), ...view.prs.drawn.map(d => d.state)]
  const steps = states.flatMap(s => {
    if (s.is !== 'settled' || !s.canUndo || now >= s.at + SETTLED_MS) return []
    const endsAt = s.at + SETTLED_MS
    const stepAt = s.at + (Math.floor((now - s.at) / step) + 1) * step

    return [Math.min(endsAt, stepAt > now ? stepAt : stepAt + step)]
  })

  return earliestOf(steps)
}

/**
 * The events with the pane's open first, when the engine shows the pane and the controller's state has it closed, as
 * when the pane was drawn without `/inbox` or restored with the app. The open reads at once, so its move to Asks comes
 * before the batch's own events. A close comes only from `ui.close`, since the engine can report a pane `/inbox` just
 * opened as not shown yet.
 */
export function withPaneShown(events: (UiEvent | 'read')[], ui: UiState, isPaneOpen: boolean): (UiEvent | 'read')[] {
  const isSetHere = events.some(e => e !== 'read' && (e.type === 'opened' || e.type === 'closed'))
  const isOpenUnseen = isPaneOpen && ui.shownSince === null

  return isOpenUnseen && !isSetHere ? [{ type: 'opened' }, 'read', ...events] : events
}

/** The fields an older build kept the pane's state in. */
export type OldPaneFields = {
  tab: string
  page: string | null
  selection: Partial<Record<Tab | 'waiting', Partial<Cursor>>>
  statusSelection: string | null
  typing: string | null
  drafts: Record<string, Draft | string>
  discarded: Record<string, number>
  shown: { since: number } | null
  notes: Record<string, RowNote>
  unfolded: string[]
  closedAll: FoldKind[]
  statusUnfolded: string[]
  optionsShown: string[]
  isHelpShown: boolean
}

function oldTab(tab: string, page: string | null): ShownTab {
  if (isShownTab(page) && !isRowTab(page)) return page
  const renamed = tab === 'notes' ? 'findings' : tab === 'waiting' ? 'needsYou' : tab

  return isShownTab(renamed) && isRowTab(renamed) ? renamed : 'needsYou'
}

/** An older cursor names its row and place. No guard survives a reload. */
const oldCursor = (c: Partial<Cursor> | undefined): UiCursor =>
  c?.id ? { id: c.id, index: c.index ?? -1, guard: null } : NO_UI_CURSOR

/**
 * The controller's state from an older build's fields. `now` dates a draft saved as bare text, so a row that closed
 * before this load stays closed.
 */
export function uiFromOldFields(old: OldPaneFields, config: LookConfig, now: number): UiState {
  const { waiting, ...cursors } = old.selection
  const selection = { needsYou: waiting, ...cursors }
  const drafts = Object.fromEntries(
    Object.entries(old.drafts).map(([id, d]) => [id, typeof d === 'string' ? { text: d, since: now } : d]),
  )

  return {
    ...freshUi(config, oldTab(old.tab, old.page)),
    shownSince: old.shown?.since ?? null,
    isHelpShown: old.isHelpShown,
    selection: {
      needsYou: oldCursor(selection.needsYou),
      findings: oldCursor(selection.findings),
      prs: oldCursor(selection.prs),
    },
    statusSelection: old.statusSelection,
    typing: old.typing,
    drafts,
    discarded: old.discarded,
    notes: old.notes,
    unfolded: upgradedUnfolded(old.unfolded),
    closedAll: old.closedAll,
    statusUnfolded: old.statusUnfolded,
    optionsShown: old.optionsShown,
  }
}
