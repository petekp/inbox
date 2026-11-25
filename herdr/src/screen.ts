import type { BannerView } from '../../core/view/banners'
import { READING_TEXT } from '../../core/view/banners'
import { helpVersionText } from '../../core/view/help'
import { sessionView } from '../../core/view/session-view'
import { withDialogRow } from '../../core/view/dialog-row'
import { NO_SYNC_INPUTS } from '../../core/view/sync-state'
import type { SessionView } from '../../core/view/session-view'
import { SETTLED_MS } from '../../core/view/timing'
import type { Holds } from '../../core/view/timing'
import type { RowNote } from '../../types'
import type { Block } from './blocks'
import { chrome, rowWaits, tabBlocks, tabCells } from './draw'
import type { RowWait } from '../../core/view/action-plan'
import type { LookUi, TabCell } from './draw'
import type { ReadSession } from './files'
import type { Followed } from './follow'
import { drawOuts } from './out'
import type { PressQueue } from './press-queue'

/** What the look shows in place of an inbox, as the case of the terminal it follows says. */
export type Message = { title: string; hint: string | null; isError: boolean }

type Screen =
  | { is: 'message'; message: Message }
  | {
      is: 'inbox'
      view: SessionView
      tabs: TabCell[]
      banners: BannerView[]
      /** Says the host left out older closed items, or null when the session is whole. */
      trimmedNote: string | null
      blocks: Block[]
      /** The host's inbox build as Help names it, or null when its file says none. */
      helpVersion: string | null
      /** The tab's rows, in order, and whether each waits on the person. */
      waits: RowWait[]
    }

const TRIMMED_NOTE = 'This session is too large to show in full, so its older closed items are left out.'

const message = (title: string, hint: string | null, isError = false): Screen => ({
  is: 'message',
  message: { title, hint, isError },
})

/** The message for a terminal that shows no inbox, or for a session file the look could not use. */
function messageOf(followed: Followed, read: ReadSession | null): Screen | null {
  if (followed.is === 'no-terminal')
    return message('No terminal in this tab', 'Open an agent with the inbox in this tab to see it here.')
  if (followed.is === 'no-inbox')
    return message(
      'No inbox in this terminal',
      followed.program
        ? `${followed.program} runs here without the inbox.`
        : 'Start an agent with the inbox here to see its questions and findings.',
    )
  if (followed.is === 'ended') return message('The session ended', 'This terminal is back at its shell.')
  if (read === null) return message(READING_TEXT, null)
  if (read.is === 'missing')
    return message('Waiting for the inbox', 'The agent publishes its inbox here after its next reply.')
  if (read.is === 'torn') return message(READING_TEXT, null)
  if (read.is === 'newer')
    return message(
      'This panel is out of date',
      `The agent writes its inbox in format ${read.format}. Update the inbox to read it.`,
      true,
    )
  if (read.is === 'refused') return message("Can't read this inbox", `Its file has ${read.reason}.`, true)

  return null
}

/**
 * The session's view at `now`, with the rows the look holds in place and the notes its presses left, as the shared
 * controller reads it.
 */
export const readView = (
  read: Extract<ReadSession, { is: 'read' }>,
  now: number,
  holds: Holds,
  notes: Record<string, RowNote>,
): SessionView =>
  withDialogRow(
    sessionView(read.session, now, SETTLED_MS, holds, notes, false, {
      ...NO_SYNC_INPUTS,
      isReadFailed: read.isReadFailed,
      isFetchingPrs: read.isFetchingPrs,
      turnReadFailedAt: read.turnReadFailedAt,
    }),
    read.openDialog,
    read.envelope.agent,
  )

/**
 * What the look holds besides the session: the view of its read, or null before a read, when it began showing the
 * session, the collapses it drew before the session shows them, and its presses with the lines they left.
 */
type LookPresses = {
  view: SessionView | null
  shownSince: number | null
  collapsed?: (view: SessionView) => string[]
  queue: Pick<PressQueue, 'outs' | 'lines'>
}

/** What the look draws now for the terminal it follows, with the session it read for it. */
export function screenOf(
  followed: Followed,
  read: ReadSession | null,
  ui: LookUi,
  o: { now: number } & LookPresses,
): Screen {
  const shown = messageOf(followed, read)
  const raw = o.view
  if (shown !== null || read?.is !== 'read' || raw === null) return shown ?? message(READING_TEXT, null)
  const view = o.collapsed ? { ...raw, collapsed: o.collapsed(raw) } : raw
  const screen = {
    view,
    agent: read.envelope.agent,
    now: o.now,
    shownSince: o.shownSince ?? o.now,
    isGhMissing: read.session.prViews.isGhMissing === true,
    isFetchingPrs: read.isFetchingPrs,
  }

  return {
    is: 'inbox',
    view,
    tabs: tabCells(screen, ui.tab),
    ...chrome(screen, ui.tab),
    trimmedNote: read.isTrimmed ? TRIMMED_NOTE : null,
    helpVersion: read.envelope.version
      ? helpVersionText(read.envelope.version, read.envelope.isNextBuild === true)
      : null,
    blocks: drawOuts(tabBlocks(screen, ui), o.queue.outs, o.queue.lines, o.now),
    waits: rowWaits(screen, ui.tab),
  }
}
