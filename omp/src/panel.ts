import type { Dialog, Stop } from '../../types'
import type { PrPress } from '../../core/view/pr-press'
import type { RowPress } from '../../core/domain/presses'
import type { SessionView } from '../../core/view/session-view'
import type { BannerTone, ToneName } from '../../core/view/tones'
import { ago } from '../../core/domain/text'
import { DEMO_NOTICE, bannerOf, stopBanner, tabBarBanners, stopFix, stopText } from '../../core/view/banners'
import { shownTabs, isRowTab } from '../../core/view/tabs'
import { bandCounts, bandIdleText, nothingMark } from '../../core/view/band'
import { footerError } from '../../core/view/view'
import { withReadFailed } from '../../core/view/sync-state'
import { statusSelected } from '../../core/view/status-keys'
import { seenSubjectIds } from '../../core/view/status-page'
import { noticeOf } from '../../core/view/ui-controller'
import { shownTab } from '../../core/view/ui-controller-tabs'
import { freshUi } from '../../core/view/ui-controller-types'
import type { LookConfig, UiState } from '../../core/view/ui-controller-types'
import { bannerLines, boxed, drawLine, leadPaint, paintMark } from './panel-draw'
import type { Draw } from './panel-draw'
import { entriesOf } from './panel-entries'
import { selectedLine, withCollapses, withShared } from './panel-keys'
import { AGENT, HERDR_ASK_ID, STOP_ID, linesOf } from './panel-lines'
import type { HerdrAsk } from '../../core/remote/herdr-ask'
import { drawGoalPart, goalPartId, goalPartSubjects, workRowLines } from './panel-goal'
import { drawPageRow } from './panel-page'
import { footer, pageWindow, pageWindowLines, scrolled, tabBar } from './panel-tabs'
import { collapsedIn, fit, indented, spread } from './panel-text'

/** Sends the message that resumes a stopped turn. The panel runs it, so the controller never sees it. */
type ResumePress = { action: 'resume' }
/** An answer to the question before omp installs the inbox's Herdr mod. */
type HerdrAskPress = { action: 'herdr-ask'; isYes: boolean }
/** Shows every option of a question whose options fold. */
type OptionsPress = { action: 'all-options'; id: string }
/** A press the panel runs itself, outside the shared controller. */
export type LocalPress = ResumePress | HerdrAskPress
export type PanelPress = RowPress | PrPress | LocalPress | OptionsPress

/** What the panel draws: the session's view and the host facts the shared view does not hold. */
export type PanelScreen = {
  view: SessionView
  /** The model that runs the inbox update, or null when the person has none. */
  modelName: string | null
  /** Whether a provider in omp has a credential. A provider that needs none, such as Apple's on-device model, does not count. */
  isSignedIn: boolean
  isGhMissing: boolean
  isFetchingPrs: boolean
  /** Why the last turn stopped, until the next turn starts. */
  stop: Stop | null
  /** The kind of omp's own dialog that waits on the person, or null. */
  openDialog?: Dialog['kind'] | null
  version: string
  /** Whether the extension's folder holds `NEXT_BUILD_MARK`, which adds "next" to the version label. */
  isNextBuild?: boolean
  isDemo?: boolean
  /** The last read of the session failed, so the screen is the one before it. */
  isReadFailed?: boolean
  /** Why this omp could not install or update the inbox's Herdr mod, or null. */
  herdrModFailure?: string | null
  /** The question before omp installs the inbox's Herdr mod, while it shows. */
  herdrAsk?: HerdrAsk | null
}

/** What the footer says about the model that runs the inbox update. */
export type InboxModel = Pick<PanelScreen, 'modelName' | 'isSignedIn'>

export type Tone = ToneName | 'key' | 'accent' | 'sep'

/** The terminal styles the panel draws with. The host maps them onto the active omp theme. */
export type Style = {
  bold(s: string): string
  dim(s: string): string
  inverse(s: string): string
  underline(s: string): string
  tone(name: Tone, s: string): string
  /** A banner's border, or its fill behind `s`. */
  banner(tone: BannerTone, part: 'line' | 'fill', s: string): string
  /**
   * `s` in a row's tint: `tone` at `share` of its strength, faded toward `rest`, the color the text has without the
   * tint. It is the theme's text color when `rest` is null.
   */
  tint(tone: 'key' | 'done' | 'muted' | 'error', share: number, s: string, rest?: Tone | 'dim' | null): string
}

/** How omp draws what the shared controller times. Each value is a difference on purpose in docs/looks.md. */
export const OMP_LOOK: LookConfig = { runningMarks: 'frames', titleTint: 'steps', undoClock: 'session' }

/** What the panel keeps besides the shared controller's state. */
type PanelLocal = {
  /** The focused button of one row. Another row's focus starts at its recommended option. */
  focus: { rowId: string; index: number } | null
  /** A Resume press for the stop that began at `stopAt`. */
  resuming: { stopAt: number; is: 'sending' } | { stopAt: number; is: 'refused'; why: string } | null
  /** A handed-off row the person opened again with Enter. Moving the cursor off it folds it again. */
  opened: string | null
  /** How many lines of the Status page are scrolled above the panel. Drawing clamps it to the page's end. */
  pageTop: number
  /** The Status row the next draw scrolls into view, after j or k selects it. `true` is the selected row, as when the page shows. */
  pageReveal: string | true | null
}

/** The shared controller's state, from `reduceUi`, and what only the panel keeps. */
export type PanelUi = UiState & PanelLocal

export const NO_LOCAL: PanelLocal = { focus: null, resuming: null, opened: null, pageTop: 0, pageReveal: null }

/** A panel open since 0, as tests draw it. A live panel starts from its session's saved state. */
export const INITIAL_UI: PanelUi = { ...freshUi(OMP_LOOK), shownSince: 0, ...NO_LOCAL }

/** The controller's part of `ui`, which the host saves. */
export function sharedOf(ui: PanelUi): UiState {
  const { focus: _f, resuming: _r, opened: _o, pageTop: _t, pageReveal: _p, ...shared } = ui

  return shared
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
): { lines: string[]; pageTop: number; isRevealed: boolean; shownSubjects: string[] } {
  screen = withCollapses(screen, ui)
  const d: Draw = { screen, ui, width, now, style }
  const entries = entriesOf(screen, ui, ui.tab, now)
  const selected = selectedLine(linesOf(entries), ui)
  const rule = style.dim('─'.repeat(width))
  const error = footerError(ui.tab, screen.view.status, screen.view.statusPage)
  const host = screen.herdrModFailure ? [bannerOf('herdr-mod-failed', screen.herdrModFailure)] : []
  const banners = tabBarBanners(host, error, noticeOf(ui, now))
  const head = [
    ...(screen.isDemo ? bannerLines(bannerOf('demo', DEMO_NOTICE), width, style) : []),
    rule,
    tabBar(d),
    rule,
    ...banners.flatMap(b => bannerLines(b, width, style)),
  ]
  const body: string[] = []
  let selectedAt = [0, 0]
  const pageSelected =
    isRowTab(ui.tab) || ui.typing !== null
      ? null
      : statusSelected(
          screen.view.statusPage,
          ui.statusSelection,
          id => ui.statusUnfolded.includes(id),
          collapsedIn(screen.view),
        )
  let pageSelectedAt: number[] | null = null
  /** The line each subject a Status row stands for starts on. */
  const subjectAt: [string, number][] = []
  for (const e of entries) {
    if (e.kind === 'heading') {
      const title = ` ${e.mark ? `${leadPaint(e.mark, e.mark.text, style)} ` : ''}${style.bold(e.text)}${e.count ? style.dim(` · ${e.count}`) : ''}`
      body.push(e.aside ? spread(title, `${style.dim(e.aside)} `, width) : title)
    } else if (e.kind === 'page' || e.kind === 'goal') {
      const start = body.length
      const seen = e.kind === 'page' ? seenSubjectIds(e.row) : goalPartSubjects(e.part)
      subjectAt.push(...seen.map(id => [id, start] as [string, number]))
      const id = e.kind === 'page' ? e.row.id : goalPartId(e.part)
      const isSelected = id !== null && id === pageSelected?.id
      body.push(
        ...(e.kind === 'page'
          ? e.joint
            ? workRowLines(w => drawPageRow(e.row, { ...d, width: w }, isSelected), e.joint, d)
            : drawPageRow(e.row, d, isSelected)
          : drawGoalPart(e.part, d, isSelected)),
      )
      if (isSelected) pageSelectedAt = [start, body.length - 1]
    } else if (e.kind === 'banner') body.push(...bannerLines(e.banner, width, style))
    else if (e.kind === 'key')
      body.push(
        ...indented(e.key.does, e.at + e.column, width, Infinity, style.dim).map((l, n) =>
          n === 0 ? `${' '.repeat(e.at)}${style.bold(e.key.keys.padEnd(e.column))}${l.trimStart()}` : l,
        ),
      )
    else if (e.kind === 'legend') {
      const mark = paintMark(e.entry, now, style)
      body.push(
        ...indented(e.entry.words, e.textAt, width, Infinity, style.dim).map((l, n) =>
          n === 0 ? `${' '.repeat(e.at)}${mark}${' '.repeat(e.textAt - e.at - 1)}${l.trimStart()}` : l,
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
      // The stop and the install question stay rows their buttons can focus, drawn as banners.
      const bannerTone =
        e.line.id === HERDR_ASK_ID ? 'ask' : e.line.id === STOP_ID && screen.stop ? stopBanner(screen.stop).tone : null
      if (bannerTone)
        body.push(...boxed(drawLine(e.line, isSelected, { ...d, width: width - 4 }), bannerTone, width, style))
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
  const isRevealed = pageSelectedAt !== null && (ui.pageReveal === true || ui.pageReveal === pageSelected?.id)
  const top = isRevealed ? Math.min(Math.max(ui.pageTop, last - room + 2), Math.max(0, first - 1)) : ui.pageTop
  const pageTop = isPage ? Math.min(Math.max(0, top), isOverflowing ? body.length - room + 1 : 0) : ui.pageTop
  const shown = !isOverflowing
    ? body
    : isPage
      ? pageWindow(body, pageTop, room, style)
      : scrolled(body, selectedAt, room, style)

  const isStatusShown = ui.tab === 'overview' && !ui.isHelpShown
  const shownLines = isOverflowing ? pageWindowLines(body.length, pageTop, room) : { start: 0, end: body.length }
  const shownSubjects = isStatusShown
    ? subjectAt.filter(([, at]) => at >= shownLines.start && at < shownLines.end).map(([id]) => id)
    : []

  return {
    lines: [...head, ...shown, ...blanks(shown), ...foot].map(l => fit(l, width)),
    pageTop,
    isRevealed,
    shownSubjects,
  }
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
  const heights = shownTabs().map(
    t =>
      drawPanel(screen, t.id === ui.tab ? ui : withShared(ui, shownTab(ui, t.id, now)), width, now, style, height).lines
        .length,
  )

  return Math.max(...heights)
}

/** The screen before a read of the session failed, with its asks and findings marked unreadable. */
export function withScreenReadFailed(screen: PanelScreen): PanelScreen {
  return { ...screen, isReadFailed: true, view: { ...screen.view, sync: withReadFailed(screen.view.sync) } }
}

/** The band above the prompt: the counts, and under them why the last turn stopped. */
export function bandLines(screen: PanelScreen, width: number, now: number, style: Style): string[] {
  const counts = bandCounts(screen.view).map(c => `${c.label} ${style.tone(c.id, String(c.count))}`)
  const nothing = bandIdleText(screen.view.sync.ledger, { agent: AGENT, kind: screen.openDialog ?? null })
  const nothingDrawn = style.dim(nothing.text) + style.dim(nothingMark(nothing.isChecking, now))
  const left = ` ${counts.length > 0 ? counts.join(` ${style.tone('sep', '·')} `) : nothingDrawn}`
  const countLine = spread(left, style.dim('/inbox to open '), width)
  const { stop } = screen
  if (!stop) return [countLine]
  const stopLine = ` ${style.tone('error', `Stopped ${ago(now - stop.at)}:`)} ${stopText(stop)}. ${style.dim(stopFix(stop))}`

  return [countLine, fit(stopLine, width)]
}
