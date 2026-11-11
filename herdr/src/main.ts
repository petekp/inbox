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
import { pressRowId } from '../../hooks/pr-press'
import { sessionView } from '../../hooks/session-view'
import type { SessionView } from '../../hooks/session-view'
import { SETTLED_MS, heldReplies, keptDiscards, withListInput } from '../../hooks/timing'
import type { Holds, ListInput } from '../../hooks/timing'
import type { ShownTab } from '../../hooks/tabs'
import type { Draft, RowNote } from '../../types'
import type { Block, Button, Does, ViewChange } from './blocks'
import { freshUi } from './draw'
import type { LookUi, TabCell } from './draw'
import { isSessionChange, readSession } from './files'
import type { ReadSession } from './files'
import { follow } from './follow'
import type { Followed } from './follow'
import { helpBlocks } from './draw-help'
import { keyMove } from './keys'
import { moveRows } from './motion'
import type { Tracks } from './motion'
import { nextOutCheckAt, outAction, rowSignature, settleOuts } from './out'
import type { Out } from './out'
import { blockEl } from './paint-blocks'
import { bannerEl, headerEl, messageEl, sessionNoteEl, tabsEl } from './paint-chrome'
import type { Paint, Theme } from './paint-theme'
import { PRESS_LABEL, newPressId, pressFileText, pressPath } from './press-file'
import { isRunHere, pendingOf, runHere } from './run-here'
import type { HereIo } from './run-here'
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
  drafts: Record<string, Draft> = {}
  input: { rowId: string; state: InputState } | null = null
  discarded: Record<string, number> = {}
  listInput: ListInput | null = null
  outs: Out[] = []
  notes: Record<string, RowNote> = {}
  errors: Record<string, string> = {}
  tracks: Tracks = new Map()
  tracksOf = ''
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
    if (this.read?.is !== 'read' || this.outs.length === 0) return
    const now = Date.now()
    for (const out of this.outs) out.isTaken = (await readTextFile(out.path).catch(() => null)) === null
    const view = sessionView(this.read.session, now, SETTLED_MS, this.holds(now), this.notes)
    const settled = settleOuts(this.outs, view, this.read.lastPress, now, this.read.envelope.agent)
    this.outs = settled.outs
    this.notes = { ...this.notes, ...settled.notes }
    this.errors = { ...this.errors, ...settled.errors }
    this.checkOutsAt(nextOutCheckAt(this.outs, now), cx)
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
    this.outs = []
    this.notes = {}
    this.errors = {}
    if (sessionId) this.load(sessionId, cx)
  }

  change(c: ViewChange): void {
    const ui = this.ui
    if ('showOptions' in c) ui.optionsShown = toggled(ui.optionsShown, c.showOptions)
    else if ('closedFold' in c) ui.unfolded = toggled(ui.unfolded, c.closedFold)
    else if ('earlier' in c) ui.closedAll = [...ui.closedAll, c.earlier]
    else if ('toggleFold' in c) ui.statusUnfolded = toggled(ui.statusUnfolded, c.toggleFold)
    else if ('showAsk' in c) this.ui = { ...ui, tab: 'needsYou', selected: c.showAsk }
    else this.isHelpShown = !this.isHelpShown
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

  submit(rowId: string, cx: Context): void {
    const text = this.input?.state.value().trim() ?? ''
    if (text === '') return
    this.send({ action: 'type', id: rowId, text }, [], cx)
    delete this.drafts[rowId]
    this.leave(rowId, false, cx)
  }

  /** Writes a press for the host, after the opens and copies the look runs itself, and wakes the host. */
  send(
    press: Extract<Does, { is: 'press' }>['press'],
    effects: Extract<Does, { is: 'press' }>['effects'],
    cx: Context,
  ) {
    const sessionId = this.sessionId
    const terminal = this.followed.is === 'session' ? this.followed.terminal : null
    const rowId = pressRowId(press)
    if (!sessionId || !terminal || !this.view || this.outs.some(o => o.rowId === rowId)) return
    const now = Date.now()
    const pressId = newPressId(now, Math.random())
    const path = pressPath(appHome(), sessionId, pressId)
    const holds = this.holds(now)
    const before = rowSignature(this.view, rowId)
    const out: Out = {
      pressId,
      rowId,
      path,
      action: outAction(press),
      pending: pendingOf(effects, now),
      since: now,
      before,
      isTaken: false,
    }
    this.outs = [...this.outs, out]
    delete this.errors[rowId]
    delete this.notes[rowId]
    cx.notify()
    const projectFolder = this.read?.is === 'read' ? this.read.projectFolder : null
    const io: HereIo = { run: herdrRun, probe, home: home(), projectFolder, copy: t => cx.write_to_clipboard(t) }
    cx.spawn(async cx => {
      const result = isRunHere(effects, projectFolder) ? { error: await runHere(effects, io) } : null
      const failed = await writeTextFile(path, pressFileText(pressId, now, press, holds, result), null).then(
        () => null,
        (e: unknown) => String(e),
      )
      if (failed !== null) {
        this.outs = this.outs.filter(o => o !== out)
        this.errors = { ...this.errors, [rowId]: `Not applied: ${failed}` }
        cx.notify()
        return
      }
      await hc(['label', terminal, `${PRESS_LABEL}=${pressId}`]).catch(() => null)
      this.checkOutsAt(nextOutCheckAt(this.outs, Date.now()), cx)
    })
  }

  press(b: Button, cx: Context): void {
    const now = Date.now()
    this.listInput = withListInput(this.listInput, now)
    const d = b.does
    if (d.is === 'view') this.change(d.change)
    else if (d.is === 'press') this.send(d.press, d.effects, cx)
    else if (d.is === 'type') this.type(d)
    else if (d.is === 'send') this.submit(d.rowId, cx)
    else if (d.is === 'leave') this.leave(d.rowId, d.isDiscard, cx)
    cx.notify()
  }

  onKey(key: string, tabs: TabCell[], blocks: Block[], cx: Context): void {
    if (this.ui.typing !== null) {
      if (key !== 'escape') return
      this.leave(this.ui.typing, false, cx)
      cx.notify()
      return
    }
    const move = keyMove(key, tabs, blocks)
    if (move === null) return
    if (move.is === 'tab') this.ui = { ...this.ui, tab: move.tab, selected: null }
    else if (move.is === 'select') this.ui.selected = move.id
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
    const screen = screenOf(this.followed, this.read, this.ui, {
      now,
      isNextBuild: this.isNextBuild,
      holds: this.holds(now),
      notes: this.notes,
      errors: this.errors,
      outs: this.outs,
    })
    this.view = screen.is === 'inbox' ? screen.view : null
    this.drawTimer?.cancel()
    this.drawTimer = null
    const paint: Paint = {
      t,
      press: (b, cx) => this.press(b, cx),
      select: (id, cx) => {
        this.ui.selected = id
        this.listInput = withListInput(this.listInput, Date.now())
        cx.notify()
      },
      pick: (tab: ShownTab, cx) => {
        this.ui = { ...this.ui, tab, selected: null }
        cx.notify()
      },
      motion: new Map(),
      input: rowId => (this.input?.rowId === rowId ? this.input.state : null),
    }
    const isInbox = screen.is === 'inbox'
    const root = v_flex()
      .id('inbox')
      .size_full()
      .min_h(0)
      .rounded(10)
      .overflow_hidden()
      .bg(t.background)
      .border_1()
      .border_color(t.border)
      .text_color(t.foreground)
      .text_size(13)
      .child(
        headerEl(
          isInbox ? screen.agent : null,
          isInbox ? screen.status : null,
          isInbox ? this.isHelpShown : null,
          paint,
        ),
      )
    if (screen.is === 'message') return root.child(messageEl(screen.message, t))
    const hasStatusButtons = screen.blocks.some(b => b.kind === 'status' && b.buttons.length > 0)
    const shown = this.isHelpShown ? helpBlocks(this.isNextBuild, this.ui.tab, hasStatusButtons) : screen.blocks
    const tracksOf = `${this.sessionId} ${this.ui.tab} ${this.isHelpShown}`
    const moved = moveRows(shown, this.tracks, now, tracksOf !== this.tracksOf)
    this.tracks = moved.tracks
    this.tracksOf = tracksOf
    paint.motion = moved.motion
    const isStarting = [...moved.motion.values()].some(m => m.isStart)
    const wakeAt = [isStarting ? now + NEXT_FRAME_MS : null, moved.nextAt, screen.foldAt].filter(at => at !== null)
    if (wakeAt.length > 0) this.drawTimer = cx.timer.after(Math.max(0, Math.min(...wakeAt) - now), cx => cx.notify())
    const focus = this.focus

    return root
      .when(focus !== null, e => (focus ? e.track_focus(focus) : e))
      .on_key_down((event, cx) => this.onKey(event.keystroke, screen.tabs, shown, cx))
      .child(tabsEl(screen.tabs, paint))
      .children(screen.banners.map(b => bannerEl(b, t)))
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
              .p(6)
              .on_click((_e, _cx) => this.focus?.focus())
              .children(moved.blocks.map(b => blockEl(b, paint))),
          )
          .child(Scrollbar.vertical('inbox-list').absolute().inset_0()),
      )
  }
}
