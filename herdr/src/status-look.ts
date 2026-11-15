import { HERDR_FORMAT } from '../../hooks/herdr'
import type { HerdrFile } from '../../hooks/herdr-press-file'
import { LOOK_MIN_MS } from '../../hooks/status-children'
import type { ReportedLook } from '../../hooks/status-children'
import { seenSubjectIds, statusListRows } from '../../hooks/status-page'
import type { StatusPage } from '../../hooks/status-page'
import { HEIGHT_SETTLE_MS } from '../../hooks/springs'
import type { SessionView } from '../../hooks/session-view'
import type { Block } from './blocks'
import type { ReadSession } from './files'
import type { Heights } from './heights'
import { padOf, spacesOf } from './paint-space'
import { LINE_HEIGHT } from './paint-theme'
import { newPressId, pressPath } from './press-file'
import type { QueueIo } from './press-queue'

/** How often the look checks whether its Status is on screen. A look ends at the last check that found it shown. */
export const LOOK_TICK_MS = 1_000

/** A check this long after the last one ends the look at the last one, as when the Mac slept with the Status shown. */
const LOOK_GAP_MS = 3 * LOOK_TICK_MS

/**
 * Whether the Herdr app shows the look's pane: its window has focus, the pane's tab is the tab its shown space shows,
 * and no other pane in that tab is zoomed. The app does not say whether a window that lost focus is still in view.
 */
export function isPaneShown(
  paneId: string | undefined,
  panes: readonly { pane: string; tab: string; zoomed: boolean }[],
  spaces: readonly { active: boolean; tabs: readonly { id: string; active: boolean; zoomed: boolean }[] }[],
  window: { active: boolean },
): boolean {
  const own = panes.find(p => p.pane === paneId)
  const tab = spaces.find(s => s.active)?.tabs.find(t => t.id === own?.tab)

  return own !== undefined && window.active && tab?.active === true && (!tab.zoomed || own.zoomed)
}

/**
 * The Status rows as the list lays them out at rest: each row's first line, from the list's first block, with the
 * subjects it stands for, and the height of all the blocks. `room` is the list's height between its edge fades.
 */
type StatusPlaced = { rows: { top: number; subjects: string[] }[]; height: number; room: number }

/**
 * Where each Status row sits in the list, from the heights the look measured. Null while a block has no measured
 * height, as before its first measure.
 */
export function statusPlaced(
  blocks: Block[],
  heightOf: (id: string) => number | undefined,
  page: StatusPage,
  room: number,
): StatusPlaced | null {
  const subjects = new Map(statusListRows(page).map(r => [r.id, seenSubjectIds(r)]))
  const rows: StatusPlaced['rows'] = []
  let y = 0
  for (const { block, above } of spacesOf(blocks, () => false)) {
    const height = heightOf(block.id)
    if (height === undefined) return null
    y += above
    const ids = subjects.get(block.id) ?? []
    if (ids.length > 0) rows.push({ top: y + padOf(block), subjects: ids })
    y += height
  }

  return { rows, height: y, room }
}

/**
 * The subjects whose row's first line is clear of the edge fades wherever the list is scrolled. gpui-kit does not tell
 * a mod how far a list has scrolled, so a row counts only when its first line is in view at the top of the scroll and
 * at its end.
 */
export function surelyShown({ rows, height, room }: StatusPlaced): string[] {
  const scrollEnd = Math.max(0, height - room)

  return rows.filter(r => r.top >= scrollEnd && r.top + LINE_HEIGHT <= room).flatMap(r => r.subjects)
}

/**
 * What the look drew last: the session whose Status it drew, when the host wrote the file it drew, and its rows' places
 * once they rest, else null.
 */
export type StatusDrawn = { sessionId: string; terminal: string; writtenAt: number; placed: StatusPlaced | null }

/**
 * What a draw drew of the Status, from the session it read, or null when it drew no Status. The rows' places count
 * only from a draw at rest in a list `room` high, and `room` is null otherwise.
 */
export function statusDrawn(
  sessionId: string | null,
  read: Extract<ReadSession, { is: 'read' }> | null,
  view: SessionView,
  blocks: Block[],
  heights: Heights,
  room: number | null,
): StatusDrawn | null {
  if (sessionId === null || read === null) return null
  const placed = room === null ? null : statusPlaced(blocks, k => heights.get(k), view.statusPage, room)

  return { sessionId, terminal: read.envelope.terminal, writtenAt: read.envelope.writtenAt, placed }
}

/** A look at a session's Status that ended, for the host on its terminal. */
type EndedLook = { sessionId: string; terminal: string; look: ReportedLook }

type Run = {
  sessionId: string
  terminal: string
  startedAt: number
  lastShownAt: number
  drawnWrittenAt: number
  shown: Record<string, number>
}

/**
 * The look at the Status under way. Each draw says what it drew. Each check says whether the pane is shown, notes the
 * rows surely on screen once the drawn rows have rested a spring's settle time, and ends the look when the Status is no
 * longer shown. A row counts as shown when the host wrote the file the look drew, at the latest, so a subject that
 * changed after that write does not count as seen before the look draws the change.
 */
export class StatusLook {
  private drawn: StatusDrawn | null = null
  private restsFrom = 0
  private run: Run | null = null

  drew(drawn: StatusDrawn | null, now: number): void {
    const isSamePlaces = JSON.stringify(drawn?.placed ?? null) === JSON.stringify(this.drawn?.placed ?? null)
    if (!isSamePlaces) this.restsFrom = now
    this.drawn = drawn
  }

  /** The look that ended at this check, if it showed the Status for `LOOK_MIN_MS`. */
  check(isPaneShown: boolean, now: number): EndedLook | null {
    const d = isPaneShown ? this.drawn : null
    const run = this.run
    const goesOn = d !== null && run?.sessionId === d.sessionId && now - run.lastShownAt <= LOOK_GAP_MS
    const ended = run && !goesOn ? lookOf(run) : null
    if (!goesOn)
      this.run = d && {
        sessionId: d.sessionId,
        terminal: d.terminal,
        startedAt: now,
        lastShownAt: now,
        drawnWrittenAt: d.writtenAt,
        shown: {},
      }
    if (this.run && d) {
      this.run.lastShownAt = now
      this.run.drawnWrittenAt = d.writtenAt
      const isAtRest = d.placed !== null && now - this.restsFrom >= HEIGHT_SETTLE_MS
      const shownAt = Math.min(now, d.writtenAt)
      for (const id of isAtRest && d.placed ? surelyShown(d.placed) : []) this.run.shown[id] = shownAt
    }

    return ended
  }
}

function lookOf({ sessionId, terminal, startedAt, lastShownAt, drawnWrittenAt, shown }: Run): EndedLook | null {
  if (lastShownAt - startedAt < LOOK_MIN_MS) return null

  return { sessionId, terminal, look: { startedAt, endedAt: lastShownAt, shown, drawnWrittenAt } }
}

/** Writes an ended look to its session's press folder, then wakes the host on the session's terminal. */
export async function writeLook(io: Pick<QueueIo, 'random' | 'write' | 'wake'>, appHome: string, ended: EndedLook) {
  const id = newPressId(ended.look.endedAt, io.random())
  const file: HerdrFile = { format: HERDR_FORMAT, id, look: ended.look }
  if ((await io.write(pressPath(appHome, ended.sessionId, id), JSON.stringify(file))) === null)
    await io.wake(ended.terminal, id)
}
