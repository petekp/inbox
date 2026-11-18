import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex, v_flex } from 'gpui-base'
import { EMPTY_STATE_MAX_WIDTH_PT } from '../../hooks/layout'
import type { Block } from './blocks'
import { CONTROL_GAP, END_SPACE, INSIDE_GAP, colorOf } from './paint-theme'
import type { Paint } from './paint-theme'
import { buttonEl } from './paint-parts'
import { fieldEl } from './paint-field'

/** An empty tab's block, centred across and, at least as tall as the list's room, centred down it too. */
export function emptyEl(b: Extract<Block, { kind: 'empty' }>, p: Paint, isInert: boolean): Element {
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
