import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  SessionAppendMessage,
  Timer,
  ToolResultOf,
  UiCopyResult,
  RenderSurface,
  UiPressArgument,
  UiScrollBlock,
  UiScrollResult,
} from 'claude-code'

import type {
  Away,
  Cursor,
  Closed,
  DemoCopy,
  Dialog,
  Draft,
  FoldKind,
  Item,
  Ledger,
  OldPresence,
  PrCheck,
  PrThread,
  PrView,
  PrViews,
  LastAction,
  Overview,
  PressKind,
  PageTab,
  RowNote,
  SentPrompt,
  Stop,
  Tab,
} from '../types'
import { childEnded } from './overview'
import {
  claimedOverviewRefresh,
  cleared,
  commandFindings,
  emptySession,
  endTurn,
  forkedFrom,
  messageTyped,
  noteActivity as noteTurnActivity,
  pressOn,
  recordPrompt,
  recorded,
  sessionView,
  startTurn,
  turnEnded,
  turnStarted,
  placed,
  pruned,
  upgradeSession,
  cutOffTurn,
  overviewChanged,
  withLook,
  withNewPrRefs,
} from './session'
import {
  activityGate,
  childrenCutOff,
  childStarted,
  childWorked,
  delegateRef,
  delegatesSettled,
  delegatesStarted,
  delegateSteps,
  delegateWaitsEnded,
  noticeApplied,
  subagentsSettled,
  taskNotice,
} from './children'
import type { SavedSession, SendOutcome, SentBy, Session, SessionView } from './session'
import {
  exclusiveKeys,
  fetchPrs as fetchSessionPrs,
  orderedKeys,
  refreshOverview,
  runUpdates,
  startPress,
  wakeForDone as wakeSessionForDone,
} from './session-host'
import type {
  Ask,
  CallReport,
  CatchUpReply,
  OverviewCall,
  OverviewRecords,
  RecordFiles,
  SessionHost,
} from './session-host'
import { demoView, isDemoCopy, withDemoPresence } from './demo'
import { claudeTasksAfter } from './host-tasks'
import { noteDialog } from './dialogs'
import type { Exchange, Press, Update } from './ledger'
import {
  applyPrPress,
  checkActions,
  checkRowText,
  PR_QUOTE_CHARS,
  splitFollowUps,
  fetchTracked,
  isDismissed,
  olderPrsText,
  PR_GROUP_TITLES,
  PR_TONES,
  prBlockActions,
  prCheckId,
  prMarkId,
  pressRowId,
  prRowWaits,
  prThreadId,
  threadActions,
  threadRowText,
  threadSentIn,
  ghNoticeOf,
  prsEmptyText,
  prRefreshFailedText,
} from './pr-tab'
import type { Applied, DrawnPr, GhRun, PrAction, PrPress } from './pr-tab'
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
  isBlankLedger,
  readKind,
  tasksRunBy,
  upgradeLedger,
} from './ledger'
import {
  addActivity,
  buildPrompt,
  overviewCarryText,
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
  type ScreenTab,
  type Told,
} from './model-text'
import {
  commandRowLine,
  dialogOutcome,
  resetTime,
  readCommandRow,
  stopKindOf,
  stopOfMessage,
  transcriptText,
  TURN_BOX_TOOL,
  turnBoxText,
} from './claude'
import { branchIn } from './gh'
import type { Run } from './gh'
import { CLEARED_TOKENS, delegatesInHerdr, herdrReporter, herdrTokens } from './herdr'
import { ago, cellWidth, clipLabel, cutForEllipsis } from './text'
import {
  applyPress,
  baseName,
  capitalized,
  COMPARE_PAGE_FILE,
  demoAfterPress,
  demoReplied,
  demoSent,
  doneWake,
  isPressConfirmed,
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
import type { DemoSent, Effect, EffectHost, RowPress } from './presses'
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
  isRowTab,
  isShownTab,
  LISTED_TABS,
  screenTabOf,
  shownTabs,
  drawnTabOf,
  fitTabs,
  tabBadge,
  tabName,
  canUndoRefused,
  closedMark,
  settledMark,
  settledTone,
  DEMO_NOTICE,
  bannerOf,
  stopBanner,
  tabBarBanners,
  groupEmptyText,
  closedTotal,
  earlierLabel,
  foldLabel,
  feedbackOf,
  feedbackText,
  markedFeedbackText,
  fieldExit,
  hasAge,
  heldReplies,
  isAfterTitle,
  isFailure,
  isStatusUnderActions,
  waitingCount,
  FINDING_GROUPS,
  isGuarded,
  PERMISSION_FALLBACK_DELAY_MS,
  PRESS_GUARD_MS,
  QUEUED_AFTER_MS,
  compareEndsAt,
  rowKeyPlan,
  actionLines,
  settledLabel,
  actionLabel,
  replyHint,
  rowTitle,
  rowResultMark,
  isRowTabRunning,
  rowFeedbackText,
  ROW_COPY,
  READING_TEXT,
  rowsIn,
  hasRunningMark,
  LOOK_TEXT,
  mergedLine,
  STALL_GAP,
  WAS_PREFIX,
  inboxCommandText,
  RUNNING_FRAME_MS,
  RUNNING_PULSE_MS,
  runningMark,
  SETTLED_MS,
  settledIn,
  settledRowIds,
  allRows,
  firstWaiting,
  footerStatus,
  type BannerView,
  keptDiscards,
  keptOpen,
  listWaits,
  NEXT_BUILD_MARK,
  OVERVIEW_TEXT_LINES,
  rowAfterClose,
  shortAgo,
  shownOptionDescriptions,
  versionLabel,
} from './view'
import type {
  ActionEmphasis,
  ActionIcon,
  DrawnEntry,
  Holds,
  InboxView,
  ModLook,
  PlannedKey,
  OverviewBranch,
  OverviewRow,
  RowView,
  ResultMark,
  RowWait,
  SettledState,
  ShownTab,
  TabNaming,
} from './view'
import { agentTools, recordClose, recordItem } from './tools'
import type { ToolAnswer } from './tools'
import type { UndoProps } from './undo-client'
import {
  ARRIVAL_TABS,
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
import { BANNER_GAP_PT, BANNER_PAD_Y_PT, OVERVIEW_ROW_PAD_PT, ROW_PAD_PT } from './layout'
import {
  DARK_BANNER_TINTS,
  DARK_DALTONIZED_TONES,
  DARK_TONES,
  LIGHT_BANNER_TINTS,
  LIGHT_DALTONIZED_TONES,
  LIGHT_TONES,
  toneColors,
} from './tones'
import type { BannerTone, ToneName } from './tones'
import type { FoldProps } from './fold-client'
import type { LinksProps } from './links-client'
import type { RowProps } from './row-client'
import { TAB_COUNT_GAP, TAB_HEIGHT, tabLines, type TabsProps } from './tabs-client'

/** The tools Claude Code writes its own task list with. They are off unless the person turns them on. */
const HOST_TASK_TOOLS: ReadonlySet<string> = new Set(['TaskCreate', 'TaskUpdate', 'TodoWrite'])

/** The drawn conversation's session. `revision` counts its writes, so a write computed from an older one is retried. */
type ModSession = Session & { revision: number }

const NO_SESSION: ModSession = { ...emptySession(), revision: 0 }
const PRESENT: Away = { lastActiveAt: 0, isAway: false, minute: 0 }

/** The tab the pane shows, whether it shows the sample, and since when. */
type Shown = { tab: ShownTab; isDemo: boolean; since: number }

const TAB = atom({ plugin: 'inbox', key: 'tab' } as const, 'needsYou' as Tab)
/**
 * The page tab shown in place of `TAB`, or null while a row tab shows. Kept apart from `TAB` so a build that
 * does not know the page still reads a row tab there.
 */
const PAGE = atom({ plugin: 'inbox', key: 'page' } as const, null as PageTab | null)
const NO_CURSOR: Cursor = { id: null, index: 0, openedAt: 0 }
const NO_SELECTION: Record<Tab, Cursor> = { needsYou: NO_CURSOR, findings: NO_CURSOR, prs: NO_CURSOR }
const SELECTION = atom({ plugin: 'inbox', key: 'selection' } as const, NO_SELECTION)
const THEME = atom({ plugin: 'inbox', key: 'theme' } as const, '')
const DIALOGS = atom({ plugin: 'inbox', key: 'dialogs' } as const, [] as Dialog[])
const TYPING = atom({ plugin: 'inbox', key: 'typing' } as const, null as string | null)
const DRAFTS = atom({ plugin: 'inbox', key: 'drafts' } as const, {} as Record<string, Draft>)
const DISCARDED = atom({ plugin: 'inbox', key: 'discarded' } as const, {} as Record<string, number>)
/** Null while the pane is closed. */
const SHOWN = atom({ plugin: 'inbox', key: 'shown' } as const, null as Shown | null)
const NOTES = atom({ plugin: 'inbox', key: 'notes' } as const, {} as Record<string, RowNote>)
const REDRAW = atom({ plugin: 'inbox', key: 'redraw' } as const, 0)
const RUNNING_FRAME = atom({ plugin: 'inbox', key: 'runningFrame' } as const, 0)
const SESSION = atom({ plugin: 'inbox', key: 'session' } as const, NO_SESSION)
const AWAY = atom({ plugin: 'inbox', key: 'away' } as const, PRESENT)
const UNREADABLE = atom({ plugin: 'inbox', key: 'unreadable' } as const, null as string | null)
const UNFOLDED = atom({ plugin: 'inbox', key: 'unfolded' } as const, [] as FoldKind[])
const FOLD_HOVER = atom({ plugin: 'inbox', key: 'foldHover' } as const, null as FoldKind | null)
const OPTIONS_SHOWN = atom({ plugin: 'inbox', key: 'optionsShown' } as const, [] as string[])
const IS_KEY_LIST_SHOWN = atom({ plugin: 'inbox', key: 'isKeyListShown' } as const, false)
/** How many times the terminal pane redraws while Undo's fill drains, two for each cell of the fill. */
const UNDO_REDRAW_STEPS = 24
const RESIZE_SCROLL_MS = 100
/** The mod can always read the whole conversation: from a fork of it, or from the transcript. */
const CAN_CATCH_UP = true
const DEMO = atom({ plugin: 'inbox', key: 'demo' } as const, null as DemoCopy | null)
const DEMO_RECORDING = atom({ plugin: 'inbox', key: 'isDemoRecording' } as const, false)
const READ_FAILED_TEXT = 'Could not read the inbox.'
const TOOLS_REFUSED_TEXT =
  "Claude cannot record or close items here. Your organization's settings block the inbox's tools."
const PR_POLL_MS = 2 * 60_000

const RECORD_TOOL = 'mcp__inbox__record'
const CLOSE_TOOL = 'mcp__inbox__close'
/**
 * The person's line for each `record` or `close` call that has one, by `tool_use_id`. It lives as long as the
 * process, so a call from before it draws nothing under its row.
 */
const PERSON_LINES = atom({ plugin: 'inbox', key: 'personLines' } as const, {} as Record<string, string>)
const MAX_PERSON_LINES = 200

const PANE = 'inbox'
const REPLY_ROWS = 3
const DESKTOP_REPLY_ROWS = 2
const DESKTOP_WIDE_AT = 50
// About how many characters of desktop's proportional text fit in one column of `bodyColumns`: sentences and
// the tab labels run 1.23 to 1.30, bold or not.
const DESKTOP_CHARS_PER_CELL = 1.25
// A lower guess for text that must stay one line, since desktop wraps text that is too long.
const DESKTOP_CLIP_CHARS_PER_CELL = 1.1
// The widest character in each group, in points, in the pane's 13 pt system font as AppKit measures it. Any other
// character counts as the widest group, so an estimate is never narrower than the text.
const DESKTOP_CHAR_GROUPS: [chars: string, pt: number][] = [
  ["ijl|I ',.:;/\\!", 4],
  ['ftr()[]{}', 4.9],
  ['aceksvxyz-*"`?1J', 7.4],
  ['bdghnopqu_EFL27', 7.95],
  ['ABKPRSTVXYZ0345689#$+<=>^~', 8.8],
  ['CDGHNOQUw&', 10],
]
const DESKTOP_CHAR_PT = new Map(DESKTOP_CHAR_GROUPS.flatMap(([chars, pt]) => [...chars].map(c => [c, pt] as const)))
const DESKTOP_WIDEST_CHAR_PT = 12.6
// A native Button's padding around its label, and its bolder primary label, measured live: 163 to 167 pt for
// "Plain (recommended)", whose label is 130 pt in the regular weight.
const DESKTOP_BUTTON_EXTRA_PT = 38
/** Desktop cuts a label wider than its control, so a control is sized from each character's width. */
function desktopTextPt(text: string): number {
  let pt = 0
  for (const c of text) pt += DESKTOP_CHAR_PT.get(c) ?? DESKTOP_WIDEST_CHAR_PT
  return pt
}
/** The words of `text` in lines `widthPt` wide. `desktopTextPt` never counts a line narrower than desktop draws it, so desktop needs no more lines. */
function desktopLines(text: string, widthPt: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ').filter(Boolean)) {
    const longer = line ? `${line} ${word}` : word
    if (line && desktopTextPt(longer) > widthPt) {
      lines.push(line)
      line = word
    } else line = longer
  }
  if (line) lines.push(line)
  return lines
}
/** `spans` cut to what desktop draws in `limit` lines `widthPt` wide, with an ellipsis when cut. */
function desktopSpanLines(spans: TerminalSpan[], widthPt: number, limit: number): TerminalSpan[] {
  const words = spans.map(s => ({ ...s, text: s.text.replace(/[^\S\u00a0]+/g, ' ') }))
  const lines = desktopLines(words.map(s => s.text).join(''), widthPt)
  if (lines.length <= limit) return words
  const last = cutForEllipsis(lines[limit - 1]!, t => desktopTextPt(t) <= widthPt)
  let room = [...lines.slice(0, limit - 1), last].join(' ').length
  const kept: TerminalSpan[] = []
  for (const s of words) {
    if (room <= 0) break
    kept.push({ ...s, text: s.text.slice(0, room) })
    room -= s.text.length
  }
  const isMuted = kept.at(-1)?.isMuted

  return [...kept, { text: '…', ...(isMuted ? { isMuted } : {}) }]
}
const DESKTOP_TAB_PAD = '\u00a0'.repeat(3)
const DESKTOP_LINE_PT = 19
// One column of `bodyColumns` in the Claude app pane, in points: 15.8 px at 2x.
const DESKTOP_CELL_PT = 7.9
const DESKTOP_LINK_GAP_CELLS = 1.5
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
/** The pane's ● and ○ glyphs, as measured in the app: 11 pt across, centred 6.55 pt into the mark column. */
const MARK_GLYPH_PT = 11
const MARK_GLYPH_MID_PT = 6.55
const RUNNING_SVG_CELLS = 2
/** A result mark and the space after it, as wide as a running mark's Svg on desktop. */
const RESULT_MARK_CELLS = RUNNING_SVG_CELLS
/**
 * A running mark on desktop: a dot that fades and returns. SMIL runs it, since a pane redraw loop stops clicks there.
 * Each pane redraw starts the animation again, so it begins at the clock's point in the pulse.
 */
function runningSvg(now: number): string {
  const width = RUNNING_SVG_CELLS * DESKTOP_CELL_PT
  const height = DESKTOP_LINE_PT
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>.mark{fill:#595959}@media (prefers-color-scheme: dark){.mark{fill:#a8a8a8}}</style>` +
    `<circle class="mark" cx="${MARK_GLYPH_MID_PT}" cy="${height / 2}" r="${MARK_GLYPH_PT / 2}">` +
    `<animate attributeName="opacity" values="1;0.3;1" dur="${RUNNING_PULSE_MS}ms" begin="-${now % RUNNING_PULSE_MS}ms" repeatCount="indefinite"/>` +
    `</circle></svg>`
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
/** One point, across in cells and down in lines: desktop draws a tree line as a filled Box, since it has no per-side borders. */
const DESKTOP_HAIR_CELLS = 1 / DESKTOP_CELL_PT
const DESKTOP_HAIR_LINES = 1 / DESKTOP_LINE_PT
/**
 * Where the Overview's tree line runs on desktop, in cells from a row's mark column: under the middle of a subject's
 * mark, which the Claude app 3.6556 draws 6.4 pt into the column, where a cell is 8.8 pt.
 */
const DESKTOP_TREE_AT = 0.73
/** The room the tree's arm leaves before a child's mark on desktop, in cells. */
const DESKTOP_ARM_GAP = 0.4
const OVERVIEW_PAD_Y = OVERVIEW_ROW_PAD_PT / DESKTOP_LINE_PT
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
  /** A banner's border, and its fill where the palette can tint one. */
  banner: Record<BannerTone, { line: string; fill?: string }>
}

/** Theme keys have no tint of each tone, so banners in these palettes draw their border alone. */
const THEME_KEY_BANNERS: Palette['banner'] = {
  error: { line: 'error' },
  warning: { line: NEEDS_YOU },
  notice: { line: 'inactive' },
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
  banner: DARK_BANNER_TINTS,
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
  banner: LIGHT_BANNER_TINTS,
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
  banner: THEME_KEY_BANNERS,
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
  banner: THEME_KEY_BANNERS,
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
  banner: THEME_KEY_BANNERS,
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
  banner: {
    error: { line: 'rgba(214, 69, 80, 0.32)', fill: 'rgba(214, 69, 80, 0.1)' },
    warning: { line: 'rgba(212, 160, 23, 0.36)', fill: 'rgba(212, 160, 23, 0.1)' },
    notice: { line: 'rgba(128, 120, 105, 0.28)', fill: 'rgba(128, 120, 105, 0.1)' },
  },
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
/** The docked terminal tabs' padding inside each tab, gap between tabs and right margin, from roomiest to tightest. */
const FRAMED_TAB_LAYOUTS = [
  { pad: TAB_PAD, gap: 1, right: 1 },
  { pad: ' ', gap: 1, right: 1 },
  { pad: ' ', gap: 0, right: 1 },
  { pad: ' ', gap: 0, right: 0 },
  { pad: '', gap: 1, right: 0 },
]
/** The inline tab row's gaps between tabs, from roomiest to tightest. */
const INLINE_TAB_GAPS = [3, 2, 1]
const INLINE_RAIL_AT = 80
const RAIL_GUTTER = 2
const FOLD_KINDS: FoldKind[] = [...NEEDS_YOU_GROUPS.map(g => g.kind), 'issue', 'opportunity']
const AWAY_MS = 15 * 60_000

/** The conversation whose first prompt has had the Overview's headline and status carried beside it. */
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
/**
 * The calls tool.check saw that may still wait on a dialog: tool_use_id to `callKey`, the key their dialog has. A
 * call leaves when its verdict is not an ask, when it starts running and when it ends.
 */
const askedCalls = new Map<string, string>()
/** Each agent this session spawned inside a child: its id to the Workflow call or the agent that spawned it. */
const spawnedBy = new Map<string, string>()
/** Each Workflow call's tool_use_id to the task id its child is kept under. */
const workflowTasks = new Map<string, string>()
/** Each background `herdr agent wait`'s task id and tool_use_id to the delegate it waits on. */
const delegateWaits = new Map<string, string>()
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
/** The conversations whose Overview calls run one after another. They do not hold `queue`, so a ledger call never waits for one. */
const resultsOrder = orderedKeys()
const reportToHerdr = herdrReporter()
let shellCommand: string | null = null
let toolsRefused = false
let isReadingAgain = false
let version: string | null = null
let isNextBuild = false
/** Where a next build keeps its Overview call records, or null on a release build. */
let overviewRecordsFolder: string | null = null
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
/** Each row's latest reply field: its key, and the draft text it opened with. */
const openFields = new Map<string, { key: string; seed: string }>()
let paneClosesOnEscape = true
/** The row whose field opened while the keys stayed elsewhere, as over text in the prompt. */
let fieldWithoutKeys: string | null = null
const paneHasKeys = new Map<RenderSurface, boolean>()

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

/** Notes the main agent's activity, and runs the Overview call when the running turn is due one. */
async function noteActivity($: EngineInterface, line: string) {
  const owner = currentOwner()
  const now = await $.clock.now()
  let isClaimed = false
  await commit($, owner, s => {
    const noted = noteTurnActivity(s, line)
    const claimed = claimedOverviewRefresh(noted, now)
    isClaimed = claimed !== noted
    return claimed
  }).catch(() => undefined)
  if (isClaimed)
    void refreshOverview({
      ...hostOf($, owner),
      inOrder: fn => resultsOrder.run(owner.id, fn),
      records: recordsOf($, owner),
    })
}

function messageText(message: SessionAppendMessage): string {
  return message.content.map(b => (b.type === 'text' ? b.text : '')).join('')
}

async function syncTheme($: EngineInterface) {
  const theme = (await $.config.list().catch(() => [])).find(row => row.key === 'theme')?.value
  await update($, THEME, () => (typeof theme === 'string' ? theme : ''))
}

function publishStatus($: EngineInterface, isEnding = false): Promise<void> {
  return reportToHerdr(processRun($), async () => {
    const pane = await $.env.get('HERDR_PANE_ID')
    if (!pane) return null
    if (isEnding) return { pane, tokens: CLEARED_TOKENS }
    const [session, dialogs, now] = await Promise.all([read($, SESSION), read($, DIALOGS), $.clock.now()])
    const view = sessionView(session, now, SETTLED_MS, CAN_CATCH_UP)

    return { pane, tokens: herdrTokens(session.ledger, session.stop, view, dialogs) }
  })
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

/**
 * Shows the permission row of the call `id` if its verdict is an ask and the call is still waiting
 * PERMISSION_FALLBACK_DELAY_MS later. The auto-mode classifier can settle an ask well within the delay, and the
 * verdict does not say whether a dialog or the classifier answers it. A query asks no PreToolUse hook, so an ask
 * that only a PreToolUse hook makes shows no row.
 */
async function waitForPermission($: EngineInterface, id: string, tool: string, rawInput: unknown) {
  const input = (rawInput ?? {}) as Record<string, unknown>
  const key = callKey(tool, input)
  askedCalls.set(id, key)
  try {
    const { decision } = await $.tool.check({ tool, input })
    if (decision !== 'ask') {
      askedCalls.delete(id)
      return
    }
    await $.clock.sleep(PERMISSION_FALLBACK_DELAY_MS)
    if (!askedCalls.has(id) || hasPermissionRequestHook) return
    await openDialog($, { kind: 'permission', text: permissionText(tool, input), key })
  } catch {
    askedCalls.delete(id)
  }
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

// The plugin directory refuses `$` passed to a function that another of the mod's files declares, so every
// function that takes `$`, the session's storage and the SessionHost included, lives in this file.

const OLD_LEDGER = atom({ plugin: 'inbox', key: 'ledger' } as const, EMPTY)
const OLD_PRESENCE = atom(
  { plugin: 'inbox', key: 'presence' } as const,
  {
    lastActiveAt: 0,
    isAway: false,
    isUpdating: false,
    ledgerState: 'current',
    turnsStarted: 0,
    turnsApplied: 0,
    minute: 0,
  } as OldPresence,
)
const OLD_PR_VIEWS = atom(
  { plugin: 'inbox', key: 'prViews' } as const,
  { views: {}, branchRef: null, isFetching: false } as PrViews,
)
const OLD_STOP = atom({ plugin: 'inbox', key: 'stop' } as const, null as Stop | null)
const OLD_LAST_ACTIONS = atom({ plugin: 'inbox', key: 'lastActions' } as const, {} as Record<string, LastAction>)
const OLD_SENT = atom({ plugin: 'inbox', key: 'sent' } as const, [] as SentPrompt[])
const OLD_UNTRACKED_SENT = atom(
  { plugin: 'inbox', key: 'untrackedSent' } as const,
  [] as { sessionId: string; text: string }[],
)

/** The conversation the session runs. /clear, /resume and /branch move it to another id, and each move is a new generation. */
const conversation = { id: '', root: '', generation: 0 }

type Owner = { id: string; generation: number }

function currentOwner(): Owner {
  return { id: conversation.id, generation: conversation.generation }
}

function isCurrent(owner: Owner): boolean {
  return owner.id === conversation.id && owner.generation === conversation.generation
}

/**
 * The session as an older build left it in its separate fields, for a hot reload into this build. A sent message
 * whose record those fields lost is kept as an uncertain record, so its arrival cannot be credited to a newer press.
 */
async function fromOldFields($: EngineInterface): Promise<Session> {
  const [id, ledger, presence, prViews, stop, lastActions, sent, untracked] = await Promise.all([
    $.session.id(),
    read($, OLD_LEDGER),
    read($, OLD_PRESENCE),
    read($, OLD_PR_VIEWS),
    read($, OLD_STOP),
    read($, OLD_LAST_ACTIONS),
    read($, OLD_SENT),
    read($, OLD_UNTRACKED_SENT),
  ])
  await update($, AWAY, () => ({
    lastActiveAt: presence.lastActiveAt,
    isAway: presence.isAway,
    minute: presence.minute,
  }))

  return upgradeSession({
    ledger,
    presence: {
      isUpdating: presence.isUpdating,
      ledgerState: presence.ledgerState,
      // Presence from before the turn counts existed cannot say whether the last turn's update landed, so that
      // load catches up once.
      turnsStarted: presence.turnsStarted ?? 1,
      turnsApplied: presence.turnsApplied ?? 0,
    },
    prViews,
    stop,
    lastActions,
    sent: [
      ...(sent ?? [])
        .filter(p => p.sessionId === id)
        .map(p => ({ text: p.text, press: null, at: p.pressedAt ?? 0, pressedAt: p.pressedAt, deliveryId: p.id })),
      ...(untracked ?? []).filter(u => u.sessionId === id).map(u => uncertainRecord(u.text)),
    ],
  })
}

/** A sent message no record can be matched to. Its text arriving reads unconfirmed. */
function uncertainRecord(text: string): Session['sent'][number] {
  return {
    text,
    press: null,
    at: 0,
    row: null,
    queuedId: null,
    pressedAt: null,
    deliveryId: null,
    phase: 'uncertain',
  }
}

function isUntracked(record: Session['sent'][number]): boolean {
  return record.phase === 'uncertain' && record.deliveryId === null
}

/**
 * Brings the drawn session to the current shape. A row's queued message that has no sent record lost it to an
 * older build, so its record becomes uncertain and the row reads unconfirmed.
 */
async function upgradeDrawn($: EngineInterface): Promise<ModSession> {
  const written = await $.state.get({ plugin: 'inbox', key: 'session' })
  const base = written.value === undefined ? await fromOldFields($) : upgradeSession(written.value as SavedSession)

  return update($, SESSION, cur => {
    const s = written.value === undefined ? base : upgradeSession(cur as SavedSession)
    const lost = Object.entries(s.lastActions).flatMap(([row, action]) => {
      const delivery = action.delivery
      return /^[if]\d+$/.test(row) &&
        delivery?.state === 'queued' &&
        !s.sent.some(x =>
          delivery.id ? x.deliveryId === delivery.id : x.text === delivery.message && x.pressedAt === action.at,
        )
        ? [delivery.message]
        : []
    })
    const fresh = lost.filter(text => !s.sent.some(x => isUntracked(x) && x.text === text))

    return {
      ...s,
      sent: [...s.sent, ...fresh.map(uncertainRecord)],
      lastActions: lost.reduce((actions, text) => withUnconfirmed(actions, text), s.lastActions),
      revision: (cur.revision ?? 0) + 1,
    }
  })
}

/**
 * Replaces the drawn session outside the write loop, as a conversation switch or load does. A change that returns
 * the session it was given writes nothing.
 */
async function replaceDrawn($: EngineInterface, change: (s: ModSession) => Session): Promise<ModSession> {
  const cur = await read($, SESSION)
  if (change(cur) === cur) return cur

  return update($, SESSION, s => ({ ...change(s), revision: s.revision + 1 }))
}

const MAX_TRIES = 20

/** A session change that landed: the session it read and the one it wrote, and whether that session is the drawn one. */
type Changed = { before: Session; after: Session; isDrawn: boolean }

/**
 * Changes the session of `owner`. While its conversation is drawn, the change runs on the drawn session and is
 * written only if no other write landed meanwhile; otherwise it runs again on what landed. Once the conversation
 * moved on, the change goes to its saved session. A change that returns the session it was given writes nothing.
 * Every write saves the pane's `held` rows and its showing of the real session, and prunes the session with `pruned`.
 * A write that changes more than the running turn saves.
 */
async function changeSession(
  $: EngineInterface,
  owner: Owner,
  change: (s: Session) => Session | Promise<Session>,
  held: Set<string>,
): Promise<Changed> {
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    if (!isCurrent(owner)) return changeSaved($, owner.id, change)
    const drawn = await read($, SESSION)
    // A hot reload can leave a session an earlier build wrote. The fetch that is running still runs.
    const upgraded = upgradeSession(drawn)
    const before = { ...upgraded, prViews: { ...upgraded.prViews, isFetching: drawn.prViews.isFetching } }
    const changed = await change(before)
    if (changed === before) return { before, after: before, isDrawn: true }
    // A resume drops the running turn, so a write that changes only the turn, such as each tool call's activity,
    // leaves the saved copy alone.
    const isTurnOnly = (Object.keys(changed) as (keyof Session)[]).every(k => k === 'turn' || changed[k] === before[k])
    const shown = await read($, SHOWN)
    const kept = pruned({ ...changed, heldRows: [...held], shownSince: shown && !shown.isDemo ? shown.since : null })
    let landed: ModSession | null = null
    await update($, SESSION, cur => {
      if (!isCurrent(owner) || cur.revision !== drawn.revision) {
        landed = null
        return cur
      }
      landed = { ...kept, revision: drawn.revision + 1 }
      return landed
    })
    const written = landed as ModSession | null
    if (!written) continue
    if (!isTurnOnly && (await read($, UNREADABLE)) !== owner.id) await save($, owner, written)
    return { before, after: written, isDrawn: isCurrent(owner) }
  }
  throw new Error('The session kept changing under this write.')
}

/**
 * Changes a conversation's saved session, after its pending saves, and prunes it with `pruned`. The pane draws another
 * conversation, so this one holds no rows and has no showing. A session the store cannot read stays as it is.
 */
async function changeSaved(
  $: EngineInterface,
  id: string,
  change: (s: Session) => Session | Promise<Session>,
): Promise<Changed> {
  savedWrites++
  // The read, the change and the write run in the save queue, so two changes to one saved session cannot both
  // start from the same read.
  const changed = saving.then(async (): Promise<Changed> => {
    const saved = await readSaved($, id)
    if (!saved?.session) return { before: emptySession(), after: emptySession(), isDrawn: false }
    const before = upgradeSession(saved.session)
    const result = await change(before)
    if (result === before) return { before, after: before, isDrawn: false }
    const after = pruned({ ...result, heldRows: [], shownSince: null })
    await $.store.set(sessionKey(id), { savedAt: saved.session.savedAt, ...after })

    return { before, after, isDrawn: false }
  })
  const write = changed.then(() => undefined)
  saving = write.catch(() => undefined)
  track(id, write)

  return changed
}

type SavedRecord = SavedSession & { savedAt: number }

const sessionKey = (id: string) => `s:${id}`

let saving: Promise<void> = Promise.resolve()
/** How many changes went to a saved session that is not drawn, so a load can tell its read is out of date. */
let savedWrites = 0

const savesBySession = new Map<string, Promise<void>>()
const prunedSaves = new Set<string>()
const savedRevisions = new Map<string, number>()

function track(id: string, write: Promise<void>) {
  savesBySession.set(id, write)
  void write
    .finally(() => {
      if (savesBySession.get(id) === write) savesBySession.delete(id)
    })
    .catch(() => undefined)
}

/**
 * Saves a conversation's session, once every earlier save has landed. A save older than one already resolved is
 * skipped. The first save of each conversation also deletes the oldest saved sessions beyond the newest `KEPT_SESSIONS`.
 */
function save($: EngineInterface, owner: Owner, s: ModSession): Promise<void> {
  const key = sessionKey(owner.id)
  const generation = `${owner.id}:${owner.generation}`
  savedRevisions.set(generation, Math.max(savedRevisions.get(generation) ?? 0, s.revision))
  const { revision: _revision, ...session } = s
  const write = Promise.all([saving, $.clock.now()]).then(async ([, savedAt]) => {
    if (s.revision < (savedRevisions.get(generation) ?? 0)) return
    await $.store.set(key, { savedAt, ...session })
    if (prunedSaves.has(generation)) return
    const keys = await $.store.keys()
    const sessions = keys.filter(k => k.startsWith('s:'))
    const ages = await Promise.all(
      sessions.map(async candidate => {
        try {
          const saved = (await $.store.get(candidate)) as SavedRecord | undefined
          return saved && Number.isFinite(saved.savedAt) && saved.ledger && typeof saved.ledger === 'object'
            ? { key: candidate, savedAt: saved.savedAt }
            : null
        } catch {
          return null
        }
      }),
    )
    const stale = ages
      .filter((entry): entry is { key: string; savedAt: number } => entry !== null && entry.key !== key)
      .sort((a, b) => a.savedAt - b.savedAt || a.key.localeCompare(b.key))
      .slice(0, Math.max(0, sessions.length - KEPT_SESSIONS))
      .map(entry => entry.key)
    // `p:` keys held the last-session offer, which earlier builds saved per folder.
    await Promise.all([...stale, ...keys.filter(k => k.startsWith('p:'))].map(old => $.store.delete(old)))
    prunedSaves.add(generation)
  })
  saving = write.catch(() => undefined)
  track(owner.id, write)

  return write
}

/** A conversation's saved session, or `{ session: undefined }` when none is saved. Null when the store cannot read it. */
async function readSaved($: EngineInterface, id: string): Promise<{ session: SavedRecord | undefined } | null> {
  try {
    return { session: (await $.store.get(sessionKey(id))) as SavedRecord | undefined }
  } catch {
    return null
  }
}

/** A conversation's saved session, once its pending saves have landed. */
async function readSettled($: EngineInterface, id: string) {
  await savesBySession.get(id)?.catch(() => undefined)

  return readSaved($, id)
}

/**
 * The prompt rows of the mod's own messages Claude Code has stored, by text: how many rows were stored before
 * each, and the sent record each matched. A rewritten message is confirmed from these, since its row may be stored
 * before `$.prompt.submit` returns.
 */
const stored = {
  count: 0,
  at: new Map<string, number>(),
  by: new Map<string, { count: number; deliveryId: string | null }>(),
}

function forgetStored() {
  stored.at.clear()
  stored.by.clear()
}

/** Records that Claude Code stored a prompt row of the mod's own. Returns the row's count, for `arrived`. */
function noteStored(text: string): number {
  const count = ++stored.count
  stored.at.set(text, count)
  stored.by.set(text, { count, deliveryId: null })

  return count
}

/**
 * Matches the stored prompt row `count` to the message a press sent. A message matches while its send is still
 * running too, since Claude Code stores the row before `$.prompt.submit` returns. When an older build's untracked
 * send has the same text, the row confirms nothing, so it reads unconfirmed.
 */
function arrived(s: Session, text: string, count: number): { state: Session; sentBy: SentBy } {
  const tracked = s.sent.filter(x => !isUntracked(x))
  const index = tracked.findIndex(x => x.text === text)
  const match = tracked[index]
  if (!match || s.sent.some(x => isUntracked(x) && x.text === text)) {
    return {
      state: {
        ...s,
        sent: match ? s.sent.filter(x => x !== match) : s.sent,
        lastActions: withUnconfirmed(s.lastActions, text),
      },
      sentBy: { press: null },
    }
  }
  if (stored.by.get(text)?.count === count) stored.by.set(text, { count, deliveryId: match.deliveryId })
  const lastActions = tracked
    .slice(index + 1)
    .filter(x => x.text === text && x.row !== null)
    .reduce(
      (actions, later) => withUnconfirmed(actions, text, later.pressedAt ?? undefined, later.deliveryId),
      match.row === null
        ? s.lastActions
        : withArrival(s.lastActions, text, match.pressedAt ?? undefined, match.deliveryId),
    )

  return { state: { ...s, sent: s.sent.filter(x => x !== match), lastActions }, sentBy: { press: match.press } }
}

/**
 * Settles a message another plugin rewrote whose row Claude Code stored before `$.prompt.submit` returned. The row
 * confirms the press only when no other record or untracked send shares the new text and the row matched no record.
 * Returns how the send went, or null when the row is not stored yet and the shared code settles it.
 */
function settleRewrite(
  s: Session,
  deliveryId: string,
  text: string,
  entered: string,
  since: number,
): { state: Session; outcome: SendOutcome } | null {
  if ((stored.at.get(entered) ?? 0) <= since) return null
  const record = s.sent.find(x => x.deliveryId === deliveryId)
  const rows = Object.entries(s.lastActions).filter(
    ([_id, a]) => a.delivery && 'id' in a.delivery && a.delivery.id === deliveryId,
  )
  const moved = rows.reduce(
    (actions, [id, a]) => withRewrite(actions, [id], a.at, text, entered, deliveryId),
    s.lastActions,
  )
  const isConfirmed =
    !s.sent.some(x => x.deliveryId !== deliveryId && x.text === entered) && stored.by.get(entered)?.deliveryId === null
  if (isConfirmed)
    return {
      state: {
        ...s,
        sent: s.sent.filter(x => x.deliveryId !== deliveryId),
        lastActions: withArrival(moved, entered, undefined, deliveryId),
        turn: { ...s.turn, press: s.turn.press ?? record?.press ?? null },
      },
      outcome: { state: 'accepted', queuedId: null },
    }

  return {
    state: {
      ...s,
      sent: s.sent.map(x => (x.deliveryId === deliveryId ? { ...x, text: entered } : x)),
      lastActions: withUnconfirmed(moved, entered, undefined, deliveryId),
    },
    outcome: { state: 'unconfirmed', reason: 'Another plugin changed the message' },
  }
}

const MODEL = 'sonnet'

type ModelResult = Awaited<ReturnType<EngineInterface['model']['fork']>>

function askLedgerModel($: EngineInterface, prompt: string, system: string, timeoutMs: number): Promise<ModelResult> {
  return $.model.complete({
    model: MODEL,
    system: [{ text: system, cache: true as const }],
    prompt,
    maxTokens: 1600,
    effort: 'low',
    timeoutMs,
  })
}

/** The engine does not say which model answered. */
function callReport(r: ModelResult): CallReport {
  if (r.isAnswered) return { model: MODEL }
  const error = r.reason === 'api-error' ? `api-error ${r.status ?? 'with no response'}: ${r.error}` : r.reason

  return { model: MODEL, error }
}

/** Calls the inbox model as `askLedgerModel` does, waiting up to `timeoutMs`. */
function modelAsk($: EngineInterface, timeoutMs: number): Ask {
  return async (prompt, system, report) => {
    const r = await askLedgerModel($, prompt, system, timeoutMs)
    report?.(callReport(r))
    return r.isAnswered ? r.text : null
  }
}

/** The engine has no call that removes a file, so removing runs `rm` and `rmdir`. */
function recordFiles($: EngineInterface): RecordFiles {
  return {
    write: (path, text) => $.fs.write(path, text),
    list: async folder => (await $.fs.list(folder).catch(() => [])).map(entry => entry.name),
    removeFiles: async paths => void (await $.process.run(['rm', '-f', '--', ...paths])),
    removeFolder: async path => void (await $.process.run(['rmdir', '--', path])),
  }
}

/** The folder a next build keeps its Overview call records in, under Claude Code's configuration folder. */
async function recordsFolder($: EngineInterface): Promise<string | null> {
  const home = await $.env.get('HOME')
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) || (home ? `${home}/.claude` : null)

  return config ? `${config}/plugins/data/inbox/overview-calls` : null
}

function overviewRecords($: EngineInterface, folder: string, owner: Owner): OverviewRecords {
  return { host: 'claude-code', folder, session: owner.id, files: recordFiles($) }
}

const COPY_FAILURES: Record<Extract<UiCopyResult, { isCopied: false }>['reason'], string> = {
  'no-surface': 'no app is attached',
  'no-clipboard': 'the clipboard did not take it',
  refused: 'another plugin refused it',
}

async function openUrl($: EngineInterface, url: string): Promise<string | null> {
  const r = await $.process.run(['open', url])

  return r.exitCode === 0 ? null : r.stderr.trim() || `open exited ${r.exitCode}`
}

async function openPath($: EngineInterface, raw: string): Promise<string | null> {
  const path = localPath(raw, conversation.root, (await $.env.get('HOME')) ?? '')
  if (!(await $.fs.exists(path))) return 'it no longer exists'
  const stat = await $.fs.stat(path)
  const isFile = stat.kind === 'file'
  const isExecutable = isFile && (await $.process.run(['test', '-x', path])).exitCode === 0
  const { argv, fallback } = openCommands(path, isFile, isExecutable)
  const r = await $.process.run(argv)
  const retry = r.exitCode !== 0 && fallback ? await $.process.run(fallback) : r

  return retry.exitCode === 0 ? null : retry.stderr.trim() || `open exited ${retry.exitCode}`
}

async function perform(
  $: EngineInterface,
  effect: Extract<Effect, { kind: 'open' | 'copy' }>,
  surface: UiPressArgument['surface'],
): Promise<string | null> {
  try {
    if (effect.kind === 'open')
      return await (/^[a-z][a-z\d+.-]*:\/\//i.test(effect.target)
        ? openUrl($, effect.target)
        : openPath($, effect.target))
    const r = await $.ui.copy({ text: effect.text, surface })
    return r.isCopied ? null : COPY_FAILURES[r.reason]
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

function gh($: EngineInterface, args: string[]) {
  return $.process.run(['gh', ...args], { cwd: conversation.root, timeoutMs: 20_000 })
}

/** `$.process.run` as the shared `Run`: a run that rejects, because it could not start or outlived its timeout, ends with code -1. */
function processRun($: EngineInterface): Run {
  return (args, { cwd, timeoutMs, env }) =>
    $.process.run(args, { cwd, timeoutMs, env }).then(
      r => ({ code: r.exitCode, stdout: r.stdout, stderr: r.stderr }),
      (err: unknown) => ({ code: -1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }),
    )
}

/**
 * `$.process.run` rejects when the command cannot start, and also when it is still running at the timeout. Asking
 * for `gh --version` tells them apart: only a gh that cannot start makes this reject too.
 */
async function isGhUnstartable($: EngineInterface): Promise<boolean> {
  try {
    await gh($, ['--version'])

    return false
  } catch {
    return true
  }
}

/**
 * Sends a message as the person's own prompt. Claude Code may store its row before `$.prompt.submit` returns, as
 * the mod's `session.append` handler sees, and another plugin may rewrite it.
 */
async function deliver($: EngineInterface, owner: Owner, text: string, deliveryId: string): Promise<SendOutcome> {
  if (!isCurrent(owner)) return { state: 'rejected', reason: 'the conversation changed first' }
  const since = stored.count
  type Submitted = { entered: string } | { notSent: string }
  const sent = await $.prompt.submit({ text, asUser: true }).then(
    (r): Submitted => (r.drop === undefined ? { entered: r.text } : { notSent: r.drop }),
    (err: unknown): Submitted =>
      (stored.at.get(text) ?? 0) > since
        ? { entered: text }
        : { notSent: (err instanceof Error ? err.message : String(err)) || 'the session refused it' },
  )
  if ('notSent' in sent) return { state: 'rejected', reason: sent.notSent }
  const entered = sent.entered
  if (entered === text) return { state: 'accepted', queuedId: null }
  let outcome: SendOutcome = { state: 'accepted', queuedId: null, entered }
  const { heldRows } = await read($, SESSION)
  await changeSession(
    $,
    owner,
    s => {
      const settled = settleRewrite(s, deliveryId, text, entered, since)
      outcome = settled?.outcome ?? { state: 'accepted', queuedId: null, entered }
      return settled?.state ?? s
    },
    new Set(heldRows),
  )

  return outcome
}

/** The page template for a comparison, as the mod ships it. */
function comparePagePath($: EngineInterface): string {
  return `${$.plugin.root}/hooks/${COMPARE_PAGE_FILE}`
}

/** The mod's SessionHost for the conversation `owner`, with copies going to `surface`. */
function sessionHost(
  $: EngineInterface,
  owner: Owner,
  opts: {
    /** Changes the session, with what the drawing does after each write. */
    update: SessionHost<Session>['update']
    surface?: UiPressArgument['surface']
    settleWindowMs: number
    onGhMissing: (isMissing: boolean) => void
    /** Fetches the session's PRs, and resolves once that fetch ends. */
    refreshPrs: () => Promise<void>
  },
): SessionHost<Session> {
  // gh is taken to start until a run fails. Then `find` asks it for its version, which only an unstartable gh refuses.
  let ghFound: string | null | undefined = 'gh'

  return {
    now: () => $.clock.now(),
    read: async () => {
      if (isCurrent(owner)) return upgradeSession(await read($, SESSION))
      const saved = await readSettled($, owner.id)
      return saved?.session ? upgradeSession(saved.session) : emptySession()
    },
    update: opts.update,
    exclusive: fn => updating.run(owner.id, fn),
    ask: modelAsk($, 45_000),
    deliver: (_s, text, deliveryId) => deliver($, owner, text, deliveryId),
    isDeliveryHeldUntilRun: true,
    perform: async (_s, effect) => (opts.surface ? perform($, effect, opts.surface) : COPY_FAILURES['no-surface']),
    refreshPrs: opts.refreshPrs,
    gh: {
      find: async () => {
        if (ghFound === undefined) ghFound = (await isGhUnstartable($)) ? null : 'gh'
        return ghFound
      },
      forget: () => {
        ghFound = undefined
      },
      run: (_s, _bin, onUnstartable) => async args => {
        try {
          return await gh($, args)
        } catch (err) {
          onUnstartable()
          return { exitCode: -1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }
        }
      },
      noteMissing: opts.onGhMissing,
    },
    settleWindowMs: opts.settleWindowMs,
    comparePage: comparePagePath($),
    newId: () => crypto.randomUUID(),
  }
}

/** The conversations whose per-reply update runs now. */
const updating = exclusiveKeys()

/** Changes the ledger of `owner`'s session. */
function commitLedger(
  $: EngineInterface,
  change: (l: Ledger) => Ledger,
  owner: Owner = currentOwner(),
): Promise<Session> {
  return commit($, owner, s => ({ ...s, ledger: change(s.ledger) }))
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
  if (!isDrawn || after === before) return after
  void publishStatus($)
  void followNewRows($).catch(() => undefined)

  return after
}

/**
 * The session a look draws: `session`, with the ledger, PR views, presses and turn counts of the sample while it shows,
 * and the sample's place and presence.
 */
function drawnSession(
  session: Session,
  drawn: Pick<DemoCopy, 'ledger' | 'stop' | 'prViews' | 'lastActions' | 'turns'>,
  isDemo: boolean,
  now: number,
): Session {
  const { ledger, stop, prViews, lastActions, turns } = drawn
  const s = { ...session, ledger, stop, prViews, lastActions, presence: { ...session.presence, ...turns } }

  return isDemo ? withDemoPresence(s, now) : s
}

/** When the last Undo the view offers ends, or null when it offers none. */
function lastUndoEnd(view: SessionView): number | null {
  const ends = [...allRows(view).map(r => r.state), ...view.prs.drawn.map(d => d.state)].flatMap(state =>
    state.is === 'settled' && state.canUndo ? [state.at + SETTLED_MS] : [],
  )

  return ends.length > 0 ? Math.max(...ends) : null
}

let undoRedrawsUntil = -Infinity

/** Redraws the pane while Undo lasts, to `expiresAt`, unless a redraw already runs to then or later. */
function redrawWhileUndoLasts($: EngineInterface, expiresAt: number) {
  if (expiresAt <= undoRedrawsUntil) return
  undoRedrawsUntil = expiresAt
  // Desktop redraws once, when Undo ends: while the terminal's steps redrew every 213 ms there, clicks on the
  // pane's Buttons, Undo among them, did nothing.
  void (async () => {
    const startedAt = await $.clock.now()
    const remaining = Math.max(0, expiresAt - startedAt)
    const steps =
      paneLook === 'desktop' ? 1 : Math.max(1, Math.ceil(remaining / Math.ceil(SETTLED_MS / UNDO_REDRAW_STEPS)))
    for (let n = 1; n <= steps; n++) {
      await $.clock.sleep(Math.max(0, Math.ceil(startedAt + (n * remaining) / steps - (await $.clock.now()))))
      await Promise.all([redraw($), update($, DEMO, d => d && { ...d })])
    }
    await openLeftRows($)
    await finishPendingUndoScroll($)
  })().catch(() => undefined)
}

let runningMarkTimer: Timer | null = null
let isRunningMarkDrawn = false

/**
 * Redraws the terminal pane each frame while it shows a running mark. A tick that follows no such drawing stops the
 * timer, as when the pane closed or left the Overview. Desktop runs no loop, as `redrawWhileUndoLasts` says why.
 */
function animateRunningMarks($: EngineInterface, isDrawn: boolean) {
  isRunningMarkDrawn = isDrawn
  if (!isDrawn || runningMarkTimer !== null) return
  runningMarkTimer = $.clock.every(RUNNING_FRAME_MS, () => {
    if (!isRunningMarkDrawn || paneLook === 'desktop') {
      runningMarkTimer?.cancel()
      runningMarkTimer = null
      return
    }
    isRunningMarkDrawn = false
    void update($, RUNNING_FRAME, n => n + 1).catch(() => undefined)
  })
}

function later($: EngineInterface, waitMs: number, run: () => unknown) {
  void (async () => {
    await $.clock.sleep(waitMs)
    await run()
  })().catch(() => undefined)
}

let compareRedrawAt: number | null = null

/** Redraws when the soonest Compare press reaches its limit, then waits for the next one. */
async function redrawAtCompareEnd($: EngineInterface) {
  const { lastActions, now } = await drawnState($)
  const at = compareEndsAt(lastActions, now)
  if (at === null || (compareRedrawAt !== null && compareRedrawAt <= at)) return
  compareRedrawAt = at
  later($, at - now, async () => {
    compareRedrawAt = null
    await redraw($)
    await redrawAtCompareEnd($)
  })
}

/** Redraws once the pane draws the loaded session, so its render times Undo, and again as its results and notes clear. */
async function redrawAfterReload($: EngineInterface) {
  const { lastActions, notes, now } = await drawnState($)
  const times = [
    ...Object.values(lastActions).flatMap(a => (a.result ? [a.result.at] : [])),
    ...Object.values(notes).map(n => n.at),
  ]
  const latest = Math.max(...times)
  if (times.length > 0 && latest + SETTLED_MS > now) later($, latest + SETTLED_MS - now, () => redraw($))
  await redraw($)
  await redrawAtCompareEnd($)
}

/**
 * The model's answer to a catch-up over the whole conversation: from a fork of it, or from the transcript when there
 * is nothing to fork.
 */
async function catchUpReply($: EngineInterface, owner: Owner): Promise<CatchUpReply> {
  if (!isCurrent(owner)) return { kind: 'failed' }
  const [{ ledger }, shown, transcript] = await Promise.all([
    read($, SESSION),
    screen($),
    $.session.messages().then(transcriptText),
  ])
  // The Overview call reads the transcript.
  const askLong = modelAsk($, 90_000)
  const overview: OverviewCall | null = transcript
    ? {
        exchange: { kind: 'catch-up', conversation: transcript },
        ask: async (prompt, system, report) => (isCurrent(owner) ? askLong(prompt, system, report) : null),
      }
    : null
  const forked = await $.model.fork({ prompt: catchUpPrompt(CLAUDE_CODE, ledger, shown) })
  if (!isCurrent(owner)) return { kind: 'failed' }
  if (forked.isAnswered) return { kind: 'reply', text: forked.text, source: null, overview }
  // A fork has nothing to read until this process sends its first request,
  // as after a resume. The model then reads the transcript instead, uncached.
  if (forked.reason !== 'nothing-to-fork') return { kind: 'failed' }
  if (!transcript) return { kind: 'unreadable' }
  const r = await askLedgerModel($, transcriptCatchUpPrompt(ledger, shown, transcript), systemText(CLAUDE_CODE), 90_000)
  if (!isCurrent(owner)) return { kind: 'failed' }

  return r.isAnswered ? { kind: 'reply', text: r.text, source: transcript, overview } : { kind: 'failed' }
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
    await runUpdates({
      ...hostOf($, owner),
      names: CLAUDE_CODE,
      catchUp: () => catchUpReply($, owner),
      inOrder: fn => resultsOrder.run(owner.id, fn),
      background: overviews => void overviews,
      records: recordsOf($, owner),
    })
    if (isCurrent(owner)) void publishStatus($)
  })
  // A rejected link would skip every later update, so the chain swallows it.
  queue = queue.catch(() => undefined)
}

function recordsOf($: EngineInterface, owner: Owner): OverviewRecords | undefined {
  return overviewRecordsFolder === null ? undefined : overviewRecords($, overviewRecordsFolder, owner)
}

/** The mod's SessionHost for `owner`'s conversation. A press passes its surface, which copies go to. */
function hostOf($: EngineInterface, owner: Owner, surface?: UiPressArgument['surface']): SessionHost<Session> {
  return sessionHost($, owner, {
    update: change => commit($, owner, change),
    surface,
    settleWindowMs: SETTLED_MS,
    onGhMissing: isGhMissing =>
      void commit($, owner, s =>
        s.prViews.isGhMissing === isGhMissing ? s : { ...s, prViews: { ...s.prViews, isGhMissing } },
      ).catch(() => undefined),
    refreshPrs: () => fetchPrs($, true),
  })
}

async function tick($: EngineInterface) {
  const now = await $.clock.now()
  const [away, { presence }] = await Promise.all([read($, AWAY), read($, SESSION)])
  if (away.isAway) {
    await update($, AWAY, a => ({ ...a, minute: Math.floor(now / 60_000) }))
  } else if (!presence.isTurnRunning && away.lastActiveAt > 0 && now - away.lastActiveAt > AWAY_MS) {
    await update($, AWAY, a => ({ ...a, isAway: true, minute: Math.floor(now / 60_000) }))
  }
}

async function appendContext($: EngineInterface, context: string[]) {
  const content = [{ type: 'text' as const, text: context.join('\n\n') }]
  await $.session.append({ message: { type: 'user', content } }).catch(() => undefined)
}

/**
 * Records a prompt's words for the turn and returns what Claude reads beside it. `match` finds the press that sent a
 * message of the mod's own, when its row is stored. `isTyped` says the person typed the prompt.
 */
async function notePrompt(
  $: EngineInterface,
  text: string,
  {
    match = s => ({ state: s, sentBy: null }),
    isTyped = false,
  }: { match?: (s: Session) => { state: Session; sentBy: SentBy | null }; isTyped?: boolean } = {},
): Promise<string[]> {
  const [now, isShown] = await Promise.all([$.clock.now(), isPaneShown($)])
  await update($, AWAY, a => ({ ...a, lastActiveAt: now, isAway: false }))
  let notes: string[] = []
  await commit($, currentOwner(), s => {
    const matched = match(s)
    const r = recordPrompt(CLAUDE_CODE, matched.state, text, isShown, matched.sentBy)
    notes = r.notes
    return isTyped ? messageTyped(r.state, now) : r.state
  })

  return notes
}

/**
 * A reload keeps $.state, so a running session can still hold its parts in the separate fields of an older build,
 * `notes` as its tab, and the Asks tab as `waiting`, and drafts saved as bare text.
 */
async function upgradeState($: EngineInterface): Promise<Ledger> {
  const now = await $.clock.now()
  const [session] = await Promise.all([
    upgradeDrawn($),
    update($, TAB, t => {
      const renamed = (t as string) === 'notes' ? 'findings' : (t as string) === 'waiting' ? 'needsYou' : t

      return isShownTab(renamed) && isRowTab(renamed) ? renamed : 'needsYou'
    }),
    update($, PAGE, p => (isShownTab(p) ? p : null)),
    update($, SELECTION, ({ waiting, ...s }: Record<Tab, Cursor> & { waiting?: Cursor }) => {
      const cursors: Record<Tab, Cursor> = { ...NO_SELECTION, ...(waiting ? { needsYou: waiting } : {}), ...s }
      // A cursor saved before `openedAt` existed: no click opened its row in a way that still guards it.
      return Object.fromEntries(
        Object.entries(cursors).map(([t, c]) => [t, { ...c, openedAt: c.openedAt ?? 0 }]),
      ) as Record<Tab, Cursor>
    }),
    // Old builds saved the group kinds as `decide` and `do`, and the Finds tab's one fold as `finding`, now one per kind.
    update($, UNFOLDED, u =>
      u.flatMap((k: string): FoldKind[] =>
        k === 'finding' ? ['issue', 'opportunity'] : k === 'issue' || k === 'opportunity' ? [k] : [readKind(k)],
      ),
    ),
    // A demo an earlier build seeded may lack a field this one draws, so it ends; /inbox demo seeds a new one.
    update($, DEMO, d => (d === null || isDemoCopy(d) ? d : null)),
    // A draft saved as bare text began before now, so a row that closed before this load stays closed.
    update($, DRAFTS, (d: Record<string, Draft | string>) =>
      Object.fromEntries(
        Object.entries(d).map(([id, draft]) => [id, typeof draft === 'string' ? { text: draft, since: now } : draft]),
      ),
    ),
  ])

  return session.ledger
}

async function runTool(
  $: EngineInterface,
  tool: 'record' | 'close',
  input: Record<string, unknown>,
  toolUseId: string | undefined,
): Promise<string> {
  const now = await $.clock.now()
  let answer: Omit<ToolAnswer, 'ledger'> = { result: '', personLine: null }
  await commit($, currentOwner(), s => {
    const r = recorded(CLAUDE_CODE, s, tool, input, now)
    answer = r
    return r.state
  })
  const { personLine } = answer
  if (personLine !== null && toolUseId)
    await update($, PERSON_LINES, lines =>
      Object.fromEntries([...Object.entries(lines), [toolUseId, personLine]].slice(-MAX_PERSON_LINES)),
    )

  return answer.result
}

/**
 * Opens the pane, or raises it, asking for the keyboard. The surface grants
 * that only while the prompt holds the keys over an empty composer.
 *
 * Escape closes a pane opened with `closeOnEscape` as its close mark does, and `ui.close` names both the
 * person's. So while a reply field is open the pane opens without it: Escape then only hands the keys back,
 * and the pane's render closes the field.
 */
function openPane($: EngineInterface, isFieldOpen = false) {
  paneClosesOnEscape = !isFieldOpen
  const opened = $.ui.open({
    id: PANE,
    title: 'Inbox',
    focus: true,
    ...(isFieldOpen ? {} : { closeOnEscape: true as const }),
  })
  void opened
    .then(async () => {
      await syncShown($, { isOpen: true })
      await syncLook($, true)
    })
    .catch(() => undefined)

  return opened
}

/**
 * Starts a look while the Overview shows in the pane, and ends it when it stops showing there. Both are
 * idempotent, so every place that opens, closes or changes the pane's page can call it, after `syncShown`. The sample
 * leaves the real session's look alone. `isOpen` is whether the pane shows, when the caller knows.
 */
async function syncLook($: EngineInterface, isOpen?: boolean) {
  if (await read($, DEMO)) return
  const [page, isPaneOpen, now] = await Promise.all([readPage($), isOpen ?? isPaneShown($), $.clock.now()])
  const isShown = isPaneOpen && page === 'overview'
  await commit($, currentOwner(), s => withLook(s, isShown, now)).catch(() => undefined)
}

/**
 * What a caller knows about the showing: `isOpen` when it knows whether the pane shows, and `since` when a showing
 * starts then even on the same tab, as when another conversation loads.
 */
type Showing = { isOpen?: boolean; since?: number }

/**
 * Starts a showing when the pane opens or shows another tab or the sample, and ends it when the pane closes. A row that
 * closes during a showing stays in place no longer than it lasts, as `isSettledInPlace` says. Every write of the shown
 * tab calls it before the pane draws the tab. Idempotent without `since`, like `syncLook`.
 */
async function syncShown($: EngineInterface, { isOpen, since }: Showing = {}) {
  const [tab, isDemo, isPaneOpen, now] = await Promise.all([
    readShownTab($),
    read($, DEMO).then(d => d !== null),
    isOpen ?? isPaneShown($),
    $.clock.now(),
  ])
  await update($, SHOWN, s => {
    if (!isPaneOpen) return null
    const isSameShowing = since === undefined && s?.tab === tab && s.isDemo === isDemo

    return isSameShowing ? s : { tab, isDemo, since: since ?? now }
  })
}

async function readShownTab($: EngineInterface): Promise<ShownTab> {
  const [page, tab] = await Promise.all([readPage($), read($, TAB)])

  return page ?? tab
}

/** When the pane began showing the tab it shows now. Null while the pane is closed. */
async function readShownSince($: EngineInterface): Promise<number | null> {
  return (await read($, SHOWN))?.since ?? null
}

/** What the pane holds in place: the rows replies hold, and the rows closed since it showed its tab. */
async function readHolds($: EngineInterface): Promise<Holds> {
  const [typing, drafts, discarded, shownSince] = await Promise.all([
    read($, TYPING),
    read($, DRAFTS),
    read($, DISCARDED),
    readShownSince($),
  ])

  return { replies: heldReplies(typing, drafts), discarded, shownSince }
}

/** Opens the open pane again, without asking for the keyboard, once a reply field opened or closed. */
async function matchPaneEscape($: EngineInterface) {
  const closesOnEscape = (await read($, TYPING)) === null
  if (closesOnEscape === paneClosesOnEscape) return
  paneClosesOnEscape = closesOnEscape
  if (!(await $.ui.panes()).some(p => p.id === PANE)) return
  await $.ui.open({ id: PANE, title: 'Inbox', ...(closesOnEscape ? { closeOnEscape: true as const } : {}) })
}

async function openTopRow($: EngineInterface) {
  const [{ view, ledger, prViews: prState, lastActions, now }, tab] = await Promise.all([drawnState($), readRowTab($)])
  if (tab === null) return
  const prViews = view.prs.drawn.filter(x => x.state.is === 'open').map(x => x.pr)
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
  if (view.needsYou.count > 0) await writeRowTab($, 'needsYou')
  else if ((await read($, TAB)) === 'prs') await findPrs($)
  void syncLook($)
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

/**
 * The engine keeps a field's typed text under its key after the field leaves the drawing. Enter
 * empties it and a Button press does not. So each draft gets its own key, and the field a new draft
 * opens starts empty.
 */
function openedField(id: string, draft: Draft | undefined) {
  return { key: `type-${id}-${draft?.since ?? 0}`, seed: draft?.text ?? '' }
}

function fieldKey(id: string) {
  return openFields.get(id)?.key ?? `type-${id}`
}

async function startTyping($: EngineInterface, id: string) {
  const now = await $.clock.now()
  const drafts = await update($, DRAFTS, d => (d[id] ? d : { ...d, [id]: { text: '', since: now } }))
  openFields.set(id, openedField(id, drafts[id]))
  await keepPressedOpen($, id)
  await update($, TYPING, () => id)
  await focusField($, id)
}

async function discardReply($: EngineInterface, id: string) {
  openFields.delete(id)
  const [now, shownSince] = await Promise.all([$.clock.now(), readShownSince($)])
  await update($, DISCARDED, d => ({ ...keptDiscards(d, shownSince), [id]: now }))
  await Promise.all([
    update($, TYPING, t => (t === id ? null : t)),
    update($, DRAFTS, ({ [id]: _discarded, ...rest }) => rest),
  ])
  await openLeftRows($)
}

async function focusField($: EngineInterface, id: string) {
  // A click leaves the keys with the prompt, and `ui.focus` is refused in a pane that lacks them.
  await openPane($, true)
  const isMoved = await $.ui.focus({ requestId: PANE, key: fieldKey(id) }).then(
    r => r.deny === undefined,
    () => false,
  )
  // A deny also comes when the field's `autoFocus` took the keys first, so the pane says whether it has them.
  const isWithoutKeys = !isMoved && (await $.ui.panes()).some(p => p.id === PANE && !p.isFocused)
  if (isWithoutKeys === (fieldWithoutKeys === id)) return
  fieldWithoutKeys = isWithoutKeys ? id : null
  await redraw($)
}

/** Shows the row tab `tab`, leaving any page tab. */
async function writeRowTab($: EngineInterface, tab: Tab) {
  await Promise.all([update($, TAB, () => tab), update($, PAGE, () => null)])
  await syncShown($)
}

/** The page tab the pane shows, or null. A saved page this build does not draw reads as null and stays saved. */
async function readPage($: EngineInterface): Promise<PageTab | null> {
  const page = await read($, PAGE)

  return page !== null && drawnTabOf(page, isNextBuild) === page ? page : null
}

/** The shown row tab; null while the Overview page shows, where no row is drawn, selected or scrolled to. */
async function readRowTab($: EngineInterface): Promise<Tab | null> {
  const [page, tab] = await Promise.all([readPage($), read($, TAB)])

  return page === null ? tab : null
}

async function showTab($: EngineInterface, tab: ShownTab) {
  cancelUndoScroll()
  if (!isRowTab(tab)) {
    await update($, PAGE, () => tab)
    await syncShown($)
    void syncLook($)
    return
  }
  if (tab === 'prs') await findPrs($)
  await writeRowTab($, tab)
  void syncLook($)
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

type TerminalSpan = Span & { isLinkAddress?: true; isMuted?: true; isNeedsYou?: true; isUnbroken?: true }

function terminalTextLines(text: string, width: number, limit = Infinity): TerminalSpan[][] {
  if (!text) return []
  const spans: TerminalSpan[] = parseInline(text).flatMap(span =>
    span.link ? [span, { text: ` ${span.link}`, isLinkAddress: true as const }] : [span],
  )

  return terminalSpanLines(spans, width, limit)
}

/** `spans` wrapped at word breaks to `width` cells, cut after `limit` lines with an ellipsis. */
function terminalSpanLines(spans: TerminalSpan[], width: number, limit = Infinity): TerminalSpan[][] {
  if (spans.every(s => !s.text) || limit < 1) return []
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
  for (const span of spans) {
    for (const character of span.text) {
      endsWithNewline = character === '\n'
      if (endsWithNewline) {
        appendWord()
        nextLine()
        spaces = []
      } else if (/\s/.test(character) && !span.isUnbroken) {
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
    const shown = cutForEllipsis(last.map(c => c.text).join(''), t => t.length <= size)
    while (columns(last) > shown.length) last.pop()
    const isMuted = last.at(-1)?.span.isMuted
    last.push({ text: '…', span: { text: '…', ...(isMuted ? { isMuted } : {}) } })
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
  prs: DrawnPr[],
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
    ...(tab === 'prs' ? prs.map(x => [x.pr.ref, x.state.is === 'settled' ? x.state.at : null]) : []),
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
  const [tab, selection, drawn] = await Promise.all([readRowTab($), read($, SELECTION), drawnState($)])
  if (pendingUndoScroll !== pending || tab === null) return false
  if (tab !== pending.tab || !sameCursor(selection[tab], pending.cursor) || drawn.now >= pending.expiresAt) return false
  const prs = drawn.view.prs.drawn
  const key = settledScrollKey(
    pending.key,
    settledLayoutId(tab, drawn.view, prs, drawn.lastActions, drawn.notes, drawn.now, terminalInlineSize),
  )
  return scrollToKey($, key, pending.block, () => pendingUndoScroll === pending && pending.revealUndo, 5)
}

async function keepUndoVisible($: EngineInterface, key: string, block: UiScrollBlock, at: number, revision: number) {
  if (revision !== undoScrollRevision) return
  const [tab, selection] = await Promise.all([readRowTab($), read($, SELECTION)])
  if (revision !== undoScrollRevision || tab === null) return
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
  const [tab, selection, drawn] = await Promise.all([readRowTab($), read($, SELECTION), drawnState($)])
  if (pendingUndoScroll !== pending || revision !== undoScrollRevision) return
  const cursor = tab === null ? NO_CURSOR : selection[tab]
  if (tab !== null && tab === pending.tab && isInlineTerminalPane && conversation.id === pending.sessionId) {
    const prs = drawn.view.prs.drawn
    const openId =
      cursor.id ??
      (cursor.openedAt === 0
        ? firstWaiting(
            tabWaits(
              tab,
              drawn.view,
              prs.filter(x => x.state.is === 'open').map(x => x.pr),
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
    const prViews = view.prs.drawn.filter(x => x.state.is === 'open').map(x => x.pr)
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
    readRowTab($),
    read($, SELECTION),
  ])
  if (tab === null) return
  const prViews = view.prs.drawn.filter(x => x.state.is === 'open').map(x => x.pr)
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
  const { view, now } = await drawnState($)
  const prViews = view.prs.drawn.filter(x => x.state.is === 'open').map(x => x.pr)
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
  const [selection, tab, now] = await Promise.all([read($, SELECTION), readRowTab($), $.clock.now()])
  const cursor = tab === null ? NO_CURSOR : selection[tab]
  if (cursor.id !== rowId || !isGuarded(cursor.openedAt, now)) await onPress(press)
}

async function keepPressedOpen($: EngineInterface, id: string) {
  const tab = await readRowTab($)
  if (tab === null) return
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
  await writeRowTab($, tab)
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
  const [drawn, tab, page, unfolded, isShown] = await Promise.all([
    drawnState($),
    read($, TAB),
    readPage($),
    read($, UNFOLDED),
    isPaneShown($),
  ])
  const { prViews: prState, lastActions, stop, isDemo, isUnread, view } = drawn
  const prs = view.prs.drawn
  const prViews = prs.filter(x => x.state.is === 'open').map(x => x.pr)
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
  if (page !== null) return
  const to = followTo(ARRIVAL_TABS, tab, isEmpty, isOpening ? { ...openRowIds(view), prs: [] } : added)
  if (to) await jumpTo($, to)
}

async function isPaneShown($: EngineInterface) {
  return (await $.ui.panes().catch(() => [])).some(p => p.id === PANE && p.isShown)
}

async function isPrsTabShown($: EngineInterface) {
  return (await readRowTab($)) === 'prs' && (await isPaneShown($))
}

/** The tab the pane shows, as the inbox model is told: the page tab when one shows, else the row tab. */
async function shownScreenTab($: EngineInterface): Promise<ScreenTab> {
  const [page, tab] = await Promise.all([readPage($), read($, TAB)])

  return screenTabOf(page ?? tab)
}

async function screen($: EngineInterface) {
  return screenText(CLAUDE_CODE, await isPaneShown($), await shownScreenTab($))
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
/** Tells Claude about rows closed with Done once their settle window has passed, unless a turn runs. */
async function wakeForDone($: EngineInterface) {
  await wakeSessionForDone(hostOf($, currentOwner()))
}

async function runPress($: EngineInterface, p: RowPress | PrPress, surface: UiPressArgument['surface']) {
  const mayStayOnRow =
    'ref' in p ? ['pr-open', 'pr-refresh', 'thread-open', 'log'].includes(p.action) : p.action === 'step'
  const undoRevision = mayStayOnRow ? suspendUndoReveal() : cancelUndoScroll()
  const rowId = pressRowId(p)
  if (p.action !== 'undo' && !rowId.startsWith('pr:')) await keepPressedOpen($, rowId)
  const wasWaiting = (await shownWaits($)).rows.some(r => r.id === rowId && r.isWaiting)
  if (await read($, DEMO)) return runDemoPress($, p, wasWaiting, undoRevision, surface)
  const now = await $.clock.now()
  const draft = !('ref' in p) && p.action === 'type' ? (await read($, DRAFTS))[p.id] : undefined
  const keepReply = () =>
    !('ref' in p) && p.action === 'type'
      ? update($, DRAFTS, d => (d[p.id] ? d : { ...d, [p.id]: { text: p.text, since: draft?.since ?? now } }))
      : undefined
  if (!('ref' in p) && p.action === 'type') {
    // A held row stays drawn by its draft's words once its field closes, until the press records its reply.
    await update($, DRAFTS, d => {
      const typed = d[p.id]
      return typed ? { ...d, [p.id]: { ...typed, text: p.text } } : d
    })
    await update($, TYPING, t => (t === p.id ? null : t))
  }
  const started = await startPress(hostOf($, currentOwner(), surface), p, false, await readHolds($))
  const effects = started.effects
  if (!effects) {
    const outcome = await started.finish()
    if (!isPressConfirmed(outcome)) await keepReply()
    if (outcome.note !== 'stale') return
    await update($, NOTES, n => ({ ...n, [rowId]: { note: 'stale' as const, at: now } }))
    later($, SETTLED_MS, () =>
      update($, NOTES, n => {
        if (n[rowId]?.at !== now) return n
        const { [rowId]: _gone, ...rest } = n
        return rest
      }),
    )
    return
  }
  const sends = effects.some(effect => effect.kind === 'send')
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
  if (!('ref' in p) && p.action === 'compare') void redrawAtCompareEnd($).catch(() => undefined)
  if (!('ref' in p) && p.action === 'undo') await selectRestored($, p.id)
  // A success note clears SETTLED_MS after its effects finish, when its result is stamped, and a message still on its
  // way after QUEUED_AFTER_MS reads Queued from then. A fresh value is what redraws the pane at each.
  if (sends) later($, QUEUED_AFTER_MS, () => redraw($))
  const outcome = await started.finish()
  if (effects.some(effect => effect.kind !== 'send')) later($, SETTLED_MS, () => redraw($))
  if (!isPressConfirmed(outcome)) await keepReply()
  if (!outcome.isRowFailed) return
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
    return view.prs.drawn.some(x => x.pr.ref === p.ref && x.state.is === 'settled') ? `undo-${pressRowId(p)}` : null
  }
  const row = allRows(view).find(r => r.id === p.id)
  return row?.state.is === 'settled' && row.actions.some(a => a.press.action === 'undo')
    ? `undo-${pressRowId(p)}`
    : null
}

async function shownWaits($: EngineInterface) {
  const [{ ledger, prViews: prState, lastActions, view, now }, tab] = await Promise.all([drawnState($), readRowTab($)])
  const prViews = view.prs.drawn.filter(x => x.state.is === 'open').map(x => x.pr)
  if (tab === null) return { tab, rows: [], ids: [] }

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
  if (tab === null || !wasWaiting || selection[tab].id !== id || rows.find(r => r.id === id)?.isWaiting)
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
  const tab = await readRowTab($)
  if (tab === null) return
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
  let sent = null as DemoSent | null
  const holds = await readHolds($)
  const held = new Set(Object.keys(holds.replies))
  await update($, DEMO, d => {
    if (!d) return d
    const sample = emptySession()
    const r = pressOn(
      {
        ...sample,
        ledger: d.ledger,
        prViews: d.prViews,
        lastActions: d.lastActions,
        presence: { ...sample.presence, ...d.turns },
      },
      p,
      now,
      { settleWindowMs: SETTLED_MS, holds },
      { comparePage: comparePagePath($) },
    )
    applied = r
    const { [rowId]: _replaced, ...notes } = d.notes
    if ('stale' in r) return { ...d, notes: { ...notes, [rowId]: { note: 'stale' as const, at: now } } }
    const after = demoAfterPress({ lastActions: d.lastActions, turns: d.turns }, r, held)
    sent = demoSent(r, after.turns)

    return { ...d, ...after, notes }
  })
  const pressed = applied
  const reply = sent
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
    later($, SETTLED_MS, () => update($, DEMO, d => d && { ...d, ...(reply ? demoReplied(d, reply) : {}) }))
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

type KeyAction = Action & { hotkey?: string; isOut?: boolean }

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
  'pr-refresh': 'refresh',
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
          isOut: a.isOut,
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
        const presentation = { emphasis: a.emphasis, isOut: a.isOut }
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
  tabs: { label: string; symbol: string; badge: string | null; isShown: boolean }[],
  columns: number,
): { widths: number[]; gap: number; isEachFramed: boolean; naming: TabNaming } {
  const steps = [
    { padding: 1, gap: 1, isEachFramed: true },
    { padding: 0, gap: 1, isEachFramed: true },
    { padding: 0, gap: 0, isEachFramed: true },
    { padding: 0, gap: 1, isEachFramed: false },
  ]
  const widthsOf = (naming: TabNaming, { padding, isEachFramed }: (typeof steps)[number]) =>
    tabs.map(t => {
      const name = tabName(t, naming)
      const text = t.badge === null ? name : `${name}${TAB_COUNT_GAP}${t.badge}`
      const isFramed = isEachFramed || t.isShown
      // A tab's rounded frame insets its label FRAME_INSET_PT on each side, so its width adds those columns,
      // rounded up, to what the label needs. Narrower, the label wraps inside the tab.
      return (
        Math.ceil(cellWidth(text) / DESKTOP_CHARS_PER_CELL) +
        (isFramed ? Math.ceil((2 * FRAME_INSET_PT) / DESKTOP_CELL_PT) : 0) +
        padding
      )
    })
  const { naming, layout } = fitTabs(steps, (naming, step) => {
    const widths = widthsOf(naming, step)

    return widths.reduce((sum, w) => sum + w, 0) + step.gap * (widths.length - 1) <= columns
  })

  return { widths: widthsOf(naming, layout), gap: layout.gap, isEachFramed: layout.isEachFramed, naming }
}

async function drawnState(
  $: EngineInterface,
): Promise<
  DemoCopy & { view: SessionView; isDemo: boolean; showsDemoNotices: boolean; isUnread: boolean; now: number }
> {
  const [session, notes, demo, isDemoRecording, unreadable, holds, now] = await Promise.all([
    read($, SESSION),
    read($, NOTES),
    read($, DEMO),
    read($, DEMO_RECORDING),
    read($, UNREADABLE),
    readHolds($),
    $.clock.now(),
    read($, REDRAW),
    // The minute tick while the person is away redraws the ages.
    read($, AWAY),
  ])
  const { ledger, stop, prViews, lastActions, presence } = session
  const turns = { turnsStarted: presence.turnsStarted, turnsApplied: presence.turnsApplied }
  const drawn: DemoCopy = demo ?? {
    ledger,
    stop,
    prViews,
    lastActions,
    notes,
    turns,
  }

  const isUnread = demo === null && unreadable === conversation.id

  const view = sessionView(
    drawnSession(session, drawn, demo !== null, now),
    now,
    SETTLED_MS,
    CAN_CATCH_UP,
    holds,
    drawn.notes,
  )

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
    update($, DEMO, () => (isShown ? demoView(now, CLAUDE_CODE.agent) : null)),
    update($, DEMO_RECORDING, () => isShown && isRecording),
  ])
  await Promise.all([update($, SELECTION, () => NO_SELECTION), update($, TYPING, () => null)])
  // The sample closes a row as it starts, at `now`, so its showing starts then too and the row stays in place. The
  // pane shows the sample or opens on it next.
  await syncShown($, { isOpen: true, since: now })
  await syncLook($, true)
  if ((await read($, TAB)) === 'prs') await findPrs($)
  await followNewRows($, true)
}

function readIsNextBuild($: EngineInterface): Promise<boolean> {
  return $.fs.exists(`${$.plugin.root}/${NEXT_BUILD_MARK}`).catch(() => false)
}

async function registerInboxCommand($: EngineInterface) {
  const description = inboxCommandText(await readIsNextBuild($))

  return $.command.register({ name: 'inbox', description, immediate: true }).catch(() => undefined)
}

/** The `CLAUDE_CODE_ENTRYPOINT` values the desktop app gives the Claude Code sessions it starts. */
const DESKTOP_APP_ENTRYPOINTS = ['claude-desktop', 'claude-desktop-3p']

/**
 * Whether the desktop app started this process. Claude Code sets `CLAUDE_CODE_CHILD_SESSION` for every command it
 * runs and the app leaves it out, so a `claude -p` run from a desktop session inherits the entrypoint but not this.
 */
async function isStartedByDesktopApp($: EngineInterface) {
  const [entrypoint, childSession] = await Promise.all([
    $.env.get('CLAUDE_CODE_ENTRYPOINT'),
    $.env.get('CLAUDE_CODE_CHILD_SESSION'),
  ])

  return DESKTOP_APP_ENTRYPOINTS.includes(entrypoint ?? '') && childSession === undefined
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
  isNextBuild = await readIsNextBuild($)
  overviewRecordsFolder = isNextBuild ? await recordsFolder($).catch(() => null) : null
}

async function initializeInbox($: EngineInterface) {
  // A hot reload keeps state an older build wrote. Draws start once isOn is set, and they read the current shape and
  // the tabs that the next-build mark decides.
  await Promise.all([upgradeState($), readVersion($)])
  isOn = true
  toolsRefused = false
  compareRedrawAt = null
  undoRedrawsUntil = -Infinity
  const refused = () => {
    toolsRefused = true
  }
  await Promise.all([
    registerInboxCommand($),
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
  const writesAtRead = savedWrites
  const [sessionRoot, saved] = await Promise.all([$.session.root(), readSettled($, id)])
  if (revision !== loadRevision) return
  const applying = applyingConversation.then(async () => {
    if (revision !== loadRevision) return
    // A write to a saved session after the read above, such as a refused Done message, is read again.
    const latest = writesAtRead === savedWrites ? saved : await readSettled($, id)
    // A fork continues its parent's inbox, so a new id with no saved state starts from the parent's.
    const parent = latest?.session || !forkedFrom ? null : await readSettled($, forkedFrom)
    await applyConversation($, id, revision, sessionRoot, latest, parent?.session)
  })
  applyingConversation = applying.catch(() => undefined)
  return applying
}

/** A tool's structured result, or undefined when the call answered with text alone. */
function toolRecord<Name extends string>(_tool: Name, result: unknown): ToolResultOf<Name> | undefined {
  return typeof result === 'object' && result !== null ? (result as ToolResultOf<Name>) : undefined
}

async function noteChild(
  $: EngineInterface,
  change: (o: Overview | null, at: number) => Overview | null,
  isWorthSaving: (at: number) => boolean = () => true,
) {
  const at = await $.clock.now()
  if (!isWorthSaving(at)) return
  await commit($, currentOwner(), s => overviewChanged(s, o => change(o, at))).catch(() => undefined)
}

/** The child an agent's work belongs to: the subagent itself, or the workflow or subagent that spawned it. */
function childRefOf(agentId: string): string {
  let id = agentId
  for (let depth = 0; depth < 8 && spawnedBy.has(id); depth++) id = spawnedBy.get(id)!

  return workflowTasks.get(id) ?? id
}

const isActivityWorthSaving = activityGate()

async function noteAgentWork($: EngineInterface, agentId: string) {
  const ref = childRefOf(agentId)
  await noteChild(
    $,
    (o, at) => childWorked(o, ref, at),
    at => isActivityWorthSaving(ref, at),
  )
}

async function notePlace($: EngineInterface) {
  const root = conversation.root
  if (!root) return
  const branch = await branchIn(processRun($), root)
  await commit($, currentOwner(), s => placed(s, root, branch)).catch(() => undefined)
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
  const loadedAt = await $.clock.now()
  // The pane now shows another conversation, so it starts a new showing.
  await syncShown($, { since: loadedAt })
  await replaceDrawn($, s => overviewChanged(cutOffTurn(cutOffUpdate(s)), o => childrenCutOff(o, loadedAt)))
  if (revision !== loadRevision) return
  void notePlace($)
  const isFresh = isBlankLedger(current)
  const isUnread =
    (await update($, UNREADABLE, u =>
      isLoading() ? (isFresh ? (saved === null ? id : null) : u === id ? u : null) : u,
    )) === id
  if (!isLoading()) return
  if (saved !== null) await bringBack($, parent ?? saved.session, isLoading, parent !== undefined)
  if (!isLoading()) return
  const { ledger, presence } = await read($, SESSION)
  const isEmpty = isBlankLedger(ledger)
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
    if (!isLoading() || !isBlankLedger(s.ledger)) return s
    isBrought = true
    if (isFork) return forkedFrom(s, loaded)
    const lastActions = Object.fromEntries(
      Object.entries(loaded.lastActions).map(([id, a]) => [
        id,
        a.delivery?.state === 'queued' ? { ...a, delivery: { ...a.delivery, state: 'unconfirmed' as const } } : a,
      ]),
    )
    // The stop and the turn belong to the process that saved them. Whether a turn runs now is this process's.
    const { isTurnRunning } = s.presence

    return cutOffUpdate({
      ...loaded,
      lastActions,
      sent: [],
      stop: null,
      turn: emptySession().turn,
      presence: { ...loaded.presence, isTurnRunning },
    })
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
  openFields.clear()
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
    const hasRun = current.turn !== 0 || !isBlankLedger(current)
    if (hasRun && saved.session) await restore($, saved.session)
    else await bringBack($, saved.session, () => conversation.id === id)
    const { ledger } = await read($, SESSION)
    if ((hasRun && saved.session) || (isBlankLedger(ledger) && (await $.session.turns().catch(() => 0)) > 0))
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
    // The desktop app runs its sessions headless and attaches to them, before or after this start. Only tools
    // registered during this hook are sure to be offered on the first prompt, so a session the app started turns on
    // here too. -p, the SDK and VS Code draw nothing, so the mod stays off there.
    const isDesktop = (await $.session.surfaces()).includes('desktop') || (await isStartedByDesktopApp($))
    if (e.isInteractive || isDesktop) await turnOn($)

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
    const notice = origin.kind === 'task-notification' ? taskNotice(e.text) : null
    if (notice) {
      const delegate = notice.ids.map(id => delegateWaits.get(id)).find(name => name !== undefined)
      await noteChild($, (o, at) =>
        delegate && notice.hasEnded ? childEnded(o, delegateRef(delegate), at) : noticeApplied(o, notice, at),
      )
    }
    const isTyped = origin.kind === 'composer' || origin.kind === 'bridge'
    const isPersonsWords = isTyped || (origin.kind === 'plugin' && origin.asUser === true)
    if (!isPersonsWords) {
      if (!e.turnId) await commit($, currentOwner(), s => ({ ...s, turn: { ...s.turn, trigger: origin.kind } }))

      return next(e)
    }

    const notes = await notePrompt($, e.text, { isTyped })
    if (carriedFor !== conversation.id) {
      carriedFor = conversation.id
      const carry = overviewCarryText((await read($, SESSION)).ledger)
      if (carry) notes.unshift(carry)
    }

    return notes.length === 0 ? next(e) : next({ ...e, context: [...(e.context ?? []), ...notes] })
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId) {
      if (isOn) await noteAgentWork($, e.agentId)
      return next(e)
    }
    finalReply = null
    hasStopFromError = false
    // Counted here, before the
    // turn can end, since a reload can cut off its end-of-turn hook.
    if (isOn) {
      const before = await read($, SESSION)
      const startedAt = await $.clock.now()
      await commit($, currentOwner(), s => turnStarted(startTurn(s), startedAt))
      if (before.stop) {
        stopGeneration++
        resuming = null
        void publishStatus($)
      }
    }

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    const agentId = r.deny === undefined ? r.agentId : undefined
    if (!isOn || !agentId || e.isTeammate) return r
    const parent = e.parentAgentId ?? (e.workflow ? e.tool_use_id : undefined)
    if (parent) {
      spawnedBy.set(agentId, parent)
      await noteAgentWork($, agentId)

      return r
    }
    await noteChild($, (o, at) => childStarted(o, { ref: agentId, kind: 'subagent', name: e.description }, at))

    return r
  })

  on('tool.describe', { tool: RECORD_TOOL }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }))
  on('tool.call', { tool: RECORD_TOOL }, async ($, e) => ({
    result: await runTool($, 'record', e as unknown as Record<string, unknown>, e.tool_use_id),
  }))
  on('tool.describe', { tool: CLOSE_TOOL }, async ($, e, next) => {
    const r = await next(e)

    return { ...r, description: guidedCloseDescription(CLAUDE_CODE, r.description), isDeferred: false }
  })
  on('tool.call', { tool: CLOSE_TOOL }, async ($, e) => ({
    result: await runTool($, 'close', e as unknown as Record<string, unknown>, e.tool_use_id),
  }))

  on('tool.call', async ($, e, next) => {
    if (!isOn) return next(e)
    const { tool: _tool, tool_use_id: _id, agentId: _agent, ...input } = e as unknown as Record<string, unknown>
    const key = callKey(String(e.tool), input)
    const run = () =>
      clearingDialog($, key, () => next(e)).finally(() => {
        if (e.tool_use_id) askedCalls.delete(e.tool_use_id)
      })
    if (e.agentId) {
      await noteAgentWork($, e.agentId)
      return run()
    }
    const line = toolActivity(String(e.tool), input)
    if (line) await noteActivity($, line)
    if (String(e.tool) === TURN_BOX_TOOL) turnBox = turnBoxText(input) ?? turnBox
    if (e.tool === 'Bash') {
      const steps = delegateSteps(e.command)
      const isDelegateCommand = steps.length > 0
      if (isDelegateCommand) await noteChild($, (o, at) => delegatesStarted(o, e.command, at))
      const ran = await run()
      const found = commandFindings(e.command, ran.text ?? '')
      for (const line of found.lines) await noteActivity($, line)
      void linkPrs($, found.prRefs)
      const taskId = toolRecord('Bash', ran.result)?.backgroundTaskId
      const waitsOn = steps.filter(step => step.isWaitForEnd).map(step => step.name)
      if (taskId && isDelegateCommand) {
        for (const name of waitsOn) for (const id of [taskId, e.tool_use_id]) if (id) delegateWaits.set(id, name)
      } else if (taskId) {
        const child = { ref: taskId, kind: 'background', name: e.description || e.command } as const
        await noteChild($, (o, at) => childStarted(o, child, at, { reportsActivity: false }))
      } else if (waitsOn.length > 0) {
        await noteChild($, (o, at) => delegateWaitsEnded(o, e.command, at))
      }

      return ran
    }
    if (e.tool === 'Agent') {
      const ran = await run()
      const result = toolRecord('Agent', ran.result)
      const isRunningOn = result && 'status' in result && result.status !== 'completed'
      const agentId = result && 'agentId' in result ? result.agentId : undefined
      if (agentId && !isRunningOn) await noteChild($, (o, at) => childEnded(o, agentId, at))

      return ran
    }
    if (e.tool === 'Monitor' || e.tool === 'Workflow') {
      const ran = await run()
      const workflow = e.tool === 'Workflow' ? toolRecord('Workflow', ran.result) : undefined
      const taskId = workflow?.taskId ?? (e.tool === 'Monitor' ? toolRecord('Monitor', ran.result)?.taskId : undefined)
      if (taskId) {
        if (workflow && e.tool_use_id) workflowTasks.set(e.tool_use_id, taskId)
        const kind = workflow ? 'workflow' : 'background'
        const name = workflow?.workflowName ?? e.description ?? e.tool
        await noteChild($, (o, at) => childStarted(o, { ref: taskId, kind, name }, at))
      }

      return ran
    }
    if (e.tool === 'AskUserQuestion') {
      const questions = (Array.isArray(input.questions) ? input.questions : []) as { question?: unknown }[]
      const question = typeof questions[0]?.question === 'string' ? questions[0].question : 'A question'
      await openDialog($, { kind: 'question', text: question, key })
      const ran = await run()
      const outcome = dialogOutcome(ran)
      const asked = dialogQuestions(input.questions)
      const wasDismissed = outcome.kind === 'dismissed'
      if (wasDismissed) isDialogDismissed = true
      const line = dialogActivity(asked, outcome)
      await commit($, currentOwner(), s => {
        const noted = noteTurnActivity(s, line)
        return wasDismissed ? noteDialog(noted, null, asked) : noted
      }).catch(() => undefined)

      return ran
    }
    if (HOST_TASK_TOOLS.has(String(e.tool))) {
      const ran = await run()
      const tool = String(e.tool)
      const didRun = !ran.isError && typeof ran.deny !== 'string'
      if (didRun)
        await commit($, currentOwner(), s => ({
          ...s,
          hostTasks: claudeTasksAfter(s.hostTasks, tool, input, ran.text ?? null),
        })).catch(() => undefined)

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

  // Where the guard skips classic.PermissionRequest, the permission row comes from here. The plugin
  // directory accepts a permission hook only when it returns next(e) itself, so waitForPermission
  // asks for the verdict with a query of its own.
  on('tool.check', async ($, e, next) => {
    const mayShowRow = isOn && !hasPermissionRequestHook && !e.agentId && e.tool !== 'AskUserQuestion'
    if (mayShowRow && e.tool_use_id) void waitForPermission($, e.tool_use_id, e.tool, e.input)

    return next(e)
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
    askedCalls.clear()
    await closeDialogs($, null)
    if (!isOn) return r
    const endedAt = await $.clock.now()
    const root = conversation.root
    const run = processRun($)
    const [listed, inHerdr, branch] = await Promise.all([
      $.agent.list().catch(() => null),
      read($, SESSION).then(s => delegatesInHerdr(upgradeSession(s).ledger.overview, run)),
      root ? branchIn(run, root) : null,
    ])
    const running =
      listed && new Set(listed.filter(a => a.status === 'running' || a.status === 'pending').map(a => a.id))
    await commit($, currentOwner(), s => {
      const ended = turnEnded(s, endedAt)
      const withSubagents = running ? overviewChanged(ended, o => subagentsSettled(o, running, endedAt)) : ended
      const withDelegates = inHerdr
        ? overviewChanged(withSubagents, o => delegatesSettled(o, inHerdr, endedAt))
        : withSubagents
      return root ? placed(withDelegates, root, branch) : withDelegates
    })
    if (e.reason === 'error' && !hasStopFromError) await setStopFromLastReply($)
    void wakeForDone($).catch(() => undefined)
    void followNewRows($).catch(() => undefined)
    const hasReply = e.answer.trim() !== '' || turnBox !== null
    const isAnswered = e.reason === 'answer' && hasReply
    if (!isAnswered && !isDialogDismissed) return r

    const [screenTab, isShown, now, before] = await Promise.all([
      shownScreenTab($),
      isPaneShown($),
      $.clock.now(),
      read($, SESSION),
    ])
    const reply = [...sentBack, e.answer, turnBox ?? ''].filter(text => text.trim() !== '').join('\n\n')
    const queuesEmptyReply = isDialogDismissed
    resetTurn()
    await update($, AWAY, a => ({ ...a, lastActiveAt: now }))
    await commit($, currentOwner(), s => endTurn(CLAUDE_CODE, s, reply, isShown, { tab: screenTab, queuesEmptyReply }))
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
      const notes = await notePrompt($, text, { match: current => arrived(current, text, count) })
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
    const shown = isShownTab(data?.tab) ? data.tab : null
    const followUp = typeof data?.key === 'string' ? followUpPresses.get(data.key) : undefined
    if (e.element === 'tabs' && shown) await showTab($, shown)
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
    void syncShown($, { isOpen: false }).then(() => syncLook($, false))
    paneHasKeys.clear()
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

  // The ctrl+o transcript draws the text the agent read.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const isInboxTool = e.props.tool === RECORD_TOOL || e.props.tool === CLOSE_TOOL
    if (!isOn || !isInboxTool || e.props.isExpanded || e.props.isErrored) return next(e)
    const line = (await read($, PERSON_LINES))[e.props.tool_use_id]
    if (line === undefined) {
      const { Box } = $.ui.resolve(e)

      return <Box />
    }

    return next({ ...e, props: { ...e.props, output: line } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isOn || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const [{ ledger, stop, view, showsDemoNotices, now }, theme] = await Promise.all([drawnState($), read($, THEME)])
    if (!stop && isBlankLedger(ledger)) return next(e)
    // Every mod shares the band, and a tree without the drawing from next(e)
    // hides what the mods after this one draw there.
    const theirs = await next(e)
    const pal = paletteFor(theme, lookOf(e.surface))
    const counts = LISTED_TABS.filter(t => view[t.id].count > 0).map(t => (
      <Text>
        <Text>{t.label} </Text>
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
    const hadKeys = paneHasKeys.get(e.surface) ?? false
    paneHasKeys.set(e.surface, e.props.isFocused)
    const isKeyboardHandedBack = hadKeys && !e.props.isFocused
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
    // The Codex tab wraps a suffix too long for one line between words, so this does too. A glued suffix wider than a
    // line together with the title's last word, which DOT's leading figure space holds to it, is broken mid-word.
    const unbroken = (after: string, title: string, fits: (text: string) => boolean) => {
      const lastWord = title.slice(Math.max(0, title.trimEnd().lastIndexOf(' ') + 1))
      if (fits(lastWord + after)) return glued(after)
      const dot = after.startsWith(DOT) ? DOT : ''
      const rest = after.slice(dot.length)
      const firstBreak = rest.indexOf(' ')

      return (
        dot + (fits(rest) || firstBreak < 0 ? glued(rest) : glued(rest.slice(0, firstBreak)) + rest.slice(firstBreak))
      )
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
      { ledger, prViews: prState, lastActions, notes, turns, stop, view, isDemo, showsDemoNotices, isUnread, now },
      savedTab,
      savedPage,
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
      readPage($),
      read($, SELECTION),
      read($, THEME),
      read($, TYPING),
      read($, UNFOLDED),
      read($, FOLD_HOVER),
      read($, IS_KEY_LIST_SHOWN),
      read($, OPTIONS_SHOWN),
      $.env.get('TERM_PROGRAM'),
      read($, RUNNING_FRAME),
    ])
    const tab: Tab = isShownTab(savedTab) && isRowTab(savedTab) ? savedTab : 'needsYou'
    const isOverviewShown = savedPage === 'overview'
    const shownTab: ShownTab = isOverviewShown ? 'overview' : tab
    const tabList = shownTabs(isNextBuild)
    const isRunningMarkShown = isOverviewShown
      ? hasRunningMark(view.overviewPage)
      : tab !== 'prs' && isRowTabRunning(view, tab, kind => unfolded.includes(kind))
    if (look === 'terminal') animateRunningMarks($, isRunningMarkShown)
    const undoEnd = lastUndoEnd(view)
    if (undoEnd !== null) redrawWhileUndoLasts($, undoEnd)
    // A hot reload keeps TYPING but empties openFields, so an open field takes its key and seed again here.
    if (typing !== null && !openFields.has(typing))
      openFields.set(typing, openedField(typing, (await read($, DRAFTS))[typing]))
    if (e.props.isFocused || typing !== fieldWithoutKeys) fieldWithoutKeys = null
    // Escape, or a click outside the pane, closes the field and keeps its draft, as Cancel does.
    if (isKeyboardHandedBack && typing !== null) later($, 0, () => update($, TYPING, t => (t === typing ? null : t)))
    if ((typing === null) !== paneClosesOnEscape) later($, 0, () => matchPaneEscape($))
    const size = isInline ? `${e.props.bodyColumns}x${e.props.scroll.bodyRows}` : null
    if (e.surface === 'terminal') terminalInlineSize = size
    if (size !== null && inlineSize !== null && size !== inlineSize) {
      const revision = undoScrollRevision
      later($, RESIZE_SCROLL_MS, () =>
        revision === undoScrollRevision && !isOverviewShown ? scrollToOpenRow($, tab, e.surface) : undefined,
      )
    }
    inlineSize = size
    const shownPrs = view.prs.drawn
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
            color={
              span.isNeedsYou
                ? (pal.tone.needsYou ?? pal.mark.needsYou)
                : span.isLinkAddress || span.isMuted
                  ? pal.muted
                  : span.code
                    ? 'permission'
                    : undefined
            }
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
      /**
       * An Asks or Finds row. The terminal draws it with no mark column, so its text starts at the tree's arm, and its
       * result mark before its result. Desktop draws its result mark in the mark column.
       */
      isUnmarked?: true
      handle: string
      /** A Button takes no color, so this handle is Text and only the row's text selects it. */
      handleTone?: Tone
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
    /** A next build draws the Overview, so only it names the subject an ask holds up. */
    const holdsUpLineOf = (r: RowView | undefined) => (isNextBuild ? (r?.holdsUpLine ?? null) : null)
    const itemRow = (r: RowView): Row => {
      const asked = r.at === null ? undefined : `${DOT}${ago(now - r.at)}`
      const isHandedOff = r.state.is === 'handedOff'
      const holdsUpLine = holdsUpLineOf(r)

      return {
        id: r.id,
        view: r,
        isUnmarked: true,
        handle: '',
        ...(isHandedOff ? { fold: {} } : {}),
        title: rowTitle(r, look),
        titleAfter: asked,
        ...(r.at === null ? {} : { at: r.at }),
        ...(holdsUpLine
          ? {
              subtitle: (
                <Text color={pal.muted} wrap="wrap">
                  {holdsUpLine}
                </Text>
              ),
            }
          : {}),
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
      isUnmarked: true,
      handle: '',
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
    const presses = { lastActions, turns, now }
    const prPress = (p: PrPress) => (press: UiPressArgument) => runPress($, p, press.surface)
    const prKeyAction = (a: PrAction, row: string): KeyAction => {
      // A failed send's Try again repeats its button's press, so it needs a key of its own.
      const isResend = a.isRetry === true

      return {
        key: `${isResend ? 'retry' : PR_KEYS[a.press.action]}-${row}`,
        label: a.label,
        emphasis: a.emphasis,
        kind: a.kind,
        ...(a.icon ? { icon: ACTION_GLYPHS[a.icon] } : {}),
        ...(a.hotkey ? { hotkey: a.hotkey } : {}),
        isOut: a.isOut,
        onPress: prPress(a.press),
      }
    }
    const checkRow = (pr: PrView, c: PrCheck): Row => {
      const { mark, lead, title, meta } = checkRowText(c)
      return {
        id: prCheckId(pr, c),
        handle: mark.text,
        handleTone: mark.tone ?? undefined,
        isMarkDone: mark.isDone,
        title,
        ...(c.finishedAt !== undefined ? { at: c.finishedAt } : {}),
        line: { ...(lead ? { before: `${lead} / ` } : {}), text: title, after: meta },
        subtitle: <Text color={pal.muted}>{lead ? `${lead}${DOT}${meta}` : meta}</Text>,
        body: null,
        keys: () => checkActions(pr, c, presses).map(a => prKeyAction(a, `${pr.ref}-${c.name}`)),
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
          {rest ? <Markdown text={clipLabel(rest, PR_QUOTE_CHARS)} /> : null}
          {where}
          {t.reply ? (
            <Markdown text={`**@${t.reply.author}:** ${clipLabel(readableComment(t.reply.body), PR_QUOTE_CHARS)}`} />
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
      const actions = splitFollowUps(threadActions(pr, t, presses))

      return {
        id,
        handle: text.mark.text,
        handleTone: text.mark.tone ?? undefined,
        isMarkDone: text.mark.isDone,
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
        keys: () => actions.keys.map(a => prKeyAction(a, t.id)),
        moreKeys: () => actions.more.map(a => prKeyAction(a, t.id)),
      }
    }

    type Entry = DrawnEntry<Row>
    // The Overview draws no rows, so none are built while it shows.
    const lists = drawnLists(
      view,
      () => true,
      r => (isOverviewShown ? null : r.item ? itemRow(r) : r.finding ? findingRow(r) : null),
    )
    const needsYouGroups = NEEDS_YOU_GROUPS.map(g => ({ ...g, entries: lists[g.list], rows: rowsIn(lists[g.list]) }))
    const findingEntries = lists.findings
    const prGroups = (isOverviewShown ? [] : shownPrs)
      .map(d => ({
        ...d,
        checks: d.state.is === 'settled' ? [] : failingChecks(d.pr).map(c => checkRow(d.pr, c)),
        threads: d.state.is === 'settled' ? [] : waitingThreads(d.pr).map(t => threadRow(d.pr, t)),
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
      prs: shownPrs.filter(x => x.state.is === 'open' && prNeedsYou(x.pr, isThreadSent)).length,
    }
    const badgeOf = (id: ShownTab) => tabBadge(id, tabCounts)
    const tabTone = (id: ShownTab) => (isRowTab(id) ? pal.tone[id] : undefined)
    const tabText = (id: ShownTab, name: string) => `${name}${badgeOf(id) === null ? '' : ` ${badgeOf(id)}`}`
    const hasRail = isInline && look === 'terminal' && e.props.bodyColumns >= INLINE_RAIL_AT
    const railWidth = Math.max(...tabList.map(t => cellWidth(tabText(t.id, t.label)))) + 2 * TAB_PAD.length
    const listColumns = e.props.bodyColumns - 2 - (hasRail ? railWidth + RAIL_GUTTER : 0)
    const ids = rows[tab].map(r => r.id)
    const indexOf = new Map(ids.map((id, n) => [id, n]))
    const cursor = selection[tab]
    const settledIds = new Set(isOverviewShown ? [] : settledRowIds(allRows(view)))
    const top = isOverviewShown
      ? null
      : firstWaiting(
          tabWaits(
            tab,
            view,
            shownPrs.filter(x => x.state.is === 'open').map(x => x.pr),
            lastActions,
          ),
        )
    const at = selectedIndex(ids, cursor, top, id => settledIds.has(id))
    const isOpenGuarded = isGuarded(cursor.openedAt, now)

    const shownLabel = (a: Pick<KeyAction, 'label' | 'variant'>) =>
      actionLabel({ label: a.label, isPrimary: a.variant === 'primary' })
    const desktopTextColumns = (markCells: number) => listColumns - markCells - DESKTOP_SIDE_CELLS - 1
    // A desktop text column after `markCells`, less a cell, since the measured column ran up to 10 pt narrower than this.
    const desktopColumnPt = (markCells: number) => desktopTextColumns(markCells) * DESKTOP_CELL_PT - 2 * FRAME_INSET_PT
    const desktopRowTextPt = desktopColumnPt(DESKTOP_MARK_CELLS)
    const desktopLabel = (a: Pick<KeyAction, 'label' | 'variant' | 'icon'>) =>
      a.icon ? `${a.icon} ${shownLabel(a)}` : shownLabel(a)
    // A native Button cuts a label wider than its row.
    const fittedDesktopLabel = (rowId: string, a: Pick<KeyAction, 'label' | 'variant' | 'icon'>) => {
      const icon = a.icon ? `${a.icon} ` : ''
      const fits = (label: string) => desktopTextPt(icon + label) + DESKTOP_BUTTON_EXTRA_PT <= desktopRowTextPt

      return icon + actionLabel({ label: a.label, isPrimary: a.variant === 'primary' }, fits)
    }
    const keyedButton =
      (rowId: string, isFollowUp = false) =>
      ({ hotkey, kind: _kind, emphasis, icon, isOut = false, ...action }: KeyAction) => {
        const { label: _label, ...unlabeled } = action
        const isDim = isOpenGuarded || isOut

        return look === 'desktop' ? (
          <Button
            {...action}
            {...(isFollowUp ? { plain: true } : emphasis === 'primary' ? { variant: 'primary' as const } : {})}
            label={fittedDesktopLabel(rowId, { ...action, ...(icon ? { icon } : {}) })}
            {...(isDim ? { dimColor: true } : {})}
            onPress={press => unlessGuarded($, rowId, press, action.onPress)}
          />
        ) : (
          <Box key={`keyed-${action.key}`} flexDirection="row">
            <Button
              plain
              {...unlabeled}
              {...(isDim ? { dimColor: true } : {})}
              hover={{ color: pal.muted, inverse: true }}
              onPress={press => unlessGuarded($, rowId, press, action.onPress)}
            >
              {hotkey ? (
                <Text color={pal.key} dimColor={isDim} hover={{ color: pal.muted, inverse: true }}>
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
          return {
            key: a.key,
            label,
            width: desktopTextPt(label) / DESKTOP_CELL_PT,
            ...(a.isOut ? { isOut: true } : {}),
          }
        }),
        gap: DESKTOP_LINK_GAP_CELLS,
        fallbackColumns: desktopTextColumns(DESKTOP_MARK_CELLS),
        isGuarded: isOpenGuarded,
        colors: { muted: pal.muted, hover: null },
      }

      const linksWidth = Math.ceil(props.links.reduce((sum, l) => sum + l.width, props.gap * (props.links.length - 1)))

      // A Client takes no flexShrink or minWidth, so this Box gives it the room left on its line. In the Claude app,
      // the wrapping row moves a Box this wide to the next line whole when the room left is narrower, and then shrinks
      // it to the line.
      return (
        <Box flexGrow={1} flexShrink={1} minWidth={0} width={linksWidth}>
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
      keys.flatMap(({ key, hotkey, kind: _kind, emphasis: _emphasis, icon: _icon, isOut: _isOut, ...k }) =>
        hotkey ? [<Button key={`${key}${suffix}`} plain hotkey={hotkey} {...k} label={shownLabel(k)} />] : [],
      )
    const terminalKeyCells = (k: KeyAction) => (k.hotkey ? k.hotkey.length + 2 : 0) + cellWidth(shownLabel(k))
    const terminalActionLines = (keys: KeyAction[], more: KeyAction[], width: number) =>
      actionLines(keys.map(terminalKeyCells), more.map(terminalKeyCells), {
        width,
        gap: space.buttonGap,
        // keyRow's `·` and the gap after it.
        separator: 1 + space.buttonGap,
      })
    const keyLines = (keys: KeyAction[], more: KeyAction[], width: number) =>
      terminalActionLines(keys, more, width).lines.length
    // Desktop's links Box wraps as a whole by its own width, so only the terminal draws a second row.
    const actionRows = (rowId: string, keys: KeyAction[], more: KeyAction[], terminalWidth: number) =>
      look === 'terminal' && terminalActionLines(keys, more, terminalWidth).isFollowUpLineNew ? (
        <Box flexDirection="column">
          {keyRow(rowId, keys)}
          {keyRow(rowId, [], more)}
        </Box>
      ) : (
        keyRow(rowId, keys, more)
      )
    const pressable = (keys: KeyAction[]) => keys.filter(k => Input || !k.key.startsWith('typekey-'))
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
      const mark = look === 'terminal' && row?.view ? rowResultMark(row.view) : null
      const lead = mark?.isRunning ? `${runningMark(now)} ` : mark?.text ? `${mark.text} ` : ''

      return hasAge(f)
        ? {
            text: `${lead}${row?.view ? rowFeedbackText(row.view, look)! : markedFeedbackText(f, row?.isMarkDone ?? false, look)}`,
            age: ago(now - f.at),
            isAfterTitle: true,
            isFailure: false,
            feedback: f,
          }
        : {
            text: `${lead}${feedbackText(f, look)}`,
            age: '',
            isAfterTitle: isAfterTitle(f),
            isFailure: isFailure(f),
            feedback: f,
          }
    }
    const lastActionText = (id: string) => {
      const f = feedbackLabel(id)

      return f ? { text: [f.text, f.age].filter(Boolean).join(DOT), isFailure: f.isFailure } : null
    }
    const pressedAge = (row: Row) => {
      const f = feedbackLabel(row.id, row)

      return f?.isAfterTitle ? `${DOT}${[f.text, isAgeDropped ? '' : f.age].filter(Boolean).join(' ')}` : null
    }
    // The row clips, not this Box: once its row scrolled out of view,
    // Claude Code drew lines this Box clipped elsewhere in the pane (anthropics/claude-code#100030).
    // Desktop draws no tree: its lines differ in height, so stacked glyphs break into separate bars.
    const branch = (pos: TreePos, lead = 0, left = TREE_LINE_AT, color = pal.line, top = 0, key?: string) =>
      look === 'desktop' ? null : (
        <Box key={key} position="absolute" top={top} bottom={0} left={left} width={2}>
          <Text color={color}>{treeText(pos, lead)}</Text>
        </Box>
      )
    /** A 1 pt line in the divider color on desktop, `across` the pane or `down` it. */
    const desktopHairline = (
      key: string,
      direction: 'across' | 'down',
      box: { marginTop?: number; marginBottom?: number; marginLeft?: number; width?: number } = {},
    ) => (
      <Box
        key={key}
        {...(direction === 'across' ? { height: DESKTOP_HAIR_LINES } : { width: DESKTOP_HAIR_CELLS })}
        backgroundColor={pal.divider}
        {...box}
      />
    )
    const columnsFor = (row: Pick<Row, 'isUnmarked'>) => {
      const base = look === 'desktop' ? ROW_COLUMNS.desktop : ROW_COLUMNS.tree
      return row.isUnmarked && look === 'terminal' ? { ...base, textAt: base.handleAt } : base
    }
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
    const divided = (rowEls: JSX.Element[], group: string, textAt: number = ROW_COLUMNS.tree.textAt) =>
      rowEls.flatMap((el, n) =>
        n === 0 || isInline || look === 'desktop'
          ? [el]
          : [
              <Box key={`divider-${group}-${n}`} flexDirection="row">
                <Box width={TREE_LINE_AT} flexShrink={0} />
                <Box width={textAt - TREE_LINE_AT} flexShrink={0}>
                  <Text color={pal.line}>│</Text>
                </Box>
                {rule(textAt + 2)}
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
      const holdsUpLine = holdsUpLineOf(row.view)

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
          {holdsUpLine ? (
            <Box paddingLeft={line.before?.length ?? 0}>
              <Text color={pal.muted}>{clipLabel(holdsUpLine, Math.max(12, width))}</Text>
            </Box>
          ) : null}
        </Box>
      )
    }
    const ToneSvg = look === 'desktop' && 'Svg' in elements ? elements.Svg : null
    /** An Asks or Finds row's result mark in the desktop mark column, or null when it has none. */
    const gutterMark = (row: Row) => {
      const mark = look === 'desktop' && row.isUnmarked && row.view ? rowResultMark(row.view) : null
      return mark ? markGlyph(mark, `gutter-${row.id}`, pal.muted) : null
    }
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
        markCells: DESKTOP_MARK_CELLS,
        sideCells: DESKTOP_SIDE_CELLS,
        before: row.line?.before ?? '',
        title: text.trim(),
        after: f?.isAfterTitle ? f.text : (row.line?.after ?? '').replace(LEADING_DOT, '').trim(),
        note: holdsUpLineOf(row.view) ?? '',
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
      tree = null,
      hasSide = true,
      children,
    }: {
      key?: string
      mark?: JSX.Element | null
      side?: JSX.Element | null
      /** Whether it keeps the side column, so its text lines up with rows that show an age there. */
      hasSide?: boolean
      /** An absolute Box in the mark column, which the frame stretches to the row's height. */
      tree?: JSX.Element | null
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
        alignItems={isCentered ? 'center' : tree ? 'stretch' : 'flex-start'}
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
          {tree}
          {mark ? (
            <Box position="absolute" top={0} left={isMarkHung ? indent - 1 : indent}>
              {mark}
            </Box>
          ) : null}
        </Box>
        <Box flexDirection="column" flexShrink={1} flexGrow={1} minWidth={0}>
          {children}
        </Box>
        {hasSide ? (
          <Box
            minWidth={DESKTOP_SIDE_CELLS}
            flexShrink={0}
            flexDirection="row"
            justifyContent="flex-end"
            alignItems="flex-start"
            paddingLeft={1}
          >
            {side}
          </Box>
        ) : null}
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
      const columns = columnsFor(row)
      const index = indexOf.get(row.id) ?? -1
      const isSelected = index === at
      // On desktop a Client takes a click on every cell of the row, where a Button takes one only on its label.
      if (!isSelected && hasClient)
        return (
          <Box key={`row-${row.id}`} flexDirection="row" overflow="hidden">
            {row.handle || gutterMark(row) ? (
              <Box
                position="absolute"
                top={0}
                left={0}
                paddingLeft={(FRAME_INSET_PT - DESKTOP_CELL_PT) / DESKTOP_CELL_PT}
                paddingTop={space.rowPad}
              >
                {gutterMark(row) ?? toned(row) ?? (
                  <Text color={row.handleTone ? pal.mark[row.handleTone] : undefined}>{row.handle}</Text>
                )}
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
            key={fieldKey(row.id)}
            placeholder={row.typeHint}
            {...(openFields.get(row.id)?.seed ? { value: openFields.get(row.id)?.seed } : {})}
            submitLabel={look === 'desktop' ? ROW_COPY.send : 'send'}
            autoFocus
            {...(look === 'terminal' ? { rows: REPLY_ROWS } : look === 'desktop' ? { rows: DESKTOP_REPLY_ROWS } : {})}
            onInput={(value: string) =>
              void update($, DRAFTS, d => ({ ...d, [row.id]: { text: value, since: d[row.id]?.since ?? now } }))
            }
            onSubmit={(value: string, submit) => sendTyped($, row.id, value, submit.surface)}
          />
        ) : null
      const f = feedbackLabel(row.id, row)
      const isStatusUnder = f !== null && isStatusUnderActions(f.feedback, isSelected)
      const titleAfter = (isStatusUnder ? null : pressedAge(row)) ?? (isAgeInSide ? undefined : row.titleAfter)
      const status = [
        ...(row.fold?.note ? [{ text: row.fold.note, color: pal.muted }] : []),
        ...(f && !f.isAfterTitle ? [{ text: f.text, color: f.isFailure ? pal.tone.error : pal.muted }] : []),
        ...(isTyping && fieldWithoutKeys === row.id ? [{ text: ROW_COPY.clickField, color: pal.muted }] : []),
      ]

      const textWidth = listColumns - 1 - columns.textAt
      const titleWidth = textWidth - TERMINAL_SIDE_CELLS
      const fitsTitleLine = (text: string) =>
        look === 'desktop' ? desktopTextPt(text) <= desktopRowTextPt : text.length <= titleWidth
      const shownAfter = titleAfter ? unbroken(titleAfter, row.title, fitsTitleLine) : ''
      const bodyLines =
        isSelected && isInline && look === 'terminal' && row.clippedBody
          ? e.props.scroll.bodyRows -
            2 * space.rowPad -
            lineCount(`${row.title}${shownAfter}`, titleWidth) -
            status.length -
            keyLines(keys, more, textWidth) -
            (isStatusUnder ? lineCount(f.text, textWidth) : 0)
          : null
      const body =
        bodyLines !== null && row.clippedBody && row.body ? row.clippedBody(bodyLines, textWidth) : (row.body ?? null)
      const described = row.view ? shownOptionDescriptions(row.view, optionsShown.includes(row.id)) : []
      const descriptionsBlock =
        described.length > 0 ? (
          <Box flexDirection="column" marginTop={blankLine}>
            {described.map(o => {
              const line = clipLabel(`${o.label}: ${o.description}`, look === 'desktop' ? titleWidth : textWidth)
              return (
                <Text wrap="truncate-end">
                  <Text>{line.slice(0, o.label.length)}</Text>
                  <Text color={pal.muted}>{line.slice(o.label.length)}</Text>
                </Text>
              )
            })}
          </Box>
        ) : null
      const keysBlock = (
        <Box flexDirection="column" marginTop={blankLine}>
          {isTyping ? (
            look === 'desktop' ? (
              <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={space.buttonGap} rowGap={1}>
                <Box flexShrink={1} minWidth={0} overflow="hidden">
                  {field}
                </Box>
                {/* The desktop Input supplies its own Send button. */}
                {keyRow(
                  row.id,
                  fieldActions(row).filter(a => !a.key.startsWith('send-')),
                )}
              </Box>
            ) : (
              [field, keyRow(row.id, fieldActions(row))]
            )
          ) : (
            actionRows(row.id, keys, more, textWidth)
          )}
          {isStatusUnder ? (
            <Text color={pal.muted} wrap="wrap">
              {f.text}
            </Text>
          ) : null}
        </Box>
      )
      // The `view-` Box is what select() scrolls into view. Drawn on the selected row alone, so the key exists only
      // once that row has redrawn expanded.
      if (look === 'desktop' && isSelected)
        return desktopFrame({
          key: `row-${row.id}`,
          markCells: DESKTOP_MARK_CELLS,
          mark: row.isUnmarked
            ? gutterMark(row)
            : (toned(row) ??
              (row.handleTone ? (
                <Text color={pal.mark[row.handleTone]}>{row.handle}</Text>
              ) : (
                <Text>{row.handle}</Text>
              ))),
          side: <Text color={pal.age}>{sideAge(row)}</Text>,
          fill: pal.selection,
          gapY: (2 * SELECTED_GAP_PT) / DESKTOP_LINE_PT,
          children: [
            <Box key={`view-${row.id}`} position="absolute" top={0} bottom={0} left={0} width={1} />,
            <Text wrap="wrap">
              <Text bold>{row.title}</Text>
              {f?.isAfterTitle && !isStatusUnder ? (
                <Text color={pal.muted}>{unbroken(`${DOT}${f.text}`, row.title, fitsTitleLine)}</Text>
              ) : null}
            </Text>,
            row.subtitle ?? null,
            row.body ? <Box marginTop={blankLine}>{row.body}</Box> : null,
            descriptionsBlock,
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
          {row.isUnmarked && look === 'terminal' ? null : (
            <Box
              width={columns.textAt - columns.lead}
              flexShrink={0}
              paddingLeft={columns.handleAt - columns.lead}
              paddingY={isSelected ? space.rowPad : 0}
            >
              {row.handleTone ? (
                <Text color={pal.mark[row.handleTone]}>{row.handle}</Text>
              ) : look === 'desktop' ? (
                (gutterMark(row) ?? <Text>{row.handle}</Text>)
              ) : (
                <Button
                  plain
                  key={`select-${row.id}`}
                  label={row.handle}
                  onPress={() => void select($, tab, row.id, index)}
                />
              )}
            </Box>
          )}
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
              {descriptionsBlock}
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

    const shownStatus = footerStatus(
      shownTab,
      view.status,
      { isFetching: prState.isFetching, hasPrs: prViews.length > 0 },
      view.overviewPage.error,
    )
    const status = shownStatus.text ?? ''

    const openIds = openRowIds(view)
    const drawnIds = new Set([...openIds.needsYou, ...openIds.findings, ...prRowIds(shownPrs)])
    const lineNote = Object.entries(notes)
      .filter(([id, n]) => !drawnIds.has(id) && now - n.at < SETTLED_MS)
      .map(([, n]) => n)
      .sort((a, b) => b.at - a.at)[0]

    const keyList = [
      { keys: tabList.map(t => t.hotkey).join(' '), does: 'Switch tabs' },
      ...(isOverviewShown ? [] : [{ keys: 'j k', does: 'Select the next or previous row' }]),
      { keys: 'ctrl+x tab', does: 'Move focus to the line above the prompt, then the pane, then the prompt' },
    ]
    const keyColumn = Math.max(...keyList.map(k => k.keys.length)) + 2

    const tabColumns = e.props.bodyColumns - 2
    const tabSizes = desktopTabSizes(
      tabList.map(t => ({ ...t, badge: badgeOf(t.id), isShown: t.id === shownTab })),
      tabColumns,
    )
    const tabProps: TabsProps | null = hasClient
      ? {
          tabs: tabList.map((t, n) => ({
            id: t.id,
            label: tabName(t, tabSizes.naming),
            badge: badgeOf(t.id),
            badgeColor: isRowTab(t.id) ? (pal.tone[t.id] ?? pal.mark[t.id]) : null,
            width: tabSizes.widths[n]!,
          })),
          shown: shownTab,
          gap: tabSizes.gap,
          isEachFramed: tabSizes.isEachFramed,
          columns: tabColumns,
          colors: {
            tab: pal.tab ?? null,
            raised: pal.raised,
            raisedText: pal.raisedText ?? null,
            muted: pal.muted,
          },
        }
      : null
    const leadColor: Record<BannerTone, string | undefined> = {
      error: pal.tone.error ?? pal.mark.error,
      warning: pal.tone.needsYou ?? pal.mark.needsYou,
      notice: undefined,
    }
    /**
     * A banner as a rounded box. The terminal paints a Box's fill inside its border, so a docked banner's fill sits
     * inside its rounded border. The inline pane draws the fill alone, so a tab still fits its height.
     */
    const banner = (
      b: BannerView,
      more: {
        /** Drawn in place of the bold lead, as while a press runs. */
        lead?: JSX.Element
        after?: JSX.Element
        isBodyBelow?: boolean
        extra?: JSX.Element | null
        action?: JSX.Element | null
      } = {},
    ) => {
      const { line, fill } = pal.banner[b.tone]
      const frame =
        look === 'desktop'
          ? { borderStyle: 'single', borderColor: line, paddingY: (2 * BANNER_PAD_Y_PT) / DESKTOP_LINE_PT }
          : isInline
            ? { paddingX: 1 }
            : { borderStyle: 'round', borderColor: line, paddingX: 1 }
      const lead = more.lead ?? (
        <Text bold color={leadColor[b.tone]}>
          {b.lead}
        </Text>
      )
      const isActionBelow = isNarrowDesktop && Boolean(more.action)

      return (
        <Box
          key={`banner-${b.kind}`}
          {...(isActionBelow
            ? { flexDirection: 'column', alignItems: 'flex-start', rowGap: (2 * BANNER_PAD_Y_PT) / DESKTOP_LINE_PT }
            : { flexDirection: 'row', alignItems: 'center', columnGap: 2 })}
          {...frame}
          {...(fill ? { backgroundColor: fill } : {})}
        >
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            <Text wrap="wrap">
              {lead}
              {more.after ?? null}
              {b.body && !more.isBodyBelow ? ` ${b.body}` : ''}
            </Text>
            {b.body && more.isBodyBelow ? <Text wrap="wrap">{b.body}</Text> : null}
            {more.extra ?? null}
          </Box>
          {more.action ? <Box flexShrink={0}>{more.action}</Box> : null}
        </Box>
      )
    }
    const statusLines = tabBarBanners(
      toolsRefused ? [bannerOf('tools-refused', TOOLS_REFUSED_TEXT)] : [],
      shownStatus.error,
      lineNote
        ? { text: feedbackText({ is: 'note', note: lineNote.note, at: lineNote.at }, look), isError: false }
        : null,
    ).map(b => banner(b))
    const namesWidth = (naming: TabNaming) =>
      tabList.reduce((sum, t) => sum + cellWidth(tabText(t.id, tabName(t, naming))), 0)
    const framedTabs = fitTabs(
      FRAMED_TAB_LAYOUTS,
      (naming, r) =>
        namesWidth(naming) + 2 * r.pad.length * tabList.length + r.gap * (tabList.length - 1) <=
        e.props.bodyColumns - 1 - r.right,
    )
    const { pad } = framedTabs.layout
    const inlineTabs = fitTabs(
      INLINE_TAB_GAPS,
      (naming, gap) => namesWidth(naming) + gap * (tabList.length - 1) <= e.props.bodyColumns - 3,
    )
    const tabNaming = isInline ? inlineTabs.naming : look === 'desktop' ? tabSizes.naming : framedTabs.naming
    const hasTabLine = !isInline && look !== 'desktop'
    const tabLine = pal.tab ?? pal.divider
    // Terminal.app draws block characters from its font, which leaves a seam between a half block and the filled
    // line beside it. There a tab is its filled name line alone.
    const hasHalfLines = termProgram !== 'Apple_Terminal'
    const tabs = (
      <Box
        paddingLeft={isInline ? 2 : 1}
        paddingRight={isInline ? 1 : framedTabs.layout.right}
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
        <Box
          flexDirection="row"
          flexWrap="wrap"
          columnGap={isInline ? inlineTabs.layout : look === 'desktop' ? 2 : framedTabs.layout.gap}
        >
          {hasClient && tabProps ? (
            <elements.Client
              key="tabs"
              module="./tabs-client.tsx"
              height={TAB_HEIGHT * tabLines(tabProps.tabs, tabProps.gap, tabProps.columns).length}
              props={tabProps}
            />
          ) : null}
          {tabProps
            ? null
            : tabList.map(t => {
                const { id } = t
                const label = tabName(t, tabNaming)
                const badge = badgeOf(id)

                if (isInline)
                  return (
                    <Box key={`tab-block-${id}`} flexDirection="row">
                      {shownTab === id ? (
                        <Text bold underline>
                          {label}
                        </Text>
                      ) : (
                        <Button plain key={`tab-${id}`} label={label} onPress={() => void showTab($, id)} />
                      )}
                      {badge !== null ? (
                        <Text bold={shownTab === id} color={tabTone(id)}>
                          {' '}
                          {badge}
                        </Text>
                      ) : null}
                    </Box>
                  )

                const width = cellWidth(tabText(id, label)) + 2 * pad.length

                // The key stays the
                // same in every drawing: the app takes the focus off the pane when the element holding
                // it leaves, and the next click would only bring it back.
                // A Button sizes to its label, so non-breaking spaces widen the tab; plain spaces would collapse.
                // A native tab element would replace this (anthropics/claude-code#100890).
                if (look === 'desktop')
                  return (
                    <Button
                      key={`tab-${id}`}
                      label={`${DESKTOP_TAB_PAD}${badge === null ? label : `${label} ${badge}`}${DESKTOP_TAB_PAD}`}
                      {...(shownTab === id ? { variant: 'primary' as const } : {})}
                      onPress={() => void showTab($, id)}
                    />
                  )

                if (shownTab === id)
                  return (
                    <Box flexDirection="column" flexShrink={0}>
                      <Text color={pal.raised}>{(hasHalfLines ? '▄' : ' ').repeat(width)}</Text>
                      <Text backgroundColor={pal.raised}>
                        {pad}
                        <Text bold color={pal.raisedText} backgroundColor={pal.raised}>
                          {label}
                        </Text>
                        {badge !== null ? (
                          <Text bold color={tabTone(id) ?? pal.raisedText} backgroundColor={pal.raised}>
                            {' '}
                            {badge}
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
                      {pad ? <Button plain key={`tab-${id}-before`} label={pad} hover={raise} onPress={show} /> : null}
                      <Button plain key={`tab-${id}`} label={label} hover={raise} onPress={show} />
                      {badge !== null ? (
                        <Text color={tabTone(id)} hover={raise}>
                          {' '}
                          {badge}
                        </Text>
                      ) : null}
                      {pad ? <Button plain key={`tab-${id}-after`} label={pad} hover={raise} onPress={show} /> : null}
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
    const versionText = version ? faint(versionLabel(version, isNextBuild)) : null
    const rail = (
      <Box flexDirection="column" flexShrink={0} paddingLeft={1} marginRight={RAIL_GUTTER}>
        {tabList.map(({ id, label }) => {
          const badge = badgeOf(id)
          const fill = ' '.repeat(railWidth - cellWidth(tabText(id, label)) - TAB_PAD.length)
          if (shownTab === id)
            return (
              <Text key={`rail-${id}`} backgroundColor={pal.raised}>
                {TAB_PAD}
                <Text bold color={pal.raisedText} backgroundColor={pal.raised}>
                  {label}
                </Text>
                {badge !== null ? (
                  <Text bold color={tabTone(id) ?? pal.raisedText} backgroundColor={pal.raised}>
                    {' '}
                    {badge}
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
              {badge !== null ? (
                <Button plain key={`tab-${id}-count`} hover={raise} onPress={show}>
                  <Text color={tabTone(id)}> {badge}</Text>
                </Button>
              ) : null}
              <Button plain key={`tab-${id}-after`} label={fill} hover={raise} onPress={show} />
            </Box>
          )
        })}
      </Box>
    )
    const statusBlock = statusLines.some(Boolean) ? (
      <Box
        flexDirection="column"
        rowGap={look === 'desktop' ? (2 * BANNER_GAP_PT) / DESKTOP_LINE_PT : isInline ? 0 : 1}
        paddingX={hasRail ? 1 : isInline ? 2 : 1}
        paddingTop={hasRail ? 0 : 1}
      >
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
    /** A Finds group's title leads with its kind's mark, since its rows draw none. */
    const groupTitle = (title: string, count: number, mark?: { mark: string; tone: Tone }) => {
      const words = (
        <Text>
          <Text bold>{title}</Text>
          {count > 0 ? <Text color={pal.muted}>{`${DOT}${count}`}</Text> : null}
        </Text>
      )
      const lead = mark ? (
        <Box width={RESULT_MARK_CELLS} flexShrink={0}>
          {ToneSvg ? (
            <ToneSvg
              source={toneSvg(mark.tone, mark.mark)}
              alt={mark.mark}
              width={DESKTOP_CELL_PT}
              height={DESKTOP_LINE_PT}
            />
          ) : (
            <Text color={pal.mark[mark.tone]}>{mark.mark}</Text>
          )}
        </Box>
      ) : null
      const line = lead ? (
        <Box flexDirection="row">
          {lead}
          {words}
        </Box>
      ) : (
        words
      )

      return look === 'desktop' ? (
        desktopFrame({ padY: 0, mark: lead, children: words })
      ) : (
        <Box paddingLeft={TREE_LINE_AT}>{line}</Box>
      )
    }
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
                    desktopHairline(`rule-${n}`, 'across', {
                      marginTop: space,
                      marginBottom: space - blankLine,
                      marginLeft: FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_MARK_CELLS,
                    }),
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
    const markGlyph = (mark: ResultMark, key: string, color: string) =>
      mark.isRunning ? runningDot(key, mark.text, color) : <Text color={color}>{mark.text || ' '}</Text>
    /** A result mark and the space after it, before its label. A blank mark keeps its place, so the label stays put. */
    const resultLead = (mark: ResultMark, key: string, color: string) => (
      <Box key={`${key}-lead`} width={RESULT_MARK_CELLS} flexShrink={0}>
        {markGlyph(mark, key, color)}
      </Box>
    )
    const resultLine = (mark: ResultMark | null, key: string, markColor: string, label: JSX.Element) =>
      mark ? (
        <Box flexDirection="row" flexShrink={1}>
          {resultLead(mark, key, markColor)}
          {label}
        </Box>
      ) : (
        label
      )
    const refusedUndo = (d: ClosedLine) =>
      canUndoRefused(d.delivery) ? undoButton({ id: d.id, action: 'undo' }, null) : null
    const closedRow = (d: ClosedLine, pos: TreePos) =>
      look === 'desktop'
        ? desktopFrame({
            key: `closed-${d.id}`,
            indent: DESKTOP_MARK_CELLS,
            isMarkHung: false,
            padY: space.rowPad / 2,
            mark: markGlyph(closedMark(closedState(d), d.delivery), `closed-${d.id}`, pal.age),
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
            null,
            <Box flexDirection="row">
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                <Text wrap="wrap" color={pal.muted}>
                  {d.ask}
                </Text>
                {resultLine(
                  closedMark(closedState(d), d.delivery),
                  `closed-${d.id}`,
                  pal.muted,
                  <Text wrap="wrap" color={pal.age}>
                    {settledLabel(d.outcomeLabel, d.delivery)}
                  </Text>,
                )}
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
                        null,
                        <Text color={pal.age}>{earlier}</Text>,
                        `earlier-${kind}`,
                        1,
                      ),
                ]
              : []),
          ]
    }
    const svgClientElements = hasClient && 'Svg' in elements ? elements : null
    const undoButton = (undo: RowPress | PrPress, at: number | null) => {
      const key = `undo-${pressRowId(undo)}`
      const label = ' ↺ Undo '
      const onPress = (press: { surface: UiPressArgument['surface'] }) => runPress($, undo, press.surface)
      if (svgClientElements) {
        followUpPresses.set(key, onPress)
        const leftMs = at === null ? 0 : Math.max(0, SETTLED_MS - (now - at))
        return (
          <Box key={`${key}-${at}`} width={UNDO_CELLS} height={UNDO_HEIGHT_PT / DESKTOP_LINE_PT}>
            <svgClientElements.Svg
              source={undoSvg(leftMs / SETTLED_MS, leftMs)}
              alt="Undo"
              width={UNDO_CELLS * DESKTOP_CELL_PT}
              height={UNDO_HEIGHT_PT}
            />
            <Box position="absolute" top={0} left={0}>
              <svgClientElements.Client
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
    // A desktop title wraps beside Undo, so Undo's place keeps its size after Undo ends and the title keeps its wrap.
    const undoPlace = (id: string, undo: RowPress | PrPress | null, at: number, offersUndo: boolean) =>
      svgClientElements && offersUndo ? (
        <Box key={`undo-place-${id}`} width={UNDO_CELLS} height={UNDO_HEIGHT_PT / DESKTOP_LINE_PT}>
          {undo ? undoButton(undo, at) : null}
        </Box>
      ) : undo ? (
        undoButton(undo, at)
      ) : null
    const settledContent = (
      what: string,
      { label, at, delivery, closedAs }: SettledState,
      undo: RowPress | PrPress | null,
      mark: ResultMark | null,
    ) => (
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
          {resultLine(
            mark,
            `settled-${what}`,
            pal.muted,
            <Text wrap="wrap" color={settledTone({ delivery, closedAs }) === 'done' ? pal.tone.done : pal.muted}>
              {settledLabel(label, delivery)}
            </Text>,
          )}
          {undo ? undoButton(undo, at) : null}
        </Box>
      </Box>
    )
    const settledRow = ({ settled: r, state }: Extract<Entry, { settled: RowView }>, pos: TreePos) => {
      const undo = r.actions.find(a => a.press.action === 'undo')?.press ?? null
      const mark = settledMark(state)
      if (look === 'desktop')
        return desktopFrame({
          key: `settled-${r.id}`,
          markCells: DESKTOP_MARK_CELLS,
          mark: markGlyph(mark, `settled-${r.id}`, pal.muted),
          side: undoPlace(r.id, undo, state.at, state.offersUndo),
          padY: space.settledPad,
          isCentered: true,
          children: [
            <Text wrap="wrap">
              {r.title}
              <Text color={pal.muted}>{`${DOT}${settledLabel(state.label, state.delivery)}`}</Text>
            </Text>,
          ],
        })
      return (
        <Box key={`settled-${r.id}`} flexDirection="column" paddingY={space.settledPad}>
          {treeRow(pos, null, settledContent(rowTitle(r, look), state, undo, mark))}
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
          ROW_COLUMNS.tree.handleAt,
        )
        const tail = closedFold(
          g.kind,
          closed,
          closedTotal(view.needsYou.closed[g.list], settledIn(entries)),
          isUnfolded,
        )

        return [
          section([
            groupTitle(g.title, waitingCount(g.rows.map(r => r.view))),
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
              banner(bannerOf('read-failed', READ_FAILED_TEXT), {
                ...(isReadingAgain ? { lead: <Text color={pal.muted}>{READING_TEXT}</Text> } : {}),
                action: <Button key="read-again" label="Try again" onPress={() => void readAgain($)} />,
              }),
            ),
          ]
        : []
      if (isNothing && !stop && unread.length === 0) return emptyState(emptyText('needsYou', 'Claude'))
      const outside = stop
        ? [
            section(
              banner(stopBanner(stop), {
                after: <Text color={pal.muted}>{glued(`${DOT}${ago(now - stop.at)}`)}</Text>,
                isBodyBelow: true,
                extra:
                  resuming?.is === 'refused' ? (
                    <Text color={pal.tone.error} wrap="wrap">
                      Not sent: {resuming.why}
                    </Text>
                  ) : null,
                action: isResumable(stop) ? (
                  <Button
                    key="resume"
                    label={resuming?.is === 'sending' ? 'Resuming…' : 'Resume'}
                    onPress={() => void resume($)}
                  />
                ) : null,
              }),
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
          groupTitle(g.title, waitingCount(rowsIn(g.entries).map(r => r.view)), FINDING_GROUPS[g.kind]),
          ...titleGap(),
          ...(g.entries.length === 0 ? [groupEmpty(g.title)] : []),
          ...divided(
            g.entries.map((x, n) =>
              'row' in x ? listRow(x.row, childPos(n, g.entries.length)) : settledRow(x, childPos(n, g.entries.length)),
            ),
            g.kind,
            ROW_COLUMNS.tree.handleAt,
          ),
          ...closedFold(g.kind, closed, closedTotal(closedOf, settled), unfolded.includes(g.kind)),
        ])
      })

      return sections(groups)
    }

    const settledPrBlock = (pr: PrView, state: SettledState) => {
      const what = `#${pr.number} ${pr.title}`
      const undo: PrPress | null = state.canUndo ? { action: 'pr-undo', ref: pr.ref } : null
      const side = look === 'desktop' ? undoPlace(prMarkId(pr.ref), undo, state.at, state.offersUndo) : null
      const content =
        look === 'desktop' ? (
          <Box flexDirection="column">
            <Box flexDirection="row" alignItems="center">
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="wrap">
                  {what}
                  <Text color={pal.muted}>{`${DOT}${settledLabel(state.label, state.delivery)}`}</Text>
                </Text>
              </Box>
              {side ? (
                <Box flexShrink={0} paddingLeft={1}>
                  {side}
                </Box>
              ) : null}
            </Box>
          </Box>
        ) : (
          settledContent(what, state, undo, null)
        )

      return section([treeRow(null, <Text color={pal.muted}>✓</Text>, content, `settled-pr:${pr.ref}`)])
    }
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
    const prBlock = (b: DrawnPr & { rows: Row[]; checks: Row[]; threads: Row[] }) => {
      if (b.state.is === 'settled') return settledPrBlock(b.pr, b.state)
      const { pr, checks, threads } = b
      const { status, head: statusHead, unlisted } = readiness(pr, isThreadSent)
      const tone = PR_TONES[status]
      const prLast = isDismissed(lastActions, pr.ref) ? null : lastActionText(prMarkId(pr.ref))
      const prActions = prBlockActions(pr, isThreadSent, prState.branchRef, presses).map(a => prKeyAction(a, pr.ref))

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
                {prRefreshFailedText(pr.error)}
              </Text>
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
                  {...(a.isOut ? { dimColor: true } : {})}
                  onPress={a.onPress}
                />
              ) : (
                <Button key={a.key} label={a.label} {...(a.isOut ? { dimColor: true } : {})} onPress={a.onPress} />
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
    const ghState = { isGhMissing: Boolean(prState.isGhMissing), isGhSignedOut: Boolean(prState.isGhSignedOut) }
    const ghNotice = ghNoticeOf(ghState)
    const olderPrs = () => {
      const text = olderPrsText(prState, ledger.prs)
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
          {emptyState(prsEmptyText({ isFetching: prState.isFetching, ...ghState }, 'session'))}
        </Box>
      ) : (
        sections(
          [
            ...(ghNotice ? [section(banner(bannerOf(ghNotice.kind, ghNotice.text)))] : []),
            ...prGroups.map(prBlock),
            ...olderPrs(),
          ],
          2,
        )
      )

    const overviewGoal = (goal: string) => {
      const line = (
        <Text wrap="wrap" bold>
          {goal}
        </Text>
      )

      return look === 'desktop' ? (
        desktopFrame({ key: 'overview-goal', padY: 0, markCells: 0, hasSide: false, children: line })
      ) : (
        <Box key="overview-goal" paddingLeft={TREE_LINE_AT}>
          {line}
        </Box>
      )
    }
    const runningDot = (id: string, glyph: string, color: string) => {
      const RunningSvg = look === 'desktop' && 'Svg' in elements ? elements.Svg : null

      return RunningSvg ? (
        <Box key={`${id}-mark`} width={RUNNING_SVG_CELLS} height={1} flexShrink={0}>
          <RunningSvg
            source={runningSvg(now)}
            alt={glyph}
            width={RUNNING_SVG_CELLS * DESKTOP_CELL_PT}
            height={DESKTOP_LINE_PT}
          />
        </Box>
      ) : (
        <Text color={color}>{look === 'terminal' ? runningMark(now) : glyph}</Text>
      )
    }
    /** Where an Overview row's mark sits in the terminal: in the goal's column, so the list lines up with it. */
    const overviewMarkAt = TREE_LINE_AT
    /** The text column of an Overview line at `depth`, in cells on the terminal and in points on desktop. */
    const overviewTextWidth = (depth: number) =>
      look === 'desktop'
        ? desktopColumnPt(1 + DESKTOP_MARK_CELLS * (depth * 2 + 1)) + DESKTOP_SIDE_CELLS * DESKTOP_CELL_PT
        : listColumns - 1 - overviewMarkAt - markWidth * (depth + 1)
    const fitsOverviewLine = (depth: number) => (text: string) =>
      look === 'desktop' ? desktopTextPt(text) <= overviewTextWidth(depth) : cellWidth(text) <= overviewTextWidth(depth)
    /** One text of an Overview line, wrapped to at most `limit` lines and cut with an ellipsis past them. */
    const overviewText = (key: string, spans: TerminalSpan[], depth: number, limit = OVERVIEW_TEXT_LINES) => (
      <Box key={key}>
        <Text wrap="wrap">
          {terminalText(
            look === 'desktop'
              ? [desktopSpanLines(spans, overviewTextWidth(depth), limit)]
              : terminalSpanLines(spans, overviewTextWidth(depth), limit),
          )}
        </Text>
      </Box>
    )
    /** A row's second line: where it stands, muted, then its stall words in the needs-you tone, never split by a wrap. */
    const overviewSecondLine = (key: string, text: string | null, stall: string | null, depth: number) => {
      const unbroken = (words: string) => (look === 'desktop' ? words.replaceAll(' ', '\u00a0') : words)
      const spans: TerminalSpan[] = [
        ...(text ? [{ text, isMuted: true as const }] : []),
        ...(text && stall ? [{ text: STALL_GAP, isMuted: true as const }] : []),
        ...(stall ? [{ text: unbroken(stall), isNeedsYou: true as const, isUnbroken: true as const }] : []),
      ]

      return spans.length > 0 ? [overviewText(key, spans, depth)] : []
    }
    /**
     * The line that ties the rows under a subject to it, in the subject's mark column. `down` runs from under the
     * subject's mark to the end of its row. `mid` and `last` reach across to a child's mark, and `mid` runs on to the
     * next row, so a row that wraps keeps the line beside each of its lines.
     */
    const overviewTree = (key: string, shape: 'down' | OverviewBranch) => {
      if (look === 'terminal')
        return shape === 'down'
          ? branch('pass', 0, overviewMarkAt, pal.line, 1, key)
          : branch(shape, 0, overviewMarkAt, pal.line, 0, key)
      // The line spans the mark column, which spans the frame's content. To meet the next row's line, each end reaches
      // over the frame's padding and its 1 pt border, in margins, which count half lines.
      const reach = -(OVERVIEW_PAD_Y + 2 * DESKTOP_HAIR_LINES)
      const firstLineMiddle = 0.5
      const hair = (key: string, grow: boolean, ends: { marginTop?: number; marginBottom?: number }) => (
        <Box key={key} flexDirection="row" {...(grow ? { flexGrow: 1 } : { height: firstLineMiddle })}>
          {desktopHairline('line', 'down', ends)}
        </Box>
      )
      const arm = DESKTOP_MARK_CELLS * 2 - DESKTOP_TREE_AT - DESKTOP_ARM_GAP
      const parts =
        shape === 'down'
          ? [<Box key="under-mark" height={firstLineMiddle + 0.4} />, hair('down', true, { marginBottom: reach })]
          : [
              hair('to-arm', false, { marginTop: reach }),
              desktopHairline('arm', 'across', { width: arm }),
              ...(shape === 'mid' ? [hair('on', true, { marginBottom: reach })] : []),
            ]

      return (
        <Box key={key} position="absolute" top={0} bottom={0} left={0} flexDirection="row">
          <Box width={DESKTOP_TREE_AT - DESKTOP_HAIR_CELLS / 2} flexShrink={0} />
          <Box flexDirection="column" flexShrink={0}>
            {parts}
          </Box>
        </Box>
      )
    }
    /** The rule above an Overview row that starts an item. It starts at the text column, as the rules between sections and between Asks rows do. */
    const overviewRule = (id: string) =>
      look === 'desktop' ? (
        desktopHairline(`overview-rule-${id}`, 'across', {
          marginLeft: FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_MARK_CELLS,
        })
      ) : (
        <Box key={`overview-rule-${id}`} flexDirection="row">
          <Box width={overviewMarkAt + markWidth} flexShrink={0} />
          {rule(overviewMarkAt + markWidth + 2)}
        </Box>
      )
    /** The look line: "Seen" in the middle of a rule that runs from the mark column to the end of the row. */
    const overviewLookLine = (text: string) => {
      if (look === 'desktop')
        return desktopFrame({
          key: 'overview-look',
          padY: OVERVIEW_PAD_Y,
          markCells: 0,
          hasSide: false,
          children: (
            <Box flexDirection="row" alignItems="center">
              <Box flexGrow={1} flexDirection="column">
                {desktopHairline('look-before', 'across')}
              </Box>
              <Box flexShrink={0} paddingX={1}>
                <Text color={pal.muted}>{text}</Text>
              </Box>
              <Box flexGrow={1} flexDirection="column">
                {desktopHairline('look-after', 'across')}
              </Box>
            </Box>
          ),
        })
      const label = ` ${text} `
      const fill = Math.max(4, listColumns - 1 - overviewMarkAt - cellWidth(label))
      const before = Math.floor(fill / 2)

      return (
        <Box key="overview-look" flexDirection="row">
          <Box width={overviewMarkAt} flexShrink={0} />
          <Text color={pal.divider}>{`${'─'.repeat(before)}${label}${'─'.repeat(fill - before)}`}</Text>
        </Box>
      )
    }
    /** One line of the Overview's list: a mark and its text. `depth` 1 sits under a subject's text. */
    const overviewLine = ({
      key,
      depth = 0,
      mark,
      content,
      tree = null,
    }: {
      key: string
      depth?: number
      mark: JSX.Element | null
      content: JSX.Element | JSX.Element[]
      tree?: JSX.Element | null
    }) =>
      look === 'desktop' ? (
        desktopFrame({
          key,
          indent: DESKTOP_MARK_CELLS * (depth * 2),
          isMarkHung: false,
          padY: OVERVIEW_PAD_Y,
          hasSide: false,
          mark,
          tree,
          children: Array.isArray(content) ? content : [content],
        })
      ) : (
        <Box key={key} flexDirection="row" alignItems="flex-start" overflow="hidden">
          <Box width={overviewMarkAt + markWidth * depth} flexShrink={0} />
          <Box width={markWidth} flexShrink={0}>
            {mark}
          </Box>
          <Box flexDirection="column" flexShrink={1} flexGrow={1}>
            {content}
          </Box>
          {tree}
        </Box>
      )
    const overviewRow = (r: OverviewRow) => {
      if (r.kind === 'subject') {
        const color = r.tone ? pal.mark[r.tone] : pal.muted
        const mark = r.isRunning ? runningDot(r.id, r.mark, color) : <Text color={color}>{r.mark}</Text>
        const content = [
          overviewText(`overview-${r.id}-name`, [{ text: r.name }], 0),
          ...overviewSecondLine(`overview-${r.id}-text`, r.text, r.stall, 0),
          ...(r.merged
            ? [
                overviewText(
                  `overview-${r.id}-merged`,
                  [{ text: mergedLine(r.merged, fitsOverviewLine(0)), isMuted: true }],
                  0,
                ),
              ]
            : []),
          ...(r.was
            ? [overviewText(`overview-${r.id}-was`, [{ text: `${WAS_PREFIX}${r.was}`, isMuted: true }], 0)]
            : []),
        ]

        return overviewLine({
          key: `overview-${r.id}`,
          mark,
          content,
          tree: r.hasChildren ? overviewTree(`overview-${r.id}-tree`, 'down') : null,
        })
      }
      if (r.kind === 'child') {
        const mark = r.isRunning ? runningDot(r.id, r.mark, pal.muted) : <Text color={pal.muted}>{r.mark}</Text>
        const depth = r.branch === null ? 0 : 1

        return overviewLine({
          key: `overview-${r.id}`,
          depth,
          mark,
          content: [
            overviewText(`overview-${r.id}-name`, [{ text: r.name, isMuted: true }], depth),
            ...overviewSecondLine(`overview-${r.id}-text`, null, r.stall, depth),
          ],
          tree: r.branch ? overviewTree(`overview-${r.id}-tree`, r.branch) : null,
        })
      }
      if (r.kind === 'more')
        return overviewLine({
          key: `overview-${r.id}`,
          depth: 1,
          mark: null,
          content: <Text color={pal.muted}>{r.text}</Text>,
          tree: overviewTree(`overview-${r.id}-tree`, r.branch),
        })
      if (r.kind === 'look') return overviewLookLine(r.text)

      return overviewLine({
        key: `overview-${r.id}`,
        mark: <Text color={r.tone ? pal.mark[r.tone] : pal.muted}>{r.mark}</Text>,
        content: <Text color={pal.muted}>{r.text}</Text>,
      })
    }
    const overviewView = () => {
      const page = view.overviewPage
      if (page.isEmpty)
        return (
          <Box flexDirection="column" flexGrow={1}>
            {emptyState(page.empty)}
          </Box>
        )

      return sections([
        ...(page.goal ? [overviewGoal(page.goal)] : []),
        ...(page.rows.length > 0
          ? [
              section(
                page.rows.flatMap(r => {
                  const isRuleDrawn = r.isRuledAbove && !isInline

                  return isRuleDrawn ? [overviewRule(r.id), overviewRow(r)] : [overviewRow(r)]
                }),
              ),
            ]
          : []),
      ])
    }

    const move = (step: number) => {
      const to = Math.min(Math.max(at + step, 0), ids.length - 1)
      void select($, tab, ids[to] ?? '', to)
    }
    const canMove = !isOverviewShown && (ids.length > 1 || (at < 0 && ids.length > 0))
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
    const tabKeys: KeyAction[] = tabList.map(({ id, label, hotkey }) => ({
      key: `tab-key-${id}`,
      label,
      hotkey,
      kind: 'view',
      onPress: () => void showTab($, id),
    }))

    const selectedRow = isOverviewShown ? undefined : rows[tab][at]
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
    const tabView = isOverviewShown
      ? overviewView()
      : tab === 'findings'
        ? findingsView()
        : tab === 'prs'
          ? prsView()
          : needsYouView()
    const drawn = (
      <Box flexDirection="column" minHeight={e.props.scroll.bodyRows} backgroundColor={pal.body}>
        {showsDemoNotices ? (
          <Box flexDirection="column" paddingX={isInline ? 2 : 1} marginBottom={blankLine}>
            {banner(bannerOf('demo', DEMO_NOTICE), {
              action: <Button key="hide-demo" label="Hide demo" onPress={() => void setDemo($, false)} />,
            })}
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
      const hint = focusHint?.startsWith('type-') ? fieldKey(focusHint.slice('type-'.length)) : focusHint
      const opensField = hint?.startsWith('type-') && keys.has(hint)
      if (!keys.has(focusedKey) || opensField) {
        const focusKey = [hint, rowKeys[0]?.key, ...keys].find((k): k is string => !!k && keys.has(k)) ?? null
        focusedKey = focusKey
        focusHint = null
        // After this hook returns, since a focus asked from inside a drawing's own hook cannot wait on it.
        if (focusKey) later($, 0, () => $.ui.focus({ requestId: PANE, key: focusKey }))
      }
    }

    return drawn
  })
}
