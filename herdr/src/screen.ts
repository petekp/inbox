import type { BannerView } from '../../hooks/banners'
import { READING_TEXT } from '../../hooks/banners'
import { sessionView } from '../../hooks/session-view'
import { SETTLED_MS, nextFoldAt } from '../../hooks/timing'
import type { Holds } from '../../hooks/timing'
import type { Block } from './blocks'
import { chrome, tabBlocks, tabCells } from './draw'
import type { LookUi, TabCell } from './draw'
import type { ReadSession } from './files'
import type { Followed } from './follow'

/** What the look shows in place of an inbox, as the case of the terminal it follows says. */
export type Message = { title: string; hint: string | null; isError: boolean }

export type Screen =
  | { is: 'message'; message: Message }
  | {
      is: 'inbox'
      agent: string
      tabs: TabCell[]
      banners: BannerView[]
      status: string | null
      blocks: Block[]
      /** When a settled row folds, so the look draws again then. Null when none comes due on the clock. */
      foldAt: number | null
    }

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

/** What the look draws now for the terminal it follows, with the session it read for it. */
export function screenOf(
  followed: Followed,
  read: ReadSession | null,
  ui: LookUi,
  o: { now: number; shownSince: number; isNextBuild: boolean },
): Screen {
  const shown = messageOf(followed, read)
  if (shown !== null || read?.is !== 'read') return shown ?? message(READING_TEXT, null)
  const holds: Holds = { replies: {}, discarded: {}, shownSince: o.shownSince, listInput: null }
  const view = sessionView(read.session, o.now, SETTLED_MS, holds)
  const screen = { view, agent: read.envelope.agent, now: o.now, shownSince: o.shownSince, isNextBuild: o.isNextBuild }
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows]
  const settled = rows.flatMap(r => (r.state.is === 'settled' ? [r.state] : []))
  const placing = { lastTypedMessageAt: null, listInput: null, now: o.now, settleWindowMs: SETTLED_MS }

  return {
    is: 'inbox',
    agent: screen.agent,
    tabs: tabCells(screen, ui.tab),
    ...chrome(screen, ui.tab),
    blocks: tabBlocks(screen, ui),
    foldAt: nextFoldAt(settled, placing),
  }
}
