import type {
  ElementConstructor,
  Elements,
  InputProps,
  RenderElement,
  RenderInput,
  RenderSurface,
  UiPressArgument,
} from 'claude-code'
import type { Draft, FoldKind, LastAction, PrViews, RowNote, Stop, Tab, Turns } from '../types'
import type { AnswerRow, DrawnEntry, DrawnLists } from './action-plan'
import type { statusSelected } from './status-keys'
import type { PressState } from './feedback'
import type { helpKeys } from './help'
import type { Action, KeyAction } from './pane-keys'
import type { settledLayoutId } from './pane-selection'
import type { RowPress } from './presses'
import type { PrPress } from './pr-press'
import type { prBlockRows, threadSentIn } from './pr-rows'
import type { RowPart } from './row-parts'
import type { ModLook, NEEDS_YOU_GROUPS, RowView } from './rows'
import type { SessionView } from './session-view'
import type { ShownTab, shownTabs } from './tabs'
import type { TerminalSpan } from './terminal-text'
import type { paletteFor, Tone } from './palettes'

type PaneElements = Elements[RenderSurface]

export type PaneClient =
  | { hasClient: true; elements: Extract<PaneElements, { Client: unknown }> }
  | { hasClient: false; elements: PaneElements }

export type Row = {
  id: string
  /**
   * Set on an Asks or Finds row. The terminal draws it with no mark column, so its text starts at the tree's arm, and
   * its result mark before its result. Desktop draws its result mark in the mark column.
   */
  view?: RowView
  handle: string
  /** A Button takes no color, so this handle is Text and only the row's text selects it. */
  handleTone?: Tone
  /** Desktop draws its running dot in place of `handle`. The terminal's `handle` is already the frame. */
  isHandleRunning?: boolean
  /** A PR row's mark says its work is done. */
  isMarkDone?: boolean
  title: string
  titleAfter?: string
  at?: number
  subtitle?: JSX.Element
  line?: { before?: string; text: string; after?: string; afterTone?: Tone; age?: string }
  body?: JSX.Element | null
  /** The last part `body` draws, where it is a finding's file. A body is otherwise one `detail` part. */
  bodyEnd?: Extract<RowPart, 'detail' | 'file'>
  clippedBody?: (lines: number, width: number) => JSX.Element | null
  /** The body as the terminal draws it in `width` cells, for a body whose lines depend on the width. */
  bodyAt?: (width: number) => JSX.Element
  /** The answers, which the question's tree draws. */
  optionKeys?: () => KeyAction[]
  /** Whether the answers may sit side by side, as `rowKeyPlan` offers it. */
  answerRow?: () => AnswerRow | null
  keys: () => KeyAction[]
  moreKeys?: () => KeyAction[]
  typeHint?: string
  fold?: { note?: string }
}
export type Entry = DrawnEntry<Row>

/** What the Pane render computed before it draws. */
export type PaneBase = {
  e: RenderInput<'Pane'>
  Box: PaneElements['Box']
  Button: PaneElements['Button']
  Text: PaneElements['Text']
  Link: PaneElements['Link']
  Markdown: PaneElements['Markdown']
  Input: ElementConstructor<InputProps> | null
  look: ModLook
  isNarrowDesktop: boolean
  isAgeInSide: boolean
  isAgeDropped: boolean
  glued: (after: string) => string
  isInline: boolean
  blankLine: 0 | 1
  space: { rowPad: number; settledPad: number; buttonGap: number; isFoldGapped: boolean }
  prState: PrViews
  lastActions: Record<string, LastAction>
  notes: Record<string, RowNote>
  turns: Turns
  stop: Stop | null
  view: SessionView
  isUnread: boolean
  now: number
  typing: string | null
  drafts: Record<string, Draft>
  unfolded: FoldKind[]
  /** The Closed folds whose earlier lines the person opened. */
  closedAll: FoldKind[]
  statusUnfolded: string[]
  isHelpShown: boolean
  optionsShown: string[]
  termProgram: string | undefined
  tab: Tab
  shownTab: ShownTab
  tabList: ReturnType<typeof shownTabs>
  settledLayout: ReturnType<typeof settledLayoutId>
  pal: ReturnType<typeof paletteFor>
  inlineText: (text: string) => RenderElement[]
  terminalText: (lines: TerminalSpan[][]) => (string | RenderElement)[]
  raise: { color?: string; dimColor: boolean; backgroundColor: string; inverse: boolean }
  raiseEdge: { dimColor: boolean; color: string; inverse: boolean }
  isThreadSent: ReturnType<typeof threadSentIn>
  presses: PressState
  lists: DrawnLists<Row>
  needsYouGroups: ((typeof NEEDS_YOU_GROUPS)[number] & { entries: DrawnEntry<Row>[]; rows: Row[] })[]
  findingEntries: DrawnEntry<Row>[]
  prGroups: (SessionView['prs']['drawn'][number] & ReturnType<typeof prBlockRows<Row>>)[]
  prOrderKeys: KeyAction[]
  prRefreshKeys: KeyAction[]
  prClearKeys: KeyAction[]
  badgeOf: (id: ShownTab) => string | null
  tabTone: (id: ShownTab) => string | undefined
  tabText: (id: ShownTab, name: string) => string
  hasRail: boolean
  railWidth: number
  listColumns: number
  indexOf: Map<string, number>
  /** The cursor's index. Its row draws open unless the person collapsed it. */
  at: number
  collapsed: ReadonlySet<string>
  isOpenGuarded: boolean
  statusKeyRow: ReturnType<typeof statusSelected>
  shownError: string | null
  lineNote: RowNote | undefined
  keyList: ReturnType<typeof helpKeys>
  keyColumn: number
}

/** The render's calls that need `$`, each a function the hooks module builds around it. */
export type PaneHandlers = {
  rowKeyActions: (
    r: RowView,
    isAllShown: boolean,
  ) => { options: KeyAction[]; keys: KeyAction[]; more: KeyAction[]; answerRow: AnswerRow | null }
  unlessGuarded: (rowId: string, press: UiPressArgument, onPress: Action['onPress']) => Promise<void>
  sendDraft: (id: string, surface: UiPressArgument['surface']) => Promise<void>
  discardReply: (id: string) => Promise<void>
  startTyping: (id: string, seed?: string) => Promise<void>
  selectStatusRow: (id: string, focusKey?: string) => Promise<void>
  sendTyped: (id: string, text: string, surface: UiPressArgument['surface']) => Promise<void>
  select: (tab: Tab, id: string, index: number) => Promise<void>
  /** A click on a row's title: it opens a closed row, and collapses or expands the open one. */
  pressTitle: (id: string) => Promise<void>
  showTab: (tab: ShownTab) => Promise<void>
  runPress: (p: RowPress | PrPress, surface: UiPressArgument['surface']) => Promise<void>
  readAgain: () => Promise<void>
  resume: () => Promise<void>
  showAsk: (askId: string) => Promise<void>
  updateTyping: (fn: (typing: string | null) => string | null) => Promise<unknown>
  updateDrafts: (fn: (drafts: Record<string, Draft>) => Record<string, Draft>) => Promise<unknown>
  updateHelpShown: (fn: (isShown: boolean) => boolean) => Promise<unknown>
  updateUnfolded: (fn: (unfolded: FoldKind[]) => FoldKind[]) => Promise<unknown>
  updateStatusUnfolded: (fn: (unfolded: string[]) => string[]) => Promise<unknown>
  /** Folds the Status parent `id` by its name, or opens it. */
  toggleParent: (id: string) => Promise<unknown>
  updateClosedAll: (fn: (closedAll: FoldKind[]) => FoldKind[]) => Promise<unknown>
}
