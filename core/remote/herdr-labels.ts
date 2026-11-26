/** The label that names the session a terminal runs, so the Herdr look can find its published file. */
export const SESSION_LABEL = 'inbox.session'

/**
 * The terminal label that names the pane showing the Herdr look beside it. Herdr keeps a mod pane with its tab, so the
 * panel outlives the host that opened it, and every host in the terminal reads this label. The look reads it to find
 * its own pane, since Herdr names that pane in `props()` only for a pane header.
 */
export const PANEL_LABEL = 'inbox.panel'

/** The label the Herdr look sets on the session's terminal after it writes a press, so a host following `hc events` reads it. */
export const PRESS_LABEL = 'inbox.press'
