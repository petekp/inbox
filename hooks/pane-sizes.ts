import { DESKTOP_CHARS_PER_CELL } from './desktop-metrics'
import { cellWidth } from './text'
import { fitTabs, tabName, type TabNaming } from './tabs'
import { ROW_PAD_PT, STATUS_ROW_PAD_PT } from './layout'
import { TAB_COUNT_GAP } from './tabs-client'

export const REPLY_ROWS = 3
export const DESKTOP_REPLY_ROWS = 2
/** The Claude app's Input keeps this width whatever room its Box gives, unless an `overflow="hidden"` Box shrinks it. */
export const DESKTOP_FIELD_PT = 180

/**
 * The rows a text field needs to show `text` whole, from 1 up to `most`: each of its lines takes the rows `lineRows`
 * counts, and at least one.
 */
export function fieldRows(text: string, lineRows: (line: string) => number, most: number): number {
  const rows = text.split('\n').reduce((n, line) => n + Math.max(1, lineRows(line)), 0)

  return Math.min(most, rows)
}
export const DESKTOP_WIDE_AT = 50
export const DESKTOP_TAB_PAD = '\u00a0'.repeat(3)
export const DESKTOP_LINE_PT = 19
/**
 * A row of the desktop pane's scroll, the unit of its `scroll.offset` and `bodyRows`: one line of text, in points,
 * measured on app 4.4212.0 with engine 2.1.309.
 */
export const DESKTOP_ROW_PT = 20
/**
 * How far the desktop pane's `scroll.offset` may be from where its page sits, in rows. It reports whole rows, as 19 at
 * the end of a page 47.85 rows tall, scrolled 18.85 (app 4.4212.0, engine 2.1.309). That is one sample, and a height
 * rounded up can put the offset nearly a row off at the end of a page.
 */
export const DESKTOP_OFFSET_ROUNDING = 1
/** A native Button's height on desktop, in points, as measured in the pane for the desktop Undo. */
export const DESKTOP_BUTTON_PT = 23
/**
 * One column of `bodyColumns` in the Claude app pane, in points, measured on app 3.6556.2 with engine 2.1.308. The
 * engine reports the pane in columns only, so this cannot be measured at run time.
 * Remeasure it with the steps in docs/reference/claude-desktop-app/what-desktop-draws-layout.md.
 */
export const DESKTOP_CELL_PT = 8.8
export const DESKTOP_LINK_GAP_CELLS = 1.5
/** Room a link takes past its label's estimated width. At the estimate alone, app 3.6556.2 cut a link's label, as "Re…". */
export const DESKTOP_LINK_SLACK_CELLS = 0.5
export const UNDO_CELLS = 9
export const UNDO_HEIGHT_PT = 23
/**
 * A Box in the hooks tree counts padding in half lines, so it pads twice this.
 */
export const DESKTOP_ROW_PAD = ROW_PAD_PT / DESKTOP_LINE_PT
export const TREE_LINE_AT = 2
export const ROW_COLUMNS = {
  tree: { lead: TREE_LINE_AT + 3, handleAt: TREE_LINE_AT + 3, textAt: TREE_LINE_AT + 6 },
  desktop: { lead: 1, handleAt: 1, textAt: 3 },
} as const
export const DESKTOP_MARK_CELLS = 1
/** One point, across in cells and down in lines: desktop draws a tree line as a filled Box, since it has no per-side borders. */
export const DESKTOP_HAIR_CELLS = 1 / DESKTOP_CELL_PT
export const DESKTOP_HAIR_LINES = 1 / DESKTOP_LINE_PT
/**
 * Where the Status tab's tree line runs on desktop, in cells from a row's mark column: under the middle of a subject's
 * mark, which the Claude app 3.6556 draws 6.4 pt into the column, where a cell is 8.8 pt.
 */
export const DESKTOP_TREE_AT = 0.73
/** The room the tree's arm leaves before a child's mark on desktop, in cells. */
export const DESKTOP_ARM_GAP = 0.4
/** A dash of a dashed line on desktop, and the room between two, in points. */
export const DESKTOP_DASH_PT = 3
export const DESKTOP_DASH_GAP_PT = 3
export const STATUS_PAD_Y = STATUS_ROW_PAD_PT / DESKTOP_LINE_PT
/** How far a row frame's transparent border insets its content on each side, in points, measured on app 3.6556.2. */
export const FRAME_INSET_PT = 17.6
export const DESKTOP_SIDE_CELLS = 5
export const TERMINAL_SIDE_CELLS = 5
export const SELECTED_GAP_PT = 3
export const TAB_PAD = '  '
/** The docked terminal tabs' padding inside each tab, gap between tabs and right margin, from roomiest to tightest. */
export const FRAMED_TAB_LAYOUTS = [
  { pad: TAB_PAD, gap: 1, right: 1 },
  { pad: ' ', gap: 1, right: 1 },
  { pad: ' ', gap: 0, right: 1 },
  { pad: ' ', gap: 0, right: 0 },
  { pad: '', gap: 1, right: 0 },
]
/** The inline tab row's gaps between tabs, from roomiest to tightest. */
export const INLINE_TAB_GAPS = [3, 2, 1]
export const INLINE_RAIL_AT = 80
export const RAIL_GUTTER = 2

export function desktopTabSizes(
  tabs: { label: string; symbol: string; badge: string | null; isShown: boolean }[],
  columns: number,
): { widths: number[]; gap: number; isEachFramed: boolean; naming: TabNaming } {
  const steps = [
    { padding: 1, gap: 1, isEachFramed: true },
    { padding: 0, gap: 1, isEachFramed: true },
    { padding: 0, gap: 0, isEachFramed: true },
    { padding: 0, gap: 1, isEachFramed: false },
  ]
  const widthsOf = (naming: TabNaming, { padding, isEachFramed }: (typeof steps)[number]) =>
    tabs.map(t => {
      const name = tabName(t, naming)
      const text = t.badge === null ? name : `${name}${TAB_COUNT_GAP}${t.badge}`
      const isFramed = isEachFramed || t.isShown
      // A tab's rounded frame insets its label FRAME_INSET_PT on each side, so its width adds those columns,
      // rounded up, to what the label needs. Narrower, the label wraps inside the tab.
      return (
        Math.ceil(cellWidth(text) / DESKTOP_CHARS_PER_CELL) +
        (isFramed ? Math.ceil((2 * FRAME_INSET_PT) / DESKTOP_CELL_PT) : 0) +
        padding
      )
    })
  const { naming, layout } = fitTabs(steps, (naming, step) => {
    const widths = widthsOf(naming, step)

    return widths.reduce((sum, w) => sum + w, 0) + step.gap * (widths.length - 1) <= columns
  })

  return { widths: widthsOf(naming, layout), gap: layout.gap, isEachFramed: layout.isEachFramed, naming }
}
