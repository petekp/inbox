import type { Draft, FoldKind, Stop } from '../../types'
import type { PrPress } from '../../hooks/pr-press'
import { noteText } from '../../hooks/presses'
import type { RowPress } from '../../hooks/presses'
import type { SessionView } from '../../hooks/session-view'
import type { BannerTone, ToneName } from '../../hooks/tones'
import { ago } from '../../hooks/text'
import {
  DEMO_NOTICE,
  bannerOf,
  stopBanner,
  tabBarBanners,
  QUEUED_AFTER_MS,
  LISTED_TABS,
  SETTLED_MS,
  shownTabs,
  footerStatus,
  heldReplies,
  isRowTab,
  statusSelected,
  stopFix,
  stopText,
} from '../../hooks/view'
import type { Holds, ShownTab } from '../../hooks/view'
import { bannerLines, boxed, drawLine, paintMark } from './panel-draw'
import type { Draw } from './panel-draw'
import { PAGE_MARK_AT, PAGE_TEXT_AT, entriesOf } from './panel-entries'
import { resolveSelected, withTab } from './panel-keys'
import { STOP_ID, linesOf } from './panel-lines'
import { drawPageRow, pageRule } from './panel-page'
import { footer, pageWindow, scrolled, tabBar } from './panel-tabs'
import { fit, indented, spread } from './panel-text'

type ResumePress = { action: 'resume' }
export type PanelPress = RowPress | PrPress | ResumePress

/** What the panel draws: the session's view and the host facts the shared view does not hold. */
export type PanelScreen = {
  view: SessionView
  /** The model that runs the inbox update, or null when the person has none. */
  modelName: string | null
  isGhMissing: boolean
  isFetchingPrs: boolean
  /** Why the last turn stopped, until the next turn starts. */
  stop: Stop | null
  version: string
  isNextBuild?: boolean
  isDemo?: boolean
}

export type Tone = ToneName | 'accent' | 'sep'

/** The terminal styles the panel draws with. The host maps them onto the active omp theme. */
export type Style = {
  bold(s: string): string
  dim(s: string): string
  inverse(s: string): string
  underline(s: string): string
  tone(name: Tone, s: string): string
  /** A banner's border, or its fill behind `s`. */
  banner(tone: BannerTone, part: 'line' | 'fill', s: string): string
}

export type PanelUi = {
  tab: ShownTab
  selectedId: string | null
  /** The focused button of one row. Another row's focus starts at its recommended option. */
  focus: { rowId: string; index: number } | null
  /** The row whose reply field is open. */
  typing: string | null
  /** Replies begun and not sent, by row id. Cancelling the field keeps its draft, and so does a send that is not confirmed. */
  drafts: Record<string, Draft>
  /** Rows whose draft the person discarded, and when. */
  discarded: Record<string, number>
  /** A line about the last press that the row itself cannot show, until `at` + SETTLED_MS. */
  notice: { text: string; at: number; isError: boolean } | null
  /** The groups whose closed rows show. Each starts folded. */
  unfolded: FoldKind[]
  /** A Resume press for the stop that began at `stopAt`. */
  resuming: { stopAt: number; is: 'sending' } | { stopAt: number; is: 'refused'; why: string } | null
  /** A handed-off row the person opened again with Enter. Moving the selection off it folds it again. */
  opened: string | null
  /** How many lines of the Status page are scrolled above the panel. Drawing clamps it to the page's end. */
  pageTop: number
  /** The Status row the next draw scrolls into view, after j or k selects it. */
  pageReveal: string | null
  /**
   * When a Status press selected the shown row, as View does. The row's buttons ignore keys until
   * `PRESS_GUARD_MS` has passed, so a second Enter does not press the row it opened.
   */
  openedAt: number
  /** When the panel opened or last switched tab. A row that closes since then stays in place until the next of either. */
  shownSince: number
  /** Whether Help shows in place of the tab's lines. It scrolls with `pageTop`, and switching tabs closes it. */
  isHelpShown: boolean
}

export const INITIAL_UI: PanelUi = {
  tab: 'needsYou',
  selectedId: null,
  focus: null,
  typing: null,
  drafts: {},
  discarded: {},
  notice: null,
  unfolded: [],
  resuming: null,
  opened: null,
  pageTop: 0,
  pageReveal: null,
  openedAt: 0,
  shownSince: 0,
  isHelpShown: false,
}

export function holdsOf(ui: Pick<PanelUi, 'typing' | 'drafts' | 'discarded' | 'shownSince'>): Holds {
  return { replies: heldReplies(ui.typing, ui.drafts), discarded: ui.discarded, shownSince: ui.shownSince }
}

/**
 * True while the view changes with the clock alone: a settled row's Undo counting down, a local press's result
 * showing, a send waiting to read as queued, or a notice. Changes the host saves arrive as events instead.
 */
export function isAnimating(screen: PanelScreen, ui: PanelUi, now: number): boolean {
  const { view } = screen
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows]
  const isPressMoving = Object.values(view.lastActions).some(
    l =>
      (l.result !== undefined && (l.result.state === 'pending' || now - l.result.at < SETTLED_MS)) ||
      (l.delivery?.state === 'queued' && now - l.at < QUEUED_AFTER_MS),
  )
  const isNoticeShown = ui.notice !== null && now - ui.notice.at < SETTLED_MS

  return (
    rows.some(r => r.state.is === 'settled' && r.state.canUndo) ||
    view.prs.drawn.some(p => p.state.is === 'settled' && p.state.canUndo) ||
    isPressMoving ||
    isNoticeShown
  )
}

/** The notice for a press the row cannot show: a failed send, or a press whose row had changed. */
export function noticeFor(outcome: { error: string | null; note: 'stale' | null }, now: number): PanelUi['notice'] {
  const text = outcome.error ?? (outcome.note ? noteText() : null)

  return text === null ? null : { text, at: now, isError: outcome.error !== null }
}

/** The panel's lines for `width`. With `height`, the rows scroll inside it and keep the selected row in view. */
export function render(
  screen: PanelScreen,
  ui: PanelUi,
  width: number,
  now: number,
  style: Style,
  height?: number,
): string[] {
  return drawPanel(screen, ui, width, now, style, height).lines
}

/**
 * The panel's lines, and the Status page's scroll clamped to what the panel can show. With `minHeight`, blank lines
 * above the footer make the panel at least that tall.
 */
export function drawPanel(
  screen: PanelScreen,
  ui: PanelUi,
  width: number,
  now: number,
  style: Style,
  height?: number,
  minHeight = 0,
): { lines: string[]; pageTop: number } {
  const d: Draw = { screen, ui, width, now, style }
  const entries = entriesOf(screen, ui, ui.tab, now)
  const selected = resolveSelected(linesOf(entries), ui.selectedId)
  const rule = style.dim('─'.repeat(width))
  const status = footerStatus(
    ui.tab,
    screen.view.status,
    { isFetching: screen.isFetchingPrs, hasPrs: screen.view.prs.drawn.length > 0 },
    screen.view.statusPage.error,
  )
  const isNoticeShown = ui.notice !== null && now - ui.notice.at < SETTLED_MS
  const banners = tabBarBanners([], status.error, isNoticeShown ? ui.notice : null)
  const head = [
    ...(screen.isDemo ? bannerLines(bannerOf('demo', DEMO_NOTICE), width, style) : []),
    rule,
    tabBar(d),
    rule,
    ...banners.flatMap(b => bannerLines(b, width, style)),
  ]
  const body: string[] = []
  let selectedAt = [0, 0]
  const pageSelected = isRowTab(ui.tab) ? null : statusSelected(screen.view.statusPage, ui.selectedId)
  let pageSelectedAt: number[] | null = null
  for (const e of entries) {
    if (e.kind === 'heading')
      body.push(
        ` ${e.mark ? `${e.mark.tone ? style.tone(e.mark.tone, e.mark.text) : e.mark.text} ` : ''}${style.bold(e.text)}${e.count ? style.dim(` · ${e.count}`) : ''}`,
      )
    else if (e.kind === 'page') {
      if (e.row.isRuledAbove) body.push(pageRule(width, style))
      const start = body.length
      const isSelected = e.row.id === pageSelected?.id
      body.push(...drawPageRow(e.row, d, isSelected))
      if (isSelected) pageSelectedAt = [start, body.length - 1]
    } else if (e.kind === 'banner') body.push(...bannerLines(e.banner, width, style))
    else if (e.kind === 'key')
      body.push(
        ...indented(e.key.does, 1 + e.column, width, Infinity, style.dim).map((l, n) =>
          n === 0 ? ` ${style.bold(e.key.keys.padEnd(e.column))}${l.trimStart()}` : l,
        ),
      )
    else if (e.kind === 'legend') {
      const mark = paintMark(e.entry, now, style)
      body.push(
        ...indented(e.entry.words, PAGE_TEXT_AT, width, Infinity, style.dim).map((l, n) =>
          n === 0 ? `${' '.repeat(PAGE_MARK_AT)}${mark} ${l.trimStart()}` : l,
        ),
      )
    } else if (e.kind === 'note')
      body.push(
        ...indented(
          e.text,
          e.indent ?? 1,
          width,
          e.isWhole ? Infinity : 3,
          e.isStrong ? style.bold : e.isPlain ? (text: string) => text : style.dim,
        ),
      )
    else {
      const isSelected = e.line.id === selected?.id
      const start = body.length
      // The stop stays a row Resume can focus, drawn as a banner.
      if (e.line.id === STOP_ID && screen.stop)
        body.push(
          ...boxed(
            drawLine(e.line, isSelected, { ...d, width: width - 4 }),
            stopBanner(screen.stop).tone,
            width,
            style,
          ),
        )
      else body.push(...drawLine(e.line, isSelected, d))
      if (isSelected) selectedAt = [start, body.length - 1]
    }
  }
  const roomBeside = (foot: string[]) =>
    height === undefined ? Infinity : Math.max(6, height - head.length - foot.length)
  const isPage = ui.isHelpShown || !isRowTab(ui.tab)
  const isPageTaller = isPage && body.length > roomBeside(footer(d, false))
  const foot = footer(d, isPageTaller)
  const room = roomBeside(foot)
  const blanks = (shown: string[]) =>
    Array<string>(Math.max(0, minHeight - head.length - shown.length - foot.length)).fill('')
  const isOverflowing = body.length > room
  const [first = 0, last = 0] = pageSelectedAt ?? []
  // In view between the ↑ line above and the ↓ line below, which `pageWindow` draws while the page runs past them.
  const top =
    pageSelectedAt && ui.pageReveal === pageSelected?.id
      ? Math.min(Math.max(ui.pageTop, last - room + 2), Math.max(0, first - 1))
      : ui.pageTop
  const pageTop = isPage ? Math.min(Math.max(0, top), isOverflowing ? body.length - room + 1 : 0) : ui.pageTop
  const shown = !isOverflowing
    ? body
    : isPage
      ? pageWindow(body, pageTop, room, style)
      : scrolled(body, selectedAt, room, style)

  return { lines: [...head, ...shown, ...blanks(shown), ...foot].map(l => fit(l, width)), pageTop }
}

/** The most lines a shown tab draws, each tab as switching to it would show it. */
export function tallestTabHeight(
  screen: PanelScreen,
  ui: PanelUi,
  width: number,
  now: number,
  style: Style,
  height?: number,
): number {
  const heights = shownTabs(screen.isNextBuild === true).map(
    t => drawPanel(screen, t.id === ui.tab ? ui : withTab(ui, t.id, now), width, now, style, height).lines.length,
  )

  return Math.max(...heights)
}

/** The band above the prompt: the two counts, and under them why the last turn stopped. */
export function bandLines(screen: PanelScreen, width: number, now: number, style: Style): string[] {
  const { needsYou, findings } = screen.view
  const counts = LISTED_TABS.map(t => ({ t, count: t.id === 'needsYou' ? needsYou.count : findings.count }))
    .filter(x => x.count > 0)
    .map(x => `${x.t.label} ${style.tone(x.t.id, String(x.count))}`)
  const left = ` ${counts.length > 0 ? counts.join(` ${style.tone('sep', '·')} `) : style.dim('Nothing needed')}`
  const countLine = spread(left, style.dim('/inbox to open '), width)
  const { stop } = screen
  if (!stop) return [countLine]
  const stopLine = ` ${style.tone('error', `Stopped ${ago(now - stop.at)}:`)} ${stopText(stop)}. ${style.dim(stopFix(stop))}`

  return [countLine, fit(stopLine, width)]
}
