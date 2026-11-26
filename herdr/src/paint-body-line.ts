import type { Element } from 'gpui-kit'
import { h_flex } from 'gpui-base'
import type { RowPart } from '../../core/view/row-parts'
import type { BodyLine, Button } from './blocks'
import { BUTTON_LABEL_X, EDGE, LINE_HEIGHT, MARK_W, bodyTextColor } from './paint-theme'
import type { Paint, Theme } from './paint-theme'
import { PATH_X, lineColor } from './paint-strokes'
import { partedTextEl, wordEls } from './paint-text'
import { ARM_END, answersEl, armEl, trunkEl } from './paint-tree'

/** A line under a row's title, `above` under the part above it, with its part of the tree that hangs from the row's mark. */
export const bodyLineEl = (
  l: Omit<BodyLine, 'part'> & { part?: RowPart },
  above: number,
  t: Theme,
  isSelected: boolean,
  answers: Button[] = [],
  p: Paint | null = null,
  isInert = false,
): Element => {
  const under = isSelected ? t.selected : t.background
  const color = lineColor(t, under)
  const textColor = bodyTextColor(t, l, under)
  if (answers.length > 0 && p) {
    const trunk =
      l.tree === 'tee' ? [trunkEl(0, null, t, isSelected)] : l.tree === 'last' ? [trunkEl(0, above, t, isSelected)] : []

    return h_flex()
      .relative()
      .min_w(0)
      .pt(above)
      .child(answersEl(answers, p, isInert, l.tree === 'last', t, isSelected))
      .children(trunk)
  }
  const armAt = above + LINE_HEIGHT / 2
  const arm = armEl(PATH_X - EDGE + 1, ARM_END, armAt, color)
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
        .flex_wrap()
        .pl(MARK_W)
        .pt(above)
        .children([...wordEls(l.lead, t.foreground), ...wordEls(l.text, textColor)])
    : partedTextEl(l.text, textColor, l.isOptionNote ? MARK_W + BUTTON_LABEL_X : MARK_W, t).pt(above)

  return line.relative().children(strokes)
}
