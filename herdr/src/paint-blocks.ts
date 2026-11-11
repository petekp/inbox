import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { Input, h_flex, v_flex } from 'gpui-base'
import { ENTER_MS, EXIT_MS } from '../../hooks/row-motion'
import { DOT } from '../../hooks/rows'
import { STALL_GAP } from '../../hooks/status-page'
import type { Block, Button, Field, LineBlock, Mark, PrBlock, RowBlock, StatusLine } from './blocks'
import { colorOf } from './paint-theme'
import type { Paint, Theme } from './paint-theme'

function buttonEl(b: Button, p: Paint): Element {
  const { t } = p
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
    p.press(b, cx)
  })
}

const buttonsEl = (buttons: Button[], p: Paint, indent: number): Element =>
  h_flex()
    .flex_wrap()
    .gap(6)
    .pt(6)
    .pl(indent)
    .children(buttons.map(b => buttonEl(b, p)))

const markEl = (m: Mark | null, t: Theme): Element =>
  div()
    .w(14)
    .flex_none()
    .text_color(colorOf(t, m?.tone ?? null))
    .child(m?.text ?? '')

const lineEl = (text: string, color: Theme[keyof Theme], indent = 22) =>
  div().pl(indent).pt(2).text_size(12).whitespace_normal().text_color(color).child(text)

function fieldEl(f: Field, p: Paint, indent: number): Element {
  const state = p.input(f.rowId)
  const input = state ? [Input.new(state).w_full()] : []

  return v_flex()
    .pt(6)
    .pl(indent)
    .gap(6)
    .children(input)
    .child(buttonsEl(f.buttons, p, 0))
}

/** A row fades in as it enters and out as it leaves. The first draw of an entering row is its faded frame. */
function opacityOf(r: RowBlock, p: Paint): number | null {
  const m = p.motion.get(r.id)
  if (m?.state === 'leaving') return 0
  if (m?.state === 'entering') return m.isStart ? 0 : 1

  return null
}

function rowEl(r: RowBlock, p: Paint): Element {
  const { t } = p
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
  const opacity = opacityOf(r, p)
  const isLeaving = p.motion.get(r.id)?.state === 'leaving'

  return v_flex()
    .id(`row ${r.id}`)
    .px(8)
    .py(6)
    .ml(r.depth * 14)
    .rounded(7)
    .when(opacity !== null, e =>
      e.opacity(opacity ?? 1).transition('opacity', { duration: isLeaving ? EXIT_MS : ENTER_MS, easing: 'ease-out' }),
    )
    .when(r.isSelected, e => e.bg(t.selected))
    .when(r.isSelectable && !r.isSelected && !isLeaving, e =>
      e
        .cursor_pointer()
        .hover(s => s.bg(t.hover))
        .on_click((_e, cx) => p.select(r.id, cx)),
    )
    .child(line)
    .children(lines.map(l => lineEl(l.text, colorOf(t, l.tone))))
    .when(r.buttons.length > 0 && !isLeaving, e => e.child(buttonsEl(r.buttons, p, 22)))
    .when(r.field !== null && !isLeaving, e => e.child(r.field ? fieldEl(r.field, p, 22) : div()))
}

function statusEl(s: StatusLine, p: Paint): Element {
  const { t } = p
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
    .when(s.buttons.length > 0, e => e.child(buttonsEl(s.buttons, p, 22)))
}

function prEl(b: PrBlock, p: Paint): Element {
  const { t } = p
  const title = h_flex()
    .flex_wrap()
    .gap(6)
    .items_start()
    .when(b.rank !== null, e =>
      e.child(
        div()
          .text_color(t.muted)
          .child(b.rank ?? ''),
      ),
    )
    .child(div().text_color(t.working).child(b.number))
    .child(div().font_semibold().whitespace_normal().child(b.title))
    .child(div().text_color(colorOf(t, b.status.tone)).child(b.status.text))
    .children(b.unlisted.map(u => div().text_color(t.muted).child(`${DOT}${u}`)))

  return v_flex()
    .px(8)
    .pt(10)
    .pb(4)
    .child(title)
    .when(b.error !== null, e => e.child(lineEl(b.error ?? '', t.ansi1, 0)))
    .when(b.buttons.length > 0, e => e.child(buttonsEl(b.buttons, p, 0)))
    .when(b.feedback !== null, e => e.child(lineEl(b.feedback?.text ?? '', colorOf(t, b.feedback?.tone ?? null), 0)))
}

function textLineEl(b: LineBlock, p: Paint): Element {
  const { t } = p

  return v_flex()
    .px(8)
    .py(4)
    .child(
      h_flex()
        .flex_wrap()
        .gap(8)
        .items_center()
        .when(b.text !== null, e =>
          e.child(
            div()
              .whitespace_normal()
              .child(b.text ?? ''),
          ),
        )
        .children(b.buttons.map(x => buttonEl(x, p))),
    )
    .when(b.under !== null, e => e.child(lineEl(b.under ?? '', t.muted, 0)))
    .when(b.feedback !== null, e => e.child(lineEl(b.feedback?.text ?? '', colorOf(t, b.feedback?.tone ?? null), 0)))
}

export function blockEl(b: Block, p: Paint): Element {
  const { t } = p
  if (b.kind === 'row') return rowEl(b, p)
  if (b.kind === 'status') return statusEl(b, p)
  if (b.kind === 'pr') return prEl(b, p)
  if (b.kind === 'line') return textLineEl(b, p)
  if (b.kind === 'field')
    return div()
      .px(8)
      .child(fieldEl(b.field, p, 0))
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
      .children(b.buttons.map(x => buttonEl(x, p)))
  if (b.kind === 'fold' || b.kind === 'more') {
    const fold: Button = {
      id: b.id,
      label: b.text,
      emphasis: 'quiet',
      isOut: false,
      hotkey: null,
      does: { is: 'view', change: b.change },
    }
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
      .on_click((_e, cx) => p.press(fold, cx))
      .when(b.kind === 'fold', e =>
        e.child(
          div()
            .w(14)
            .text_color(t.dim)
            .child(b.kind === 'fold' && b.isOpen ? '▾' : '▸'),
        ),
      )
      .child(div().text_size(12).text_color(t.muted).child(b.text))
  }
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
