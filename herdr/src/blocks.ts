import type { FoldKind } from '../../types'
import type { ActionEmphasis } from '../../hooks/rows'
import type { StatusStall } from '../../hooks/status-page'

/** A color the paint maps onto Herdr's theme, so a tone means the same thing in the look and in Herdr's sidebar. */
export type Tone = 'needsYou' | 'issue' | 'done' | 'running' | 'error' | 'warning' | 'muted' | 'dim' | null

export type Mark = { text: string; tone: Tone; isRunning: boolean }

/** A press the look answers itself, with no host. Every other button waits for presses. */
type LocalPress = { showOptions: string } | { closedFold: FoldKind } | { earlier: FoldKind } | { toggleFold: string }

/** A button a shared plan lists, as the look draws it. */
export type Button = {
  id: string
  label: string
  emphasis: ActionEmphasis
  isOut: boolean
  local: LocalPress | null
}

export const button = (
  id: string,
  label: string,
  emphasis: ActionEmphasis,
  local: LocalPress | null = null,
): Button => ({
  id,
  label,
  emphasis,
  isOut: false,
  local,
})

export type RowBlock = {
  kind: 'row'
  id: string
  /** One step in, for a Closed list's lines. */
  depth: 0 | 1
  mark: Mark | null
  title: string
  age: string | null
  /** The row's press status, or a Closed line's outcome. */
  feedback: { text: string; tone: Tone } | null
  /** Shown once the row has closed, until it folds. */
  settled: { label: string; tone: Tone } | null
  isDim: boolean
  /** Whether the person can select it to see its body and buttons. */
  isSelectable: boolean
  isSelected: boolean
  /** What the selected row shows under its line, in order. */
  body: { text: string; tone: Tone }[]
  buttons: Button[]
}

/** A line of the Status page: a subject, a milestone or a child, with its mark, name, stall word and lines under it. */
export type StatusLine = {
  kind: 'status'
  id: string
  depth: number
  mark: Mark | null
  name: string
  isBold: boolean
  stall: { text: string; tone: StatusStall['tone'] } | null
  /** Lines under the name, dim: where it stands, what it merged, the plan it replaced. */
  under: string[]
  buttons: Button[]
}

export type Block =
  | { kind: 'heading'; id: string; text: string; count: number | null; mark: Mark | null; buttons: Button[] }
  | RowBlock
  | StatusLine
  /** A Closed fold or a Status done fold, which the person opens and shuts. */
  | { kind: 'fold'; id: string; depth: number; text: string; isOpen: boolean; local: LocalPress }
  /** A line that shows more of an open Closed list, as "Show 4 earlier". */
  | { kind: 'more'; id: string; depth: number; text: string; local: LocalPress }
  | { kind: 'note'; id: string; text: string; tone: Tone; isStrong: boolean; depth: number }
  | { kind: 'rule'; id: string; text: string | null; isDashed: boolean }
  | { kind: 'gap'; id: string }
