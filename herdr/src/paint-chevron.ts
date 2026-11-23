import { PathBuilder, div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { h_flex } from 'gpui-base'
import { LINE_HEIGHT, SMALL_GAP } from './paint-theme'
import { faintOf } from './paint-theme'
import type { Theme } from './paint-theme'
import type { TextLevel } from '../../core/view/status-page-parts'

const SIZE_PX = 12
const STROKE_PX = 1
const GRID = 24

/** The Codex tab's chevron icon: its 24-unit path (`m9 18 6-6-6-6`, and `m6 9 6 6 6-6` turned down), stroke 2 units wide. */
const CORNERS = {
  folded: [
    [9, 18],
    [15, 12],
    [9, 6],
  ],
  open: [
    [6, 9],
    [12, 15],
    [18, 9],
  ],
} as const

const pathOf = (isOpen: boolean) => {
  const [first, ...rest] = CORNERS[isOpen ? 'open' : 'folded'].map(
    ([x, y]) => [`${(x / GRID) * 100}%`, `${(y / GRID) * 100}%`] as const,
  )
  const path = PathBuilder.stroke(STROKE_PX).move_to(first![0], first![1])

  return rest.reduce((p, [x, y]) => p.line_to(x, y), path).build()
}

const FOLDED_PATH = pathOf(false)
const OPEN_PATH = pathOf(true)

/** A copy laid over its element, shown while the copy is hovered. */
const hoverCopy = (copy: Element | string): Element =>
  div()
    .absolute()
    .top(0)
    .left(0)
    .size_full()
    .opacity(0)
    .hover(x => x.opacity(1))
    .child(copy)

/**
 * A fold's chevron, drawn from the same path as the Codex tab's icon, in `color`. When `isLive`, hovering it shows a
 * copy in the foreground color over it.
 */
function chevronEl(isOpen: boolean, t: Theme, isLive: boolean, color: Theme['muted']): Element {
  const path = isOpen ? OPEN_PATH : FOLDED_PATH
  const shape = (color: Theme['muted']) => window.paint_path(path, color).absolute().top(0).left(0).size(`${SIZE_PX}px`)

  return div()
    .relative()
    .flex_none()
    .w(SIZE_PX)
    .h(SIZE_PX)
    .child(shape(color))
    .when(isLive, e => e.child(hoverCopy(shape(t.foreground))))
}

/**
 * The count of the rows a folded parent hides. A hover text color on it draws no change in Herdr, so when `isLive`,
 * hovering it shows a copy in the foreground color over it.
 */
function countEl(count: number, t: Theme, isLive: boolean): Element {
  const text = `${count}`

  return div()
    .relative()
    .flex_none()
    .ml(SMALL_GAP)
    .child(text)
    .when(isLive, e => e.child(hoverCopy(text).text_color(t.foreground)))
}

/**
 * A fold's chevron at the end of its line, after a gap, with the count of the rows it hides while folded, both at
 * `level`.
 */
export function foldChevronEl(
  t: Theme,
  fold: { isOpen: boolean; isLive: boolean; level: TextLevel; count?: number },
): Element {
  const color = fold.level === 'faint' ? faintOf(t) : t.muted

  return h_flex()
    .flex_none()
    .items_center()
    .h(LINE_HEIGHT)
    .ml(SMALL_GAP)
    .text_color(color)
    .child(chevronEl(fold.isOpen, t, fold.isLive, color))
    .children(fold.count === undefined ? [] : [countEl(fold.count, t, fold.isLive)])
}
