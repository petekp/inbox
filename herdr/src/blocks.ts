import type { FoldKind, PressKind } from '../../types'
import type { BannerView } from '../../core/view/banners'
import type { Feedback } from '../../core/view/feedback'
import type { Effect } from '../../core/view/press-reducer'
import type { PrPress } from '../../core/view/pr-press'
import type { RowPress } from '../../core/domain/presses'
import { DOT, shortAgo } from '../../core/view/rows'
import type { ActionEmphasis } from '../../core/view/rows'
import type { StatusStall } from '../../core/view/status-page'
import type { NameLevel, TextLevel } from '../../core/view/status-page-parts'
import type { PathLine } from '../../core/view/status-path'
import type { EmptyTab, EmptyText } from '../../core/view/empty-tab'
import type { ShownTab } from '../../core/view/tabs'
import type { RowPart } from '../../core/view/row-parts'

/**
 * A color the paint maps onto Herdr's theme. The first ten are the shared tones of `core/view/tones.ts`, so a tone means
 * the same thing in every look, and done means what it does in Herdr's sidebar.
 */
export type Tone =
  | 'needsYou'
  | 'issue'
  | 'findings'
  | 'tasks'
  | 'prs'
  | 'done'
  | 'success'
  | 'opportunity'
  | 'working'
  | 'error'
  | 'notice'
  | 'warning'
  | 'muted'
  | null

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
 * refreshes, which the look shows as under way, and runs itself when each one is an open or a copy. `kind` is the
 * kind of the plan action the button draws, or null for a press that no plan action makes. `type` opens the
 * row's field with `text` in it and `hint` as its placeholder, `send` sends the field's words, and `leave` closes the field, dropping its draft
 * when `isDiscard`.
 */
export type Does =
  | { is: 'view'; change: ViewChange }
  | { is: 'collapse'; id: string; isCollapsed: boolean }
  | { is: 'press'; press: RowPress | PrPress; effects: Effect[]; kind: PressKind | null }
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
  /** A follow-up, which a row draws in one group after its other buttons, so the group wraps to the next line as a unit. */
  isFollowUp?: true
  /** An answer, which the question's tree draws in its place, so the row's button line leaves it out. */
  isOption?: true
  /** When the time this button offers runs out, as Undo's does. It draws the time left as a fill that empties. */
  runsOutAt?: number
  /**
   * A spent Undo, which keeps its place so the row does not change shape. It draws its label muted and takes no press.
   */
  isSpent?: true
  /** When a spent Undo started to leave: it fades out while its place holds, then its place closes. */
  leftAt?: number
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

/** A line under a row's title. */
export type BodyLine = {
  part: BodyPart
  lead?: string
  text: string
  tone: Tone
  tree?: 'trunk' | 'tee' | 'last'
  isOptionNote?: true
  optionId?: string
}

/** The parts of a row the look draws as lines under its title. A PR row's lines are its `detail`. */
type BodyPart = Extract<
  RowPart,
  'holdsUp' | 'context' | 'earlier' | 'detail' | 'file' | 'answer' | 'note' | 'answers' | 'reason'
>

export type RowBlock = {
  kind: 'row'
  id: string
  /** One step in, for a Closed list's lines. A PR's rows stay at 0: their marks hang at the edge under its title. */
  depth: 0 | 1
  mark: Mark | null
  title: string
  age: string | null
  /**
   * The row's press status, or a Closed line's outcome, with the press result it reads when it has one. `aged` is its
   * words and the time its age counts from, for a status that ends with its age, as a PR row's does.
   */
  feedback: { text: string; tone: Tone; source: Feedback | null; aged?: Aged } | null
  /** Shown once the row has closed, until it folds. */
  /** `bar` is the tone of the bar at the row's left edge, or null for a PR, which draws none. */
  settled: { label: string; tone: Tone; tint: 'done' | 'muted' | 'error' | null; at: number } | null
  isDim: boolean
  /** Whether the person can select it to see its body and buttons. */
  isSelectable: boolean
  isSelected: boolean
  /** The person collapsed it, so it draws closed while selected. */
  isCollapsed?: true
  /**
   * The row's lines under its title, each tagged with the part of the row it draws, which places it `partGap` under the
   * part above. `tree` places a line on the tree that hangs from the title's mark: `trunk` passes it, `tee` joins a
   * branch to the trunk, and `last` ends the trunk at the last branch. `isOptionNote` indents an option's note to its
   * button's label. `lead` is an option's label, drawn in the foreground color before `text`, which takes `tone`.
   * `optionId` draws the row's option button of that id in place of text.
   */
  body: BodyLine[]
  buttons: Button[]
  /**
   * Set when the row's answers may sit side by side, as `rowKeyPlan` offers it: the answers' button ids, and the
   * recommendation's reason, which goes on one line under them. The paint draws them so when they fit the row.
   */
  sideBySide?: { optionIds: string[]; recLine: string | null }
  /** The open reply field, in place of the buttons, or null. */
  field: Field | null
  /**
   * The line the row had above its buttons, kept while a press puts its status under them, and when its hold let go,
   * while it leaves. See `holdLinesAbove`.
   */
  heldLine?: { text: string; tone: Tone; isHidden: boolean; leftAt?: number }
  /** Draws the status under the buttons, where the shared rule puts it above them. See `holdLinesAbove`. */
  isStatusHeldUnder?: true
}

/** A status's words and the time its age counts from. */
export type Aged = { lead: string; at: number }

/** A row drawn open, with its title wrapped and its panel under it. */
export const isOpenRow = (r: RowBlock): boolean => r.isSelected && !r.isCollapsed

/** A status that ends with its age: its words, then how long ago its time was. */
export const agedText = (a: Aged, now: number): string => `${a.lead}${DOT}${shortAgo(now - a.at)}`

/**
 * The goal's path beside a Status block, in the milestones' mark column. Beside a milestone, `above` runs through the
 * space above it into its mark, and `below` from under its mark to its end. Beside a milestone's work, `line` runs its
 * whole height.
 */
export type PathSide = { is: 'milestone'; above: PathLine; below: PathLine } | { is: 'work'; line: PathLine }

/**
 * A stroke of a nesting connector beside a Status block, in the column under the marks of rows at `depth`. `down` runs
 * from under the block's own mark to its end. `mid` runs the block's whole height with an arm to its mark, and `last`
 * runs down to that arm and ends there. `past` runs the whole height with no arm. `arm` is the arm alone, where the
 * path's line is the column.
 */
export type TreeStroke = { depth: number; is: 'down' | 'mid' | 'last' | 'past' | 'arm' }

/** A line of the Status page: a subject, a milestone or a child, with its mark, name, stall word and lines under it. */
export type StatusLine = {
  kind: 'status'
  id: string
  depth: number
  mark: Mark | null
  name: string
  isBold: boolean
  /**
   * The name's level: muted for a child, a plain line or a milestone that waits or was dropped, faint once its row is
   * done (✓), else plain.
   */
  nameLevel: NameLevel
  stall: { text: string; tone: StatusStall['tone'] } | null
  /** What a subject waits on, in the needs-you tone, as its first line under the name. */
  waitsOn?: string
  /**
   * A Help line's words, in the column that starts after `HELP_COLUMN`. The left column holds the line's key, in `name`, or
   * its mark, or nothing for the version line. Such a line has nothing under it.
   */
  does?: string
  /**
   * A parent's fold: its chevron after its name and stall, and the count of rows it hides while folded, both at `level`,
   * and the press that folds its rows away or opens them, which the whole name line takes.
   */
  fold?: { isFolded: boolean; count: number; level: TextLevel; toggle: Button }
  /** Lines under the name, each at its text level: where it stands, what it merged, the plan it replaced. */
  under: { text: string; level: TextLevel }[]
  buttons: Button[]
  path?: PathSide
  tree?: TreeStroke[]
  /** In a Status list, the space from the line above, from `statusGaps`. */
  gapAbove?: number
}

/** A PR's title line and the line under it: its number and title, where it stands, and its buttons. */
export type PrBlock = {
  kind: 'pr'
  id: string
  number: string
  title: string
  /** Null while the PR reads ready from a view that is not fresh: `shownReadiness`. */
  status: { text: string; tone: Tone } | null
  unlisted: string[]
  error: string | null
  buttons: Button[]
  feedback: { text: string; tone: Tone } | null
}

/**
 * What an empty tab draws under its text, centred: Refresh PRs's line, or the goal's buttons and its field. `id` is the
 * row the presses belong to, whose line a press out reads in `feedback`.
 */
type EmptyUnderParts = {
  id: string
  text: string | null
  buttons: Button[]
  feedback: { text: string; tone: Tone } | null
  field: Field | null
}

/** A tab's empty state from `emptyTab`, as the one block that draws it, with its `under` drawn as `parts`. */
export function emptyBlock(tab: ShownTab, empty: EmptyTab, parts: EmptyUnderParts | null = null): Block {
  return {
    kind: 'empty',
    id: `empty ${tab}`,
    empty: { title: empty.title, hint: empty.hint },
    titleMark: empty.titleMark,
    under: parts,
  }
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
  /**
   * A group's title with its count, or with `isLabel` a quiet label over a part, such as the goal's, ruled to its
   * buttons. A label's `mark` hangs in the mark column, and the label takes the mark's tone.
   */
  | {
      kind: 'heading'
      id: string
      text: string
      count: number | null
      mark: Mark | null
      buttons: Button[]
      isLabel: boolean
      /** Muted monospace text at the heading's right end, such as Help's inbox version. */
      aside?: string
    }
  /** What a tab shows when it has nothing in it, centred: the text `emptyTab` gives, then its `under`, drawn. */
  | {
      kind: 'empty'
      id: string
      empty: EmptyText
      titleMark: EmptyTab['titleMark']
      under: EmptyUnderParts | null
    }
  | RowBlock
  | StatusLine
  | PrBlock
  | LineBlock
  /**
   * A Closed fold or a Status done fold, which the person opens and shuts, with its chevron after its label. A done
   * milestone folded to its name also draws its `mark` in the mark column; any other fold starts at the text column.
   */
  | {
      kind: 'fold'
      id: string
      depth: number
      text: string
      isOpen: boolean
      change: ViewChange
      /** Other work's counts fold: its words are drawn as `label`, then each mark in its tone with its count. `text` still names it. */
      counts?: { label: string; items: { mark: Mark; text: string }[] }
      /** The label's level: muted, or faint for a done milestone folded to its name. */
      level?: TextLevel
      mark?: Mark
      path?: PathSide
      tree?: TreeStroke[]
      gapAbove?: number
    }
  /** A line that shows more of an open Closed list, as "Show 4 earlier". */
  | { kind: 'more'; id: string; depth: number; text: string; change: ViewChange }
  /**
   * A line of text. `isHead` keeps it close to the head's other lines, as the Status page's head does. `isAtEdge` starts it
   * at the panel's edge, not where rows' text starts. `isStrong` draws it
   * as the head's title: the goal, or what the session is for.
   */
  | {
      kind: 'note'
      id: string
      text: string
      tone: Tone
      /** Faint draws the text at the faint level in place of its tone's color, as a Prev line. */
      level?: TextLevel
      isHead: boolean
      isAtEdge: boolean
      isStrong: boolean
      depth: number
      /** Buttons drawn after the text on its last line, or under it when they do not fit. */
      buttons?: Button[]
      path?: PathSide
      tree?: TreeStroke[]
      gapAbove?: number
    }
  /**
   * The goal's field while the person types a goal, in place of the goal's text: at the panel's edge, or at the text
   * column under a met goal's label.
   */
  | { kind: 'field'; id: string; field: Field; isAtEdge: boolean }
  /** A rule between two groups or two PRs, or with `text`, the label of the Status part that follows, such as Other work. With `isTitle`, the label is the head's title, in the foreground color and semibold. */
  | { kind: 'rule'; id: string; text: string | null; isTitle?: true }
  /** A section's space above the block after it, or with `isMilestoneStep` the smaller space between two milestones. */
  | { kind: 'gap'; id: string; isMilestoneStep?: true }
  /** A muted line at the edge that names the blocks under it, as Other PRs. */
  | { kind: 'caption'; id: string; text: string }
  /** A message in the list, as the PRs tab's GitHub notice, with the buttons that act on its problem at its end. */
  | { kind: 'banner'; id: string; banner: BannerView; buttons: Button[]; feedback: { text: string; tone: Tone } | null }
