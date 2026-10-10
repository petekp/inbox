import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  SessionAppendMessage,
  UiCopyResult,
  UiPressArgument,
  UiScrollResult,
} from 'claude-code'

import type {
  Arrival,
  Card,
  Cursor,
  Closed,
  DemoCopy,
  Dialog,
  Item,
  Ledger,
  Finding,
  PrCheck,
  PrThread,
  PrView,
  PrViews,
  Presence,
  LastAction,
  PressKind,
  RowNote,
  Stop,
  Tab,
} from '../types'
import { demoView, isDemoCopy } from './demo'
import type { Exchange, Press, Update } from './ledger'
import type { Handoffs, PrStatus } from './prs'
import {
  THREADS_QUERY,
  VIEW_FIELDS,
  checkCounts,
  commentLine,
  failingChecks,
  parseRef,
  prRefs,
  prNeedsYou,
  prompts,
  threadsOnYou,
  readThreads,
  readView,
  readableComment,
  readiness,
  threadWhere,
  waitingThreads,
} from './prs'
import {
  EMPTY,
  ago,
  applyUpdate,
  buildPrompt,
  carryText,
  closeItem,
  commandRowLine,
  dialogLine,
  parseReply,
  catchUpPrompt,
  CLAUDE_CODE,
  isLapsed,
  promptNotes,
  resetTime,
  readCommandRow,
  readKind,
  screenText,
  statusLine,
  stopFix,
  stopKindOf,
  stopText,
  systemText,
  tasksRunBy,
  toolActivity,
  transcriptCatchUpPrompt,
  transcriptText,
  TOLD_NOTHING,
  type Told,
  upgradeLedger,
} from './ledger'
import {
  actionId,
  applyPress,
  baseName,
  clipLabel,
  finishedResult,
  localLast,
  localPath,
  openCommands,
  pendingResult,
  prSteps,
  reopenOnFailure,
  upgradeLastActions,
  withArrival,
  withFailure,
  withQueued,
  withRewrite,
  withResult,
} from './presses'
import type { Effect, HelpStep, PrActionId, RowPress } from './presses'
import {
  closedShown,
  feedbackOf,
  feedbackText,
  hasAge,
  inboxView,
  isFailure,
  isGuarded,
  NEW_ROW_MS,
  perTurnStatus,
  PRESS_GUARD_MS,
  SETTLED_MS,
} from './view'
import type { InboxView, RowState, RowView } from './view'
import {
  CLOSE_DESCRIPTION,
  CLOSE_SCHEMA,
  FINDING_SCHEMA,
  findingDescription,
  recordClose,
  recordFinding,
} from './tools'
import type { FoldProps } from './fold-client'
import type { RowProps } from './row-client'
import type { TabsProps } from './tabs-client'

const LEDGER = atom({ plugin: 'inbox', key: 'ledger' } as const, EMPTY)
const PRESENCE = atom(
  { plugin: 'inbox', key: 'presence' } as const,
  {
    lastActiveAt: 0,
    isAway: false,
    isUpdating: false,
    ledgerState: 'current',
    turnsStarted: 0,
    turnsApplied: 0,
    minute: 0,
  } as Presence,
)
const TAB = atom({ plugin: 'inbox', key: 'tab' } as const, 'needsYou' as Tab)
const NO_CURSOR: Cursor = { id: null, index: 0, openedAt: 0 }
const NO_SELECTION: Record<Tab, Cursor> = { needsYou: NO_CURSOR, findings: NO_CURSOR, prs: NO_CURSOR }
const SELECTION = atom({ plugin: 'inbox', key: 'selection' } as const, NO_SELECTION)
// Whether Claude Code uses its `dark` theme, which picks the selected row's tint.
const THEME = atom({ plugin: 'inbox', key: 'theme' } as const, '')
const PR_VIEWS = atom(
  { plugin: 'inbox', key: 'prViews' } as const,
  { views: {}, branchRef: null, isFetching: false } as PrViews,
)
const STOP = atom({ plugin: 'inbox', key: 'stop' } as const, null as Stop | null)
const DIALOGS = atom({ plugin: 'inbox', key: 'dialogs' } as const, [] as Dialog[])
const TYPING = atom({ plugin: 'inbox', key: 'typing' } as const, null as string | null)
const DRAFTS = atom({ plugin: 'inbox', key: 'drafts' } as const, {} as Record<string, string>)
const NOTES = atom({ plugin: 'inbox', key: 'notes' } as const, {} as Record<string, RowNote>)
const ARRIVAL = atom({ plugin: 'inbox', key: 'arrival' } as const, null as Arrival | null)
const LAST_ACTIONS = atom({ plugin: 'inbox', key: 'lastActions' } as const, {} as Record<string, LastAction>)
const UNFOLDED = atom({ plugin: 'inbox', key: 'unfolded' } as const, [] as (Item['kind'] | 'finding')[])
const SHOWN_DETAILS = atom({ plugin: 'inbox', key: 'shownDetails' } as const, [] as string[])
const OPTIONS_SHOWN = atom({ plugin: 'inbox', key: 'optionsShown' } as const, [] as string[])
const IS_KEY_LIST_SHOWN = atom({ plugin: 'inbox', key: 'isKeyListShown' } as const, false)
// How long a closed item's row stays in place, with its outcome, before it moves to Closed.
// The bar under a just-closed row, in cells. It loses half a cell per step of SETTLED_MS, so the pane redraws that often.
const LEAVE_BAR_CELLS = 12
const LEAVE_BAR_STEPS = LEAVE_BAR_CELLS * 2
// After a jump, how long the new tab's top edge takes to draw in, in steps.
const DRAW_IN_MS = 200
const DRAW_IN_STEPS = 4
const DEMO = atom({ plugin: 'inbox', key: 'demo' } as const, null as DemoCopy | null)
const DEMO_BANNER = 'Showing sample entries. Presses here send nothing.'
const TOOLS_REFUSED_TEXT =
  "Claude cannot record or close items here: your organization's settings block the inbox's tools."
const PR_POLL_MS = 2 * 60_000
const MAX_PRS = 6

const FINDING_TOOL = 'mcp__inbox__record_finding'
const GUIDANCE = `# Inbox
The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, in the /inbox pane, and your findings, in the pane's Findings tab. A band above their prompt shows only two counts: one for your questions and their tasks together, and one for your findings.

A finding is something you noticed that deserves the user's attention but is outside the current task: a bug, a risk, missing tests, tech debt, or a chance to improve something. Record it with mcp__inbox__record_finding the moment you notice it, then go on with the task; fixing it waits until the user asks. Record one too at two moments that are easy to pass over while focused on the task:
- You work around a problem instead of fixing it, such as copying files by hand because a tool does not reach them.
- Part of your change could not be tested or verified.
State those two in your reply as well. Mention any other finding only when it bears on what the user asked.

The latest "inbox:" text beside the user's prompt is the current state. It lists every open item and finding with its id, such as [i35] or [f12], and anything it does not list is closed. Check it before telling the user that something is open or waits on them.

Close with mcp__inbox__close:
- When the user's message answers an open item, close it first, before other work, with their answer.
- When an item or finding is done or no longer applies, close it with a short reason, without waiting to be asked.
The answer to a question is the user's to give. Close a question with their answer, or once it no longer applies, and never with an answer of your own.`
const CLOSE_TOOL = 'mcp__inbox__close'

const PANE = 'inbox'
// Whether the desktop pane offers a typed reply. Set it false if the app does not paint `Input`: the engine still resolves it, so the mod cannot tell.
const DESKTOP_TYPING = true
// From this many columns, the desktop pane puts its status on the tab line and shows each closed row's age.
const DESKTOP_WIDE_AT = 50
// About how many characters of desktop's proportional text fit in one column of `bodyColumns`, measured
// on a /inbox demo row. A guess too high is cut from the muted text after a title, not from the title.
const DESKTOP_CHARS_PER_CELL = 1.25
// A lower guess for text that must stay one line, since desktop wraps text that is too long. Tab labels measured about 1.1.
const DESKTOP_CLIP_CHARS_PER_CELL = 1.1
const DESKTOP_TAB_PADDING = 2
const DESKTOP_TAB_PAD = '\u00a0'.repeat(3)
// Theme keys, so the colors follow the person's Claude Code theme.
const NEEDS_YOU = 'warning'
// A child's place under its section: a middle child, the last, or a block the tree passes.
type TreePos = 'mid' | 'last' | 'pass'
// More tree lines than a row wraps to; the tree's Box clips the rest.
const TREE_DEPTH = 200
// The bar that marks a selected row where the palette has no selection color.
const SELECTION_BAR = Array<string>(TREE_DEPTH).fill('▌').join('\n')
// The tree column's text for each place and lead, built once each.
const treeTexts = new Map<string, string>()

/** The tree column for a row: `lead` lines of │, its branch, then │ or blank below. */
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

// A status color in the pane. Each tab has the tone of its own name.
type Tone = Tab | 'done' | 'error'
/**
 * The pane's colors in one Claude Code theme. Each text color meets WCAG AA,
 * 4.5:1, on every background the pane draws it on, and each marker meets 3:1.
 * The terminal draws Button labels in its own text color, and the theme's dim
 * gray for `dimColor`, so the pane gives Buttons no dimColor. The footer's Keys
 * toggle and the Closed and Details folds are the exceptions: secondary
 * controls, they brighten under the pointer. So are a just-opened row's
 * buttons, dim while they ignore clicks.
 */
type Palette = {
  /** Painted under the whole pane, over the theme's own background. */
  body?: string
  /** The sections' cards. */
  card?: string
  /** An unselected tab's panel. */
  tab?: string
  /** The selected tab's panel, and an unselected tab's under the pointer. */
  raised: string
  /** The text on `raised`; without one, the default text color. */
  raisedText?: string
  /** The selected row's background. Without one, a bar in `key` marks the row. */
  selection?: string
  /** Secondary text: ages, counts, labels and closed items. */
  muted: string
  /** The letters of a selected row's keys. */
  key: string
  /** The tree's lines. */
  line: string
  /** The rules between rows. */
  divider: string
  /** Text in a status color. A tone left out draws its text in the default color. */
  tone: Partial<Record<Tone, string>>
  /** A marker in a status color, such as ✓, and the selected tab's top line. */
  mark: Record<Tone, string>
}

// Hex tuned for one theme, each tone checked against the pane, the cards, the
// selected tab and the selected row. They hold only for the theme they name.
const DARK_TONES = { needsYou: '#ffc107', findings: '#cab0ff', prs: '#8cc8c0', done: '#7ecd8f', error: '#ffa3b0' }
const DARK_DALTONIZED_TONES = {
  needsYou: '#ffcc00',
  findings: '#cab0ff',
  prs: '#a3c2c2',
  done: '#82c1ff',
  error: '#ffa3a3',
}
const LIGHT_TONES = { needsYou: '#745417', findings: '#7b00e8', prs: '#006363', done: '#25652f', error: '#a5293d' }
const LIGHT_DALTONIZED_TONES = {
  needsYou: '#7a4900',
  findings: '#7400db',
  prs: '#2d5a5a',
  done: '#005885',
  error: '#ad0000',
}
const DARK_PALETTE: Palette = {
  card: '#373737',
  tab: '#373737',
  raised: '#4c4c4c',
  selection: '#3b4654',
  muted: '#bdbdbd',
  key: '#b1b9f9',
  line: '#505050',
  divider: '#444444',
  tone: DARK_TONES,
  // A marker needs only 3:1, so a failing check's ✗ takes Claude Code's own red, which text here could not.
  mark: { ...DARK_TONES, error: '#ff6b80' },
}
const LIGHT_PALETTE: Palette = {
  card: '#e6e6e6',
  tab: '#e6e6e6',
  raised: '#d0d0d0',
  selection: '#b4d5ff',
  muted: '#595959',
  key: '#243bf5',
  line: '#afafaf',
  divider: '#c8c8c8',
  tone: LIGHT_TONES,
  mark: LIGHT_TONES,
}
// The ANSI themes take the terminal's 16 colors, and Claude Code draws the
// pane on a palette gray that default text fails against. The pane paints its
// own body in the palette color nearest the terminal's background, draws text
// only in the default and muted colors, and puts status colors on markers.
// A color name such as "black" is drawn as fixed RGB, so each color is a theme
// key whose value in that ANSI theme is the palette color named beside it.
// Checked with Ghostty's default palette and its "Apple System Colors Light".
const DARK_ANSI_PALETTE: Palette = {
  body: 'inverseText', // black
  raised: 'inactive', // white
  raisedText: 'inverseText', // black
  muted: 'inactive', // white
  key: 'suggestion', // bright blue
  line: 'userMessageBackground', // bright black
  divider: 'userMessageBackground',
  tone: {},
  mark: { needsYou: NEEDS_YOU, findings: FINDINGS, prs: PRS, done: DONE, error: 'error' }, // the bright colors
}
const LIGHT_ANSI_PALETTE: Palette = {
  body: 'userMessageBackgroundHover', // bright white
  raised: 'text', // black
  raisedText: 'userMessageBackgroundHover', // bright white
  muted: 'inactive', // bright black
  key: 'suggestion', // blue
  line: 'userMessageBackground', // white
  divider: 'userMessageBackground',
  tone: {},
  // Red, magenta, blue, green and red: the theme's yellow and cyan fall under 3:1 on bright white.
  mark: { needsYou: 'error', findings: FINDINGS, prs: 'suggestion', done: DONE, error: 'error' },
}
const PALETTES: Record<string, Palette> = {
  dark: DARK_PALETTE,
  'dark-daltonized': {
    ...DARK_PALETTE,
    key: '#99ccff',
    tone: DARK_DALTONIZED_TONES,
    mark: { ...DARK_DALTONIZED_TONES, error: '#ff6666' },
  },
  light: LIGHT_PALETTE,
  'light-daltonized': {
    ...LIGHT_PALETTE,
    card: '#dcdcdc',
    tab: '#dcdcdc',
    raised: '#c8c8c8',
    muted: '#545454',
    key: '#003ae8',
    divider: '#c0c0c0',
    tone: LIGHT_DALTONIZED_TONES,
    mark: LIGHT_DALTONIZED_TONES,
  },
  'dark-ansi': DARK_ANSI_PALETTE,
  'light-ansi': LIGHT_ANSI_PALETTE,
}
// Auto and custom themes: theme keys whose values pass in both Claude Code's
// dark and light themes, since the mod cannot tell which one Auto chose. Text
// sits on the pane's own background, as in the ANSI palettes.
const THEME_KEY_PALETTE: Palette = {
  tab: 'userMessageBackground',
  raised: 'subtle',
  raisedText: 'text',
  muted: 'inactive',
  key: 'remember',
  line: 'subtle',
  divider: 'subtle',
  tone: {},
  mark: { needsYou: NEEDS_YOU, findings: FINDINGS, prs: PRS, done: DONE, error: 'error' },
}
const TABS: { id: Tab; label: string; hotkey: string }[] = [
  { id: 'needsYou', label: 'Needs you', hotkey: '1' },
  { id: 'findings', label: 'Findings', hotkey: '2' },
  { id: 'prs', label: 'PRs', hotkey: '3' },
]
// The blank columns on each side of a docked tab's name, which a click there also selects.
const TAB_PAD = '  '
// The Needs you tab lists questions first, because each takes one key.
const NEEDS_YOU_GROUPS: { kind: Item['kind']; title: string; list: 'questions' | 'tasks' }[] = [
  { kind: 'question', title: 'Questions', list: 'questions' },
  { kind: 'task', title: 'Tasks', list: 'tasks' },
]
// The lists with a Closed fold.
const FOLD_KINDS: (Item['kind'] | 'finding')[] = [...NEEDS_YOU_GROUPS.map(g => g.kind), 'finding']
const MODEL = 'sonnet'
const AWAY_MS = 15 * 60_000
const KEPT_SESSIONS = 40
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|[\w.-]+\.localhost)(?::\d+)?[^\s"'`)\]]*/g

// One turn's exchange, gathered across hooks. Module variables reset on a hot
// reload, which only loses the turn in progress.
let activity: string[] = []
let person: string | null = null
let trigger: string | null = null
let isTurnRunning = false
let isOn = false
// The press behind this turn's prompt.
let press: Press | null = null
// Replies a Stop hook sent Claude back from this turn, before the final one.
let sentBack: string[] = []
// Set in session.start, which a hot reload runs again.
let sessionId = ''
let root = ''
// The repo's top folder; null outside git.
let top: string | null = null
// The PR fetches, one at a time, and the next one when it is waiting to start: whether it looks up the branch's PR.
let fetchingPrs: Promise<void> = Promise.resolve()
let nextFetchFindsBranchPr: boolean | null = null
// Each tab's row ids as of the last write that can add a row, so a row that appears later counts as new.
let recordedRows: { isDemo: boolean; ids: Partial<Record<Tab, Set<string>>> } | null = null
// The pane's latest jump to another tab, whose top edge draws in for DRAW_IN_MS. A reload may lose it mid-draw.
let jumped: { tab: Tab; at: number } | null = null
let isSaved = false
let queue: Promise<void> = Promise.resolve()
// Counts the conversations this process has run, and the saved ledgers [Try again] put in place,
// so an update queued on one ledger never writes into the next.
let conversation = 0
// What Claude last read of the inbox beside a prompt, so it is sent again only when it changed.
let told: Told = TOLD_NOTHING
// The line last published to this pane's Herdr sidebar row, and the chain that publishes in order.
let published: string | null = null
let publishing: Promise<void> = Promise.resolve()
// Context for prompts this mod sent, by text, appended just before each prompt's row.
const contextFor = new Map<string, string[]>()
// A count of this mod's prompt rows stored, and its value at each text's latest row, so a
// send can tell whether its prompt entered while `$.prompt.submit` settled.
const storedAt = new Map<string, number>()
let storedCount = 0
// The `!` command whose output row comes next.
let shellCommand: string | null = null
// The engine refused a `$.tool.register` at turn-on, as an organization's settings can, so Claude cannot record or close items.
let toolsRefused = false
// The conversation whose saved session the store could not read, and whether [Try again] is reading it now.
// While set, Needs you says so in place of an empty list.
let unreadable: { id: string; isReading: boolean } | null = null
/**
 * The desktop app takes the focus off the pane when the Button holding it leaves the drawing, and
 * the next click there only brings it back (anthropics/claude-code#100874). The pane tracks the key
 * that holds the focus: the Button a press focused, or the text field the pane moved it to. It moves
 * the focus when a drawing leaves that key out, or first draws the field a Type press opened.
 */
let focusedKey: string | null = null
/**
 * The key that takes the pressed Button's place, such as a closed row's Undo, tried first. A Type
 * press names its text field, which takes the focus once a drawing has it, though the Button stays.
 */
let focusHint: string | null = null
/** Which look the pane last drew in, for the redraws a timer runs. */
let paneLook: 'terminal' | 'desktop' = 'terminal'

/** Every Button and Input key in a drawn tree: the keys the focus can move to. */
function focusKeys(node: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(node)) for (const child of node) focusKeys(child, keys)
  else if (node && typeof node === 'object') {
    const el = node as { type?: unknown; props?: { key?: unknown }; children?: unknown }
    if ((el.type === 'Button' || el.type === 'Input') && typeof el.props?.key === 'string') keys.add(el.props.key)
    focusKeys(el.children, keys)
  }

  return keys
}

// What [Resume] on a stop did: sending its prompt, or why the prompt will not enter.
let resuming: { is: 'sending' } | { is: 'refused'; why: string } | null = null
// The draft a row's field opened with. The engine replaces the typed text whenever the drawn
// `value` changes, so drawing each saved keystroke as `value` can drop keys typed before it lands.
const fieldSeeds = new Map<string, string>()

/** Clears everything gathered for the turn's exchange. */
function resetTurn() {
  activity = []
  person = null
  trigger = null
  press = null
  sentBack = []
}

/** Adds a message or a command of the person's to what they sent this turn. */
function notePerson(line: string) {
  person = person === null ? line : `${person}\n\n${line}`
}

function noteActivity(line: string) {
  if (activity.length < 40 && !activity.includes(line)) activity.push(line)
}

/** A transcript row's text, its text blocks joined. */
function messageText(message: SessionAppendMessage): string {
  return message.content.map(b => (b.type === 'text' ? b.text : '')).join('')
}

/** A tool result's fields, or none when the result is not an object. */
function resultFields(ran: { result?: unknown }): Record<string, unknown> {
  return ran.result && typeof ran.result === 'object' ? (ran.result as Record<string, unknown>) : {}
}

/** Reads which Claude Code theme draws the pane. */
async function syncTheme($: EngineInterface) {
  const theme = (await $.config.list().catch(() => [])).find(row => row.key === 'theme')?.value
  await update($, THEME, () => (typeof theme === 'string' ? theme : ''))
}

async function save($: EngineInterface, ledger: Ledger) {
  // Until a read succeeds, the saved copy holds the conversation's rows, and this ledger lacks them.
  if (unreadable?.id === sessionId) return
  const savedAt = await $.clock.now()
  const key = `s:${sessionId}`
  // The first save in a process deletes the key first, moving it to the end of
  // the store's insertion order, which the pruning treats as most recent. Later
  // saves only overwrite, so pruning runs once per process.
  if (!isSaved) await $.store.delete(key)
  await $.store.set(key, { savedAt, ledger })
  if (isSaved) return
  isSaved = true
  const keys = await $.store.keys()
  const sessions = keys.filter(k => k.startsWith('s:'))
  // `p:` keys held the last-session offer, which earlier builds saved per folder.
  const stale = [
    ...sessions.slice(0, Math.max(0, sessions.length - KEPT_SESSIONS)),
    ...keys.filter(k => k.startsWith('p:')),
  ]
  await Promise.all(stale.map(old => $.store.delete(old)))
}

/**
 * Publishes the session's status line to its Herdr pane, where a sidebar row
 * showing the `inbox` token reads it. Outside Herdr it does nothing. Calls run
 * in order and read the state when they run, so an older line never lands
 * after a newer one, as when a dialog opens and closes in quick succession.
 */
function publishStatus($: EngineInterface, isEnding = false): Promise<void> {
  publishing = publishing
    .then(async () => {
      const pane = await $.env.get('HERDR_PANE_ID')
      if (!pane) return
      const [ledger, stop, dialogs, lastActions, presence, now] = await Promise.all([
        read($, LEDGER),
        read($, STOP),
        read($, DIALOGS),
        read($, LAST_ACTIONS),
        read($, PRESENCE),
        $.clock.now(),
      ])
      // Only the items and findings the band counts, in the pane's order: a row handed to Claude waits on no one.
      const { needsYou, findings } = viewOf({ ledger, lastActions, notes: {}, turns: presence, now }, presence)
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
  if (stop === null && (await read($, STOP)) === null) return
  resuming = null
  await update($, STOP, () => stop)
  void publishStatus($)
}

/** [Resume] on a stop sends what the person would type. The turn's start clears the stop. */
async function resume($: EngineInterface) {
  // [Resume] keeps its key while it reads "Resuming…", so a second press lands here.
  if (resuming?.is === 'sending') return
  // The band and the pane both read the stop, so writing it again redraws both.
  const redraw = () => update($, STOP, s => (s ? { ...s } : s))
  resuming = { is: 'sending' }
  await redraw()
  const sent = await send($, 'Continue')
  if ('notSent' in sent) {
    resuming = { is: 'refused', why: sent.notSent }
    await redraw()
  }
}

/**
 * A tool call's identity: the tool and its main argument. A dialog keeps it,
 * so it closes when its own call ends, not when a like call does.
 */
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

/** Closes the dialogs of one call, or every dialog. */
async function closeDialogs($: EngineInterface, key: string | null) {
  if (!(await read($, DIALOGS)).some(d => key === null || d.key === key)) return
  await update($, DIALOGS, d => (key === null ? [] : d.filter(x => x.key !== key)))
  void publishStatus($)
}

/** Runs a tool call and closes its dialog when the call resolves, since `next` returns only after the person answers any prompt for it. */
async function clearingDialog<T>($: EngineInterface, key: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } finally {
    await closeDialogs($, key)
  }
}

/** What a permission prompt asks, in a few words: "push main to origin", "edit README.md". */
function permissionText(tool: string, input: Record<string, unknown>): string {
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '')
  const file = (key: string) => baseName(text(key))
  switch (tool) {
    case 'Bash': {
      const said = text('description') || text('command')
      // "Push main to origin" reads as "Allow push main to origin?"; an acronym keeps its case.
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

/** Changes the ledger and saves it, so a resumed session finds it. */
async function commitLedger($: EngineInterface, change: (l: Ledger) => Ledger): Promise<void> {
  let before: Ledger = EMPTY
  const after = await update($, LEDGER, l => {
    // A tool call can land after a hot reload and before turnOn converts the ledger an older build saved.
    before = upgradeLedger(l)
    return change(before)
  })
  await save($, after)
  void publishStatus($)
  // A row this change closed stays in place, with its leave bar, for SETTLED_MS.
  if (hasNewClose(before, after)) redrawWhileLeaving($, SETTLED_MS)
  void followNewRows($).catch(() => undefined)
}

/** Whether `after` closed an item or finding that `before` had not. */
function hasNewClose(before: Ledger, after: Ledger): boolean {
  const closes = (l: Ledger) => [
    ...l.closed.map(d => `${d.id} ${d.at}`),
    ...l.closedFindings.map(f => `${f.id} ${f.closedAt}`),
  ]
  const was = new Set(closes(before))

  return closes(after).some(c => !was.has(c))
}

/**
 * The inbox view of a ledger, with the item status the presence gives. With
 * `prViews`, an item whose ask names a tracked PR gets a step that opens it;
 * the counts need none.
 */
function viewOf(
  {
    ledger,
    lastActions,
    notes,
    turns,
    prViews,
    now,
  }: Pick<DemoCopy, 'ledger' | 'lastActions' | 'turns'> & {
    notes: Record<string, RowNote>
    prViews?: PrViews
    now: number
  },
  presence: Presence,
): InboxView {
  return inboxView({
    ledger,
    lastActions,
    notes,
    turns,
    now,
    extraSteps: prViews ? Object.fromEntries(ledger.items.map(i => [i.id, itemPrSteps(i, prViews, ledger.prs)])) : {},
    settleWindowMs: SETTLED_MS,
    // catchUp reruns a failed update after the next message.
    status: perTurnStatus(ledger, {
      isUpdating: presence.isUpdating,
      isFailed: presence.ledgerState === 'failed',
      retries: true,
    }),
  })
}

/**
 * Redraws the pane at each step of a settled row's leave bar, for `waitMs`,
 * so the row leaves once SETTLED_MS after its close has passed. The view reads
 * the time, so a fresh value of what it draws from is what redraws it: the
 * session's last actions, or the demo's copy.
 */
function redrawWhileLeaving($: EngineInterface, waitMs: number) {
  // Whole milliseconds, so the last wait ends at `waitMs` and its redraw finds the row gone.
  // Desktop draws no leave bar and redraws once, when the row leaves: while the bar redrew every
  // 213 ms there, clicks on the pane's Buttons, Undo among them, did nothing.
  const step = paneLook === 'desktop' ? waitMs : Math.ceil(SETTLED_MS / LEAVE_BAR_STEPS)
  void (async () => {
    for (let left = waitMs; left > 0; left -= step) {
      await $.clock.sleep(Math.min(step, left))
      await Promise.all([update($, LAST_ACTIONS, a => ({ ...a })), update($, DEMO, d => d && { ...d })])
    }
  })().catch(() => undefined)
}

/**
 * A reload cancels the redraws that were running, so this sets them again
 * until the latest of these ends, each SETTLED_MS after its time: a close, a
 * PR's Dismiss, a Local result and a row's note. Drawn on the demo's copy
 * while the demo shows. It also redraws once a new-row bar still showing ends.
 */
async function redrawAfterReload($: EngineInterface) {
  const { ledger, lastActions, notes, now } = await drawnState($)
  const times = [
    ...ledger.closed.map(d => d.at),
    ...ledger.closedFindings.map(f => f.closedAt),
    ...Object.values(lastActions).flatMap(a => [
      ...(a.result ? [a.result.at] : []),
      ...(a.action === 'pr-dismiss' ? [a.at] : []),
    ]),
    ...Object.values(notes).map(n => n.at),
  ]
  const waitMs = Math.max(0, ...times.map(t => t + SETTLED_MS - now))
  if (waitMs > 0) redrawWhileLeaving($, waitMs)
  const arrival = await read($, ARRIVAL)
  if (arrival && arrival.at + NEW_ROW_MS > now) redrawAfterNewRows($, arrival.at, now)
}

type ModelResult = Awaited<ReturnType<EngineInterface['model']['fork']>>

type LedgerState = Presence['ledgerState']

/** Applies the ledger model's reply. */
async function applyLedgerReply(
  $: EngineInterface,
  at: number,
  r: ModelResult,
  source: string | null,
  change: (l: Ledger, u: Update, now: number) => Ledger,
): Promise<LedgerState> {
  if (!r.isAnswered) {
    // A fork has nothing to read until this process sends its first request,
    // as after a resume. The catch-up runs again after the next reply.
    return r.reason === 'nothing-to-fork' ? 'behind' : 'failed'
  }
  const parsed = parseReply(r.text, source)
  if (!parsed || at !== conversation) return 'failed'
  const now = await $.clock.now()
  await commitLedger($, l => change(l, parsed, now))

  return 'current'
}

/** Asks the ledger model to update the ledger, with systemText as its instructions, cached for the next call within five minutes. */
function askLedgerModel($: EngineInterface, prompt: string, timeoutMs: number): Promise<ModelResult> {
  const system = [{ text: systemText(CLAUDE_CODE), cache: true as const }]

  return $.model.complete({ model: MODEL, system, prompt, maxTokens: 1600, effort: 'low', timeoutMs })
}

/** Updates the ledger from one exchange. */
async function runUpdate($: EngineInterface, at: number, ex: Exchange): Promise<LedgerState> {
  const promptAt = await $.clock.now()
  const r = await askLedgerModel($, buildPrompt(await read($, LEDGER), ex), 45_000)
  // An Explain turn talks about its item without deciding it.
  const explained = ex.press?.action === 'explain' ? ex.press.id : null

  return applyLedgerReply($, at, r, [ex.reply, ...ex.activity].join('\n'), (l, u, now) =>
    applyUpdate(l, { ...u, closed: u.closed.filter(c => c.id !== explained) }, now, ex.turn, promptAt),
  )
}

/**
 * Brings the ledger up to date over the whole conversation, for turns the
 * per-turn update missed: it closes what was handled and adds what still waits.
 */
async function catchUp($: EngineInterface, at: number): Promise<LedgerState> {
  const [ledger, shown] = await Promise.all([read($, LEDGER), screen($)])
  const change = (l: Ledger, u: Update, now: number) => applyUpdate(l, u, now, l.turn)
  const forked = await $.model.fork({ prompt: catchUpPrompt(CLAUDE_CODE, ledger, shown) })
  if (forked.isAnswered || forked.reason !== 'nothing-to-fork') return applyLedgerReply($, at, forked, null, change)
  // A resumed conversation has no request of this process's to fork until its
  // first reply, so the model reads the transcript instead, uncached.
  const transcript = transcriptText(await $.session.messages())
  if (!transcript) return 'behind'
  const r = await askLedgerModel($, transcriptCatchUpPrompt(ledger, shown, transcript), 90_000)

  return applyLedgerReply($, at, r, transcript, change)
}

/**
 * Queues the next update: a catch-up while the ledger may have missed a turn,
 * else this exchange alone.
 */
function queueUpdate($: EngineInterface, next: { ex: Exchange; turnsStarted: number } | null) {
  const at = conversation
  queue = queue.then(async () => {
    if (at !== conversation) return
    const { ledgerState, turnsStarted } = await update($, PRESENCE, p => ({ ...p, isUpdating: true }))
    const state = await (ledgerState !== 'current' || next === null ? catchUp($, at) : runUpdate($, at, next.ex)).catch(
      (): LedgerState => 'failed',
    )
    if (at !== conversation) return
    // An exchange covers the turns started by its end; a catch-up, those started before it ran.
    const applied = next?.turnsStarted ?? turnsStarted
    await update($, PRESENCE, p => ({
      ...p,
      ledgerState: state,
      isUpdating: false,
      turnsApplied: state === 'current' ? Math.max(p.turnsApplied, applied) : p.turnsApplied,
    }))
    // A task handed to Claude unfolds once the update for its turn applies.
    void publishStatus($)
  })
  // A rejected link would skip every later update, so the chain swallows it.
  queue = queue.catch(() => undefined)
}

async function tick($: EngineInterface) {
  const now = await $.clock.now()
  const p = await read($, PRESENCE)
  if (p.isAway) {
    await update($, PRESENCE, q => ({ ...q, minute: Math.floor(now / 60_000) }))
  } else if (!isTurnRunning && p.lastActiveAt > 0 && now - p.lastActiveAt > AWAY_MS) {
    await update($, PRESENCE, q => ({ ...q, isAway: true, minute: Math.floor(now / 60_000) }))
  }
}

/**
 * Sends a prompt as the person's own message. A plugin's own prompt skips that
 * plugin's prompt.submit hook, so the bookkeeping happens here, and what
 * Claude reads beside the prompt goes just before it, in a row only the model sees.
 * Resolves once the prompt entered or was queued, or with why it will not enter.
 * A prompt that will not enter is taken back out of what Claude and the per-turn
 * update read next; the prompt count stays.
 */
async function send($: EngineInterface, text: string, sentBy: Press | null = null): Promise<Sent> {
  const [toldBefore, pressBefore] = [told, press]
  const context = await notePrompt($, text, sentBy)
  const toldSent = told
  // The engine may run the prompt now, after the running turn, or inside it, so
  // the context goes in when the prompt's own row is stored (session.append).
  if (context.length > 0) contextFor.set(text, context)
  const since = storedCount
  const sent = await $.prompt.submit({ text, asUser: true }).then(
    (r): Sent => (r.drop === undefined ? { entered: r.text, since } : { notSent: r.drop }),
    // A rejection after the prompt's row was stored still reached Claude.
    (err: unknown): Sent =>
      isStoredSince(text, since)
        ? { entered: text, since }
        : { notSent: (err instanceof Error ? err.message : String(err)) || 'the session refused it' },
  )
  if ('entered' in sent) {
    // Another plugin's prompt.submit hook rewrote the prompt, so its context waits under the text that enters.
    if (sent.entered !== text && contextFor.get(text) === context) {
      contextFor.delete(text)
      if (!isStoredSince(sent.entered, since)) contextFor.set(sent.entered, context)
    }

    return sent
  }
  // Each part is put back only while nothing since has changed it.
  if (told === toldSent) told = toldBefore
  if (person === text) person = null
  else if (person?.endsWith(`\n\n${text}`)) person = person.slice(0, -(text.length + 2))
  if (sentBy && press === sentBy) press = pressBefore
  if (contextFor.get(text) === context) contextFor.delete(text)

  return sent
}

/**
 * How a send ended: the text that entered, which another plugin's prompt.submit
 * hook may have rewritten, with the stored-row count before the send; or why it will not enter.
 */
type Sent = { entered: string; since: number } | { notSent: string }

/** Whether a row of this mod's with `text` was stored after the stored-row count was `since`. */
function isStoredSince(text: string, since: number): boolean {
  return (storedAt.get(text) ?? 0) > since
}

/** Appends context as a row only the model reads. Without it Claude still gets the prompt, so a refused append is ignored. */
async function appendContext($: EngineInterface, context: string[]) {
  await $.session
    .append({ message: { type: 'user', content: [{ type: 'text', text: context.join('\n\n') }] } })
    .catch(() => undefined)
}

/**
 * Records a prompt in the person's words and returns what Claude reads beside
 * it: the questions a numbered answer refers to, and the inbox when it changed.
 */
async function notePrompt($: EngineInterface, text: string, sentBy: Press | null): Promise<string[]> {
  const [now, ledger, isShown] = await Promise.all([
    $.clock.now(),
    update($, LEDGER, l => ({ ...l, turn: l.turn + 1 })),
    isPaneShown($),
  ])
  await update($, PRESENCE, p => ({ ...p, lastActiveAt: now, isAway: false }))
  const r = promptNotes(CLAUDE_CODE, ledger, { text, isPress: sentBy !== null, isOpen: isShown }, told)
  const notes = r.notes
  told = r.told

  if (sentBy) press = sentBy
  notePerson(text)
  trigger = null

  return notes
}

/** Opens a path an item names, as `openCommands` decides. Returns why it could not, or null. */
async function openPath($: EngineInterface, raw: string): Promise<string | null> {
  const path = localPath(raw, root, (await $.env.get('HOME')) ?? '')
  if (!(await $.fs.exists(path))) return 'it no longer exists'
  const stat = await $.fs.stat(path)
  const isFile = stat.kind === 'file'
  const isExecutable = isFile && (await $.process.run(['test', '-x', path])).exitCode === 0
  const { argv, fallback } = openCommands(path, isFile, isExecutable)
  const r = await $.process.run(argv)
  const retry = r.exitCode !== 0 && fallback ? await $.process.run(fallback) : r

  return retry.exitCode === 0 ? null : retry.stderr.trim() || `open exited ${retry.exitCode}`
}

/** A path inside the repo, relative to its top folder; any other path as given. */
function repoPath(path: string): string {
  const base = top ?? root

  return base && path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path
}

/**
 * Brings state an earlier version of the mod wrote up to date, and returns the
 * ledger. A reload keeps $.state, so a running session can still hold findings
 * under `notes`, and `notes` as its tab, and the Needs you tab as `waiting`,
 * with item kinds `decide` and `do`, PR threads without a time or
 * `isLinesChanged`, and last actions saved by button key without a kind.
 */
async function upgradeState($: EngineInterface): Promise<Ledger> {
  const [ledger] = await Promise.all([
    update($, LEDGER, upgradeLedger),
    update($, TAB, t => ((t as string) === 'notes' ? 'findings' : (t as string) === 'waiting' ? 'needsYou' : t)),
    update($, SELECTION, ({ waiting, ...s }: Record<Tab, Cursor> & { waiting?: Cursor }) => {
      const cursors: Record<Tab, Cursor> = { ...NO_SELECTION, ...(waiting ? { needsYou: waiting } : {}), ...s }
      // A cursor saved before `openedAt` existed: no click opened its row in a way that still guards it.
      return Object.fromEntries(
        Object.entries(cursors).map(([t, c]) => [t, { ...c, openedAt: c.openedAt ?? 0 }]),
      ) as Record<Tab, Cursor>
    }),
    // An earlier build saved only the row the pane jumped to; its bar ended long ago.
    update($, ARRIVAL, a => (a && Array.isArray(a.ids) ? a : null)),
    // Old builds saved the group kinds as `decide` and `do`; Findings' fold keeps its own name.
    update($, UNFOLDED, u => u.map(k => (k === 'finding' ? k : readKind(k)))),
    // A demo an earlier build seeded may lack a field this one draws, so it ends; /inbox demo seeds a new one.
    update($, DEMO, d => (d === null || isDemoCopy(d) ? d : null)),
    // Last actions an earlier build saved by button key, without a kind. Those for Open, Open log,
    // a session check and a PR check's Fix record nothing now, so they go.
    update($, LAST_ACTIONS, upgradeLastActions),
    // Presence from before the turn counts existed cannot say whether the last
    // turn's update landed, so that load catches up once.
    update($, PRESENCE, p => ({ ...p, turnsStarted: p.turnsStarted ?? 1, turnsApplied: p.turnsApplied ?? 0 })),
    update($, PR_VIEWS, v => ({
      ...v,
      views: Object.fromEntries(
        Object.entries(v.views).map(([ref, pr]) => [
          ref,
          {
            ...pr,
            threads: pr.threads.map(t => ({
              ...t,
              isLinesChanged: t.isLinesChanged ?? false,
              at: t.at ?? null,
              reply: t.reply && { ...t.reply, at: t.reply.at ?? null },
            })),
          },
        ]),
      ),
    })),
  ])

  return ledger
}

/** Runs a record_finding or close call on the ledger. Returns the text the agent reads back. */
async function runTool(
  $: EngineInterface,
  tool: typeof recordFinding,
  input: Record<string, unknown>,
): Promise<string> {
  const now = await $.clock.now()
  let result = ''
  await commitLedger($, l => {
    const r = tool(CLAUDE_CODE, l, input, now)
    result = r.result
    return r.ledger
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

/**
 * Opens the shown tab's top row, as the pane opens. With no row to open, the
 * tab draws its top row open by default once one arrives.
 */
async function openTopRow($: EngineInterface) {
  const [{ view, ledger, prViews: prState, lastActions, now }, tab] = await Promise.all([drawnState($), read($, TAB)])
  const prViews = drawnPrs(prState, ledger.prs, lastActions, now)
    .filter(x => !x.isSettled)
    .map(x => x.pr)
  const ids = tabRowIds(view, prViews)[tab]
  const top = topRow(tab, ids, view)
  if (top === null) await update($, SELECTION, s => ({ ...s, [tab]: NO_CURSOR }))
  else await select($, tab, top, ids.indexOf(top))
}

/** Opens the pane on the shown tab with its top row open, as /inbox does. Nothing in the tabs counts as new. */
async function showInbox($: EngineInterface) {
  await openPane($)
  await followNewRows($, true)
  await openTopRow($)
}

/**
 * The band's [Open inbox]: opens the pane with the top row that needs the
 * person open, the row line 1 names. With none, it opens on the shown tab.
 */
async function openInbox($: EngineInterface) {
  // Opened before any other await. After one, the engine no longer counts the press as
  // asking for the pane, and below 144 columns, once the person has closed it, leaves it unplaced.
  await openPane($)
  const { view } = await drawnState($)
  if (view.needsYou.topId !== null) await update($, TAB, () => 'needsYou' as const)
  else if ((await read($, TAB)) === 'prs') await findPrs($)
  await followNewRows($, true)
  await openTopRow($)
}

/** Sends a row's draft as its typed answer or reply, as Enter in its field does. */
async function sendDraft($: EngineInterface, id: string, surface: UiPressArgument['surface']) {
  await sendTyped($, id, (await read($, DRAFTS))[id] ?? '', surface)
}

/** Sends typed words as a row's answer or reply. Blank ones send nothing and leave the field open with the keyboard. */
async function sendTyped($: EngineInterface, id: string, text: string, surface: UiPressArgument['surface']) {
  if (text.trim()) await runPress($, { action: 'type', id, text }, surface)
  else await focusField($, id)
}

/** Opens the free-text field under a row and gives it the keyboard. */
async function startTyping($: EngineInterface, id: string) {
  fieldSeeds.set(id, (await read($, DRAFTS))[id] ?? '')
  await keepPressedOpen($, id)
  await update($, TYPING, () => id)
  await focusField($, id)
}

/** Gives a row's open text field the keyboard. */
async function focusField($: EngineInterface, id: string) {
  // A click leaves the keys with the prompt, and `ui.focus` is refused in a pane that lacks them.
  await openPane($)
  await $.ui.focus({ requestId: PANE, key: `type-${id}` }).catch(() => undefined)
}

async function showTab($: EngineInterface, tab: Tab) {
  if (tab === 'prs') await findPrs($)
  await update($, TAB, () => tab)
  await $.ui.scroll({ in: PANE, to: 'start' }).catch(() => undefined)
}

/**
 * Refreshes the PRs tab as it comes into view, asking gh for the branch's PR.
 * Call it before the tab draws: it marks the fetch first, so the tab opens on
 * "Checking for PRs…" and not on "No PRs". The demo shows sample PRs, so it asks nothing.
 */
async function findPrs($: EngineInterface) {
  if (await read($, DEMO)) return
  await update($, PR_VIEWS, v => ({ ...v, isFetching: true }))
  void fetchPrs($, true)
}

/**
 * Selects a row and scrolls the pane the least that shows it whole. The row's
 * scroll target is drawn only once the row redraws expanded, and the engine
 * refuses a key it has not drawn, so the scroll retries for a few frames.
 * Measured before the redraw, the row's end would land out of view.
 */
async function select($: EngineInterface, tab: Tab, id: string, index: number) {
  const openedAt = await $.clock.now()
  await update($, SELECTION, s => ({ ...s, [tab]: { id, index, openedAt } }))
  await update($, TYPING, t => (t === id ? t : null))
  // The row's buttons draw dim while guarded. A render cannot write state, so a fresh value redraws them once the guard ends.
  void $.clock
    .sleep(PRESS_GUARD_MS)
    .then(() => update($, SELECTION, s => ({ ...s })))
    .catch(() => undefined)
  for (let tries = 0; tries < 10; tries++) {
    const result = await $.ui
      .scroll({ in: PANE, to: { key: `view-${id}` }, block: 'nearest' })
      .catch((): UiScrollResult => ({}))
    if (result.deny === undefined) return
    await $.clock.sleep(30)
  }
}

/**
 * Opens the row whose desktop Client took a click, if the shown tab still lists it. A click less
 * than PRESS_GUARD_MS after a row opened does nothing: the list reflows under the pointer as a row
 * opens, so a quick second click lands on another row.
 */
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
 * Sets a list's Closed fold to the state its desktop Client posted. A set, not a toggle: a second
 * click before the redraw posts the same state, so a double-click leaves the fold unfolded.
 */
async function setFold($: EngineInterface, kind: string, isUnfolded: unknown) {
  const fold = FOLD_KINDS.find(k => k === kind)
  if (fold === undefined || typeof isUnfolded !== 'boolean') return
  await update($, UNFOLDED, u =>
    u.includes(fold) === isUnfolded ? u : isUnfolded ? [...u, fold] : u.filter(k => k !== fold),
  )
}

/**
 * The open row's position, or -1 when none is open. A tab with no row opened in
 * this conversation draws `top` open. Once the open row leaves, none is open:
 * a row opening under the pointer would catch a second click.
 */
function selectedIndex(ids: string[], cursor: Cursor, top: string | null): number {
  if (cursor.id !== null) return ids.indexOf(cursor.id)

  return cursor.openedAt === 0 && top !== null ? ids.indexOf(top) : -1
}

/**
 * The row a tab draws open before any row was opened there: in Needs you the
 * top row that counts, else the first, as when every task is handed off.
 */
function topRow(tab: Tab, ids: string[], view: InboxView): string | null {
  return (tab === 'needsYou' ? view.needsYou.topId : null) ?? ids[0] ?? null
}

/**
 * Runs a click on one of row `rowId`'s buttons, unless that row opened less
 * than PRESS_GUARD_MS ago: then it is the second click of a double-click that
 * opened the row, landing on a button that just drew.
 */
async function unlessGuarded($: EngineInterface, rowId: string, press: UiPressArgument, onPress: Action['onPress']) {
  const [selection, tab, now] = await Promise.all([read($, SELECTION), read($, TAB), $.clock.now()])
  const cursor = selection[tab]
  if (cursor.id !== rowId || !isGuarded(cursor.openedAt, now)) await onPress(press)
}

/**
 * Keeps a row open once it is pressed while its tab draws it open by default,
 * so the default does not open another row when this one leaves or stops
 * counting. `openedAt` stays 0: the row was already open, so it is not guarded.
 */
async function keepPressedOpen($: EngineInterface, id: string) {
  const tab = await read($, TAB)
  await update($, SELECTION, s =>
    s[tab].id === null && s[tab].openedAt === 0 ? { ...s, [tab]: { id, index: 0, openedAt: 0 } } : s,
  )
}

/**
 * Records each tab's row ids and returns, by tab, the ids it did not have at
 * the last record. A tab passed as null is loading: it keeps its record and
 * returns nothing. The first record, and the first after the demo turns on or
 * off, return nothing.
 */
function newRows(isDemo: boolean, current: Record<Tab, string[] | null>): Record<Tab, string[]> {
  const before = recordedRows?.isDemo === isDemo ? recordedRows.ids : {}
  const ids = { ...before }
  const added: Record<Tab, string[]> = { needsYou: [], findings: [], prs: [] }
  for (const { id: tab } of TABS) {
    const listed = current[tab]
    if (listed === null) continue
    const seen = before[tab]
    if (seen) added[tab] = listed.filter(id => !seen.has(id))
    ids[tab] = new Set(listed)
  }
  recordedRows = { isDemo, ids }

  return added
}

/**
 * Moves the pane to a tab and opens a row there, or shows the tab's top when
 * there is none. The pane then redraws while the tab's top edge draws in.
 */
async function jumpTo($: EngineInterface, tab: Tab, row: { id: string; index: number } | null) {
  const at = await $.clock.now()
  jumped = { tab, at }
  await update($, TAB, () => tab)
  if (row) await select($, tab, row.id, row.index)
  else await $.ui.scroll({ in: PANE, to: 'start' }).catch(() => undefined)
  void (async () => {
    for (let n = 1; n <= DRAW_IN_STEPS; n++) {
      await $.clock.sleep(Math.max(0, at + (n * DRAW_IN_MS) / DRAW_IN_STEPS - (await $.clock.now())))
      await update($, SELECTION, s => ({ ...s }))
    }
  })().catch(() => undefined)
}

/** Redraws the pane once the new-row bars that started at `at` end. */
function redrawAfterNewRows($: EngineInterface, at: number, now: number) {
  void $.clock
    .sleep(Math.max(0, at + NEW_ROW_MS - now))
    .then(() => update($, ARRIVAL, a => a && { ...a }))
    .catch(() => undefined)
}

/** The ids of the rows that just closed, which stay in place but cannot be selected. */
function settledIn(rows: RowView[]): string[] {
  return rows.filter(r => r.state.is === 'settled').map(r => r.id)
}

/** Each tab's selectable row ids, in the order the pane lists them: rows that just closed are left out. */
function tabRowIds(view: InboxView, prViews: PrView[]): Record<Tab, string[]> {
  const ids = (rows: RowView[]) => rows.filter(r => r.state.is !== 'settled').map(r => r.id)

  return {
    needsYou: NEEDS_YOU_GROUPS.flatMap(g => ids(view.needsYou[g.list])),
    findings: ids(view.findings.rows),
    prs: prViews.flatMap(pr => [
      ...failingChecks(pr).map(c => prCheckId(pr, c)),
      ...waitingThreads(pr).map(t => prThreadId(pr, t)),
    ]),
  }
}

/**
 * Marks the rows that just appeared, which draw a bar for NEW_ROW_MS, and moves
 * the pane to a new row on another tab while the tab on screen shows only its
 * empty text. `isOpening` records the tabs afresh, so nothing in them counts as
 * new. The render cannot write state, so each write that can add a row calls
 * this. See docs/plans/jump-to-new-rows.md.
 */
async function followNewRows($: EngineInterface, isOpening = false) {
  const [drawn, tab, unfolded, isShown] = await Promise.all([
    drawnState($),
    read($, TAB),
    read($, UNFOLDED),
    isPaneShown($),
  ])
  const { ledger, prViews: prState, lastActions, stop, isDemo, view, now } = drawn
  const prs = drawnPrs(prState, ledger.prs, lastActions, now)
  const prViews = prs.filter(x => !x.isSettled).map(x => x.pr)
  const ids = tabRowIds(view, prViews)
  const settledNeedsYou = settledIn([...view.needsYou.questions, ...view.needsYou.tasks])
  if (isOpening) recordedRows = null
  // A PR fetch's rows count once it ends. A new PR counts even with no rows. A row
  // that just closed is still recorded, so it does not count as new if Undo brings it back.
  const added = newRows(isDemo, {
    needsYou: [...ids.needsYou, ...settledNeedsYou],
    findings: [...ids.findings, ...settledIn(view.findings.rows)],
    prs: prState.isFetching ? null : [...prs.map(x => `pr ${x.pr.ref}`), ...ids.prs],
  })
  if (!isShown) return
  const arrived = TABS.flatMap(t => added[t.id])
  if (arrived.length > 0) {
    await update($, ARRIVAL, () => ({ ids: arrived, at: now }))
    redrawAfterNewRows($, now, now)
  }
  // A tab is empty while it shows only its empty text.
  const isEmpty = {
    needsYou:
      ids.needsYou.length === 0 &&
      settledNeedsYou.length === 0 &&
      !stop &&
      !isUnreadShown(isDemo) &&
      !unfolded.some(kind => ledger.closed.some(d => d.kind === kind)),
    findings: view.findings.rows.length === 0 && !(unfolded.includes('finding') && ledger.closedFindings.length > 0),
    prs: prs.length === 0 && !prState.isFetching,
  }[tab]
  const to = isEmpty ? TABS.find(t => t.id !== tab && added[t.id].length > 0)?.id : undefined
  if (!to) return
  const id = ids[to].find(x => added[to].includes(x))
  await jumpTo($, to, id === undefined ? null : { id, index: ids[to].indexOf(id) })
}

/** Needs you says the saved session could not be read: for this conversation, and not over the demo's samples. */
function isUnreadShown(isDemo: boolean): boolean {
  return !isDemo && unreadable?.id === sessionId
}

async function isPaneShown($: EngineInterface) {
  return (await $.ui.panes().catch(() => [])).some(p => p.id === PANE && p.isShown)
}

/** The PRs tab is on screen, so the current branch's PR is worth looking up. */
async function isPrsTabShown($: EngineInterface) {
  return (await read($, TAB)) === 'prs' && (await isPaneShown($))
}

/** What the person has on screen besides the conversation, for the ledger model. */
async function screen($: EngineInterface) {
  const tab = await read($, TAB)

  return screenText(CLAUDE_CODE, await isPaneShown($), TABS.find(t => t.id === tab)?.label ?? tab)
}

/** Closes the open tasks whose exact command the person ran in shell mode. */
async function closeTasksRunBy($: EngineInterface, command: string) {
  const ran = tasksRunBy(await read($, LEDGER), command)
  if (ran.length === 0) return
  const now = await $.clock.now()
  await commitLedger($, l =>
    ran.reduce((after, item) => closeItem(after, item.id, { how: 'done', outcome: 'you ran it' }, now), l),
  )
}

async function gh($: EngineInterface, args: string[]) {
  return $.process.run(['gh', ...args], { cwd: root, timeoutMs: 20_000 })
}

/** Remembers PRs this session created or linked, newest last. */
async function linkPrs($: EngineInterface, refs: string[]) {
  if (refs.length === 0) return
  const linked = (await read($, LEDGER)).prs
  if (refs.every(r => linked.includes(r))) return
  await commitLedger($, l => ({ ...l, prs: [...l.prs.filter(r => !refs.includes(r)), ...refs].slice(-MAX_PRS) }))
  void fetchPrs($, await isPrsTabShown($))
}

/**
 * One PR's view and open threads. `target` is "owner/repo#123", or null for
 * the current branch's PR, whose ref is known only from gh's answer.
 * `knownBranchRef` is the branch's PR as of the last fetch: it stays the
 * branch's PR when the lookup fails for any reason but "no pull requests found".
 */
async function fetchPr(
  $: EngineInterface,
  target: string | null,
  views: Record<string, PrView>,
  knownBranchRef: string | null,
): Promise<PrView | null> {
  const threadsOf = (ref: string) => {
    const r = parseRef(ref)
    return gh($, [
      'api',
      'graphql',
      '-f',
      `query=${THREADS_QUERY}`,
      '-F',
      `owner=${r.owner}`,
      '-F',
      `repo=${r.name}`,
      '-F',
      `number=${r.number}`,
    ])
  }
  const t = target ? parseRef(target) : null
  // A linked PR's two calls are independent; the branch PR's threads wait for its ref.
  const [view, early] = await Promise.all([
    gh($, ['pr', 'view', ...(t ? [t.number, '-R', t.repo] : []), '--json', VIEW_FIELDS]),
    target ? threadsOf(target) : null,
  ])
  const hasNoPr = view.exitCode !== 0 && /no pull requests found/i.test(view.stderr)
  const ref = target ?? (view.exitCode === 0 ? urlRef(view.stdout) : hasNoPr ? null : knownBranchRef)
  if (!ref) return null
  const previous = views[ref]
  const base = view.exitCode === 0 ? readView(ref, view.stdout) : null
  if (!base)
    return previous ? { ...previous, error: view.stderr.trim().split('\n')[0] || 'gh could not read the PR' } : null
  const threads = early ?? (await threadsOf(ref))

  return {
    ...base,
    threads: threads.exitCode === 0 ? readThreads(threads.stdout) : (previous?.threads ?? []),
    fetchedAt: await $.clock.now(),
    error: threads.exitCode === 0 ? null : 'could not read review threads',
  }
}

/** The ref of the PR whose `gh pr view --json` output this is. */
function urlRef(json: string): string | null {
  try {
    return prRefs(String((JSON.parse(json) as { url?: unknown }).url ?? ''))[0] ?? null
  } catch {
    return null
  }
}

/**
 * Refreshes every PR the tab shows: the linked ones and the current branch's.
 * Only `findsBranchPr` asks gh which PR the branch has; otherwise the last one
 * found is refreshed by its ref. One fetch runs at a time. A request made
 * while one runs waits for it, joined with any other request waiting.
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
  const state = await update($, PR_VIEWS, v => ({ ...v, isFetching: true }))
  try {
    const linked = (await read($, LEDGER)).prs
    const branchTarget = findsBranchPr ? null : state.branchRef
    // The branch's PR, when it is also linked, is fetched once, with the linked ones.
    const isBranchLinked = branchTarget !== null && linked.includes(branchTarget)
    const [branch, ...rest] = await Promise.all([
      findsBranchPr || (branchTarget && !isBranchLinked)
        ? fetchPr($, branchTarget, state.views, state.branchRef)
        : null,
      ...linked.map(ref => fetchPr($, ref, state.views, null)),
    ])
    const fetched: Record<string, PrView> = {}
    for (const v of [...rest, branch]) if (v) fetched[v.ref] = v
    const branchRef = findsBranchPr ? (branch?.ref ?? null) : state.branchRef
    // A PR dismissed while the fetch ran stays dismissed.
    const [stillLinked, lastActions, now] = await Promise.all([
      read($, LEDGER).then(l => l.prs),
      read($, LAST_ACTIONS),
      $.clock.now(),
    ])
    const views = Object.fromEntries(
      Object.entries(fetched).filter(([ref]) => ref === branchRef || stillLinked.includes(ref)),
    )
    // A fetch queued behind this one keeps the tab checking, so it does not show "No PRs" in between.
    // A PR dismissed moments ago keeps its last view while its block shows settled.
    await update($, PR_VIEWS, v => ({
      views: {
        ...views,
        ...Object.fromEntries(
          Object.entries(v.views).filter(([ref]) => !(ref in views) && isDismissing(lastActions, ref, now)),
        ),
      },
      branchRef,
      isFetching: nextFetchFindsBranchPr !== null,
    }))
  } catch {
    await update($, PR_VIEWS, v => ({ ...v, isFetching: nextFetchFindsBranchPr !== null }))
  }
  void followNewRows($).catch(() => undefined)
}

/** The timed refresh, which runs only while the person is around and there is a PR to show or the PRs tab is open. */
async function pollPrs($: EngineInterface) {
  const [presence, ledger, prs, findsBranchPr] = await Promise.all([
    read($, PRESENCE),
    read($, LEDGER),
    read($, PR_VIEWS),
    isPrsTabShown($),
  ])
  if (presence.isAway || (!findsBranchPr && ledger.prs.length === 0 && prs.branchRef === null)) return
  await fetchPrs($, findsBranchPr)
}

/** Opens a URL in the browser. Returns why it could not, or null. */
async function openUrl($: EngineInterface, url: string): Promise<string | null> {
  const r = await $.process.run(['open', url])

  return r.exitCode === 0 ? null : r.stderr.trim() || `open exited ${r.exitCode}`
}

/** The id of a review thread's row, which also keys its last action. */
function prThreadId(pr: PrView, t: PrThread): string {
  return `${pr.ref} thread ${t.id}`
}

/** The id of a failing PR check's row. */
function prCheckId(pr: PrView, check: PrCheck): string {
  return `${pr.ref} check ${check.name}`
}

/**
 * Which PR rows the person handed to Claude. A thread stays sent until a
 * comment newer than the press, and one whose message failed to send never was.
 */
function handoffs(lastActions: Record<string, LastAction>): Handoffs {
  return {
    isThreadSent: (pr, t) => {
      const last = lastActions[prThreadId(pr, t)]

      return last?.kind === 'handoff' && last.delivery?.state !== 'failed' && last.at > ((t.reply ?? t).at ?? 0)
    },
  }
}

/** A PR the session still tracks: one it linked, or the current branch's. */
function isTracked(prState: PrViews, linked: string[], ref: string): boolean {
  return linked.includes(ref) || prState.branchRef === ref
}

/** A PR the person dismissed less than SETTLED_MS ago, whose block stays in place, settled, with Undo. */
function isDismissing(lastActions: Record<string, LastAction>, ref: string, now: number): boolean {
  const mark = lastActions[`pr:${ref}`]

  return mark?.action === 'pr-dismiss' && now - mark.at < SETTLED_MS
}

/** The PRs the tab draws: each one tracked, and each one just dismissed, which draws settled. */
function drawnPrs(
  prState: PrViews,
  linked: string[],
  lastActions: Record<string, LastAction>,
  now: number,
): { pr: PrView; isSettled: boolean }[] {
  return Object.values(prState.views).flatMap((pr): { pr: PrView; isSettled: boolean }[] =>
    isTracked(prState, linked, pr.ref)
      ? [{ pr, isSettled: false }]
      : isDismissing(lastActions, pr.ref, now)
        ? [{ pr, isSettled: true }]
        : [],
  )
}

/**
 * Drops a dismissed PR's view once the settled block of the Dismiss made `at`
 * has left. Not when Undo tracks the PR again, or a later Dismiss settles it
 * anew. The tab already leaves out a PR it no longer tracks, so a reload that
 * cancels this leaves only a view the next fetch drops.
 */
function leavePr($: EngineInterface, ref: string, at: number) {
  void $.clock
    .sleep(SETTLED_MS)
    .then(async () => {
      const [linked, mark] = await Promise.all([
        read($, LEDGER).then(l => l.prs),
        read($, LAST_ACTIONS).then(a => a[`pr:${ref}`]),
      ])
      if (mark?.action !== 'pr-dismiss' || mark.at !== at) return
      await update($, PR_VIEWS, v => {
        if (isTracked(v, linked, ref) || !(ref in v.views)) return v
        const { [ref]: _left, ...views } = v.views
        return { ...v, views }
      })
    })
    .catch(() => undefined)
}

/** A press on a PR block, one of its review threads, or a failing check's row. Only the mod has PRs. */
type PrPress =
  | { action: 'thread-address' | 'thread-draft' | 'thread-discuss' | 'thread-open'; ref: string; thread: string }
  | { action: 'pr-conflicts' | 'pr-address-all' | 'pr-open' | 'pr-dismiss' | 'pr-undo'; ref: string }
  | { action: 'log'; ref: string; check: string }

/**
 * A press's outcome as the runner applies it: the ledger after it, the last
 * action of each row it records on, the rows whose last action it removes, and
 * the effects to perform. `stale` when its row is gone or changed.
 */
type Applied =
  { ledger: Ledger; lasts: Record<string, LastAction>; drop: string[]; effects: Effect[] } | { stale: true }

/** The row a PR press was drawn on, which keys its last action and its note. */
function prRowId(p: PrPress): string {
  if (p.action === 'log') return `${p.ref} check ${p.check}`
  if ('thread' in p) return `${p.ref} thread ${p.thread}`

  return `pr:${p.ref}`
}

/**
 * The PR press [Try again] repeats on a thread or PR block whose message failed
 * to send, with its kind, or null. As `retryOf` does a row press.
 */
function prRetryOf(
  last: LastAction | undefined,
  ref: string,
  thread: string | null,
): { press: PrPress; kind: PressKind } | null {
  if (last?.delivery?.state !== 'failed') return null
  const a = last.action
  if (thread !== null && (a === 'thread-address' || a === 'thread-draft' || a === 'thread-discuss'))
    return { press: { action: a, ref, thread }, kind: last.kind }
  if (thread === null && (a === 'pr-conflicts' || a === 'pr-address-all'))
    return { press: { action: a, ref }, kind: last.kind }

  return null
}

/**
 * Applies a PR press, as `applyPress` does a row press. Pure. Stale when the PR
 * is no longer tracked or drawn, its thread or check is gone, or what the
 * press acts on is over: the PR no longer conflicts, or no thread waits on the
 * person. Undo is stale unless the PR's block still holds its Dismiss.
 */
function applyPrPress(
  ledger: Ledger,
  prState: PrViews,
  lastActions: Record<string, LastAction>,
  p: PrPress,
  ctx: { now: number; turnsStarted: number },
): Applied {
  const stale = { stale: true as const }
  const pr = prState.views[p.ref]
  const markId = `pr:${p.ref}`
  // Every row a sending press records on waits for the message to arrive.
  const applied = (a: Partial<Exclude<Applied, { stale: true }>>): Applied => {
    const effects = a.effects ?? []
    const lasts = Object.fromEntries(Object.entries(a.lasts ?? {}).map(([id, l]) => [id, withQueued(l, effects)]))

    return { ledger, drop: [], ...a, lasts, effects }
  }
  if (p.action === 'pr-undo') {
    // Like an item's Undo, it does not check the settle window, so a press just after it ends still lands.
    if (!pr || isTracked(prState, ledger.prs, p.ref) || lastActions[markId]?.action !== 'pr-dismiss') return stale
    return applied({ ledger: { ...ledger, prs: [...ledger.prs, p.ref].slice(-MAX_PRS) }, drop: [markId] })
  }
  if (!pr || !isTracked(prState, ledger.prs, p.ref)) return stale
  const record = (kind: 'talk' | 'handoff' | 'mark', action: PrActionId, text: string): LastAction => ({
    kind,
    action,
    text,
    at: ctx.now,
    turnsStarted: ctx.turnsStarted,
  })
  const send = (text: string): Effect => ({ kind: 'send', text, by: null })
  // An open is Local: its row keeps its last action, with the open's result on it.
  const open = (rowId: string, text: string, url: string, name: string): Applied => {
    const effects: Effect[] = [{ kind: 'open', target: url, name }]
    const result = pendingResult(effects, ctx.now)

    return applied({ lasts: { [rowId]: localLast(lastActions[rowId], { action: p.action, text }, result) }, effects })
  }
  switch (p.action) {
    case 'thread-address':
    case 'thread-draft':
    case 'thread-discuss':
    case 'thread-open': {
      const t = pr.threads.find(x => x.id === p.thread)
      if (!t) return stale
      const id = prThreadId(pr, t)
      if (p.action === 'thread-open') return open(id, 'Open', t.reply?.url || t.url || pr.url, 'the comment')
      if (p.action === 'thread-address')
        return applied({
          lasts: { [id]: record('handoff', p.action, 'Address') },
          effects: [send(prompts.address(pr, [t]))],
        })
      if (p.action === 'thread-draft')
        return applied({
          lasts: { [id]: record('talk', p.action, 'Draft reply') },
          effects: [send(prompts.draft(pr, t))],
        })
      return applied({ lasts: { [id]: record('talk', p.action, 'Discuss') }, effects: [send(prompts.discuss(pr, t))] })
    }
    case 'pr-conflicts':
      if (pr.state !== 'OPEN' || pr.mergeable !== 'CONFLICTING') return stale
      return applied({
        lasts: { [markId]: record('handoff', p.action, 'Resolve conflicts') },
        effects: [send(prompts.resolve(pr))],
      })
    case 'pr-address-all': {
      const waiting = threadsOnYou(pr, handoffs(lastActions))
      if (waiting.length === 0) return stale
      // Each thread it sends reads as if its own Address were pressed, so it folds too.
      const threads = waiting.map(t => [prThreadId(pr, t), record('handoff', 'thread-address', 'Address')])
      return applied({
        lasts: {
          [markId]: record('handoff', p.action, `Address all ${waiting.length} threads`),
          ...Object.fromEntries(threads),
        },
        effects: [send(prompts.address(pr, waiting))],
      })
    }
    case 'pr-open':
      return open(markId, 'Open PR', pr.url, `PR #${pr.number}`)
    case 'pr-dismiss':
      // The branch's PR has no Dismiss: the tab shows it while the branch has it.
      if (!ledger.prs.includes(p.ref) || prState.branchRef === p.ref) return stale
      // Its view stays, so its block settles in place until it leaves.
      return applied({
        ledger: { ...ledger, prs: ledger.prs.filter(r => r !== p.ref) },
        lasts: { [markId]: record('mark', p.action, 'Dismissed') },
      })
    case 'log': {
      const check = pr.checks.find(c => c.name === p.check)
      if (!check) return stale
      // A check with no log link opens the PR's page instead.
      return open(prCheckId(pr, check), 'Open log', check.url ?? pr.url, check.url ? 'the log' : `PR #${pr.number}`)
    }
  }
}

const COPY_FAILURES: Record<Extract<UiCopyResult, { isCopied: false }>['reason'], string> = {
  'no-surface': 'no app is attached',
  'no-clipboard': 'the clipboard did not take it',
  refused: 'another plugin refused it',
}

/** Opens a path or URL, or copies text, for a Local press. Returns why it could not, or null. */
async function perform(
  $: EngineInterface,
  e: Exclude<Effect, { kind: 'send' }>,
  surface: UiPressArgument['surface'],
): Promise<string | null> {
  try {
    if (e.kind === 'open')
      return await (/^[a-z][a-z\d+.-]*:\/\//i.test(e.target) ? openUrl($, e.target) : openPath($, e.target))
    const r = await $.ui.copy({ text: e.text, surface })
    return r.isCopied ? null : COPY_FAILURES[r.reason]
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/**
 * Runs a press from the pane, by click or key. A row press goes through
 * `applyPress` on the ledger, a PR press through `applyPrPress`. The row's last
 * action records it, then opens and copies run and their result replaces the
 * pending one on the row, then sends. A press whose row
 * is gone or changed sends nothing: the row, or the pane's status line, says so.
 */
async function runPress($: EngineInterface, p: RowPress | PrPress, surface: UiPressArgument['surface']) {
  // Undo is pressed on a row that just closed, and a PR block's actions on no row.
  const rowId = 'ref' in p ? prRowId(p) : p.id
  if (p.action !== 'undo' && !rowId.startsWith('pr:')) await keepPressedOpen($, rowId)
  if (await read($, DEMO)) return runDemoPress($, p)
  const [now, presence, lastActions, prState] = await Promise.all([
    $.clock.now(),
    read($, PRESENCE),
    read($, LAST_ACTIONS),
    read($, PR_VIEWS),
  ])
  const ctx = { now, turnsStarted: presence.turnsStarted }
  let applied = { stale: true } as Applied
  if ('ref' in p && p.action !== 'pr-dismiss' && p.action !== 'pr-undo') {
    applied = applyAnyPress(await read($, LEDGER), prState, lastActions, p, ctx)
  } else {
    if (!('ref' in p) && p.action === 'type') await update($, TYPING, t => (t === p.id ? null : t))
    // `update` may run the change again on a version miss; the last run's result is the one used.
    await commitLedger($, l => {
      applied = applyAnyPress(l, prState, lastActions, p, ctx)
      return 'stale' in applied ? l : applied.ledger
    })
  }

  const pressed = applied
  if ('stale' in pressed) {
    await Promise.all([
      update($, NOTES, n => ({ ...n, [rowId]: { note: 'stale' as const, at: now } })),
      'id' in p && p.action === 'type' ? update($, DRAFTS, d => ({ ...d, [p.id]: p.text })) : undefined,
    ])
    // The note shows for SETTLED_MS. Removing it then also redraws the pane.
    void $.clock
      .sleep(SETTLED_MS)
      .then(() =>
        update($, NOTES, n => {
          if (n[rowId]?.at !== now) return n
          const { [rowId]: _gone, ...rest } = n
          return rest
        }),
      )
      .catch(() => undefined)
    return
  }
  const lasts = Object.values(pressed.lasts)
  await Promise.all([
    lasts.length > 0 || pressed.drop.length > 0
      ? update($, LAST_ACTIONS, a => withLasts(a, pressed.lasts, pressed.drop))
      : undefined,
    // A press that went through replaces the row's note, and a sent reply its draft.
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
  // The sidebar line stops counting a handed-off row at once.
  if (lasts.some(l => l.kind === 'handoff')) void publishStatus($)
  if ('ref' in p && p.action === 'pr-dismiss') {
    redrawWhileLeaving($, SETTLED_MS)
    leavePr($, p.ref, now)
  }
  if (!('ref' in p) && p.action === 'undo') {
    // Claude was told of the close; with the id out of `told`, a second close of the row is reported too.
    told = { ...told, closed: told.closed.filter(id => id !== p.id) }
    await selectRestored($, p.id)
  }
  const errors: (string | null)[] = []
  for (const e of pressed.effects) if (e.kind !== 'send') errors.push(await perform($, e, surface))
  const pending = pressed.lasts[rowId]?.result
  if (pending?.state === 'pending') {
    const result = finishedResult(pending, errors, await $.clock.now())
    await update($, LAST_ACTIONS, a => withResult(a, rowId, pending.at, result))
    // A success note clears after SETTLED_MS. A fresh value is what redraws the pane then.
    if (result.state === 'done')
      void $.clock
        .sleep(SETTLED_MS)
        .then(() => update($, LAST_ACTIONS, a => ({ ...a })))
        .catch(() => undefined)
  }
  // A send that will not enter undoes the press, and the press's later sends stay unsent.
  for (const e of pressed.effects) {
    if (e.kind !== 'send') continue
    const sent = await send($, e.text, e.by)
    if ('entered' in sent) {
      if (sent.entered !== e.text) await awaitRewritten($, Object.keys(pressed.lasts), now, e.text, sent)
      continue
    }
    await undoUnsent($, p, Object.keys(pressed.lasts), now, sent.notSent)
    break
  }
}

/**
 * Has a press's rows wait for its prompt as another plugin rewrote it, since the
 * stored row carries that text. A row stored before the rewrite was known arrives here.
 */
async function awaitRewritten(
  $: EngineInterface,
  rows: string[],
  at: number,
  message: string,
  sent: Extract<Sent, { entered: string }>,
) {
  await update($, LAST_ACTIONS, a => {
    const moved = withRewrite(a, rows, at, message, sent.entered)

    return isStoredSince(sent.entered, sent.since) ? withArrival(moved, sent.entered) : moved
  })
  void publishStatus($)
}

/**
 * Undoes a press whose message will not reach Claude. Each row it recorded on
 * reads `Not sent: <reason>`, which unfolds a hand-off. An answer's question
 * opens again, and typed words go back into the row's draft unless a newer one
 * is there. Neither happens once a newer press replaced this one on the row, or its message arrived.
 */
async function undoUnsent($: EngineInterface, p: RowPress | PrPress, rows: string[], at: number, reason: string) {
  const lasts = await update($, LAST_ACTIONS, a => withFailure(a, rows, at, reason))
  if (!('ref' in p)) {
    const last = lasts[p.id]
    if (last?.at === at && last.delivery?.state === 'failed') {
      if (last.kind === 'mark') await commitLedger($, l => reopenOnFailure(l, p.id, at))
      if (p.action === 'type') await update($, DRAFTS, d => (d[p.id] ? d : { ...d, [p.id]: p.text }))
    }
  }
  void publishStatus($)
}

/** Applies a row press with `applyPress` or a PR press with `applyPrPress`. Pure. */
function applyAnyPress(
  ledger: Ledger,
  prState: PrViews,
  lastActions: Record<string, LastAction>,
  p: RowPress | PrPress,
  ctx: { now: number; turnsStarted: number },
): Applied {
  if ('ref' in p) return applyPrPress(ledger, prState, lastActions, p, ctx)
  const item = ledger.items.find(i => i.id === p.id)
  const r = applyPress(ledger, lastActions[p.id], p, {
    ...ctx,
    extraSteps: item ? itemPrSteps(item, prState, ledger.prs) : [],
  })
  if ('stale' in r) return r

  return { ledger: r.ledger, lasts: r.last ? { [p.id]: r.last } : {}, drop: [], effects: r.effects }
}

/** Last actions with a press's entries merged in and the ones it removes gone. */
function withLasts(
  lastActions: Record<string, LastAction>,
  lasts: Record<string, LastAction>,
  drop: string[],
): Record<string, LastAction> {
  return Object.fromEntries(Object.entries({ ...lastActions, ...lasts }).filter(([id]) => !drop.includes(id)))
}

/** Selects a row Undo brought back, in its own tab. */
async function selectRestored($: EngineInterface, id: string) {
  const ids = tabRowIds((await drawnState($)).view, [])
  const tab: Tab = ids.findings.includes(id) ? 'findings' : 'needsYou'
  const index = ids[tab].indexOf(id)
  if (index >= 0) await select($, tab, id, index)
}

/**
 * Runs a press on the demo's copy. It changes only the copy and performs
 * nothing: each send, open or copy becomes its row's sample note instead.
 * Rows still settle, fold, undo and show their ✓ on the copy.
 */
async function runDemoPress($: EngineInterface, p: RowPress | PrPress) {
  const now = await $.clock.now()
  const rowId = 'ref' in p ? prRowId(p) : p.id
  if (!('ref' in p) && p.action === 'type') await update($, TYPING, t => (t === p.id ? null : t))
  let applied = { stale: true } as Applied
  let isClosing = false
  await update($, DEMO, d => {
    if (!d) return d
    // The copy's own turn counts, so a sample hand-off folds by them.
    const r = applyAnyPress(d.ledger, d.prViews, d.lastActions, p, { now, turnsStarted: d.turns.turnsStarted })
    applied = r
    const { [rowId]: _replaced, ...notes } = d.notes
    if ('stale' in r) return { ...d, notes: { ...notes, [rowId]: { note: 'stale' as const, at: now } } }
    isClosing = hasNewClose(d.ledger, r.ledger) || ('ref' in p && p.action === 'pr-dismiss')
    // An open or copy records only its result, and the demo runs none, so its row keeps its last action.
    // A sample send goes nowhere, so nothing would ever clear its Queued.
    const lasts = Object.fromEntries(
      Object.entries(r.lasts).flatMap(([id, { delivery: _unsent, ...l }]) => (l.result === undefined ? [[id, l]] : [])),
    )

    return {
      ...d,
      ledger: r.ledger,
      lastActions: withLasts(d.lastActions, lasts, r.drop),
      notes: r.effects.length > 0 ? { ...notes, [rowId]: { note: 'sample' as const, at: now } } : notes,
    }
  })
  const pressed = applied
  if (!('ref' in p) && p.action === 'type')
    await update($, DRAFTS, d => {
      if ('stale' in pressed) return { ...d, [p.id]: p.text }
      const { [p.id]: _sent, ...rest } = d
      return rest
    })
  if (!('stale' in pressed) && !('ref' in p) && p.action === 'undo') await selectRestored($, p.id)
  // A fresh copy redraws the pane: once a note's SETTLED_MS ends, and at each step of a leave bar.
  if ('stale' in pressed || pressed.effects.length > 0)
    void $.clock
      .sleep(SETTLED_MS)
      .then(() => update($, DEMO, d => d && { ...d }))
      .catch(() => undefined)
  if (isClosing) redrawWhileLeaving($, SETTLED_MS)
}

type Action = {
  key: string
  label: string
  variant?: 'primary'
  dimColor?: boolean
  /**
   * What the press does. A Talk or Hand-off press leaves "✓ <label>"
   * on its row, so the person sees it went through, and a Hand-off folds the
   * row. A Local press shows "Opening x…" on its row, then its result. The
   * other kinds show themselves: the row closes, a field opens, or the screen changes.
   */
  kind: PressKind
  /**
   * Returns the press's work for its Button to return. A hot reload keeps work an `onPress`
   * returns and drops work it leaves running, so a returned press's result still lands.
   */
  onPress: (press: UiPressArgument) => void | Promise<void>
}

/** The steps that open the PRs the session tracks that an item's ask names. */
function itemPrSteps(item: Item, prState: PrViews, linked: string[]): HelpStep[] {
  const refs = prState.branchRef ? [...linked, prState.branchRef] : linked

  return prSteps(
    item,
    refs.map(ref => ({ ref, url: prState.views[ref]?.url ?? null })),
  )
}

/** A pane action with the key that presses it while the pane has focus, if it has one. */
type KeyAction = Action & { hotkey?: string }

// The keys of a question's options and a row's steps, lettered as a multiple-choice
// question letters them. The digits switch tabs, and the letters left out are the
// keys of a Needs you row's other actions and of moving the selection.
const CHOICE_KEYS = [...'abcfghilm']

/**
 * A question, task or finding's actions as the pane's keys. `keys` finish the
 * row: options and steps, the first 9 shown on letters, Done for a task and
 * Address for a finding. `more` are the other ways to respond: your own words,
 * Explain or Discuss, and Dismiss. Options past the fourth of a question with
 * more than 5 show only after [All N options], which `isAllShown` records.
 */
function rowKeyActions($: EngineInterface, r: RowView, isAllShown: boolean): { keys: KeyAction[]; more: KeyAction[] } {
  const { id, item, finding } = r
  const shown = r.actions.filter(a => isAllShown || !a.isFolded)
  const folded = r.actions.length - shown.length
  // [All N options] follows the last option shown.
  const lastOption = shown.map(a => a.press.action).lastIndexOf('answer')
  const keys: KeyAction[] = []
  const more: KeyAction[] = []
  // A press whose message failed to send leads with [Try again], which repeats it as its own kind.
  const retry = r.feedback?.is === 'notSent' ? r.feedback.retry : null
  if (retry)
    keys.push({
      key: `retry-${id}`,
      label: 'Try again',
      kind: r.actions.find(a => actionId(a.press) === actionId(retry))?.kind ?? 'talk',
      onPress: press => runPress($, retry, press.surface),
    })
  let letters = 0
  for (const [n, a] of shown.entries()) {
    const p = a.press
    const base = {
      label: a.label,
      kind: a.kind,
      onPress: (press: UiPressArgument) => runPress($, p, press.surface),
    }
    const lettered = () => (letters < CHOICE_KEYS.length ? { hotkey: CHOICE_KEYS[letters++]! } : {})
    if (p.action === 'answer' && item) {
      keys.push({
        ...base,
        ...lettered(),
        key: `answer-${id}-${item.options.indexOf(p.option)}`,
        ...(a.isPrimary ? { variant: 'primary' as const } : {}),
      })
      if (n === lastOption && folded > 0)
        keys.push({
          key: `all-options-${id}`,
          label: `All ${item.options.length} options`,
          kind: 'view',
          onPress: () => void update($, OPTIONS_SHOWN, s => (s.includes(id) ? s : [...s, id])),
        })
    } else if (p.action === 'step' && item) {
      keys.push({ ...base, ...lettered(), key: `help-${id}-${p.step}` })
    } else if (p.action === 'done') {
      keys.push({ ...base, key: `done-${id}`, hotkey: 'd' })
    } else if (p.action === 'address' && finding) {
      keys.push({ ...base, key: `address-${id}`, hotkey: 'a' })
    } else if (p.action === 'type') {
      // The press opens the field; sending from it is what records the reply.
      more.push({
        label: a.label,
        kind: 'view',
        key: `typekey-${id}`,
        hotkey: 't',
        onPress: () => void startTyping($, id),
      })
    } else if (p.action === 'explain' && item) {
      more.push({ ...base, key: `explain-${id}`, hotkey: 'e' })
    } else if (p.action === 'discuss' && finding) {
      more.push({ ...base, key: `discuss-${id}`, hotkey: 'e' })
    } else if (p.action === 'dismiss') {
      more.push({ ...base, key: finding ? `drop-${id}` : `dismiss-${id}`, hotkey: 'x' })
    }
  }

  return { keys, more }
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A closed item, or a closed finding by its title, as its list's Closed fold draws it. */
type ClosedLine = Pick<Closed, 'id' | 'ask' | 'at' | 'how' | 'outcome'>

/** The outcome as the pane shows it: "Dismissed", "Yes, renamed". */
function outcomeText(d: Pick<Closed, 'outcome'>): string {
  return capitalized(d.outcome)
}

/**
 * A PR's status line: a mark, and GitHub's colors, green ready, purple merged,
 * red closed and a gray draft. Blocked is amber, the color of what waits on someone.
 */
const PR_STATUSES: Record<PrStatus, { mark: string; tone: Tone | null }> = {
  ready: { mark: '✓', tone: 'done' },
  blocked: { mark: '◇', tone: 'needsYou' },
  draft: { mark: '◇', tone: null },
  merged: { mark: '◇', tone: 'findings' },
  closed: { mark: '◇', tone: 'error' },
}

/** A finding's kind as the Findings tab draws it: a mark before its name, both in the kind's tone. */
const FINDING_BADGES: Record<Finding['kind'], { label: string; mark: string; tone: Tone }> = {
  issue: { label: 'Issue', mark: '▲', tone: 'needsYou' },
  opportunity: { label: 'Opportunity', mark: '✦', tone: 'done' },
}

/**
 * What the band and the pane draw: the session's own state, or the samples
 * `/inbox demo` shows in its place.
 */
async function drawnState($: EngineInterface): Promise<DemoCopy & { view: InboxView; isDemo: boolean; now: number }> {
  const [ledger, stop, prViews, lastActions, notes, presence, demo, now] = await Promise.all([
    read($, LEDGER),
    read($, STOP),
    read($, PR_VIEWS),
    read($, LAST_ACTIONS),
    read($, NOTES),
    read($, PRESENCE),
    read($, DEMO),
    $.clock.now(),
  ])
  const turns = { turnsStarted: presence.turnsStarted, turnsApplied: presence.turnsApplied }
  const drawn = demo ?? { ledger, stop, prViews, lastActions, notes, turns }

  return { ...drawn, view: viewOf({ ...drawn, now }, presence), isDemo: demo !== null, now }
}

/** Shows the demo's sample entries on a fresh copy, or ends the demo. */
async function setDemo($: EngineInterface, isShown: boolean) {
  const now = await $.clock.now()
  await update($, DEMO, () => (isShown ? demoView(now) : null))
  // The open rows and the field name the other entries' ids, so each tab draws its top row open again.
  await Promise.all([update($, SELECTION, () => NO_SELECTION), update($, TYPING, () => null)])
  // The copy starts with a row that just closed, whose leave bar runs down.
  if (isShown) redrawWhileLeaving($, SETTLED_MS)
  // findPrs does nothing during the demo, so the real PRs tab looks up the branch's PR once it ends.
  if ((await read($, TAB)) === 'prs') await findPrs($)
  await followNewRows($, true)
}

/** Turns the mod on for this session, once, from the start or the desktop app's attach. */
async function turnOn($: EngineInterface) {
  // A hot reload keeps state an older build wrote. Draws start once isOn is set, and they read the current shape.
  await upgradeState($)
  isOn = true
  toolsRefused = false
  // A refused registration rejects. Each is caught on its own, so the mod still loads the conversation.
  const refused = () => {
    toolsRefused = true
  }
  await Promise.all([
    $.command.register({ name: 'inbox', description: 'Show where this session stands and what is waiting on you' }),
    $.tool
      .register({
        name: 'record_finding',
        description: findingDescription(CLAUDE_CODE),
        inputSchema: FINDING_SCHEMA,
      })
      .catch(refused),
    $.tool.register({ name: 'close', description: CLOSE_DESCRIPTION, inputSchema: CLOSE_SCHEMA }).catch(refused),
    syncTheme($),
  ])
  // A pane kept across a hot reload is already drawn.
  if (toolsRefused) await redrawPane($)
  $.clock.every(60_000, () => {
    void tick($)
  })
  $.clock.every(PR_POLL_MS, () => {
    void pollPrs($)
  })
  await loadConversation($, await $.session.id())
  // After loadConversation, which brings saved state up to date.
  await redrawAfterReload($)
}

/**
 * Loads the conversation `id` the session runs: at the start, and after
 * /clear, /resume or /branch, which switch conversations under a new session
 * id without a session.start.
 */
async function loadConversation($: EngineInterface, id: string) {
  sessionId = id
  root = await $.session.root()
  isSaved = false
  recordedRows = null
  unreadable = null
  // A reload stops any update the previous load had running, and state outlives
  // it, so an update in flight at load was cut off: record it as failed.
  const [git, presence, current, saved] = await Promise.all([
    $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: root, timeoutMs: 5000 }).catch(() => null),
    update($, PRESENCE, p => (p.isUpdating ? { ...p, isUpdating: false, ledgerState: 'failed' as const } : p)),
    upgradeState($),
    readSaved($, id),
  ])
  top = git?.exitCode === 0 ? git.stdout.trim() || null : null
  // Only a conversation with no turns loaded yet needs its saved copy, as a hot reload's does not.
  const isUnread = saved === null && current.turn === 0 && !current.card
  if (isUnread) {
    unreadable = { id, isReading: false }
    await redrawPane($)
  }
  const loaded = saved === null ? current : await bringBack($, current, saved.session)
  // Catch up now after a failed update; after a turn whose reply never reached
  // the ledger, as when a reload cut off the end-of-turn hook before it queued the
  // update; or when the ledger is empty in a conversation that already has turns:
  // the mod loaded mid-session, or its saved state was lost. A saved session the
  // store could not read is not lost, so [Try again] can still bring it back.
  const isEmpty = !loaded.card && loaded.items.length === 0
  const { turnsStarted, turnsApplied } = await read($, PRESENCE)
  if (
    presence.ledgerState !== 'current' ||
    turnsStarted > turnsApplied ||
    (!isUnread && isEmpty && (await $.session.turns().catch(() => 0)) > 0)
  )
    queueUpdate($, null)
  void publishStatus($)
  // A resumed session's linked PRs; the branch's PR waits for the PRs tab.
  if (loaded.prs.length > 0) void fetchPrs($, false)
}

type SavedSession = { savedAt: number; ledger: Ledger }

/** Conversation `id`'s saved session, `session` undefined when it has none; null when the store could not read it. */
async function readSaved($: EngineInterface, id: string): Promise<{ session: SavedSession | undefined } | null> {
  try {
    return { session: (await $.store.get(`s:${id}`)) as SavedSession | undefined }
  } catch {
    return null
  }
}

/**
 * Into a conversation with no turns yet, brings back its saved session, shown as
 * a return. Returns the ledger now in place.
 */
async function bringBack($: EngineInterface, current: Ledger, session: SavedSession | undefined): Promise<Ledger> {
  if (current.turn !== 0 || current.card || !session) return current
  const loaded = upgradeLedger(session.ledger)
  await update($, LEDGER, () => loaded)
  await update($, PRESENCE, p => ({ ...p, lastActiveAt: session.savedAt, isAway: true }))

  return loaded
}

/**
 * Puts the saved ledger in place of one built since the read failed, keeping the
 * prompt count of the turns since. The saved ledger reuses the replaced one's ids
 * for other rows, so updates queued on the replaced ledger are dropped, as is pane
 * state kept by id; the caller's catch-up covers their turns. What only the
 * replaced ledger held is lost.
 */
async function restore($: EngineInterface, current: Ledger, saved: Ledger): Promise<Ledger> {
  conversation += 1
  const loaded = upgradeLedger(saved)
  const [restored] = await Promise.all([
    update($, LEDGER, () => ({ ...loaded, turn: loaded.turn + current.turn })),
    forgetRowState($),
  ])

  return restored
}

/**
 * Forgets the pane state kept by row id, when another ledger takes the pane. Ids restart
 * at i1 in each ledger, so a kept id would open or unfold another row, or put one row's
 * words or note on another.
 */
async function forgetRowState($: EngineInterface) {
  await Promise.all([
    update($, SELECTION, () => NO_SELECTION),
    update($, TYPING, () => null),
    update($, UNFOLDED, () => []),
    update($, SHOWN_DETAILS, () => []),
    update($, OPTIONS_SHOWN, () => []),
    update($, DRAFTS, () => ({})),
    update($, NOTES, () => ({})),
    // Thread and `pr:` entries stay: the branch PR outlives the ledger, and isThreadSent reads them.
    update($, LAST_ACTIONS, a => Object.fromEntries(Object.entries(a).filter(([k]) => !/^[if]\d+$/.test(k)))),
  ])
  fieldSeeds.clear()
}

/** Reads the saved session again after the store could not, as [Try again] does, and brings it back. */
async function readAgain($: EngineInterface) {
  const failed = unreadable
  if (failed === null || failed.id !== sessionId || failed.isReading) return
  unreadable = { ...failed, isReading: true }
  await redrawPane($)
  const saved = await readSaved($, failed.id)
  // A conversation loaded meanwhile has its own read.
  if (sessionId !== failed.id) return
  unreadable = saved === null ? failed : null
  if (saved !== null) {
    const current = await read($, LEDGER)
    const hasRun = current.turn !== 0 || current.card !== null
    const loaded =
      hasRun && saved.session
        ? await restore($, current, saved.session.ledger)
        : await bringBack($, current, saved.session)
    if (
      (hasRun && saved.session) ||
      (!loaded.card && loaded.items.length === 0 && (await $.session.turns().catch(() => 0)) > 0)
    )
      queueUpdate($, null)
    void publishStatus($)
    if (loaded.prs.length > 0) void fetchPrs($, false)
    void followNewRows($).catch(() => undefined)
  }
  await redrawPane($)
}

/** Redraws the pane after a change only a module flag holds, which no draw subscribes to. */
function redrawPane($: EngineInterface) {
  return update($, SELECTION, s => ({ ...s }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // The desktop app runs its sessions headless and attaches to them, before
    // or after this start. -p, the SDK and VS Code draw nothing, so the mod stays off there.
    if (e.isInteractive || (await $.session.surfaces()).includes('desktop')) await turnOn($)

    return r
  })

  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    if (!isOn) await turnOn($)

    return next(e)
  })

  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    const r = await next(e)
    // $.session.id() still names the previous conversation here, so the new id comes
    // from the event. A start with --resume also raises this, for the conversation
    // session.start already loaded.
    if (isOn && e.session_id !== sessionId) await loadConversation($, e.session_id)

    return r
  })

  on('session.end', async ($, e, next) => {
    // The pane outlives the session, so its sidebar line goes with it.
    if (isOn) {
      await Promise.all([
        update($, STOP, () => null),
        update($, DIALOGS, () => []),
        update($, DEMO, () => null),
        publishStatus($, true),
      ])
    }
    // /clear, /resume and /branch (which reports resume) go on in this process with another conversation.
    if (isOn && (e.reason === 'clear' || e.reason === 'resume')) {
      conversation += 1
      await Promise.all([
        update($, LEDGER, () => EMPTY),
        forgetRowState($),
        update($, PRESENCE, p => ({ ...p, isAway: false, isUpdating: false, ledgerState: 'current' as const })),
      ])
      resetTurn()
      shellCommand = null
      told = TOLD_NOTHING
      contextFor.clear()
      storedAt.clear()
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!isOn) return next(e)
    const origin = e.origin
    // send() already recorded this mod's own prompts.
    if (origin.kind === 'plugin' && origin.name === 'inbox') return next(e)
    // The person's own words: typed, or sent as theirs by another plugin.
    const isPersonsWords =
      origin.kind === 'composer' || origin.kind === 'bridge' || (origin.kind === 'plugin' && origin.asUser === true)
    if (!isPersonsWords) {
      if (!e.turnId) trigger = origin.kind

      return next(e)
    }

    const notes = await notePrompt($, e.text, null)

    return notes.length === 0 ? next(e) : next({ ...e, context: [...(e.context ?? []), ...notes] })
  })

  on('turn.start', async ($, e, next) => {
    isTurnRunning = true
    // A turn that starts means the session runs again. Counted here, before the
    // turn can end, since a reload can cut off its end-of-turn hook.
    if (isOn)
      await Promise.all([setStop($, null), update($, PRESENCE, p => ({ ...p, turnsStarted: p.turnsStarted + 1 }))])

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    if (!isOn) return r

    return {
      ...r,
      sections: [...r.sections, { id: 'inbox:guidance', text: GUIDANCE, scope: 'session' as const }],
    }
  })

  // The finding tool is listed up front, needs no permission prompt, and is served here.
  on('tool.describe', { tool: FINDING_TOOL }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }))
  on('tool.check', { tool: FINDING_TOOL }, () => ({ decision: 'allow' }))
  on('tool.call', { tool: FINDING_TOOL }, async ($, e) => ({
    result: await runTool($, recordFinding, e as unknown as Record<string, unknown>),
  }))
  on('tool.describe', { tool: CLOSE_TOOL }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }))
  on('tool.check', { tool: CLOSE_TOOL }, () => ({ decision: 'allow' }))
  on('tool.call', { tool: CLOSE_TOOL }, async ($, e) => ({
    result: await runTool($, recordClose, e as unknown as Record<string, unknown>),
  }))

  on('tool.call', async ($, e, next) => {
    if (!isOn) return next(e)
    const { tool: _tool, tool_use_id: _id, agentId: _agent, ...input } = e as unknown as Record<string, unknown>
    const key = callKey(String(e.tool), input)
    const run = () => clearingDialog($, key, () => next(e))
    // A subagent's call can raise a permission prompt too, which the person answers.
    if (e.agentId) return run()
    const line = toolActivity(String(e.tool), input)
    if (line) noteActivity(line)
    if (e.tool === 'Bash') {
      const ran = await run()
      if (activity.length < 40)
        for (const url of new Set(ran.text?.match(LOCAL_URL) ?? [])) noteActivity(`URL in output: ${url}`)
      // A PR this session opened; other commands print PR links that are not this session's.
      if (/\bgh\s+pr\s+create\b/.test(e.command)) void linkPrs($, prRefs(ran.text ?? ''))

      return ran
    }
    if (e.tool === 'AskUserQuestion') {
      const questions = (Array.isArray(input.questions) ? input.questions : []) as { question?: unknown }[]
      const question = typeof questions[0]?.question === 'string' ? questions[0].question : 'A question'
      await openDialog($, { kind: 'question', text: question, key })
      // The answers come back in the tool result, never in a typed prompt, so
      // the ledger model only learns them from here.
      const ran = await run()
      noteActivity(dialogLine(ran.text ?? '', typeof resultFields(ran).afkTimeoutMs === 'number'))

      return ran
    }
    return run()
  })

  // A question dialog opens from its own tool call, which also raises a permission request.
  on('classic.PermissionRequest', async ($, e, next) => {
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

  on('classic.StopFailure', async ($, e, next) => {
    const r = await next(e)
    if (!isOn || e.agent_id) return r
    const message = e.last_assistant_message ?? ''
    await setStop($, {
      kind: stopKindOf(String(e.error), message),
      detail: String(e.error),
      resets: resetTime(message),
      at: await $.clock.now(),
    })

    return r
  })

  // A reply another Stop hook sent Claude back from never becomes the turn's
  // final answer, so it is kept for the per-reply update.
  on('classic.Stop', async ($, e, next) => {
    const r = await next(e)
    if (!isOn || e.agent_id) return r
    const reply = e.last_assistant_message ?? ''
    if (reply.trim() && r.block) sentBack.push(reply)

    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    isTurnRunning = false
    // No dialog outlives the turn that raised it.
    await closeDialogs($, null)
    if (!isOn) return r
    void followNewRows($).catch(() => undefined)
    if (e.reason !== 'answer' || e.answer.trim() === '') return r

    const [ledger, shown, now] = await Promise.all([read($, LEDGER), screen($), $.clock.now()])
    const reply = [...sentBack, e.answer].join('\n\n')
    const ex: Exchange = {
      person,
      trigger,
      activity,
      reply,
      turn: ledger.turn,
      press,
      screen: shown,
    }
    resetTurn()
    const { turnsStarted } = await update($, PRESENCE, p => ({ ...p, lastActiveAt: now }))
    queueUpdate($, { ex, turnsStarted })
    await linkPrs($, prRefs(reply))

    return r
  })

  on('prompt.context', async ($, e, next) => {
    const r = await next(e)
    if (!isOn) return r
    const text = carryText(
      await read($, LEDGER),
      'inbox: where this session stands, as of the last reply. An "inbox:" text beside a later prompt replaces this.',
      true,
    )

    return text ? { ...r, blocks: [...r.blocks, { name: 'inbox', text }] } : r
  })

  // A prompt this mod sent: its context goes in just before it, wherever the engine runs it.
  // Its row being stored is how the press that sent it learns it arrived.
  on(
    'session.append',
    { door: ['prompt', 'delivery'], origin: { kind: 'plugin', name: 'inbox' } },
    async ($, e, next) => {
      if (!isOn || e.agentId) return next(e)
      const text = messageText(e.message)
      storedAt.set(text, ++storedCount)
      const context = contextFor.get(text)
      contextFor.delete(text)
      if (context) await appendContext($, context)
      const r = await next(e)
      const isAwaited = Object.values(await read($, LAST_ACTIONS)).some(
        a => a.delivery?.state === 'queued' && a.delivery.message === text,
      )
      if (isAwaited) {
        await update($, LAST_ACTIONS, a => withArrival(a, text))
        void publishStatus($)
      }

      return r
    },
  )

  // The person's own `!` and slash commands reach no prompt.submit hook, only these rows.
  // The matcher keeps every other row from waking the hooks module.
  on('session.append', { door: 'command' }, async ($, e, next) => {
    const r = await next(e)
    if (!isOn || e.agentId) return r
    const row = readCommandRow(messageText(e.message))
    if (!row) return r
    const line = commandRowLine(row)
    if (line) notePerson(line)
    if (row.kind === 'shell') {
      shellCommand = row.command
    } else if (row.kind === 'output') {
      // The row has no exit code, so only a run with nothing on stderr closes a
      // task here. The ledger model judges the rest from the output.
      if (shellCommand && !row.stderr) await closeTasksRunBy($, shellCommand)
      shellCommand = null
    } else if (row.name === 'login' && (await read($, STOP))?.kind === 'sign-in') {
      await setStop($, null)
    }

    return r
  })

  on('command.run', { command: 'inbox' }, async ($, e) => {
    const isShown = (await read($, DEMO)) !== null
    if (e.args.trim() === 'demo') await setDemo($, !isShown)
    else if ((await read($, TAB)) === 'prs') await findPrs($)
    const isDemo = (await read($, DEMO)) !== null
    await showInbox($)

    return {
      text: isDemo ? 'Showing sample entries in the inbox. Run /inbox demo again to go back.' : 'Opened the inbox.',
    }
  })

  // A desktop press focuses its Button. One that closes a row leaves Undo in the Button's place, and Type opens a field.
  on('ui.press', async ($, e, next) => {
    if (e.requestId === PANE && e.surface === 'desktop') {
      focusedKey = e.element
      const id = e.element.split('-')[1]
      focusHint = /^(answer|done|dismiss|drop)-/.test(e.element)
        ? `undo-${id}`
        : e.element.startsWith('typekey-')
          ? `type-${id}`
          : null
    }
    return next(e)
  })

  // The desktop tab bar's Client posts the tab a click landed on, a closed row's Client a click on the row,
  // and a Closed fold's Client the fold state the click asks for.
  on('ui.message', async ($, e, next) => {
    const r = await next(e)
    if (e.requestId !== PANE) return r
    const data = e.data as { tab?: unknown; isUnfolded?: unknown } | null
    const shown = TABS.find(t => t.id === data?.tab)
    if (e.element === 'tabs' && shown) await showTab($, shown.id)
    else if (e.element.startsWith('select-')) await selectClicked($, e.element.slice('select-'.length))
    else if (e.element.startsWith('fold-')) await setFold($, e.element.slice('fold-'.length), data?.isUnfolded)

    return r
  })

  // A field left open would take the keys again when the pane reopens, as Esc in it closes the pane.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const r = await next(e)
    await update($, TYPING, () => null)

    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isOn || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const { ledger, stop, view, isDemo, now } = await drawnState($)
    if (!stop && !ledger.card && ledger.items.length === 0 && ledger.findings.length === 0) return next(e)
    const { count: waiting } = view.needsYou
    const { count: findings } = view.findings
    const counts = [
      waiting > 0 ? <Text color={NEEDS_YOU}>{waiting} need you</Text> : null,
      findings > 0 ? <Text dimColor>{findings === 1 ? '1 finding' : `${findings} findings`}</Text> : null,
    ].filter(p => p !== null)

    // Line 1: the counts, then [Open inbox] at the right end. On desktop a native button is taller than
    // a line of text, so the text sits level with its top. Sample counts could pass for real ones, so the demo says so.
    const countLine = (
      <Box flexDirection="row" alignItems="flex-start" gap={1}>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="truncate-end">
            {isDemo ? <Text dimColor>Demo: </Text> : null}
            {counts.length > 0 ? (
              counts.flatMap((p, n) => (n === 0 ? [p] : [<Text dimColor> · </Text>, p]))
            ) : (
              <Text dimColor>Nothing needs you</Text>
            )}
          </Text>
        </Box>
        {isDemo ? <Button key="hide-demo" label="Hide demo" onPress={() => void setDemo($, false)} /> : null}
        <Button key="open-inbox" label="Open inbox" onPress={() => void openInbox($)} />
      </Box>
    )
    if (!stop) return countLine

    // A stop draws under the counts, so [Open inbox] stays in place. An API error resumes from
    // [Resume], which keeps its key while it sends, so the desktop app keeps the band's focus.
    const isResumable = stop.kind === 'api-error'
    const notSent = isResumable && resuming?.is === 'refused' ? `Not sent: ${resuming.why}` : ''
    // On desktop, a stop line that wraps pushes [Resume] to the right edge, under [Open inbox], so a refusal takes its own row.
    const isNotSentOwnRow = notSent !== '' && e.surface === 'desktop' && e.props.maxRows > 2
    const fix = isResumable ? '' : stopFix(stop)
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
        {isResumable ? (
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
    const { Box, Button, Markdown, Text } = elements
    // Desktop draws every Button as a native button, and only clicks reach the pane: no letters, key hints or hidden hotkeys.
    const look = e.surface === 'desktop' ? 'desktop' : 'terminal'
    paneLook = look
    // The mobile app draws no text field, so there the typed reply is not offered; nor on desktop without DESKTOP_TYPING.
    const Input = 'Input' in elements && (look === 'terminal' || DESKTOP_TYPING) ? elements.Input : null
    // Narrow, the desktop pane puts its status under the tabs and drops closed rows' ages.
    const isNarrowDesktop = look === 'desktop' && e.props.bodyColumns < DESKTOP_WIDE_AT
    // Desktop wraps " · 12m ago" as one unit after a title, not as "12m" and "ago" on two lines.
    const unbroken = (after: string) => (look === 'desktop' ? ` ${after.trimStart().replaceAll(' ', ' ')}` : after)
    // Inline above the prompt, the pane takes its room from the conversation, so
    // it drops the section cards, the tab panels and the blank lines between parts.
    const isInline = e.props.placement === 'inline'
    const blankLine = isInline ? 0 : 1
    const [
      { ledger, prViews: prState, lastActions, notes, stop, view, isDemo, now },
      tab,
      selection,
      theme,
      typing,
      unfolded,
      isKeyListShown,
      shownDetails,
      arrival,
      optionsShown,
    ] = await Promise.all([
      drawnState($),
      read($, TAB),
      read($, SELECTION),
      read($, THEME),
      read($, TYPING),
      read($, UNFOLDED),
      read($, IS_KEY_LIST_SHOWN),
      read($, SHOWN_DETAILS),
      read($, ARRIVAL),
      read($, OPTIONS_SHOWN),
    ])
    // A hot reload keeps TYPING but empties fieldSeeds, so an open field takes its seed again here.
    if (typing !== null && !fieldSeeds.has(typing)) fieldSeeds.set(typing, (await read($, DRAFTS))[typing] ?? '')
    const shownPrs = drawnPrs(prState, ledger.prs, lastActions, now)
    const prViews = shownPrs.map(x => x.pr)
    const pal = PALETTES[theme] ?? THEME_KEY_PALETTE
    // `inverse: false` keeps the engine from inverting the line under the pointer inside the panel.
    const raise = {
      dimColor: false,
      backgroundColor: pal.raised,
      inverse: false,
      // A hover prop set to undefined is refused, so the color is left out when the palette has none.
      ...(pal.raisedText ? { color: pal.raisedText } : {}),
    }

    // One list row's content. Selected, a row shows its context line, its title
    // in full, its body and its keys; otherwise one line: `line`, or the title.
    type Row = {
      id: string
      handle: string
      /** A status color for a marker handle, such as a failing check's ✗. A Button takes no color, so this handle is Text and only the row's text selects it. */
      handleTone?: Tone
      meta?: JSX.Element
      title: string
      /** Muted text on the selected title's line, such as an age. */
      titleAfter?: string
      /** A line under the selected title. */
      subtitle?: JSX.Element
      /**
       * Unselected, the row is one line: `before` muted, `text` as a button that selects the row, then `after`, muted or
       * in a tone, then `age`, which a narrow desktop pane leaves out.
       */
      line?: { before?: string; text: string; after?: string; afterTone?: Tone; age?: string }
      /** Unselected, text that does not fit beside `after` goes on a second line instead of being cut. */
      hasSecondLine?: boolean
      body?: JSX.Element | null
      keys: () => KeyAction[]
      /** Actions that talk about the row or drop it, after `keys`: past a muted dot in the terminal, on their own line on desktop. */
      moreKeys?: () => KeyAction[]
      /** For a row that takes the person's own words: what its field says while empty. */
      typeHint?: string
      /** What sending those words does: closes a question, or hands a task or finding off. */
      typeKind?: PressKind
      /**
       * The row no longer waits on the person. Selected, it shows `line` and
       * `note`, with its body and keys behind Details, on `v`.
       */
      fold?: { line?: string; note?: string }
    }
    // An item's group header says whether it is a question or a task, so the row
    // needs no context line. The recommended answer is marked on its key.
    const itemRow = (r: RowView, item: Item): Row => {
      const asked = item.at === null ? undefined : ` · ${ago(now - item.at)}`
      // A task handed to Claude folds, as an answered question closes, until Claude's reply leaves it open.
      const isHandedOff = r.state.is === 'handedOff'

      return {
        id: item.id,
        handle: isHandedOff ? '✓' : r.handle,
        handleTone: isHandedOff ? 'done' : undefined,
        ...(isHandedOff ? { fold: {} } : {}),
        title: item.ask,
        titleAfter: asked,
        hasSecondLine: item.kind === 'question',
        body: null,
        keys: () => rowKeyActions($, r, optionsShown.includes(r.id)).keys,
        moreKeys: () => rowKeyActions($, r, optionsShown.includes(r.id)).more,
        typeHint: item.kind === 'task' ? 'Your reply to Claude' : 'Your answer',
        typeKind: item.kind === 'task' ? 'handoff' : 'mark',
      }
    }
    // A finding handed to Claude folds, as a task does, until Claude's reply leaves it open.
    const findingRow = (r: RowView, finding: Finding): Row => ({
      id: finding.id,
      handle: r.state.is === 'handedOff' ? '✓' : r.handle,
      ...(r.state.is === 'handedOff' ? { handleTone: 'done' as const, fold: {} } : {}),
      title: finding.title,
      meta: (
        <Text wrap="truncate-end">
          <Text color={pal.mark[FINDING_BADGES[finding.kind].tone]}>{FINDING_BADGES[finding.kind].mark} </Text>
          <Text color={pal.tone[FINDING_BADGES[finding.kind].tone]}>{FINDING_BADGES[finding.kind].label}</Text>
          <Text color={pal.muted}> {ago(now - finding.at)}</Text>
        </Text>
      ),
      line: { text: finding.title, age: ` · ${ago(now - finding.at)}` },
      body: (
        <Box flexDirection="column" rowGap={blankLine}>
          <Text wrap="wrap">{finding.detail}</Text>
          {finding.path ? (
            <Text wrap="wrap">
              <Text color={pal.muted}>Relevant file: </Text>
              {repoPath(finding.path)}
            </Text>
          ) : null}
        </Box>
      ),
      typeHint: 'Your reply to Claude',
      typeKind: 'handoff',
      keys: () => rowKeyActions($, r, true).keys,
      moreKeys: () => rowKeyActions($, r, true).more,
    })
    const handoff = handoffs(lastActions)
    // A PR action labeled "… again" once it was its row's last action, unless its message failed to send.
    const again = (rowId: string, action: PrActionId, label: string) =>
      lastActions[rowId]?.action === action && lastActions[rowId]?.delivery?.state !== 'failed'
        ? `${label} again`
        : label
    const prPress = (p: PrPress) => (press: UiPressArgument) => runPress($, p, press.surface)
    const checkRow = (pr: PrView, c: PrCheck): Row => ({
      id: prCheckId(pr, c),
      handle: '✗',
      handleTone: 'error',
      meta: (
        <Text color={pal.tone.error} bold>
          Failing check
        </Text>
      ),
      title: c.name,
      line: { text: c.name, after: ' · failing check', afterTone: 'error' },
      body: null,
      keys: () => [
        {
          key: `log-${pr.ref}-${c.name}`,
          label: 'Open log',
          hotkey: 'o',
          kind: 'local',
          onPress: prPress({ action: 'log', ref: pr.ref, check: c.name }),
        },
      ],
    })
    const threadRow = (pr: PrView, t: PrThread): Row => {
      const id = prThreadId(pr, t)
      const latest = t.reply ?? { author: t.author, body: t.body, at: t.at }
      const comment = (
        <Box flexDirection="column">
          {t.reply ? (
            <Text color={pal.muted} wrap="wrap">
              @{t.author}: {clipLabel(commentLine(t.body), 200)}
            </Text>
          ) : null}
          <Markdown text={`**@${latest.author}:** ${clipLabel(readableComment(latest.body), 1200)}`} />
        </Box>
      )
      // Sent to Claude, the thread folds to the first line of its latest comment,
      // until a comment newer than the send arrives. So does one on lines a later
      // commit changed, but with no ✓: nothing says the change fixed it.
      const isSent = handoff.isThreadSent(pr, t)
      const isChanged = !isSent && t.isLinesChanged

      return {
        id,
        handle: isSent ? '✓' : '◦',
        handleTone: isSent ? 'done' : undefined,
        ...(isSent || isChanged
          ? {
              fold: {
                line: `@${latest.author}: ${commentLine(latest.body)}`,
                ...(t.isLinesChanged ? { note: 'Lines changed since this comment · still open on GitHub' } : {}),
              },
            }
          : {}),
        meta: (
          <Text wrap="truncate-end">
            <Text color={pal.tone.prs} bold>
              Review thread
            </Text>
            <Text color={pal.muted}>
              {t.at === null ? '' : ` ${ago(now - t.at)}`}
              {t.replies > 0 ? ` · ${t.replies + 1} comments` : ''}
              {t.isOutdated ? ' · outdated' : ''}
            </Text>
          </Text>
        ),
        title: threadWhere(t),
        line: {
          before: `${threadWhere(t, baseName(t.path))} `,
          text: commentLine(latest.body),
          ...(isChanged ? { after: ' · lines changed' } : t.at === null ? {} : { age: ` · ${ago(now - t.at)}` }),
        },
        body: comment,
        keys: () => [
          ...[prRetryOf(lastActions[id], pr.ref, t.id)].flatMap(retry =>
            retry
              ? [{ key: `retry-${t.id}`, label: 'Try again', kind: retry.kind, onPress: prPress(retry.press) }]
              : [],
          ),
          {
            key: `address-${t.id}`,
            label: again(id, 'thread-address', 'Address'),
            hotkey: 'a',
            kind: 'handoff',
            onPress: prPress({ action: 'thread-address', ref: pr.ref, thread: t.id }),
          },
          {
            key: `draft-${t.id}`,
            label: again(id, 'thread-draft', 'Draft reply'),
            hotkey: 'r',
            kind: 'talk',
            onPress: prPress({ action: 'thread-draft', ref: pr.ref, thread: t.id }),
          },
          {
            key: `open-${t.id}`,
            label: 'Open',
            hotkey: 'o',
            kind: 'local',
            onPress: prPress({ action: 'thread-open', ref: pr.ref, thread: t.id }),
          },
        ],
        moreKeys: () => [
          {
            key: `discuss-${t.id}`,
            label: again(id, 'thread-discuss', 'Discuss'),
            hotkey: 'e',
            kind: 'talk',
            onPress: prPress({ action: 'thread-discuss', ref: pr.ref, thread: t.id }),
          },
        ],
      }
    }

    // Each list's entries in order: a row, or a row that just closed, which stays in its place and cannot be selected.
    type Entry = { row: Row } | { settled: RowView; state: Extract<RowState, { is: 'settled' }> }
    const entriesOf = (list: RowView[], toRow: (r: RowView) => Row | null): Entry[] =>
      list.flatMap((r): Entry[] => {
        if (r.state.is === 'settled') return [{ settled: r, state: r.state }]
        const row = toRow(r)
        return row ? [{ row }] : []
      })
    const rowsOf = (entries: Entry[]) => entries.flatMap(x => ('row' in x ? [x.row] : []))
    // Each tab's rows in order: the cursor, the counts and the drawing all read these.
    const needsYouGroups = NEEDS_YOU_GROUPS.map(g => {
      const entries = entriesOf(view.needsYou[g.list], r => (r.item ? itemRow(r, r.item) : null))
      return { ...g, entries, rows: rowsOf(entries) }
    })
    const findingEntries = entriesOf(view.findings.rows, r => (r.finding ? findingRow(r, r.finding) : null))
    // A PR dismissed moments ago draws settled, with no rows.
    const prGroups = shownPrs.map(({ pr, isSettled }) => ({
      pr,
      isSettled,
      rows: isSettled
        ? []
        : [...failingChecks(pr).map(c => checkRow(pr, c)), ...waitingThreads(pr).map(t => threadRow(pr, t))],
    }))
    const rows: Record<Tab, Row[]> = {
      needsYou: needsYouGroups.flatMap(g => g.rows),
      findings: rowsOf(findingEntries),
      prs: prGroups.flatMap(g => g.rows),
    }
    // What waits on the person: rows, or on the PRs tab, PRs. A row handed to Claude waits on Claude.
    const tabCounts: Record<Tab, number> = {
      needsYou: view.needsYou.count,
      findings: view.findings.count,
      prs: prGroups.filter(g => !g.isSettled && prNeedsYou(g.pr, handoff)).length,
    }
    const ids = rows[tab].map(r => r.id)
    const indexOf = new Map(ids.map((id, n) => [id, n]))
    const cursor = selection[tab]
    const at = selectedIndex(ids, cursor, topRow(tab, ids, view))
    // The open row's buttons ignore clicks for a moment after it opens, and draw dim meanwhile.
    const isOpenGuarded = isGuarded(cursor.openedAt, now)
    const isNew = (id: string) => arrival !== null && arrival.ids.includes(id) && now - arrival.at < NEW_ROW_MS

    // A Button draws its hotkey in the theme's accent, which Claude Code's light
    // theme draws at 2.9:1 on the selected row. So a key's letter is Text in the
    // palette's color, its label a Button, and the key itself a hidden Button.
    // Both invert while the pointer is over either, so the letter lights with its label.
    // A hover cannot name the terminal's default color, which a Button's label
    // inverts, so the letter and the label both invert the muted color to match.
    // An action past the lettered ones, or one that only changes the view, has no key and draws its label alone.
    // While the open row is guarded, both draw dim and a click does nothing. Its key, a hidden Button, works at once.
    // On desktop an action is its native button alone. The recommended option's label ends "(recommended)" in every
    // look. A plain terminal Button ignores `variant`, so there the words are the only mark. Desktop also draws the
    // option as its primary button.
    const shownLabel = (a: Pick<KeyAction, 'label' | 'variant'>) =>
      a.variant === 'primary' ? `${a.label} (recommended)` : a.label
    const keyedButton =
      (rowId: string) =>
      ({ hotkey, kind: _kind, ...action }: KeyAction) =>
        look === 'desktop' ? (
          <Button
            {...action}
            label={shownLabel(action)}
            {...(isOpenGuarded ? { dimColor: true } : {})}
            onPress={press => unlessGuarded($, rowId, press, action.onPress)}
          />
        ) : (
          <Box key={`keyed-${action.key}`} flexDirection="row">
            {hotkey ? (
              <Text color={pal.key} dimColor={isOpenGuarded} hover={{ color: pal.muted, inverse: true }}>
                {hotkey}
              </Text>
            ) : null}
            <Button
              plain
              {...action}
              {...(isOpenGuarded ? { dimColor: true } : {})}
              label={hotkey ? `: ${shownLabel(action)}` : shownLabel(action)}
              hover={{ color: pal.muted, inverse: true }}
              onPress={press => unlessGuarded($, rowId, press, action.onPress)}
            />
          </Box>
        )
    // The open row's actions. In the terminal its other actions can follow its main ones after a muted dot.
    const keyRow = (rowId: string, keys: KeyAction[], more: KeyAction[] = []) => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={look === 'desktop' ? 1 : 0}>
        {keys.map(keyedButton(rowId))}
        {keys.length > 0 && more.length > 0 ? <Text color={pal.muted}>·</Text> : null}
        {more.map(keyedButton(rowId))}
      </Box>
    )
    // The Buttons that take the pane's keys, drawn in a hidden Box.
    const keyBindings = (keys: KeyAction[], suffix = '') =>
      keys.flatMap(({ key, hotkey, kind: _kind, ...k }) =>
        hotkey ? [<Button key={`${key}${suffix}`} plain hotkey={hotkey} {...k} label={shownLabel(k)} />] : [],
      )
    // In the terminal, a selected row's secondary keys share its key row when they fit, and
    // otherwise take a line of their own rather than wrap mid-row. A key draws
    // "key: label", and keyRow puts 2 columns between keys and the dot.
    const keysWidth = (keys: KeyAction[], more: KeyAction[]) => {
      const all = [...keys, ...more]
      const dot = keys.length > 0 && more.length > 0 ? 3 : 0

      return (
        all.reduce((w, k) => w + (k.hotkey ? k.hotkey.length + 2 : 0) + shownLabel(k).length, 0) +
        2 * Math.max(0, all.length - 1) +
        dot
      )
    }
    // A typed reply needs a text field, so it is left out where there is none.
    const pressable = (keys: KeyAction[]) => keys.filter(k => Input || !k.key.startsWith('typekey-'))
    const toggleDetails = (id: string) =>
      void update($, SHOWN_DETAILS, s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))
    // Under a just-closed row, a thin bar that empties as its time in place runs out.
    // ─ is a light line across a cell and ╴ across its left half, so the bar shrinks by half cells.
    const leaveBar = (at: number) => {
      const halves = Math.ceil((Math.max(0, SETTLED_MS - (now - at)) / SETTLED_MS) * LEAVE_BAR_STEPS)

      return halves > 0 && look === 'terminal' ? (
        <Text color={pal.mark.done}>{'─'.repeat(Math.floor(halves / 2)) + (halves % 2 ? '╴' : '')}</Text>
      ) : null
    }
    // A folded row offers only Details, which shows its body and its keys.
    const detailsKey = (row: Row): KeyAction => ({
      key: `fold-details-${row.id}`,
      label: shownDetails.includes(row.id) ? 'Hide details' : 'Details',
      hotkey: 'v',
      kind: 'view',
      onPress: () => toggleDetails(row.id),
    })
    // The selected row's keys, for both the key row it draws and the hidden bindings.
    const rowActions = (row: Row): { keys: KeyAction[]; more: KeyAction[] } => {
      if (row.fold && !shownDetails.includes(row.id)) return { keys: [detailsKey(row)], more: [] }
      const keys = pressable(row.keys())
      const more = pressable(row.moreKeys?.() ?? [])

      return row.fold ? { keys, more: [...more, detailsKey(row)] } : { keys, more }
    }
    // Under the open field: Send sends the row's draft, and Cancel closes the field and keeps the draft.
    const fieldActions = (row: Row): KeyAction[] => [
      {
        key: `send-${row.id}`,
        label: 'Send',
        kind: row.typeKind ?? 'handoff',
        onPress: press => sendDraft($, row.id, press.surface),
      },
      {
        key: `cancel-${row.id}`,
        label: 'Cancel',
        kind: 'view',
        onPress: () => void update($, TYPING, t => (t === row.id ? null : t)),
      },
    ]
    // A last action is green only on a row that shows a ✓, as a folded review thread
    // does. On a row still open it is muted, so it does not read as an answer.
    const lastTone = (row: Row) => (row.handleTone === 'done' ? ('done' as const) : undefined)
    // A last action reads "✓ Discuss · 1m ago", or "Queued: Discuss · 1m ago". A row whose own mark is a ✓
    // leaves out the second one. A note and a Local result read alone, with no age. A failure is red.
    const feedbackLabel = (id: string, row?: Row) => {
      const f = feedbackOf(id, lastActions[id], notes[id], now)
      if (!f) return null

      return hasAge(f)
        ? {
            text: f.is === 'done' && row && lastTone(row) ? f.label : feedbackText(f, look),
            age: ago(now - f.at),
            isFailure: false,
            isQueued: f.is === 'queued',
          }
        : { text: feedbackText(f, look), age: '', isFailure: isFailure(f), isQueued: false }
    }
    const lastActionText = (id: string, row?: Row) => {
      const f = feedbackLabel(id, row)

      return f
        ? { text: [f.text, f.age].filter(Boolean).join(' · '), isFailure: f.isFailure, isQueued: f.isQueued }
        : null
    }
    // A section's children hang from its title like a directory listing. A
    // child's row has a 1-column bar, 3 columns for the tree, 3 for its marker,
    // then its text. `branch` draws the tree: ├─ on the child's first line, or
    // └─ on the last child's, then │ below while siblings follow; `pass` is │
    // throughout, for a block between a title and its children. The lines sit
    // in an absolute Box that spans the row, however it wraps, and the row clips
    // the rest. The row clips, not this Box: once its row scrolled out of view,
    // Claude Code drew lines this Box clipped elsewhere in the pane (anthropics/claude-code#100030).
    // Desktop draws no tree: its lines differ in height, so stacked glyphs break into separate bars.
    const branch = (pos: TreePos, lead = 0, left = 1) =>
      look === 'desktop' ? null : (
        <Box position="absolute" top={0} bottom={0} left={left} width={2}>
          <Text color={pal.line}>{treeText(pos, lead)}</Text>
        </Box>
      )
    // A row with no marker, such as a group's empty line, starts its text right after the tree.
    // A row at depth 1 hangs from a tree under the marker column, as a group's closed items do.
    const treeRow = (
      pos: TreePos | null,
      marker: JSX.Element | null,
      content: JSX.Element,
      key?: string,
      depth = 0,
    ) => (
      <Box key={key} flexDirection="row" alignItems="flex-start" overflow="hidden">
        <Box width={4 + 3 * depth} flexShrink={0} />
        {marker ? (
          <Box width={3} flexShrink={0}>
            {marker}
          </Box>
        ) : null}
        <Box flexDirection="column" flexShrink={1} flexGrow={1} paddingRight={1}>
          {content}
        </Box>
        {pos ? branch(pos, 0, 1 + 3 * depth) : null}
      </Box>
    )
    const childPos = (n: number, count: number): TreePos => (n === count - 1 ? 'last' : 'mid')
    // A list's rows with a divider between each two. It starts where the rows'
    // text starts and runs to the pane's edge; in a section, the tree's │ passes it.
    // A divider line from `inset` columns in to the pane's edge.
    const rule = (inset: number) => (
      <Text color={pal.divider}>{'─'.repeat(Math.max(0, e.props.bodyColumns - inset))}</Text>
    )
    // Desktop draws text in a proportional font, where a run of ─ sized in cells overflows the
    // row and wraps into a second line, so rows there are set apart by a blank line instead.
    const divided = (rowEls: JSX.Element[], group: string, isTree: boolean) =>
      rowEls.flatMap((el, n) =>
        n === 0 || isInline
          ? [el]
          : [
              look === 'desktop' ? (
                <Box key={`divider-${group}-${n}`} height={1} />
              ) : isTree ? (
                <Box key={`divider-${group}-${n}`} flexDirection="row">
                  <Box width={1} flexShrink={0} />
                  <Box width={6} flexShrink={0}>
                    <Text color={pal.line}>│</Text>
                  </Box>
                  {rule(9)}
                </Box>
              ) : (
                <Box key={`divider-${group}-${n}`} paddingLeft={5}>
                  {rule(7)}
                </Box>
              ),
              el,
            ],
      )
    // A desktop native button is assumed to draw about 2 columns wider than its label.
    const buttonFrame = look === 'desktop' ? 2 : 0
    // Desktop wraps a `truncate-end` Text too, so a line that must stay one line, `inset`
    // columns in, is clipped here. The fold line clips in both looks, at one character
    // per cell in the terminal, so both end it the same way.
    const clipLine = (text: string, inset: number) =>
      clipLabel(
        text,
        Math.max(
          12,
          Math.floor((e.props.bodyColumns - 3 - inset) * (look === 'desktop' ? DESKTOP_CLIP_CHARS_PER_CELL : 1)) - 1,
        ),
      )
    // The terminal truncates the settled ask itself.
    const oneLine = (text: string, inset: number) => (look === 'desktop' ? clipLine(text, inset) : text)
    // A closed row's one line: `before` muted, the title, then `after`. A row's last action takes the place of
    // its age, as "✓ Discuss 1m ago". A narrow desktop pane drops the age, not the action.
    const closedLine = (row: Row) => {
      const plain = row.line ?? { text: row.title, age: row.titleAfter }
      const f = feedbackLabel(row.id, row)

      return f
        ? {
            ...plain,
            after: ` · ${[f.text, isNarrowDesktop ? '' : f.age].filter(Boolean).join(' ')}`,
            // A message still queued is muted: nothing has reached Claude yet.
            afterTone: f.isFailure ? ('error' as const) : f.age && !f.isQueued ? lastTone(row) : undefined,
          }
        : { ...plain, after: [plain.after, isNarrowDesktop ? '' : plain.age].filter(Boolean).join('') || undefined }
    }
    // The selected row gets a blue background, or a bar where the palette has
    // no selection color, and reads top to bottom:
    // context line, title, body, keys. In the docked pane a blank line sets each
    // part off. In the terminal the handle is a Button that selects the row. On desktop the whole row is a
    // Client that does, or without one, the title button.
    // A Button label does not wrap or truncate, so the clickable text is clipped
    // to what fits beside the handle and the row's other text, less a desktop button's frame.
    // A row with a second line breaks its text at a space before `after`, which
    // stays on the first line, and clips the rest to the second.
    const unselectedLine = (row: Row, onPress: (press: UiPressArgument) => void, inset: number) => {
      const line = closedLine(row)
      const before = line.before?.length ?? 0
      const width = e.props.bodyColumns - 3 - inset - before
      const perCell = look === 'desktop' ? DESKTOP_CHARS_PER_CELL : 1
      // `before` is text, so it counts in characters, as the title does.
      const budget = Math.floor((e.props.bodyColumns - 3 - inset - buttonFrame) * perCell) - before
      const room = Math.max(12, budget - (line.after?.length ?? 0))
      const text = line.text.trim()
      const space = text.lastIndexOf(' ', room)
      // Desktop cuts the title to one native button, rather than draw two.
      const isWrapped = look === 'terminal' && row.hasSecondLine === true && text.length > room && space > 0
      const first = isWrapped ? text.slice(0, space) : clipLabel(text, room)
      const second = isWrapped ? clipLabel(text.slice(space + 1), Math.max(12, width)) : null
      // Desktop wraps a long `after` under the title, so it is cut to the room the title leaves.
      const afterRoom = budget - first.length
      const after =
        look === 'desktop' && line.after && line.after.length > afterRoom
          ? afterRoom >= 2
            ? clipLabel(line.after, afterRoom)
            : undefined
          : line.after
      // The two lines are two Buttons. One hover group inverts both under the pointer, so they read as one.
      const hover = second ? { hover: { scope: `title-${row.id}`.slice(0, 64), inverse: true } } : {}

      return (
        <Box flexDirection="column">
          {/* Only `after` shrinks when the line is too long: a shrunk `before` would wrap mid-path. */}
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
        </Box>
      )
    }
    // A closed desktop row drawn by its Client, at the columns listRow draws an open row's handle and text.
    const rowClientProps = (row: Row, tree?: TreePos): RowProps => {
      const line = closedLine(row)

      return {
        handleAt: tree ? 4 : 3,
        textAt: tree ? 7 : 5,
        handle: row.handle,
        before: line.before ?? '',
        title: line.text.trim(),
        after: line.after ? unbroken(line.after) : '',
        maxLines: row.hasSecondLine ? 2 : 1,
        charsPerCell: DESKTOP_CLIP_CHARS_PER_CELL,
        // The list pads the pane by a column on each side.
        fallbackColumns: e.props.bodyColumns - 2,
        newBar: isNew(row.id) ? pal.mark[tab] : null,
        colors: {
          handle: row.handleTone ? pal.mark[row.handleTone] : null,
          muted: pal.muted,
          after: line.afterTone ? (pal.tone[line.afterTone] ?? null) : pal.muted,
          hover: pal.raised,
          hoverText: pal.raisedText ?? null,
          pressed: pal.selection ?? pal.raised,
        },
      }
    }
    // `tree` places the row as a section's child; without it, as in Findings, the
    // handle sits in the 4 columns after the bar.
    const listRow = (row: Row, tree?: TreePos) => {
      const index = indexOf.get(row.id) ?? -1
      const isSelected = index === at
      // On desktop a Client takes a click on every cell of the row, where a Button takes one only on its label.
      // Without one, the row's title is a Button.
      if (!isSelected && look === 'desktop' && 'Client' in elements)
        return (
          <Box key={`row-${row.id}`} flexDirection="row" overflow="hidden">
            <elements.Client
              key={`select-${row.id}`}
              module="./row-client.tsx"
              width="100%"
              props={rowClientProps(row, tree)}
            />
          </Box>
        )
      const { keys, more } = isSelected ? rowActions(row) : { keys: [], more: [] }
      const isOpen = !row.fold || shownDetails.includes(row.id)
      const lastText = lastActionText(row.id, row)
      const tone = lastTone(row) ? pal.tone.done : pal.muted
      const status = [
        ...(row.fold?.note ? [{ text: row.fold.note, color: pal.muted }] : []),
        ...(lastText
          ? [
              {
                text: lastText.text,
                color: lastText.isFailure ? pal.tone.error : lastText.isQueued ? pal.muted : tone,
              },
            ]
          : []),
      ]

      return (
        <Box
          key={`row-${row.id}`}
          flexDirection="row"
          alignItems="flex-start"
          overflow="hidden"
          backgroundColor={isSelected ? pal.selection : undefined}
        >
          <Box width={1} flexShrink={0} />
          {tree ? <Box width={3} flexShrink={0} /> : null}
          <Box width={tree ? 3 : 4} flexShrink={0} paddingLeft={tree ? 0 : 2} paddingY={isSelected ? blankLine : 0}>
            {/* Without a Client, desktop's title alone opens the row, so the list draws half as many native buttons. */}
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
            <Box flexDirection="column" flexShrink={1} flexGrow={1} paddingRight={1} paddingY={blankLine}>
              {row.meta}
              <Text wrap="wrap">
                <Text bold>{row.title}</Text>
                {row.titleAfter ? <Text color={pal.muted}>{unbroken(row.titleAfter)}</Text> : null}
              </Text>
              {row.subtitle}
              {isOpen && row.body ? <Box marginTop={blankLine}>{row.body}</Box> : null}
              {!isOpen && row.fold?.line ? (
                <Box marginTop={blankLine}>
                  <Text wrap="truncate-end" color={pal.muted}>
                    {clipLine(row.fold.line, tree ? 7 : 5)}
                  </Text>
                </Box>
              ) : null}
              {status.length > 0 ? (
                <Box flexDirection="column" marginTop={blankLine}>
                  {status.map(s => (
                    <Text color={s.color} wrap="wrap">
                      {s.text}
                    </Text>
                  ))}
                </Box>
              ) : null}
              <Box flexDirection="column" marginTop={blankLine}>
                {/* Desktop drops the dot between groups: a Text among taller native buttons sits at their top edge. */}
                {look === 'desktop'
                  ? [keys, more]
                      .filter(group => group.length > 0)
                      .map((group, n) => <Box marginTop={n > 0 ? 2 : 0}>{keyRow(row.id, group)}</Box>)
                  : keys.length === 0
                    ? keyRow(row.id, more)
                    : keysWidth(keys, more) <= e.props.bodyColumns - 3 - (tree ? 7 : 5)
                      ? keyRow(row.id, keys, more)
                      : [keyRow(row.id, keys), keyRow(row.id, more)]}
              </Box>
              {Input && row.typeHint && typing === row.id ? (
                <Box marginTop={blankLine}>
                  <Input
                    key={`type-${row.id}`}
                    placeholder={row.typeHint}
                    {...(fieldSeeds.get(row.id) ? { value: fieldSeeds.get(row.id) } : {})}
                    submitLabel="send"
                    autoFocus
                    onInput={(value: string) => void update($, DRAFTS, d => ({ ...d, [row.id]: value }))}
                    onSubmit={(value: string, e) => sendTyped($, row.id, value, e.surface)}
                  />
                </Box>
              ) : null}
              {Input && row.typeHint && typing === row.id ? keyRow(row.id, fieldActions(row)) : null}
            </Box>
          ) : (
            <Box flexShrink={1} flexGrow={1} paddingRight={1}>
              {unselectedLine(
                row,
                // Opening the row draws its title as Text, so the title's Button leaves.
                () => void select($, tab, row.id, index),
                tree ? 7 : 5,
              )}
            </Box>
          )}
          {tree ? branch(tree, isSelected ? blankLine : 0) : null}
          {/* What select() scrolls into view. Drawn on the selected row alone, so the key exists
          only once that row has redrawn expanded. */}
          {isSelected ? (
            <Box key={`view-${row.id}`} position="absolute" top={0} bottom={0} left={0} width={1}>
              {pal.selection || isNew(row.id) ? null : <Text color={pal.key}>{SELECTION_BAR}</Text>}
            </Box>
          ) : null}
          {/* A row that just appeared takes a bar in its tab's color, in every theme, for NEW_ROW_MS. */}
          {isNew(row.id) ? (
            <Box key={`new-${row.id}`} position="absolute" top={0} bottom={0} left={0} width={1}>
              <Text color={pal.mark[tab]}>{SELECTION_BAR}</Text>
            </Box>
          ) : null}
        </Box>
      )
    }
    // An empty tab names what would be there and when it comes. Docked, it sits in
    // the middle of the pane, one Text per line, since a Text cannot center its lines.
    // The lines are balanced: as narrow as they can be without adding a line.
    const emptyState = (title: string, text = '') => {
      const wrap = (width: number) => {
        const lines: string[] = []
        for (const word of text.split(' ').filter(Boolean)) {
          const last = lines.at(-1)
          if (last !== undefined && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`
          else lines.push(word)
        }

        return lines
      }
      const room = e.props.bodyColumns - 6
      const most = Math.min(46, look === 'desktop' ? Math.floor(room * DESKTOP_CHARS_PER_CELL) : room)
      const count = wrap(most).length
      let width = Math.ceil(text.length / Math.max(count, 1))
      while (width < most && wrap(width).length > count) width++
      const lines = wrap(width)
      const align = isInline ? 'flex-start' : 'center'

      // The title and lines center as one block, so rounding cannot widen the gap between them.
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

    // The PRs tab shows when its PRs were checked; the other tabs, the item status.
    const newest = prViews.reduce((t, v) => Math.max(t, v.fetchedAt), 0)
    const isPrStatus = tab === 'prs' && prViews.length > 0
    const { changedAt, isUpdating, error } = view.status
    const status = isPrStatus
      ? prState.isFetching
        ? 'Refreshing PRs'
        : `PRs checked ${ago(now - newest)}`
      : isUpdating
        ? 'Updating…'
        : changedAt !== null
          ? `Updated ${ago(now - changedAt)}`
          : 'Not updated yet'

    // A note on a row the pane no longer draws, as after a press on a row that left, shows on the status line.
    const drawnIds = new Set([
      ...Object.values(rows).flatMap(list => list.map(r => r.id)),
      ...prViews.map(pr => `pr:${pr.ref}`),
    ])
    const lineNote = Object.entries(notes)
      .filter(([id, n]) => !drawnIds.has(id) && now - n.at < SETTLED_MS)
      .map(([, n]) => n)
      .sort((a, b) => b.at - a.at)[0]

    // The keys no row shows, listed in the footer.
    const keyList = [
      { keys: TABS.map(t => t.hotkey).join(' '), does: 'Switch tabs' },
      { keys: 'j k', does: 'Select the next or previous row' },
      { keys: 'ctrl+x tab', does: 'Move focus to the line above the prompt, then the pane, then the prompt' },
    ]
    const keyColumn = Math.max(...keyList.map(k => k.keys.length)) + 2

    // The tab bar is drawn on the pane's own background, as part of the pane's
    // title bar, with when the inbox last updated at its right end, or under the
    // tabs when the pane is too narrow. Inline, its names line up with the group titles.
    // A narrow desktop pane always puts the status under the tabs, one part per line.
    // Desktop draws the tabs in a Client, whose region takes the pointer over each whole tab.
    const tabProps: TabsProps | null =
      look === 'desktop' && 'Client' in elements
        ? {
            tabs: TABS.map(({ id, label }) => {
              const text = tabCounts[id] > 0 ? `${label} ${tabCounts[id]}` : label
              const width = Math.ceil(text.length / DESKTOP_CHARS_PER_CELL) + 2 * DESKTOP_TAB_PADDING
              return { id, label, count: tabCounts[id], countColor: pal.tone[id] ?? null, width }
            }),
            shown: tab,
            gap: 1,
            colors: {
              tab: pal.tab ?? null,
              hover: pal.raised ?? pal.tab ?? null,
              hoverText: pal.raisedText ?? null,
              shown: pal.selection ?? pal.raised ?? pal.tab ?? null,
            },
          }
        : null
    const tabs = (
      <Box
        paddingLeft={isInline ? 2 : 1}
        paddingRight={1}
        flexDirection={isNarrowDesktop ? 'column' : 'row'}
        flexWrap="wrap"
        alignItems={isNarrowDesktop ? 'flex-start' : 'center'}
        justifyContent="space-between"
        columnGap={3}
      >
        <Box
          flexDirection="row"
          {...(look === 'desktop' ? { flexWrap: 'wrap' as const } : {})}
          columnGap={isInline ? 3 : look === 'desktop' ? 2 : 1}
        >
          {'Client' in elements && tabProps ? (
            <elements.Client key="tabs" module="./tabs-client.tsx" props={tabProps} />
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

                const width = `${label}${count > 0 ? ` ${count}` : ''}`.length + 2 * TAB_PAD.length

                // Desktop: every tab is one native button, the shown one the primary. The key stays the
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

                // The selected tab is a raised panel three lines tall, with its name on
                // the middle line and a line of its color along the top edge. After a
                // jump to it, the line draws in from the left.
                const since = jumped?.tab === id ? now - jumped.at : DRAW_IN_MS
                const edge = since < DRAW_IN_MS ? Math.max(1, Math.ceil((width * since) / DRAW_IN_MS)) : width
                if (tab === id)
                  return (
                    <Box flexDirection="column">
                      <Text color={pal.mark[id]} backgroundColor={pal.raised}>
                        {'▔'.repeat(edge) + ' '.repeat(width - edge)}
                      </Text>
                      <Text backgroundColor={pal.raised}>
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
                        {TAB_PAD}
                      </Text>
                      <Text backgroundColor={pal.raised}>{' '.repeat(width)}</Text>
                    </Box>
                  )

                // Each line is a Button, so a click anywhere on the tab's three lines
                // selects it. Under the pointer, the keyed Box raises all three as one
                // panel, the selected tab's shape without its line.
                const show = () => void showTab($, id)

                return (
                  <Box key={`tab-block-${id}`} flexDirection="column" backgroundColor={pal.tab}>
                    <Button plain key={`tab-${id}-above`} label={' '.repeat(width)} hover={raise} onPress={show} />
                    <Box flexDirection="row">
                      <Button plain key={`tab-${id}-before`} label={TAB_PAD} hover={raise} onPress={show} />
                      <Button plain key={`tab-${id}`} label={label} hover={raise} onPress={show} />
                      {count > 0 ? (
                        <Text color={pal.tone[id]} hover={raise}>
                          {' '}
                          {count}
                        </Text>
                      ) : null}
                      <Button plain key={`tab-${id}-after`} label={TAB_PAD} hover={raise} onPress={show} />
                    </Box>
                    <Button plain key={`tab-${id}-below`} label={' '.repeat(width)} hover={raise} onPress={show} />
                  </Box>
                )
              })}
        </Box>
        <Box flexDirection={isNarrowDesktop ? 'column' : 'row'} columnGap={2}>
          <Text dimColor>{status}</Text>
          {!isPrStatus && error ? (
            <Text color={pal.tone.error} wrap="wrap">
              {error}
            </Text>
          ) : null}
          {/* The band still draws without the tools, so every tab's status line says so. */}
          {toolsRefused ? (
            <Text color={pal.tone.error} wrap="wrap">
              {TOOLS_REFUSED_TEXT}
            </Text>
          ) : null}
          {lineNote ? (
            <Text color={pal.muted} wrap="wrap">
              {feedbackText({ is: 'note', note: lineNote.note, at: lineNote.at }, look)}
            </Text>
          ) : null}
        </Box>
      </Box>
    )
    // The footer's one line opens the list of keys as a drawer above it. The
    // drawer is absolute, so it covers the rows above instead of moving the line.
    const footer = (
      <Box flexDirection="column" paddingX={1} paddingTop={blankLine}>
        <Box flexDirection="row" paddingX={1}>
          <Button
            plain
            dimColor
            key="key-list"
            label={isKeyListShown ? '▾ Keys' : '▴ Keys'}
            onPress={() => void update($, IS_KEY_LIST_SHOWN, shown => !shown)}
          />
          {isKeyListShown ? (
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

    // A group's title: its name, and how many of its items are open. An empty
    // group's own line says it has none, so its title has no count.
    const groupTitle = (title: string, count: number) => (
      <Box paddingLeft={2}>
        <Text>
          <Text bold>{title}</Text>
          {count > 0 ? <Text color={pal.muted}> {count}</Text> : null}
        </Text>
      </Box>
    )
    const section = (children: JSX.Element | JSX.Element[]) => (
      <Box flexDirection="column" paddingY={blankLine} backgroundColor={isInline ? undefined : pal.card}>
        {children}
      </Box>
    )
    // A blank line in the tree, but for its │: under a title, so the children
    // do not crowd it, and between two-line entries, so they read apart. Inline
    // it is left out, so callers spread what this returns.
    const titleGap = (hasChildren = true) =>
      isInline
        ? []
        : [
            <Box paddingLeft={1}>
              <Text color={pal.line}>{hasChildren && look !== 'desktop' ? '│' : ' '}</Text>
            </Box>,
          ]
    // A closed item or finding under the open ones: what was asked, then how it closed and when.
    const closedRow = (d: ClosedLine, pos: TreePos) =>
      treeRow(
        pos,
        <Text color={pal.muted}>◇</Text>,
        <Box flexDirection="column">
          <Text wrap="wrap" color={pal.muted}>
            {d.ask}
          </Text>
          <Text wrap="wrap">
            <Text bold={!isLapsed(d)} color={isLapsed(d) ? pal.muted : undefined}>
              {outcomeText(d)}
            </Text>
            <Text color={pal.muted}>{unbroken(` · ${ago(now - d.at)}`)}</Text>
          </Text>
        </Box>,
        `closed-${d.id}`,
        1,
      )
    // The row that folds or unfolds a list's closed items, with how many there are.
    // It sits apart from the list's tree, and the closed items hang from its arrow.
    // On desktop a Client takes a click on every cell of the line, where a Button takes one only on its label.
    const foldRow = (kind: Item['kind'] | 'finding', count: number, isUnfolded: boolean) =>
      look === 'desktop' && 'Client' in elements ? (
        <Box key={`fold-row-${kind}`} flexDirection="row" overflow="hidden">
          <elements.Client
            key={`fold-${kind}`}
            module="./fold-client.tsx"
            width="100%"
            props={
              {
                inset: 4,
                count,
                isUnfolded,
                colors: {
                  rest: isInline ? null : (pal.card ?? null),
                  text: pal.muted,
                  hover: pal.raised,
                  hoverText: pal.raisedText ?? null,
                },
              } satisfies FoldProps
            }
          />
        </Box>
      ) : (
        // One Button for the arrow and the count; the two spaces put the count where other rows' text starts.
        treeRow(
          null,
          null,
          <Box flexDirection="row">
            <Button
              plain
              dimColor
              key={`fold-${kind}`}
              label={`${isUnfolded ? '▾' : '▸'} ${count} Closed`}
              onPress={() =>
                void update($, UNFOLDED, u => (u.includes(kind) ? u.filter(k => k !== kind) : [...u, kind]))
              }
            />
          </Box>,
          `fold-row-${kind}`,
        )
      )
    // Each closed item is two lines, so a blank line of their tree sets each apart.
    const closedGap = () =>
      isInline
        ? []
        : [
            <Box paddingLeft={4}>
              <Text color={pal.line}>{look === 'desktop' ? ' ' : '│'}</Text>
            </Box>,
          ]
    // The fold row and, unfolded, the closed items under it; nothing when none closed.
    const closedFold = (kind: Item['kind'] | 'finding', closed: ClosedLine[], isUnfolded: boolean) =>
      closed.length === 0
        ? []
        : [
            ...titleGap(false),
            foldRow(kind, closed.length, isUnfolded),
            ...(isUnfolded ? closed.flatMap((d, n) => [...closedGap(), closedRow(d, childPos(n, closed.length))]) : []),
          ]
    // A row that just closed stays where it was, with a ✓ and its outcome, and
    // [Undo] after the person's own Done or Dismiss, until it joins its list's
    // closed items. It cannot be selected. `undo` is that press. An answer
    // whose message has not reached Claude reads "Queued: <answer>" instead.
    const settledContent = (
      what: string,
      outcome: string,
      at: number,
      undo: RowPress | PrPress | null,
      inset: number,
      isQueued = false,
    ) => (
      <Box flexDirection="column">
        <Text wrap="truncate-end" color={pal.muted}>
          {oneLine(what, inset)}
        </Text>
        <Box flexDirection="row" columnGap={2}>
          <Text wrap="wrap" color={isQueued ? pal.muted : pal.tone.done}>
            {isQueued ? `Queued: ${outcome}` : outcome}
          </Text>
          {undo ? (
            <Button
              key={`undo-${'ref' in undo ? `pr:${undo.ref}` : undo.id}`}
              label="Undo"
              onPress={press => runPress($, undo, press.surface)}
            />
          ) : null}
        </Box>
        {leaveBar(at)}
      </Box>
    )
    const settledRow = ({ settled: r, state }: Extract<Entry, { settled: RowView }>, pos?: TreePos) => {
      const undo = r.actions.find(a => a.press.action === 'undo')?.press ?? null
      const content = settledContent(r.title, state.label, state.at, undo, pos ? 7 : 5, state.isQueued)
      // The ✓ waits for the answer to reach Claude; the blank keeps the row's text in line.
      const mark = state.isQueued ? <Text> </Text> : <Text color={pal.mark.done}>✓</Text>
      // In a group's tree, or flat as Findings lists its rows.
      return pos ? (
        treeRow(pos, mark, content, `settled-${r.id}`)
      ) : (
        <Box key={`settled-${r.id}`} flexDirection="row" alignItems="flex-start" overflow="hidden">
          <Box width={1} flexShrink={0} />
          <Box width={4} flexShrink={0} paddingLeft={2}>
            {mark}
          </Box>
          <Box flexDirection="column" flexShrink={1} flexGrow={1} paddingRight={1}>
            {content}
          </Box>
        </Box>
      )
    }
    const settledOf = (entries: Entry[]) => new Set(entries.flatMap(x => ('settled' in x ? [x.settled.id] : [])))
    const needsYouView = () => {
      // A group with no open, settled or closed items is left out.
      const groups = needsYouGroups.flatMap(g => {
        const { entries } = g
        const closed = closedShown(view.needsYou.closed[g.list], settledOf(entries))
        if (entries.length === 0 && closed.length === 0) return []
        const isUnfolded = unfolded.includes(g.kind)
        // The group's children in order: its open items, then the fold row and, unfolded, the closed items.
        const open = divided(
          entries.map((x, n) =>
            'row' in x ? listRow(x.row, childPos(n, entries.length)) : settledRow(x, childPos(n, entries.length)),
          ),
          g.kind,
          true,
        )
        const tail = closedFold(g.kind, closed, isUnfolded)

        // A row handed to Claude stays listed but leaves the count.
        return [
          section([
            groupTitle(g.title, g.rows.filter(r => !r.fold).length),
            ...(open.length > 0 ? [...titleGap(), ...open] : []),
            ...tail,
          ]),
        ]
      })
      const isNothing = needsYouGroups.every(g => g.entries.length === 0)
      // A saved session the store could not read is unknown, not empty, so it never reads as "Nothing needs you."
      const unread = isUnreadShown(isDemo)
        ? [
            section(
              <Box flexDirection="row" flexWrap="wrap" columnGap={2} paddingLeft={2}>
                {unreadable?.isReading ? (
                  <Text color={pal.muted}>Reading the inbox…</Text>
                ) : (
                  <Text color={pal.tone.error}>Could not read the inbox.</Text>
                )}
                <Button key="read-again" label="Try again" onPress={() => void readAgain($)} />
              </Box>,
            ),
          ]
        : []
      if (isNothing && groups.length === 0 && !stop && unread.length === 0) return emptyState('Nothing needs you.')
      // A stop shows above the list. An API error can be resumed from here; the other stops
      // need a fix outside the session first, so they only say what it is.
      const outside = stop
        ? [
            section(
              <Box flexDirection="column" paddingLeft={1}>
                <Text wrap="truncate-end">
                  <Text color={pal.tone.error} bold>
                    Stopped
                  </Text>
                  <Text color={pal.muted}> · {ago(now - stop.at)}</Text>
                </Text>
                {stop.kind === 'api-error' ? (
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

      // With closed items or a stop still shown, the empty text is one line above them.
      const nothing =
        isNothing && unread.length === 0
          ? [
              section(
                <Box paddingLeft={2}>
                  <Text color={pal.muted}>Nothing needs you.</Text>
                </Box>,
              ),
            ]
          : []

      return (
        <Box flexDirection="column" gap={1}>
          {outside}
          {unread}
          {nothing}
          {groups}
        </Box>
      )
    }

    // A finding stays listed until Claude closes it or the person dismisses it. Then it settles and moves to Closed.
    const findingsView = () => {
      const closed = closedShown(view.findings.closed, settledOf(findingEntries)).map(f => ({
        id: f.id,
        ask: f.title,
        at: f.closedAt,
        how: f.how,
        outcome: f.outcome,
      }))
      if (findingEntries.length === 0 && closed.length === 0)
        return emptyState('No findings yet', 'Claude flags issues and opportunities it spots beyond your task.')
      // With closed findings still shown, the empty text is one line above them.
      const open =
        findingEntries.length > 0
          ? divided(
              findingEntries.map(x => ('row' in x ? listRow(x.row) : settledRow(x))),
              'findings',
              false,
            )
          : [
              <Box paddingLeft={2}>
                <Text color={pal.muted}>No open findings.</Text>
              </Box>,
            ]

      return section([...open, ...closedFold('finding', closed, unfolded.includes('finding'))])
    }

    // A PR the person just dismissed keeps its title, settled, with [Undo], until it leaves.
    const settledPrBlock = (pr: PrView) =>
      section([
        treeRow(
          null,
          <Text color={pal.mark.done}>✓</Text>,
          settledContent(
            `#${pr.number} ${pr.title}`,
            'Dismissed',
            lastActions[`pr:${pr.ref}`]?.at ?? now,
            {
              action: 'pr-undo',
              ref: pr.ref,
            },
            7,
          ),
          `settled-pr:${pr.ref}`,
        ),
      ])
    const prBlock = ({ pr, isSettled, rows: prRows }: { pr: PrView; isSettled: boolean; rows: Row[] }) => {
      if (isSettled) return settledPrBlock(pr)
      const { status, text: statusText } = readiness(pr, handoff)
      const { mark, tone } = PR_STATUSES[status]
      const hasRows = prRows.length > 0
      const counts = checkCounts(pr)
      const waitingOn = threadsOnYou(pr, handoff)
      // A Dismiss left on a PR that is tracked again, as one a later reply links, is over.
      const prLast = lastActions[`pr:${pr.ref}`]?.action === 'pr-dismiss' ? null : lastActionText(`pr:${pr.ref}`)
      const retry = prRetryOf(lastActions[`pr:${pr.ref}`], pr.ref, null)
      const prActions: Action[] = [
        ...(retry
          ? [{ key: `retry-${pr.ref}`, label: 'Try again', kind: retry.kind, onPress: prPress(retry.press) }]
          : []),
        ...(pr.state === 'OPEN' && pr.mergeable === 'CONFLICTING'
          ? [
              {
                key: `resolve-${pr.ref}`,
                label: again(`pr:${pr.ref}`, 'pr-conflicts', 'Resolve conflicts'),
                kind: 'handoff' as const,
                onPress: prPress({ action: 'pr-conflicts', ref: pr.ref }),
              },
            ]
          : []),
        ...(waitingOn.length > 1
          ? [
              {
                key: `address-all-${pr.ref}`,
                label: again(`pr:${pr.ref}`, 'pr-address-all', `Address all ${waitingOn.length} threads`),
                kind: 'handoff' as const,
                onPress: prPress({ action: 'pr-address-all', ref: pr.ref }),
              },
            ]
          : []),
        {
          key: `open-${pr.ref}`,
          label: 'Open PR',
          kind: 'local',
          onPress: prPress({ action: 'pr-open', ref: pr.ref }),
        },
        ...(pr.ref !== prState.branchRef
          ? [
              {
                key: `dismiss-pr-${pr.ref}`,
                label: 'Dismiss',
                kind: 'mark' as const,
                onPress: prPress({ action: 'pr-dismiss', ref: pr.ref }),
              },
            ]
          : []),
      ]
      // The viewer replied last. Their own notes with no reply wait on no one, so they don't count.
      const answered = pr.threads.filter(t => !t.isWaiting && t.reply !== null).length
      // The headline already names a draft and failing or running checks; this line adds only what it leaves out.
      const checksPass = (status === 'blocked' || status === 'draft') && counts.fail === 0 && counts.pending === 0
      const facts = [
        checksPass && counts.pass > 0 ? `${counts.pass} ${counts.pass === 1 ? 'check passes' : 'checks pass'}` : null,
        answered > 0 ? `${answered} open ${answered === 1 ? 'thread' : 'threads'} you answered` : null,
      ].filter(Boolean)

      return section([
        <Box paddingLeft={1}>
          <Text wrap="wrap">
            <Text bold color={pal.tone.prs}>
              #{pr.number}{' '}
            </Text>
            <Text bold>{pr.title}</Text>
          </Text>
        </Box>,
        ...titleGap(hasRows),
        treeRow(
          hasRows ? 'pass' : null,
          <Text color={tone ? pal.mark[tone] : pal.muted}>{mark}</Text>,
          <Box flexDirection="column">
            <Text wrap="wrap" color={tone ? pal.tone[tone] : pal.muted}>
              {statusText}
            </Text>
            {facts.length > 0 ? (
              <Text color={pal.muted} wrap="wrap">
                {facts.join(' · ')}
              </Text>
            ) : null}
            {/* The next poll is minutes away, and desktop has no key to refresh with. */}
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
            <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={blankLine}>
              {prActions.map(a => (
                <Button key={a.key} label={a.label} onPress={a.onPress} />
              ))}
            </Box>
            {prLast ? (
              <Text color={prLast.isFailure ? pal.tone.error : pal.muted} wrap="wrap">
                {prLast.text}
              </Text>
            ) : null}
          </Box>,
        ),
        ...(hasRows ? titleGap() : []),
        ...divided(
          prRows.map((r, n) => listRow(r, childPos(n, prRows.length))),
          pr.ref,
          true,
        ),
      ])
    }
    const prsView = () => (
      <Box flexDirection="column" flexGrow={1} gap={1}>
        {prGroups.length === 0
          ? // Loading keeps the empty state's text, so only the title changes when the fetch ends.
            emptyState(
              prState.isFetching ? 'Checking for PRs…' : 'No PRs',
              'Your PRs show here when this session opens or links one, or when your branch has one.',
            )
          : prGroups.map(prBlock)}
      </Box>
    )

    const move = (step: number) => {
      const to = Math.min(Math.max(at + step, 0), ids.length - 1)
      void select($, tab, ids[to] ?? '', to)
    }
    // With no row open, j and k open the first row even when it is the only one.
    const moveKeys: KeyAction[] =
      ids.length > 1 || (at < 0 && ids.length > 0)
        ? [
            { key: 'next', label: 'Next', hotkey: 'j', kind: 'view', onPress: () => move(1) },
            { key: 'previous', label: 'Previous', hotkey: 'k', kind: 'view', onPress: () => move(-1) },
          ]
        : []
    const tabKeys: KeyAction[] = TABS.map(({ id, label, hotkey }) => ({
      key: `tab-key-${id}`,
      label,
      hotkey,
      kind: 'view',
      onPress: () => void showTab($, id),
    }))

    const selectedRow = rows[tab][at]
    const selectedActions = selectedRow ? rowActions(selectedRow) : null
    const rowKeys = selectedActions ? [...selectedActions.keys, ...selectedActions.more] : []

    // Docked, the pane takes at least the window's height, so the footer sits at
    // its bottom edge until the content is taller than the window. The engine has
    // no fixed footer, so past that it follows the content. Inline, the frame fits
    // the tree. A pane takes a key only as a Button's hotkey, so the tab keys, j,
    // k and the selected row's keys are Buttons in a hidden Box.
    const drawn = (
      <Box flexDirection="column" minHeight={isInline ? undefined : e.props.scroll.bodyRows} backgroundColor={pal.body}>
        {isDemo ? (
          <Box flexDirection="row" flexWrap="wrap" columnGap={2} paddingX={isInline ? 2 : 1} marginBottom={blankLine}>
            <Text wrap="wrap" bold color={pal.tone.needsYou}>
              {DEMO_BANNER}
            </Text>
            <Button key="hide-demo" label="Hide demo" onPress={() => void setDemo($, false)} />
          </Box>
        ) : null}
        {tabs}
        {/* ▔ draws at the top of its cell, so the rule touches the tabs' bottom edge
            and the rest of its row stands in for the blank line above the content.
            It takes the unselected tabs' color, so they read as resting on it. */}
        {isInline || look === 'desktop' ? null : (
          <Text color={pal.tab ?? pal.divider}>{'▔'.repeat(e.props.bodyColumns)}</Text>
        )}
        <Box flexDirection="column" paddingX={1} paddingTop={look === 'desktop' ? blankLine : 0} flexGrow={1}>
          {tab === 'findings' ? findingsView() : tab === 'prs' ? prsView() : needsYouView()}
        </Box>
        {/* Desktop takes no keys: a Button's hotkey does nothing there, so it gets neither the list of keys nor the hidden Buttons. */}
        {look === 'desktop' ? null : footer}
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
        const next = [focusHint, rowKeys[0]?.key, ...keys].find((k): k is string => !!k && keys.has(k)) ?? null
        focusedKey = next
        focusHint = null
        // After this hook returns, since a focus asked from inside a drawing's own hook cannot wait on it.
        if (next)
          void $.clock
            .sleep(0)
            .then(() => $.ui.focus({ requestId: PANE, key: next }))
            .catch(() => undefined)
      }
    }

    return drawn
  })
}
