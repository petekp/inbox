import { version } from '../package.json'

import type { PrPress } from '../../hooks/pr-press'
import type { RowPress } from '../../hooks/presses'
import { lookEndedOn, withLook } from '../../hooks/session-status'
import { withHolds } from '../../hooks/session-presses'
import { sessionView } from '../../hooks/session-view'
import { press, wakeForDone } from '../../hooks/session-host'
import type { PressOutcome } from '../../hooks/session-host'
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
  fetchPrsWhenDue(ctx: OmpContext): void
  /**
   * Asks Herdr about the running delegates at most each `HERDR_CHECK_MS`, so a delegate's row follows Herdr while the
   * session waits. The panel asks while it shows the Status.
   */
  checkDelegatesWhenDue(ctx: OmpContext): void
  /** Calls `listener` after the session's saved state changes. Returns how to stop. */
  onChange(ctx: OmpContext, listener: () => void): () => void
  /** Applies a press for the session. */
  press(ctx: OmpContext, p: RowPress | PrPress, holds: Holds): Promise<PressOutcome>
  /** Sends the message that resumes a stopped turn. Returns why it could not, or null. */
  resume(ctx: OmpContext): string | null
}

export function panelCalls(context: HostContext, sessions: SessionCalls) {
  const { deps, dir, openPanels, prFetches, listeners, memory, sendToAgent, modelNameOf } = context
  const { change, hostFor, fetchPrsWhenDue, checkDelegatesWhenDue, wakeLater } = sessions

  const inbox: Inbox = {
    screen: async (ctx, holds = NO_HOLDS) => {
      const id = sessionIdOf(ctx)
      const s = await readState(dir, id)

      return {
        view: sessionView(s, deps.now(), deps.settleWindowMs, true, holds),
        modelName: modelNameOf(ctx),
        isGhMissing: memory.isGhMissing,
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
      await wakeForDone(hostFor(ctx)).catch(() => undefined)
      fetchPrsWhenDue(ctx)
    },
    showTab: (ctx, tab, holds) => {
      const id = sessionIdOf(ctx)
      if (!openPanels.has(id)) return
      const isChanged = openPanels.get(id) !== tab
      openPanels.set(id, tab)
      const now = deps.now()
      if (isChanged) deps.background(change(id, s => withHolds(withLook(s, tab === 'overview', now), holds)))
      if (isChanged && tab === 'overview') checkDelegatesWhenDue(ctx)
    },
    closePanel: ctx => {
      const id = sessionIdOf(ctx)
      openPanels.delete(id)
      deps.background(change(id, s => ({ ...lookEndedOn(s, deps.now()), shownSince: null })))
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
    press: async (ctx, p, holds) => {
      const outcome = await press(hostFor(ctx), p, false, holds)
      if (outcome.wakesForDone) wakeLater(ctx)

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
    fetchPrsWhenDue: () => inbox.fetchPrsWhenDue(ctx),
    checkDelegatesWhenDue: () => inbox.checkDelegatesWhenDue(ctx),
    shown: (tab, holds) => inbox.showTab(ctx, tab, holds),
    onChange: listener => inbox.onChange(ctx, listener),
  })

  return { inbox, liveSource }
}
