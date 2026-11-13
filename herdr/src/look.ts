import { ROW_PAD_PT } from '../../hooks/layout'
import { LOOK_MIN_MS } from '../../hooks/status-children'
import type { ReportedLook } from '../../hooks/status-children'
import { seenSubjectIds, statusListRows } from '../../hooks/status-page'
import type { StatusPage } from '../../hooks/status-page'
import { FOLD_QUIET_MS } from '../../hooks/timing'
import { END_SPACE, LINE } from './paint-theme'

/** How long a row must stay on screen without a break, by the look's measure, to count as seen. */
export const ROW_SEEN_MS = LOOK_MIN_MS

/**
 * How long a measured scroll offset is trusted after the pointer event that measured it. A drag on the scrollbar may
 * reach none of the look's handlers, and then the offset it leaves is unknown. The trust is shorter than
 * `ROW_SEEN_MS`, so the time counted at an offset a drag left stale can never make a row seen alone.
 */
export const OFFSET_TRUST_MS = 4_000

/** How often the look checks while nothing draws. A row's time on screen runs only between checks that saw it. */
export const LOOK_CHECK_MS = 1_000

/** The list's padding above its first block, as `main.ts` draws it. */
export const LIST_TOP_PAD = 8

/** How far a block's first line ends below its top: a Status line's padding above, then one line. */
const FIRST_LINE_END = ROW_PAD_PT + Number.parseFloat(LINE)

/** How far a block's top may sit from what the heights and the padding give. Tops in the app sat up to 1 px off. */
const TOP_SLACK = 2

/** Two checks further apart than this break a row's time on screen, since nothing saw it between them. */
const MAX_CHECK_GAP_MS = 2 * LOOK_CHECK_MS

/** How close in time the list's and the area's handlers must see one pointer event to pair them. */
const PAIR_MS = 50

type Place = { top: number; x: number; y: number; at: number }

/** The name `pane.split` gives the panel's pane, in `hooks/herdr-open.ts`. */
const PANEL_MOD = 'inbox'

/**
 * What the look reads from Herdr's live data to tell whether the panel shows. Each field is the part of Herdr's own
 * value it uses.
 */
export type Shown = {
  isWindowActive: boolean
  spaces: readonly { active: boolean; tabs: readonly { id: string; active: boolean; zoomed: boolean }[] }[]
  panes: readonly { pane: string; tab: string; mod?: string; zoomed: boolean }[]
  ownPane: string | null
}

/**
 * Whether the panel in `tab` is on screen: the Herdr window is focused, `tab` is the shown tab of the shown space, and
 * no other pane is zoomed over the panel. A split mod pane's props name no pane, so the panel is the tab's only inbox
 * pane then.
 */
export function isPanelShown(tab: string | null, s: Shown): boolean {
  if (tab === null || !s.isWindowActive) return false
  const shown = s.spaces.find(space => space.active)?.tabs.find(t => t.active)
  if (shown?.id !== tab) return false
  if (!shown.zoomed) return true
  const inboxPanes = s.panes.filter(p => p.tab === tab && p.mod === PANEL_MOD)
  const own = inboxPanes.find(p => p.pane === s.ownPane) ?? (inboxPanes.length === 1 ? inboxPanes[0] : undefined)

  return own?.zoomed === true
}

/** The subjects each Status block stands for, by block id: a subject row's own, and a fold's. */
export const blockSubjects = (page: StatusPage): Map<string, string[]> =>
  new Map(statusListRows(page).map(row => [row.id, seenSubjectIds(row)]))

/**
 * Where the Status list's blocks sit on screen. The scroll offset is the area's top minus the list's top, which one
 * pointer event over both gives. Each block's height comes from its own size listener. Anything that can move a row
 * without a pointer event makes the offset unknown until the next one: a wheel step, a change of the list's size or of
 * its blocks, and the look's `forget`. `epoch` counts those changes, so a row's time on screen restarts at each.
 */
export class ListPlace {
  heights = new Map<string, number>()
  order: string[] = []
  viewport: number | null = null
  width: number | null = null
  offset: { px: number; at: number } | null = null
  epoch = 0
  lastPointerAt: number | null = null
  private list: Place | null = null
  private area: Place | null = null

  forget(): void {
    if (this.offset !== null) this.epoch++
    this.offset = null
  }

  drawn(ids: string[]): void {
    if (ids.join('\n') === this.order.join('\n')) return
    this.order = ids
    this.forget()
  }

  blockSized(id: string, height: number): void {
    if (this.heights.get(id) === height) return
    this.heights.set(id, height)
    this.forget()
  }

  /** A change of width wraps the blocks again, so their heights wait for their own listeners. */
  listSized(width: number, height: number): void {
    if (this.viewport === height && this.width === width) return
    if (this.width !== width) this.heights.clear()
    this.viewport = height
    this.width = width
    this.forget()
  }

  wheel(now: number): void {
    this.lastPointerAt = now
    this.forget()
  }

  /** A pointer event the list's handler saw, with the list's top in window coordinates. */
  listPointer(p: Place): void {
    this.list = p
    this.pair()
  }

  /** A pointer event the area's handler saw, with the area's top in window coordinates. */
  areaPointer(p: Place): void {
    this.area = p
    this.pair()
  }

  private pair(): void {
    const { list, area } = this
    if (list === null || area === null) return
    const isOneEvent = list.x === area.x && list.y === area.y && Math.abs(list.at - area.at) <= PAIR_MS
    if (!isOneEvent) return
    const at = Math.max(list.at, area.at)
    const px = area.top - list.top
    this.lastPointerAt = at
    if (this.offset?.px !== px) this.epoch++
    this.offset = { px, at }
    this.list = this.area = null
  }

  /** Whether every block has a height and the list fits its viewport, so it cannot scroll. */
  private isWhole(): boolean {
    if (this.viewport === null || !this.order.every(id => this.heights.has(id))) return false
    const total = this.order.reduce((sum, id) => sum + (this.heights.get(id) ?? 0), LIST_TOP_PAD + END_SPACE)

    return total <= this.viewport
  }

  /**
   * The blocks whose first line is surely on screen at `now`, or null when the offset is not trusted. A block without
   * a height yet, and every block below it, counts as off screen.
   */
  visible(now: number): string[] | null {
    const viewport = this.viewport
    if (viewport === null) return null
    const isTrusted = this.offset !== null && now - this.offset.at < OFFSET_TRUST_MS
    const offset = isTrusted ? (this.offset?.px ?? 0) : this.isWhole() ? 0 : null
    if (offset === null) return null
    const shown: string[] = []
    let top = LIST_TOP_PAD - offset
    for (const id of this.order) {
      const height = this.heights.get(id)
      if (height === undefined) break
      const lineEnd = top + Math.min(height, FIRST_LINE_END)
      if (top >= TOP_SLACK && lineEnd + TOP_SLACK <= viewport) shown.push(id)
      top += height
    }

    return shown
  }
}

/** What the look reads at each check. `rows` names the subjects each Status block stands for. */
export type LookCheck = {
  now: number
  sessionId: string | null
  /** The terminal the session file names, which the host watches for the wake label. */
  terminal: string | null
  /** The panel shows the Status of a session, and its tab is on screen in the focused Herdr window. */
  isRunning: boolean
  typedAt: number | null
  /** The last press, key or click in the panel's list. */
  listInputAt: number | null
  rows: Map<string, string[]>
}

/** A look that ended, for the session's press folder. */
export type LookReport = { sessionId: string; terminal: string; look: ReportedLook }

type Running = {
  sessionId: string
  terminal: string
  startedAt: number
  lastRunningAt: number
  /** For each subject, the latest stretch on screen long enough to count. */
  shown: Map<string, { since: number; last: number }>
  streaks: Map<string, { since: number; last: number; epoch: number }>
}

/**
 * The person's looks at the Status in the Herdr panel. A look runs while the panel shows a session's Status on screen
 * in the focused window. It ends when that stops, and when the person types a message to the agent without using the
 * panel's list just before or since. It ends at the last check that saw it running, so a stretch with no checks counts
 * nothing. A row counts as shown once it stayed on screen for `ROW_SEEN_MS` before the look ended. `shown` gives the
 * latest time the row then stayed on screen for `ROW_SEEN_MS` from, so a subject that changed later counts as not shown.
 */
export class StatusLook {
  place = new ListPlace()
  private look: Running | null = null
  private shownKey = ''

  check(c: LookCheck): LookReport[] {
    const key = `${c.sessionId} ${c.isRunning}`
    if (key !== this.shownKey) this.place.forget()
    this.shownKey = key
    const reports: LookReport[] = []
    const look = this.look
    const listUseAt = Math.max(c.listInputAt ?? -Infinity, this.place.lastPointerAt ?? -Infinity)
    const isTyped = look !== null && c.typedAt !== null && c.typedAt > look.startedAt
    const isListInUse = c.typedAt !== null && listUseAt >= c.typedAt - FOLD_QUIET_MS
    if (look && (!c.isRunning || c.sessionId !== look.sessionId)) reports.push(...this.end(look.lastRunningAt))
    else if (look && c.typedAt !== null && isTyped && !isListInUse)
      reports.push(...this.end(Math.min(c.typedAt, look.lastRunningAt)))
    if (!c.isRunning || c.sessionId === null || c.terminal === null) return reports
    const running = (this.look ??= {
      sessionId: c.sessionId,
      terminal: c.terminal,
      startedAt: c.now,
      lastRunningAt: c.now,
      shown: new Map(),
      streaks: new Map(),
    })
    this.note(running, c)
    running.lastRunningAt = c.now

    return reports
  }

  /** Ends the look in progress at the last check that saw it, as when the panel closes. */
  close(): LookReport[] {
    return this.look ? this.end(this.look.lastRunningAt) : []
  }

  private note(look: Running, c: LookCheck): void {
    const visible = this.place.visible(c.now) ?? []
    const epoch = this.place.epoch
    for (const id of [...look.streaks.keys()]) if (!visible.includes(id)) look.streaks.delete(id)
    for (const id of visible) {
      const was = look.streaks.get(id)
      const isUnbroken = was !== undefined && was.epoch === epoch && c.now - was.last <= MAX_CHECK_GAP_MS
      const streak = isUnbroken ? { ...was, last: c.now } : { since: c.now, last: c.now, epoch }
      look.streaks.set(id, streak)
      if (c.now - streak.since < ROW_SEEN_MS) continue
      for (const subject of c.rows.get(id) ?? []) look.shown.set(subject, { since: streak.since, last: c.now })
    }
  }

  private end(endedAt: number): LookReport[] {
    const look = this.look
    this.look = null
    if (look === null || endedAt - look.startedAt < LOOK_MIN_MS) return []
    const { sessionId, terminal, startedAt } = look
    const shown: Record<string, number> = {}
    for (const [subject, stretch] of look.shown) {
      const from = Math.min(stretch.last, endedAt) - ROW_SEEN_MS
      if (from >= stretch.since) shown[subject] = from
    }

    return [{ sessionId, terminal, look: { startedAt, endedAt, shown } }]
  }
}
