/** The padding above and below a row's text, in points. The Codex tab's CSS pixels are points on macOS. */
export const ROW_PAD_PT = 8

/** The padding above and below a row on the Status page, in points, so its rows sit half of the desktop pane's 19-point line apart. */
export const STATUS_ROW_PAD_PT = 19 / 4

/**
 * The space where the terminal and omp leave a blank line on the Status page, in points: above Other work when rows
 * come before it, and between the goal's text and its milestones. It is half the desktop pane's 19-point line, past a
 * row's padding. Between two milestones, where they also leave a blank line, desktop and Codex leave `STATUS_ROW_PAD_PT`,
 * so a milestone's work sits closer to its own name than to the next milestone while the step still shows.
 */
export const SECTION_GAP_PT = 19 / 2

/** The padding above and below a banner's text, in points. */
export const BANNER_PAD_Y_PT = 8

/** The space between two banners, in points. */
export const BANNER_GAP_PT = 8
