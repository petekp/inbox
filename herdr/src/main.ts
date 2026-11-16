import { View, div } from 'gpui-kit'
import type { Context, Element, FocusHandle } from 'gpui-kit'
import { InputState, Scrollbar, v_flex } from 'gpui-base'
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
import { publishedSessionPath, publishedSessionsFolder } from '../../hooks/herdr'
import { ROW_COPY } from '../../hooks/rows'
import { sessionView } from '../../hooks/session-view'
import type { SessionView } from '../../hooks/session-view'
import { GOAL_KEYS_ID, goalSubmitLabel } from '../../hooks/status-keys'
import { SETTLED_MS, heldReplies, isGuarded, keptDiscards, withListInput } from '../../hooks/timing'
import type { Holds, ListInput } from '../../hooks/timing'
import type { ShownTab } from '../../hooks/tabs'
import type { Draft } from '../../types'
import type { Block, Button, Does, ViewChange } from './blocks'
import { freshUi } from './draw'
import type { LookUi, TabCell } from './draw'
import { isSessionChange, readSessionFile } from './files'
import type { ReadSession } from './files'
import { follow } from './follow'
import type { Followed } from './follow'
import { helpBlocks } from './draw-help'
import {
  afterPress,
  afterSend,
  isFieldDrawn,
  keyMove,
  tabUndo,
  withChange,
  withDrawnRows,
  withCollapsed,
  withSelected,
  withTab,
  withoutConfirmed,
} from './keys'
import type { LastWaits } from './keys'
import { withCollapses, writeCollapse } from './collapse'
import { foldAllIn, foldClickOpens } from './fold-all'
import type { Collapses } from './collapse'
import { NO_LINES_ABOVE, holdLinesAbove } from './held-line'
import type { LinesAbove } from './held-line'
import { NO_TRACKS, moveRows } from './motion'
import { nextDrawAt } from './wake'
import type { Tracks } from './motion'
import { Heights, zoomOf } from './heights'
import { blockEl } from './paint-blocks'
import { timeLeftDraws } from './time-left'
import type { SentText } from './out'
import type { TimeLeft } from './time-left'
import { bannerEl, messageEl, scrollFadeEl, sessionNoteEl, tabsEl } from './paint-chrome'
import { fitEl, spacedEls } from './paint-space'
import { EDGE, END_SPACE, LINE, onSize, paneFit, TEXT } from './paint-theme'
import type { Paint, Theme } from './paint-theme'
import { PressQueue } from './press-queue'
import type { PressTarget } from './press-queue'
import { herdrIo } from './io'
import { runHere } from './run-here'
import { screenOf } from './screen'
import { AGE_TICK_MS, LOOK_TICK_MS, REREAD_MS, StatusLook, isPaneShown, statusDrawn, writeLook } from './status-look'

type SessionPresses = { drafts: Record<string, Draft>; confirmed: SentText[]; queue: PressQueue }

const { herdrRun, probe, queueIo } = herdrIo({ exec, hc, readTextFile, writeTextFile })

type Timer = { cancel(): void }

export default class Inbox extends View {
  tab: string | null = null
  last: string | null = null
  followed: Followed = { is: 'no-terminal' }
  sessionId: string | null = null
  read: ReadSession | null = null
  view: SessionView | null = null
  ui: LookUi = freshUi('needsYou')
  shownSince = Date.now()
  isHelpShown = false
  paneWidth = Infinity
  listHeight: number | null = null
  drafts: Record<string, Draft> = {}
  /** The typed replies and presses of the sessions the panel left, by session id, for when it follows them again. */
  left: Record<string, SessionPresses> = {}
  /** Sent texts the host confirmed whose drafts wait for their open field to close. */
  confirmed: SentText[] = []
  input: { rowId: string; state: InputState } | null = null
  discarded: Record<string, number> = {}
  listInput: ListInput | null = null
  queue = new PressQueue(queueIo)
  collapses: Collapses = {}
  /** When a click opened a row, so a double click does not collapse it. */
  clickedOpenAt = 0
  tracks: Tracks = NO_TRACKS
  heights = new Heights()
  tracksOf = ''
  /** The tab's rows at the last draw, so a publish that closes the selected row can move the selection on. */
  lastWaits: LastWaits = { tab: 'needsYou', rows: null }
  timeLeft: ReadonlyMap<string, TimeLeft> = new Map()
  linesAbove: LinesAbove = NO_LINES_ABOVE
  focus: FocusHandle | null = null
  /** The next read for the presses still out, and the next draw for a fold or a move. */
  outTimer: Timer | null = null
  drawTimer: Timer | null = null
  look = new StatusLook()

  init(_props: unknown, cx: Context): void {
    this.focus = cx.focus_handle()
    cx.spawn(async cx => {
      for (;;) {
        const changed = await watchFolder(publishedSessionsFolder(appHome())).catch(() => null)
        if (changed === null) await cx.sleep(REREAD_MS)
        else if (this.sessionId && isSessionChange(changed, appHome(), this.sessionId)) this.load(this.sessionId, cx)
      }
    })
    cx.timer.every(REREAD_MS, cx => this.sessionId && this.load(this.sessionId, cx))
    cx.timer.every(AGE_TICK_MS, cx => cx.notify())
    cx.timer.every(LOOK_TICK_MS, cx => cx.spawn(() => this.checkLook()))
  }

  holds(now: number): Holds {
    this.discarded = keptDiscards(this.discarded, this.shownSince)

    return {
      replies: heldReplies(this.ui.typing, this.drafts),
      discarded: this.discarded,
      shownSince: this.shownSince,
      listInput: this.listInput && withListInput(this.listInput, now),
      undoOut: this.queue.outs.filter(o => o.action === 'undo' || o.action === 'pr-undo').map(o => o.rowId),
    }
  }

  load(sessionId: string, cx: Context): void {
    cx.spawn(async cx => {
      const read = await readSessionFile(readTextFile, publishedSessionPath(appHome(), sessionId), ms => cx.sleep(ms))
      if (this.sessionId !== sessionId) return
      this.read = read
      await this.settle(cx)
      cx.notify()
    })
  }

  /** Writes the look at the Status for its session's host once the pane stops showing it. */
  async checkLook(isClosing = false): Promise<void> {
    const isShown = !isClosing && isPaneShown(props()?.pane, panes(), spaces(), herdrWindow())
    const ended = this.look.check(isShown, Date.now())
    if (ended) await writeLook(queueIo, appHome(), ended)
  }

  close(): Promise<void> {
    return this.checkLook(true)
  }

  /**
   * Ends the presses this read answers: a row that changed, the host's last press, or one with no answer in time. A
   * sent reply's draft goes once the host confirms its press.
   */
  async settle(cx: Context): Promise<void> {
    if (this.read?.is !== 'read' || !this.queue.isAwaiting()) return
    const now = Date.now()
    const view = sessionView(this.read.session, now, SETTLED_MS, this.holds(now), this.queue.notes)
    const queue = this.queue
    const confirmed = await queue.settle(view, this.read.lastPress, this.read.envelope.agent)
    if (queue === this.queue) this.dropConfirmed([...this.confirmed, ...confirmed])
    this.checkOutsAt(this.queue.nextCheckAt(), cx)
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
    const sessionId = this.followed.is === 'session' ? this.followed.sessionId : null
    if (sessionId === this.sessionId) return
    if (this.sessionId)
      this.left[this.sessionId] = { drafts: this.drafts, confirmed: this.confirmed, queue: this.queue }
    this.sessionId = sessionId
    this.read = null
    this.view = null
    this.ui = freshUi(this.ui.tab)
    this.shownSince = Date.now()
    const kept = (sessionId && this.left[sessionId]) || null
    if (sessionId) delete this.left[sessionId]
    this.drafts = kept?.drafts ?? {}
    this.confirmed = kept?.confirmed ?? []
    this.input?.state.release()
    this.input = null
    this.discarded = {}
    this.collapses = {}
    this.heights.clear()
    this.queue = kept?.queue ?? new PressQueue(queueIo)
    if (sessionId) this.load(sessionId, cx)
  }

  change(c: ViewChange): void {
    if ('toggleHelp' in c) this.isHelpShown = !this.isHelpShown
    else this.ui = withChange(this.ui, c)
    if ('showAsk' in c) this.isHelpShown = false
    this.closeStaleField()
  }

  /** Shows `tab` and closes Help, which draws the same page over any tab. */
  showTab(tab: ShownTab): void {
    this.ui = withTab(this.ui, tab)
    this.isHelpShown = false
    this.closeStaleField()
  }

  /** Lets go of the text field after a move closed it, and gives the keys back to the look. */
  closeStaleField(): void {
    if (this.input === null || this.ui.typing === this.input.rowId) return
    this.input.state.release()
    this.input = null
    this.focus?.focus()
    this.dropConfirmed(this.confirmed)
  }

  dropConfirmed(confirmed: SentText[]): void {
    const next = withoutConfirmed(this.drafts, confirmed, this.ui.typing, this.queue.sentTexts)
    this.drafts = next.drafts
    this.confirmed = next.waiting
  }

  /** Opens a row's field, or the goal's, keeping its draft. */
  type(does: Extract<Does, { is: 'type' }>): void {
    const draft = (this.drafts[does.rowId] ??= { text: does.text, since: Date.now() })
    const state = InputState.new({ placeholder: does.hint, value: draft.text })
    state.on('change', () => (draft.text = state.value()))
    state.on('submit', (_e, cx) => this.submit(does.rowId, cx))
    this.input?.state.release()
    this.input = { rowId: does.rowId, state }
    this.ui.typing = does.rowId
    state.focus()
  }

  leave(rowId: string, isDiscard: boolean, cx: Context): void {
    if (isDiscard) {
      this.discarded = { ...this.discarded, [rowId]: Date.now() }
      delete this.drafts[rowId]
    }
    this.input?.state.release()
    this.input = null
    this.ui.typing = null
    this.focus?.focus()
    this.dropConfirmed(this.confirmed)
    if (isDiscard && this.sessionId) this.load(this.sessionId, cx)
  }

  /** Sends a field's text. A refused send keeps the field open, and its row says why. Either keeps the draft. */
  submit(rowId: string, cx: Context): void {
    const text = this.input?.state.value().trim() ?? ''
    if (text === '') return
    const isGoal = rowId === GOAL_KEYS_ID
    const label = isGoal && this.view ? goalSubmitLabel(this.view.statusPage) : ROW_COPY.send
    const isSent = this.send({ action: 'type', id: rowId, text }, [], label, cx, isGoal ? undefined : text)
    this.ui = afterSend(this.ui, rowId, isSent)
    this.closeStaleField()
  }

  /**
   * Sends a press through the queue: the look runs its opens and copies, with the task's clipboard, then writes the
   * press file and wakes the host on the terminal the session file names. Returns whether the press went.
   */
  send(
    press: Extract<Does, { is: 'press' }>['press'],
    effects: Extract<Does, { is: 'press' }>['effects'],
    label: string,
    cx: Context,
    reply?: string,
  ): boolean {
    const read = this.read?.is === 'read' ? this.read : null
    const target: PressTarget | null =
      this.sessionId && read && this.view
        ? {
            appHome: appHome(),
            sessionId: this.sessionId,
            terminal: read.envelope.terminal,
            view: this.view,
            holds: this.holds(Date.now()),
            projectFolder: read.projectFolder,
          }
        : null
    const sent = this.queue.send(target, press, effects, label, reply)
    cx.notify()
    if (sent.is === 'refused') return false
    const queue = this.queue
    const projectFolder = target?.projectFolder ?? null
    cx.spawn(async cx => {
      await sent.finish(
        (effects, pending) =>
          runHere(effects, pending, {
            run: herdrRun,
            probe,
            home: home(),
            projectFolder,
            copy: t => cx.write_to_clipboard(t),
          }),
        () => cx.notify(),
      )
      cx.notify()
      if (queue === this.queue) this.checkOutsAt(queue.nextCheckAt(), cx)
    })

    return true
  }

  press(b: Button, cx: Context, isAll = false): void {
    const now = Date.now()
    this.listInput = withListInput(this.listInput, now)
    const d = b.does
    const opening = isAll ? foldClickOpens(d, this.ui) : null
    if (opening !== null) foldAllIn(this, opening, cx)
    else if (d.is === 'view') this.change(d.change)
    else if (d.is === 'collapse') this.collapse(d.id, d.isCollapsed, cx)
    else if (d.is === 'press') {
      this.ui = afterPress(this.ui, d.press)
      this.send(d.press, d.effects, b.label, cx)
    } else if (d.is === 'type') this.type(d)
    else if (d.is === 'send') this.submit(d.rowId, cx)
    else if (d.is === 'leave') this.leave(d.rowId, d.isDiscard, cx)
    cx.notify()
  }

  /** Collapses or expands row `id`. The look draws it at once, and a host that saves collapses saves it. */
  collapse(id: string, isCollapsed: boolean, cx: Context, isSelecting = true): void {
    const read = this.read?.is === 'read' ? this.read : null
    if (this.sessionId === null || read === null) return
    const c = { isCollapsed, at: Date.now() }
    this.collapses = { ...this.collapses, [id]: c }
    if (isSelecting) this.ui = withCollapsed(this.ui, id, isCollapsed)
    this.closeStaleField()
    const to = { appHome: appHome(), sessionId: this.sessionId }
    cx.spawn(() => writeCollapse(queueIo, to, read, id, c))
    cx.notify()
  }

  onKey(key: string, tabs: TabCell[], blocks: Block[], cx: Context): void {
    const undo = this.view ? tabUndo(this.view, this.ui.tab, this.shownSince) : null
    const move = keyMove(key, tabs, blocks, this.ui.typing, undo)
    if (move === null) return
    if (move.is === 'close') this.leave(this.ui.typing ?? '', false, cx)
    else if (move.is === 'tab') this.showTab(move.tab)
    else if (move.is === 'select') this.ui = withSelected(this.ui, move.id)
    else if (move.is === 'collapse') this.collapse(move.id, move.isCollapsed, cx)
    else if (move.is === 'fold-all') foldAllIn(this, null, cx)
    else if (move.is === 'press') return this.press(move.button, cx)
    else if (this.followed.is !== 'no-terminal') run('pane.focus', { terminal: this.followed.terminal })
    this.listInput = withListInput(this.listInput, Date.now())
    cx.stop_propagation()
    cx.notify()
  }

  render(cx: Context): Element {
    this.track(cx)
    const t = theme() as Theme
    const now = Date.now()
    const drawn = withCollapses(this.read, this.collapses, now)
    this.collapses = drawn.collapses
    const screenFor = (ui: LookUi) =>
      screenOf(this.followed, drawn.read, ui, {
        now,
        holds: this.holds(now),
        queue: this.queue,
      })
    let screen = screenFor(this.ui)
    const inbox = screen.is === 'inbox' ? screen : null
    const ui = withDrawnRows(
      this.ui,
      this.lastWaits,
      inbox?.waits ?? null,
      now,
      !this.isHelpShown,
      inbox?.view.statusPage,
    )
    if (ui !== this.ui) screen = screenFor((this.ui = ui))
    this.lastWaits = { tab: this.ui.tab, rows: inbox?.waits ?? null }
    this.view = inbox?.view ?? null
    this.drawTimer?.cancel()
    this.drawTimer = null
    const tracksOf = `${this.sessionId} ${this.ui.tab} ${this.isHelpShown}`
    const isFirst = tracksOf !== this.tracksOf
    const resized = this.heights.takeResized()
    const paint: Paint = {
      t,
      press: (b, cx, isAll) => this.press(b, cx, isAll),
      collapse: (id, isCollapsed, cx, isAll) => {
        if (isAll) return foldAllIn(this, !isCollapsed, cx)
        if (isCollapsed && isGuarded(this.clickedOpenAt, Date.now())) return
        if (!isCollapsed) this.clickedOpenAt = Date.now()
        this.collapse(id, isCollapsed, cx)
      },
      select: (id, cx) => {
        this.clickedOpenAt = Date.now()
        this.ui = withSelected(this.ui, id)
        this.closeStaleField()
        this.listInput = withListInput(this.listInput, Date.now())
        cx.notify()
      },
      pick: (tab: ShownTab, cx) => {
        this.showTab(tab)
        cx.notify()
      },
      motion: new Map(),
      heights: this.heights,
      isAtOnce: key => isFirst || resized.has(key),
      measure: (key, size, cx) => {
        if (this.heights.measure(key, size, zoomOf(settings()))) cx.notify()
      },
      now,
      newRows: this.ui.newRows,
      closedSeen: this.ui.closedSeen,
      tab: this.ui.tab,
      timeLeft: new Map(),
      input: rowId => (this.input?.rowId === rowId ? this.input.state : null),
      ...paneFit(this, zoomOf(settings())),
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
      this.look.drew(null, now)
      return root.child(messageEl(screen.message, t))
    }
    const shown = this.isHelpShown ? helpBlocks(screen.helpVersion) : screen.blocks
    const held = holdLinesAbove(shown, isFirst ? NO_LINES_ABOVE : this.linesAbove, now)
    this.linesAbove = held.held
    const moved = moveRows(held.blocks, this.tracks, now, isFirst)
    this.tracks = moved.tracks
    this.tracksOf = tracksOf
    paint.motion = moved.motion
    const read = drawn.read?.is === 'read' && this.ui.tab === 'overview' && !this.isHelpShown ? drawn.read : null
    const room = moved.nextAt === null ? paint.listRoom : null
    this.look.drew(statusDrawn(this.sessionId, read, screen.view, moved.blocks, this.heights, room), now)
    this.timeLeft = timeLeftDraws(moved.blocks, this.timeLeft, now)
    paint.timeLeft = this.timeLeft
    const wakeAt = nextDrawAt(now, this.ui, screen, moved)
    if (wakeAt !== null) this.drawTimer = cx.timer.after(Math.max(0, wakeAt - now), cx => cx.notify())
    const focus = this.focus

    return root
      .when(focus !== null, e => (focus ? e.track_focus(focus) : e))
      .on_key_down((event, cx) => this.onKey(event.keystroke, screen.tabs, shown, cx))
      .child(fitEl('tabs', paint, tabsEl(screen.tabs, screen.status, this.isHelpShown, paint)))
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
        div()
          .flex_1()
          .min_h(0)
          .relative()
          .child(
            v_flex()
              .id('inbox-list')
              .absolute()
              .inset_0()
              .overflow_y_scroll()
              .pt(EDGE)
              .pb(END_SPACE)
              .on_size_change(onSize(this, 'listHeight', s => s.height))
              .on_click((_e, _cx) => {
                const field = isFieldDrawn(this.ui, this.isHelpShown) ? this.input : null
                if (field) field.state.focus()
                else this.focus?.focus()
              })
              .children(spacedEls(moved.blocks, paint, b => blockEl(b, paint))),
          )
          .child(scrollFadeEl(t, 'top'))
          .child(scrollFadeEl(t, 'bottom'))
          .child(Scrollbar.vertical('inbox-list').absolute().inset_0()),
      )
  }
}
