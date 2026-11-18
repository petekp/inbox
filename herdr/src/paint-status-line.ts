import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex, v_flex } from 'gpui-base'
import { STALL_GAP } from '../../hooks/status-page'
import type { StatusLine } from './blocks'
import { EDGE, HELP_COLUMN, HELP_INDENT, LIST_GAP, MARK_W, NEST, colorOf } from './paint-theme'
import type { Paint, Theme } from './paint-theme'
import { buttonsEl, lineEl, markEl } from './paint-parts'
import { foldChevronEl } from './paint-chevron'

/**
 * One part of a line built from parts, such as a PR's status line or a Status line's name and stall. gpui-kit has no
 * inline span, so each part is an item of a wrapping row. A part that does not fit moves whole to the next line, which
 * starts at the left edge. A part wider than the line wraps inside it.
 */
export const statusPartEl = (text: string): Element => div().min_w(0).max_w_full().whitespace_normal().child(text)

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

export function statusEl(s: StatusLine, p: Paint, isInert: boolean): Element {
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
