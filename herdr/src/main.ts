import { View, div } from 'gpui-kit'
import type { Context, Element } from 'gpui-kit'
import { Scrollbar, h_flex, v_flex } from 'gpui-base'
import { appHome, focused, panes, props, readTextFile, terminals, theme, watchFolder } from 'herdr'
import { NEXT_BUILD_MARK } from '../../hooks/banners'
import type { BannerView } from '../../hooks/banners'
import { STALL_GAP } from '../../hooks/status-page'
import type { ShownTab } from '../../hooks/tabs'
import type { Block, Button, Mark, RowBlock, StatusLine, Tone } from './blocks'
import { freshUi } from './draw'
import type { LookUi, TabCell } from './draw'
import { isSessionChange, readSession, sessionPath, sessionsFolder } from './files'
import type { ReadSession } from './files'
import { follow } from './follow'
import type { Followed } from './follow'
import { screenOf } from './screen'
import type { Message } from './screen'

/** How often the look reads its session again when no folder change came, and how long it waits to watch again. */
const REREAD_MS = 10_000
/** Ages read in minutes, so the look draws again each minute. */
const AGE_TICK_MS = 60_000
/** A read mid-write gives torn JSON: the look reads again this soon, this many times. */
const TORN_RETRY_MS = 30
const TORN_RETRIES = 5

type Color = `#${string}`
/** The theme colors the look draws with. Every Herdr theme names each of them, light or dark. */
type Theme = Record<
  | 'foreground'
  | 'background'
  | 'raised'
  | 'border'
  | 'hover'
  | 'selected'
  | 'solid'
  | 'solid_foreground'
  | 'muted'
  | 'dim'
  | 'blocked'
  | 'done'
  | 'working'
  | 'ansi1',
  Color
>

const TONE_COLORS: Record<Exclude<Tone, null>, keyof Theme> = {
  needsYou: 'blocked',
  issue: 'blocked',
  warning: 'blocked',
  done: 'done',
  running: 'working',
  error: 'ansi1',
  muted: 'muted',
  dim: 'dim',
}

const colorOf = (t: Theme, tone: Tone): Color => t[tone === null ? 'foreground' : TONE_COLORS[tone]]

type Press = (b: Button, cx: Context) => void

function buttonEl(b: Button, t: Theme, press: Press): Element {
  const base = h_flex()
    .id(`button ${b.id}`)
    .h(28)
    .px(10)
    .flex_none()
    .items_center()
    .rounded(7)
    .text_size(12)
    .accessibility_label(b.label)
    .child(b.label)
  const styled =
    b.emphasis === 'primary'
      ? base.bg(t.solid).text_color(t.solid_foreground)
      : b.emphasis === 'normal'
        ? base.bg(t.raised).border_1().border_color(t.border).text_color(t.foreground)
        : base.text_color(t.muted).hover(s => s.bg(t.hover))
  if (b.isOut) return styled.opacity(0.5)

  return styled.cursor_pointer().on_click((_e, cx) => {
    cx.stop_propagation()
    press(b, cx)
  })
}

const buttonsEl = (buttons: Button[], t: Theme, press: Press, indent: number): Element =>
  h_flex()
    .flex_wrap()
    .gap(6)
    .pt(6)
    .pl(indent)
    .children(buttons.map(b => buttonEl(b, t, press)))

const markEl = (m: Mark | null, t: Theme): Element =>
  div()
    .w(14)
    .flex_none()
    .text_color(colorOf(t, m?.tone ?? null))
    .child(m?.text ?? '')

function rowEl(r: RowBlock, t: Theme, press: Press, select: (id: string, cx: Context) => void): Element {
  const line = h_flex()
    .gap(8)
    .items_start()
    .child(markEl(r.mark, t))
    .child(
      div()
        .flex_1()
        .min_w(0)
        .text_color(r.isDim ? t.muted : t.foreground)
        .when(!r.isSelected, e => e.truncate())
        .when(r.isSelected, e => e.font_semibold())
        .child(r.title),
    )
    .when(r.age !== null, e =>
      e.child(
        div()
          .flex_none()
          .text_size(11)
          .text_color(t.dim)
          .child(r.age ?? ''),
      ),
    )
  const lines = [
    ...(r.settled ? [{ text: r.settled.label, tone: r.settled.tone }] : []),
    ...(r.feedback ? [r.feedback] : []),
    ...r.body,
  ]

  return v_flex()
    .id(`row ${r.id}`)
    .px(8)
    .py(6)
    .ml(r.depth * 14)
    .rounded(7)
    .when(r.isSelected, e => e.bg(t.selected))
    .when(r.isSelectable && !r.isSelected, e =>
      e
        .cursor_pointer()
        .hover(s => s.bg(t.hover))
        .on_click((_e, cx) => select(r.id, cx)),
    )
    .child(line)
    .children(
      lines.map(l => div().pl(22).pt(2).text_size(12).whitespace_normal().text_color(colorOf(t, l.tone)).child(l.text)),
    )
    .when(r.buttons.length > 0, e => e.child(buttonsEl(r.buttons, t, press, 22)))
}

function statusEl(s: StatusLine, t: Theme, press: Press): Element {
  const stall = s.stall
    ? [div().flex_none().text_color(colorOf(t, s.stall.tone)).child(`${STALL_GAP}${s.stall.text}`)]
    : []

  return v_flex()
    .px(8)
    .py(4)
    .ml(s.depth * 16)
    .child(
      h_flex()
        .gap(8)
        .items_start()
        .child(markEl(s.mark, t))
        .child(
          h_flex()
            .flex_1()
            .min_w(0)
            .flex_wrap()
            .child(
              div()
                .when(s.isBold, e => e.font_semibold())
                .child(s.name),
            )
            .children(stall),
        ),
    )
    .children(s.under.map(l => div().pl(22).text_size(12).text_color(t.muted).child(l)))
    .when(s.buttons.length > 0, e => e.child(buttonsEl(s.buttons, t, press, 22)))
}

function blockEl(b: Block, t: Theme, press: Press, select: (id: string, cx: Context) => void): Element {
  if (b.kind === 'row') return rowEl(b, t, press, select)
  if (b.kind === 'status') return statusEl(b, t, press)
  if (b.kind === 'heading')
    return h_flex()
      .px(8)
      .pt(12)
      .pb(4)
      .gap(6)
      .items_center()
      .when(b.mark !== null, e =>
        e.child(
          div()
            .text_color(colorOf(t, b.mark?.tone ?? null))
            .child(b.mark?.text ?? ''),
        ),
      )
      .child(div().text_size(12).font_semibold().text_color(t.muted).child(b.text))
      .when(b.count !== null, e => e.child(div().text_size(11).text_color(t.blocked).child(String(b.count))))
      .child(div().flex_1())
      .children(b.buttons.map(x => buttonEl(x, t, press)))
  if (b.kind === 'fold' || b.kind === 'more')
    return h_flex()
      .id(`fold ${b.id}`)
      .h(26)
      .px(8)
      .ml(b.depth * 14)
      .gap(6)
      .items_center()
      .rounded(7)
      .cursor_pointer()
      .hover(s => s.bg(t.hover))
      .accessibility_label(b.text)
      .on_click((_e, cx) => press({ id: b.id, label: b.text, emphasis: 'quiet', isOut: false, local: b.local }, cx))
      .when(b.kind === 'fold', e =>
        e.child(
          div()
            .w(14)
            .text_color(t.dim)
            .child(b.kind === 'fold' && b.isOpen ? '▾' : '▸'),
        ),
      )
      .child(div().text_size(12).text_color(t.muted).child(b.text))
  if (b.kind === 'note')
    return div()
      .px(8)
      .py(2)
      .ml(b.depth * 16)
      .whitespace_normal()
      .text_color(b.isStrong ? t.foreground : colorOf(t, b.tone))
      .when(b.isStrong, e => e.font_semibold())
      .child(b.text)
  if (b.kind === 'rule')
    return h_flex()
      .px(8)
      .py(6)
      .gap(8)
      .items_center()
      .when(b.text !== null, e =>
        e.child(
          div()
            .text_size(11)
            .text_color(t.dim)
            .child(b.text ?? ''),
        ),
      )
      .child(div().flex_1().h(1).bg(t.border))

  return div().h(8)
}

function bannerEl(b: BannerView, t: Theme): Element {
  const color = b.tone === 'error' ? t.ansi1 : b.tone === 'warning' ? t.blocked : t.muted

  return v_flex()
    .px(14)
    .py(8)
    .border_b(1)
    .border_color(t.border)
    .bg(t.raised)
    .text_size(12)
    .child(div().font_semibold().text_color(color).child(b.lead))
    .when(b.body !== null, e =>
      e.child(
        div()
          .whitespace_normal()
          .text_color(t.muted)
          .child(b.body ?? ''),
      ),
    )
}

function tabsEl(tabs: TabCell[], t: Theme, pick: (tab: ShownTab, cx: Context) => void): Element {
  return h_flex()
    .h(40)
    .flex_none()
    .px(8)
    .gap(4)
    .items_center()
    .border_b(1)
    .border_color(t.border)
    .children(
      tabs.map(tab =>
        h_flex()
          .id(`tab ${tab.id}`)
          .h(28)
          .px(10)
          .gap(6)
          .items_center()
          .rounded(7)
          .cursor_pointer()
          .accessibility_label(tab.badge ? `${tab.label}, ${tab.badge}` : tab.label)
          .when(tab.isSelected, e => e.bg(t.selected).font_semibold())
          .when(!tab.isSelected, e => e.text_color(t.muted).hover(s => s.bg(t.hover)))
          .on_click((_e, cx) => pick(tab.id, cx))
          .child(tab.label)
          .when(tab.badge !== null, e =>
            e.child(
              div()
                .text_size(11)
                .text_color(t.blocked)
                .child(tab.badge ?? ''),
            ),
          ),
      ),
    )
}

function messageEl(m: Message, t: Theme): Element {
  return v_flex()
    .p(16)
    .gap(4)
    .child(
      div()
        .font_semibold()
        .text_color(m.isError ? t.ansi1 : t.foreground)
        .child(m.title),
    )
    .when(m.hint !== null, e =>
      e.child(
        div()
          .whitespace_normal()
          .text_color(t.muted)
          .child(m.hint ?? ''),
      ),
    )
}

const toggled = <T>(list: T[], x: T): T[] => (list.includes(x) ? list.filter(y => y !== x) : [...list, x])

export default class Inbox extends View {
  tab: string | null = null
  last: string | null = null
  followed: Followed = { is: 'no-terminal' }
  sessionId: string | null = null
  read: ReadSession | null = null
  ui: LookUi = freshUi('needsYou')
  shownSince = Date.now()
  isNextBuild = false
  foldTimer: { cancel(): void } | null = null

  init(_props: unknown, cx: Context): void {
    cx.spawn(async cx => {
      this.isNextBuild = (await readTextFile(`${appHome()}/mods/inbox/${NEXT_BUILD_MARK}`).catch(() => null)) !== null
      cx.notify()
    })
    cx.spawn(async cx => {
      for (;;) {
        const changed = await watchFolder(sessionsFolder(appHome())).catch(() => null)
        if (changed === null) await cx.sleep(REREAD_MS)
        else if (this.sessionId && isSessionChange(changed, appHome(), this.sessionId)) this.load(this.sessionId, cx)
      }
    })
    cx.timer.every(REREAD_MS, cx => this.sessionId && this.load(this.sessionId, cx))
    cx.timer.every(AGE_TICK_MS, cx => cx.notify())
  }

  load(sessionId: string, cx: Context): void {
    cx.spawn(async cx => {
      for (let n = 0; ; n++) {
        const text = await readTextFile(sessionPath(appHome(), sessionId)).catch((e: unknown) => e)
        const read =
          typeof text === 'string' || text === null
            ? readSession(text)
            : { is: 'refused' as const, reason: String(text) }
        if (read.is === 'torn' && n < TORN_RETRIES) {
          await cx.sleep(TORN_RETRY_MS)
          continue
        }
        if (this.sessionId === sessionId) this.read = read
        cx.notify()
        return
      }
    })
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
    this.ui = freshUi(this.ui.tab)
    this.shownSince = Date.now()
    if (sessionId) this.load(sessionId, cx)
  }

  press(b: Button, cx: Context): void {
    const l = b.local
    if (l === null) return
    const ui = this.ui
    if ('showOptions' in l) ui.optionsShown = toggled(ui.optionsShown, l.showOptions)
    else if ('closedFold' in l) ui.unfolded = toggled(ui.unfolded, l.closedFold)
    else if ('earlier' in l) ui.closedAll = [...ui.closedAll, l.earlier]
    else ui.statusUnfolded = toggled(ui.statusUnfolded, l.toggleFold)
    cx.notify()
  }

  render(cx: Context): Element {
    this.track(cx)
    const t = theme() as Theme
    const now = Date.now()
    const screen = screenOf(this.followed, this.read, this.ui, {
      now,
      shownSince: this.shownSince,
      isNextBuild: this.isNextBuild,
    })
    const press: Press = (b, cx) => this.press(b, cx)
    const select = (id: string, cx: Context) => {
      this.ui.selected = id
      cx.notify()
    }
    const pick = (tab: ShownTab, cx: Context) => {
      this.ui = { ...this.ui, tab, selected: null }
      cx.notify()
    }
    this.foldTimer?.cancel()
    const foldAt = screen.is === 'inbox' ? screen.foldAt : null
    this.foldTimer = foldAt === null ? null : cx.timer.after(Math.max(0, foldAt - now), cx => cx.notify())
    const header = h_flex()
      .h(42)
      .flex_none()
      .px(14)
      .gap(8)
      .items_center()
      .border_b(1)
      .border_color(t.border)
      .child(div().font_semibold().child('Inbox'))
      .when(screen.is === 'inbox', e =>
        e.child(
          div()
            .text_size(12)
            .text_color(t.muted)
            .child(screen.is === 'inbox' ? screen.agent : ''),
        ),
      )
      .child(div().flex_1())
      .when(screen.is === 'inbox' && screen.status !== null, e =>
        e.child(
          div()
            .text_size(11)
            .text_color(t.dim)
            .child(screen.is === 'inbox' ? (screen.status ?? '') : ''),
        ),
      )
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
      .child(header)
    if (screen.is === 'message') return root.child(messageEl(screen.message, t))

    return root
      .child(tabsEl(screen.tabs, t, pick))
      .children(screen.banners.map(b => bannerEl(b, t)))
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
              .children(screen.blocks.map(b => blockEl(b, t, press, select))),
          )
          .child(Scrollbar.vertical('inbox-list').absolute().inset_0()),
      )
  }
}
