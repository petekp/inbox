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
  | 'hover'
  | 'selected'
  | 'solid'
  | 'solid_foreground'
  | 'muted'
  | 'dim'
  | 'blocked'
  | 'done'
  | 'working'
  | 'ansi1',
  Color
>

const TONE_COLORS: Record<Exclude<Tone, null>, keyof Theme> = {
  needsYou: 'blocked',
  issue: 'blocked',
  warning: 'blocked',
  done: 'done',
  running: 'working',
  error: 'ansi1',
  muted: 'muted',
  dim: 'dim',
}

export const colorOf = (t: Theme, tone: Tone): Color => t[tone === null ? 'foreground' : TONE_COLORS[tone]]

/** What a paint needs besides the blocks: the theme, the look's handlers, each row's move, and the open field. */
export type Paint = {
  t: Theme
  press: (b: Button, cx: Context) => void
  select: (id: string, cx: Context) => void
  pick: (tab: ShownTab, cx: Context) => void
  motion: ReadonlyMap<string, RowMotion>
  input: (rowId: string) => InputState | null
}
