import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { Input, h_flex, v_flex } from 'gpui-base'
import { LOOK_GAP_PT, ROW_PAD_PT, STATUS_ROW_PAD_PT } from '../../hooks/layout'
import { ENTER_MS, EXIT_MS } from '../../hooks/row-motion'
import { DOT } from '../../hooks/rows'
import { STALL_GAP } from '../../hooks/status-page'
import type { Block, Button, Field, LineBlock, Mark, PrBlock, RowBlock, StatusLine } from './blocks'
import { EDGE_X, HEAD_LINE, HEAD_TEXT, MARK_X, TEXT_X, colorOf } from './paint-theme'
import type { Paint, Theme } from './paint-theme'
import { bannerEl } from './paint-chrome'

/** The mark column's width: from where a mark starts to where the text starts. */
const MARK_W = TEXT_X - MARK_X
/** How far a Closed list's lines sit in, and how far each Status step sits in, as in the Codex tab. */
const CLOSED_STEP = 23
const STATUS_STEP = MARK_W

/** A button of a row that is leaving draws but takes no clicks, so the row keeps its height as it fades. */
function buttonEl(b: Button, p: Paint, isInert = false): Element {
  const { t } = p
  const base = h_flex()
    .id(`button ${b.id}`)
    .flex_none()
    .items_center()
    .justify_center()
    .accessibility_label(b.label)
    .child(b.label)
  const styled =
    b.emphasis === 'primary'
      ? base
          .px(11)
          .py(3)
          .rounded(13)
          .border_1()
          .border_color(t.solid)
          .bg(t.solid)
          .text_color(t.solid_foreground)
          .hover(s => s.opacity(0.85))
      : b.emphasis === 'normal'
        ? base
            .px(11)
            .py(3)
            .rounded(13)
            .border_1()
            .border_color(t.input)
            .text_color(t.foreground)
            .hover(s => s.bg(t.hover))
        : base
            .px(4)
            .rounded(5)
            .text_color(t.muted)
            .hover(s => s.text_color(t.foreground))
  if (b.isOut) return styled.opacity(0.4)
  if (isInert) return styled

  return styled.cursor_pointer().on_click((_e, cx) => {
    cx.stop_propagation()
    p.press(b, cx)
  })
}

const buttonsEl = (buttons: Button[], p: Paint, indent: number, isInert = false): Element =>
  h_flex()
    .flex_wrap()
    .items_center()
    .gap(6)
    .pt(8)
    .pl(indent)
    .children(buttons.map(b => buttonEl(b, p, isInert)))

/** A mark in the mark column, centred as the Codex tab draws a row's mark, or at the column's start as its Status page does. */
const markEl = (m: Mark | null, t: Theme, isLeft = false): Element =>
  div()
    .w(MARK_W)
    .pr(8)
    .flex_none()
    .when(!isLeft, e => e.text_center())
    .text_color(m === null || m.tone === null ? t.muted : colorOf(t, m.tone))
    .child(m?.text ?? '')

const lineEl = (text: string, color: Theme[keyof Theme], indent = MARK_W) =>
  div().pl(indent).pt(4).whitespace_normal().text_color(color).child(text)

/** A line under a row's title, led by its mark when it has one, as the holds-up line is. */
const bodyLineEl = (l: RowBlock['body'][number], t: Theme): Element =>
  l.mark
    ? h_flex()
        .pl(MARK_W)
        .pt(4)
        .gap(6)
        .items_start()
        .child(div().flex_none().text_color(colorOf(t, l.mark.tone)).child(l.mark.text))
        .child(div().flex_1().min_w(0).whitespace_normal().text_color(colorOf(t, l.tone)).child(l.text))
    : lineEl(l.text, colorOf(t, l.tone))

function fieldEl(f: Field, p: Paint, indent: number, isInert = false): Element {
  const { t } = p
  const state = p.input(f.rowId)
  const input = state
    ? [div().min_h(28).px(10).py(4).rounded(10).border_1().border_color(t.input).child(Input.new(state).w_full())]
    : []

  return v_flex()
    .pt(8)
    .pl(indent)
    .children(input)
    .child(buttonsEl(f.buttons, p, 0, isInert))
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
          .ml(12)
          .text_color(t.muted)
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
  const padY = r.depth === 0 ? ROW_PAD_PT : ROW_PAD_PT / 2

  return v_flex()
    .id(`row ${r.id}`)
    .pl(MARK_X + r.depth * CLOSED_STEP)
    .pr(EDGE_X)
    .py(padY)
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
    .children(lines.map(l => bodyLineEl(l, t)))
    .when(r.buttons.length > 0, e => e.child(buttonsEl(r.buttons, p, MARK_W, isLeaving)))
    .when(r.field !== null, e => e.child(r.field ? fieldEl(r.field, p, MARK_W, isLeaving) : div()))
}

function statusEl(s: StatusLine, p: Paint): Element {
  const { t } = p
  const stall = s.stall
    ? [div().flex_none().text_color(colorOf(t, s.stall.tone)).child(`${STALL_GAP}${s.stall.text}`)]
    : []

  return v_flex()
    .pl(MARK_X + s.depth * STATUS_STEP)
    .pr(EDGE_X)
    .py(STATUS_ROW_PAD_PT)
    .child(
      h_flex()
        .items_start()
        .child(markEl(s.mark, t, true))
        .child(
          h_flex()
            .flex_1()
            .min_w(0)
            .flex_wrap()
            .child(
              div()
                .when(s.isBold, e => e.font_semibold())
                .when(s.isMuted, e => e.text_color(t.muted))
                .child(s.name),
            )
            .children(stall),
        ),
    )
    .children(s.under.map(l => div().pl(MARK_W).whitespace_normal().text_color(t.muted).child(l)))
    .when(s.buttons.length > 0, e => e.child(buttonsEl(s.buttons, p, MARK_W)))
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
    .child(div().text_color(colorOf(t, 'prs')).child(b.number))
    .child(div().font_semibold().whitespace_normal().child(b.title))
    .child(div().text_color(colorOf(t, b.status.tone)).child(b.status.text))
    .children(b.unlisted.map(u => div().text_color(t.muted).child(`${DOT}${u}`)))

  return v_flex()
    .pl(TEXT_X)
    .pr(EDGE_X)
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
    .pl(TEXT_X)
    .pr(EDGE_X)
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

const ruleLine = (t: Theme, isDashed: boolean): Element =>
  div()
    .flex_1()
    .border_t(1)
    .when(isDashed, e => e.border_dashed())
    .border_color(t.border)

function headingEl(b: Extract<Block, { kind: 'heading' }>, p: Paint): Element {
  const { t } = p
  const buttons = b.buttons.map(x => buttonEl(x, p))
  if (b.isLabel)
    return h_flex()
      .flex_wrap()
      .pl(MARK_X)
      .pr(EDGE_X)
      .pt(10)
      .pb(4)
      .gap(8)
      .items_center()
      .child(div().text_color(t.muted).child(b.text))
      .child(ruleLine(t, false).min_w(32))
      .child(h_flex().ml_auto().gap(4).items_center().children(goalButtons(buttons, t)))

  return h_flex()
    .pl(MARK_X)
    .pr(EDGE_X)
    .pt(10)
    .pb(6)
    .items_center()
    .child(markEl(b.mark, t))
    .child(div().font_semibold().child(b.text))
    .when(b.count !== null, e => e.child(div().text_color(t.muted).child(`${DOT}${b.count}`)))
    .child(div().flex_1())
    .children(buttons)
}

function emptyEl(b: Extract<Block, { kind: 'empty' }>, p: Paint): Element {
  const { t } = p

  return v_flex()
    .items_center()
    .px(32)
    .py(32)
    .gap(4)
    .child(div().font_semibold().text_center().whitespace_normal().child(b.title))
    .when(b.hint !== null, e =>
      e.child(
        div()
          .text_center()
          .whitespace_normal()
          .text_color(t.muted)
          .child(b.hint ?? ''),
      ),
    )
    .when(b.buttons.length > 0, e =>
      e.child(
        h_flex()
          .flex_wrap()
          .justify_center()
          .gap(6)
          .pt(8)
          .children(b.buttons.map(x => buttonEl(x, p))),
      ),
    )
}

function foldEl(b: Extract<Block, { kind: 'fold' | 'more' }>, p: Paint): Element {
  const { t } = p
  const fold: Button = {
    id: b.id,
    label: b.text,
    emphasis: 'quiet',
    isOut: false,
    hotkey: null,
    does: { is: 'view', change: b.change },
  }
  const indent = b.kind === 'fold' ? MARK_X + b.depth * STATUS_STEP : MARK_X + b.depth * CLOSED_STEP + MARK_W

  return h_flex()
    .id(`fold ${b.id}`)
    .pl(indent)
    .pr(EDGE_X)
    .py(2)
    .when('closedFold' in b.change, e => e.mt(8))
    .items_center()
    .text_color(t.muted)
    .cursor_pointer()
    .hover(s => s.text_color(t.foreground))
    .accessibility_label(b.text)
    .on_click((_e, cx) => p.press(fold, cx))
    .when(b.kind === 'fold', e =>
      e.child(markEl({ text: b.kind === 'fold' && b.isOpen ? '▾' : '▸', tone: 'muted', isRunning: false }, t)),
    )
    .child(div().child(b.text))
}

/** A group's rule leaves the group above the space a section ends with. A Status rule sits between two lines. */
function ruleEl(b: Extract<Block, { kind: 'rule' }>, t: Theme): Element {
  const indent = TEXT_X + b.depth * STATUS_STEP
  if (b.text === null)
    return h_flex()
      .pl(indent)
      .when(b.isBetweenGroups, e => e.pt(10))
      .child(ruleLine(t, false))
  const label = div().flex_none().text_color(t.muted).child(b.text)

  return h_flex()
    .pl(indent)
    .py(LOOK_GAP_PT)
    .gap(8)
    .items_center()
    .when(b.isDashed, e => e.child(ruleLine(t, true)))
    .child(label)
    .child(ruleLine(t, b.isDashed))
}

/** The goal's buttons, a quiet dot between each two, as the Codex tab's goal heading draws them. */
const goalButtons = (buttons: Element[], t: Theme): Element[] =>
  buttons.flatMap((b, n) => (n > 0 ? [div().text_color(t.muted).child('·'), b] : [b]))

function noteEl(b: Extract<Block, { kind: 'note' }>, t: Theme): Element {
  const text = div()
    .min_w(0)
    .when(b.isStrong, e => e.font_semibold())
    .text_color(b.isStrong ? t.foreground : colorOf(t, b.tone))
    .child(b.text)
  const count = b.count === null ? [] : [div().whitespace_nowrap().text_color(t.muted).child(b.count)]

  return h_flex()
    .flex_wrap()
    .items_baseline()
    .pl(b.isHead ? MARK_X : TEXT_X + b.depth * STATUS_STEP)
    .pr(EDGE_X)
    .py(2)
    .whitespace_normal()
    .when(b.isStrong, e => e.text_size(HEAD_TEXT).line_height(HEAD_LINE))
    .child(text)
    .children(count)
}

export function blockEl(b: Block, p: Paint): Element {
  const { t } = p
  if (b.kind === 'row') return rowEl(b, p)
  if (b.kind === 'status') return statusEl(b, p)
  if (b.kind === 'pr') return prEl(b, p)
  if (b.kind === 'line') return textLineEl(b, p)
  if (b.kind === 'heading') return headingEl(b, p)
  if (b.kind === 'empty') return emptyEl(b, p)
  if (b.kind === 'fold' || b.kind === 'more') return foldEl(b, p)
  if (b.kind === 'rule') return ruleEl(b, t)
  if (b.kind === 'field')
    return div()
      .pl(TEXT_X)
      .pr(EDGE_X)
      .child(fieldEl(b.field, p, 0))
  if (b.kind === 'note') return noteEl(b, t)
  if (b.kind === 'banner') return bannerEl(b.banner, t)

  return div().h(8)
}
