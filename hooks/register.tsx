import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  SessionAppendMessage,
  Timer,
  UiCopyResult,
  RenderSurface,
  UiPressArgument,
  UiScrollBlock,
  UiScrollResult,
} from 'claude-code'

import type {
  Cursor,
  Closed,
  DemoCopy,
  Dialog,
  Draft,
  FoldKind,
  Item,
  Ledger,
  PrCheck,
  PrThread,
  PrView,
  PrViews,
  LastAction,
  PressKind,
  RowNote,
  Stop,
  Tab,
} from '../types'
import {
  NO_SESSION,
  PRESENT,
  arrived,
  askLedgerModel,
  changeSession,
  conversation,
  currentOwner,
  deliver,
  forgetStored,
  isCurrent,
  noteStored,
  readSaved,
  readSettled,
  replaceDrawn,
  savedWriteCount,
  sessionHost,
  upgradeDrawn,
} from './claude-host'
import type { Owner, SavedRecord } from './claude-host'
import {
  cleared,
  commandFindings,
  emptySession,
  endTurn,
  forkedFrom,
  noteActivity as noteTurnActivity,
  pressOn,
  recordPrompt,
  recorded,
  sessionView,
  startTurn,
  upgradeSession,
  withNewPrRefs,
} from './session'
import type { SentBy, Session } from './session'
import { fetchPrs as fetchSessionPrs, runUpdates, startPress, wakeForDone as wakeSessionForDone } from './session-host'
import type { CatchUpReply, SessionHost } from './session-host'
import { demoView, isDemoCopy, upgradeDemoCopy } from './demo'
import type { Exchange, Press, Update } from './ledger'
import {
  applyPrPress,
  checkActions,
  checkRunText,
  drawnPrs,
  fetchTracked,
  isDismissing,
  isTracked,
  olderPrsText,
  PR_GROUP_TITLES,
  PR_TONES,
  prBlockActions,
  prCheckId,
  prMarkId,
  prRowId,
  prRowWaits,
  prThreadId,
  threadActions,
  threadRowText,
  threadSentIn,
  GH_MISSING_TEXT,
  prsEmptyHint,
} from './pr-tab'
import type { Applied, GhRun, PrAction, PrPress } from './pr-tab'
import {
  commentLine,
  commentParts,
  failingChecks,
  prRefs,
  prNeedsYou,
  readableComment,
  readiness,
  threadWhere,
  waitingThreads,
} from './prs'
import {
  EMPTY,
  KEPT_SESSIONS,
  applyExchangeUpdate,
  closeItem,
  closedState,
  readKind,
  tasksRunBy,
  upgradeLedger,
} from './ledger'
import {
  addActivity,
  buildPrompt,
  cardCarryText,
  catchUpPrompt,
  CLAUDE_CODE,
  dialogActivity,
  dialogQuestions,
  guidedCloseDescription,
  promptNotes,
  screenText,
  systemText,
  toolActivity,
  transcriptCatchUpPrompt,
  TOLD_NOTHING,
  type Told,
} from './model-text'
import {
  commandRowLine,
  dialogOutcome,
  resetTime,
  readCommandRow,
  statusLine,
  stopKindOf,
  stopOfMessage,
  transcriptText,
  TURN_BOX_TOOL,
  turnBoxText,
} from './claude'
import { ago } from './text'
import {
  applyPress,
  baseName,
  capitalized,
  clipLabel,
  demoAfterPress,
  demoTurns,
  doneWake,
  localPath,
  markSentToAgent,
  refuseDoneNotification,
  openCommands,
  runLocalEffects,
  runSends,
  upgradeLastActions,
  withArrival,
  withDeliveryId,
  withRewrite,
  withUnconfirmed,
} from './presses'
import type { Effect, EffectHost, RowPress } from './presses'
import {
  closedShown,
  DOT,
  NEEDS_YOU_GROUPS,
  isResumable,
  RESUME_TEXT,
  stopFix,
  stopText,
  drawnLists,
  emptyText,
  ROW_TABS,
  TABS,
  CLOSED_MARKS,
  DEMO_NOTICE,
  groupEmptyText,
  closedTotal,
  earlierLabel,
  entryId,
  foldLabel,
  feedbackOf,
  feedbackText,
  fieldExit,
  hasAge,
  heldReplies,
  isFailure,
  isWaitingRow,
  isGuarded,
  PERMISSION_FALLBACK_DELAY_MS,
  PRESS_GUARD_MS,
  QUEUED_AFTER_MS,
  rowKeyPlan,
  settledLabel,
  actionLabel,
  replyHint,
  rowMark,
  rowFeedbackText,
  ROW_COPY,
  rowsIn,
  SETTLED_MS,
  settledIn,
  settledRowIds,
  allRows,
  firstWaiting,
  keptOpen,
  listWaits,
  rowAfterClose,
  shortAgo,
} from './view'
import type { ActionEmphasis, ActionIcon, DrawnEntry, InboxView, ModLook, PlannedKey, RowView, RowWait } from './view'
import { agentTools, recordClose, recordItem } from './tools'
import type { UndoProps } from './undo-client'
import {
  closedGroups,
  followTo,
  isPrsTabEmpty,
  isTabEmpty,
  listedRowIds,
  openRowIds,
  prRowIds,
  recordRows,
} from './arrivals'
import { parseInline } from './inline'
import type { Span } from './inline'
import type { RowRecord } from './arrivals'
import { ROW_PAD_PT } from './layout'
import { DARK_DALTONIZED_TONES, DARK_TONES, LIGHT_DALTONIZED_TONES, LIGHT_TONES, toneColors } from './tones'
import type { ToneName } from './tones'
import type { FoldProps } from './fold-client'
import type { LinksProps } from './links-client'
import type { RowProps } from './row-client'
import { TAB_COUNT_GAP, TAB_HEIGHT, type TabsProps } from './tabs-client'

const TAB = atom({ plugin: 'inbox', key: 'tab' } as const, 'needsYou' as Tab)
const NO_CURSOR: Cursor = { id: null, index: 0, openedAt: 0 }
const NO_SELECTION: Record<Tab, Cursor> = { needsYou: NO_CURSOR, findings: NO_CURSOR, prs: NO_CURSOR }
const SELECTION = atom({ plugin: 'inbox', key: 'selection' } as const, NO_SELECTION)
const THEME = atom({ plugin: 'inbox', key: 'theme' } as const, '')
const DIALOGS = atom({ plugin: 'inbox', key: 'dialogs' } as const, [] as Dialog[])
const TYPING = atom({ plugin: 'inbox', key: 'typing' } as const, null as string | null)
const DRAFTS = atom({ plugin: 'inbox', key: 'drafts' } as const, {} as Record<string, Draft>)
const DISCARDED = atom({ plugin: 'inbox', key: 'discarded' } as const, {} as Record<string, number>)
const NOTES = atom({ plugin: 'inbox', key: 'notes' } as const, {} as Record<string, RowNote>)
const REDRAW = atom({ plugin: 'inbox', key: 'redraw' } as const, 0)
const SESSION = atom({ plugin: 'inbox', key: 'session' } as const, NO_SESSION)
const AWAY = atom({ plugin: 'inbox', key: 'away' } as const, PRESENT)
const UNREADABLE = atom({ plugin: 'inbox', key: 'unreadable' } as const, null as string | null)
const UNFOLDED = atom({ plugin: 'inbox', key: 'unfolded' } as const, [] as FoldKind[])
const FOLD_HOVER = atom({ plugin: 'inbox', key: 'foldHover' } as const, null as FoldKind | null)
const OPTIONS_SHOWN = atom({ plugin: 'inbox', key: 'optionsShown' } as const, [] as string[])
const IS_KEY_LIST_SHOWN = atom({ plugin: 'inbox', key: 'isKeyListShown' } as const, false)
const LEAVE_BAR_CELLS = 12
const LEAVE_BAR_STEPS = LEAVE_BAR_CELLS * 2
const RESIZE_SCROLL_MS = 100
/** The mod can always read the whole conversation: from a fork of it, or from the transcript. */
const CAN_CATCH_UP = true
const DEMO = atom({ plugin: 'inbox', key: 'demo' } as const, null as DemoCopy | null)
const DEMO_RECORDING = atom({ plugin: 'inbox', key: 'isDemoRecording' } as const, false)
const TOOLS_REFUSED_TEXT =
  "Claude cannot record or close items here: your organization's settings block the inbox's tools."
const PR_POLL_MS = 2 * 60_000

const RECORD_TOOL = 'mcp__inbox__record'
const CLOSE_TOOL = 'mcp__inbox__close'

const PANE = 'inbox'
const REPLY_ROWS = 3
const DESKTOP_WIDE_AT = 50
// About how many characters of desktop's proportional text fit in one column of `bodyColumns`: sentences and
// the tab labels run 1.23 to 1.30, bold or not.
const DESKTOP_CHARS_PER_CELL = 1.25
// A lower guess for text that must stay one line, since desktop wraps text that is too long.
const DESKTOP_CLIP_CHARS_PER_CELL = 1.1
const DESKTOP_TAB_PAD = '\u00a0'.repeat(3)
const DESKTOP_LINE_PT = 19
// One column of `bodyColumns` in the Claude app pane, in points: 15.8 px at 2x.
const DESKTOP_CELL_PT = 7.9
const UNDO_CELLS = 9
const UNDO_HEIGHT_PT = 23
/**
 * The app draws an Svg as an image, which runs SMIL animation, so the fill moves
 * without the pane redrawing. An image cannot read the app's theme, so it follows the color scheme instead.
 */
function undoSvg(fraction: number, leftMs: number): string {
  const width = UNDO_CELLS * DESKTOP_CELL_PT
  const height = UNDO_HEIGHT_PT
  const left = (width * fraction).toFixed(1)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>.used{fill:rgba(255,255,255,0.6)}.left{fill:rgba(0,0,0,0.06)}.edge{fill:none;stroke:rgba(0,0,0,0.1)}` +
    `text{fill:#0b0b0b}@media (prefers-color-scheme: dark){.used{fill:rgba(255,255,255,0.05)}` +
    `.left{fill:rgba(255,255,255,0.1)}.edge{stroke:none}text{fill:#f0efec}}</style>` +
    `<clipPath id="shape"><rect width="${width}" height="${height}" rx="6"/></clipPath>` +
    `<g clip-path="url(#shape)"><rect class="used" width="${width}" height="${height}"/>` +
    `<rect class="left" width="${left}" height="${height}">` +
    `<animate attributeName="width" from="${left}" to="0" dur="${leftMs}ms" fill="freeze"/></rect></g>` +
    `<rect class="edge" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="5.5"/>` +
    `<text x="${width / 2}" y="${height / 2}" dominant-baseline="central" text-anchor="middle" ` +
    `font-family="-apple-system, system-ui, sans-serif" font-size="14">↺ Undo</text></svg>`
  )
}
/**
 * Text draws one color in both
 * appearances, which the mod cannot read, but an Svg follows the system's light or dark setting, so this takes the
 * shared tone for each, as the Codex tab does.
 */
function toneSvg(tone: ToneName, mark: string): string {
  const { light, dark } = toneColors(tone)
  // A marker needs only 3:1, so an error mark takes a stronger red than text could.
  const [lightMark, darkMark] = tone === 'error' ? [LIGHT_TONES.errorMark, DARK_TONES.errorMark] : [light, dark]
  const width = DESKTOP_CELL_PT
  const height = DESKTOP_LINE_PT
  const shape = markShape(mark, height / 2)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>text{font-family:-apple-system,system-ui,sans-serif;font-size:14px;fill:currentColor}` +
    `.mark{color:${lightMark}}` +
    `@media (prefers-color-scheme: dark){.mark{color:${darkMark}}}</style>` +
    (shape === null
      ? `<text class="mark" x="0" y="${height / 2}" dominant-baseline="central">${escapeXml(mark)}</text>`
      : `<g class="mark">${shape}</g>`) +
    `</svg>`
  )
}
/**
 * The app's own font cannot load in an Svg, and the system font's ✓ is a thin "v".
 */
function markShape(mark: string, midY: number): string | null {
  const t = midY - 4
  const stroke = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"'
  switch (mark) {
    case '✓':
      return `<polyline points="0.6,${t + 4.4} 3,${t + 6.8} 7.4,${t + 1.4}" ${stroke}/>`
    case '✕':
    case '✗':
      return `<path d="M1,${t + 1} L7,${t + 7} M7,${t + 1} L1,${t + 7}" ${stroke}/>`
    case '▲':
      return `<polygon points="4,${t + 0.6} 7.8,${t + 7.4} 0.2,${t + 7.4}" fill="currentColor"/>`
    case '✦':
      return (
        `<path d="M4,${t} Q4.6,${t + 3.4} 8,${t + 4} Q4.6,${t + 4.6} 4,${t + 8} ` +
        `Q3.4,${t + 4.6} 0,${t + 4} Q3.4,${t + 3.4} 4,${t} Z" fill="currentColor"/>`
      )
    default:
      return null
  }
}
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
/**
 * It is an Svg, the
 * only icon the pane can draw, sized to the fold line, so it sits in the mark column at the line's middle.
 */
function chevronSvg(isUnfolded: boolean, isHover: boolean): string {
  const width = FRAME_INSET_PT + DESKTOP_MARK_CELLS * DESKTOP_CELL_PT
  const height = 2 * ROW_PAD_PT + DESKTOP_LINE_PT
  const x = FRAME_INSET_PT - DESKTOP_CELL_PT + 0.5
  const y = height / 2
  const points = isUnfolded
    ? `${x},${y - 2} ${x + 3.5},${y + 1.5} ${x + 7},${y - 2}`
    : `${x + 1.5},${y - 3.5} ${x + 5},${y} ${x + 1.5},${y + 3.5}`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    (isHover
      ? `<style>polyline{stroke:#0b0b0b}@media (prefers-color-scheme: dark){polyline{stroke:#f0efec}}</style>`
      : `<style>polyline{stroke:${DESKTOP_AGE}}</style>`) +
    `<polyline points="${points}" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  )
}
/**
 * A Box in the hooks tree counts padding in half lines, so it pads twice this.
 */
const DESKTOP_ROW_PAD = ROW_PAD_PT / DESKTOP_LINE_PT
const TREE_LINE_AT = 2
const ROW_COLUMNS = {
  tree: { lead: TREE_LINE_AT + 3, handleAt: TREE_LINE_AT + 3, textAt: TREE_LINE_AT + 6 },
  desktop: { lead: 1, handleAt: 1, textAt: 3 },
} as const
const DESKTOP_MARK_CELLS = 1
// How far a row frame's transparent border insets its content, in points.
const FRAME_INSET_PT = 13.2
const DESKTOP_SIDE_CELLS = 5
const TERMINAL_SIDE_CELLS = 5
const SELECTED_GAP_PT = 3
const LEADING_DOT = new RegExp(`^${DOT}`)
const NEEDS_YOU = 'warning'
type TreePos = 'mid' | 'last' | 'pass'
const TREE_DEPTH = 200
const SELECTION_BAR = Array<string>(TREE_DEPTH).fill('▌').join('\n')
const treeTexts = new Map<string, string>()

function treeText(pos: TreePos, lead: number): string {
  const key = `${pos}:${lead}`
  const cached = treeTexts.get(key)
  if (cached !== undefined) return cached
  const text = [
    ...Array<string>(lead).fill('│'),
    pos === 'last' ? '└─' : pos === 'mid' ? '├─' : '│',
    ...Array<string>(TREE_DEPTH).fill(pos === 'last' ? ' ' : '│'),
  ].join('\n')
  treeTexts.set(key, text)

  return text
}
const DONE = 'success'
const FINDINGS = 'autoAccept'
const PRS = 'planMode'

type Tone = Tab | 'issue' | 'done' | 'error'
/**
 * The pane's colors in one Claude Code theme. Each text color meets WCAG AA,
 * 4.5:1, on every background the pane draws it on, and each marker meets 3:1.
 */
type Palette = {
  body?: string
  card?: string
  tab?: string
  raised: string
  raisedText?: string
  selection?: string
  muted: string
  age: string
  key: string
  line: string
  selectionLine?: string
  divider: string
  tone: Partial<Record<Tone, string>>
  mark: Record<Tone, string>
}

const DARK_PALETTE: Palette = {
  card: '#373737',
  tab: '#373737',
  raised: '#4c4c4c',
  selection: '#3b4654',
  muted: '#bdbdbd',
  age: '#a3a3a3',
  key: DARK_TONES.key,
  line: '#505050',
  selectionLine: '#5a6f88',
  divider: '#444444',
  tone: DARK_TONES,
  mark: { ...DARK_TONES, error: DARK_TONES.errorMark },
}
const LIGHT_PALETTE: Palette = {
  card: '#e6e6e6',
  tab: '#e6e6e6',
  raised: '#d0d0d0',
  selection: '#b4d5ff',
  muted: '#595959',
  age: '#666666',
  key: LIGHT_TONES.key,
  line: '#afafaf',
  selectionLine: '#7490b8',
  divider: '#c8c8c8',
  tone: LIGHT_TONES,
  mark: LIGHT_TONES,
}
const DARK_ANSI_PALETTE: Palette = {
  body: 'inverseText',
  raised: 'inactive',
  raisedText: 'inverseText',
  muted: 'inactive',
  age: 'inactive',
  key: 'suggestion',
  line: 'userMessageBackground',
  divider: 'userMessageBackground',
  tone: {},
  mark: { needsYou: NEEDS_YOU, issue: NEEDS_YOU, findings: FINDINGS, prs: PRS, done: DONE, error: 'error' },
}
const LIGHT_ANSI_PALETTE: Palette = {
  body: 'userMessageBackgroundHover',
  raised: 'text',
  raisedText: 'userMessageBackgroundHover',
  muted: 'inactive',
  age: 'inactive',
  key: 'suggestion',
  line: 'userMessageBackground',
  divider: 'userMessageBackground',
  tone: {},
  mark: { needsYou: 'error', issue: 'error', findings: FINDINGS, prs: 'suggestion', done: DONE, error: 'error' },
}
const PALETTES: Record<string, Palette> = {
  dark: DARK_PALETTE,
  'dark-daltonized': {
    ...DARK_PALETTE,
    key: DARK_DALTONIZED_TONES.key,
    tone: DARK_DALTONIZED_TONES,
    mark: { ...DARK_DALTONIZED_TONES, error: DARK_DALTONIZED_TONES.errorMark },
  },
  light: LIGHT_PALETTE,
  'light-daltonized': {
    ...LIGHT_PALETTE,
    card: '#dcdcdc',
    tab: '#dcdcdc',
    raised: '#c8c8c8',
    muted: '#545454',
    age: '#5e5e5e',
    key: LIGHT_DALTONIZED_TONES.key,
    divider: '#c0c0c0',
    tone: LIGHT_DALTONIZED_TONES,
    mark: LIGHT_DALTONIZED_TONES,
  },
  'dark-ansi': DARK_ANSI_PALETTE,
  'light-ansi': LIGHT_ANSI_PALETTE,
}
const THEME_KEY_PALETTE: Palette = {
  tab: 'userMessageBackground',
  raised: 'subtle',
  raisedText: 'text',
  muted: 'inactive',
  age: 'inactive',
  key: 'remember',
  line: 'subtle',
  divider: 'subtle',
  tone: {},
  mark: { needsYou: NEEDS_YOU, issue: NEEDS_YOU, findings: FINDINGS, prs: PRS, done: DONE, error: 'error' },
}
// Theme keys resolve to the app's colors, so the desktop pane draws text in theme keys.
// The app refuses an hsl() alpha or color-mix() color.
const DESKTOP_AGE = '#85837e'
const DESKTOP_PALETTE: Palette = {
  raised: 'rgba(128, 120, 105, 0.14)',
  raisedText: 'text',
  selection: 'rgba(128, 120, 105, 0.14)',
  muted: 'inactive',
  age: DESKTOP_AGE,
  key: 'remember',
  line: 'subtle',
  divider: 'rgba(128, 128, 128, 0.25)',
  tone: { error: 'error' },
  mark: { needsYou: NEEDS_YOU, issue: NEEDS_YOU, findings: FINDINGS, prs: 'suggestion', done: DONE, error: 'error' },
}
/**
 * Mobile and VS Code get the terminal look, which nobody has checked
 * there: docs/reference/claude-desktop-app.md records what is known about those surfaces.
 */
function lookOf(surface: RenderSurface): ModLook {
  return surface === 'desktop' ? 'desktop' : 'terminal'
}
function paletteFor(theme: string, look: ModLook): Palette {
  return look === 'desktop' ? DESKTOP_PALETTE : (PALETTES[theme] ?? THEME_KEY_PALETTE)
}
const TAB_PAD = '  '
const INLINE_RAIL_AT = 80
const RAIL_GUTTER = 2
const FOLD_KINDS: FoldKind[] = [...NEEDS_YOU_GROUPS.map(g => g.kind), 'issue', 'opportunity']
const AWAY_MS = 15 * 60_000

let isTurnRunning = false
/** The conversation whose first prompt has had the card carried beside it. */
let carriedFor: string | null = null
/** Why the last conversation ended, until the next conversation loads. */
let endReason: string | null = null
let isOn = false
let turningOn: Promise<void> | null = null
let intervals: Timer[] = []
let sentBack: string[] = []
/** The reply a step ended on with no tool call, until the turn's next step shows it was sent back. */
let finalReply: string | null = null
/** True once an API error has set this turn's stop. */
let hasStopFromError = false
let turnBox: string | null = null
let isDialogDismissed = false
/** True once a classic.PermissionRequest hook has run, which makes the tool.check fallback unnecessary. */
let hasPermissionRequestHook = false
/** The calls whose tool.check asked and that have not finished: tool_use_id to `callKey`, the key their dialog has. */
const askedCalls = new Map<string, string>()
let fetchingPrs: Promise<void> = Promise.resolve()
let nextFetchFindsBranchPr: boolean | null = null
let recordedRows: { isDemo: boolean; ids: RowRecord<Tab> } | null = null
let isInlinePane = false
let isInlineTerminalPane = false
let terminalInlineSize: string | null = null
let inlineSize: string | null = null
type PendingUndoScroll = {
  key: string
  tab: Tab
  cursor: Cursor
  block: UiScrollBlock
  expiresAt: number
  sessionId: string
  revealUndo: boolean
}
let pendingUndoScroll: PendingUndoScroll | null = null
let undoScrollRevision = 0
function cancelUndoScroll(): number {
  pendingUndoScroll = null
  return ++undoScrollRevision
}
function suspendUndoReveal(): number {
  if (pendingUndoScroll) pendingUndoScroll.revealUndo = false
  return ++undoScrollRevision
}
let loadRevision = 0
let applyingConversation: Promise<void> = Promise.resolve()
let queue: Promise<void> = Promise.resolve()
let published: string | null = null
let publishing: Promise<void> = Promise.resolve()
let shellCommand: string | null = null
let toolsRefused = false
let isReadingAgain = false
let version: string | null = null
/**
 * The desktop app takes the focus off the pane when the Button holding it leaves the drawing, and
 * the next click there only brings it back (anthropics/claude-code#100874).
 */
let focusedKey: string | null = null
let focusHint: string | null = null
function focusHintFor(element: string): string | null {
  const id = element.split('-')[1]

  return /^(answer|done|dismiss|drop)-/.test(element)
    ? `undo-${id}`
    : element.startsWith('typekey-')
      ? `type-${id}`
      : null
}
const followUpPresses = new Map<string, (press: UiPressArgument) => void>()
let paneLook: ModLook = 'terminal'

function focusKeys(node: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(node)) for (const child of node) focusKeys(child, keys)
  else if (node && typeof node === 'object') {
    const el = node as { type?: unknown; props?: { key?: unknown }; children?: unknown }
    if ((el.type === 'Button' || el.type === 'Input') && typeof el.props?.key === 'string') keys.add(el.props.key)
    focusKeys(el.children, keys)
  }

  return keys
}

let resuming: { is: 'sending' } | { is: 'refused'; why: string } | null = null
let stopGeneration = 0
const fieldSeeds = new Map<string, string>()

function resetTurn() {
  sentBack = []
  finalReply = null
  turnBox = null
  isDialogDismissed = false
}

/** Adds the person's words to the turn, as a shell command row does. */
function notePerson($: EngineInterface, line: string) {
  return commit($, currentOwner(), s => ({
    ...s,
    turn: { ...s.turn, person: s.turn.person === null ? line : `${s.turn.person}\n\n${line}` },
  }))
}

function noteActivity($: EngineInterface, line: string) {
  return commit($, currentOwner(), s => noteTurnActivity(s, line)).catch(() => undefined)
}

function messageText(message: SessionAppendMessage): string {
  return message.content.map(b => (b.type === 'text' ? b.text : '')).join('')
}

async function syncTheme($: EngineInterface) {
  const theme = (await $.config.list().catch(() => [])).find(row => row.key === 'theme')?.value
  await update($, THEME, () => (typeof theme === 'string' ? theme : ''))
}

function publishStatus($: EngineInterface, isEnding = false): Promise<void> {
  publishing = publishing
    .then(async () => {
      const pane = await $.env.get('HERDR_PANE_ID')
      if (!pane) return
      const [session, dialogs, now] = await Promise.all([read($, SESSION), read($, DIALOGS), $.clock.now()])
      const { ledger, stop } = session
      const { needsYou, findings } = sessionView(session, now, SETTLED_MS, CAN_CATCH_UP)
      const items = [...needsYou.questions, ...needsYou.tasks]
        .filter(r => r.state.is === 'open')
        .flatMap(r => (r.item ? [r.item] : []))
      const open = findings.rows.filter(r => r.state.is === 'open').flatMap(r => (r.finding ? [r.finding] : []))
      const line = isEnding ? '' : statusLine({ ...ledger, items, findings: open }, stop, dialogs)
      if (line === published) return
      published = line
      const token = line ? ['--token', `inbox=${line}`] : ['--clear-token', 'inbox']
      await $.process.run(['herdr', 'pane', 'report-metadata', pane, '--source', 'inbox', ...token], {
        timeoutMs: 5000,
      })
    })
    .catch(() => undefined)

  return publishing
}

async function setStop($: EngineInterface, stop: Stop | null) {
  if (stop === null && (await read($, SESSION)).stop === null) return
  stopGeneration++
  resuming = null
  await commit($, currentOwner(), s => ({ ...s, stop }))
  void publishStatus($)
}

/** Sets the stop from the error text the transcript ends on, where no StopFailure hook ran. */
async function setStopFromLastReply($: EngineInterface) {
  const last = (await $.session.messages().catch(() => [])).at(-1)
  const message = last?.role === 'assistant' ? last.text : ''
  await setStop($, { ...stopOfMessage(message), at: await $.clock.now() })
}

/** Ends the wait for a permission row, and closes the row, for a call that has started running. */
function endWaitFor($: EngineInterface, id: string | undefined) {
  const key = id ? askedCalls.get(id) : undefined
  if (!id || key === undefined) return
  askedCalls.delete(id)
  // Drawing is pure, so the dialog closes after the render returns.
  void $.clock
    .sleep(0)
    .then(() => closeDialogs($, key))
    .catch(() => undefined)
}

function redraw($: EngineInterface) {
  return update($, REDRAW, n => n + 1)
}

async function resume($: EngineInterface) {
  // [Resume] keeps its key while it reads "Resuming…", so a second press lands here.
  if (resuming?.is === 'sending') return
  const owner = currentOwner()
  const generation = stopGeneration
  const isSameStop = () => isCurrent(owner) && generation === stopGeneration
  resuming = { is: 'sending' }
  await redraw($)
  if (!isSameStop()) return
  const sent = await deliver($, owner, RESUME_TEXT, crypto.randomUUID())
  if (sent.state === 'rejected' && isSameStop()) {
    resuming = { is: 'refused', why: sent.reason }
    await redraw($)
  }
}

function callKey(tool: string, input: Record<string, unknown>): string {
  const main = ['command', 'file_path', 'notebook_path', 'url', 'pattern', 'query', 'skill', 'description'].find(
    k => typeof input[k] === 'string',
  )

  return main ? `${tool} ${main}=${String(input[main])}` : `${tool} ${JSON.stringify(input)}`
}

async function openDialog($: EngineInterface, dialog: Dialog) {
  await update($, DIALOGS, d => [...d.filter(x => x.key !== dialog.key), dialog])
  void publishStatus($)
}

async function closeDialogs($: EngineInterface, key: string | null) {
  if (!(await read($, DIALOGS)).some(d => key === null || d.key === key)) return
  await update($, DIALOGS, d => (key === null ? [] : d.filter(x => x.key !== key)))
  void publishStatus($)
}

async function clearingDialog<T>($: EngineInterface, key: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } finally {
    await closeDialogs($, key)
  }
}

function permissionText(tool: string, input: Record<string, unknown>): string {
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '')
  const file = (key: string) => baseName(text(key))
  switch (tool) {
    case 'Bash': {
      const said = text('description') || text('command')
      return clipLabel(/^[A-Z][a-z]/.test(said) ? said.charAt(0).toLowerCase() + said.slice(1) : said, 60)
    }
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return `edit ${file('file_path')}`
    case 'NotebookEdit':
      return `edit ${file('notebook_path')}`
    case 'Read':
      return `read ${file('file_path')}`
    case 'Glob':
    case 'Grep':
      return `search ${text('path') ? `${file('path')} ` : ''}for ${clipLabel(text('pattern'), 30)}`
    case 'WebFetch':
      return `fetch ${
        text('url')
          .replace(/^https?:\/\//, '')
          .split('/')[0]
      }`
    case 'WebSearch':
      return `search the web for ${clipLabel(text('query'), 30)}`
    case 'Skill':
      return `use the ${text('skill')} skill`
    case 'Agent':
    case 'Task':
      return text('description') ? `run an agent: ${text('description')}` : 'run an agent'
    default:
      return tool.startsWith('mcp__') ? tool.slice(5).replace(/__/g, ' ') : tool
  }
}

/** Changes the ledger of `owner`'s session. */
function commitLedger(
  $: EngineInterface,
  change: (l: Ledger) => Ledger,
  owner: Owner = currentOwner(),
): Promise<Session> {
  return commit($, owner, s => ({ ...s, ledger: change(s.ledger) }))
}

function isOpenIn(ledger: Ledger, id: string): boolean {
  return ledger.items.some(i => i.id === id) || ledger.findings.some(f => f.id === id)
}

function hasNewClose(before: Ledger, after: Ledger): boolean {
  const closes = (l: Ledger) => [
    ...l.closed.map(d => `${d.id} ${d.at}`),
    ...l.closedFindings.map(f => `${f.id} ${f.closedAt}`),
  ]
  const was = new Set(closes(before))

  return closes(after).some(c => !was.has(c))
}

/**
 * Changes `owner`'s session, keeping the rows the person replies on. After a write to the drawn session, the status
 * line follows it, rows that just closed redraw as they leave, and the pane moves to rows that arrived.
 */
async function commit(
  $: EngineInterface,
  owner: Owner,
  change: (s: Session) => Session | Promise<Session>,
): Promise<Session> {
  const [typing, drafts] = await Promise.all([read($, TYPING), read($, DRAFTS)])
  const { before, after, isDrawn } = await changeSession(
    $,
    owner,
    change,
    new Set(Object.keys(heldReplies(typing, drafts))),
  )
  if (!isDrawn) return after
  void publishStatus($)
  if (hasNewClose(before.ledger, after.ledger)) {
    const closedAt = Math.max(
      ...after.ledger.closed.map(d => d.at),
      ...after.ledger.closedFindings.map(f => f.closedAt),
    )
    redrawWhileLeaving($, closedAt + SETTLED_MS)
  }
  void followNewRows($).catch(() => undefined)

  return after
}

/** The session a look draws: `session`, with the ledger, PR views, presses and turn counts of the sample while it shows. */
function drawnSession(
  session: Session,
  drawn: Pick<DemoCopy, 'ledger' | 'stop' | 'prViews' | 'lastActions' | 'turns' | 'subagents' | 'presence'>,
): Session {
  const { ledger, stop, prViews, lastActions, turns, subagents, presence } = drawn

  return {
    ...session,
    ledger,
    stop,
    prViews,
    lastActions,
    subagents,
    presence: { ...session.presence, ...turns, ...presence },
  }
}

function redrawWhileLeaving($: EngineInterface, expiresAt: number) {
  // Desktop draws no leave bar and redraws once, when the row leaves: while the bar redrew every
  // 213 ms there, clicks on the pane's Buttons, Undo among them, did nothing.
  void (async () => {
    const startedAt = await $.clock.now()
    const remaining = Math.max(0, expiresAt - startedAt)
    const steps =
      paneLook === 'desktop' ? 1 : Math.max(1, Math.ceil(remaining / Math.ceil(SETTLED_MS / LEAVE_BAR_STEPS)))
    for (let n = 1; n <= steps; n++) {
      await $.clock.sleep(Math.max(0, Math.ceil(startedAt + (n * remaining) / steps - (await $.clock.now()))))
      await Promise.all([redraw($), update($, DEMO, d => d && { ...d })])
    }
    await openLeftRows($)
    await finishPendingUndoScroll($)
  })().catch(() => undefined)
}

function later($: EngineInterface, waitMs: number, run: () => unknown) {
  void (async () => {
    await $.clock.sleep(waitMs)
    await run()
  })().catch(() => undefined)
}

async function redrawAfterReload($: EngineInterface) {
  const { ledger, lastActions, notes, now } = await drawnState($)
  const times = [
    ...ledger.closed.map(d => d.at),
    ...ledger.closedFindings.map(f => f.closedAt),
    ...Object.values(lastActions).flatMap(a => [
      ...(a.result ? [a.result.at] : []),
      ...(a.action === 'pr-dismiss' || a.action === 'address' ? [a.at] : []),
    ]),
    ...Object.values(notes).map(n => n.at),
  ]
  const latest = Math.max(...times)
  if (times.length > 0 && latest + SETTLED_MS > now) redrawWhileLeaving($, latest + SETTLED_MS)
}

/**
 * The model's answer to a catch-up over the whole conversation: from a fork of it, or from the transcript when there
 * is nothing to fork.
 */
async function catchUpReply($: EngineInterface, owner: Owner): Promise<CatchUpReply> {
  if (!isCurrent(owner)) return { kind: 'failed' }
  const [{ ledger }, shown] = await Promise.all([read($, SESSION), screen($)])
  const forked = await $.model.fork({ prompt: catchUpPrompt(CLAUDE_CODE, ledger, shown) })
  if (!isCurrent(owner)) return { kind: 'failed' }
  if (forked.isAnswered) return { kind: 'reply', text: forked.text, source: null }
  // A fork has nothing to read until this process sends its first request,
  // as after a resume. The model then reads the transcript instead, uncached.
  if (forked.reason !== 'nothing-to-fork') return { kind: 'failed' }
  const transcript = transcriptText(await $.session.messages())
  if (!transcript) return { kind: 'unreadable' }
  const r = await askLedgerModel($, transcriptCatchUpPrompt(ledger, shown, transcript), 90_000)
  if (!isCurrent(owner)) return { kind: 'failed' }

  return r.isAnswered ? { kind: 'reply', text: r.text, source: transcript } : { kind: 'failed' }
}

/**
 * Marks the ledger `behind` so the next update catches up over the whole conversation, then runs it. A load calls
 * this when the ledger may have missed turns.
 */
async function catchUpNow($: EngineInterface) {
  await commit($, currentOwner(), s =>
    s.presence.ledgerState === 'current' ? { ...s, presence: { ...s.presence, ledgerState: 'behind' } } : s,
  )
  updateLedger($)
}

/**
 * Runs the per-reply update for the conversation, one at a time: the pending exchanges, or a catch-up when the
 * ledger may have missed a turn, as after a failed update or a reload that cut one off.
 */
function updateLedger($: EngineInterface) {
  const owner = currentOwner()
  queue = queue.then(async () => {
    if (!isCurrent(owner)) return
    await runUpdates({ ...hostOf($, owner), catchUp: () => catchUpReply($, owner) })
    if (isCurrent(owner)) void publishStatus($)
  })
  // A rejected link would skip every later update, so the chain swallows it.
  queue = queue.catch(() => undefined)
}

/** The mod's SessionHost for `owner`'s conversation. A press passes its surface, which copies go to. */
function hostOf($: EngineInterface, owner: Owner, surface?: UiPressArgument['surface']): SessionHost<Session> {
  return sessionHost($, owner, {
    update: change => commit($, owner, change),
    surface,
    isTurnRunning: () => isTurnRunning,
    settleWindowMs: SETTLED_MS,
    onGhMissing: isGhMissing =>
      void commit($, owner, s =>
        s.prViews.isGhMissing === isGhMissing ? s : { ...s, prViews: { ...s.prViews, isGhMissing } },
      ).catch(() => undefined),
  })
}

async function tick($: EngineInterface) {
  const now = await $.clock.now()
  const away = await read($, AWAY)
  if (away.isAway) {
    await update($, AWAY, a => ({ ...a, minute: Math.floor(now / 60_000) }))
  } else if (!isTurnRunning && away.lastActiveAt > 0 && now - away.lastActiveAt > AWAY_MS) {
    await update($, AWAY, a => ({ ...a, isAway: true, minute: Math.floor(now / 60_000) }))
  }
}

async function appendContext($: EngineInterface, context: string[]) {
  const content = [{ type: 'text' as const, text: context.join('\n\n') }]
  await $.session.append({ message: { type: 'user', content } }).catch(() => undefined)
}

/**
 * Records a prompt's words for the turn and returns what Claude reads beside it. `match` finds the press that sent a
 * message of the mod's own, when its row is stored.
 */
async function notePrompt(
  $: EngineInterface,
  text: string,
  match: (s: Session) => { state: Session; sentBy: SentBy | null } = s => ({ state: s, sentBy: null }),
): Promise<string[]> {
  const [now, isShown] = await Promise.all([$.clock.now(), isPaneShown($)])
  await update($, AWAY, a => ({ ...a, lastActiveAt: now, isAway: false }))
  let notes: string[] = []
  await commit($, currentOwner(), s => {
    const matched = match(s)
    const r = recordPrompt(CLAUDE_CODE, matched.state, text, isShown, matched.sentBy)
    notes = r.notes
    return r.state
  })

  return notes
}

/**
 * A reload keeps $.state, so a running session can still hold its parts in the separate fields of an older build,
 * `notes` as its tab, and the Needs you tab as `waiting`, and drafts saved as bare text.
 */
async function upgradeState($: EngineInterface): Promise<Ledger> {
  const now = await $.clock.now()
  const [session] = await Promise.all([
    upgradeDrawn($),
    update($, TAB, t => ((t as string) === 'notes' ? 'findings' : (t as string) === 'waiting' ? 'needsYou' : t)),
    update($, SELECTION, ({ waiting, ...s }: Record<Tab, Cursor> & { waiting?: Cursor }) => {
      const cursors: Record<Tab, Cursor> = { ...NO_SELECTION, ...(waiting ? { needsYou: waiting } : {}), ...s }
      // A cursor saved before `openedAt` existed: no click opened its row in a way that still guards it.
      return Object.fromEntries(
        Object.entries(cursors).map(([t, c]) => [t, { ...c, openedAt: c.openedAt ?? 0 }]),
      ) as Record<Tab, Cursor>
    }),
    // Old builds saved the group kinds as `decide` and `do`, and Findings' one fold as `finding`, now one per kind.
    update($, UNFOLDED, u =>
      u.flatMap((k: string): FoldKind[] =>
        k === 'finding' ? ['issue', 'opportunity'] : k === 'issue' || k === 'opportunity' ? [k] : [readKind(k)],
      ),
    ),
    // A demo an earlier build seeded may lack a field this one draws, so it ends; /inbox demo seeds a new one.
    update($, DEMO, d => (d === null ? d : isDemoCopy(d) ? upgradeDemoCopy(d) : null)),
    // A draft saved as bare text began before now, so a row that closed before this load stays closed.
    update($, DRAFTS, (d: Record<string, Draft | string>) =>
      Object.fromEntries(
        Object.entries(d).map(([id, draft]) => [id, typeof draft === 'string' ? { text: draft, since: now } : draft]),
      ),
    ),
  ])

  return session.ledger
}

async function runTool($: EngineInterface, tool: 'record' | 'close', input: Record<string, unknown>): Promise<string> {
  const now = await $.clock.now()
  let result = ''
  await commit($, currentOwner(), s => {
    const r = recorded(CLAUDE_CODE, s, tool, input, now)
    result = r.result
    return r.state
  })

  return result
}

/**
 * Opens the pane, or raises it, asking for the keyboard. The surface grants
 * that only while the prompt holds the keys over an empty composer.
 */
function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Inbox', focus: true, closeOnEscape: true })
}

async function openTopRow($: EngineInterface) {
  const [{ view, ledger, prViews: prState, lastActions, now }, tab] = await Promise.all([drawnState($), read($, TAB)])
  const prViews = drawnPrs(prState, ledger.prs, lastActions, now)
    .filter(x => !x.isSettled)
    .map(x => x.pr)
  const ids = tabRowIds(view, prViews)[tab]
  const top = firstWaiting(tabWaits(tab, view, prViews, lastActions))
  if (top === null) await update($, SELECTION, s => ({ ...s, [tab]: NO_CURSOR }))
  else await select($, tab, top, ids.indexOf(top))
}

async function showInbox($: EngineInterface) {
  await openPane($)
  await followNewRows($, true)
  await openTopRow($)
}

async function openInbox($: EngineInterface) {
  // Opened before any other await. After one, the engine no longer counts the press as
  // asking for the pane, and below 144 columns, once the person has closed it, leaves it unplaced.
  await openPane($)
  const { view } = await drawnState($)
  if (view.needsYou.count > 0) await update($, TAB, () => 'needsYou' as const)
  else if ((await read($, TAB)) === 'prs') await findPrs($)
  await followNewRows($, true)
  await openTopRow($)
}

async function sendDraft($: EngineInterface, id: string, surface: UiPressArgument['surface']) {
  await sendTyped($, id, (await read($, DRAFTS))[id]?.text ?? '', surface)
}

async function sendTyped($: EngineInterface, id: string, text: string, surface: UiPressArgument['surface']) {
  if (text.trim()) await runPress($, { action: 'type', id, text }, surface)
  else await focusField($, id)
}

async function startTyping($: EngineInterface, id: string) {
  const now = await $.clock.now()
  const drafts = await update($, DRAFTS, d => (d[id] ? d : { ...d, [id]: { text: '', since: now } }))
  fieldSeeds.set(id, drafts[id]?.text ?? '')
  await keepPressedOpen($, id)
  await update($, TYPING, () => id)
  await focusField($, id)
}

async function discardReply($: EngineInterface, id: string) {
  fieldSeeds.delete(id)
  const now = await $.clock.now()
  await update($, DISCARDED, d => ({
    ...Object.fromEntries(Object.entries(d).filter(([, at]) => now - at < SETTLED_MS)),
    [id]: now,
  }))
  await Promise.all([
    update($, TYPING, t => (t === id ? null : t)),
    update($, DRAFTS, ({ [id]: _discarded, ...rest }) => rest),
  ])
  await openLeftRows($)
}

async function focusField($: EngineInterface, id: string) {
  // A click leaves the keys with the prompt, and `ui.focus` is refused in a pane that lacks them.
  await openPane($)
  await $.ui.focus({ requestId: PANE, key: `type-${id}` }).catch(() => undefined)
}

async function showTab($: EngineInterface, tab: Tab) {
  cancelUndoScroll()
  if (tab === 'prs') await findPrs($)
  await update($, TAB, () => tab)
  await scrollToOpenRow($, tab)
}

/**
 * Call it before the tab draws: it marks the fetch first, so the tab opens on
 * "Checking for PRs…" and not on "No PRs".
 */
async function findPrs($: EngineInterface) {
  if (await read($, DEMO)) return
  await markFetching($, true)
  void fetchPrs($, true)
}

function lineCount(text: string, width: number): number {
  return wrapped(text, width).length
}

type TerminalSpan = Span & { isLinkAddress?: true }

function terminalTextLines(text: string, width: number, limit = Infinity): TerminalSpan[][] {
  if (!text || limit < 1) return []
  const size = Math.max(1, width)
  type Character = { text: string; span: TerminalSpan }
  const lines: Character[][] = []
  let line: Character[] = []
  let used = 0
  let word: Character[] = []
  let spaces: Character[] = []
  let endsWithNewline = false
  const columns = (characters: Character[]) => characters.reduce((n, c) => n + c.text.length, 0)
  const nextLine = () => {
    lines.push(line)
    line = []
    used = 0
  }
  const append = (characters: Character[]) => {
    for (const character of characters) {
      if (line.length > 0 && used + character.text.length > size) nextLine()
      line.push(character)
      used += character.text.length
    }
  }
  const appendWord = () => {
    if (word.length === 0) return
    if (line.length > 0 && used + columns(spaces) + columns(word) > size) {
      nextLine()
      spaces = []
    }
    append(spaces)
    append(word)
    spaces = []
    word = []
  }
  const spans: TerminalSpan[] = parseInline(text).flatMap(span =>
    span.link ? [span, { text: ` ${span.link}`, isLinkAddress: true as const }] : [span],
  )
  for (const span of spans) {
    for (const character of span.text) {
      endsWithNewline = character === '\n'
      if (endsWithNewline) {
        appendWord()
        nextLine()
        spaces = []
      } else if (/\s/.test(character)) {
        appendWord()
        spaces.push({ text: character, span })
      } else word.push({ text: character, span })
    }
  }
  appendWord()
  if (line.length > 0 || endsWithNewline) nextLine()
  const kept = lines.slice(0, limit)
  if (kept.length < lines.length) {
    const last = kept.at(-1)!
    while (last.length > 0 && columns(last) >= size) last.pop()
    while (last.length > 0 && /[\s.,;:]/.test(last.at(-1)!.text)) last.pop()
    last.push({ text: '…', span: { text: '…' } })
  }
  return kept.map(characters => {
    const runs: TerminalSpan[] = []
    let previous: TerminalSpan | undefined
    for (const character of characters) {
      if (previous === character.span) runs.at(-1)!.text += character.text
      else {
        runs.push({ ...character.span, text: character.text })
        previous = character.span
      }
    }
    return runs
  })
}

function wrapped(text: string, width: number): string[] {
  const size = Math.max(1, width)
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word
    if (longer.length <= size) {
      line = longer
      continue
    }
    if (line) lines.push(line)
    let rest = word
    while (rest.length > size) {
      lines.push(rest.slice(0, size))
      rest = rest.slice(size)
    }
    line = rest
  }
  if (line) lines.push(line)

  return lines
}

async function select($: EngineInterface, tab: Tab, id: string, index: number, scroll = true) {
  if (scroll) {
    if (pendingUndoScroll && pendingUndoScroll.tab === tab) suspendUndoReveal()
    else cancelUndoScroll()
  }
  const openedAt = await $.clock.now()
  await update($, SELECTION, s => ({ ...s, [tab]: { id, index, openedAt } }))
  await update($, TYPING, t => (t === id ? t : null))
  // The row's buttons draw dim while guarded. A render cannot write state, so a fresh value redraws them once the guard ends.
  later($, PRESS_GUARD_MS, () => update($, SELECTION, s => ({ ...s })))
  if (scroll) await scrollToRow($, id)
}

async function scrollToKey(
  $: EngineInterface,
  key: string,
  block: UiScrollBlock,
  stillCurrent: () => boolean = () => true,
  retryMs = 30,
): Promise<boolean> {
  for (let tries = 0; tries < Math.ceil(300 / retryMs); tries++) {
    if (!stillCurrent()) return false
    const result = await $.ui.scroll({ in: PANE, to: { key }, block }).catch((): UiScrollResult => ({}))
    if (!stillCurrent()) return false
    if (result.deny === undefined) return true
    await $.clock.sleep(retryMs)
  }
  return false
}

async function scrollToRow($: EngineInterface, id: string) {
  await scrollToKey($, `view-${id}`, isInlinePane ? 'start' : 'nearest')
}

function sameCursor(a: Cursor, b: Cursor): boolean {
  return a.id === b.id && a.index === b.index && a.openedAt === b.openedAt
}

function settledLayoutId(
  tab: Tab,
  view: InboxView,
  prs: { pr: PrView; isSettled: boolean }[],
  lastActions: Record<string, LastAction>,
  notes: Record<string, RowNote>,
  now: number,
  size: string | null,
): string {
  const rows =
    tab === 'needsYou'
      ? [...view.needsYou.questions, ...view.needsYou.tasks]
      : tab === 'findings'
        ? view.findings.rows
        : []
  return JSON.stringify([
    size,
    ...rows.map(r => r.id),
    ...rows.flatMap(r => (r.state.is === 'settled' ? [[r.id, r.state.at]] : [])),
    ...(tab === 'prs' ? prs.map(x => [x.pr.ref, x.isSettled ? (lastActions[prMarkId(x.pr.ref)]?.at ?? 0) : null]) : []),
    ...Object.entries(lastActions).flatMap(([id, action]) =>
      action.result ? [[id, action.result.at, now - action.result.at < SETTLED_MS]] : [],
    ),
    ...Object.entries(notes).map(([id, note]) => [id, note.at, now - note.at < SETTLED_MS]),
  ])
}

function settledScrollKey(key: string, layout: string): string {
  return `scroll-${key}-${layout}`
}

async function revealPendingUndo($: EngineInterface): Promise<boolean> {
  const pending = pendingUndoScroll
  if (!pending || !pending.revealUndo || !isInlineTerminalPane || pending.sessionId !== conversation.id) return false
  const [tab, selection, drawn] = await Promise.all([read($, TAB), read($, SELECTION), drawnState($)])
  if (pendingUndoScroll !== pending) return false
  if (tab !== pending.tab || !sameCursor(selection[tab], pending.cursor) || drawn.now >= pending.expiresAt) return false
  const prs = drawnPrs(drawn.prViews, drawn.ledger.prs, drawn.lastActions, drawn.now)
  const key = settledScrollKey(
    pending.key,
    settledLayoutId(tab, drawn.view, prs, drawn.lastActions, drawn.notes, drawn.now, terminalInlineSize),
  )
  return scrollToKey($, key, pending.block, () => pendingUndoScroll === pending && pending.revealUndo, 5)
}

async function keepUndoVisible($: EngineInterface, key: string, block: UiScrollBlock, at: number, revision: number) {
  if (revision !== undoScrollRevision) return
  const [tab, selection] = await Promise.all([read($, TAB), read($, SELECTION)])
  if (revision !== undoScrollRevision) return
  const pending: PendingUndoScroll = {
    key,
    tab,
    cursor: selection[tab],
    block,
    expiresAt: at + SETTLED_MS,
    sessionId: conversation.id,
    revealUndo: true,
  }
  pendingUndoScroll = pending
  await revealPendingUndo($)
}

async function finishPendingUndoScroll($: EngineInterface) {
  const pending = pendingUndoScroll
  if (!pending) return
  const revision = undoScrollRevision
  const [tab, selection, drawn] = await Promise.all([read($, TAB), read($, SELECTION), drawnState($)])
  if (pendingUndoScroll !== pending || revision !== undoScrollRevision) return
  const cursor = selection[tab]
  if (tab === pending.tab && isInlineTerminalPane && conversation.id === pending.sessionId) {
    const prs = drawnPrs(drawn.prViews, drawn.ledger.prs, drawn.lastActions, drawn.now)
    const openId =
      cursor.id ??
      (cursor.openedAt === 0
        ? firstWaiting(
            tabWaits(
              tab,
              drawn.view,
              prs.filter(x => !x.isSettled).map(x => x.pr),
              drawn.lastActions,
            ),
          )
        : null)
    const isSettling = drawn.now < pending.expiresAt
    const baseKey = isSettling && pending.revealUndo ? pending.key : openId ? `view-${openId}` : null
    const block = isSettling && pending.revealUndo ? pending.block : 'start'
    if (baseKey) {
      const key = settledScrollKey(
        baseKey,
        settledLayoutId(tab, drawn.view, prs, drawn.lastActions, drawn.notes, drawn.now, terminalInlineSize),
      )
      await scrollToKey($, key, block, () => pendingUndoScroll === pending && revision === undoScrollRevision, 5)
    }
  }
  if (drawn.now >= pending.expiresAt && pendingUndoScroll === pending && revision === undoScrollRevision)
    pendingUndoScroll = null
}

async function scrollToOpenRow($: EngineInterface, tab: Tab, surface?: RenderSurface) {
  const revision = undoScrollRevision
  if (surface !== 'desktop' && (await revealPendingUndo($))) return
  if (revision !== undoScrollRevision) return
  if (isInlinePane) {
    const [selection, { view, ledger, prViews: prState, lastActions, now }] = await Promise.all([
      read($, SELECTION),
      drawnState($),
    ])
    const prViews = drawnPrs(prState, ledger.prs, lastActions, now)
      .filter(x => !x.isSettled)
      .map(x => x.pr)
    const cursor = selection[tab]
    const id = cursor.id ?? (cursor.openedAt === 0 ? firstWaiting(tabWaits(tab, view, prViews, lastActions)) : null)
    if (revision !== undoScrollRevision) return
    if (id !== null) {
      await scrollToKey($, `view-${id}`, 'start', () => revision === undoScrollRevision)
      return
    }
  }
  if (revision !== undoScrollRevision) return
  await $.ui.scroll({ in: PANE, to: 'start' }).catch(() => undefined)
}

async function selectClicked($: EngineInterface, id: string) {
  const [{ ledger, prViews: prState, lastActions, view, now }, tab, selection] = await Promise.all([
    drawnState($),
    read($, TAB),
    read($, SELECTION),
  ])
  const prViews = drawnPrs(prState, ledger.prs, lastActions, now)
    .filter(x => !x.isSettled)
    .map(x => x.pr)
  const index = tabRowIds(view, prViews)[tab].indexOf(id)
  if (index < 0 || isGuarded(selection[tab].openedAt, now)) return
  // The Client leaves the drawing as its row opens, so the focus repair moves the focus to the row's first action.
  focusedKey = `select-${id}`
  focusHint = null
  await select($, tab, id, index)
}

/**
 * A set, not a toggle: a second
 * click before the redraw posts the same state, so a double-click leaves the fold unfolded.
 */
async function setFold($: EngineInterface, kind: string, isUnfolded: unknown) {
  const fold = FOLD_KINDS.find(k => k === kind)
  if (fold === undefined || typeof isUnfolded !== 'boolean') return
  await update($, UNFOLDED, u =>
    u.includes(fold) === isUnfolded ? u : isUnfolded ? [...u, fold] : u.filter(k => k !== fold),
  )
}

async function setFoldHover($: EngineInterface, kind: string, isHover: boolean) {
  const fold = FOLD_KINDS.find(k => k === kind)
  if (fold === undefined) return
  await update($, FOLD_HOVER, hovered => (isHover ? fold : hovered === fold ? null : hovered))
}

function selectedIndex(ids: string[], cursor: Cursor, top: string | null, isSettled: (id: string) => boolean): number {
  if (cursor.id !== null) {
    const at = ids.indexOf(cursor.id)
    if (at >= 0 || isSettled(cursor.id)) return at
    return ids.length === 0 ? -1 : Math.min(cursor.index, ids.length - 1)
  }

  return cursor.openedAt === 0 && top !== null ? ids.indexOf(top) : -1
}

async function openLeftRows($: EngineInterface) {
  const { ledger, prViews: prState, lastActions, view, now } = await drawnState($)
  const prViews = drawnPrs(prState, ledger.prs, lastActions, now)
    .filter(x => !x.isSettled)
    .map(x => x.pr)
  const ids = tabRowIds(view, prViews)
  const settled = new Set(settledRowIds(allRows(view)))
  let isMoved = false
  await update($, SELECTION, s => {
    const moved = Object.fromEntries(
      (Object.keys(s) as Tab[]).map(t => {
        const c = s[t]
        const list = ids[t]
        if (c.id === null || list.includes(c.id) || settled.has(c.id)) return [t, c]
        isMoved = true
        const index = Math.min(c.index, list.length - 1)
        return [t, index < 0 ? NO_CURSOR : { id: list[index]!, index, openedAt: now }]
      }),
    ) as Record<Tab, Cursor>
    return isMoved ? moved : s
  })
  // The opened row's buttons draw dim while guarded; a fresh value redraws them once the guard ends.
  if (isMoved) later($, PRESS_GUARD_MS, () => update($, SELECTION, s => ({ ...s })))
}

function tabWaits(tab: Tab, view: InboxView, prViews: PrView[], lastActions: Record<string, LastAction>): RowWait[] {
  return tab === 'prs' ? prRowWaits(prViews, lastActions) : listWaits(view)[tab]
}

async function unlessGuarded($: EngineInterface, rowId: string, press: UiPressArgument, onPress: Action['onPress']) {
  const [selection, tab, now] = await Promise.all([read($, SELECTION), read($, TAB), $.clock.now()])
  const cursor = selection[tab]
  if (cursor.id !== rowId || !isGuarded(cursor.openedAt, now)) await onPress(press)
}

async function keepPressedOpen($: EngineInterface, id: string) {
  const tab = await read($, TAB)
  await update($, SELECTION, s =>
    s[tab].id === null && s[tab].openedAt === 0 ? { ...s, [tab]: { id, index: 0, openedAt: 0 } } : s,
  )
}

function newRows(isDemo: boolean, current: Record<Tab, string[] | null>): Record<Tab, string[]> {
  const { seen, added } = recordRows(recordedRows?.isDemo === isDemo ? recordedRows.ids : {}, current)
  recordedRows = { isDemo, ids: seen }

  return added
}

async function jumpTo($: EngineInterface, tab: Tab) {
  cancelUndoScroll()
  await update($, TAB, () => tab)
  await update($, SELECTION, s => ({ ...s, [tab]: NO_CURSOR }))
  await scrollToOpenRow($, tab)
}

function tabRowIds(view: InboxView, prViews: PrView[]): Record<Tab, string[]> {
  const listed = drawnLists(
    view,
    () => false,
    r => r.id,
  ).byTab

  return { ...listed, prs: prRowWaits(prViews, {}).map(r => r.id) }
}

/**
 * The render cannot write state, so each write
 * that can add a row calls this.
 */
async function followNewRows($: EngineInterface, isOpening = false) {
  const [drawn, tab, unfolded, isShown] = await Promise.all([
    drawnState($),
    read($, TAB),
    read($, UNFOLDED),
    isPaneShown($),
  ])
  const { ledger, prViews: prState, lastActions, stop, isDemo, isUnread, view, now } = drawn
  const prs = drawnPrs(prState, ledger.prs, lastActions, now)
  const prViews = prs.filter(x => !x.isSettled).map(x => x.pr)
  const ids = tabRowIds(view, prViews)
  if (isOpening) recordedRows = null
  const added = newRows(isDemo, {
    ...listedRowIds(view),
    prs: prState.isFetching ? null : prRowIds(prs),
  })
  if (!isShown) return
  const keeps = (['needsYou', 'findings'] as const).flatMap(t => {
    const id = added[t].length > 0 ? keptOpen(tabWaits(t, view, prViews, lastActions), added[t]) : null
    return id === null ? [] : [{ t, cursor: { id, index: ids[t].indexOf(id), openedAt: 0 } }]
  })
  if (keeps.length > 0) {
    await update($, SELECTION, s => {
      const kept = { ...s }
      for (const { t, cursor } of keeps) if (s[t].id === null && s[t].openedAt === 0) kept[t] = cursor
      return kept
    })
    if (isInlinePane && keeps.some(k => k.t === tab)) void scrollToOpenRow($, tab)
  }
  const settled = new Set(settledRowIds(allRows(view)))
  const isEmpty =
    tab === 'prs'
      ? isPrsTabEmpty(prs.length, prState.isFetching)
      : isTabEmpty({
          rows: tab === 'needsYou' ? [...view.needsYou.questions, ...view.needsYou.tasks] : view.findings.rows,
          settled,
          closed: closedGroups(view, tab, kind => unfolded.includes(kind)),
          hasBlocker: tab === 'needsYou' && (!!stop || isUnread),
        })
  const to = followTo(
    TABS.map(t => t.id),
    tab,
    isEmpty,
    isOpening ? { ...openRowIds(view), prs: [] } : added,
  )
  if (to) await jumpTo($, to)
}

async function isPaneShown($: EngineInterface) {
  return (await $.ui.panes().catch(() => [])).some(p => p.id === PANE && p.isShown)
}

async function isPrsTabShown($: EngineInterface) {
  return (await read($, TAB)) === 'prs' && (await isPaneShown($))
}

async function screen($: EngineInterface) {
  const tab = await read($, TAB)

  return screenText(CLAUDE_CODE, await isPaneShown($), TABS.find(t => t.id === tab)?.label ?? tab)
}

async function closeTasksRunBy($: EngineInterface, command: string) {
  const ran = tasksRunBy((await read($, SESSION)).ledger, command)
  if (ran.length === 0) return
  const now = await $.clock.now()
  await commitLedger($, l =>
    ran.reduce((after, item) => closeItem(after, item.id, { how: 'done', outcome: 'you ran it' }, now), l),
  )
}

async function linkPrs($: EngineInterface, refs: string[]) {
  if (refs.length === 0) return
  const linked = (await read($, SESSION)).ledger.prs
  if (refs.every(r => linked.includes(r))) return
  await commitLedger($, l => withNewPrRefs(l, refs))
  void fetchPrs($, await isPrsTabShown($))
}

/** Marks whether a PR fetch runs, which the PRs tab shows. */
function markFetching($: EngineInterface, isFetching: boolean) {
  return commit($, currentOwner(), s =>
    s.prViews.isFetching === isFetching ? s : { ...s, prViews: { ...s.prViews, isFetching } },
  )
}

/**
 * Fetches the session's PRs, one fetch at a time. A fetch asked for while one runs follows it, and finds the
 * branch's PR when any of the asks wanted it.
 */
function fetchPrs($: EngineInterface, findsBranchPr: boolean): Promise<void> {
  if (nextFetchFindsBranchPr !== null) {
    nextFetchFindsBranchPr ||= findsBranchPr
    return fetchingPrs
  }
  nextFetchFindsBranchPr = findsBranchPr
  fetchingPrs = fetchingPrs
    .then(() => {
      const finds = nextFetchFindsBranchPr ?? false
      nextFetchFindsBranchPr = null
      return fetchPrsNow($, finds)
    })
    .catch(() => undefined)

  return fetchingPrs
}

async function fetchPrsNow($: EngineInterface, findsBranchPr: boolean) {
  const owner = currentOwner()
  await markFetching($, true)
  try {
    await fetchSessionPrs(hostOf($, owner), findsBranchPr)
  } finally {
    // Fetches run one at a time across conversations, so the drawn session reads whether one still runs.
    await markFetching($, nextFetchFindsBranchPr !== null)
  }
  void followNewRows($).catch(() => undefined)
}

async function pollPrs($: EngineInterface) {
  const [away, { ledger, prViews }, findsBranchPr] = await Promise.all([
    read($, AWAY),
    read($, SESSION),
    isPrsTabShown($),
  ])
  if (away.isAway || (!findsBranchPr && ledger.prs.length === 0 && prViews.branchRef === null)) return
  await fetchPrs($, findsBranchPr)
}

/** Takes a dismissed PR off the tab once its row settles, unless it is still tracked or the Dismiss was undone. */
function leavePr($: EngineInterface, ref: string, at: number) {
  const owner = currentOwner()
  later($, SETTLED_MS, () =>
    commit($, owner, s => {
      const mark = s.lastActions[prMarkId(ref)]
      if (mark?.action !== 'pr-dismiss' || mark.at !== at) return s
      if (isTracked(s.prViews, s.ledger.prs, ref) || !(ref in s.prViews.views)) return s
      const { [ref]: _left, ...views } = s.prViews.views
      return { ...s, prViews: { ...s.prViews, views } }
    }),
  )
}

function pressRowId(p: RowPress | PrPress): string {
  return 'ref' in p ? prRowId(p) : p.id
}

/** Tells Claude about rows closed with Done once their settle window has passed, unless a turn runs. */
async function wakeForDone($: EngineInterface) {
  await wakeSessionForDone(hostOf($, currentOwner()))
}

async function runPress($: EngineInterface, p: RowPress | PrPress, surface: UiPressArgument['surface']) {
  const mayStayOnRow = 'ref' in p ? ['pr-open', 'thread-open', 'log'].includes(p.action) : p.action === 'step'
  const undoRevision = mayStayOnRow ? suspendUndoReveal() : cancelUndoScroll()
  const rowId = pressRowId(p)
  if (p.action !== 'undo' && !rowId.startsWith('pr:')) await keepPressedOpen($, rowId)
  const wasWaiting = (await shownWaits($)).rows.some(r => r.id === rowId && r.isWaiting)
  if (await read($, DEMO)) return runDemoPress($, p, wasWaiting, undoRevision, surface)
  const [now, { ledger }] = await Promise.all([$.clock.now(), read($, SESSION)])
  const draft = !('ref' in p) && p.action === 'type' ? (await read($, DRAFTS))[p.id] : undefined
  const isReplyToClosed = !('ref' in p) && p.action === 'type' && !isOpenIn(ledger, p.id)
  if (!('ref' in p) && p.action === 'type') {
    // A held row stays drawn by its draft's words once its field closes, until the press records its reply.
    await update($, DRAFTS, d => {
      const typed = d[p.id]
      return typed ? { ...d, [p.id]: { ...typed, text: p.text } } : d
    })
    await update($, TYPING, t => (t === p.id ? null : t))
  }
  const [typing, drafts, discarded] = await Promise.all([read($, TYPING), read($, DRAFTS), read($, DISCARDED)])
  const started = await startPress(hostOf($, currentOwner(), surface), p, false, {
    replies: heldReplies(typing, drafts),
    discarded,
  })
  const effects = started.effects
  if (!effects) {
    if ((await started.finish()).note !== 'stale') return
    await Promise.all([
      update($, NOTES, n => ({ ...n, [rowId]: { note: 'stale' as const, at: now } })),
      'id' in p && p.action === 'type'
        ? update($, DRAFTS, d => ({ ...d, [p.id]: { text: p.text, since: d[p.id]?.since ?? now } }))
        : undefined,
    ])
    later($, SETTLED_MS, () =>
      update($, NOTES, n => {
        if (n[rowId]?.at !== now) return n
        const { [rowId]: _gone, ...rest } = n
        return rest
      }),
    )
    return
  }
  const sends = effects.some(e => e.kind === 'send')
  if (mayStayOnRow && sends) cancelUndoScroll()
  await Promise.all([
    update($, NOTES, n => {
      if (!(rowId in n)) return n
      const { [rowId]: _gone, ...rest } = n
      return rest
    }),
    'id' in p && p.action === 'type'
      ? update($, DRAFTS, d => {
          const { [p.id]: _sent, ...rest } = d
          return rest
        })
      : undefined,
  ])
  const undoKey = await undoKeyAfterPress($, p, surface)
  const canRevealUndo = undoKey !== null && undoRevision === undoScrollRevision
  const { isMoved, undoBlock } = await openAfterClose($, rowId, wasWaiting, canRevealUndo)
  if (canRevealUndo) await keepUndoVisible($, undoKey, undoBlock, now, undoRevision)
  if (!('ref' in p) && p.action === 'done') later($, SETTLED_MS, () => wakeForDone($))
  if (!('ref' in p) && p.action === 'address') redrawWhileLeaving($, now + SETTLED_MS)
  if (isReplyToClosed && effects.length > 0) redrawWhileLeaving($, now + SETTLED_MS)
  if ('ref' in p && p.action === 'pr-dismiss') {
    redrawWhileLeaving($, now + SETTLED_MS)
    leavePr($, p.ref, now)
  }
  if (!('ref' in p) && p.action === 'undo') await selectRestored($, p.id)
  // A success note clears after SETTLED_MS, and a message still on its way after QUEUED_AFTER_MS reads Queued from
  // then. A fresh value is what redraws the pane at each.
  if (effects.some(e => e.kind !== 'send')) later($, SETTLED_MS, () => redraw($))
  if (sends) later($, QUEUED_AFTER_MS, () => redraw($))
  const outcome = await started.finish()
  if (!outcome.isRowFailed) return
  if (!('ref' in p) && p.action === 'type')
    await update($, DRAFTS, d => (d[p.id] ? d : { ...d, [p.id]: { text: p.text, since: draft?.since ?? now } }))
  if (isMoved) {
    cancelUndoScroll()
    await reopenPressed($, rowId)
    if (undoKey) await scrollToRow($, rowId)
  }
  void publishStatus($)
}

async function undoKeyAfterPress(
  $: EngineInterface,
  p: RowPress | PrPress,
  surface: UiPressArgument['surface'],
): Promise<string | null> {
  if (surface !== 'terminal' || !isInlineTerminalPane) return null
  const { ledger, prViews, lastActions, view, now } = await drawnState($)
  if ('ref' in p) {
    if (p.action !== 'pr-dismiss') return null
    return drawnPrs(prViews, ledger.prs, lastActions, now).some(x => x.pr.ref === p.ref && x.isSettled)
      ? `undo-${pressRowId(p)}`
      : null
  }
  const row = allRows(view).find(r => r.id === p.id)
  return row?.state.is === 'settled' && row.actions.some(a => a.press.action === 'undo')
    ? `undo-${pressRowId(p)}`
    : null
}

async function shownWaits($: EngineInterface) {
  const [{ ledger, prViews: prState, lastActions, view, now }, tab] = await Promise.all([drawnState($), read($, TAB)])
  const prViews = drawnPrs(prState, ledger.prs, lastActions, now)
    .filter(x => !x.isSettled)
    .map(x => x.pr)

  return {
    tab,
    rows: tabWaits(tab, view, prViews, lastActions),
    ids: tabRowIds(view, prViews)[tab],
  }
}

async function openAfterClose(
  $: EngineInterface,
  id: string,
  wasWaiting: boolean,
  skipScroll = false,
): Promise<{ isMoved: boolean; undoBlock: UiScrollBlock }> {
  const [{ tab, rows, ids }, selection] = await Promise.all([shownWaits($), read($, SELECTION)])
  if (!wasWaiting || selection[tab].id !== id || rows.find(r => r.id === id)?.isWaiting)
    return { isMoved: false, undoBlock: 'nearest' }
  const following = rowAfterClose(rows, id)
  const index = following === null ? -1 : ids.indexOf(following)
  if (following !== null && index >= 0) await select($, tab, following, index, !skipScroll)
  else await update($, SELECTION, s => ({ ...s, [tab]: { ...NO_CURSOR, index: s[tab].index } }))

  return {
    isMoved: true,
    undoBlock:
      following === null
        ? 'nearest'
        : rows.findIndex(r => r.id === following) > rows.findIndex(r => r.id === id)
          ? 'start'
          : 'end',
  }
}

async function reopenPressed($: EngineInterface, id: string) {
  const tab = await read($, TAB)
  await update($, SELECTION, s => ({ ...s, [tab]: { id, index: s[tab].index, openedAt: 0 } }))
}

async function selectRestored($: EngineInterface, id: string) {
  const ids = tabRowIds((await drawnState($)).view, [])
  const tab: Tab = ids.findings.includes(id) ? 'findings' : 'needsYou'
  const index = ids[tab].indexOf(id)
  if (index >= 0) await select($, tab, id, index)
}

async function runDemoPress(
  $: EngineInterface,
  p: RowPress | PrPress,
  wasWaiting: boolean,
  undoRevision: number,
  surface: UiPressArgument['surface'],
) {
  const now = await $.clock.now()
  const rowId = pressRowId(p)
  if (!('ref' in p) && p.action === 'type') await update($, TYPING, t => (t === p.id ? null : t))
  let applied = { stale: true } as Applied
  let isClosing = false
  const [isRecording, typing, drafts] = await Promise.all([read($, DEMO_RECORDING), read($, TYPING), read($, DRAFTS)])
  const held = new Set(Object.keys(heldReplies(typing, drafts)))
  await update($, DEMO, d => {
    if (!d) return d
    const sample = emptySession()
    const r = pressOn(
      {
        ...sample,
        ledger: d.ledger,
        prViews: d.prViews,
        lastActions: d.lastActions,
        presence: { ...sample.presence, turnsStarted: d.turns.turnsStarted },
      },
      p,
      now,
    )
    applied = r
    const { [rowId]: _replaced, ...notes } = d.notes
    if ('stale' in r) return { ...d, notes: { ...notes, [rowId]: { note: 'stale' as const, at: now } } }
    isClosing =
      hasNewClose(d.ledger, r.ledger) ||
      ('ref' in p ? p.action === 'pr-dismiss' : p.action === 'address') ||
      (!('ref' in p) && p.action === 'type' && !isOpenIn(d.ledger, p.id))
    const { isSample, ...after } = demoAfterPress({ lastActions: d.lastActions, turns: d.turns }, r, held)

    return {
      ...d,
      ...after,
      notes: isSample && !isRecording ? { ...notes, [rowId]: { note: 'sample' as const, at: now } } : notes,
    }
  })
  const pressed = applied
  if (!('ref' in p) && p.action === 'type')
    await update($, DRAFTS, d => {
      if ('stale' in pressed) return { ...d, [p.id]: { text: p.text, since: d[p.id]?.since ?? now } }
      const { [p.id]: _sent, ...rest } = d
      return rest
    })
  if (!('stale' in pressed) && !('ref' in p) && p.action === 'undo') await selectRestored($, p.id)
  if (!('stale' in pressed)) {
    const undoKey = await undoKeyAfterPress($, p, surface)
    const canRevealUndo = undoKey !== null && undoRevision === undoScrollRevision
    const { undoBlock } = await openAfterClose($, rowId, wasWaiting, canRevealUndo)
    if (canRevealUndo) await keepUndoVisible($, undoKey, undoBlock, now, undoRevision)
  }
  if ('stale' in pressed || pressed.effects.length > 0)
    later($, SETTLED_MS, () => update($, DEMO, d => d && { ...d, turns: demoTurns(d.turns, [], true) }))
  if (isClosing) redrawWhileLeaving($, now + SETTLED_MS)
}

type Action = {
  key: string
  label: string
  variant?: 'primary'
  emphasis?: ActionEmphasis
  icon?: string
  kind: PressKind
  /**
   * A hot reload keeps work an `onPress`
   * returns and drops work it leaves running, so a returned press's result still lands.
   */
  onPress: (press: UiPressArgument) => void | Promise<void>
}

type KeyAction = Action & { hotkey?: string }

const ACTION_GLYPHS: Partial<Record<ActionIcon, string>> = { run: '▶', copy: '⧉', open: '↗', retry: '↻' }

const PR_KEYS: Record<PrPress['action'], string> = {
  'thread-address': 'address',
  'thread-draft': 'draft',
  'thread-open': 'open',
  'thread-discuss': 'discuss',
  'pr-conflicts': 'resolve',
  'pr-address-all': 'address-all',
  'pr-merge': 'merge',
  'pr-open': 'open',
  'pr-dismiss': 'dismiss-pr',
  'pr-undo': 'undo-pr',
  'check-fix': 'fix',
  log: 'log',
}

function rowKeyActions($: EngineInterface, r: RowView, isAllShown: boolean): { keys: KeyAction[]; more: KeyAction[] } {
  const { id, item, finding } = r
  const keyAction = (k: PlannedKey): KeyAction => {
    switch (k.slot) {
      case 'retry':
        return {
          key: `retry-${id}`,
          label: k.label,
          icon: ACTION_GLYPHS[k.icon],
          emphasis: k.emphasis,
          kind: k.kind,
          onPress: press => runPress($, k.press, press.surface),
        }
      case 'allOptions':
        return {
          key: `all-options-${id}`,
          label: k.label,
          emphasis: k.emphasis,
          kind: 'view',
          onPress: () => void update($, OPTIONS_SHOWN, s => (s.includes(id) ? s : [...s, id])),
        }
      case 'choice': {
        const { action: a, hotkey } = k
        const p = a.press
        const base = {
          label: a.label,
          kind: a.kind,
          emphasis: a.emphasis,
          ...(hotkey ? { hotkey } : {}),
          onPress: (press: UiPressArgument) => runPress($, p, press.surface),
        }
        if (p.action === 'answer')
          return {
            ...base,
            key: `answer-${id}-${(item?.options ?? []).indexOf(p.option)}`,
            ...(a.isPrimary ? { variant: 'primary' as const } : {}),
          }
        const icon = a.icon && ACTION_GLYPHS[a.icon]
        return { ...base, ...(icon ? { icon } : {}), key: `help-${id}-${p.step}` }
      }
      case 'action': {
        const { action: a, hotkey } = k
        const p = a.press
        const presentation = { emphasis: a.emphasis }
        if (p.action === 'type')
          return {
            label: a.label,
            kind: 'view',
            key: `typekey-${id}`,
            hotkey,
            ...presentation,
            onPress: () => void startTyping($, id),
          }
        if (p.action === 'discard')
          return {
            label: a.label,
            kind: a.kind,
            key: `discard-${id}`,
            hotkey,
            ...presentation,
            onPress: () => void discardReply($, id),
          }
        return {
          label: a.label,
          kind: a.kind,
          key: p.action === 'dismiss' && finding ? `drop-${id}` : `${p.action}-${id}`,
          hotkey,
          ...presentation,
          onPress: press => runPress($, p, press.surface),
        }
      }
    }
  }
  const { keys, more } = rowKeyPlan(r, isAllShown)

  return { keys: keys.map(keyAction), more: more.map(keyAction) }
}

type ClosedLine = Pick<Closed, 'id' | 'ask' | 'at' | 'how' | 'outcome'> & {
  outcomeLabel: string
  delivery: Parameters<typeof settledLabel>[1]
}

function desktopTabSizes(
  tabs: { label: string; count: number }[],
  columns: number,
): { widths: number[]; gap: number; hasCounts: boolean } {
  const steps = [
    { padding: 1, gap: 1, hasCounts: true },
    { padding: 0, gap: 1, hasCounts: true },
    { padding: 0, gap: 0, hasCounts: true },
    { padding: 0, gap: 0, hasCounts: false },
  ]
  const sizes = steps.map(({ padding, gap, hasCounts }) => ({
    widths: tabs.map(t => {
      const text = hasCounts && t.count > 0 ? `${t.label}${TAB_COUNT_GAP}${t.count}` : t.label
      // A tab's rounded frame insets its label FRAME_INSET_PT on each side, so its width adds those columns,
      // rounded up, to what the label needs. Narrower, the label wraps inside the tab.
      return (
        Math.ceil(text.length / DESKTOP_CHARS_PER_CELL) + Math.ceil((2 * FRAME_INSET_PT) / DESKTOP_CELL_PT) + padding
      )
    }),
    gap,
    hasCounts,
  }))

  return (
    sizes.find(s => s.widths.reduce((sum, w) => sum + w, 0) + s.gap * (s.widths.length - 1) <= columns) ?? sizes.at(-1)!
  )
}

async function drawnState(
  $: EngineInterface,
): Promise<DemoCopy & { view: InboxView; isDemo: boolean; showsDemoNotices: boolean; isUnread: boolean; now: number }> {
  const [session, notes, demo, isDemoRecording, unreadable, typing, drafts, discarded, now] = await Promise.all([
    read($, SESSION),
    read($, NOTES),
    read($, DEMO),
    read($, DEMO_RECORDING),
    read($, UNREADABLE),
    read($, TYPING),
    read($, DRAFTS),
    read($, DISCARDED),
    $.clock.now(),
    read($, REDRAW),
    // The minute tick while the person is away redraws the ages.
    read($, AWAY),
  ])
  const { ledger, stop, prViews, lastActions, presence, subagents } = session
  const turns = { turnsStarted: presence.turnsStarted, turnsApplied: presence.turnsApplied }
  const drawn: DemoCopy = demo ?? {
    ledger,
    stop,
    prViews,
    lastActions,
    notes,
    turns,
    subagents,
    presence: { isTurnRunning: presence.isTurnRunning, statedStep: presence.statedStep },
  }
  const holds = { replies: heldReplies(typing, drafts), discarded }

  const isUnread = demo === null && unreadable === conversation.id

  const view = sessionView(drawnSession(session, drawn), now, SETTLED_MS, CAN_CATCH_UP, holds, drawn.notes)

  return {
    ...drawn,
    lastActions: view.lastActions,
    view,
    isDemo: demo !== null,
    showsDemoNotices: demo !== null && !isDemoRecording,
    isUnread,
    now,
  }
}

async function setDemo($: EngineInterface, isShown: boolean, isRecording = false) {
  cancelUndoScroll()
  const now = await $.clock.now()
  await Promise.all([
    update($, DEMO, () => (isShown ? demoView(now) : null)),
    update($, DEMO_RECORDING, () => isShown && isRecording),
  ])
  await Promise.all([update($, SELECTION, () => NO_SELECTION), update($, TYPING, () => null)])
  if (isShown) redrawWhileLeaving($, now + SETTLED_MS)
  if ((await read($, TAB)) === 'prs') await findPrs($)
  await followNewRows($, true)
}

function registerInboxCommand($: EngineInterface) {
  return $.command
    .register({
      name: 'inbox',
      description: 'Show where this session stands and what is waiting on you',
      immediate: true,
    })
    .catch(() => undefined)
}

function ensureOn($: EngineInterface): Promise<void> {
  return turningOn ?? (isOn ? Promise.resolve() : turnOn($))
}

function turnOn($: EngineInterface): Promise<void> {
  return (turningOn ??= initializeInbox($).finally(() => {
    turningOn = null
  }))
}

async function readVersion($: EngineInterface) {
  try {
    const manifest: unknown = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
    const stated = (manifest as { version?: unknown } | null)?.version
    version = typeof stated === 'string' ? stated : null
  } catch {
    version = null
  }
}

async function initializeInbox($: EngineInterface) {
  // A hot reload keeps state an older build wrote. Draws start once isOn is set, and they read the current shape.
  await upgradeState($)
  isOn = true
  toolsRefused = false
  const refused = () => {
    toolsRefused = true
  }
  await Promise.all([
    registerInboxCommand($),
    readVersion($),
    ...agentTools(CLAUDE_CODE).map(tool => $.tool.register(tool).catch(refused)),
  ])
  // A pane kept across a hot reload is already drawn.
  if (toolsRefused) await redrawPane($)
  for (const interval of intervals) interval.cancel()
  intervals = [
    $.clock.every(60_000, () => {
      void tick($)
    }),
    $.clock.every(PR_POLL_MS, () => {
      void pollPrs($)
    }),
  ]
  await loadConversation($, await $.session.id())
  // After loadConversation, which brings saved state up to date.
  await redrawAfterReload($)
}

/**
 * Loads the conversation `id` the session runs: at the start, and after
 * /clear, /resume or /branch, which switch conversations under a new session
 * id without a session.start.
 */
function loadConversation($: EngineInterface, id: string, forkedFrom?: string): Promise<void> {
  const revision = ++loadRevision
  return prepareConversation($, id, revision, forkedFrom)
}

async function prepareConversation($: EngineInterface, id: string, revision: number, forkedFrom?: string) {
  const savedWrites = savedWriteCount()
  const [sessionRoot, saved] = await Promise.all([$.session.root(), readSettled($, id)])
  if (revision !== loadRevision) return
  const applying = applyingConversation.then(async () => {
    if (revision !== loadRevision) return
    // A write to a saved session after the read above, such as a refused Done message, is read again.
    const latest = savedWrites === savedWriteCount() ? saved : await readSettled($, id)
    // A fork continues its parent's inbox, so a new id with no saved state starts from the parent's.
    const parent = latest?.session || !forkedFrom ? null : await readSettled($, forkedFrom)
    await applyConversation($, id, revision, sessionRoot, latest, parent?.session)
  })
  applyingConversation = applying.catch(() => undefined)
  return applying
}

async function applyConversation(
  $: EngineInterface,
  id: string,
  revision: number,
  sessionRoot: string,
  saved: { session: SavedRecord | undefined } | null,
  parent?: SavedRecord,
) {
  if (revision !== loadRevision) return
  const isLoading = () => revision === loadRevision && conversation.id === id
  cancelUndoScroll()
  stopGeneration++
  resuming = null
  conversation.id = id
  conversation.root = sessionRoot
  recordedRows = null
  isReadingAgain = false
  // A reload stops any update the previous load had running, and state outlives
  // it, so an update in flight at load was cut off: record it as failed.
  // The theme read at the start is gone after /clear, so each conversation reads it.
  const [current] = await Promise.all([upgradeState($), syncTheme($)])
  await replaceDrawn($, cutOffUpdate)
  if (revision !== loadRevision) return
  const isFresh = current.turn === 0 && !current.card
  const isUnread =
    (await update($, UNREADABLE, u =>
      isLoading() ? (isFresh ? (saved === null ? id : null) : u === id ? u : null) : u,
    )) === id
  if (!isLoading()) return
  if (saved !== null) await bringBack($, parent ?? saved.session, isLoading, parent !== undefined)
  if (!isLoading()) return
  const { ledger, presence } = await read($, SESSION)
  const isEmpty = !ledger.card && ledger.items.length === 0
  const needsCatchUp =
    presence.ledgerState !== 'current' ||
    presence.turnsStarted > presence.turnsApplied ||
    (!isUnread && isEmpty && (await $.session.turns().catch(() => 0)) > 0)
  if (!isLoading()) return
  if (needsCatchUp) await catchUpNow($)
  void publishStatus($)
  if (ledger.prs.length > 0) void fetchPrs($, false)
}

/** An update a reload cut off reads as failed, so the next one catches up. */
function cutOffUpdate<S extends Session>(s: S): S {
  return s.presence.isUpdating ? { ...s, presence: { ...s.presence, isUpdating: false, ledgerState: 'failed' } } : s
}

/** Row presses keep only their PR records, whose rows outlive a conversation's items. */
function withoutRowActions(lastActions: Record<string, LastAction>): Record<string, LastAction> {
  return Object.fromEntries(Object.entries(lastActions).filter(([k]) => !/^[if]\d+$/.test(k)))
}

/**
 * Brings back a saved session into a conversation that has not run yet. A fork takes only its parent's ledger.
 * A message the saved session still waited on may never arrive now, so it reads unconfirmed, and its sent record is
 * dropped. A kept record would take the arrival of the same message sent again.
 */
async function bringBack(
  $: EngineInterface,
  saved: SavedRecord | undefined,
  isLoading: () => boolean,
  isFork = false,
): Promise<void> {
  if (!saved) return
  const loaded = upgradeSession(saved)
  let isBrought = false
  await replaceDrawn($, s => {
    isBrought = false
    if (!isLoading() || s.ledger.turn !== 0 || s.ledger.card) return s
    isBrought = true
    if (isFork) return forkedFrom(s, loaded)
    const lastActions = Object.fromEntries(
      Object.entries(loaded.lastActions).map(([id, a]) => [
        id,
        a.delivery?.state === 'queued' ? { ...a, delivery: { ...a.delivery, state: 'unconfirmed' as const } } : a,
      ]),
    )
    // The stop and the running turn belong to the process that saved them.
    return cutOffUpdate({ ...loaded, lastActions, sent: [], stop: null, turn: emptySession().turn })
  })
  if (isBrought && !isFork)
    await update($, AWAY, a => (isLoading() ? { ...a, lastActiveAt: saved.savedAt, isAway: true } : a))
}

/** Brings back a saved ledger once the store reads it again, under the turns the session ran meanwhile. */
async function restore($: EngineInterface, saved: SavedRecord) {
  conversation.generation += 1
  const loaded = upgradeSession(saved).ledger
  await Promise.all([
    replaceDrawn($, s => ({
      ...s,
      ledger: { ...loaded, turn: loaded.turn + s.ledger.turn },
      lastActions: withoutRowActions(s.lastActions),
    })),
    forgetRowState($),
  ])
}

async function forgetRowState($: EngineInterface) {
  await Promise.all([
    update($, SELECTION, () => NO_SELECTION),
    update($, TYPING, () => null),
    update($, UNFOLDED, () => []),
    update($, OPTIONS_SHOWN, () => []),
    update($, DRAFTS, () => ({})),
    update($, DISCARDED, () => ({})),
    update($, NOTES, () => ({})),
  ])
  fieldSeeds.clear()
}

async function readAgain($: EngineInterface) {
  if (isReadingAgain) return
  isReadingAgain = true
  const id = conversation.id
  if ((await read($, UNREADABLE)) !== id) {
    isReadingAgain = false
    return
  }
  await redrawPane($)
  const saved = await readSaved($, id)
  if (conversation.id !== id) return
  isReadingAgain = false
  if (saved !== null) {
    await update($, UNREADABLE, () => null)
    const current = (await read($, SESSION)).ledger
    const hasRun = current.turn !== 0 || current.card !== null
    if (hasRun && saved.session) await restore($, saved.session)
    else await bringBack($, saved.session, () => conversation.id === id)
    const { ledger } = await read($, SESSION)
    if (
      (hasRun && saved.session) ||
      (!ledger.card && ledger.items.length === 0 && (await $.session.turns().catch(() => 0)) > 0)
    )
      await catchUpNow($)
    void publishStatus($)
    if (ledger.prs.length > 0) void fetchPrs($, false)
    void followNewRows($).catch(() => undefined)
  }
  await redrawPane($)
}

function redrawPane($: EngineInterface) {
  return update($, SELECTION, s => ({ ...s }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await registerInboxCommand($)
    const r = await next(e)
    // The desktop app runs its sessions headless and attaches to them, before
    // or after this start. -p, the SDK and VS Code draw nothing, so the mod stays off there.
    if (e.isInteractive || (await $.session.surfaces()).includes('desktop')) await turnOn($)

    return r
  })

  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    await ensureOn($)

    return next(e)
  })

  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    const r = await next(e)
    // $.session.id() still names the previous conversation here, so the new id comes
    // from the event. A start with --resume also raises this, for the conversation
    // session.start already loaded.
    if (isOn && e.session_id !== conversation.id)
      await loadConversation($, e.session_id, e.source === 'fork' ? conversation.id : undefined)

    return r
  })

  on('session.end', async ($, e, next) => {
    endReason = e.reason
    loadRevision++
    stopGeneration++
    resuming = null
    if (isOn) {
      await Promise.all([
        replaceDrawn($, s => (s.stop ? { ...s, stop: null } : s)),
        update($, DIALOGS, () => []),
        update($, DEMO, () => null),
        update($, DEMO_RECORDING, () => false),
        publishStatus($, true),
      ])
    }
    // /clear, /resume and /branch (which reports resume) go on in this process with another conversation.
    if (isOn && (e.reason === 'clear' || e.reason === 'resume')) {
      conversation.generation += 1
      await Promise.all([
        replaceDrawn($, s => {
          const empty = cleared(s)

          return {
            ...empty,
            lastActions: withoutRowActions(s.lastActions),
            sent: [],
            heldRows: [],
            presence: { ...empty.presence, isUpdating: false },
          }
        }),
        forgetRowState($),
        update($, AWAY, a => ({ ...a, isAway: false })),
      ])
      resetTurn()
      shellCommand = null
      forgetStored()
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!isOn) return next(e)
    // Where a guard skips classic.SessionStart, the first prompt after /clear, /resume or /branch is what shows the
    // session has changed conversations. A reload that classic.SessionStart already did leaves the ids equal.
    const sessionId = await $.session.id()
    if (sessionId !== conversation.id) {
      const parent = endReason === 'resume' ? conversation.id : undefined
      endReason = null
      await loadConversation($, sessionId, parent || undefined)
    }
    const origin = e.origin
    // send() already recorded this mod's own prompts.
    if (origin.kind === 'plugin' && origin.name === 'inbox') return next(e)
    const isPersonsWords =
      origin.kind === 'composer' || origin.kind === 'bridge' || (origin.kind === 'plugin' && origin.asUser === true)
    if (!isPersonsWords) {
      if (!e.turnId) await commit($, currentOwner(), s => ({ ...s, turn: { ...s.turn, trigger: origin.kind } }))

      return next(e)
    }

    const notes = await notePrompt($, e.text)
    if (carriedFor !== conversation.id) {
      carriedFor = conversation.id
      const carry = cardCarryText((await read($, SESSION)).ledger)
      if (carry) notes.unshift(carry)
    }

    return notes.length === 0 ? next(e) : next({ ...e, context: [...(e.context ?? []), ...notes] })
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId) return next(e)
    isTurnRunning = true
    finalReply = null
    hasStopFromError = false
    // Counted here, before the
    // turn can end, since a reload can cut off its end-of-turn hook.
    if (isOn) {
      const before = await read($, SESSION)
      await commit($, currentOwner(), startTurn)
      if (before.stop) {
        stopGeneration++
        resuming = null
        void publishStatus($)
      }
    }

    return next(e)
  })

  on('tool.describe', { tool: RECORD_TOOL }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }))
  on('tool.call', { tool: RECORD_TOOL }, async ($, e) => ({
    result: await runTool($, 'record', e as unknown as Record<string, unknown>),
  }))
  on('tool.describe', { tool: CLOSE_TOOL }, async ($, e, next) => {
    const r = await next(e)

    return { ...r, description: guidedCloseDescription(CLAUDE_CODE, r.description), isDeferred: false }
  })
  on('tool.call', { tool: CLOSE_TOOL }, async ($, e) => ({
    result: await runTool($, 'close', e as unknown as Record<string, unknown>),
  }))

  on('tool.call', async ($, e, next) => {
    if (!isOn) return next(e)
    const { tool: _tool, tool_use_id: _id, agentId: _agent, ...input } = e as unknown as Record<string, unknown>
    const key = callKey(String(e.tool), input)
    const run = () =>
      clearingDialog($, key, () => next(e)).finally(() => {
        if (e.tool_use_id) askedCalls.delete(e.tool_use_id)
      })
    if (e.agentId) return run()
    const line = toolActivity(String(e.tool), input)
    if (line) await noteActivity($, line)
    if (String(e.tool) === TURN_BOX_TOOL) turnBox = turnBoxText(input) ?? turnBox
    if (e.tool === 'Bash') {
      const ran = await run()
      const found = commandFindings(e.command, ran.text ?? '')
      for (const line of found.lines) await noteActivity($, line)
      void linkPrs($, found.prRefs)

      return ran
    }
    if (e.tool === 'AskUserQuestion') {
      const questions = (Array.isArray(input.questions) ? input.questions : []) as { question?: unknown }[]
      const question = typeof questions[0]?.question === 'string' ? questions[0].question : 'A question'
      await openDialog($, { kind: 'question', text: question, key })
      const ran = await run()
      const outcome = dialogOutcome(ran)
      await noteActivity($, dialogActivity(dialogQuestions(input.questions), outcome))
      if (outcome.kind === 'dismissed') isDialogDismissed = true

      return ran
    }
    return run()
  })

  // A question dialog opens from its own tool call, which also raises a permission request.
  on('classic.PermissionRequest', async ($, e, next) => {
    hasPermissionRequestHook = true
    if (isOn && e.tool_name !== 'AskUserQuestion') {
      const input = (e.tool_input ?? {}) as Record<string, unknown>
      await openDialog($, {
        kind: 'permission',
        text: permissionText(e.tool_name, input),
        key: callKey(e.tool_name, input),
      })
    }

    return next(e)
  })

  // Where the guard skips classic.PermissionRequest, an ask shows its row only if the
  // call is still waiting after the delay: the auto-mode classifier can settle an ask in
  // well under that, and tool.check carries nothing that tells the two apart.
  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    const input = (e.input ?? {}) as Record<string, unknown>
    const key = callKey(e.tool, input)
    const id = e.tool_use_id
    const isDialogAsk = isOn && !hasPermissionRequestHook && !e.agentId && r.decision === 'ask'
    if (!id || !isDialogAsk || e.tool === 'AskUserQuestion') return r
    askedCalls.set(id, key)
    void $.clock
      .sleep(PERMISSION_FALLBACK_DELAY_MS)
      .then(async () => {
        if (!askedCalls.has(id) || hasPermissionRequestHook) return
        await openDialog($, { kind: 'permission', text: permissionText(e.tool, input), key })
      })
      .catch(() => undefined)

    return r
  })

  on('classic.StopFailure', async ($, e, next) => {
    const r = await next(e)
    if (!isOn || e.agent_id) return r
    hasStopFromError = true
    const message = e.last_assistant_message ?? ''
    await setStop($, {
      kind: stopKindOf(String(e.error), message),
      detail: String(e.error),
      resets: resetTime(message),
      at: await $.clock.now(),
    })

    return r
  })

  on('turn.step', async function* ($, e, next) {
    if (!isOn || e.agentId) return yield* next(e)
    if (finalReply !== null) sentBack.push(finalReply)
    finalReply = null
    const response = yield* next(e)
    const isFinalReply = response.toolUses.length === 0 && response.stopReason === 'end_turn'
    if (isFinalReply && response.answer.trim()) finalReply = response.answer

    return response
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    isTurnRunning = false
    askedCalls.clear()
    await closeDialogs($, null)
    if (!isOn) return r
    if (e.reason === 'error' && !hasStopFromError) await setStopFromLastReply($)
    void wakeForDone($).catch(() => undefined)
    void followNewRows($).catch(() => undefined)
    const hasReply = e.answer.trim() !== '' || turnBox !== null
    const isAnswered = e.reason === 'answer' && hasReply
    if (!isAnswered && !isDialogDismissed) return r

    const [tab, isShown, now, before] = await Promise.all([
      read($, TAB),
      isPaneShown($),
      $.clock.now(),
      read($, SESSION),
    ])
    const reply = [...sentBack, e.answer, turnBox ?? ''].filter(text => text.trim() !== '').join('\n\n')
    const queuesEmptyReply = isDialogDismissed
    resetTurn()
    await update($, AWAY, a => ({ ...a, lastActiveAt: now }))
    await commit($, currentOwner(), s =>
      endTurn(CLAUDE_CODE, s, reply, isShown, { tab: TABS.find(t => t.id === tab)?.label ?? tab, queuesEmptyReply }),
    )
    updateLedger($)
    if (prRefs(reply).some(ref => !before.ledger.prs.includes(ref))) void fetchPrs($, await isPrsTabShown($))

    return r
  })

  on(
    'session.append',
    { door: ['prompt', 'delivery'], origin: { kind: 'plugin', name: 'inbox' } },
    async ($, e, next) => {
      if (!isOn || e.agentId) return next(e)
      const text = messageText(e.message)
      const count = noteStored(text)
      const notes = await notePrompt($, text, current => arrived(current, text, count))
      if (notes.length > 0) await appendContext($, notes)

      return next(e)
    },
  )

  on('session.append', { door: 'command' }, async ($, e, next) => {
    const r = await next(e)
    if (!isOn || e.agentId) return r
    const row = readCommandRow(messageText(e.message))
    if (!row) return r
    const line = commandRowLine(row)
    if (line) await notePerson($, line)
    if (row.kind === 'shell') {
      shellCommand = row.command
    } else if (row.kind === 'output') {
      // The row has no exit code, so only a run with nothing on stderr closes a
      // task here.
      if (shellCommand && !row.stderr) await closeTasksRunBy($, shellCommand)
      shellCommand = null
    } else if (row.name === 'login' && (await read($, SESSION)).stop?.kind === 'sign-in') {
      await setStop($, null)
    }

    return r
  })

  on('command.run', { command: 'inbox' }, async ($, e) => {
    if (!isOn && !turningOn && e.origin.kind !== 'composer') return {}
    await ensureOn($)
    const isShown = (await read($, DEMO)) !== null
    const args = e.args.trim().split(/\s+/).join(' ')
    if (args === 'demo' || args === 'demo recording') await setDemo($, !isShown, args === 'demo recording')
    else if ((await read($, TAB)) === 'prs') await findPrs($)
    const [isDemo, isDemoRecording] = await Promise.all([read($, DEMO).then(d => d !== null), read($, DEMO_RECORDING)])
    await showInbox($)

    return {
      text: !isDemo
        ? 'Opened the inbox.'
        : isDemoRecording
          ? 'Showing sample entries without their notices, for a recording. Run /inbox demo to go back.'
          : 'Showing sample entries in the inbox. Run /inbox demo again to go back.',
    }
  })

  on('ui.press', async ($, e, next) => {
    if (e.requestId === PANE && e.surface === 'terminal') {
      if (e.element.startsWith('fold-') || e.element === 'hide-demo') cancelUndoScroll()
      else suspendUndoReveal()
    }
    if (e.requestId === PANE && e.surface === 'desktop') {
      focusedKey = e.element
      focusHint = focusHintFor(e.element)
    }
    return next(e)
  })

  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') cancelUndoScroll()
    return next(e)
  })

  on('ui.message', async ($, e, next) => {
    const r = await next(e)
    if (e.requestId !== PANE) return r
    const data = e.data as { tab?: unknown; isUnfolded?: unknown; hover?: unknown; key?: unknown } | null
    const shown = TABS.find(t => t.id === data?.tab)
    const followUp = typeof data?.key === 'string' ? followUpPresses.get(data.key) : undefined
    if (e.element === 'tabs' && shown) await showTab($, shown.id)
    else if (e.element.startsWith('undo-') && followUp && typeof data?.key === 'string')
      followUp({
        plugin: 'inbox',
        element: data.key,
        component: e.component,
        requestId: e.requestId,
        surface: e.surface,
      })
    else if (e.element.startsWith('links-') && followUp && typeof data?.key === 'string') {
      // The Client is not a focusable key, so the next drawing moves the focus, to the hint first.
      focusedKey = e.element
      focusHint = focusHintFor(data.key)
      followUp({
        plugin: 'inbox',
        element: data.key,
        component: e.component,
        requestId: e.requestId,
        surface: e.surface,
      })
    } else if (e.element.startsWith('select-')) await selectClicked($, e.element.slice('select-'.length))
    else if (e.element.startsWith('fold-') && typeof data?.hover === 'boolean')
      await setFoldHover($, e.element.slice('fold-'.length), data.hover)
    else if (e.element.startsWith('fold-')) await setFold($, e.element.slice('fold-'.length), data?.isUnfolded)

    return r
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    cancelUndoScroll()
    const r = await next(e)
    await update($, TYPING, () => null)
    await update($, FOLD_HOVER, () => null)

    return r
  })

  // A running tool row means the permission step is over: the dialog was answered or the
  // auto-mode classifier approved the call. Live, 2026-10-22: isRunning stayed false while a
  // dialog was open and turned true when the tool started.
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (isOn && e.props.isRunning) endWaitFor($, e.props.tool_use_id)

    return next(e)
  })

  // A call folded into a collapsed group draws no ToolUse row; the group carries its state.
  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (isOn) for (const call of e.props.calls) if (call.isRunning) endWaitFor($, call.tool_use_id)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isOn || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const [{ ledger, stop, view, showsDemoNotices, now }, theme] = await Promise.all([drawnState($), read($, THEME)])
    if (!stop && !ledger.card && ledger.items.length === 0 && ledger.findings.length === 0) return next(e)
    // Every mod shares the band, and a tree without the drawing from next(e)
    // hides what the mods after this one draw there.
    const theirs = await next(e)
    const pal = paletteFor(theme, lookOf(e.surface))
    const counts = ROW_TABS.filter(t => view[t.id].count > 0).map(t => (
      <Text>
        <Text dimColor>{t.label} </Text>
        <Text color={pal.tone[t.id] ?? pal.mark[t.id]}>{view[t.id].count}</Text>
      </Text>
    ))

    // On desktop a native button is taller than
    // a line of text, so the text sits level with its top.
    const countLine = (
      <Box flexDirection="row" alignItems="flex-start" gap={1}>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end">
            {showsDemoNotices ? <Text dimColor>Demo: </Text> : null}
            {counts.length > 0 ? (
              counts.flatMap((p, n) => (n === 0 ? [p] : [<Text dimColor>{DOT}</Text>, p]))
            ) : (
              <Text dimColor>Nothing needed</Text>
            )}
          </Text>
        </Box>
        {showsDemoNotices ? <Button key="hide-demo" label="Hide demo" onPress={() => void setDemo($, false)} /> : null}
        <Button key="open-inbox" label="Open inbox" onPress={() => void openInbox($)} />
      </Box>
    )
    if (!stop)
      return (
        <Box flexDirection="column">
          {countLine}
          {theirs}
        </Box>
      )

    // An API error resumes from
    // [Resume], which keeps its key while it sends, so the desktop app keeps the band's focus.
    const canResume = isResumable(stop)
    const notSent = canResume && resuming?.is === 'refused' ? `Not sent: ${resuming.why}` : ''
    const isNotSentOwnRow = notSent !== '' && e.surface === 'desktop' && e.props.maxRows > 2
    const fix = canResume ? '' : stopFix(stop)
    const inlineNotSent = isNotSentOwnRow ? '' : notSent
    const stopLine = (
      <Box flexDirection="row" alignItems="flex-start" gap={1}>
        <Box flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end">
            <Text color="error">Stopped {ago(now - stop.at)}: </Text>
            {stopText(stop)}.{fix ? <Text dimColor> {fix}</Text> : null}
            {inlineNotSent ? <Text color="error"> {inlineNotSent}</Text> : null}
          </Text>
        </Box>
        {canResume ? (
          <Button
            key="resume"
            label={resuming?.is === 'sending' ? 'Resuming…' : 'Resume'}
            onPress={() => void resume($)}
          />
        ) : null}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {countLine}
        {e.props.maxRows > 1 ? stopLine : null}
        {isNotSentOwnRow ? <Text color="error">{notSent}</Text> : null}
        {theirs}
      </Box>
    )
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined) await update($, THEME, () => (typeof r.value === 'string' ? r.value : ''))

    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Link, Markdown, Text } = elements
    // Desktop draws every Button as a native button, and only clicks reach the pane: no letters, key hints or hidden hotkeys.
    const look = lookOf(e.surface)
    paneLook = look
    const hasClient = look === 'desktop' && 'Client' in elements
    // The mobile app draws no text field, so there the typed reply is not offered.
    const Input = 'Input' in elements ? elements.Input : null
    const isNarrowDesktop = look === 'desktop' && e.props.bodyColumns < DESKTOP_WIDE_AT
    const isAgeInSide = look === 'terminal'
    const isAgeDropped = isNarrowDesktop || isAgeInSide
    const glued = (after: string) => after.replace(/(?<=.)[ \u2002]/gs, c => (c === ' ' ? '\u00a0' : '\u2007'))
    // The Codex tab wraps a suffix too long for one line between words, so this does too.
    const unbroken = (after: string, width: number) => {
      const firstBreak = after.indexOf(' ')

      return after.length <= width || firstBreak < 0
        ? glued(after)
        : glued(after.slice(0, firstBreak)) + after.slice(firstBreak)
    }
    const isInline = e.props.placement === 'inline'
    isInlinePane = isInline
    if (e.surface === 'terminal') {
      isInlineTerminalPane = isInline
      if (!isInline && pendingUndoScroll) cancelUndoScroll()
    }
    const blankLine = isInline ? 0 : 1
    const space =
      look === 'desktop'
        ? { rowPad: 2 * DESKTOP_ROW_PAD, settledPad: 2 * DESKTOP_ROW_PAD, buttonGap: 1, isFoldGapped: false }
        : { rowPad: blankLine, settledPad: 0, buttonGap: 2, isFoldGapped: true }
    const [
      { ledger, prViews: prState, lastActions, notes, turns, stop, view, showsDemoNotices, isUnread, now },
      tab,
      selection,
      theme,
      typing,
      unfolded,
      foldHover,
      isKeyListShown,
      optionsShown,
      termProgram,
    ] = await Promise.all([
      drawnState($),
      read($, TAB),
      read($, SELECTION),
      read($, THEME),
      read($, TYPING),
      read($, UNFOLDED),
      read($, FOLD_HOVER),
      read($, IS_KEY_LIST_SHOWN),
      read($, OPTIONS_SHOWN),
      $.env.get('TERM_PROGRAM'),
    ])
    // A hot reload keeps TYPING but empties fieldSeeds, so an open field takes its seed again here.
    if (typing !== null && !fieldSeeds.has(typing)) fieldSeeds.set(typing, (await read($, DRAFTS))[typing]?.text ?? '')
    const size = isInline ? `${e.props.bodyColumns}x${e.props.scroll.bodyRows}` : null
    if (e.surface === 'terminal') terminalInlineSize = size
    if (size !== null && inlineSize !== null && size !== inlineSize) {
      const revision = undoScrollRevision
      later($, RESIZE_SCROLL_MS, () =>
        revision === undoScrollRevision ? scrollToOpenRow($, tab, e.surface) : undefined,
      )
    }
    inlineSize = size
    const shownPrs = drawnPrs(prState, ledger.prs, lastActions, now)
    const settledLayout = settledLayoutId(tab, view, shownPrs, lastActions, notes, now, terminalInlineSize)
    const prViews = shownPrs.map(x => x.pr)
    const pal = paletteFor(theme, look)
    const inlineText = (text: string) =>
      parseInline(text).map((s, n) => (
        <Text key={String(n)}>
          <Text
            bold={s.bold}
            italic={s.italic}
            strikethrough={s.strike}
            underline={s.link ? true : undefined}
            color={s.code ? 'permission' : undefined}
          >
            {s.text}
          </Text>
          {s.link ? <Text color={pal.muted}>{` ${s.link}`}</Text> : null}
        </Text>
      ))
    const terminalText = (lines: TerminalSpan[][]) =>
      lines.flatMap((line, n) => [
        ...(n > 0 ? ['\n'] : []),
        ...line.map((span, i) => (
          <Text
            key={`${n}-${i}`}
            bold={span.bold}
            italic={span.italic}
            strikethrough={span.strike}
            underline={span.link ? true : undefined}
            color={span.isLinkAddress ? pal.muted : span.code ? 'permission' : undefined}
          >
            {span.text}
          </Text>
        )),
      ])
    const raise = {
      dimColor: false,
      backgroundColor: pal.raised,
      inverse: false,
      ...(pal.raisedText ? { color: pal.raisedText } : {}),
    }
    const raiseEdge = { dimColor: false, color: pal.raised, inverse: false }

    type Row = {
      id: string
      view?: RowView
      handle: string
      /** A Button takes no color, so this handle is Text and only the row's text selects it. */
      handleTone?: Tone
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
    const itemRow = (r: RowView): Row => {
      const asked = r.at === null ? undefined : `${DOT}${ago(now - r.at)}`
      const mark = rowMark(r, look)
      const isHandedOff = r.state.is === 'handedOff'

      return {
        id: r.id,
        view: r,
        handle: mark.text,
        handleTone: mark.tone,
        ...(isHandedOff ? { fold: {} } : {}),
        title: r.title,
        titleAfter: asked,
        ...(r.at === null ? {} : { at: r.at }),
        hasSecondLine: r.replyKind === 'answer',
        body: null,
        keys: () => rowKeyActions($, r, optionsShown.includes(r.id)).keys,
        moreKeys: () => rowKeyActions($, r, optionsShown.includes(r.id)).more,
        typeHint: replyHint(r, 'Claude'),
      }
    }
    const findingBody = (detail: string, path: string | null, fitted?: TerminalSpan[][]) => (
      <Box flexDirection="column" rowGap={blankLine}>
        <Text wrap="wrap">{fitted ? terminalText(fitted) : inlineText(detail)}</Text>
        {path ? (
          <Text wrap="wrap">
            <Text color={pal.muted}>{ROW_COPY.relevantFile}</Text>
            <Text color="permission">{path}</Text>
          </Text>
        ) : null}
      </Box>
    )
    const findingRow = (r: RowView): Row => ({
      id: r.id,
      view: r,
      at: r.at ?? undefined,
      handle: rowMark(r, look).text,
      handleTone: rowMark(r, look).tone,
      ...(r.state.is === 'handedOff' ? { fold: {} } : {}),
      title: r.title,
      titleAfter: `${DOT}${ago(now - (r.at ?? now))}`,
      line: { text: r.title },
      body: findingBody(r.detail ?? '', r.fileName),
      clippedBody: (lines, width) =>
        lines < 1
          ? null
          : findingBody(
              r.detail ?? '',
              lines > 1 ? r.fileName : null,
              terminalTextLines(r.detail ?? '', width, Math.max(1, lines - (r.fileName && lines > 1 ? 1 : 0))),
            ),
      typeHint: replyHint(r, 'Claude'),
      keys: () => rowKeyActions($, r, true).keys,
      moreKeys: () => rowKeyActions($, r, true).more,
    })
    const isThreadSent = threadSentIn(lastActions)
    const prPress = (p: PrPress) => (press: UiPressArgument) => runPress($, p, press.surface)
    const prKeyAction = (a: PrAction, row: string): KeyAction => ({
      key: `${a.icon === 'retry' ? 'retry' : PR_KEYS[a.press.action]}-${row}`,
      label: a.label,
      emphasis: a.emphasis,
      kind: a.kind,
      ...(a.icon ? { icon: ACTION_GLYPHS[a.icon] } : {}),
      ...(a.hotkey ? { hotkey: a.hotkey } : {}),
      onPress: prPress(a.press),
    })
    const checkRowBase = (pr: PrView, c: PrCheck): Row => ({
      id: prCheckId(pr, c),
      handle: '✗',
      handleTone: 'error',
      title: c.name,
      line: { text: c.name },
      body: null,
      keys: () => checkActions(pr, c, lastActions).map(a => prKeyAction(a, `${pr.ref}-${c.name}`)),
    })
    const checkRow = (pr: PrView, c: PrCheck): Row => {
      const ran = checkRunText(c)
      return {
        ...checkRowBase(pr, c),
        ...(c.finishedAt !== undefined ? { at: c.finishedAt } : {}),
        line: { ...(c.workflow ? { before: `${c.workflow} / ` } : {}), text: c.name, after: ran },
        subtitle: <Text color={pal.muted}>{c.workflow ? `${c.workflow}${DOT}${ran}` : ran}</Text>,
      }
    }
    const threadRow = (pr: PrView, t: PrThread): Row => {
      const id = prThreadId(pr, t)
      const { rest } = commentParts(t.body)
      const where = (
        <Text color={pal.muted} wrap="wrap">
          <Link href={t.reply?.url || t.url}>
            <Text underline>{threadWhere(t)}</Text>
          </Link>
          {DOT}@{t.author}
        </Text>
      )
      const comment = (
        <Box flexDirection="column">
          {rest ? <Markdown text={clipLabel(rest, 1200)} /> : null}
          {where}
          {t.reply ? (
            <Markdown text={`**@${t.reply.author}:** ${clipLabel(readableComment(t.reply.body), 1200)}`} />
          ) : null}
        </Box>
      )
      const replyText = t.reply ? `@${t.reply.author}: ${readableComment(t.reply.body)}` : ''
      const clippedComment = (lines: number, width: number) => {
        if (lines < 1) return null
        const restLines = terminalTextLines(rest, width).length
        const replyLines = terminalTextLines(replyText, width).length
        const rawTextLines = lineCount(rest, width) + 1 + lineCount(replyText, width)
        if (rawTextLines <= lines && restLines + 1 + replyLines <= lines) return comment
        const restShown = Math.min(restLines, lines - 1)
        const replyShown = Math.min(replyLines, lines - 1 - restShown)

        return (
          <Box flexDirection="column">
            {rest && restShown > 0 ? (
              <Text wrap="wrap">{terminalText(terminalTextLines(rest, width, restShown))}</Text>
            ) : null}
            {where}
            {replyShown > 0 ? (
              <Text wrap="wrap">{terminalText(terminalTextLines(replyText, width, replyShown))}</Text>
            ) : null}
          </Box>
        )
      }
      const text = threadRowText(pr, t, lastActions)

      return {
        id,
        handle: text.showsCheck ? '✓' : '◦',
        handleTone: text.showsCheck ? 'done' : undefined,
        ...(text.fold ? { fold: text.fold } : {}),
        title: text.title,
        ...(t.at === null ? {} : { at: t.at }),
        line: {
          before: '',
          text: commentLine(t.body),
          after: text.meta,
        },
        body: comment,
        clippedBody: clippedComment,
        keys: () => threadActions(pr, t, lastActions).flatMap(a => (a.isFollowUp ? [] : [prKeyAction(a, t.id)])),
        moreKeys: () => threadActions(pr, t, lastActions).flatMap(a => (a.isFollowUp ? [prKeyAction(a, t.id)] : [])),
      }
    }

    type Entry = DrawnEntry<Row>
    const lists = drawnLists(
      view,
      () => true,
      r => (r.item ? itemRow(r) : r.finding ? findingRow(r) : null),
    )
    const needsYouGroups = NEEDS_YOU_GROUPS.map(g => ({ ...g, entries: lists[g.list], rows: rowsIn(lists[g.list]) }))
    const findingEntries = lists.findings
    const prGroups = shownPrs
      .map(({ pr, isSettled }) => ({
        pr,
        isSettled,
        checks: isSettled ? [] : failingChecks(pr).map(c => checkRow(pr, c)),
        threads: isSettled ? [] : waitingThreads(pr).map(t => threadRow(pr, t)),
      }))
      .map(g => ({ ...g, rows: [...g.threads, ...g.checks] }))
    const rows: Record<Tab, Row[]> = {
      needsYou: lists.byTab.needsYou,
      findings: lists.byTab.findings,
      prs: prGroups.flatMap(g => g.rows),
    }
    const tabCounts: Record<Tab, number> = {
      needsYou: view.needsYou.count,
      findings: view.findings.count,
      prs: prGroups.filter(g => !g.isSettled && prNeedsYou(g.pr, isThreadSent)).length,
    }
    const tabText = (id: Tab, label: string) => `${label}${tabCounts[id] > 0 ? ` ${tabCounts[id]}` : ''}`
    const hasRail = isInline && look === 'terminal' && e.props.bodyColumns >= INLINE_RAIL_AT
    const railWidth = Math.max(...TABS.map(t => tabText(t.id, t.label).length)) + 2 * TAB_PAD.length
    const listColumns = e.props.bodyColumns - 2 - (hasRail ? railWidth + RAIL_GUTTER : 0)
    const ids = rows[tab].map(r => r.id)
    const indexOf = new Map(ids.map((id, n) => [id, n]))
    const cursor = selection[tab]
    const settledIds = new Set(settledRowIds(allRows(view)))
    const top = firstWaiting(
      tabWaits(
        tab,
        view,
        shownPrs.filter(x => !x.isSettled).map(x => x.pr),
        lastActions,
      ),
    )
    const at = selectedIndex(ids, cursor, top, id => settledIds.has(id))
    const isOpenGuarded = isGuarded(cursor.openedAt, now)

    const shownLabel = (a: Pick<KeyAction, 'label' | 'variant'>) =>
      actionLabel({ label: a.label, isPrimary: a.variant === 'primary' })
    const desktopLabel = (a: Pick<KeyAction, 'label' | 'variant' | 'icon'>) =>
      a.icon ? `${a.icon} ${shownLabel(a)}` : shownLabel(a)
    const keyedButton =
      (rowId: string, isFollowUp = false) =>
      ({ hotkey, kind: _kind, emphasis, icon, ...action }: KeyAction) => {
        const { label: _label, ...unlabeled } = action

        return look === 'desktop' ? (
          <Button
            {...action}
            {...(isFollowUp ? { plain: true } : emphasis === 'primary' ? { variant: 'primary' as const } : {})}
            label={desktopLabel({ ...action, ...(icon ? { icon } : {}) })}
            {...(isOpenGuarded ? { dimColor: true } : {})}
            onPress={press => unlessGuarded($, rowId, press, action.onPress)}
          />
        ) : (
          <Box key={`keyed-${action.key}`} flexDirection="row">
            <Button
              plain
              {...unlabeled}
              {...(isOpenGuarded ? { dimColor: true } : {})}
              hover={{ color: pal.muted, inverse: true }}
              onPress={press => unlessGuarded($, rowId, press, action.onPress)}
            >
              {hotkey ? (
                <Text color={pal.key} dimColor={isOpenGuarded} hover={{ color: pal.muted, inverse: true }}>
                  {hotkey}
                </Text>
              ) : null}
              {hotkey ? `: ${shownLabel(action)}` : shownLabel(action)}
            </Button>
          </Box>
        )
      }
    // Emptied here, after the drawing's reads, so a click that lands while they run still finds the last presses.
    followUpPresses.clear()
    const followUpLinks = (rowId: string, more: KeyAction[]) => {
      if (!hasClient) return null
      for (const a of more) followUpPresses.set(a.key, press => unlessGuarded($, rowId, press, a.onPress))
      const props: LinksProps = {
        links: more.map(a => {
          const label = desktopLabel(a)
          return { key: a.key, label, width: label.length / DESKTOP_CHARS_PER_CELL + 0.5 }
        }),
        gap: 1.5,
        fallbackColumns: listColumns - DESKTOP_MARK_CELLS - DESKTOP_SIDE_CELLS - 1,
        isGuarded: isOpenGuarded,
        colors: { muted: pal.muted, hover: null },
      }

      // A Client takes no flexShrink or minWidth, so this Box gives it the room left on its line.
      return (
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <elements.Client key={`links-${rowId}`} module="./links-client.tsx" width="100%" props={props} />
        </Box>
      )
    }
    const keyRow = (rowId: string, keys: KeyAction[], more: KeyAction[] = []) => (
      <Box
        flexDirection="row"
        flexWrap="wrap"
        alignItems="center"
        columnGap={space.buttonGap}
        rowGap={look === 'desktop' ? 1 : 0}
      >
        {keys.map(keyedButton(rowId))}
        {look === 'terminal' && keys.length > 0 && more.length > 0 ? <Text color={pal.muted}>·</Text> : null}
        {more.length > 0 ? (followUpLinks(rowId, more) ?? more.map(keyedButton(rowId, true))) : null}
      </Box>
    )
    const keyBindings = (keys: KeyAction[], suffix = '') =>
      keys.flatMap(({ key, hotkey, kind: _kind, emphasis: _emphasis, icon: _icon, ...k }) =>
        hotkey ? [<Button key={`${key}${suffix}`} plain hotkey={hotkey} {...k} label={shownLabel(k)} />] : [],
      )
    const keysWidth = (keys: KeyAction[], more: KeyAction[]) => {
      const all = [...keys, ...more]
      const dot = keys.length > 0 && more.length > 0 ? 3 : 0

      return (
        all.reduce((w, k) => w + (k.hotkey ? k.hotkey.length + 2 : 0) + shownLabel(k).length, 0) +
        2 * Math.max(0, all.length - 1) +
        dot
      )
    }
    const keyLines = (keys: KeyAction[], more: KeyAction[], width: number) => {
      if (keysWidth(keys, more) <= width) return 1
      const wrappedLines = (actions: KeyAction[]) => {
        let lines = 0
        let used = 0
        for (const k of actions) {
          const w = (k.hotkey ? k.hotkey.length + 2 : 0) + shownLabel(k).length
          if (used > 0 && used + 2 + w <= width) used += 2 + w
          else {
            lines++
            used = w
          }
        }
        return lines
      }

      return wrappedLines(keys) + wrappedLines(more)
    }
    const pressable = (keys: KeyAction[]) => keys.filter(k => Input || !k.key.startsWith('typekey-'))
    const leaveBar = (at: number) => {
      if (look !== 'terminal') return null
      const halves = Math.ceil((Math.max(0, SETTLED_MS - (now - at)) / SETTLED_MS) * LEAVE_BAR_STEPS)

      return halves > 0 ? (
        <Text color={pal.muted}>{'─'.repeat(Math.floor(halves / 2)) + (halves % 2 ? '╴' : '')}</Text>
      ) : null
    }
    const rowActions = (row: Row): { keys: KeyAction[]; more: KeyAction[] } => {
      if (Input && row.typeHint && typing === row.id) return { keys: [], more: [] }

      return {
        keys: pressable(row.keys()),
        more: pressable(row.moreKeys?.() ?? []),
      }
    }
    const fieldActions = (row: Row): KeyAction[] => [
      {
        key: `send-${row.id}`,
        label: ROW_COPY.send,
        kind: 'handoff',
        onPress: press => sendDraft($, row.id, press.surface),
      },
      row.view && fieldExit(row.view) === 'discard'
        ? {
            key: `discard-${row.id}`,
            label: ROW_COPY.discard,
            kind: 'view',
            onPress: () => void discardReply($, row.id),
          }
        : {
            key: `cancel-${row.id}`,
            label: ROW_COPY.cancel,
            kind: 'view',
            onPress: () => void update($, TYPING, t => (t === row.id ? null : t)),
          },
    ]
    const feedbackLabel = (id: string, row?: Row) => {
      const f = row?.view ? row.view.feedback : feedbackOf(id, lastActions[id], notes[id], turns, now)
      if (!f) return null

      return hasAge(f)
        ? {
            text: row?.view
              ? rowFeedbackText(row.view, look)!
              : f.is === 'done' && row?.handle === '✓'
                ? f.label
                : feedbackText(f, look),
            age: ago(now - f.at),
            isFailure: false,
          }
        : { text: feedbackText(f, look), age: '', isFailure: isFailure(f) }
    }
    const lastActionText = (id: string) => {
      const f = feedbackLabel(id)

      return f ? { text: [f.text, f.age].filter(Boolean).join(DOT), isFailure: f.isFailure } : null
    }
    const pressedAge = (row: Row) => {
      const f = feedbackLabel(row.id, row)

      return f?.age ? `${DOT}${[f.text, isAgeDropped ? '' : f.age].filter(Boolean).join(' ')}` : null
    }
    // The row clips, not this Box: once its row scrolled out of view,
    // Claude Code drew lines this Box clipped elsewhere in the pane (anthropics/claude-code#100030).
    // Desktop draws no tree: its lines differ in height, so stacked glyphs break into separate bars.
    const branch = (pos: TreePos, lead = 0, left = TREE_LINE_AT, color = pal.line) =>
      look === 'desktop' ? null : (
        <Box position="absolute" top={0} bottom={0} left={left} width={2}>
          <Text color={color}>{treeText(pos, lead)}</Text>
        </Box>
      )
    const columnsFor = (extra = 0) => {
      const base = look === 'desktop' ? ROW_COLUMNS.desktop : ROW_COLUMNS.tree
      return { ...base, textAt: base.textAt + extra }
    }
    const wideQuestions = view.needsYou.questions.some(r => r.handle.length > 2)
      ? new Set(view.needsYou.questions.map(r => r.id))
      : new Set<string>()
    const markExtra = (id: string) => (wideQuestions.has(id) ? 1 : 0)
    const markColumns = look === 'desktop' ? ROW_COLUMNS.desktop : ROW_COLUMNS.tree
    const markWidth = markColumns.textAt - markColumns.handleAt
    const treeRow = (
      pos: TreePos | null,
      marker: JSX.Element | null,
      content: JSX.Element,
      key?: string,
      depth = 0,
      lead = markColumns.handleAt + markWidth * depth,
      extra = 0,
    ) => (
      <Box key={key} flexDirection="row" alignItems="flex-start" overflow="hidden">
        <Box width={lead} flexShrink={0} />
        {marker ? (
          <Box width={markWidth + extra} flexShrink={0}>
            {marker}
          </Box>
        ) : null}
        <Box flexDirection="column" flexShrink={1} flexGrow={1} paddingRight={1}>
          {content}
        </Box>
        {pos ? branch(pos, 0, TREE_LINE_AT + markWidth * depth) : null}
      </Box>
    )
    const childPos = (n: number, count: number): TreePos => (n === count - 1 ? 'last' : 'mid')
    const rule = (inset: number) => (
      <Text color={pal.divider}>{'─'.repeat(Math.max(0, e.props.bodyColumns - inset))}</Text>
    )
    // Desktop draws text in a proportional font, where a run of ─ sized in cells overflows the
    // row and wraps into a second line, so there the rows sit flush and each pads itself.
    const divided = (rowEls: JSX.Element[], group: string, isBarred = (_n: number) => false, extra = 0) =>
      rowEls.flatMap((el, n) =>
        n === 0 || isInline || look === 'desktop' || isBarred(n - 1)
          ? [el]
          : [
              <Box key={`divider-${group}-${n}`} flexDirection="row">
                <Box width={TREE_LINE_AT} flexShrink={0} />
                <Box width={ROW_COLUMNS.tree.textAt - TREE_LINE_AT + extra} flexShrink={0}>
                  <Text color={pal.line}>│</Text>
                </Box>
                {rule(ROW_COLUMNS.tree.textAt + 2 + extra)}
              </Box>,
              el,
            ],
      )
    const buttonFrame = look === 'desktop' ? 2 : 0
    const closedLine = (row: Row) => {
      const plain = row.line ?? { text: row.title, age: row.titleAfter }
      const f = feedbackLabel(row.id, row)
      if (f)
        return {
          ...plain,
          after: `${DOT}${[f.text, isAgeDropped ? '' : f.age].filter(Boolean).join(' ')}`,
          afterTone: f.isFailure ? ('error' as const) : undefined,
        }

      return { ...plain, after: [plain.after, isAgeDropped ? '' : plain.age].filter(Boolean).join('') || undefined }
    }
    const unselectedLine = (row: Row, onPress: (press: UiPressArgument) => void, inset: number) => {
      const line = closedLine(row)
      const before = line.before?.length ?? 0
      const side = isAgeInSide ? TERMINAL_SIDE_CELLS : 0
      const width = listColumns - 1 - inset - side - before
      const perCell = look === 'desktop' ? DESKTOP_CHARS_PER_CELL : 1
      const budget = Math.floor((listColumns - 1 - inset - side - buttonFrame) * perCell) - before
      const isAfterCutting = line.after !== undefined && line.text.trim().length > budget - line.after.length
      const meta =
        look === 'terminal' && line.after && (!LEADING_DOT.test(line.after) || isAfterCutting)
          ? line.after.replace(LEADING_DOT, '')
          : null
      const room = Math.max(12, budget - (meta ? 0 : (line.after?.length ?? 0)))
      const text = line.text.trim()
      const space = text.lastIndexOf(' ', room)
      const isWrapped = look === 'terminal' && row.hasSecondLine === true && text.length > room && space > 0
      const first = isWrapped ? text.slice(0, space) : clipLabel(text, room)
      const second = isWrapped ? clipLabel(text.slice(space + 1), Math.max(12, width)) : null
      const afterRoom = budget - first.length
      const after = meta
        ? undefined
        : look === 'desktop' && line.after && line.after.length > afterRoom
          ? afterRoom >= 2
            ? clipLabel(line.after, afterRoom)
            : undefined
          : line.after
      const hover = second ? { hover: { scope: `title-${row.id}`.slice(0, 64), inverse: true } } : {}

      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            {line.before ? (
              <Box flexShrink={0}>
                <Text color={pal.muted}>{line.before}</Text>
              </Box>
            ) : null}
            <Box flexShrink={0}>
              <Button plain key={`title-${row.id}`} label={first} {...hover} onPress={onPress} />
            </Box>
            {after ? (
              <Text wrap="truncate-end" color={line.afterTone ? pal.tone[line.afterTone] : pal.muted}>
                {after}
              </Text>
            ) : null}
          </Box>
          {second ? (
            <Box paddingLeft={line.before?.length ?? 0}>
              <Button plain key={`title-${row.id}-2`} label={second} {...hover} onPress={onPress} />
            </Box>
          ) : null}
          {meta ? (
            <Text wrap="truncate-end" color={line.afterTone ? pal.tone[line.afterTone] : pal.muted}>
              {meta}
            </Text>
          ) : null}
        </Box>
      )
    }
    const ToneSvg = look === 'desktop' && 'Svg' in elements ? elements.Svg : null
    const toned = (row: Row) => {
      if (ToneSvg === null || !row.handle || !row.handleTone) return null
      return (
        <Box width={1} height={1} flexShrink={0}>
          <ToneSvg
            source={toneSvg(row.handleTone, row.handle)}
            alt={row.handle}
            width={DESKTOP_CELL_PT}
            height={DESKTOP_LINE_PT}
          />
        </Box>
      )
    }
    const sideAge = (row: Row) => {
      const f = row.view ? row.view.feedback : feedbackOf(row.id, lastActions[row.id], notes[row.id], turns, now)
      const at = f && hasAge(f) ? f.at : row.at
      return at === undefined ? '' : shortAgo(now - at)
    }
    const rowClientProps = (row: Row): RowProps => {
      const f = feedbackLabel(row.id, row)
      const text = row.line?.text ?? row.title

      return {
        markCells: DESKTOP_MARK_CELLS + markExtra(row.id),
        sideCells: DESKTOP_SIDE_CELLS,
        before: row.line?.before ?? '',
        title: text.trim(),
        after: f?.age ? f.text : (row.line?.after ?? '').replace(LEADING_DOT, '').trim(),
        side: sideAge(row),
        padY: DESKTOP_ROW_PAD,
        maxLines: row.hasSecondLine ? 4 : 2,
        charsPerCell: DESKTOP_CLIP_CHARS_PER_CELL,
        fallbackColumns: e.props.bodyColumns - 2,
        colors: {
          muted: pal.muted,
          after: f?.isFailure ? (pal.tone.error ?? null) : pal.muted,
          afterHover: f?.isFailure ? (pal.tone.error ?? null) : pal.muted,
          side: pal.age,
          hover: pal.raised,
          hoverText: pal.raisedText ?? null,
          pressed: pal.selection ?? pal.raised,
        },
      }
    }
    const desktopFrame = ({
      key,
      mark = null,
      side = null,
      fill,
      padY = space.rowPad,
      isCentered = false,
      indent = 0,
      isMarkHung = true,
      markCells = DESKTOP_MARK_CELLS,
      gapY = 0,
      children,
    }: {
      key?: string
      mark?: JSX.Element | null
      side?: JSX.Element | null
      fill?: string | undefined
      padY?: number
      isCentered?: boolean
      indent?: number
      isMarkHung?: boolean
      markCells?: number
      /** Space above and below the frame, in the hooks tree's half lines. */
      gapY?: number
      children: JSX.Element | (JSX.Element | null)[]
    }) => (
      <Box
        key={key}
        flexDirection="row"
        alignItems={isCentered ? 'center' : 'flex-start'}
        marginY={gapY}
        borderStyle="single"
        borderColor="#0000"
        paddingY={padY}
        {...(fill ? { backgroundColor: fill } : {})}
      >
        <Box
          width={indent + markCells + (isMarkHung ? 0 : 1)}
          {...(isCentered ? { height: 1 } : {})}
          flexShrink={0}
          paddingLeft={indent}
        >
          {mark ? (
            <Box position="absolute" top={0} left={isMarkHung ? indent - 1 : indent}>
              {mark}
            </Box>
          ) : null}
        </Box>
        <Box flexDirection="column" flexShrink={1} flexGrow={1} minWidth={0}>
          {children}
        </Box>
        <Box minWidth={DESKTOP_SIDE_CELLS} flexShrink={0} flexDirection="row" justifyContent="flex-end" paddingLeft={1}>
          {side}
        </Box>
      </Box>
    )
    const withSideAge = (row: Row, line: JSX.Element) =>
      isAgeInSide ? (
        <Box flexDirection="row">
          <Box flexGrow={1} flexShrink={1}>
            {line}
          </Box>
          <Box width={TERMINAL_SIDE_CELLS - 1} flexShrink={0} justifyContent="flex-end">
            <Text color={pal.age}>{sideAge(row)}</Text>
          </Box>
        </Box>
      ) : (
        line
      )
    const listRow = (row: Row, tree: TreePos) => {
      const columns = columnsFor(markExtra(row.id))
      const index = indexOf.get(row.id) ?? -1
      const isSelected = index === at
      // On desktop a Client takes a click on every cell of the row, where a Button takes one only on its label.
      if (!isSelected && hasClient)
        return (
          <Box key={`row-${row.id}`} flexDirection="row" overflow="hidden">
            {row.handle ? (
              <Box
                position="absolute"
                top={0}
                left={0}
                paddingLeft={(FRAME_INSET_PT - DESKTOP_CELL_PT) / DESKTOP_CELL_PT}
                paddingTop={space.rowPad}
              >
                {toned(row) ?? <Text color={row.handleTone ? pal.mark[row.handleTone] : undefined}>{row.handle}</Text>}
              </Box>
            ) : null}
            <Box position="relative" width="100%">
              <elements.Client
                key={`select-${row.id}`}
                module="./row-client.tsx"
                width="100%"
                props={rowClientProps(row)}
              />
            </Box>
          </Box>
        )
      const { keys, more } = isSelected ? rowActions(row) : { keys: [], more: [] }
      const isTyping = Input !== null && !!row.typeHint && typing === row.id
      const field =
        Input && isTyping ? (
          <Input
            key={`type-${row.id}`}
            placeholder={row.typeHint}
            {...(fieldSeeds.get(row.id) ? { value: fieldSeeds.get(row.id) } : {})}
            submitLabel={look === 'desktop' ? ROW_COPY.send : 'send'}
            autoFocus
            {...(look === 'terminal' ? { rows: REPLY_ROWS } : {})}
            onInput={(value: string) =>
              void update($, DRAFTS, d => ({ ...d, [row.id]: { text: value, since: d[row.id]?.since ?? now } }))
            }
            onSubmit={(value: string, submit) => sendTyped($, row.id, value, submit.surface)}
          />
        ) : null
      const f = feedbackLabel(row.id, row)
      const titleAfter = pressedAge(row) ?? (isAgeInSide ? undefined : row.titleAfter)
      const status = [
        ...(row.fold?.note ? [{ text: row.fold.note, color: pal.muted }] : []),
        ...(f && !f.age ? [{ text: f.text, color: f.isFailure ? pal.tone.error : pal.muted }] : []),
      ]

      const textWidth = listColumns - 1 - columns.textAt
      const titleWidth =
        look === 'desktop' ? Math.floor(textWidth * DESKTOP_CHARS_PER_CELL) : textWidth - TERMINAL_SIDE_CELLS
      const shownAfter = titleAfter ? unbroken(titleAfter, titleWidth) : ''
      const bodyLines =
        isSelected && isInline && look === 'terminal' && row.clippedBody
          ? e.props.scroll.bodyRows -
            2 * space.rowPad -
            lineCount(`${row.title}${shownAfter}`, titleWidth) -
            status.length -
            keyLines(keys, more, textWidth)
          : null
      const body =
        bodyLines !== null && row.clippedBody && row.body ? row.clippedBody(bodyLines, textWidth) : (row.body ?? null)
      const keysBlock = (
        <Box flexDirection="column" marginTop={blankLine}>
          {isTyping ? (
            look === 'desktop' ? (
              <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={space.buttonGap} rowGap={1}>
                <Box flexShrink={1}>{field}</Box>
                {/* The desktop Input supplies its own Send button. */}
                {keyRow(
                  row.id,
                  fieldActions(row).filter(a => !a.key.startsWith('send-')),
                )}
              </Box>
            ) : (
              [field, keyRow(row.id, fieldActions(row))]
            )
          ) : look === 'desktop' || keysWidth(keys, more) <= textWidth ? (
            keyRow(row.id, keys, more)
          ) : (
            [keyRow(row.id, keys), keyRow(row.id, more)]
          )}
        </Box>
      )
      // The `view-` Box is what select() scrolls into view. Drawn on the selected row alone, so the key exists only
      // once that row has redrawn expanded.
      if (look === 'desktop' && isSelected)
        return desktopFrame({
          key: `row-${row.id}`,
          markCells: DESKTOP_MARK_CELLS + markExtra(row.id),
          mark:
            toned(row) ??
            (row.handleTone ? <Text color={pal.mark[row.handleTone]}>{row.handle}</Text> : <Text>{row.handle}</Text>),
          side: <Text color={pal.age}>{sideAge(row)}</Text>,
          fill: pal.selection,
          gapY: (2 * SELECTED_GAP_PT) / DESKTOP_LINE_PT,
          children: [
            <Box key={`view-${row.id}`} position="absolute" top={0} bottom={0} left={0} width={1} />,
            <Text wrap="wrap">
              <Text bold>{row.title}</Text>
              {f?.age ? <Text color={pal.muted}>{unbroken(`${DOT}${f.text}`, titleWidth)}</Text> : null}
            </Text>,
            row.subtitle ?? null,
            row.body ? <Box marginTop={blankLine}>{row.body}</Box> : null,
            status.length > 0 ? (
              <Box flexDirection="column" marginTop={blankLine}>
                {status.map(st => (
                  <Text color={st.color} wrap="wrap">
                    {st.text}
                  </Text>
                ))}
              </Box>
            ) : null,
            keysBlock,
          ],
        })

      return (
        <Box
          key={`row-${row.id}`}
          flexDirection="row"
          alignItems="flex-start"
          overflow="hidden"
          backgroundColor={isSelected ? pal.selection : undefined}
        >
          <Box width={columns.lead} flexShrink={0} />
          <Box
            width={columns.textAt - columns.lead}
            flexShrink={0}
            paddingLeft={columns.handleAt - columns.lead}
            paddingY={isSelected ? space.rowPad : 0}
          >
            {row.handleTone ? (
              <Text color={pal.mark[row.handleTone]}>{row.handle}</Text>
            ) : look === 'desktop' ? (
              <Text>{row.handle}</Text>
            ) : (
              <Button
                plain
                key={`select-${row.id}`}
                label={row.handle}
                onPress={() => void select($, tab, row.id, index)}
              />
            )}
          </Box>
          {isSelected ? (
            <Box flexDirection="column" flexShrink={1} flexGrow={1} paddingRight={1} paddingY={space.rowPad}>
              {withSideAge(
                row,
                <Text wrap="wrap">
                  <Text bold>{row.title}</Text>
                  {titleAfter ? <Text color={pal.muted}>{shownAfter}</Text> : null}
                </Text>,
              )}
              {row.subtitle}
              {body ? <Box marginTop={blankLine}>{body}</Box> : null}
              {status.length > 0 ? (
                <Box flexDirection="column" marginTop={blankLine}>
                  {status.map(s => (
                    <Text color={s.color} wrap="wrap">
                      {s.text}
                    </Text>
                  ))}
                </Box>
              ) : null}
              {keysBlock}
            </Box>
          ) : (
            <Box flexShrink={1} flexGrow={1} paddingRight={1}>
              {unselectedLine(row, () => void select($, tab, row.id, index), columns.textAt)}
            </Box>
          )}
          {isAgeInSide && !isSelected ? (
            <Box
              width={TERMINAL_SIDE_CELLS}
              flexShrink={0}
              justifyContent="flex-end"
              paddingRight={1}
              paddingTop={isSelected ? space.rowPad : 0}
            >
              <Text color={pal.age}>{sideAge(row)}</Text>
            </Box>
          ) : null}
          {isSelected ? branch(tree, blankLine, TREE_LINE_AT, pal.selectionLine ?? pal.line) : branch(tree, 0)}
          {isSelected && look === 'terminal' ? (
            <Box
              key={settledScrollKey(`view-${row.id}`, settledLayout)}
              position="absolute"
              top={0}
              bottom={0}
              left={0}
              width={1}
            />
          ) : null}
          {/* What select() scrolls into view. Drawn on the selected row alone, so the key exists
          only once that row has redrawn expanded. */}
          {isSelected ? (
            <Box
              key={`view-${row.id}`}
              position="absolute"
              top={0}
              bottom={0}
              left={0}
              width={1}
              // Desktop draws a column of ▌ as broken dashes, so there the bar is the Box's own fill.
              {...(look === 'desktop' && !pal.selection ? { backgroundColor: pal.key } : {})}
            >
              {pal.selection || look === 'desktop' ? null : <Text color={pal.key}>{SELECTION_BAR}</Text>}
            </Box>
          ) : null}
        </Box>
      )
    }
    const emptyState = ({ title, hint: text = '' }: { title: string; hint?: string }) => {
      const wrap = (width: number) => {
        const lines: string[] = []
        for (const word of text.split(' ').filter(Boolean)) {
          const last = lines.at(-1)
          if (last !== undefined && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`
          else lines.push(word)
        }

        return lines
      }
      const room = listColumns - 4
      const most = Math.min(46, look === 'desktop' ? Math.floor(room * DESKTOP_CHARS_PER_CELL) : room)
      const count = wrap(most).length
      let width = Math.ceil(text.length / Math.max(count, 1))
      while (width < most && wrap(width).length > count) width++
      const lines = wrap(width)
      const align = isInline ? 'flex-start' : 'center'

      return (
        <Box flexDirection="column" flexGrow={1} justifyContent={align} alignItems={align}>
          <Box flexDirection="column" alignItems={align} paddingLeft={isInline ? 1 : 0}>
            <Text bold>{title}</Text>
            {lines.length > 0 ? (
              <Box flexDirection="column" alignItems={align} marginTop={blankLine}>
                {lines.map(line => (
                  <Text color={pal.muted}>{line}</Text>
                ))}
              </Box>
            ) : null}
          </Box>
        </Box>
      )
    }

    const isPrStatus = tab === 'prs' && prViews.length > 0
    const { isUpdating, error } = view.status
    const status = isPrStatus ? (prState.isFetching ? 'Refreshing PRs' : '') : isUpdating ? 'Updating…' : ''

    const drawnIds = new Set([
      ...Object.values(rows).flatMap(list => list.map(r => r.id)),
      ...prViews.map(pr => prMarkId(pr.ref)),
    ])
    const lineNote = Object.entries(notes)
      .filter(([id, n]) => !drawnIds.has(id) && now - n.at < SETTLED_MS)
      .map(([, n]) => n)
      .sort((a, b) => b.at - a.at)[0]

    const keyList = [
      { keys: TABS.map(t => t.hotkey).join(' '), does: 'Switch tabs' },
      { keys: 'j k', does: 'Select the next or previous row' },
      { keys: 'ctrl+x tab', does: 'Move focus to the line above the prompt, then the pane, then the prompt' },
    ]
    const keyColumn = Math.max(...keyList.map(k => k.keys.length)) + 2

    const tabSizes = desktopTabSizes(
      TABS.map(({ id, label }) => ({ label, count: tabCounts[id] })),
      e.props.bodyColumns - 2,
    )
    const tabProps: TabsProps | null = hasClient
      ? {
          tabs: TABS.map(({ id, label }, n) => ({
            id,
            label,
            count: tabSizes.hasCounts ? tabCounts[id] : 0,
            countColor: pal.tone[id] ?? pal.mark[id],
            width: tabSizes.widths[n]!,
          })),
          shown: tab,
          gap: tabSizes.gap,
          colors: {
            tab: pal.tab ?? null,
            raised: pal.raised,
            raisedText: pal.raisedText ?? null,
            muted: pal.muted,
          },
        }
      : null
    const statusLines = [
      !isPrStatus && error ? (
        <Text color={pal.tone.error} wrap="wrap">
          {error}
        </Text>
      ) : null,
      toolsRefused ? (
        <Text color={pal.tone.error} wrap="wrap">
          {TOOLS_REFUSED_TEXT}
        </Text>
      ) : null,
      lineNote ? (
        <Text color={pal.muted} wrap="wrap">
          {feedbackText({ is: 'note', note: lineNote.note, at: lineNote.at }, look)}
        </Text>
      ) : null,
    ]
    const terminalTabsWidth = TABS.reduce((sum, t) => sum + tabText(t.id, t.label).length + 2 * TAB_PAD.length + 1, 1)
    const pad = terminalTabsWidth <= e.props.bodyColumns ? TAB_PAD : ' '
    const hasTabLine = !isInline && look !== 'desktop'
    const tabLine = pal.tab ?? pal.divider
    // Terminal.app draws block characters from its font, which leaves a seam between a half block and the filled
    // line beside it. There a tab is its filled name line alone.
    const hasHalfLines = termProgram !== 'Apple_Terminal'
    const tabs = (
      <Box
        paddingLeft={isInline ? 2 : 1}
        paddingRight={1}
        flexDirection="row"
        {...(hasTabLine ? { overflow: 'hidden' as const } : {})}
      >
        {/* ─ draws at the middle of its cell, where the tabs' ▀ ends, and the tabs draw over it. The tabs' Box
            clips it, as a row clips the tree (anthropics/claude-code#100030). */}
        {hasTabLine ? (
          <Box position="absolute" bottom={0} left={0} right={0} height={1}>
            <Text color={tabLine}>{'─'.repeat(e.props.bodyColumns)}</Text>
          </Box>
        ) : null}
        <Box flexDirection="row" flexWrap="wrap" columnGap={isInline ? 3 : look === 'desktop' ? 2 : 1}>
          {hasClient && tabProps ? (
            <elements.Client key="tabs" module="./tabs-client.tsx" height={TAB_HEIGHT} props={tabProps} />
          ) : null}
          {tabProps
            ? null
            : TABS.map(({ id, label }) => {
                const count = tabCounts[id]

                if (isInline)
                  return (
                    <Box key={`tab-block-${id}`} flexDirection="row">
                      {tab === id ? (
                        <Text bold underline>
                          {label}
                        </Text>
                      ) : (
                        <Button plain key={`tab-${id}`} label={label} onPress={() => void showTab($, id)} />
                      )}
                      {count > 0 ? (
                        <Text bold={tab === id} color={pal.tone[id]}>
                          {' '}
                          {count}
                        </Text>
                      ) : null}
                    </Box>
                  )

                const width = tabText(id, label).length + 2 * pad.length

                // The key stays the
                // same in every drawing: the app takes the focus off the pane when the element holding
                // it leaves, and the next click would only bring it back.
                // A Button sizes to its label, so non-breaking spaces widen the tab; plain spaces would collapse.
                // A native tab element would replace this (anthropics/claude-code#100890).
                if (look === 'desktop')
                  return (
                    <Button
                      key={`tab-${id}`}
                      label={`${DESKTOP_TAB_PAD}${count > 0 ? `${label} ${count}` : label}${DESKTOP_TAB_PAD}`}
                      {...(tab === id ? { variant: 'primary' as const } : {})}
                      onPress={() => void showTab($, id)}
                    />
                  )

                if (tab === id)
                  return (
                    <Box flexDirection="column" flexShrink={0}>
                      <Text color={pal.raised}>{(hasHalfLines ? '▄' : ' ').repeat(width)}</Text>
                      <Text backgroundColor={pal.raised}>
                        {pad}
                        <Text bold color={pal.raisedText} backgroundColor={pal.raised}>
                          {label}
                        </Text>
                        {count > 0 ? (
                          <Text bold color={pal.tone[id] ?? pal.raisedText} backgroundColor={pal.raised}>
                            {' '}
                            {count}
                          </Text>
                        ) : null}
                        {pad}
                      </Text>
                      {hasHalfLines ? (
                        <Text color={pal.raised}>{'▀'.repeat(width)}</Text>
                      ) : (
                        <Text color={tabLine}>{'─'.repeat(width)}</Text>
                      )}
                    </Box>
                  )

                const show = () => void showTab($, id)
                const edgeFill = hasHalfLines ? pal.tab : undefined
                const edgeHover = edgeFill ? raiseEdge : { inverse: false }

                return (
                  <Box key={`tab-block-${id}`} flexDirection="column" flexShrink={0}>
                    <Button plain key={`tab-${id}-above`} hover={edgeHover} onPress={show}>
                      {edgeFill ? (
                        <Text color={edgeFill} hover={raiseEdge}>
                          {'▄'.repeat(width)}
                        </Text>
                      ) : (
                        ' '.repeat(width)
                      )}
                    </Button>
                    <Box flexDirection="row" backgroundColor={pal.tab}>
                      <Button plain key={`tab-${id}-before`} label={pad} hover={raise} onPress={show} />
                      <Button plain key={`tab-${id}`} label={label} hover={raise} onPress={show} />
                      {count > 0 ? (
                        <Text color={pal.tone[id]} hover={raise}>
                          {' '}
                          {count}
                        </Text>
                      ) : null}
                      <Button plain key={`tab-${id}-after`} label={pad} hover={raise} onPress={show} />
                    </Box>
                    <Button plain key={`tab-${id}-below`} hover={edgeHover} onPress={show}>
                      {edgeFill ? (
                        <Text color={edgeFill} hover={raiseEdge}>
                          {'▀'.repeat(width)}
                        </Text>
                      ) : (
                        <Text color={tabLine}>{'─'.repeat(width)}</Text>
                      )}
                    </Button>
                  </Box>
                )
              })}
        </Box>
      </Box>
    )
    const faint = (text: string) =>
      look === 'desktop' ? <Text color={pal.age}>{text}</Text> : <Text dimColor>{text}</Text>
    const statusText = faint(status)
    const versionText = version ? faint(`v${version}`) : null
    const rail = (
      <Box flexDirection="column" flexShrink={0} paddingLeft={1} marginRight={RAIL_GUTTER}>
        {TABS.map(({ id, label }) => {
          const count = tabCounts[id]
          const fill = ' '.repeat(railWidth - tabText(id, label).length - TAB_PAD.length)
          if (tab === id)
            return (
              <Text key={`rail-${id}`} backgroundColor={pal.raised}>
                {TAB_PAD}
                <Text bold color={pal.raisedText} backgroundColor={pal.raised}>
                  {label}
                </Text>
                {count > 0 ? (
                  <Text bold color={pal.tone[id] ?? pal.raisedText} backgroundColor={pal.raised}>
                    {' '}
                    {count}
                  </Text>
                ) : null}
                {fill}
              </Text>
            )
          const show = () => void showTab($, id)

          return (
            <Box key={`rail-${id}`} flexDirection="row">
              <Button plain key={`tab-${id}-before`} label={TAB_PAD} hover={raise} onPress={show} />
              <Button plain key={`tab-${id}`} label={label} hover={raise} onPress={show} />
              {count > 0 ? (
                <Button plain key={`tab-${id}-count`} hover={raise} onPress={show}>
                  <Text color={pal.tone[id]}> {count}</Text>
                </Button>
              ) : null}
              <Button plain key={`tab-${id}-after`} label={fill} hover={raise} onPress={show} />
            </Box>
          )
        })}
      </Box>
    )
    const statusBlock = statusLines.some(Boolean) ? (
      <Box flexDirection="column" paddingX={hasRail ? 1 : isInline ? 2 : 1} paddingTop={hasRail ? 0 : 1}>
        {statusLines}
      </Box>
    ) : null
    const footer = (
      <Box flexDirection="column" paddingX={1} paddingTop={blankLine}>
        <Box flexDirection="row" paddingX={1} justifyContent="space-between" columnGap={3}>
          {look === 'desktop' ? (
            <Box />
          ) : (
            <Button
              plain
              dimColor
              key="key-list"
              label={isKeyListShown ? '▾ Keys' : '▴ Keys'}
              onPress={() => void update($, IS_KEY_LIST_SHOWN, shown => !shown)}
            />
          )}
          <Box flexDirection="row" columnGap={2}>
            {statusText}
            {versionText}
          </Box>
          {look !== 'desktop' && isKeyListShown ? (
            <Box
              position="absolute"
              bottom={1}
              left={-1}
              right={-1}
              flexDirection="column"
              paddingX={2}
              paddingY={1}
              backgroundColor={pal.raised}
            >
              {keyList.map(k => (
                <Box key={`key-list-${k.keys}`} flexDirection="row">
                  <Box width={keyColumn} flexShrink={0}>
                    <Text bold color={pal.raisedText}>
                      {k.keys}
                    </Text>
                  </Box>
                  <Text color={pal.raisedText ?? pal.muted} wrap="wrap">
                    {k.does}
                  </Text>
                </Box>
              ))}
            </Box>
          ) : null}
        </Box>
      </Box>
    )

    const groupEmpty = (title: string) =>
      look === 'desktop'
        ? desktopFrame({
            key: `empty-${title}`,
            children: <Text color={pal.muted}>{groupEmptyText(title)}</Text>,
          })
        : treeRow('last', null, <Text color={pal.muted}>{`  ${groupEmptyText(title)}`}</Text>, `empty-${title}`)
    const groupTitle = (title: string, count: number) =>
      look === 'desktop' ? (
        desktopFrame({
          padY: 0,
          children: (
            <Text>
              <Text bold>{title}</Text>
              {count > 0 ? <Text color={pal.muted}>{`${DOT}${count}`}</Text> : null}
            </Text>
          ),
        })
      ) : (
        <Box paddingLeft={TREE_LINE_AT}>
          <Text>
            <Text bold>{title}</Text>
            {count > 0 ? <Text color={pal.muted}>{`${DOT}${count}`}</Text> : null}
          </Text>
        </Box>
      )
    const section = (children: JSX.Element | JSX.Element[]) =>
      look === 'desktop' ? (
        <Box flexDirection="column" paddingTop={blankLine}>
          {children}
        </Box>
      ) : (
        <Box flexDirection="column">{children}</Box>
      )
    const sections = (list: JSX.Element[], space = 1) => (
      <Box flexDirection="column" flexGrow={1} gap={look === 'desktop' ? 0 : isInline ? 1 : 2}>
        {look === 'desktop'
          ? list.flatMap((el, n) =>
              n === 0
                ? [el]
                : [
                    <Box
                      key={`rule-${n}`}
                      marginTop={space}
                      marginBottom={space - blankLine}
                      marginLeft={FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_MARK_CELLS}
                      height={1 / DESKTOP_LINE_PT}
                      backgroundColor={pal.divider}
                    />,
                    el,
                  ],
            )
          : list}
      </Box>
    )
    const titleGap = (hasChildren = true) =>
      isInline
        ? []
        : look === 'desktop'
          ? [<Box paddingTop={(2 * ROW_PAD_PT) / DESKTOP_LINE_PT} />]
          : [
              <Box paddingLeft={TREE_LINE_AT}>
                <Text color={pal.line}>{hasChildren ? '│' : ' '}</Text>
              </Box>,
            ]
    const refusedUndo = (d: ClosedLine) =>
      d.delivery && typeof d.delivery === 'object' && d.delivery.canUndo
        ? undoButton({ id: d.id, action: 'undo' }, null)
        : null
    const closedRow = (d: ClosedLine, pos: TreePos) =>
      look === 'desktop'
        ? desktopFrame({
            key: `closed-${d.id}`,
            indent: DESKTOP_MARK_CELLS,
            isMarkHung: false,
            padY: space.rowPad / 2,
            mark: <Text color={pal.age}>{d.delivery === null ? CLOSED_MARKS[closedState(d)] : ' '}</Text>,
            side: <Text color={pal.age}>{shortAgo(now - d.at)}</Text>,
            children: [
              <Text wrap="wrap" color={pal.muted}>
                {d.ask}
              </Text>,
              <Text wrap="wrap" color={pal.age}>
                {settledLabel(d.outcomeLabel, d.delivery)}
              </Text>,
              refusedUndo(d),
            ],
          })
        : treeRow(
            pos,
            <Text color={pal.muted}>{d.delivery === null ? CLOSED_MARKS[closedState(d)] : ' '}</Text>,
            <Box flexDirection="row">
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                <Text wrap="wrap" color={pal.muted}>
                  {d.ask}
                </Text>
                <Text wrap="wrap" color={pal.age}>
                  {settledLabel(d.outcomeLabel, d.delivery)}
                </Text>
                {refusedUndo(d)}
              </Box>
              <Box width={TERMINAL_SIDE_CELLS - 1} flexShrink={0} justifyContent="flex-end">
                <Text color={pal.age}>{shortAgo(now - d.at)}</Text>
              </Box>
            </Box>,
            `closed-${d.id}`,
            1,
          )
    // On desktop a Client takes a click on every cell of the line, where a Button takes one only on its label.
    const foldRow = (kind: FoldKind, count: number, isUnfolded: boolean) =>
      hasClient ? (
        <Box key={`fold-row-${kind}`} flexDirection="row" overflow="hidden">
          {'Svg' in elements ? (
            <elements.Svg
              source={chevronSvg(isUnfolded, foldHover === kind)}
              alt={isUnfolded ? 'Unfolded' : 'Folded'}
              width={FRAME_INSET_PT + DESKTOP_MARK_CELLS * DESKTOP_CELL_PT}
              height={2 * ROW_PAD_PT + DESKTOP_LINE_PT}
            />
          ) : null}
          <Box position="absolute" top={0} left={0} width="100%">
            <elements.Client
              key={`fold-${kind}`}
              module="./fold-client.tsx"
              width="100%"
              props={
                {
                  markCells: DESKTOP_MARK_CELLS,
                  label: foldLabel(count),
                  isUnfolded,
                  padY: DESKTOP_ROW_PAD,
                  colors: {
                    rest: isInline ? null : (pal.card ?? null),
                    text: pal.age,
                    hoverText: 'text',
                  },
                } satisfies FoldProps
              }
            />
          </Box>
        </Box>
      ) : (
        treeRow(
          null,
          null,
          <Box flexDirection="row">
            <Button
              plain
              dimColor
              key={`fold-${kind}`}
              label={`${isUnfolded ? '▾' : '▸'} ${foldLabel(count)}`}
              onPress={() =>
                void update($, UNFOLDED, u => (u.includes(kind) ? u.filter(k => k !== kind) : [...u, kind]))
              }
            />
          </Box>,
          `fold-row-${kind}`,
        )
      )
    const closedFold = (kind: FoldKind, closed: ClosedLine[], total: number, isUnfolded: boolean) => {
      const earlier = earlierLabel(total, closed.length)
      return closed.length === 0
        ? []
        : [
            ...(space.isFoldGapped ? titleGap(false) : []),
            foldRow(kind, total, isUnfolded),
            ...(isUnfolded && look !== 'desktop' && !isInline
              ? [
                  <Box key={`fold-gap-${kind}`} paddingLeft={TREE_LINE_AT + markWidth}>
                    <Text color={pal.line}>│</Text>
                  </Box>,
                ]
              : []),
            ...(isUnfolded ? closed.map((d, n) => closedRow(d, childPos(n, closed.length + (earlier ? 1 : 0)))) : []),
            ...(isUnfolded && earlier
              ? [
                  look === 'desktop'
                    ? desktopFrame({
                        key: `earlier-${kind}`,
                        indent: DESKTOP_MARK_CELLS,
                        isMarkHung: false,
                        padY: space.rowPad / 2,
                        children: <Text color={pal.age}>{earlier}</Text>,
                      })
                    : treeRow(
                        childPos(closed.length, closed.length + 1),
                        <Text> </Text>,
                        <Text color={pal.age}>{earlier}</Text>,
                        `earlier-${kind}`,
                        1,
                      ),
                ]
              : []),
          ]
    }
    const undoButton = (undo: RowPress | PrPress, at: number | null) => {
      const key = `undo-${pressRowId(undo)}`
      const label = ' ↺ Undo '
      const onPress = (press: { surface: UiPressArgument['surface'] }) => runPress($, undo, press.surface)
      if (hasClient && 'Svg' in elements) {
        followUpPresses.set(key, onPress)
        const leftMs = at === null ? 0 : Math.max(0, SETTLED_MS - (now - at))
        return (
          <Box key={`${key}-${at}`} width={UNDO_CELLS} height={UNDO_HEIGHT_PT / DESKTOP_LINE_PT}>
            <elements.Svg
              source={undoSvg(leftMs / SETTLED_MS, leftMs)}
              alt="Undo"
              width={UNDO_CELLS * DESKTOP_CELL_PT}
              height={UNDO_HEIGHT_PT}
            />
            <Box position="absolute" top={0} left={0}>
              <elements.Client
                key={key}
                module="./undo-client.tsx"
                width={UNDO_CELLS}
                height={UNDO_HEIGHT_PT / DESKTOP_LINE_PT}
                props={{ pressKey: key, hover: 'rgba(128, 128, 128, 0.12)' } satisfies UndoProps}
              />
            </Box>
          </Box>
        )
      }
      if (look !== 'terminal' || at === null) return <Button key={key} label="↺ Undo" onPress={onPress} />
      const cells = [...label]
      const filled = Math.ceil((Math.max(0, SETTLED_MS - (now - at)) / SETTLED_MS) * cells.length)

      return (
        <Button key={key} onPress={onPress}>
          <Text backgroundColor={pal.divider}>{cells.slice(0, filled).join('')}</Text>
          <Text>{cells.slice(filled).join('')}</Text>
        </Button>
      )
    }
    const settledContent = (
      what: string,
      outcome: string,
      at: number,
      undo: RowPress | PrPress | null,
      delivery: Parameters<typeof settledLabel>[1] = null,
      isLapsed = false,
    ) => {
      if (look === 'desktop') {
        const after = `${DOT}${settledLabel(outcome, delivery)}`
        return (
          <Box flexDirection="column">
            <Box flexDirection="row" alignItems="center">
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="wrap">
                  {what}
                  <Text color={pal.muted}>{after}</Text>
                </Text>
              </Box>
              {undo ? (
                <Box flexShrink={0} paddingLeft={1}>
                  {undoButton(undo, at)}
                </Box>
              ) : null}
            </Box>
            {undo ? null : leaveBar(at)}
          </Box>
        )
      }

      return (
        <Box flexDirection="column">
          <Text wrap="truncate-end" color={pal.muted}>
            {what}
          </Text>
          <Box position="relative" flexDirection="row" columnGap={2}>
            {undo ? (
              <Box
                key={settledScrollKey(`undo-${pressRowId(undo)}`, settledLayout)}
                position="absolute"
                top={0}
                bottom={0}
                left={0}
                width={1}
              />
            ) : null}
            <Text wrap="wrap" color={delivery !== null || isLapsed ? pal.muted : pal.tone.done}>
              {settledLabel(outcome, delivery)}
            </Text>
            {undo ? undoButton(undo, at) : null}
          </Box>
          {undo ? null : leaveBar(at)}
        </Box>
      )
    }
    const isBarred = (x: Entry | undefined) =>
      x !== undefined && !('row' in x) && !x.settled.actions.some(a => a.press.action === 'undo')
    const settledRow = ({ settled: r, state }: Extract<Entry, { settled: RowView }>, pos: TreePos) => {
      const undo = r.actions.find(a => a.press.action === 'undo')?.press ?? null
      if (look === 'desktop') {
        const after = `${DOT}${settledLabel(state.label, state.delivery)}`
        return desktopFrame({
          key: `settled-${r.id}`,
          markCells: DESKTOP_MARK_CELLS + markExtra(r.id),
          mark: state.delivery !== null ? null : <Text color={pal.muted}>✓</Text>,
          side: undo ? undoButton(undo, state.at) : null,
          padY: space.settledPad,
          isCentered: true,
          children: [
            <Text wrap="wrap">
              {r.title}
              <Text color={pal.muted}>{after}</Text>
            </Text>,
            undo ? null : leaveBar(state.at),
          ],
        })
      }
      const content = settledContent(r.title, state.label, state.at, undo, state.delivery, state.isLapsed)
      const mark = state.delivery !== null ? <Text> </Text> : <Text color={pal.muted}>✓</Text>
      return (
        <Box key={`settled-${r.id}`} flexDirection="column" paddingY={space.settledPad}>
          {treeRow(pos, mark, content, undefined, 0, undefined, markExtra(r.id))}
        </Box>
      )
    }
    const needsYouView = () => {
      const groups = needsYouGroups.flatMap(g => {
        const { entries } = g
        const closed = closedShown(view.needsYou.closed[g.list], settledIn(entries))
        if (isUnread) return []
        const isUnfolded = unfolded.includes(g.kind)
        const open = divided(
          entries.map((x, n) =>
            'row' in x ? listRow(x.row, childPos(n, entries.length)) : settledRow(x, childPos(n, entries.length)),
          ),
          g.kind,
          n => isBarred(entries[n]),
          Math.max(0, ...entries.map(x => markExtra(entryId(x)))),
        )
        const tail = closedFold(
          g.kind,
          closed,
          closedTotal(view.needsYou.closed[g.list], settledIn(entries)),
          isUnfolded,
        )

        return [
          section([
            groupTitle(g.title, g.rows.filter(r => r.view && isWaitingRow(r.view)).length),
            ...titleGap(),
            ...(open.length > 0 ? open : [groupEmpty(g.title)]),
            ...tail,
          ]),
        ]
      })
      const isNothing = needsYouGroups.every(
        g => g.entries.length === 0 && closedTotal(view.needsYou.closed[g.list], settledIn(g.entries)) === 0,
      )
      const unread = isUnread
        ? [
            section(
              <Box flexDirection="row" flexWrap="wrap" columnGap={2} paddingLeft={2}>
                {isReadingAgain ? (
                  <Text color={pal.muted}>Reading the inbox…</Text>
                ) : (
                  <Text color={pal.tone.error}>Could not read the inbox.</Text>
                )}
                <Button key="read-again" label="Try again" onPress={() => void readAgain($)} />
              </Box>,
            ),
          ]
        : []
      if (isNothing && !stop && unread.length === 0) return emptyState(emptyText('needsYou', 'Claude'))
      const outside = stop
        ? [
            section(
              <Box flexDirection="column" paddingLeft={1}>
                <Text wrap="truncate-end">
                  <Text color={pal.tone.error} bold>
                    Stopped
                  </Text>
                  <Text color={pal.muted}>
                    {DOT}
                    {ago(now - stop.at)}
                  </Text>
                </Text>
                {isResumable(stop) ? (
                  <Box flexDirection="column">
                    <Text wrap="wrap">{capitalized(stopText(stop))}.</Text>
                    {resuming?.is === 'refused' ? (
                      <Text color={pal.tone.error} wrap="wrap">
                        Not sent: {resuming.why}
                      </Text>
                    ) : null}
                    <Box flexDirection="row">
                      <Button
                        key="resume"
                        label={resuming?.is === 'sending' ? 'Resuming…' : 'Resume'}
                        onPress={() => void resume($)}
                      />
                    </Box>
                  </Box>
                ) : (
                  <Text wrap="wrap">
                    {capitalized(stopText(stop))}. {stopFix(stop)}
                  </Text>
                )}
              </Box>,
            ),
          ]
        : []

      return sections([...outside, ...unread, ...groups])
    }

    const findingsView = () => {
      const settled = settledIn(findingEntries)
      if (findingEntries.length === 0 && closedTotal(view.findings.closed, settled) === 0)
        return emptyState(emptyText('findings', 'Claude'))
      const groups = lists.findingGroups.map(g => {
        const closedOf = view.findings.closed.filter(f => f.kind === g.kind)
        const closed = closedShown(closedOf, settled).map(f => ({
          id: f.id,
          ask: f.title,
          at: f.closedAt,
          how: f.how,
          outcome: f.outcome,
          outcomeLabel: f.outcomeLabel,
          delivery: f.delivery,
        }))
        return section([
          groupTitle(g.title, rowsIn(g.entries).filter(r => r.view && isWaitingRow(r.view)).length),
          ...titleGap(),
          ...(g.entries.length === 0 ? [groupEmpty(g.title)] : []),
          ...divided(
            g.entries.map((x, n) =>
              'row' in x ? listRow(x.row, childPos(n, g.entries.length)) : settledRow(x, childPos(n, g.entries.length)),
            ),
            g.kind,
            n => isBarred(g.entries[n]),
          ),
          ...closedFold(g.kind, closed, closedTotal(closedOf, settled), unfolded.includes(g.kind)),
        ])
      })

      return sections(groups)
    }

    const settledPrBlock = (pr: PrView) =>
      section([
        treeRow(
          null,
          <Text color={pal.muted}>✓</Text>,
          settledContent(
            `#${pr.number} ${pr.title}`,
            'Dismissed',
            lastActions[prMarkId(pr.ref)]?.at ?? now,
            {
              action: 'pr-undo',
              ref: pr.ref,
            },
            null,
            true,
          ),
          `settled-pr:${pr.ref}`,
        ),
      ])
    const prRowGroup = (title: string, group: Row[], key: string) =>
      group.length === 0
        ? []
        : [
            <Box key={`group-${key}`} marginTop={blankLine}>
              {groupTitle(title, group.length)}
            </Box>,
            ...(look === 'desktop' ? [] : titleGap()),
            ...divided(
              group.map((r, n) => listRow(r, childPos(n, group.length))),
              key,
            ),
          ]
    const prBlock = ({
      pr,
      isSettled,
      checks,
      threads,
    }: {
      pr: PrView
      isSettled: boolean
      rows: Row[]
      checks: Row[]
      threads: Row[]
    }) => {
      if (isSettled) return settledPrBlock(pr)
      const { status, head: statusHead, unlisted } = readiness(pr, isThreadSent)
      const tone = PR_TONES[status]
      const prLast = lastActions[prMarkId(pr.ref)]?.action === 'pr-dismiss' ? null : lastActionText(prMarkId(pr.ref))
      const prActions = prBlockActions(pr, isThreadSent, prState.branchRef, lastActions).map(a =>
        prKeyAction(a, pr.ref),
      )

      const titleLine = (
        <Text wrap="wrap">
          <Text color={look === 'desktop' ? pal.mark.prs : pal.tone.prs}>{`#${pr.number}\u2002`}</Text>
          <Text bold>{pr.title}</Text>
          <Text color={tone ? (pal.tone[tone] ?? pal.mark[tone]) : pal.muted}>{`\u2002${statusHead}`}</Text>
          <Text color={pal.muted}>{unlisted.map(r => `${DOT}${r}`).join('')}</Text>
        </Text>
      )
      const statusBlock = (
        <Box flexDirection="column">
          {pr.error ? (
            <Box flexDirection="column">
              <Text color={pal.tone.error} wrap="wrap">
                Last refresh failed: {pr.error}
              </Text>
              {prState.isFetching ? <Text color={pal.muted}>Refreshing…</Text> : null}
              <Box flexDirection="row">
                <Button key={`refresh-${pr.ref}`} label="Retry" onPress={() => void findPrs($)} />
              </Box>
            </Box>
          ) : null}
          <Box
            flexDirection="row"
            flexWrap="wrap"
            columnGap={space.buttonGap}
            rowGap={look === 'desktop' ? 1 : 0}
            marginTop={blankLine}
          >
            {prActions.map(a =>
              a.emphasis === 'quiet' ? (
                <Button key={a.key} plain dimColor label={a.label} onPress={a.onPress} />
              ) : look === 'desktop' ? (
                <Button
                  key={a.key}
                  label={desktopLabel(a)}
                  {...(a.emphasis === 'primary' ? { variant: 'primary' as const } : {})}
                  onPress={a.onPress}
                />
              ) : (
                <Button key={a.key} label={a.label} onPress={a.onPress} />
              ),
            )}
          </Box>
          {prLast ? (
            <Box marginTop={look === 'desktop' ? 1 : 0}>
              <Text color={prLast.isFailure ? pal.tone.error : pal.muted} wrap="wrap">
                {prLast.text}
              </Text>
            </Box>
          ) : null}
        </Box>
      )

      return section([
        ...(look === 'desktop'
          ? [
              desktopFrame({ key: `pr-title-${pr.ref}`, padY: 0, children: titleLine }),
              desktopFrame({ key: `pr-status-${pr.ref}`, padY: 0, children: statusBlock }),
            ]
          : [<Box paddingLeft={1}>{titleLine}</Box>, <Box paddingLeft={1}>{statusBlock}</Box>]),
        ...prRowGroup(PR_GROUP_TITLES.threads, threads, `${pr.ref}-threads`),
        ...prRowGroup(PR_GROUP_TITLES.checks, checks, `${pr.ref}-checks`),
      ])
    }
    const ghMissingNotice = () => {
      const line = (
        <Text color={pal.muted} wrap="wrap">
          {GH_MISSING_TEXT}
        </Text>
      )

      return section(
        look === 'desktop' ? (
          desktopFrame({ key: 'gh-missing', padY: 0, children: line })
        ) : (
          <Box paddingLeft={1}>{line}</Box>
        ),
      )
    }
    const olderPrs = () => {
      const text = olderPrsText(ledger.prs)
      if (!text) return []
      const line = (
        <Text color={pal.muted} wrap="wrap">
          {text}
        </Text>
      )

      return [
        section(
          look === 'desktop' ? (
            desktopFrame({ key: 'older-prs', padY: 0, children: line })
          ) : (
            <Box paddingLeft={1}>{line}</Box>
          ),
        ),
      ]
    }
    const prsView = () =>
      prGroups.length === 0 ? (
        <Box flexDirection="column" flexGrow={1}>
          {emptyState({
            title: prState.isFetching ? 'Checking for PRs…' : 'No PRs',
            hint: prState.isGhMissing ? GH_MISSING_TEXT : prsEmptyHint('session'),
          })}
        </Box>
      ) : (
        sections([...(prState.isGhMissing ? [ghMissingNotice()] : []), ...prGroups.map(prBlock), ...olderPrs()], 2)
      )

    const move = (step: number) => {
      const to = Math.min(Math.max(at + step, 0), ids.length - 1)
      void select($, tab, ids[to] ?? '', to)
    }
    const canMove = ids.length > 1 || (at < 0 && ids.length > 0)
    // Claude Code sends a key no Button binds to the prompt and gives it the keyboard, so the keys
    // stay bound when there is nothing to move to or close.
    const moveKeys: KeyAction[] = [
      { key: 'next', label: 'Next', hotkey: 'j', kind: 'view', onPress: () => (canMove ? move(1) : undefined) },
      {
        key: 'previous',
        label: 'Previous',
        hotkey: 'k',
        kind: 'view',
        onPress: () => (canMove ? move(-1) : undefined),
      },
    ]
    const tabKeys: KeyAction[] = TABS.map(({ id, label, hotkey }) => ({
      key: `tab-key-${id}`,
      label,
      hotkey,
      kind: 'view',
      onPress: () => void showTab($, id),
    }))

    const selectedRow = rows[tab][at]
    const selectedActions = selectedRow ? rowActions(selectedRow) : null
    const closeKeysWithoutRow: KeyAction[] = ['d', 'x'].map(hotkey => ({
      key: `no-row-${hotkey}`,
      label: 'Close',
      hotkey,
      kind: 'view',
      onPress: () => undefined,
    }))
    const rowKeys = selectedActions ? [...selectedActions.keys, ...selectedActions.more] : closeKeysWithoutRow

    // A pane takes a key
    // only as a Button's hotkey, so the tab keys, j, k and the selected row's keys
    // are Buttons in a hidden Box.
    const tabView = tab === 'findings' ? findingsView() : tab === 'prs' ? prsView() : needsYouView()
    const drawn = (
      <Box flexDirection="column" minHeight={e.props.scroll.bodyRows} backgroundColor={pal.body}>
        {showsDemoNotices ? (
          <Box
            flexDirection="row"
            alignItems="center"
            columnGap={2}
            paddingX={isInline ? 2 : 1}
            marginBottom={blankLine}
          >
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="wrap" color={pal.muted}>
                {DEMO_NOTICE}
              </Text>
            </Box>
            <Button key="hide-demo" label="Hide demo" onPress={() => void setDemo($, false)} />
          </Box>
        ) : null}
        {hasRail ? (
          <Box flexDirection="row" flexGrow={1}>
            {rail}
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              {statusBlock}
              <Box flexDirection="column" paddingRight={1} flexGrow={1}>
                {tabView}
              </Box>
            </Box>
          </Box>
        ) : (
          [
            tabs,
            statusBlock,
            <Box flexDirection="column" paddingX={1} paddingTop={blankLine} flexGrow={1}>
              {tabView}
            </Box>,
          ]
        )}
        {/* Desktop takes no keys: a Button's hotkey does nothing there, so it gets neither the list of keys nor the hidden Buttons. */}
        {footer}
        {look === 'desktop' ? null : (
          <Box display="none">
            {keyBindings([...tabKeys, ...moveKeys])}
            {keyBindings(rowKeys, '-key')}
          </Box>
        )}
      </Box>
    )
    if (look === 'desktop' && focusedKey !== null) {
      const keys = focusKeys(drawn)
      const opensField = focusHint?.startsWith('type-') && keys.has(focusHint)
      if (!keys.has(focusedKey) || opensField) {
        const focusKey = [focusHint, rowKeys[0]?.key, ...keys].find((k): k is string => !!k && keys.has(k)) ?? null
        focusedKey = focusKey
        focusHint = null
        // After this hook returns, since a focus asked from inside a drawing's own hook cannot wait on it.
        if (focusKey) later($, 0, () => $.ui.focus({ requestId: PANE, key: focusKey }))
      }
    }

    return drawn
  })
}
