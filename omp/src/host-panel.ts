import { version } from '../package.json'

import type { PrPress } from '../../core/view/pr-press'
import { startedFile, startHerdrFile } from '../../core/remote/herdr-app'
import type { StartedFile } from '../../core/remote/herdr-app'
import type { HerdrFile } from '../../core/remote/herdr-press-file'
import type { RowPress } from '../../core/domain/presses'
import type { Precondition } from '../../core/domain/preconditions'
import { lookEndedOn, withLook } from '../../core/runtime/session-status'
import type { ShownRows } from '../../core/domain/status-children'
import { withHolds } from '../../core/runtime/session-presses'
import { sessionView } from '../../core/view/session-view'
import { NO_SYNC_INPUTS } from '../../core/view/sync-state'
import { press, wakeAfterSettle } from '../../core/runtime/host-press'
import type { PressOutcome } from '../../core/runtime/host-press'
import { heldReplies, NO_HOLDS } from '../../core/view/timing'
import { RESUME_TEXT } from '../../core/view/banners'
import type { Holds } from '../../core/view/timing'
import type { RowNote } from '../../types'
import { isUiWorthKeeping } from '../../core/view/ui-controller'
import type { UiState } from '../../core/view/ui-controller-types'
import type { ShownTab } from '../../core/view/tabs'
import type { PanelSource } from './controller'
import type { PanelScreen } from './panel'
import { readState } from './state'
import { sessionIdOf } from './host-context'
import { withCollapse } from '../../core/view/collapse'
import type { HostContext, OmpContext } from './host-context'
import type { SessionCalls } from './host-sessions'
import type { OmpHerdrAsk } from './host-herdr-ask'

/** What a panel needs from the host. */
export type Inbox = {
  screen(ctx: OmpContext, holds?: Holds, notes?: Record<string, RowNote>): Promise<PanelScreen>
  /**
   * Marks the panel open, showing its first tab from `openedAt`, and runs what a freshly opened panel needs: Done
   * messages due, and a PR fetch when due.
   */
  openPanel(ctx: OmpContext, openedAt: number): Promise<void>
  /** Records the tab an open panel shows. A new tab saves `holds`, with the showing the panel started. */
  showTab(ctx: OmpContext, tab: ShownTab, holds: Holds): void
  /**
   * Closes the panel. The rows the kept drafts hold stay in place, and the panel's state is saved for a later omp when
   * it holds a draft or a reply on its way.
   */
  closePanel(ctx: OmpContext): void
  /** The panel state a panel of this session kept, in this omp or saved by an earlier one, or null. */
  savedUi(ctx: OmpContext): Promise<UiState | null>
  /** Keeps the panel's state for the next panel, and saves the rows `holds` names as held. */
  keepUi(ctx: OmpContext, ui: UiState, holds: Holds): void
  /** Notes that the panel has the Status subject rows `ids` on screen now, for the look under way. */
  showRows(ctx: OmpContext, ids: string[]): void
  fetchPrsWhenDue(ctx: OmpContext, isTabShown: boolean): void
  /**
   * Asks Herdr about the running delegates at most each `HERDR_CHECK_MS`, so a delegate's row follows Herdr while the
   * session waits. The panel asks while it shows the Status.
   */
  checkDelegatesWhenDue(ctx: OmpContext): void
  /** Calls `listener` after the session's saved state changes. Returns how to stop. */
  onChange(ctx: OmpContext, listener: () => void): () => void
  /** Applies a press for the session. */
  press(ctx: OmpContext, p: RowPress | PrPress, holds: Holds, when?: Precondition[]): Promise<PressOutcome>
  /**
   * Applies a file the Herdr look wrote: a press, whose opens and copies it may have run, or a look at the Status. Gives
   * what waits for the agent's turn to end.
   */
  herdrFile(ctx: OmpContext, file: HerdrFile): Promise<StartedFile>
  /** Sends the message that resumes a stopped turn. Returns why it could not, or null. */
  resume(ctx: OmpContext): Promise<string | null>
  /** Saves the row `row` as collapsed or expanded. */
  collapse(ctx: OmpContext, row: string, isCollapsed: boolean): Promise<void>
}

/**
 * What a session saves of its panel's state: the rows its drafts hold, and the state itself when it holds a draft or a
 * reply on its way.
 */
export function keptUi(kept: UiState | null): { heldRows: string[]; ui: UiState | null } {
  const heldRows = Object.keys(heldReplies(null, kept?.drafts ?? {}))
  return { heldRows, ui: kept !== null && isUiWorthKeeping(kept) ? kept : null }
}

export function panelCalls(context: HostContext, sessions: SessionCalls, herdrAsk: OmpHerdrAsk) {
  const { deps, dir, openPanels, uiStates, prFetches, listeners, memory, sendToAgent, modelNameOf } = context
  const { change, hostFor, fetchPrsWhenDue, checkDelegatesWhenDue, wakeLater } = sessions
  /** When each Status subject row was last on screen in each session's look under way, by session id. */
  const shownRows = new Map<string, Map<string, number>>()
  /** The rows the session's look showed. The next look starts with none. */
  const takeShownRows = (id: string): ShownRows => {
    const rows = Object.fromEntries(shownRows.get(id) ?? [])
    shownRows.delete(id)
    return rows
  }

  const inbox: Inbox = {
    screen: async (ctx, holds = NO_HOLDS, notes = {}) => {
      const id = sessionIdOf(ctx)
      const s = await readState(dir, id)

      return {
        view: sessionView(
          { ...s, prViews: { ...s.prViews, isGhMissing: memory.isGhMissing } },
          deps.now(),
          deps.settleWindowMs,
          holds,
          notes,
          false,
          { ...NO_SYNC_INPUTS, isFetchingPrs: prFetches.isFetching(id) },
        ),
        modelName: modelNameOf(ctx),
        isGhMissing: memory.isGhMissing,
        herdrModFailure: memory.herdrModFailure,
        herdrAsk: memory.herdrAsk,
        isFetchingPrs: prFetches.isFetching(id),
        stop: s.stop,
        version,
        isNextBuild: deps.isNextBuild,
      }
    },
    openPanel: async (ctx, openedAt) => {
      const id = sessionIdOf(ctx)
      openPanels.set(id, 'needsYou')
      deps.background(change(id, s => ({ ...s, shownSince: openedAt })))
      await wakeAfterSettle(hostFor(ctx)).catch(() => undefined)
      fetchPrsWhenDue(ctx, false)
    },
    showTab: (ctx, tab, holds) => {
      const id = sessionIdOf(ctx)
      if (!openPanels.has(id)) return
      const isChanged = openPanels.get(id) !== tab
      openPanels.set(id, tab)
      const now = deps.now()
      if (isChanged) {
        const shown = takeShownRows(id)
        deps.background(change(id, s => withHolds(withLook(s, tab === 'overview', now, shown), holds)))
      }
      if (isChanged && tab === 'overview') checkDelegatesWhenDue(ctx)
      if (isChanged && tab === 'prs') fetchPrsWhenDue(ctx, true)
    },
    closePanel: ctx => {
      const id = sessionIdOf(ctx)
      openPanels.delete(id)
      const shown = takeShownRows(id)
      const kept = keptUi(uiStates.get(id) ?? null)
      deps.background(change(id, s => ({ ...lookEndedOn(s, deps.now(), shown), ...kept, shownSince: null })))
    },
    savedUi: async ctx => {
      const id = sessionIdOf(ctx)
      return uiStates.get(id) ?? (await readState(dir, id)).ui
    },
    keepUi: (ctx, ui, holds) => {
      const id = sessionIdOf(ctx)
      uiStates.set(id, ui)
      deps.background(change(id, s => withHolds(s, holds)))
    },
    showRows: (ctx, ids) => {
      const id = sessionIdOf(ctx)
      const rows = shownRows.get(id) ?? new Map<string, number>()
      const now = deps.now()
      for (const row of ids) rows.set(row, now)
      shownRows.set(id, rows)
      if (openPanels.get(id) === 'overview') deps.background(change(id, s => withLook(s, true, now, {})))
    },
    fetchPrsWhenDue,
    checkDelegatesWhenDue,
    onChange: (ctx, listener) => {
      const id = sessionIdOf(ctx)
      const set = listeners.get(id) ?? new Set()
      set.add(listener)
      listeners.set(id, set)

      return () => void set.delete(listener)
    },
    press: async (ctx, p, holds, when) => {
      const outcome = await press(hostFor(ctx), p, false, holds, undefined, when)
      if (outcome.wakesAfterSettle) wakeLater(ctx)

      return outcome
    },
    herdrFile: async (ctx, file) => {
      return startedFile(await startHerdrFile(hostFor(ctx), file, sessionIdOf(ctx)), outcome => {
        if (outcome.wakesAfterSettle) wakeLater(ctx)
      })
    },
    resume: ctx => sendToAgent(ctx, RESUME_TEXT),
    collapse: async (ctx, row, isCollapsed) => {
      await change(sessionIdOf(ctx), s => withCollapse(s, row, isCollapsed, deps.now()))
    },
  }

  const liveSource = (ctx: OmpContext): PanelSource => ({
    screen: (holds, notes) => inbox.screen(ctx, holds, notes),
    press: async (p, holds, _pressId, when) => {
      const outcome = await inbox.press(ctx, p, holds, when)

      return {
        error: outcome.error,
        note: outcome.note,
        isUnconfirmed: outcome.isUnconfirmed,
        isRowFailed: outcome.isRowFailed,
      }
    },
    resume: async () => inbox.resume(ctx),
    answerHerdr: herdrAsk.answer,
    collapse: (id, isCollapsed) => inbox.collapse(ctx, id, isCollapsed),
    savedUi: () => inbox.savedUi(ctx),
    keepUi: (ui, holds) => inbox.keepUi(ctx, ui, holds),
    fetchPrsWhenDue: isTabShown => inbox.fetchPrsWhenDue(ctx, isTabShown),
    checkDelegatesWhenDue: () => inbox.checkDelegatesWhenDue(ctx),
    shown: (tab, holds) => inbox.showTab(ctx, tab, holds),
    showedRows: ids => inbox.showRows(ctx, ids),
    onChange: listener => inbox.onChange(ctx, listener),
  })

  return { inbox, liveSource }
}
