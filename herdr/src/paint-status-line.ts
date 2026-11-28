import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex, v_flex } from 'gpui-base'
import { STALL_GAP } from '../../core/view/status-page-parts'
import type { StatusLine } from './blocks'
import { EDGE, HELP_COLUMN, HELP_INDENT, LIST_GAP, MARK_W, colorOf, faintOf } from './paint-theme'
import type { Paint, Theme } from './paint-theme'
import { buttonsEl, fadeEl, lineEl, markEl, nestedEl } from './paint-parts'
import { LEAVE_FADE_MS } from '../../core/view/row-motion'
import { swapPartFade } from './block-swap'
import type { StatusPart } from './block-swap'
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

/** A part of a Status line that does not change. */
const SHOWN_PART = { opacity: 1, duration: LEAVE_FADE_MS, delay: 0 }

/**
 * A Status line. While its parts change, the parts that change fade out, and then the new ones fade in, as `BlockSwap`
 * gives them, and the buttons that fade out take no press. A mark that turns into another takes its new form when the
 * new parts come, with no fade, so the mark's column never shows empty. A part that does not change still declares its
 * fade, since gpui-kit animates only a later change of opacity, and a part that starts to change while the others fade
 * out must fade from where it is. Its indent springs, as `nestedEl` sets it.
 */
export function statusEl(s: StatusLine, p: Paint, isInert: boolean): Element {
  const { t } = p
  if (s.does !== undefined) return keyEl(s, s.does, t)
  const swap = p.motion.get(s.id)?.blockSwap ?? null
  const areButtonsLeaving = swap?.isOut === true && swap.parts?.includes('buttons') === true
  const partEl = (part: StatusPart, el: Element): Element => {
    const name = `status ${part} ${s.id}`
    const isMarkKept = part === 'mark' && swap?.from.kind === 'status' && swap.from.mark !== null && s.mark !== null
    const fade = swap?.parts?.includes(part) && !isMarkKept ? swapPartFade(swap, swap.inDelayMs) : SHOWN_PART
    return fadeEl(el.id(name), name, fade.opacity, fade, p)
  }
  const name = statusPartEl(s.stall ? `${s.name}${STALL_GAP}` : s.name)
    .when(s.isBold, e => e.font_semibold())
    .when(s.nameLevel !== 'plain', e => e.text_color(s.nameLevel === 'faint' ? faintOf(t) : t.muted))
    .when(s.nameTone !== undefined, e => e.text_color(colorOf(t, s.nameTone ?? 'needsYou')))
  const stall = s.stall ? [statusPartEl(s.stall.text).text_color(colorOf(t, s.stall.tone))] : []
  const toggle = s.fold?.toggle
  const chevron = s.fold
    ? [
        foldChevronEl(t, {
          isOpen: !s.fold.isFolded,
          isLive: toggle !== undefined && !isInert,
          level: s.fold.level,
          ...(s.fold.isFolded ? { count: { id: `fold count ${s.id}`, value: s.fold.count } } : {}),
        }),
      ]
    : []

  return nestedEl(v_flex().id(`indent ${s.id}`), s.depth)
    .pl(EDGE)
    .child(
      h_flex()
        .id(`fold ${s.id}`)
        .items_start()
        .when(toggle !== undefined && !isInert, e =>
          e.on_click((e, cx) => (toggle ? p.press(toggle, cx, e.modifiers.alt) : undefined)),
        )
        .child(partEl('mark', markEl(s.mark, t)))
        .child(
          h_flex()
            .relative()
            .flex_1()
            .min_w(0)
            .flex_wrap()
            .child(partEl('name', name))
            .children(stall)
            .children(chevron),
        ),
    )
    .child(
      partEl('under', v_flex().children(s.under.map(l => lineEl(l.text, l.level === 'faint' ? faintOf(t) : t.muted)))),
    )
    .when(s.buttons.length > 0, e =>
      e.child(partEl('buttons', buttonsEl(s.buttons, p, MARK_W, isInert || areButtonsLeaving))),
    )
}
