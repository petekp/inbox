import { version } from '../package.json'

import type { PrPress } from '../../hooks/pr-press'
import { applyLookPress } from '../../hooks/herdr-app'
import type { PressFile } from '../../hooks/herdr-press-file'
import type { RowPress } from '../../hooks/presses'
import { lookEndedOn, withLook } from '../../hooks/session-status'
import type { ShownRows } from '../../hooks/status-children'
import { withHolds } from '../../hooks/session-presses'
import { sessionView } from '../../hooks/session-view'
import { press, wakeAfterSettle } from '../../hooks/host-press'
import type { PressOutcome } from '../../hooks/host-press'
import { NO_HOLDS } from '../../hooks/timing'
import { RESUME_TEXT } from '../../hooks/banners'
import type { Holds } from '../../hooks/timing'
import type { ShownTab } from '../../hooks/tabs'
import type { PanelSource } from './controller'
import type { PanelScreen } from './panel'
import { readState } from './state'
import { sessionIdOf } from './host-context'
import type { HostContext, OmpContext } from './host-context'
import type { SessionCalls } from './host-sessions'

/** What a panel needs from the host. */
export type Inbox = {
  screen(ctx: OmpContext, holds?: Holds): Promise<PanelScreen>
  /**
   * Marks the panel open, showing its first tab from `openedAt`, and runs what a freshly opened panel needs: Done
   * messages due, and a PR fetch when due.
   */
  openPanel(ctx: OmpContext, openedAt: number): Promise<void>
  /** Records the tab an open panel shows. A new tab saves `holds`, with the showing the panel started. */
  showTab(ctx: OmpContext, tab: ShownTab, holds: Holds): void
  closePanel(ctx: OmpContext): void
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
  /** Applies a press for the session, or with `look` one the Herdr look wrote, whose opens and copies it may have run. */
  press(ctx: OmpContext, p: RowPress | PrPress, holds: Holds, look?: PressFile): Promise<PressOutcome>
  /** Sends the message that resumes a stopped turn. Returns why it could not, or null. */
  resume(ctx: OmpContext): Promise<string | null>
}

export function panelCalls(context: HostContext, sessions: SessionCalls) {
  const { deps, dir, openPanels, prFetches, listeners, memory, sendToAgent, modelNameOf } = context
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
    screen: async (ctx, holds = NO_HOLDS) => {
      const id = sessionIdOf(ctx)
      const s = await readState(dir, id)

      return {
        view: sessionView(s, deps.now(), deps.settleWindowMs, holds),
        modelName: modelNameOf(ctx),
        isGhMissing: memory.isGhMissing,
        herdrModFailure: memory.herdrModFailure,
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
      deps.background(change(id, s => ({ ...lookEndedOn(s, deps.now(), shown), shownSince: null })))
    },
    showRows: (ctx, ids) => {
      const id = sessionIdOf(ctx)
      const rows = shownRows.get(id) ?? new Map<string, number>()
      const now = deps.now()
      for (const row of ids) rows.set(row, now)
      shownRows.set(id, rows)
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
    press: async (ctx, p, holds, look) => {
      const outcome = await (look ? applyLookPress(hostFor(ctx), look) : press(hostFor(ctx), p, false, holds))
      if (outcome.wakesAfterSettle) wakeLater(ctx)

      return outcome
    },
    resume: ctx => sendToAgent(ctx, RESUME_TEXT),
  }

  const liveSource = (ctx: OmpContext): PanelSource => ({
    screen: holds => inbox.screen(ctx, holds),
    press: async (p, holds) => {
      const outcome = await inbox.press(ctx, p, holds)

      return { error: outcome.error, note: outcome.note, isUnconfirmed: outcome.isUnconfirmed }
    },
    resume: async () => inbox.resume(ctx),
    fetchPrsWhenDue: isTabShown => inbox.fetchPrsWhenDue(ctx, isTabShown),
    checkDelegatesWhenDue: () => inbox.checkDelegatesWhenDue(ctx),
    shown: (tab, holds) => inbox.showTab(ctx, tab, holds),
    showedRows: ids => inbox.showRows(ctx, ids),
    onChange: listener => inbox.onChange(ctx, listener),
  })

  return { inbox, liveSource }
}
