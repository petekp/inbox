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
  terminals,
  theme,
  watchFolder,
  writeTextFile,
} from 'herdr'
import { publishedSessionPath, publishedSessionsFolder } from '../../hooks/herdr'
import type { Run } from '../../hooks/gh'
import { NEXT_BUILD_MARK } from '../../hooks/banners'
import type { PathProbe } from '../../hooks/open-targets'
import { ROW_COPY } from '../../hooks/rows'
import { sessionView } from '../../hooks/session-view'
import type { SessionView } from '../../hooks/session-view'
import { GOAL_FIELD, GOAL_KEYS_ID } from '../../hooks/status-keys'
import { SETTLED_MS, heldReplies, keptDiscards, withListInput } from '../../hooks/timing'
import type { Holds, ListInput } from '../../hooks/timing'
import type { ShownTab } from '../../hooks/tabs'
import type { RowWait } from '../../hooks/action-plan'
import type { Draft } from '../../types'
import type { Block, Button, Does, ViewChange } from './blocks'
import { freshUi } from './draw'
import type { LookUi, TabCell } from './draw'
import { isSessionChange, readSession } from './files'
import type { ReadSession } from './files'
import { follow } from './follow'
import type { Followed } from './follow'
import { helpBlocks } from './draw-help'
import { afterSend, isFieldDrawn, keyMove, tabUndo, withClosedSelection, withSelected, withTab } from './keys'
import { NO_TRACKS, moveRows } from './motion'
import type { Tracks } from './motion'
import { blockEl } from './paint-blocks'
import { timeLeftDraws } from './paint-timer'
import type { TimeLeft } from './paint-timer'
import { bannerEl, messageEl, scrollFadeEl, sessionNoteEl, tabsEl } from './paint-chrome'
import { spacedEls } from './paint-space'
import { EDGE, END_SPACE, LINE, NARROW_PANE, TEXT } from './paint-theme'
import type { Paint, Theme } from './paint-theme'
import { PRESS_LABEL } from './press-file'
import { PressQueue, claimedPath } from './press-queue'
import type { PressTarget, QueueIo } from './press-queue'
import { runHere } from './run-here'
import { screenOf } from './screen'

/** How often the look reads its session again when no folder change came, and how long it waits to watch again. */
const REREAD_MS = 10_000
/** Ages read in minutes, so the look draws again each minute. */
const AGE_TICK_MS = 60_000
/** A read mid-write gives torn JSON: the look reads again this soon, this many times. */
const TORN_RETRY_MS = 30
const TORN_RETRIES = 5
/** The draw after a move's first frame, which starts its transition. */
const NEXT_FRAME_MS = 16

const toggled = <T>(list: T[], x: T): T[] => (list.includes(x) ? list.filter(y => y !== x) : [...list, x])

const herdrRun: Run = (args, opts) =>
  exec(args[0] ?? '', args.slice(1), { cwd: opts.cwd, timeout: opts.timeoutMs }).catch((e: unknown) => ({
    code: 127,
    stdout: '',
    stderr: String(e),
  }))

const isTrue = (args: string[]) => herdrRun(['test', ...args], { cwd: '/', timeoutMs: 5_000 }).then(r => r.code === 0)

const probe: PathProbe = {
  async stat(path) {
    if (!(await isTrue(['-e', path]))) return null
    const isFile = await isTrue(['-f', path])
    return { isFile: () => isFile }
  },
  isExecutable: path => isTrue(['-x', path]),
}

const queueIo: QueueIo = {
  now: () => Date.now(),
  random: () => Math.random(),
  write: (path, text) =>
    writeTextFile(path, text, null).then(
      () => null,
      (e: unknown) => String(e),
    ),
  isGone: async path => (await readTextFile(path).catch(() => null)) === null,
  async claim(path) {
    const moved = await herdrRun(['mv', path, claimedPath(path)], { cwd: '/', timeoutMs: 5_000 })
    if (moved.code !== 0) return false
    await herdrRun(['rm', '-f', claimedPath(path)], { cwd: '/', timeoutMs: 5_000 })
    return true
  },
  async wake(terminal, pressId) {
    await hc(['label', terminal, `${PRESS_LABEL}=${pressId}`]).catch(() => null)
  },
}

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
  isNextBuild = false
  isHelpShown = false
  isNarrow = false
  drafts: Record<string, Draft> = {}
  input: { rowId: string; state: InputState } | null = null
  discarded: Record<string, number> = {}
  listInput: ListInput | null = null
  queue = new PressQueue(queueIo)
  tracks: Tracks = NO_TRACKS
  tracksOf = ''
  /** The tab's rows at the last draw, so a publish that closes the selected row can move the selection on. */
  lastWaits: { tab: ShownTab; rows: RowWait[] } = { tab: 'needsYou', rows: [] }
  timeLeft: ReadonlyMap<string, TimeLeft> = new Map()
  focus: FocusHandle | null = null
  /** The next read for the presses still out, and the next draw for a fold or a move. */
  outTimer: Timer | null = null
  drawTimer: Timer | null = null

  init(_props: unknown, cx: Context): void {
    this.focus = cx.focus_handle()
    cx.spawn(async cx => {
      this.isNextBuild = (await readTextFile(`${appHome()}/mods/inbox/${NEXT_BUILD_MARK}`).catch(() => null)) !== null
      cx.notify()
    })
    cx.spawn(async cx => {
      for (;;) {
        const changed = await watchFolder(publishedSessionsFolder(appHome())).catch(() => null)
        if (changed === null) await cx.sleep(REREAD_MS)
        else if (this.sessionId && isSessionChange(changed, appHome(), this.sessionId)) this.load(this.sessionId, cx)
      }
    })
    cx.timer.every(REREAD_MS, cx => this.sessionId && this.load(this.sessionId, cx))
    cx.timer.every(AGE_TICK_MS, cx => cx.notify())
  }

  holds(now: number): Holds {
    this.discarded = keptDiscards(this.discarded, this.shownSince)

    return {
      replies: heldReplies(this.ui.typing, this.drafts),
      discarded: this.discarded,
      shownSince: this.shownSince,
      listInput: this.listInput && withListInput(this.listInput, now),
    }
  }

  load(sessionId: string, cx: Context): void {
    cx.spawn(async cx => {
      for (let n = 0; ; n++) {
        const text = await readTextFile(publishedSessionPath(appHome(), sessionId)).catch((e: unknown) => e)
        const read =
          typeof text === 'string' || text === null
            ? readSession(text)
            : { is: 'refused' as const, reason: String(text) }
        if (read.is === 'torn' && n < TORN_RETRIES) {
          await cx.sleep(TORN_RETRY_MS)
          continue
        }
        if (this.sessionId !== sessionId) return
        this.read = read
        await this.settle(cx)
        cx.notify()
        return
      }
    })
  }

  /** Ends the presses this read answers: a row that changed, the host's last press, or one with no answer in time. */
  async settle(cx: Context): Promise<void> {
    if (this.read?.is !== 'read' || this.queue.outs.length === 0) return
    const now = Date.now()
    const view = sessionView(this.read.session, now, SETTLED_MS, this.holds(now), this.queue.notes)
    await this.queue.settle(view, this.read.lastPress, this.read.envelope.agent)
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
    this.followed = follow({ focused: focused(), panes: panes(), terminals: terminals() }, this.tab, this.last)
    if (this.followed.is !== 'no-terminal') this.last = this.followed.terminal
    const sessionId = this.followed.is === 'session' ? this.followed.sessionId : null
    if (sessionId === this.sessionId) return
    this.sessionId = sessionId
    this.read = null
    this.view = null
    this.ui = freshUi(this.ui.tab)
    this.shownSince = Date.now()
    this.drafts = {}
    this.input?.state.release()
    this.input = null
    this.discarded = {}
    this.queue = new PressQueue(queueIo)
    if (sessionId) this.load(sessionId, cx)
  }

  change(c: ViewChange): void {
    const ui = this.ui
    if ('showOptions' in c) ui.optionsShown = toggled(ui.optionsShown, c.showOptions)
    else if ('closedFold' in c) ui.unfolded = toggled(ui.unfolded, c.closedFold)
    else if ('earlier' in c) ui.closedAll = [...ui.closedAll, c.earlier]
    else if ('toggleFold' in c) ui.statusUnfolded = toggled(ui.statusUnfolded, c.toggleFold)
    else if ('showAsk' in c) this.ui = withSelected({ ...ui, tab: 'needsYou' }, c.showAsk)
    else this.isHelpShown = !this.isHelpShown
    this.closeStaleField()
  }

  /** Lets go of the text field after a move closed it, and gives the keys back to the look. */
  closeStaleField(): void {
    if (this.input === null || this.ui.typing === this.input.rowId) return
    this.input.state.release()
    this.input = null
    this.focus?.focus()
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
    if (isDiscard && this.sessionId) this.load(this.sessionId, cx)
  }

  /** Sends a field's text. A refused send keeps the field and its draft, and its row says why. */
  submit(rowId: string, cx: Context): void {
    const text = this.input?.state.value().trim() ?? ''
    if (text === '') return
    const isGoal = rowId === GOAL_KEYS_ID
    const label = isGoal ? GOAL_FIELD.submit : ROW_COPY.send
    const isSent = this.send({ action: 'type', id: rowId, text }, [], label, cx, isGoal ? undefined : text)
    const next = afterSend(this.ui, this.drafts, rowId, isSent)
    this.ui = next.ui
    this.drafts = next.drafts
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

  press(b: Button, cx: Context): void {
    const now = Date.now()
    this.listInput = withListInput(this.listInput, now)
    const d = b.does
    if (d.is === 'view') this.change(d.change)
    else if (d.is === 'press') {
      if ('id' in d.press && d.press.action === 'undo') this.ui = withSelected(this.ui, d.press.id)
      this.send(d.press, d.effects, b.label, cx)
    } else if (d.is === 'type') this.type(d)
    else if (d.is === 'send') this.submit(d.rowId, cx)
    else if (d.is === 'leave') this.leave(d.rowId, d.isDiscard, cx)
    cx.notify()
  }

  onKey(key: string, tabs: TabCell[], blocks: Block[], cx: Context): void {
    const undo = this.view ? tabUndo(this.view, this.ui.tab, this.shownSince) : null
    const move = keyMove(key, tabs, blocks, this.ui.typing, undo)
    if (move === null) return
    if (move.is === 'close') this.leave(this.ui.typing ?? '', false, cx)
    else if (move.is === 'tab') this.ui = withTab(this.ui, move.tab)
    else if (move.is === 'select') this.ui = withSelected(this.ui, move.id)
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
    const screenFor = (ui: LookUi) =>
      screenOf(this.followed, this.read, ui, {
        now,
        isNextBuild: this.isNextBuild,
        holds: this.holds(now),
        queue: this.queue,
      })
    let screen = screenFor(this.ui)
    if (screen.is === 'inbox' && this.lastWaits.tab === this.ui.tab) {
      const ui = withClosedSelection(this.ui, this.lastWaits.rows, screen.waits)
      if (ui !== this.ui) screen = screenFor((this.ui = ui))
    }
    this.lastWaits = { tab: this.ui.tab, rows: screen.is === 'inbox' ? screen.waits : [] }
    this.view = screen.is === 'inbox' ? screen.view : null
    this.drawTimer?.cancel()
    this.drawTimer = null
    const paint: Paint = {
      t,
      press: (b, cx) => this.press(b, cx),
      select: (id, cx) => {
        this.ui = withSelected(this.ui, id)
        this.closeStaleField()
        this.listInput = withListInput(this.listInput, Date.now())
        cx.notify()
      },
      pick: (tab: ShownTab, cx) => {
        this.ui = withTab(this.ui, tab)
        this.closeStaleField()
        cx.notify()
      },
      motion: new Map(),
      now,
      timeLeft: new Map(),
      input: rowId => (this.input?.rowId === rowId ? this.input.state : null),
      isNarrow: this.isNarrow,
    }
    const root = v_flex()
      .id('inbox')
      .size_full()
      .min_h(0)
      .bg(t.background)
      .text_color(t.foreground)
      .text_size(TEXT)
      .line_height(LINE)
      .on_size_change((size, cx) => {
        const isNarrow = size.width < NARROW_PANE
        if (isNarrow === this.isNarrow) return
        this.isNarrow = isNarrow
        cx.notify()
      })
    if (screen.is === 'message') {
      this.timeLeft = new Map()
      this.tracksOf = ''
      return root.child(messageEl(screen.message, t))
    }
    const hasStatusButtons = screen.blocks.some(b => b.kind === 'status' && b.buttons.length > 0)
    const shown = this.isHelpShown ? helpBlocks(this.isNextBuild, this.ui.tab, hasStatusButtons) : screen.blocks
    const tracksOf = `${this.sessionId} ${this.ui.tab} ${this.isHelpShown}`
    const moved = moveRows(shown, this.tracks, now, tracksOf !== this.tracksOf)
    this.tracks = moved.tracks
    this.tracksOf = tracksOf
    paint.motion = moved.motion
    const isStarting = [...moved.motion.values()].some(m => m.isStart)
    this.timeLeft = timeLeftDraws(moved.blocks, this.timeLeft, now)
    paint.timeLeft = this.timeLeft
    const isTimerStarting = [...this.timeLeft.values()].some(l => l.is === 'emptying' && !l.isStarted)
    const nextFrame = isStarting || isTimerStarting ? now + NEXT_FRAME_MS : null
    const wakeAt = [nextFrame, moved.nextAt, screen.foldAt].filter(at => at !== null)
    if (wakeAt.length > 0) this.drawTimer = cx.timer.after(Math.max(0, Math.min(...wakeAt) - now), cx => cx.notify())
    const focus = this.focus

    return root
      .when(focus !== null, e => (focus ? e.track_focus(focus) : e))
      .on_key_down((event, cx) => this.onKey(event.keystroke, screen.tabs, shown, cx))
      .child(tabsEl(screen.tabs, screen.status, this.isHelpShown, paint))
      .children(screen.banners.map(b => bannerEl(b, t).mt(EDGE)))
      .when(screen.trimmedNote !== null, e => e.child(sessionNoteEl(screen.trimmedNote ?? '', t)))
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
              .on_click((_e, _cx) => {
                const field = isFieldDrawn(this.ui, this.isHelpShown) ? this.input : null
                if (field) field.state.focus()
                else this.focus?.focus()
              })
              .children(spacedEls(moved.blocks, b => blockEl(b, paint))),
          )
          .child(scrollFadeEl(t, 'top'))
          .child(scrollFadeEl(t, 'bottom'))
          .child(Scrollbar.vertical('inbox-list').absolute().inset_0()),
      )
  }
}
