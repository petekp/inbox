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
  | 'blocked'
  | 'done'
  | 'working'
  | 'ansi1'
  | 'ansi5'
  | 'ansi6',
  Color
>

/**
 * Needs-you, done and running take the colors Herdr's sidebar gives an agent that is blocked, done or working.
 * Findings, PRs and errors take the theme's magenta, cyan and red, as the terminal look takes its theme's.
 */
const TONE_COLORS: Record<Exclude<Tone, null>, keyof Theme> = {
  needsYou: 'blocked',
  issue: 'blocked',
  warning: 'blocked',
  findings: 'ansi5',
  prs: 'ansi6',
  done: 'done',
  running: 'working',
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
 * The look's text sizes and line heights, as the Codex tab's: text, the status line, and the Status page's head. gpui
 * reads a bare number given to `line_height` as a multiplier, so the line heights are px strings.
 */
export const TEXT = 13
export const LINE = '20px'
export const SMALL_TEXT = 12
export const HEAD_TEXT = 15
export const HEAD_LINE = '22px'

/** Where a row's mark column starts and its text starts, and the space at the right edge, as in the Codex tab. */
export const MARK_X = 18
export const TEXT_X = 44
export const EDGE_X = 14

/** What a paint needs besides the blocks: the theme, the look's handlers, each row's move, and the open field. */
export type Paint = {
  t: Theme
  press: (b: Button, cx: Context) => void
  select: (id: string, cx: Context) => void
  pick: (tab: ShownTab, cx: Context) => void
  motion: ReadonlyMap<string, RowMotion>
  input: (rowId: string) => InputState | null
}
