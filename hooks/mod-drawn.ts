import type { DemoCopy } from '../types'
import { type ScreenTab, screenText } from './inbox-text'
import type { Mod } from './mod-ports'
import { conversation, drawnSession } from './mod-sessions'
import { paneState } from './mod-state'
import { modUiOf } from './mod-ui'
import { CLAUDE_CODE } from './model-text'
import { sessionView, type SessionView } from './session-view'
import { screenTabOf } from './tabs'
import { SETTLED_MS } from './timing'
import { notesOf } from './ui-controller'
import { holdsOf } from './ui-controller-reply'
import type { UiState } from './ui-controller-types'

type DrawnCalls = Pick<Mod, 'clock' | 'pane'> & {
  atoms: Pick<Mod['atoms'], 'ui' | 'session' | 'demo' | 'demoRecording' | 'unreadable' | 'redraw' | 'away'>
}

/** The pane's state: the saved controller state, with the terminal's config while it draws the pane, else desktop's. */
export async function readUi(m: DrawnCalls): Promise<UiState> {
  const ui = modUiOf(await m.atoms.ui.read(), paneState.drawsTerminal ? 'terminal' : paneState.paneLook)

  return { ...ui, listInput: paneState.listInput, nextPressId: Math.max(ui.nextPressId, paneState.nextPressId) }
}

/** The drawn session and its view. `canScrollConversation` is whether the surface drawing it can scroll the conversation. */
export async function drawnState(
  m: DrawnCalls,
  canScrollConversation = false,
): Promise<
  DemoCopy & {
    view: SessionView
    ui: UiState
    isDemo: boolean
    showsDemoNotices: boolean
    isUnread: boolean
    lastTypedMessageAt: number | null
    now: number
  }
> {
  const [session, ui, demo, isDemoRecording, unreadable, now] = await Promise.all([
    m.atoms.session.read(),
    readUi(m),
    m.atoms.demo.read(),
    m.atoms.demoRecording.read(),
    m.atoms.unreadable.read(),
    m.clock.now(),
    m.atoms.redraw.read(),
    // The minute tick while the person is away redraws the ages.
    m.atoms.away.read(),
  ])
  const { ledger, stop, prViews, lastActions, presence } = session
  const turns = { turnsStarted: presence.turnsStarted, turnsApplied: presence.turnsApplied }
  const notes = notesOf(ui)
  const drawn: DemoCopy = demo
    ? { ...demo, notes }
    : {
        ledger,
        stop,
        prViews,
        lastActions,
        notes,
        turns,
      }

  const isUnread = demo === null && unreadable === conversation.id

  const drawnFrom = drawnSession(session, drawn, demo !== null, now)
  const view = sessionView(drawnFrom, now, SETTLED_MS, holdsOf(ui, now), notes, canScrollConversation)

  return {
    ...drawn,
    lastActions: view.lastActions,
    view,
    ui,
    lastTypedMessageAt: presence.lastTypedMessageAt,
    isDemo: demo !== null,
    showsDemoNotices: demo !== null && !isDemoRecording,
    isUnread,
    now,
  }
}

export async function isPaneShown(m: DrawnCalls) {
  return (await m.pane.find().catch(() => undefined))?.isShown === true
}

export async function isPrsTabShown(m: DrawnCalls) {
  return (await readUi(m)).tab === 'prs' && (await isPaneShown(m))
}

/** The tab the pane shows, as the inbox model is told: the page tab when one shows, else the row tab. */
export async function shownScreenTab(m: DrawnCalls): Promise<ScreenTab> {
  return screenTabOf((await readUi(m)).tab)
}

export async function screen(m: DrawnCalls) {
  return screenText(CLAUDE_CODE, await isPaneShown(m), await shownScreenTab(m))
}

export function redraw(m: DrawnCalls) {
  return m.atoms.redraw.update(n => n + 1)
}

export function later(m: DrawnCalls, waitMs: number, run: () => unknown) {
  void (async () => {
    await m.clock.sleep(waitMs)
    await run()
  })().catch(() => undefined)
}

/** Reads the /config theme into `THEME`, which the pane draws its colors from. */
export async function syncTheme(m: Pick<Mod, 'setup'> & { atoms: Pick<Mod['atoms'], 'theme'> }) {
  const theme = await m.setup.theme().catch(() => undefined)
  await m.atoms.theme.update(() => (typeof theme === 'string' ? theme : ''))
}
