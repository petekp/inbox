import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { Input, h_flex, v_flex } from 'gpui-base'
import { ROW_PAD_PT } from '../../hooks/layout'
import { ENTER_MS, EXIT_MS } from '../../hooks/row-motion'
import { RUNNING_PULSE_MS } from '../../hooks/timing'
import { STALL_GAP } from '../../hooks/status-page'
import type { Block, Button, Field, LineBlock, Mark, PrBlock, RowBlock, StatusLine } from './blocks'
import {
  BOX_RADIUS,
  BUTTON_H,
  CONTROL_GAP,
  EDGE,
  GROUP_GAP,
  HEAD_LINE,
  HEAD_TEXT,
  INSET,
  LINE_GAP,
  MARK_W,
  NEST,
  SEP,
  SPACE,
  TEXT_X,
  colorOf,
} from './paint-theme'
import { isStatusUnder } from './held-line'
import type { Paint, Theme } from './paint-theme'
import { bannerEl } from './paint-chrome'
import { TIMED_W, timeLeftEl } from './paint-timer'

/**
 * A button takes the look of its emphasis: `primary` filled, `normal` outlined, `quiet` a label with no side padding,
 * so a quiet button that starts a line puts its label where the text above it starts. A button whose press is out keeps its size, loses
 * its fill and border, and is the quietest thing in its row. A timed button's time left stays drawn and pauses while
 * its press is out. A hidden button keeps its place and draws nothing. A button of a row that is leaving draws but
 * takes no clicks, so the row keeps its height as it fades. A button that takes no clicks shows no hover or pressed
 * change.
 */
function buttonEl(b: Button, p: Paint, isInert = false): Element {
  const { t } = p
  const isPill = b.emphasis !== 'quiet'
  const runsOutAt = b.runsOutAt
  const left = p.timeLeft.get(b.id)
  const base = h_flex()
    .id(`button ${b.id}`)
    .flex_none()
    .h(BUTTON_H)
    .items_center()
    .justify_center()
    .accessibility_label(b.label)
    .when(runsOutAt !== undefined, e =>
      e
        .relative()
        .w(TIMED_W)
        .rounded(BUTTON_H / 2),
    )
    .when(left !== undefined, e => (left ? e.child(timeLeftEl(left, runsOutAt ?? 0, p.now, t)) : e))
    .child(b.label)
  const shaped =
    isPill && runsOutAt === undefined
      ? base
          .px(INSET)
          .rounded(BUTTON_H / 2)
          .border_1()
      : base
  if (b.isHidden) return shaped.invisible().disabled(true)
  if (b.isOut) return shaped.border_color(CLEAR).text_color(t.muted).opacity(0.5).disabled(true)
  const styled =
    b.emphasis === 'primary'
      ? shaped.border_color(t.solid).bg(t.solid).text_color(t.solid_foreground)
      : b.emphasis === 'normal'
        ? shaped.border_color(t.input).text_color(t.foreground)
        : shaped.text_color(t.muted)
  if (isInert) return styled
  const live =
    b.emphasis === 'primary'
      ? styled.hover(s => s.opacity(0.85)).active(s => s.opacity(0.7))
      : b.emphasis === 'normal'
        ? styled.hover(s => s.bg(t.hover)).active(s => s.bg(t.selected))
        : styled.hover(s => s.text_color(t.foreground)).active(s => s.text_color(t.foreground).opacity(0.7))

  return live.on_click((_e, cx) => {
    cx.stop_propagation()
    p.press(b, cx)
  })
}

const CLEAR = '#00000000'

const buttonsEl = (buttons: Button[], p: Paint, indent: number, isInert = false): Element =>
  h_flex()
    .flex_wrap()
    .items_center()
    .gap(CONTROL_GAP)
    .pt(CONTROL_GAP)
    .pl(indent)
    .children(buttons.map(b => buttonEl(b, p, isInert)))

/** A mark, at the start of the column that hangs before the text, so a tab's first marks sit on the panel's edge. */
const markEl = (m: Mark | null, t: Theme): Element =>
  div()
    .w(MARK_W)
    .flex_none()
    .text_color(m === null || m.tone === null ? t.muted : colorOf(t, m.tone))
    .when(m?.isRunning === true, e => e.loop('opacity', { from: 1, to: 0.3, period: RUNNING_PULSE_MS }))
    .child(m?.text ?? '')

const lineEl = (text: string, color: Theme[keyof Theme], indent: number = MARK_W) =>
  div().pl(indent).pt(LINE_GAP).whitespace_normal().text_color(color).child(text)

/** A line under a row's title. Its mark, when it has one, as the holds-up line's, hangs in the mark column. */
const bodyLineEl = (l: RowBlock['body'][number], t: Theme): Element =>
  l.mark
    ? h_flex()
        .pt(LINE_GAP)
        .items_start()
        .child(markEl(l.mark, t))
        .child(div().flex_1().min_w(0).whitespace_normal().text_color(colorOf(t, l.tone)).child(l.text))
    : lineEl(l.text, colorOf(t, l.tone))

function fieldEl(f: Field, p: Paint, indent: number, isInert = false): Element {
  const { t } = p
  const state = p.input(f.rowId)
  const input = state
    ? [
        div()
          .min_h(BUTTON_H)
          .px(INSET)
          .py(SPACE.xs)
          .rounded(BOX_RADIUS)
          .border_1()
          .border_color(t.input)
          .child(Input.new(state).w_full()),
      ]
    : []

  return v_flex()
    .pl(indent)
    .children(input)
    .child(buttonsEl(f.buttons, p, 0, isInert))
}

/**
 * A row fades in as it enters and out as it leaves. gpui-kit's transition animates only a later change of its target,
 * so a fade's first draw sets the opacity it starts from, and the next draw sets the one it ends at.
 */
function opacityOf(r: RowBlock, p: Paint): number | null {
  const m = p.motion.get(r.id)
  if (m?.state === 'leaving') return m.isStart ? 1 : 0
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
          .ml(INSET)
          .text_color(t.muted)
          .child(r.age ?? ''),
      ),
    )
  const feedbackUnder = isStatusUnder(r) ? r.feedback : null
  const lines = [
    ...(r.settled ? [{ text: r.settled.label, tone: r.settled.tone }] : []),
    ...(r.feedback && !feedbackUnder ? [r.feedback] : []),
    ...(r.heldLine ? [r.heldLine] : []),
    ...r.body,
  ]
  const opacity = opacityOf(r, p)
  const isLeaving = p.motion.get(r.id)?.state === 'leaving'

  return v_flex()
    .id(`row ${r.id}`)
    .pl(EDGE + r.depth * NEST)
    .pr(EDGE)
    .py(ROW_PAD_PT)
    .when(opacity !== null, e =>
      e.opacity(opacity ?? 1).transition('opacity', { duration: isLeaving ? EXIT_MS : ENTER_MS, easing: 'ease-out' }),
    )
    .when(r.isSelected, e => e.bg(t.selected))
    .when(r.isSelectable && !r.isSelected && !isLeaving, e =>
      e.hover(s => s.bg(t.hover)).on_click((_e, cx) => p.select(r.id, cx)),
    )
    .child(line)
    .children(lines.map(l => bodyLineEl(l, t)))
    .when(r.buttons.length > 0, e => e.child(buttonsEl(r.buttons, p, MARK_W, isLeaving)))
    .when(r.field !== null, e => e.child(r.field ? fieldEl(r.field, p, MARK_W, isLeaving).pt(CONTROL_GAP) : div()))
    .when(feedbackUnder !== null, e => e.child(feedbackUnder ? bodyLineEl(feedbackUnder, t) : div()))
}

/**
 * One part of a line built from parts, such as a PR's status line or a Status line's name and stall. gpui-kit has no
 * inline span, so each part is an item of a wrapping row. A part that does not fit moves whole to the next line, which
 * starts at the left edge. A part wider than the line wraps inside it.
 */
const statusPartEl = (text: string): Element => div().min_w(0).max_w_full().whitespace_normal().child(text)

function statusEl(s: StatusLine, p: Paint): Element {
  const { t } = p
  const name = statusPartEl(s.stall ? `${s.name}${STALL_GAP}` : s.name)
    .when(s.isBold, e => e.font_semibold())
    .when(s.isMuted, e => e.text_color(t.muted))
  const stall = s.stall ? [statusPartEl(s.stall.text).text_color(colorOf(t, s.stall.tone))] : []

  return v_flex()
    .pl(EDGE + s.depth * NEST)
    .pr(EDGE)
    .child(
      h_flex()
        .items_start()
        .child(markEl(s.mark, t))
        .child(h_flex().flex_1().min_w(0).flex_wrap().child(name).children(stall)),
    )
    .children(s.under.map(l => lineEl(l, t.muted)))
    .when(s.buttons.length > 0, e => e.child(buttonsEl(s.buttons, p, MARK_W)))
}

/**
 * A PR's title, with its rank and number muted at the line's right end as a row's age is, then where it stands and
 * its buttons. In a narrow pane the number leads the status line instead, so the title keeps its width.
 */
function prEl(b: PrBlock, p: Paint): Element {
  const { t } = p
  const label = b.rank === null ? b.number : `${b.rank.trim()}\u2002${b.number}`
  const title = h_flex()
    .items_start()
    .child(div().flex_1().min_w(0).font_semibold().whitespace_normal().child(b.title))
    .when(!p.isNarrow, e => e.child(div().flex_none().ml(INSET).text_color(t.muted).child(label)))
  const hasReasons = b.unlisted.length > 0
  const word = h_flex()
    .items_start()
    .min_w(0)
    .max_w_full()
    .child(div().min_w(0).whitespace_normal().text_color(colorOf(t, b.status.tone)).child(b.status.text))
    .when(hasReasons, e => e.child(div().flex_none().text_color(t.muted).child(SEP)))
  const reasons = b.unlisted.map((u, i) =>
    statusPartEl(i < b.unlisted.length - 1 ? `${u}${SEP}` : u).text_color(t.muted),
  )
  const status = h_flex()
    .flex_wrap()
    .items_start()
    .pt(LINE_GAP)
    .when(p.isNarrow, e => e.child(div().flex_none().text_color(t.muted).child(`${label}${SEP}`)))
    .child(word)
    .children(reasons)

  return v_flex()
    .pl(EDGE)
    .pr(EDGE)
    .child(title)
    .child(status)
    .when(b.error !== null, e => e.child(lineEl(b.error ?? '', t.ansi1, 0)))
    .when(b.buttons.length > 0, e => e.child(buttonsEl(b.buttons, p, 0)))
    .when(b.feedback !== null, e => e.child(lineEl(b.feedback?.text ?? '', colorOf(t, b.feedback?.tone ?? null), 0)))
}

function textLineEl(b: LineBlock, p: Paint): Element {
  const { t } = p

  return v_flex()
    .pl(EDGE)
    .pr(EDGE)
    .child(
      h_flex()
        .gap(CONTROL_GAP)
        .items_center()
        .child(
          div()
            .flex_1()
            .min_w(0)
            .whitespace_normal()
            .child(b.text ?? ''),
        )
        .when(b.buttons.length > 0, e =>
          e.child(
            h_flex()
              .flex_none()
              .gap(CONTROL_GAP)
              .children(b.buttons.map(x => buttonEl(x, p))),
          ),
        ),
    )
    .when(b.under !== null, e => e.child(lineEl(b.under ?? '', t.muted, 0)))
    .when(b.feedback !== null, e => e.child(lineEl(b.feedback?.text ?? '', colorOf(t, b.feedback?.tone ?? null), 0)))
}

const ruleLine = (t: Theme): Element => div().flex_1().border_t(1).border_color(t.border)

/** A group's heading, its text where its rows' text starts. A label heading rules the goal's text to its buttons. */
function headingEl(b: Extract<Block, { kind: 'heading' }>, p: Paint): Element {
  const { t } = p
  const buttons = h_flex()
    .flex_none()
    .gap(CONTROL_GAP)
    .items_center()
    .children(b.buttons.map(x => buttonEl(x, p)))
  if (b.isLabel)
    return h_flex()
      .flex_wrap()
      .pl(TEXT_X)
      .pr(EDGE)
      .gap(CONTROL_GAP)
      .items_center()
      .child(statusPartEl(b.text).text_color(t.muted))
      .child(ruleLine(t).min_w(GROUP_GAP))
      .child(buttons)

  return h_flex()
    .pl(EDGE)
    .pr(EDGE)
    .items_center()
    .child(markEl(b.mark, t))
    .child(div().min_w(0).whitespace_normal().font_semibold().child(b.text))
    .when(b.count !== null, e => e.child(div().text_color(t.muted).child(`${SEP}${b.count}`)))
    .child(div().flex_1())
    .child(buttons)
}

function emptyEl(b: Extract<Block, { kind: 'empty' }>, p: Paint): Element {
  const { t } = p

  return v_flex()
    .items_center()
    .p(GROUP_GAP)
    .gap(LINE_GAP)
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
          .gap(CONTROL_GAP)
          .pt(CONTROL_GAP)
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
  return h_flex()
    .id(`fold ${b.id}`)
    .pl(TEXT_X + b.depth * NEST)
    .pr(EDGE)
    .py(ROW_PAD_PT)
    .items_start()
    .text_color(t.muted)
    .hover(s => s.text_color(t.foreground))
    .accessibility_label(b.text)
    .on_click((_e, cx) => p.press(fold, cx))
    .when(b.kind === 'fold', e =>
      e.child(
        div()
          .mr(CONTROL_GAP)
          .child(b.kind === 'fold' && b.isOpen ? '▾' : '▸'),
      ),
    )
    .child(div().min_w(0).whitespace_normal().child(b.text))
}

/**
 * A rule from edge to edge, between two groups or two PRs, so the marks of the group below sit inside the break. A
 * labelled one starts its label where text after a mark starts.
 */
function ruleEl(b: Extract<Block, { kind: 'rule' }>, t: Theme): Element {
  if (b.text === null) return h_flex().pl(EDGE).pr(EDGE).child(ruleLine(t))

  return h_flex()
    .pl(TEXT_X)
    .pr(EDGE)
    .gap(CONTROL_GAP)
    .items_center()
    .child(div().flex_none().text_color(t.muted).child(b.text))
    .child(ruleLine(t))
}

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
    .pl(TEXT_X + b.depth * NEST)
    .pr(EDGE)
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
      .pr(EDGE)
      .child(fieldEl(b.field, p, 0))
  if (b.kind === 'note') return noteEl(b, t)
  if (b.kind === 'banner')
    return bannerEl(
      b.banner,
      t,
      b.buttons.map(x => buttonEl(x, p)),
      b.feedback ? lineEl(b.feedback.text, colorOf(t, b.feedback.tone), 0) : null,
    )

  return div()
}
