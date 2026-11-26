import { div } from 'gpui-kit'
import type { Color, Element } from 'gpui-kit'
import { h_flex } from 'gpui-base'
import { DOT } from '../../core/view/rows'
import type { Aged, Tone } from './blocks'
import { partedEl } from './paint-parted'
import { lineEl } from './paint-parts'
import { statusPartEl } from './paint-status-line'
import { CONTROL_GAP, INSIDE_GAP, colorOf, faintOf } from './paint-theme'
import type { Theme } from './paint-theme'

export const NO_BREAK_SPACE = '\u00a0'

/**
 * A paragraph of two colors. gpui-kit has no inline span, so each word is an item of a wrapping row, followed by a
 * no-break space. That space is as wide as the font's own at any text size, and a line end does not trim it. A word
 * wider than the line wraps inside its item. The paragraph flows as one text, and its wrapped lines start back at the
 * row's left edge.
 */
export const wordEls = (text: string, color: Color): Element[] =>
  text
    .split(' ')
    .filter(word => word)
    .map(word => statusPartEl(`${word}${NO_BREAK_SPACE}`).text_color(color))

/**
 * A line of text `indent` in from its row's edge. A line of DOT-joined parts, such as a fold's note or a thread's place
 * and author, breaks between its parts, so no line starts or ends with a dot.
 */
export const partedTextEl = (text: string, color: Color, indent: number, t: Theme): Element =>
  text.includes(DOT)
    ? div()
        .pl(indent)
        .pt(INSIDE_GAP)
        .child(
          partedEl(
            text.split(DOT).map(part => statusPartEl(part).text_color(color)),
            t.muted,
          ),
        )
    : lineEl(text, color, indent)

/** A press's result under its buttons. An aged result's age draws faint whatever the result's color. */
export function feedbackEl(f: { text: string; tone: Tone; aged?: Aged }, t: Theme): Element {
  const cut = f.aged?.lead.length ?? f.text.length
  if (f.tone === 'muted' || cut >= f.text.length) return partedTextEl(f.text, colorOf(t, f.tone), 0, t).pt(CONTROL_GAP)

  return h_flex()
    .flex_wrap()
    .pt(CONTROL_GAP)
    .children([...wordEls(f.text.slice(0, cut), colorOf(t, f.tone)), ...wordEls(f.text.slice(cut), faintOf(t))])
}
