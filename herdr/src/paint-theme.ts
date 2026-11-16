import type { ClosedSeen, NewRows } from '../../hooks/arrivals'
import type { Context } from 'gpui-kit'
import type { InputState } from 'gpui-base'
import type { ShownTab } from '../../hooks/tabs'
import type { Button, Tone } from './blocks'
import type { RowMotion } from './motion'
import type { TimeLeft } from './time-left'

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
  | 'ansi2'
  | 'ansi3'
  | 'ansi4'
  | 'ansi5'
  | 'ansi6',
  Color
>

/**
 * Needs-you and warnings take the theme's yellow, as the other looks draw them in amber. Findings, PRs and errors take
 * its magenta, cyan and red, and a notice its blue, as the terminal look takes its theme's. Done takes the color Herdr's
 * sidebar gives an agent that is done. A met goal takes the theme's green, which each theme picks to read on its own
 * background, as the other looks draw a met goal in their done green.
 */
const TONE_COLORS: Record<Exclude<Tone, null>, keyof Theme> = {
  needsYou: 'ansi3',
  issue: 'ansi3',
  notice: 'ansi4',
  warning: 'ansi3',
  findings: 'ansi5',
  prs: 'ansi6',
  done: 'done',
  met: 'ansi2',
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
 * `c` at a share of its strength mixed into `under`, as one opaque color. Two strokes in it that meet then draw no
 * darker or brighter point, as two translucent strokes would.
 */
export function mixInto(c: Color, under: Color, share: number): Color {
  const channel = (at: number) =>
    Math.round(parseInt(c.slice(at, at + 2), 16) * share + parseInt(under.slice(at, at + 2), 16) * (1 - share))

  return `#${[1, 3, 5].map(at => channel(at).toString(16).padStart(2, '0')).join('')}` as Color
}

/**
 * The look's text sizes and line heights: one text size, and the Status page's head. gpui reads a bare number given to
 * `line_height` as a multiplier, so the line heights are px strings.
 */
export const TEXT = 13
export const LINE_HEIGHT = 20
export const LINE = `${LINE_HEIGHT}px`
export const SMALL_TEXT = 12
export const HEAD_TEXT = 15
export const HEAD_LINE = '24px'

/**
 * The spacing scale. Every gap, padding and inset the look draws is one of these steps, so distances repeat and each
 * step is far enough from the next for the eye to tell them apart.
 */
export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const

/** A title to each line under it, and the head's title to its notes. */
export const LINE_GAP = SPACE.xs
/** Text to the buttons under it, one button to the next, and two one-line items in a row, as a subject's later children. */
export const CONTROL_GAP = SPACE.s
/** A heading to what it heads, so it reads as that part's label. */
export const HEAD_GAP = SPACE.m
/** A pill's and a banner's side padding, a row's title to its age, and a nested Status item to the line above, as a subject's first child. */
export const INSET = SPACE.m
/** The panel's padding on every side, and half a section's break on each side of a rule. */
export const EDGE = SPACE.l
/** Two top-level items of the Status page. */
export const ITEM_GAP = SPACE.xl
/** Two sections, such as two groups or two PRs, and the space under the list's last block. */
export const GROUP_GAP = SPACE.xxl
export const END_SPACE = GROUP_GAP

/**
 * Marks hang in a column at the edge, and text after a mark starts at `TEXT_X`. A nested item's mark column starts
 * where its parent's text does.
 */
export const MARK_W = SPACE.xl
export const TEXT_X = EDGE + MARK_W
export const NEST = MARK_W

/** Under this pane width, a PR's number moves from the end of its title line to the start of its status line. */
export const NARROW_PANE = 280

/** A button's and a tab's height, and the corner of a box such as a banner or the goal's input. */
export const BUTTON_H = 28
export const BOX_RADIUS = 10
export const TAB_RADIUS = 6
/** The width of the column that holds a Help key, so each key's words line up. */
export const HELP_KEY_COLUMN = 72
/** The Help control's circle. */
export const HELP_ICON = 20

/** The separator between a status and its reasons, and between a heading and its count. */
export const SEP = ' · '

/** What a paint needs besides the blocks: the theme, the look's handlers, each row's move, and the open field. */
export type Paint = {
  t: Theme
  press: (b: Button, cx: Context) => void
  select: (id: string, cx: Context) => void
  /** Collapses row `id`, or expands and selects it. */
  collapse: (id: string, isCollapsed: boolean, cx: Context) => void
  pick: (tab: ShownTab, cx: Context) => void
  motion: ReadonlyMap<string, RowMotion>
  /** Each block's height without its space, and each row's panel's, by `panelId`, from its last measure. */
  heights: { get: (key: string) => number | undefined }
  /**
   * Whether a block's box takes its height at once in this draw: in the first draw of a tab, the Help page or a session,
   * and after its height changed with its width.
   */
  isAtOnce: (key: string) => boolean
  /** Saves a measured size under `key`, and draws again when its height changed. */
  measure: (key: string, size: { width: number; height: number }, cx: Context) => void
  now: number
  /** The rows whose title is tinted as new, by id, and the tab the look draws. */
  newRows: NewRows
  /** When the look first drew each closed row, which starts its title's tint. */
  closedSeen: ClosedSeen
  tab: ShownTab
  /** The time left each timed button draws, by its id. */
  timeLeft: ReadonlyMap<string, TimeLeft>
  input: (rowId: string) => InputState | null
  /** Whether the pane is under `NARROW_PANE` wide. */
  isNarrow: boolean
  /** The list's height inside its padding, from its last measure, which an empty tab's block fills. Null until measured. */
  listRoom: number | null
}

/** A size callback that keeps what `read` takes from a box's size as `view[key]`, and draws again when that changed. */
export const onSize =
  <V, K extends keyof V>(view: V, key: K, read: (size: { width: number; height: number }) => V[K]) =>
  (size: { width: number; height: number }, cx: Context) => {
    const value = read(size)
    if (value === view[key]) return
    view[key] = value
    cx.notify()
  }
