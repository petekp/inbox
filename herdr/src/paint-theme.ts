import type { Context } from 'gpui-kit'
import type { InputState } from 'gpui-base'
import type { ShownTab } from '../../hooks/tabs'
import type { Button, Tone } from './blocks'
import type { RowMotion } from './motion'

type Color = `#${string}`

/** The theme colors the look draws with. Every Herdr theme names each of them, light or dark. */
export type Theme = Record<
  | 'foreground'
  | 'background'
  | 'raised'
  | 'border'
  | 'input'
  | 'hover'
  | 'selected'
  | 'solid'
  | 'solid_foreground'
  | 'muted'
  | 'done'
  | 'ansi1'
  | 'ansi3'
  | 'ansi4'
  | 'ansi5'
  | 'ansi6',
  Color
>

/**
 * Needs-you and warnings take the theme's yellow, as the other looks draw them in amber. Findings, PRs and errors take
 * its magenta, cyan and red, and a notice its blue, as the terminal look takes its theme's. Done takes the color Herdr's
 * sidebar gives an agent that is done.
 */
const TONE_COLORS: Record<Exclude<Tone, null>, keyof Theme> = {
  needsYou: 'ansi3',
  issue: 'ansi3',
  notice: 'ansi4',
  warning: 'ansi3',
  findings: 'ansi5',
  prs: 'ansi6',
  done: 'done',
  error: 'ansi1',
  muted: 'muted',
}

export const colorOf = (t: Theme, tone: Tone): Color => t[tone === null ? 'foreground' : TONE_COLORS[tone]]

/** A theme color at a share of its strength, for a banner's fill and border. Tone colors are opaque `#rrggbb`. */
export const tint = (c: Color, share: number): Color =>
  `${c.slice(0, 7)}${Math.round(share * 255)
    .toString(16)
    .padStart(2, '0')}` as Color

/**
 * The look's text sizes and line heights: one text size, and the Status page's head. gpui reads a bare number given to
 * `line_height` as a multiplier, so the line heights are px strings.
 */
export const TEXT = 13
export const LINE = '20px'
export const SMALL_TEXT = 12
export const HEAD_TEXT = 15
export const HEAD_LINE = '24px'

/**
 * The one left edge every title, line and button row starts on, on every tab. The tab labels and a banner's text sit
 * on it too. Marks hang in the column before it, and a nested row steps in by `NEST`.
 */
export const SPINE = 40
/** Where the column of hanging marks starts. A mark sits centred in it, with room on both sides. */
export const MARK_X = 16
export const MARK_W = SPINE - MARK_X
export const NEST = 20
/** The one right edge: Help, a row's age, a PR's number, a line's last button and a rule's end all stop this far in. */
export const EDGE_X = 24

/** Under this pane width, a PR's number moves from the end of its title line to the start of its status line. */
export const NARROW_PANE = 280

/** The space between two sections, and under the list's last row, so the last line never meets the pane's edge. */
export const SECTION_GAP = 32
export const END_SPACE = SECTION_GAP

/** A button's height, the space between two buttons, and a pill's side padding. */
export const BUTTON_H = 24
export const BUTTON_GAP = 12
export const PILL_X = 12

/** The separator between a status and its reasons, and between a heading and its count. */
export const SEP = ' · '

/** What a paint needs besides the blocks: the theme, the look's handlers, each row's move, and the open field. */
export type Paint = {
  t: Theme
  press: (b: Button, cx: Context) => void
  select: (id: string, cx: Context) => void
  pick: (tab: ShownTab, cx: Context) => void
  motion: ReadonlyMap<string, RowMotion>
  input: (rowId: string) => InputState | null
  /** Whether the pane is under `NARROW_PANE` wide. */
  isNarrow: boolean
}
