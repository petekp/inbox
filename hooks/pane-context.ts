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
import type { DrawnEntry, DrawnLists } from './action-plan'
import type { statusSelected } from './status-keys'
import type { PressState } from './feedback'
import type { helpKeys } from './help'
import type { Action, KeyAction } from './pane-keys'
import type { settledLayoutId } from './pane-selection'
import type { RowPress } from './presses'
import type { PrPress } from './pr-press'
import type { threadSentIn } from './pr-rows'
import type { ModLook, NEEDS_YOU_GROUPS, RowView } from './rows'
import type { SessionView } from './session-view'
import type { ShownTab, shownTabs } from './tabs'
import type { TerminalSpan } from './terminal-text'
import type { footerStatus } from './view'
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
  hasSecondLine?: boolean
  body?: JSX.Element | null
  clippedBody?: (lines: number, width: number) => JSX.Element | null
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
  unbroken: (after: string, title: string, fits: (text: string) => boolean) => string
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
  unfolded: FoldKind[]
  foldHover: FoldKind | null
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
  prGroups: (SessionView['prs']['drawn'][number] & { checks: Row[]; threads: Row[]; rows: Row[] })[]
  prTabKeys: KeyAction[]
  prOrderKeys: KeyAction[]
  badgeOf: (id: ShownTab) => string | null
  tabTone: (id: ShownTab) => string | undefined
  tabText: (id: ShownTab, name: string) => string
  hasRail: boolean
  railWidth: number
  listColumns: number
  indexOf: Map<string, number>
  at: number
  isOpenGuarded: boolean
  statusKeyRow: ReturnType<typeof statusSelected>
  shownStatus: ReturnType<typeof footerStatus>
  status: string
  lineNote: RowNote | undefined
  keyList: ReturnType<typeof helpKeys>
  keyColumn: number
}

/** The render's calls that need `$`, each a function the hooks module builds around it. */
export type PaneHandlers = {
  rowKeyActions: (r: RowView, isAllShown: boolean) => { keys: KeyAction[]; more: KeyAction[] }
  unlessGuarded: (rowId: string, press: UiPressArgument, onPress: Action['onPress']) => Promise<void>
  sendDraft: (id: string, surface: UiPressArgument['surface']) => Promise<void>
  discardReply: (id: string) => Promise<void>
  startTyping: (id: string, seed?: string) => Promise<void>
  selectStatusRow: (id: string) => Promise<void>
  sendTyped: (id: string, text: string, surface: UiPressArgument['surface']) => Promise<void>
  select: (tab: Tab, id: string, index: number) => Promise<void>
  showTab: (tab: ShownTab) => Promise<void>
  runPress: (p: RowPress | PrPress, surface: UiPressArgument['surface']) => Promise<void>
  readAgain: () => Promise<void>
  resume: () => Promise<void>
  showAsk: (askId: string) => Promise<void>
  updateTyping: (fn: (typing: string | null) => string | null) => Promise<unknown>
  updateDrafts: (fn: (drafts: Record<string, Draft>) => Record<string, Draft>) => Promise<unknown>
  updateHelpShown: (fn: (isShown: boolean) => boolean) => Promise<unknown>
  updateUnfolded: (fn: (unfolded: FoldKind[]) => FoldKind[]) => Promise<unknown>
}
