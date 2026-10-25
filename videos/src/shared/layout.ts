import type { Rect } from './geometry'
import { HEIGHT, WIDTH } from './video'

/** The frame's background behind everything. */
export const BACKGROUND = '#0c0c0e'
/** The band above recorded footage that names its app, in pixels. */
export const BAND = 72
/** The band below recorded footage that holds its caption, so the caption never covers what it describes, in pixels. */
export const CAPTION_BAND = 170
/** The height of a drawn window's title bar, in pixels. */
export const TITLE_BAR = 36

/** The picture between the app band and the caption band, in the master's pixels. */
export const PICTURE: Rect = { x: 0, y: BAND, w: WIDTH, h: HEIGHT - BAND - CAPTION_BAND }
