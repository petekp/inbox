import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex, v_flex } from 'gpui-base'
import { EMPTY_STATE_MAX_WIDTH_PT } from '../../hooks/layout'
import type { Block } from './blocks'
import { CONTROL_GAP, END_SPACE, INSIDE_GAP, colorOf } from './paint-theme'
import type { Paint } from './paint-theme'
import { buttonEl } from './paint-parts'
import { fieldEl } from './paint-field'
import { fitEl, sizeEl } from './paint-space'

/**
 * An empty tab's block, centred across and, at least as tall as the list's room, centred down it too. Its content sits
 * in a box at its measured height, so when the goal's field opens or closes the box glides and the centred content
 * moves with it.
 */
export function emptyEl(b: Extract<Block, { kind: 'empty' }>, p: Paint, isInert: boolean): Element {
  return v_flex()
    .items_center()
    .justify_center()
    .when(p.listRoom !== null, e => e.min_h(p.listRoom ?? 0))
    .p(END_SPACE)
    .child(fitEl(contentKey(b), p, emptyContentEl(b, p, isInert)))
}

const contentKey = (b: Extract<Block, { kind: 'empty' }>): string => `${b.id} content`

/**
 * The buttons under an empty tab's text, or the goal's field in their place. The field is measured under one key that
 * reads 0 while no field is drawn, so a field that has not measured yet is one that just opened, and its buttons wait
 * for the box to open, as the goal page's do. In a draw that takes heights at once, such as the tab's first, nothing
 * opens, and they show at once. The measured box leads, so the field opens where it was.
 */
function controlsEl(b: Extract<Block, { kind: 'empty' }>, p: Paint, isInert: boolean): Element {
  const key = `${b.id} field`
  const field = b.under?.field ?? null
  const buttons = b.under?.buttons ?? []
  const height = p.heights.get(key) ?? 0
  const opening = { isOpen: height > 0 || p.isAtOnce(contentKey(b)), height }
  const fieldBox = field
    ? div()
        .w_full()
        .pt(CONTROL_GAP)
        .child(fieldEl(field, p, 0, isInert, opening))
    : div()

  return v_flex()
    .w_full()
    .items_center()
    .child(sizeEl(key, p, fieldBox).w_full())
    .when(buttons.length > 0, e =>
      e.child(
        h_flex()
          .flex_wrap()
          .justify_center()
          .gap(CONTROL_GAP)
          .pt(CONTROL_GAP)
          .children(buttons.map(x => buttonEl(x, p, isInert))),
      ),
    )
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
    .when((under?.buttons.length ?? 0) > 0 || under?.field != null, e => e.child(controlsEl(b, p, isInert)))
    .when(under?.feedback != null, e =>
      e.child(centred(under?.feedback?.text ?? '', colorOf(t, under?.feedback?.tone ?? null)).pt(CONTROL_GAP)),
    )
}
