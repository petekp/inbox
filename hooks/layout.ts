/**
 * The spacing scale every look draws from, in points. The Codex tab's CSS pixels are points on macOS. The desktop pane
 * converts a step to its 19-point lines, and the terminal and omp to whole rows, as `docs/looks/differences-spacing.md`
 * says. Each step is a whole number of `SPACE_UNIT`, and the gaps rise in this order, so space shows what belongs
 * together: `INSIDE_GAP_PT`, `LIST_GAP_PT`, `CHILD_GAP_PT`, `ITEM_GAP_PT`, `SECTION_GAP_PT`.
 */
export const SPACE_UNIT = 4

/** The line height of the Herdr panel's and the Codex tab's 13-point text. */
export const LINE_PT = 5 * SPACE_UNIT

/** Between the lines of one item, such as a title and its detail. */
export const INSIDE_GAP_PT = 0

/** Between two one-line items of a list. */
export const LIST_GAP_PT = SPACE_UNIT

/** Between two items when either has more than one line. */
export const ITEM_GAP_PT = 3 * SPACE_UNIT

/**
 * Between two items nested under one parent, when either has more than one line. Less than `ITEM_GAP_PT`, so a
 * parent's children read as one group under it.
 */
export const CHILD_GAP_PT = 2 * SPACE_UNIT

/** A heading to its first item. Less than `ITEM_GAP_PT`, so the heading reads as part of what it heads. */
export const HEAD_GAP_PT = 2 * SPACE_UNIT

/** Text to the buttons under it, and one button to the next. */
export const CONTROL_GAP_PT = 2 * SPACE_UNIT

/** Between two groups or sections. A rule between them sits halfway. */
export const SECTION_GAP_PT = 6 * SPACE_UNIT

/** The space between the panel's edges and its content. */
export const EDGE_PT = 4 * SPACE_UNIT

/** The widest an empty tab's text and controls draw, centred. The terminal and omp draw it in their own columns. */
export const EMPTY_STATE_MAX_WIDTH_PT = 90 * SPACE_UNIT

/** The width of the column marks hang in. Text after a mark starts at `EDGE_PT + MARK_PT`. */
export const MARK_PT = 6 * SPACE_UNIT

/**
 * The padding above and below a row's text, closed or open: half of `ITEM_GAP_PT`. A row's padding counts toward the
 * gap beside it, so rows sit `ITEM_GAP_PT` apart and their boxes meet. A closed one-line row is then
 * `LINE_PT + 2 * ROW_PAD_PT` (32 pt) tall to click, and no space between two rows belongs to neither.
 */
export const ROW_PAD_PT = ITEM_GAP_PT / 2

/** The padding above and below a banner's text. */
export const BANNER_PAD_Y_PT = CONTROL_GAP_PT

/** The space between two banners. */
export const BANNER_GAP_PT = CONTROL_GAP_PT
