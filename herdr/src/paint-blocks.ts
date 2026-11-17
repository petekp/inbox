import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { Input, h_flex, v_flex } from 'gpui-base'
import { EMPTY_STATE_MAX_WIDTH_PT, ROW_PAD_PT } from '../../hooks/layout'
import { ROW_FADE_MS } from '../../hooks/row-motion'
import { STALL_GAP } from '../../hooks/status-page'
import { isOpenRow } from './blocks'
import type { Block, Button, Field, LineBlock, PrBlock, RowBlock, StatusLine } from './blocks'
import {
  BOX_RADIUS,
  BUTTON_H,
  CHILD_GAP,
  CONTROL_GAP,
  EDGE,
  HELP_COLUMN,
  HELP_INDENT,
  END_SPACE,
  INSET,
  INSIDE_GAP,
  LINE_HEIGHT,
  LIST_GAP,
  MARK_W,
  NEST,
  SEP,
  SMALL_GAP,
  TEXT_X,
  colorOf,
} from './paint-theme'
import { buttonEl, buttonsEl, lineEl, markEl, resultLineEl } from './paint-parts'
import { foldChevronEl } from './paint-chevron'
import { isStatusUnder } from './held-line'
import type { RowMotion } from './motion'
import { PATH_X, lineColor, panelId, restId, sizeEl, titleEl } from './paint-space'
import type { Paint, Theme } from './paint-theme'
import { bannerEl } from './paint-chrome'
import { markTintOf, titleColorOf } from './paint-title-tint'
import { noteEl, ruleEl, ruleLine } from './paint-notes'
/** The trunk of a row's tree under the middle of the row's mark, from `top` to the end of its box or down to `height`. */
const trunkEl = (top: number, height: number | null, t: Theme, isSelected: boolean): Element => {
  const el = div()
    .absolute()
    .left(PATH_X - EDGE)
    .top(top)
    .w(1)
    .border_l_1()
    .border_color(lineColor(t, isSelected ? t.selected : t.background))

  return height === null ? el.bottom(0) : el.h(height)
}

/** A line under a row's title, with its part of the tree that hangs from the row's mark. */
const bodyLineEl = (l: RowBlock['body'][number], t: Theme, isSelected: boolean): Element => {
  const above = l.isApart ? CHILD_GAP : INSIDE_GAP
  const armAt = above + LINE_HEIGHT / 2
  const arm = div()
    .absolute()
    .left(PATH_X - EDGE + 1)
    .top(armAt)
    .w(NEST - (PATH_X - EDGE) - 1 - SMALL_GAP)
    .h(1)
    .border_t_1()
    .border_color(lineColor(t, isSelected ? t.selected : t.background))
  const strokes =
    l.tree === 'trunk'
      ? [trunkEl(0, null, t, isSelected)]
      : l.tree === 'tee'
        ? [trunkEl(0, null, t, isSelected), arm]
        : l.tree === 'last'
          ? [trunkEl(0, armAt + 1, t, isSelected), arm]
          : []

  const line = l.lead
    ? h_flex()
        .pl(MARK_W)
        .pt(above)
        .flex_wrap()
        .child(statusPartEl(l.lead).text_color(t.foreground).pr(SMALL_GAP))
        .children(l.text ? [statusPartEl(l.text).text_color(colorOf(t, l.tone))] : [])
    : lineEl(l.text, colorOf(t, l.tone)).pt(above)

  return line.relative().children(strokes)
}

function fieldEl(f: Field, p: Paint, indent: number, isInert = false): Element {
  const { t } = p
  const state = p.input(f.rowId)
  const input = state
    ? [
        div()
          .min_h(BUTTON_H)
          .px(INSET)
          .py(SMALL_GAP)
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

function rowEl(r: RowBlock, p: Paint): Element {
  const { t } = p
  const m = p.motion.get(r.id)
  const isLeaving = m?.state === 'leaving'
  const isOpen = isOpenRow(r)
  const isWrapped = isOpen || m?.isWrapHeld === true
  const isPressable = r.isSelectable && !isLeaving
  const hasTree = (m?.closing ?? r).body.some(l => l.tree !== undefined)
  const line = h_flex()
    .id(`title ${r.id}`)
    .items_start()
    .when(isPressable && isOpen, e => e.on_click((e, cx) => p.collapse(r.id, true, cx, e.modifiers.alt)))
    .when(hasTree, e => e.relative().child(trunkEl(LINE_HEIGHT, null, t, r.isSelected)))
    .child(markEl(r.mark, t, markTintOf(r, p)))
    .child(
      div()
        .flex_1()
        .min_w(0)
        .text_color(titleColorOf(r, p))
        .when(!isWrapped, e => e.truncate())
        .when(isOpen, e => e.font_semibold())
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
  const lines = [
    ...(r.settled ? [{ text: r.settled.label, tone: r.settled.tone }] : []),
    ...(r.feedback && !isStatusUnder(r) ? [r.feedback] : []),
    ...(r.heldLine ? [r.heldLine] : []),
  ]

  return v_flex()
    .id(`row ${r.id}`)
    .pl(EDGE + r.depth * NEST)
    .pr(EDGE)
    .py(ROW_PAD_PT)
    .when(r.isSelected, e => e.bg(t.selected))
    .when(isPressable && !isOpen, e =>
      e
        .hover(s => s.bg(t.hover))
        .on_click((e, cx) => (r.isCollapsed ? p.collapse(r.id, false, cx, e.modifiers.alt) : p.select(r.id, cx))),
    )
    .child(titleEl(r, p, line))
    .child(
      sizeEl(
        restId(r.id),
        p,
        v_flex()
          .children(
            lines.map(l => {
              const el = bodyLineEl(hasTree ? { ...l, tree: 'trunk' } : l, t, r.isSelected)

              return 'isHidden' in l && l.isHidden ? el.opacity(0) : el
            }),
          )
          .children(panelEl(r, m, p, isLeaving)),
      ),
    )
}

/**
 * A row's panel: its body, its buttons or text field, and a status its buttons put under them. A closing row keeps
 * the panel of its open form drawn, without clicks, while it fades. The panel's opacity glides as the row opens or
 * closes, and it reports its height, so a closing row's box can leave it out.
 */
function panelEl(r: RowBlock, m: RowMotion | undefined, p: Paint, isLeaving: boolean): Element[] {
  const { t } = p
  const from = m?.closing ?? r
  const isInert = isLeaving || from !== r
  const under = from === r && isStatusUnder(r) ? r.feedback : null
  const parts = [
    ...from.body.map(l => bodyLineEl(l, t, r.isSelected)),
    ...(from.buttons.length > 0 ? [buttonsEl(from.buttons, p, MARK_W, isInert)] : []),
    ...(from.field ? [fieldEl(from.field, p, MARK_W, isInert).pt(CONTROL_GAP)] : []),
    ...(under ? [bodyLineEl(under, t, r.isSelected).pt(CONTROL_GAP)] : []),
  ]
  if (parts.length === 0) return []
  const key = panelId(r.id)
  const opacity = m?.panel ?? null
  const glide = { duration: ROW_FADE_MS[m?.state ?? 'open'], easing: 'ease-out' as const }

  return [
    v_flex()
      .id(key)
      .on_size_change((size, cx) => p.measure(key, size, cx))
      .children(parts)
      .when(opacity !== null, e => e.opacity(opacity ?? 1).transition('opacity', glide)),
  ]
}

/**
 * One part of a line built from parts, such as a PR's status line or a Status line's name and stall. gpui-kit has no
 * inline span, so each part is an item of a wrapping row. A part that does not fit moves whole to the next line, which
 * starts at the left edge. A part wider than the line wraps inside it.
 */
const statusPartEl = (text: string): Element => div().min_w(0).max_w_full().whitespace_normal().child(text)

/** A Help line: a key or a mark in the left column, then its words. */
function keyEl(s: StatusLine, does: string, t: Theme): Element {
  return h_flex()
    .items_start()
    .pl(EDGE + HELP_INDENT)
    .pr(EDGE)
    .pb(LIST_GAP)
    .child(
      div()
        .flex_none()
        .w(HELP_COLUMN)
        .child(s.mark ? markEl(s.mark, t) : div().font_semibold().child(s.name)),
    )
    .child(div().flex_1().min_w(0).whitespace_normal().text_color(t.muted).child(does))
}

function statusEl(s: StatusLine, p: Paint, isInert: boolean): Element {
  const { t } = p
  if (s.does !== undefined) return keyEl(s, s.does, t)
  const name = statusPartEl(s.stall ? `${s.name}${STALL_GAP}` : s.name)
    .when(s.isBold, e => e.font_semibold())
    .when(s.isMuted, e => e.text_color(t.muted))
  const stall = s.stall ? [statusPartEl(s.stall.text).text_color(colorOf(t, s.stall.tone))] : []
  const toggle = s.fold?.toggle
  const chevron = s.fold
    ? [
        foldChevronEl(t, {
          isOpen: !s.fold.isFolded,
          isLive: toggle !== undefined && !isInert,
          ...(s.fold.isFolded ? { count: s.fold.count } : {}),
        }),
      ]
    : []

  return v_flex()
    .pl(EDGE + s.depth * NEST)
    .pr(EDGE)
    .child(
      h_flex()
        .id(`fold ${s.id}`)
        .items_start()
        .when(toggle !== undefined && !isInert, e =>
          e.on_click((e, cx) => (toggle ? p.press(toggle, cx, e.modifiers.alt) : undefined)),
        )
        .child(markEl(s.mark, t))
        .child(h_flex().relative().flex_1().min_w(0).flex_wrap().child(name).children(stall).children(chevron)),
    )
    .when(s.waitsOn !== undefined, e => e.child(lineEl(s.waitsOn ?? '', colorOf(t, 'needsYou'))))
    .children(s.under.map(l => lineEl(l, t.muted)))
    .when(s.buttons.length > 0, e => e.child(buttonsEl(s.buttons, p, MARK_W, isInert)))
}

/**
 * A PR's title, with its number muted at the line's right end as a row's age is, then where it stands and
 * its buttons. In a narrow pane the number leads the status line instead, so the title keeps its width.
 */
function prEl(b: PrBlock, p: Paint, isInert: boolean): Element {
  const { t } = p
  const title = h_flex()
    .items_start()
    .child(div().flex_1().min_w(0).font_semibold().whitespace_normal().child(b.title))
    .when(!p.isNarrow, e => e.child(div().flex_none().ml(INSET).text_color(t.muted).child(b.number)))
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
    .pt(INSIDE_GAP)
    .when(p.isNarrow, e => e.child(div().flex_none().text_color(t.muted).child(`${b.number}${SEP}`)))
    .child(word)
    .children(reasons)

  return v_flex()
    .pl(EDGE)
    .pr(EDGE)
    .child(title)
    .child(status)
    .when(b.error !== null, e => e.child(lineEl(b.error ?? '', t.ansi1, 0)))
    .when(b.buttons.length > 0, e => e.child(buttonsEl(b.buttons, p, 0, isInert)))
    .when(b.feedback !== null, e =>
      e.child(resultLineEl(b.feedback?.text ?? '', colorOf(t, b.feedback?.tone ?? null), 0)),
    )
}

function textLineEl(b: LineBlock, p: Paint, isInert: boolean): Element {
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
              .children(b.buttons.map(x => buttonEl(x, p, isInert))),
          ),
        ),
    )
    .when(b.under !== null, e => e.child(lineEl(b.under ?? '', t.muted, 0)))
    .when(b.feedback !== null, e =>
      e.child(resultLineEl(b.feedback?.text ?? '', colorOf(t, b.feedback?.tone ?? null), 0)),
    )
}

/** A group's heading. A marked one hangs its mark in the mark column, with its text where its rows' text starts. One with no mark starts at the edge, where its rows' marks do. A label heading starts at the edge and rules the goal's text to its buttons. */
function headingEl(b: Extract<Block, { kind: 'heading' }>, p: Paint, isInert: boolean): Element {
  const { t } = p
  const buttons = h_flex()
    .flex_none()
    .gap(CONTROL_GAP)
    .items_center()
    .children(b.buttons.map(x => buttonEl(x, p, isInert)))
  if (b.isLabel)
    return h_flex()
      .flex_wrap()
      .pl(EDGE)
      .pr(EDGE)
      .gap(CONTROL_GAP)
      .items_center()
      .child(
        h_flex()
          .min_w(0)
          .items_center()
          .when(b.mark !== null, e => e.child(markEl(b.mark, t)))
          .child(statusPartEl(b.text).text_color(b.mark?.tone ? colorOf(t, b.mark.tone) : t.muted)),
      )
      .child(ruleLine(t).min_w(END_SPACE))
      .child(buttons)

  return h_flex()
    .pl(EDGE)
    .pr(EDGE)
    .items_center()
    .when(b.mark !== null, e => e.child(markEl(b.mark, t)))
    .child(div().min_w(0).whitespace_normal().font_semibold().child(b.text))
    .when(b.count !== null, e => e.child(div().text_color(t.muted).child(`${SEP}${b.count}`)))
    .child(div().flex_1())
    .when(b.aside !== undefined, e =>
      e.child(
        div()
          .flex_none()
          .ml(INSET)
          .font_family(p.mono)
          .text_color(t.muted)
          .child(b.aside ?? ''),
      ),
    )
    .child(buttons)
}

/** An empty tab's block, centred across and, at least as tall as the list's room, centred down it too. */
function emptyEl(b: Extract<Block, { kind: 'empty' }>, p: Paint, isInert: boolean): Element {
  return v_flex()
    .items_center()
    .justify_center()
    .when(p.listRoom !== null, e => e.min_h(p.listRoom ?? 0))
    .p(END_SPACE)
    .child(emptyContentEl(b, p, isInert))
}

function emptyContentEl(b: Extract<Block, { kind: 'empty' }>, p: Paint, isInert: boolean): Element {
  const { t } = p
  const { empty, under } = b
  const centred = (text: string, color = t.foreground) =>
    div().text_center().whitespace_normal().text_color(color).child(text)

  return v_flex()
    .items_center()
    .max_w(EMPTY_STATE_MAX_WIDTH_PT)
    .gap(INSIDE_GAP)
    .child(centred(empty.title).font_semibold())
    .when(empty.hint !== null, e => e.child(centred(empty.hint ?? '', t.muted)))
    .when(under?.text != null, e => e.child(centred(under?.text ?? '').pt(CONTROL_GAP)))
    .when((under?.buttons.length ?? 0) > 0, e =>
      e.child(
        h_flex()
          .flex_wrap()
          .justify_center()
          .gap(CONTROL_GAP)
          .pt(CONTROL_GAP)
          .children((under?.buttons ?? []).map(x => buttonEl(x, p, isInert))),
      ),
    )
    .when(under?.field != null, e =>
      e.child(
        div()
          .w_full()
          .pt(CONTROL_GAP)
          .child(under?.field ? fieldEl(under.field, p, 0, isInert) : div()),
      ),
    )
    .when(under?.feedback != null, e =>
      e.child(centred(under?.feedback?.text ?? '', colorOf(t, under?.feedback?.tone ?? null)).pt(CONTROL_GAP)),
    )
}

function foldEl(b: Extract<Block, { kind: 'fold' | 'more' }>, p: Paint, isInert: boolean): Element {
  const { t } = p
  const press: Button = {
    id: b.id,
    label: b.text,
    emphasis: 'quiet',
    isOut: false,
    hotkey: null,
    does: { is: 'view', change: b.change },
  }
  const fold = b.kind === 'fold' ? b : null
  const mark = fold?.mark

  return h_flex()
    .id(`fold ${b.id}`)
    .pl(mark === undefined ? TEXT_X + b.depth * NEST : EDGE)
    .pr(EDGE)
    .py(ROW_PAD_PT)
    .items_start()
    .text_color(t.muted)
    .accessibility_label(b.text)
    .when(!isInert, e => e.on_click((e, cx) => p.press(press, cx, e.modifiers.alt)))
    .when(mark !== undefined, e => e.child(markEl(mark ?? null, t)))
    .child(div().min_w(0).whitespace_normal().child(b.text))
    .when(fold !== null, e => e.child(foldChevronEl(t, { isOpen: fold?.isOpen ?? false, isLive: !isInert })))
}

/**
 * A rule from edge to edge, between two groups or two PRs, so the marks of the group below sit inside the break. A
 * labelled one starts its label where text after a mark starts.
 */
export function blockEl(b: Block, p: Paint): Element {
  const { t } = p
  const isLeaving = p.motion.get(b.id)?.state === 'leaving'
  if (b.kind === 'row') return rowEl(b, p)
  if (b.kind === 'status') return statusEl(b, p, isLeaving)
  if (b.kind === 'pr') return prEl(b, p, isLeaving)
  if (b.kind === 'line') return textLineEl(b, p, isLeaving)
  if (b.kind === 'heading') return headingEl(b, p, isLeaving)
  if (b.kind === 'empty') return emptyEl(b, p, isLeaving)
  if (b.kind === 'fold' || b.kind === 'more') return foldEl(b, p, isLeaving)
  if (b.kind === 'rule') return ruleEl(b, t)
  if (b.kind === 'field')
    return div()
      .pl(b.isAtEdge ? EDGE : TEXT_X)
      .pr(EDGE)
      .child(fieldEl(b.field, p, 0, isLeaving))
  if (b.kind === 'note')
    return noteEl(
      b,
      t,
      (b.buttons ?? []).map(x => buttonEl(x, p, isLeaving)),
    )
  if (b.kind === 'caption') return div().pl(EDGE).pr(EDGE).text_color(t.muted).child(b.text)
  if (b.kind === 'banner')
    return bannerEl(
      b.banner,
      t,
      b.buttons.map(x => buttonEl(x, p, isLeaving)),
      b.feedback ? resultLineEl(b.feedback.text, colorOf(t, b.feedback.tone), 0) : null,
    )

  return div()
}
