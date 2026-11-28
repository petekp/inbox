import { View } from 'gpui-kit'
import type { Context, Element, FocusHandle } from 'gpui-kit'
import { InputState, v_flex } from 'gpui-base'
import {
  appHome,
  exec,
  focused,
  hc,
  home,
  panes,
  props,
  readTextFile,
  run,
  settings,
  spaces,
  terminals,
  theme,
  watchFolder,
  window as herdrWindow,
  writeTextFile,
} from 'herdr'
import * as herdr from 'herdr'
import { publishedSessionPath } from '../../core/remote/herdr'
import type { SessionView } from '../../core/view/session-view'
import type { ShownTab } from '../../core/view/tabs'
import { readWakeAt } from '../../core/view/ui-controller-clock'
import { closed, newRowsOf, opened } from '../../core/view/ui-controller-tabs'
import { freshUi } from '../../core/view/ui-controller-types'
import type { UiCommand, UiEvent, UiState } from '../../core/view/ui-controller-types'
import type { Block, Button } from './blocks'
import {
  HERDR_LOOK,
  applyEvents,
  buttonEvents,
  buttonOf,
  fieldHints,
  hostFactsOf,
  NO_DRAW,
  drawOf,
  isAnswerDraw,
  isLookMove,
  keptLeft,
  pressSending,
  titleClickEvents,
} from './controller'
import type { LastDraw, LeftSession } from './controller'
import type { TabCell } from './draw'
import { readSessionFile } from '../../core/remote/herdr-read'
import type { ReadSession } from '../../core/remote/herdr-read'
import { follow } from './follow'
import type { Followed } from './follow'
import { helpBlocks } from './draw-help'
import { isFieldDrawn, keyMove } from './keys'
import { writeCollapse } from './collapse'
import { NO_LINES_ABOVE, holdLinesAbove } from './held-line'
import { heldAsDrawn } from './held-drawn'
import type { LinesAbove } from './held-line'
import { moveRows } from './motion'
import { NO_TRACKS } from './tracks'
import { TabCounts } from './tab-counts'
import { nextDrawAt } from './wake'
import { HeldFades } from './held-fades'
import type { Tracks } from './tracks'
import { Heights, zoomOf } from './heights'
import { blockEl } from './paint-blocks'
import { timeLeftDraws } from './time-left'
import type { TimeLeft } from './time-left'
import { bannerEl, messageEl, sessionNoteEl, tabsEl } from './paint-chrome'
import { ListScroll, listEl } from './paint-list'
import { fitEl, spacedEls } from './paint-space'
import { EDGE, LINE, onSize, paneFit, TEXT } from './paint-theme'
import type { Paint, Theme } from './paint-theme'
import { PressQueue } from './press-queue'
import { herdrIo } from './io'
import { runHere } from './run-here'
import { FetchedReads, screenAt } from './fetched'
import { ViewCache } from './view-cache'
import { LookReports } from './look-reports'
import { LIST_INPUT_STEP_MS, isPaneShown, ownPaneId } from './status-look'
import { startBackground } from './background'
import { statusDrawn } from './status-look'

const { queueIo, hereIo } = herdrIo({ exec, hc, readTextFile, writeTextFile, home })

/**
 * Whether `herdr-app check` is loading the mod. Herdr apps before `checking()` have no such export, and a mod that
 * names a missing export in an import fails to load, so this reads it from the module.
 */
const isChecking = (): boolean => (herdr as { checking?: () => boolean }).checking?.() ?? false

type Timer = { cancel(): void }

type Read = Extract<ReadSession, { is: 'read' }>

export default class Inbox extends View {
  tab: string | null = null
  last: string | null = null
  pane: string | undefined = undefined
  followed: Followed = { is: 'no-terminal' }
  sessionId: string | null = null
  read: ReadSession | null = null
  /** The shared controller's state for the session shown. */
  ui: UiState = freshUi(HERDR_LOOK)
  /** When the look began showing the session, and whether its first read opened it. */
  shownAt = Date.now()
  isOpened = false
  paneWidth = Infinity
  listHeight: number | null = null
  /** The controller states of the sessions the look left, by session id, and their presses still out. */
  left: Record<string, LeftSession> = {}
  queues: Record<string, PressQueue> = {}
  input: { rowId: string; state: InputState } | null = null
  queue = new PressQueue(queueIo)
  tracks: Tracks = NO_TRACKS
  tabCounts = new TabCounts()
  heights = new Heights()
  viewCache = new ViewCache(() => {
    const read = this.readSession
    return read && { read, ui: this.ui }
  })
  tracksOf = ''
  /** The blocks of the last draw, whose buttons give a key's press its label and effects. */
  blocks: Block[] = []
  lastDraw: LastDraw = NO_DRAW
  timeLeft: ReadonlyMap<string, TimeLeft> = new Map()
  linesAbove: LinesAbove = NO_LINES_ABOVE
  focus: FocusHandle | null = null
  /** When the person last pressed a key or clicked in the look, which lets the rows it moves grow at once. */
  movedAt = 0
  fetched = new FetchedReads()
  /** The next read for the presses still out, the next draw for a move, and the controller's next wake. */
  outTimer: Timer | null = null
  drawTimer: Timer | null = null
  fades = new HeldFades()
  wake: { at: number; isRead: boolean; timer: Timer } | null = null
  look = new LookReports()
  scroll: ListScroll | null = null

  init(_props: unknown, cx: Context): void {
    this.focus = cx.focus_handle()
    this.scroll = new ListScroll()
    startBackground(this, { isChecking, appHome, watchFolder }, cx)
  }

  get readSession(): Read | null {
    return this.read?.is === 'read' ? this.read : null
  }

  /** The session's view at `now`, with the rows and notes the controller holds, or null before a read. */
  viewAt(now: number): SessionView | null {
    return this.viewCache.at(now)
  }

  /**
   * Runs `events` through the shared controller, then its commands, then the answers of presses that ended, and draws.
   * List use and typing change nothing drawn, so they draw only when their commands do.
   */
  apply(events: UiEvent[], cx: Context, from: Button | null = null): void {
    const now = Date.now()
    const view = this.viewAt(now)
    if (view === null) return
    const isMove = events.some(isLookMove)
    if (isMove && this.movedAt <= this.tracks.drawnAt) this.fetched.note(this, this.readSession, this.ui, now)
    const applied = applyEvents(this.ui, view, events, now)
    this.ui = applied.ui
    if (isMove) this.movedAt = now
    if (events.some(e => e.type === 'show-help' && e.isShown)) this.scroll?.startOver('help')
    this.syncInput(isMove)
    for (const c of applied.commands) this.run(c, from, cx)
    this.schedule(applied.nextWakeAt, view, cx)
    this.viewCache.prepare(cx)
    if (!this.endPresses(cx) && !events.every(e => e.type === 'list-input' || e.type === 'edit-draft')) cx.notify()
  }

  /** Gives the controller how the presses that ended since the last call went. Returns whether any had. */
  endPresses(cx: Context): boolean {
    const ended = this.queue.takeEnded()
    if (ended.length > 0)
      this.apply(
        ended.map(e => ({ type: 'press-settled', pressId: e.uiPressId, outcome: e.outcome })),
        cx,
      )

    return ended.length > 0
  }

  run(c: UiCommand, from: Button | null, cx: Context): void {
    const sessionId = this.sessionId
    const read = this.readSession
    if (c.kind === 'press') this.send(c, from, cx)
    else if (c.kind === 'save-collapse' && sessionId && read) {
      const to = { appHome: appHome(), sessionId }
      const collapse = { isCollapsed: c.isCollapsed, at: Date.now() }
      cx.spawn(() => writeCollapse(queueIo, to, read, c.id, collapse))
    } else if (c.kind === 'read' && sessionId) this.load(sessionId, cx)
    else if (c.kind === 'tab-shown' && c.startsOver) this.scroll?.startOver(c.tab)
  }

  /**
   * Holds the open field to the controller's: lets go of one it closed, giving the keys to the look, and opens the one
   * it opened, with its draft. The new field takes the keys on the person's own move, or when the look holds them.
   */
  syncInput(isMove: boolean): void {
    const typing = this.ui.typing
    if (this.input !== null && this.input.rowId === typing) return
    const hadField = this.input !== null
    this.releaseField()
    if (typing === null) return void (hadField && this.focus?.focus())
    const state = InputState.new({ placeholder: this.hints[typing] ?? '', value: this.ui.drafts[typing]?.text ?? '' })
    state.on('change', (_e, cx) => this.apply([{ type: 'edit-draft', id: typing, text: state.value() }], cx))
    state.on('submit', (_e, cx) => this.apply(buttonEvents({ is: 'send', rowId: typing }, this.ui, 'key'), cx))
    this.input = { rowId: typing, state }
    if (isMove || this.focus?.is_focused()) state.focus()
  }

  /** Lets go of the open field without moving the keys, so it can run while the look draws. */
  releaseField(): void {
    this.input?.state.release()
    this.input = null
  }

  /** The placeholder of each field the last draw offered, by row. */
  hints: Record<string, string> = {}

  schedule(at: number | null, view: SessionView, cx: Context): void {
    const readAt = at === null ? null : readWakeAt(this.ui, view, Date.now())
    const isRead = readAt !== null && at !== null && readAt <= at
    if (this.wake !== null && this.wake.at === at && this.wake.isRead === isRead) return
    this.wake?.timer.cancel()
    this.wake = null
    if (at === null) return
    const timer = cx.timer.after(Math.max(0, at - Date.now()), cx => {
      this.wake = null
      if (isRead && this.sessionId) this.load(this.sessionId, cx)
      else this.apply([{ type: 'tick' }], cx)
    })
    this.wake = { at, isRead, timer }
  }

  load(sessionId: string, cx: Context): void {
    cx.spawn(async cx => {
      const read = await readSessionFile(readTextFile, publishedSessionPath(appHome(), sessionId), ms => cx.sleep(ms))
      if (this.sessionId !== sessionId) return
      this.read = read
      if (this.movedAt > this.tracks.drawnAt) this.fetched.note(this, this.readSession, this.ui, Date.now())
      if (read.is !== 'read') return void cx.notify()
      if (!this.isOpened) this.ui = opened(this.ui, this.shownAt)
      this.isOpened = true
      this.apply([{ type: 'read', host: hostFactsOf(read) }], cx)
      await this.settle(read, cx)
    })
  }

  /** Writes the look at the Status for its session's host once the pane stops showing it. */
  async checkLook(isClosing = false): Promise<void> {
    const isShown = !isClosing && isPaneShown(this.pane, panes(), spaces(), herdrWindow())
    const page = { tab: this.ui.tab, sessionId: this.sessionId, read: this.read }
    await this.look.check(queueIo, appHome(), isShown, page, Date.now())
  }

  close(): Promise<void> {
    return this.checkLook(true)
  }

  /** Ends the presses this read answers: a row that changed, the host's last press, or one with no answer in time. */
  async settle(read: Read, cx: Context): Promise<void> {
    const queue = this.queue
    const view = this.viewAt(Date.now())
    if (view === null || !queue.isAwaiting()) return
    await queue.settle(view, read.lastPress, read.envelope.agent)
    if (queue !== this.queue) return
    if (!this.endPresses(cx)) cx.notify()
    this.checkOutsAt(queue.nextCheckAt(), cx)
  }

  checkOutsAt(at: number | null, cx: Context): void {
    this.outTimer?.cancel()
    const sessionId = this.sessionId
    this.outTimer =
      at === null || sessionId === null
        ? null
        : cx.timer.after(Math.max(0, at - Date.now()), cx => this.load(sessionId, cx))
  }

  /** Follows the terminal Herdr says to, and starts reading its session when that changes. */
  track(cx: Context): void {
    const own = panes().find(p => p.pane === props()?.pane)
    this.tab ??= own?.tab ?? focused()?.tab ?? null
    if (this.tab === null) return
    const terminalRecords = terminals().map(({ address, labels, program }) => ({ address, labels, program }))
    this.followed = follow({ focused: focused(), panes: panes(), terminals: terminalRecords }, this.tab, this.last)
    if (this.followed.is !== 'no-terminal') this.last = this.followed.terminal
    this.pane = ownPaneId(props()?.pane, panes(), this.tab, terminalRecords, this.last)
    const sessionId = this.followed.is === 'session' ? this.followed.sessionId : null
    if (sessionId === this.sessionId) return
    const now = Date.now()
    if (this.sessionId) {
      this.left[this.sessionId] = { ui: closed(this.ui), shownAt: now }
      this.queues[this.sessionId] = this.queue
    }
    const kept = (sessionId && this.left[sessionId]) || null
    const queue = (sessionId && this.queues[sessionId]) || null
    if (sessionId) delete this.left[sessionId]
    if (sessionId) delete this.queues[sessionId]
    this.queues = Object.fromEntries(Object.entries(this.queues).filter(([, q]) => q.holdsPresses()))
    this.left = keptLeft(this.left, id => this.queues[id] !== undefined)
    this.sessionId = sessionId
    this.read = null
    this.ui = kept?.ui ?? freshUi(HERDR_LOOK, this.ui.tab)
    this.shownAt = now
    this.isOpened = false
    this.queue = queue ?? new PressQueue(queueIo)
    this.wake?.timer.cancel()
    this.wake = null
    this.releaseField()
    this.heights.clear()
    this.scroll?.startAllOver()
    if (sessionId) this.load(sessionId, cx)
  }

  /**
   * Sends a press the controller made through the queue: the look runs its opens and copies, with the task's
   * clipboard, then writes the press file and wakes the host on the terminal the session file names.
   */
  send(c: Extract<UiCommand, { kind: 'press' }>, from: Button | null, cx: Context): void {
    const at = { appHome: appHome(), sessionId: this.sessionId, read: this.readSession }
    const { target, options } = pressSending(c, from ?? buttonOf(this.blocks, c.press), at, this.viewAt(Date.now()))
    const sent = this.queue.send(target, c.press, options)
    if (sent.is === 'refused') return
    const queue = this.queue
    const projectFolder = target?.projectFolder ?? null
    cx.spawn(async cx => {
      await sent.finish(
        (effects, pending) => runHere(effects, pending, hereIo(projectFolder, cx)),
        () => cx.notify(),
      )
      if (queue !== this.queue) return
      if (!this.endPresses(cx)) cx.notify()
      this.checkOutsAt(queue.nextCheckAt(), cx)
    })
  }

  onKey(key: string, tabs: TabCell[], blocks: Block[], cx: Context): void {
    const move = keyMove(key, tabs, blocks, this.ui.typing, this.ui.isHelpShown)
    if (move === null) return
    cx.stop_propagation()
    if (move.is === 'event') this.apply([move.event], cx)
    else if (move.is === 'press') this.apply(buttonEvents(move.button.does, this.ui, 'key'), cx, move.button)
    else this.focusTerminal()
  }

  /** Gives focus to the terminal the look follows, whose session it shows. */
  focusTerminal(): void {
    if (this.followed.is !== 'no-terminal') run('pane.focus', { terminal: this.followed.terminal })
  }

  render(cx: Context): Element {
    this.track(cx)
    const t = theme() as Theme
    const now = Date.now()
    const ui = this.ui
    const raw = this.viewAt(now)
    const screen = screenAt(this, this.read, ui, raw, now)
    this.drawTimer?.cancel()
    this.drawTimer = null
    const tracksOf = `${this.sessionId} ${ui.tab} ${ui.isHelpShown}`
    const isFirst = tracksOf !== this.tracksOf
    const resized = this.heights.takeResized()
    const isForming = this.heights.isForming(isFirst, now)
    const paint: Paint = {
      t,
      mono: (theme() as { typography?: { mono?: string } }).typography?.mono ?? 'Menlo',
      press: (b, cx, isAll) =>
        b.does.is === 'focusTerminal'
          ? this.focusTerminal()
          : this.apply(buttonEvents(b.does, this.ui, 'click', isAll), cx, b),
      collapse: (id, isCollapsed, cx, isAll) =>
        this.apply(titleClickEvents(this.ui, id, isCollapsed, isAll === true), cx),
      select: (id, cx) => this.apply(titleClickEvents(this.ui, id, false, false), cx),
      pick: (tab: ShownTab, cx) => this.apply([{ type: 'show-tab', tab }], cx),
      motion: new Map(),
      heights: this.heights,
      isAtOnce: key => isForming || resized.has(key),
      measure: (key, size, cx, isWidthDrawn) =>
        this.heights.measure(key, size, zoomOf(settings()), isWidthDrawn) && cx.notify(),
      now,
      newRows: newRowsOf(ui),
      closedSeen: new Map(Object.entries(ui.closedSeen)),
      tab: ui.tab,
      timeLeft: new Map(),
      input: rowId => (this.input?.rowId === rowId ? this.input.state : null),
      ...paneFit(this, zoomOf(settings())),
      fades: this.fades,
    }
    const root = v_flex()
      .id('inbox')
      .size_full()
      .min_h(0)
      .bg(t.background)
      .text_color(t.foreground)
      .text_size(TEXT)
      .line_height(LINE)
      .on_size_change(onSize(this, 'paneWidth', s => s.width))
    if (screen.is === 'message') {
      this.timeLeft = new Map()
      this.tracksOf = ''
      this.blocks = []
      this.lastDraw = { ...NO_DRAW, tab: ui.tab }
      this.look.status.drew(null, now)
      this.fades.drew()
      return root.child(messageEl(screen.message, t))
    }
    const shown = ui.isHelpShown ? helpBlocks(screen.helpVersion) : screen.blocks
    this.blocks = shown
    this.hints = fieldHints(shown)
    const thisDraw = drawOf(ui.tab, screen.waits, this.queue.outs, this.read)
    const isAnswer = isAnswerDraw(this.lastDraw, thisDraw, raw)
    this.lastDraw = thisDraw
    const isInput = isAnswer || this.movedAt > this.tracks.drawnAt
    const lastAbove = isFirst ? NO_LINES_ABOVE : this.linesAbove
    const held = holdLinesAbove(shown, lastAbove, now, isForming, isInput)
    const fetched = this.fetched.drew(this.readSession, isAnswer, now)
    const moved = moveRows(held.blocks, this.tracks, now, isFirst, isInput, this.heights, fetched)
    this.linesAbove = heldAsDrawn(held, lastAbove, moved)
    this.tracks = moved.tracks
    this.tracksOf = tracksOf
    paint.motion = moved.motion
    const tabs = this.tabCounts.draw(screen.tabs, moved.motion, now, isFirst)
    const read = this.readSession && ui.tab === 'overview' && !ui.isHelpShown ? this.readSession : null
    const room = moved.nextAt === null ? paint.listRoom : null
    this.look.status.drew(statusDrawn(this.sessionId, read, screen.view, moved.blocks, this.heights, room), now)
    this.timeLeft = timeLeftDraws(moved.blocks, this.timeLeft, now)
    paint.timeLeft = this.timeLeft
    const focus = this.focus
    const listInput = (cx: Context) => {
      const isNew = Date.now() - (this.ui.listInput?.last ?? 0) >= LIST_INPUT_STEP_MS
      if (isNew) this.apply([{ type: 'list-input' }], cx)
    }

    const drawn = root
      .when(focus !== null, e => (focus ? e.track_focus(focus) : e))
      .on_key_down((event, cx) => this.onKey(event.keystroke, screen.tabs, shown, cx))
      .child(fitEl('tabs', paint, tabsEl(tabs, ui.isHelpShown, paint)))
      .child(
        fitEl(
          'chrome',
          paint,
          v_flex()
            .children(screen.banners.map(b => bannerEl(b, t).mt(EDGE)))
            .when(screen.trimmedNote !== null, e => e.child(sessionNoteEl(screen.trimmedNote ?? '', t))),
        ),
      )
      .child(
        listEl({
          t,
          scroll: this.scroll?.of(ui.isHelpShown ? 'help' : ui.tab) ?? null,
          rows: spacedEls(moved.blocks, paint, b => blockEl(b, paint)),
          onHeight: onSize(this, 'listHeight', s => s.height),
          onUse: listInput,
          onClick: () => {
            const field = isFieldDrawn(this.ui.typing, this.ui.isHelpShown) ? this.input : null
            if (field) field.state.focus()
            else this.focus?.focus()
          },
        }),
      )
    const wakeAt = nextDrawAt(now, moved, [this.fades.drew(), held.nextAt, this.tabCounts.nextAt])
    if (wakeAt !== null) this.drawTimer = cx.timer.after(Math.max(0, wakeAt - now), cx => cx.notify())

    return drawn
  }
}
