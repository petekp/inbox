import { DARK_TONES, faintOver, LIGHT_TONES, supportingOver } from '../../core/view/tones'
import { isSupportingPart } from '../../core/view/row-parts'
import type { RowPart } from '../../core/view/row-parts'
import {
  BUTTON_BORDER_PT,
  BUTTON_PAD_X_PT,
  CHILD_GAP_PT,
  CONTROL_GAP_PT,
  EDGE_PT,
  HEAD_GAP_PT,
  LIST_MARGIN_PT,
  INSIDE_GAP_PT,
  ITEM_GAP_PT,
  LINE_PT,
  LIST_GAP_PT,
  MARK_PT,
  SECTION_GAP_PT,
  SPACE_UNIT,
} from '../../core/view/layout'
import type { ClosedSeen, NewRows } from '../../core/view/arrivals'
import type { Context } from 'gpui-kit'
import type { InputState } from 'gpui-base'
import type { ShownTab } from '../../core/view/tabs'
import type { Button, Tone } from './blocks'
import type { RowMotion } from './motion'
import type { TimeLeft } from './time-left'
import type { HeldFades } from './held-fades'

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
 * Warnings take the theme's yellow. Needs-you takes the shared orange of `core/view/tones.ts`, as tasks take the shared violet,
 * so a question's mark does not read as a warning. Findings, PRs and errors take
 * its magenta, cyan and red, and a notice its blue, as the terminal look takes its theme's. An issue takes the red
 * of an error. Done takes the color Herdr's sidebar gives an agent that is done. A met goal and a ready PR take the success
 * green, as an opportunity does: the theme's green, which each theme picks to read on its own background. A working mark takes the
 * theme's text color.
 */
const TONE_COLORS: Record<Exclude<Tone, 'tasks' | 'needsYou' | null>, keyof Theme> = {
  issue: 'ansi1',
  notice: 'ansi4',
  warning: 'ansi3',
  findings: 'ansi5',
  prs: 'ansi6',
  done: 'done',
  success: 'ansi2',
  opportunity: 'ansi2',
  working: 'foreground',
  error: 'ansi1',
  muted: 'muted',
}

const isLightTheme = (t: Theme) => {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(t.background.slice(at, at + 2), 16))

  return (r! * 299 + g! * 587 + b! * 114) / 1000 > 128
}

/** Tasks and needs-you take the shared violet and orange of `core/view/tones.ts`, which no Herdr theme names, in the light or dark form the theme's background calls for. */
export const colorOf = (t: Theme, tone: Tone): Color =>
  tone === 'tasks' || tone === 'needsYou'
    ? ((isLightTheme(t) ? LIGHT_TONES : DARK_TONES)[tone] as Color)
    : t[tone === null ? 'foreground' : TONE_COLORS[tone]]

/**
 * The faint text level in `t`: its muted color, made opaque, faded toward its background, as `faintOver` gives it. Over
 * `under`, laid over the background, where the text sits in a box with a translucent color of its own, as a selected
 * row's, the way `lineColor` draws a connector there.
 */
export function faintOf(t: Theme, under: Theme[keyof Theme] = t.background): Color {
  const page = flatten(under, t.background)

  return faintOver(flatten(t.muted, page), page) as Color
}

/**
 * The supporting text level in `t`: its muted color moved toward its text color, as `supportingOver` gives it, both
 * made opaque over `under` laid over the background, as `faintOf` takes it.
 */
function supportingOf(t: Theme, under: Theme[keyof Theme] = t.background): Color {
  const page = flatten(under, t.background)

  return supportingOver(flatten(t.muted, page), flatten(t.foreground, page)) as Color
}

/** A line's text color under a row's title: the supporting level for a part `isSupportingPart` names, else its tone. */
export const bodyTextColor = (t: Theme, l: { part?: RowPart; tone: Tone }, under: Theme[keyof Theme]): Color =>
  l.part && isSupportingPart(l.part) ? supportingOf(t, under) : colorOf(t, l.tone)

/** A theme color at a share of its strength, for a banner's fill and border. Tone colors are opaque `#rrggbb`. */
export const tint = (c: Color, share: number): Color =>
  `${c.slice(0, 7)}${Math.round(share * 255)
    .toString(16)
    .padStart(2, '0')}` as Color

const TIME_LEFT_DARK_SHARE = 0.12
const TIME_LEFT_LIGHT_SHARE = 0.2

/** The fill of a timed button's time left: the text color at the share that shows on the theme's background, as the Codex tab's Undo does in dark. */
export const timeLeftFillOf = (t: Theme): Color =>
  tint(t.foreground, isLightTheme(t) ? TIME_LEFT_LIGHT_SHARE : TIME_LEFT_DARK_SHARE)

/** `c` laid over `under` at `c`'s own alpha, as one opaque color. A theme's `selected` and `hover` are translucent. */
export function flatten(c: Color, under: Color): Color {
  const alpha = c.length > 7 ? parseInt(c.slice(7, 9), 16) / 255 : 1

  return alpha === 1 ? (c.slice(0, 7) as Color) : mixInto(c.slice(0, 7) as Color, under, alpha)
}

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
export const LINE_HEIGHT = LINE_PT
export const LINE = `${LINE_HEIGHT}px`
export const HEAD_TEXT = 15
export const HEAD_LINE = '24px'

/**
 * The spacing roles, each a step of the shared scale in `core/view/layout.ts`, so every look spaces its blocks alike. The
 * vertical gaps rise from `INSIDE_GAP` to `SECTION_GAP`, so space shows what belongs together.
 */
/** A title to each line under it, and the head's title to its notes. */
export const INSIDE_GAP = INSIDE_GAP_PT
/** Two one-line items of a list, as a subject's later children or two Help lines. */
export const LIST_GAP = LIST_GAP_PT
/** Two Status items nested under one parent, when either has more than one line, and the parts of a question's tree. */
export const CHILD_GAP = CHILD_GAP_PT
/** Two Status items when either has more than one line. */
export const ITEM_GAP = ITEM_GAP_PT
/** A heading to what it heads, so it reads as that part's label. */
export const HEAD_GAP = HEAD_GAP_PT
/** A list's rows to its group's title above and its Closed fold below, from the title's line or to the fold's label. */
export const LIST_MARGIN = LIST_MARGIN_PT
/** Text to the buttons under it, and one button to the next. */
export const CONTROL_GAP = CONTROL_GAP_PT
/** Two sections, such as two groups or two PRs. A rule between them sits halfway. */
export const SECTION_GAP = SECTION_GAP_PT
/** The panel's padding on every side. */
export const EDGE = EDGE_PT
/** A chevron to the words before it, one tab to the next, and a tree's arm to the mark it points at. */
export const SMALL_GAP = SPACE_UNIT
/** A tab's and a banner's side padding, and a row's title to its age. */
export const INSET = 3 * SPACE_UNIT
export const BUTTON_PAD_X = BUTTON_PAD_X_PT
/** A pill button's label, in from the button's edge: its border and its side padding. */
export const BUTTON_LABEL_X = BUTTON_BORDER_PT + BUTTON_PAD_X
/** The space under the list's last block, around an empty tab's words, the list's bottom fade and a labelled rule's shortest line. */
export const END_SPACE = 2 * EDGE

/**
 * Marks hang in a column at the edge, and text after a mark starts at `TEXT_X`. A nested item's mark column starts
 * where its parent's text does.
 */
export const MARK_W = MARK_PT
export const TEXT_X = EDGE + MARK_W
export const NEST = MARK_W

/** Under this pane width, a PR's number moves from the end of its title line to the start of its status line. */
const NARROW_PANE = 280

/** A button's and a tab's height, and the corner of a box such as a banner or the goal's input. */
export const BUTTON_H = 7 * SPACE_UNIT
/** A pill's label, down from its border, so one line of it fills `BUTTON_H` and each wrapped line adds a line's height. */
export const BUTTON_PAD_Y = (BUTTON_H - LINE_HEIGHT) / 2 - BUTTON_BORDER_PT
export const BOX_RADIUS = 10
export const TAB_RADIUS = 6
/** Help's keys and marks sit one nesting step under their section titles, as a nested Status item's marks do. */
export const HELP_INDENT = NEST
/** The widest key Help draws, "← →", is about 28 px wide, and 4 px more leave room for a font that draws it wider. */
const HELP_KEY_W = 32
/** The width of Help's left column, which holds a key or a mark, so every line's words start at one x: the widest key and `CONTROL_GAP`. */
export const HELP_COLUMN = HELP_KEY_W + CONTROL_GAP
/** The Help control's circle, about the size of the Codex tab's and the desktop pane's. */
export const HELP_ICON = 14
/** The question mark inside the Help control's circle. */
export const HELP_ICON_TEXT = 10

/** The separator between a status and its reasons, and between a heading and its count. */
export const SEP = ' · '

/** What a paint needs besides the blocks: the theme, the look's handlers, each row's move, and the open field. */
export type Paint = {
  t: Theme
  /** The theme's code font. */
  mono: string
  /** `isAll` is set while Option is held, which folds or opens every fold of the tab when the button is a fold. */
  press: (b: Button, cx: Context, isAll?: boolean) => void
  select: (id: string, cx: Context) => void
  /** Collapses row `id`, or expands and selects it. */
  collapse: (id: string, isCollapsed: boolean, cx: Context, isAll?: boolean) => void
  pick: (tab: ShownTab, cx: Context) => void
  motion: ReadonlyMap<string, RowMotion>
  /** Each block's height without its space, and each row's panel's, by `panelId`, from its last measure. */
  heights: { get: (key: string) => number | undefined; widthOf: (key: string) => number | undefined }
  /**
   * Whether a block's box takes its height at once in this draw: in the first draw of a tab, the Help page or a session,
   * and after its height changed with its width.
   */
  isAtOnce: (key: string) => boolean
  /** Saves a measured size under `key`, and draws again when its height changed, or with `isWidthDrawn` its width. */
  measure: (key: string, size: { width: number; height: number }, cx: Context, isWidthDrawn?: boolean) => void
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
  /** The width of a top-level row's text column, from the text's left edge to the pane's padding. */
  rowTextRoom: number
  /** The look's fades, held across draws so that gpui-kit gets no delay. */
  fades: HeldFades
}

/**
 * Whether the pane is narrow and the list's room, at zoom 1, from the pane's width and the list's height as the app
 * reported them, which its zoom has already scaled.
 */
export const paneFit = (reported: { paneWidth: number; listHeight: number | null }, zoom: number) => ({
  isNarrow: reported.paneWidth / zoom < NARROW_PANE,
  listRoom: reported.listHeight === null ? null : Math.max(0, reported.listHeight / zoom - EDGE - END_SPACE),
  rowTextRoom: Math.max(0, reported.paneWidth / zoom - TEXT_X - EDGE),
})

/** A size callback that keeps what `read` takes from a box's size as `view[key]`, and draws again when that changed. */
export const onSize =
  <V, K extends keyof V>(view: V, key: K, read: (size: { width: number; height: number }) => V[K]) =>
  (size: { width: number; height: number }, cx: Context) => {
    const value = read(size)
    if (value === view[key]) return
    view[key] = value
    cx.notify()
  }
