import type { FoldKind } from '../../types'
import type { Effect } from '../../hooks/press-reducer'
import type { PrPress } from '../../hooks/pr-press'
import type { RowPress } from '../../hooks/presses'
import type { ActionEmphasis } from '../../hooks/rows'
import type { StatusStall } from '../../hooks/status-page'

/**
 * A color the paint maps onto Herdr's theme. The first six are the shared tones of `hooks/tones.ts`, so a tone means
 * the same thing in every look, and needs-you, done and running mean what they do in Herdr's sidebar.
 */
export type Tone = 'needsYou' | 'issue' | 'findings' | 'prs' | 'done' | 'error' | 'running' | 'warning' | 'muted' | null

export type Mark = { text: string; tone: Tone; isRunning: boolean }

/** A change to what the look shows, which no host sees: an unfold, opening Asks at a row, or Help. */
export type ViewChange =
  | { showOptions: string }
  | { closedFold: FoldKind }
  | { earlier: FoldKind }
  | { toggleFold: string }
  | { showAsk: string }
  | { toggleHelp: true }

/**
 * What a button does. `press` goes to the host in a press file. `effects` are what the press opens, copies or
 * refreshes, which the look shows as under way, and runs itself when each one is an open or a copy. `type` opens the
 * row's field with `text` in it and `hint` as its placeholder, `send` sends the field's words, and `leave` closes the field, dropping its draft
 * when `isDiscard`.
 */
export type Does =
  | { is: 'view'; change: ViewChange }
  | { is: 'press'; press: RowPress | PrPress; effects: Effect[] }
  | { is: 'type'; rowId: string; text: string; hint: string }
  | { is: 'send'; rowId: string }
  | { is: 'leave'; rowId: string; isDiscard: boolean }
  | { is: 'nothing' }

/** A button a shared plan lists, as the look draws it. `hotkey` presses it while its row is selected. */
export type Button = {
  id: string
  label: string
  emphasis: ActionEmphasis
  isOut: boolean
  hotkey: string | null
  does: Does
}

export const button = (
  id: string,
  label: string,
  emphasis: ActionEmphasis,
  does: Does = { is: 'nothing' },
  hotkey: string | null = null,
): Button => ({ id, label, emphasis, isOut: false, hotkey, does })

/** The field a row or the goal draws while the person types in it, with its Send or Save, and Cancel or Discard. */
export type Field = { rowId: string; buttons: Button[] }

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
  /** What the selected row shows under its line, in order, each line with the mark that leads it, if any. */
  body: { text: string; tone: Tone; mark?: Mark }[]
  buttons: Button[]
  /** The open reply field, in place of the buttons, or null. */
  field: Field | null
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

/** A PR's title line and the line under it: its rank, number and title, where it stands, and its buttons. */
export type PrBlock = {
  kind: 'pr'
  id: string
  rank: string | null
  number: string
  title: string
  status: { text: string; tone: Tone }
  unlisted: string[]
  error: string | null
  buttons: Button[]
  feedback: { text: string; tone: Tone } | null
}

/** A line with a text and the buttons after it, as the PR order's changed line or the refresh line. */
export type LineBlock = {
  kind: 'line'
  id: string
  text: string | null
  under: string | null
  buttons: Button[]
  feedback: { text: string; tone: Tone } | null
}

export type Block =
  /** A group's title with its count, or with `isLabel` a quiet label over a part, such as the goal's, ruled to its buttons. */
  | {
      kind: 'heading'
      id: string
      text: string
      count: number | null
      mark: Mark | null
      buttons: Button[]
      isLabel: boolean
    }
  /** What a tab shows when it has nothing in it, centred: its title, its hint and its buttons. */
  | { kind: 'empty'; id: string; title: string; hint: string | null; buttons: Button[] }
  | RowBlock
  | StatusLine
  | PrBlock
  | LineBlock
  /** A Closed fold or a Status done fold, which the person opens and shuts. */
  | { kind: 'fold'; id: string; depth: number; text: string; isOpen: boolean; change: ViewChange }
  /** A line that shows more of an open Closed list, as "Show 4 earlier". */
  | { kind: 'more'; id: string; depth: number; text: string; change: ViewChange }
  /** A line of text. `isStrong` is the Status page's head: the goal, or what the session is for. */
  | { kind: 'note'; id: string; text: string; tone: Tone; isStrong: boolean; depth: number }
  /** The goal's field while the person types a goal, in place of the goal's text. */
  | { kind: 'field'; id: string; field: Field }
  | { kind: 'rule'; id: string; text: string | null; isDashed: boolean }
  | { kind: 'gap'; id: string }
