import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionAppendMessage, UiPressArgument, UiScrollResult } from 'claude-code'

import type {
  Check,
  Checks,
  Cursor,
  Closed,
  Dialog,
  Help,
  Item,
  Ledger,
  Finding,
  PrCheck,
  PrFixSent,
  PrThread,
  PrView,
  PrViews,
  Presence,
  Previous,
  Settled,
  Snapshot,
  Stop,
  Tab,
} from '../types'
import {
  checkName,
  checkRuns,
  checkLine,
  checksIn,
  claimMessage,
  failureLines,
  failureSummary,
  fixMessage,
  NO_TARGET,
  outputLines,
  readResults,
} from './checks'
import type { Contradiction } from './checks'
import {
  NO_CHECKS,
  addRepo,
  bandLines,
  changed,
  checkKey,
  claimAgainst,
  dismissed,
  fixSent,
  needsYou,
  pruned,
  recorded,
  turnEnded,
  upgradeChecks,
} from './check-tracking'
import { demoView } from './demo'
import type { View } from './demo'
import { candidates, changedPaths, readChanged, readLsTree, sameSnapshot } from './git'
import type { Exchange, Press, Update } from './ledger'
import type { PrStatus } from './prs'
import {
  THREADS_QUERY,
  VIEW_FIELDS,
  checkCounts,
  commentLine,
  failingChecks,
  parseRef,
  prAttention,
  prRefs,
  prompts,
  readThreads,
  readView,
  readableComment,
  readiness,
  threadWhere,
  waitingThreads,
} from './prs'
import {
  EMPTY,
  SYSTEM,
  addFinding,
  ago,
  answerNote,
  applyUpdate,
  buildPrompt,
  carryText,
  closeItem,
  type Closing,
  commandRowLine,
  dialogLine,
  parseReply,
  catchUpPrompt,
  closeByClaude,
  closedText,
  inboxText,
  resetTime,
  readCommandRow,
  readKind,
  screenText,
  statusLine,
  stopFix,
  stopKindOf,
  stopText,
  tasksRunBy,
  toolActivity,
  transcriptCatchUpPrompt,
  transcriptText,
  upgradeLedger,
} from './ledger'

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
const PREVIOUS = atom({ plugin: 'inbox', key: 'previous' } as const, null as Previous | null)
const TAB = atom({ plugin: 'inbox', key: 'tab' } as const, 'needsYou' as Tab)
const NO_CURSOR: Cursor = { id: null, index: 0 }
const NO_SELECTION: Record<Tab, Cursor> = { needsYou: NO_CURSOR, findings: NO_CURSOR, prs: NO_CURSOR }
const SELECTION = atom({ plugin: 'inbox', key: 'selection' } as const, NO_SELECTION)
// Whether Claude Code uses its `dark` theme, which picks the selected row's tint.
const THEME = atom({ plugin: 'inbox', key: 'theme' } as const, '')
const PR_VIEWS = atom(
  { plugin: 'inbox', key: 'prViews' } as const,
  { views: {}, branchRef: null, isFetching: false } as PrViews,
)
const PR_FIXES_SENT = atom({ plugin: 'inbox', key: 'prFixesSent' } as const, {} as Record<string, PrFixSent>)
const STOP = atom({ plugin: 'inbox', key: 'stop' } as const, null as Stop | null)
const DIALOGS = atom({ plugin: 'inbox', key: 'dialogs' } as const, [] as Dialog[])
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const CHECKS = atom({ plugin: 'inbox', key: 'checks' } as const, NO_CHECKS)
const SNAPSHOTS = atom({ plugin: 'inbox', key: 'snapshots' } as const, {} as Record<string, Snapshot>)
const TYPING = atom({ plugin: 'inbox', key: 'typing' } as const, null as string | null)
const SETTLED = atom({ plugin: 'inbox', key: 'settled' } as const, [] as Settled[])
const UNFOLDED = atom({ plugin: 'inbox', key: 'unfolded' } as const, [] as Item['kind'][])
const IS_KEY_LIST_SHOWN = atom({ plugin: 'inbox', key: 'isKeyListShown' } as const, false)
const IS_CHECK_DETAIL_SHOWN = atom({ plugin: 'inbox', key: 'isCheckDetailShown' } as const, false)
// How long a closed item's row stays in place, with its outcome, before it moves to Closed.
const SETTLED_MS = 8000
const IS_DEMO = atom({ plugin: 'inbox', key: 'isDemo' } as const, false)
const SAMPLE_PRESS = 'Sample entry: nothing was sent. Run /inbox demo to go back.'
// The pane's buttons that only move around it, which work in the demo. Every other press there sends nothing.
const DEMO_PRESSES = /^(tab-|title-|select-|typekey-|fold-|key-list$|next$|previous$)/
// A dirtier tree is read only this far, so changes past it go unseen.
const SNAPSHOT_MAX = 2000
const PR_POLL_MS = 2 * 60_000
const MAX_PRS = 6

const FINDING_TOOL = 'mcp__inbox__record_finding'
const FINDING_DESCRIPTION = `Record a finding for the user. It waits in the Findings tab of /inbox until it is closed, and from there the user can ask you to address it or discuss it. Record what a careful senior engineer would flag to a teammate, and leave out style nits and anything the user already decided.`
const GUIDANCE = `# Inbox
The inbox plugin shows the user what waits on them: your open questions and the tasks only they can do, in a band above their prompt and in the /inbox pane, and your findings, in the pane's Findings tab.

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
const CLOSE_DESCRIPTION = `Close an open item or finding by its id, such as i35 or f12, as listed in the latest "inbox:" text beside the user's prompt. Pass the user's answer when their message answered it, and a reason otherwise.`
const CLOSE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The id of the open item or finding, such as i35 or f32.' },
    answer: {
      type: 'string',
      description: "The user's answer, in their words and at most 8, when their own message answered it.",
    },
    reason: {
      type: 'string',
      description: 'Otherwise, why it is closed, in at most 8 words, such as "no longer applies: Inbox kept".',
    },
  },
  required: ['id'],
}
const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['issue', 'opportunity'],
      description: 'issue: something wrong or risky. opportunity: something that could be better.',
    },
    title: { type: 'string', description: 'What it is, in at most 12 plain words.' },
    detail: { type: 'string', description: 'Why it matters and what you would do, in one or two sentences.' },
    path: { type: 'string', description: 'The file it is about, if one.' },
  },
  required: ['kind', 'title', 'detail'],
}

const PANE = 'inbox'
// Theme keys, so the colors follow the person's Claude Code theme.
const ACCENT = 'claude'
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
 * gray for `dimColor`, so the pane gives Buttons no dimColor.
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
// The Needs you tab lists questions first, because each takes one key.
const NEEDS_YOU_GROUPS: { kind: Item['kind']; title: string; empty: string }[] = [
  { kind: 'question', title: 'Questions', empty: 'No questions are waiting on you.' },
  { kind: 'task', title: 'Your tasks', empty: 'No tasks are waiting on you.' },
]
// How many recently closed items each group lists under its open ones.
const CLOSED_SHOWN = 3
const MODEL = 'sonnet'
const AWAY_MS = 15 * 60_000
const PREVIOUS_MAX_AGE_MS = 7 * 24 * 60 * 60_000
const KEPT_SESSIONS = 40
// Opened with `open -R` (shown in Finder) instead of `open`, which would launch them.
const LAUNCHES =
  /\.(app|command|tool|terminal|workflow|scpt|scptd|applescript|pkg|mpkg|dmg|webloc|inetloc|fileloc|prefpane|kext)$/i
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
let home = ''
// The repo's top folder, where git reads the working tree; null outside git.
let top: string | null = null
// Each folder outside the session's where a check ran, with its repo's top folder.
const repoTops = new Map<string, Promise<string | null>>()
let refreshing: Promise<void> = Promise.resolve()
// The PR fetches, one at a time, and the next one when it is waiting to start: whether it looks up the branch's PR.
let fetchingPrs: Promise<void> = Promise.resolve()
let nextFetchFindsBranchPr: boolean | null = null
let isSaved = false
let queue: Promise<void> = Promise.resolve()
// The inbox text Claude last read beside a prompt, so it is sent again only when it changed.
let toldInbox: string | null = null
// The line last published to this pane's Herdr sidebar row, and the chain that publishes in order.
let published: string | null = null
let publishing: Promise<void> = Promise.resolve()
// Context for prompts this mod sent, by text, appended just before each prompt's row.
const contextFor = new Map<string, string[]>()
// The closed items Claude has been told about, by id.
let toldClosed = new Set<string>()
// The `!` command whose output row comes next.
let shellCommand: string | null = null

/** Clears everything gathered for the turn's exchange. */
function resetTurn() {
  activity = []
  person = null
  trigger = null
  press = null
  sentBack = []
}

/** Sends Claude back when the reply claims a check passes against its latest run. */
async function blockOnClaim<R extends { block?: string }>($: EngineInterface, r: R, reply: string): Promise<R> {
  if ((await read($, CHECKS)).results.length === 0) return r
  await refreshTree($)
  const sent: { claim: Contradiction | null } = { claim: null }
  await update($, CHECKS, c => {
    const found = claimAgainst(c, reply, root)
    sent.claim = found.claim

    return found.checks
  })

  return sent.claim ? { ...r, block: claimMessage(sent.claim) } : r
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
  const savedAt = await $.clock.now()
  const key = `s:${sessionId}`
  // The first save in a process deletes the key first, moving it to the end of
  // the store's insertion order, which the pruning treats as most recent. Later
  // saves only overwrite, so pruning runs once per process.
  if (!isSaved) await $.store.delete(key)
  await Promise.all([
    $.store.set(key, { savedAt, ledger }),
    ledger.card ? $.store.set(`p:${root}`, { savedAt, ledger }) : undefined,
  ])
  if (isSaved) return
  isSaved = true
  const sessions = (await $.store.keys()).filter(k => k.startsWith('s:'))
  await Promise.all(sessions.slice(0, Math.max(0, sessions.length - KEPT_SESSIONS)).map(old => $.store.delete(old)))
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
      const line = isEnding
        ? ''
        : statusLine(...(await Promise.all([read($, LEDGER), read($, STOP), read($, DIALOGS)])))
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
  await update($, STOP, () => stop)
  void publishStatus($)
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
    before = l
    return change(l)
  })
  await save($, after)
  void publishStatus($)
  await showSettled($, before, after)
}

/**
 * The open items of one kind in the order the Needs you tab lists them.
 * Questions go newest first, so a new batch's numbers match Claude's in its reply.
 */
function listedItems(items: Item[], kind: Item['kind']): Item[] {
  const listed = items.filter(i => i.kind === kind)
  return kind === 'question' ? listed.sort((a, b) => b.turn - a.turn) : listed
}

/**
 * Keeps each item that just closed in its row for a few seconds, with its
 * outcome, so the person sees it was registered, however it closed.
 */
async function showSettled($: EngineInterface, before: Ledger, after: Ledger) {
  const open = new Set(after.items.map(i => i.id))
  const settled = before.items.flatMap(item => {
    const d = open.has(item.id) ? undefined : after.closed.find(x => x.id === item.id)
    return d ? [{ ...d, index: listedItems(before.items, item.kind).indexOf(item) }] : []
  })
  if (settled.length === 0) return
  await update($, SETTLED, s => [...s.filter(x => !settled.some(y => y.id === x.id)), ...settled])
  expireSettled($, settled, SETTLED_MS)
}

/** Removes just-closed rows after a wait. A reload cancels the wait, so session.start sets it again. */
function expireSettled($: EngineInterface, settled: Settled[], waitMs: number) {
  void $.clock
    .sleep(waitMs)
    .then(() => update($, SETTLED, s => s.filter(x => !settled.some(y => y.id === x.id && y.at === x.at))))
    .catch(() => undefined)
}

type ModelResult = Awaited<ReturnType<EngineInterface['model']['fork']>>

type LedgerState = Presence['ledgerState']

/** Applies the ledger model's reply. */
async function applyLedgerReply(
  $: EngineInterface,
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
  if (!parsed) return 'failed'
  const now = await $.clock.now()
  await commitLedger($, l => change(l, parsed, now))

  return 'current'
}

/** Asks the ledger model to update the ledger, with SYSTEM as its instructions. */
function askLedgerModel($: EngineInterface, prompt: string, timeoutMs: number): Promise<ModelResult> {
  return $.model.complete({ model: MODEL, system: SYSTEM, prompt, maxTokens: 1600, effort: 'low', timeoutMs })
}

/** Updates the ledger from one exchange. */
async function runUpdate($: EngineInterface, ex: Exchange): Promise<LedgerState> {
  const promptAt = await $.clock.now()
  const r = await askLedgerModel($, buildPrompt(await read($, LEDGER), ex), 45_000)
  // An Explain turn talks about its item without deciding it.
  const explained = ex.press?.action === 'explain' ? ex.press.id : null

  return applyLedgerReply($, r, [ex.reply, ...ex.activity].join('\n'), (l, u, now) =>
    applyUpdate(l, { ...u, closed: u.closed.filter(c => c.id !== explained) }, now, ex.turn, promptAt),
  )
}

/**
 * Brings the ledger up to date over the whole conversation, for turns the
 * per-turn update missed: it closes what was handled and adds what still waits.
 */
async function catchUp($: EngineInterface): Promise<LedgerState> {
  const [ledger, shown] = await Promise.all([read($, LEDGER), screen($)])
  const change = (l: Ledger, u: Update, now: number) => applyUpdate(l, u, now, l.turn)
  const forked = await $.model.fork({ prompt: catchUpPrompt(ledger, shown) })
  if (forked.isAnswered || forked.reason !== 'nothing-to-fork') return applyLedgerReply($, forked, null, change)
  // A resumed conversation has no request of this process's to fork until its
  // first reply, so the model reads the transcript instead, uncached.
  const transcript = transcriptText(await $.session.messages())
  if (!transcript) return 'behind'
  const r = await askLedgerModel($, transcriptCatchUpPrompt(ledger, shown, transcript), 90_000)

  return applyLedgerReply($, r, transcript, change)
}

/**
 * Queues the next update: a catch-up while the ledger may have missed a turn,
 * else this exchange alone.
 */
function queueUpdate($: EngineInterface, next: { ex: Exchange; turnsStarted: number } | null) {
  queue = queue.then(async () => {
    const { ledgerState, turnsStarted } = await update($, PRESENCE, p => ({ ...p, isUpdating: true }))
    const state = await (ledgerState !== 'current' || next === null ? catchUp($) : runUpdate($, next.ex)).catch(
      (): LedgerState => 'failed',
    )
    // An exchange covers the turns started by its end; a catch-up, those started before it ran.
    const applied = next?.turnsStarted ?? turnsStarted
    await update($, PRESENCE, p => ({
      ...p,
      ledgerState: state,
      isUpdating: false,
      turnsApplied: state === 'current' ? Math.max(p.turnsApplied, applied) : p.turnsApplied,
    }))
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
 * Sends an answer to Claude as the person's own message. The item closes at
 * once, so a second press cannot send it twice. A prompt sent mid-turn waits
 * for the turn to end.
 */
async function sendAnswer($: EngineInterface, item: Item, answer: string) {
  await close($, item.id, { how: 'answered', outcome: answer })
  await send($, `Re "${item.ask}": ${answer}`, { id: item.id, action: 'answer' })
}

/**
 * Sends a prompt as the person's own message. A plugin's own prompt skips that
 * plugin's prompt.submit hook, so the bookkeeping happens here, and what
 * Claude reads beside the prompt goes just before it, in a row only the model sees.
 */
async function send($: EngineInterface, text: string, sentBy: Press | null = null) {
  const context = await notePrompt($, text, sentBy)
  // The engine may run the prompt now, after the running turn, or inside it, so
  // the context goes in when the prompt's own row is stored (session.append).
  if (context.length > 0) contextFor.set(text, context)
  await $.prompt.submit({ text, asUser: true })
}

/** Appends context as a row only the model reads. Without it Claude still gets the prompt, so a refused append is ignored. */
async function appendContext($: EngineInterface, context: string[]) {
  await $.session
    .append({ message: { type: 'user', content: [{ type: 'text', text: context.join('\n\n') }] } })
    .catch(() => undefined)
}

/**
 * Records a prompt in the person's words and returns what Claude reads beside
 * it: the previous session's card when they continue from it, the questions a
 * numbered answer refers to, and the inbox when it changed.
 */
async function notePrompt($: EngineInterface, text: string, sentBy: Press | null): Promise<string[]> {
  const [now, ledger, prev, isShown] = await Promise.all([
    $.clock.now(),
    update($, LEDGER, l => ({ ...l, turn: l.turn + 1 })),
    read($, PREVIOUS),
    isPaneShown($),
  ])
  await Promise.all([
    update($, PRESENCE, p => ({ ...p, lastActiveAt: now, isAway: false })),
    prev ? update($, PREVIOUS, () => null) : undefined,
  ])
  const notes: string[] = []

  if (prev?.isBroughtIn) {
    const carried = carryText(
      prev.ledger,
      `inbox: the user chose to continue from the previous session in this folder (${ago(now - prev.savedAt)}). Where it stood:`,
    )
    if (carried) notes.push(carried)
  }
  // A button's prompt already says what it does; an Explain, for one, quotes its item without answering it.
  const answer = sentBy ? null : answerNote(ledger, text)
  if (answer) notes.push(answer)
  // The inbox when it changed since Claude last read it, or when an item
  // closed since. An empty inbox with nothing closed says nothing new.
  const inbox = inboxText(ledger, isShown)
  const closed = closedText(ledger.closed.filter(d => !toldClosed.has(d.id)))
  const isEmpty = ledger.items.length === 0 && ledger.findings.length === 0
  if (closed || (inbox !== toldInbox && !(isEmpty && toldInbox === null))) {
    notes.push(closed ? `${inbox}\n${closed}` : inbox)
    toldInbox = inbox
    toldClosed = new Set(ledger.closed.map(d => d.id))
  }

  if (sentBy) press = sentBy
  notePerson(text)
  trigger = null

  return notes
}

/** Asks Claude what an item is about. The item stays open, since nothing was closed. */
async function explain($: EngineInterface, item: Item) {
  const what = item.kind === 'task' ? 'this task you left for me' : 'this question you asked me'
  const options = item.options.length > 0 ? `\nOptions: ${item.options.join(' / ')}` : ''
  const text = `Remind me what ${what} is about: why it came up, and what each choice would mean. Don't act on it yet.\n"${item.ask}"${options}`
  await send($, text, { id: item.id, action: 'explain' })
}

async function close($: EngineInterface, id: string, closing: Closing) {
  const now = await $.clock.now()
  await commitLedger($, l => closeItem(l, id, closing, now))
}

/**
 * Opens a file in the app macOS assigns to its type, else the default text
 * editor. A folder, an executable, or anything `open` would launch is shown in
 * Finder instead.
 */
async function openPath($: EngineInterface, raw: string) {
  const home = (await $.env.get('HOME')) ?? ''
  const path = raw.startsWith('~/')
    ? home + raw.slice(1)
    : raw.startsWith('/')
      ? raw
      : `${root}/${raw.replace(/^\.\//, '')}`
  const name = baseName(path)
  if (!(await $.fs.exists(path))) {
    $.ui.toast(`${name} is not there anymore`)
    return
  }
  const stat = await $.fs.stat(path)
  const isExecutable = stat.kind === 'file' && (await $.process.run(['test', '-x', path])).exitCode === 0
  const isReveal = stat.kind !== 'file' || isExecutable || LAUNCHES.test(path)
  const r = await $.process.run(isReveal ? ['open', '-R', path] : ['open', path])
  // A file with no registered type, such as .env.local, fails `open`; -t uses the default text editor.
  const retry = r.exitCode !== 0 && !isReveal ? await $.process.run(['open', '-t', path]) : r
  if (retry.exitCode !== 0) $.ui.toast(`Could not open ${name}: ${retry.stderr.trim()}`)
}

async function useHelp($: EngineInterface, item: Item, help: Help, press: UiPressArgument) {
  if (help.kind === 'open') {
    await openPath($, help.path)
  } else if (help.kind === 'copy') {
    const r = await $.ui.copy({ text: help.text, surface: press.surface })
    $.ui.toast(r.isCopied ? `Copied ${help.name ?? 'snippet'}` : 'Could not copy to the clipboard')
  } else if (help.kind === 'run') {
    const fence = '```'
    await send($, `For "${item.ask}", run this:\n${fence}\n${help.command}\n${fence}`, { id: item.id, action: 'run' })
  } else if (help.kind === 'terminal') {
    // A filled "! command" reaches the model as text; only a typed "!" switches the prompt to shell mode.
    const r = await $.ui.copy({ text: help.command, surface: press.surface })
    const what = help.name ?? 'the command'
    $.ui.toast(
      r.isCopied
        ? `Copied ${what}. Run it in a terminal, or type ! here and paste.`
        : 'Could not copy to the clipboard',
    )
  } else {
    await openUrl($, help.url)
  }
}

function clipLabel(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** `text` wrapped at spaces to `width` columns, in at most `count` lines; the last ends in … when text is left over. */
function wrapLines(text: string, width: number, count: number): string[] {
  const lines: string[] = []
  let rest = text.trim()
  while (rest && lines.length < count) {
    const cut = rest.length <= width ? rest.length : rest.lastIndexOf(' ', width)
    const end = cut > 0 ? cut : width
    lines.push(rest.slice(0, end))
    rest = rest.slice(end).trimStart()
  }
  if (rest) lines[count - 1] = clipLabel(`${lines[count - 1] ?? ''} ${rest}`, width)

  return lines
}

/** Each step's helps in order: one press copies then opens, for example. */
async function useStep($: EngineInterface, item: Item, step: Help[], press: UiPressArgument) {
  for (const help of step) await useHelp($, item, help, press)
}

/** A path inside the repo, relative to its top folder; any other path as given. */
function repoPath(path: string): string {
  const base = top ?? root

  return base && path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path
}

/** Text with the home folder written as ~, as in a shell prompt. */
function tilde(text: string): string {
  return home ? text.replaceAll(`${home}/`, '~/') : text
}

function baseName(path: string): string {
  return path.replace(/\/+$/, '').split('/').pop() ?? path
}

function helpLabel(help: Help): string {
  const label =
    help.kind === 'open'
      ? `Open ${baseName(help.path)}`
      : help.kind === 'copy'
        ? `Copy ${help.name ?? 'snippet'}`
        : help.kind === 'run'
          ? `Run ${help.name ?? help.command}`
          : help.kind === 'terminal'
            ? `Copy ${help.name ?? help.command}`
            : `Open ${help.name ?? new URL(help.url).host}`

  return clipLabel(label, 32)
}

/**
 * The item's helps as buttons. A snippet to copy and a file to open become one
 * step, "Copy env line and open .env.local", since the snippet goes in that file.
 */
function steps(helps: Help[]): { label: string; step: Help[] }[] {
  const copy = helps.find(h => h.kind === 'copy')
  const open = helps.find(h => h.kind === 'open')
  if (!copy || !open || copy.kind !== 'copy' || open.kind !== 'open')
    return helps.map(h => ({ label: helpLabel(h), step: [h] }))

  return helps
    .filter(h => h !== copy)
    .map(h =>
      h === open
        ? { label: clipLabel(`Copy ${copy.name ?? 'snippet'} and open ${baseName(open.path)}`, 48), step: [copy, open] }
        : { label: helpLabel(h), step: [h] },
    )
}

/**
 * Brings state an earlier version of the mod wrote up to date, and returns the
 * ledger. A reload keeps $.state, so a running session can still hold findings
 * under `notes`, and `notes` as its tab, and the Needs you tab as `waiting`,
 * with item kinds `decide` and `do`.
 */
async function upgradeState($: EngineInterface): Promise<Ledger> {
  const [ledger] = await Promise.all([
    update($, LEDGER, upgradeLedger),
    update($, PREVIOUS, p => p && { ...p, ledger: upgradeLedger(p.ledger) }),
    update($, TAB, t => ((t as string) === 'notes' ? 'findings' : (t as string) === 'waiting' ? 'needsYou' : t)),
    update($, SELECTION, ({ waiting, ...s }: Record<Tab, Cursor> & { waiting?: Cursor }) => ({
      ...NO_SELECTION,
      ...(waiting ? { needsYou: waiting } : {}),
      ...s,
    })),
    update($, UNFOLDED, u => u.map(readKind)),
    update($, SETTLED, s => s.map(x => ({ ...x, kind: readKind(x.kind) }))),
    // Presence from before the turn counts existed cannot say whether the last
    // turn's update landed, so that load catches up once.
    update($, PRESENCE, p => ({ ...p, turnsStarted: p.turnsStarted ?? 1, turnsApplied: p.turnsApplied ?? 0 })),
    update($, CHECKS, c => upgradeChecks(c, root, home)),
  ])

  return ledger
}

async function recordFinding($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
  const title = text(input.title, 120)
  const detail = text(input.detail, 600)
  if (title === '' || detail === '') return 'Not recorded: a finding needs a title and a detail.'
  const at = await $.clock.now()
  const path = text(input.path, 300)
  const finding = {
    kind: input.kind === 'opportunity' ? ('opportunity' as const) : ('issue' as const),
    title,
    detail,
    path: path || null,
    at,
  }
  let added = { id: '', isAdded: false }
  await commitLedger($, l => {
    const r = addFinding(l, finding)
    added = r
    return r.ledger
  })

  return added.isAdded
    ? `Recorded as ${added.id}. The user sees it in the Findings tab of /inbox.`
    : `Already recorded as ${added.id}.`
}

async function recordClose($: EngineInterface, input: Record<string, unknown>): Promise<string> {
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string).trim().slice(0, 80) : '')
  const id = text('id').replace(/^\[|\]$/g, '')
  const answer = text('answer')
  const reason = text('reason')
  if (id === '' || (answer === '' && reason === ''))
    return "Not closed: give the id, and the user's answer or a reason."
  const now = await $.clock.now()
  let closed: 'item' | 'finding' | null = null
  await commitLedger($, l => {
    const r = closeByClaude(l, id, answer ? { answer } : { reason }, now)
    closed = r.closed
    return r.ledger
  })
  if (closed === 'item') return `Closed ${id}. The user sees it in /inbox with its outcome.`
  if (closed === 'finding') return `Closed finding ${id}.`

  return `Not closed: no open item or finding has the id ${id}. The open ones are listed beside the user's latest message.`
}

/**
 * Opens the pane, or raises it, asking for the keyboard. The surface grants
 * that only while the prompt holds the keys over an empty composer.
 */
function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Inbox', focus: true, closeOnEscape: true })
}

/** Opens the free-text field under a row and gives it the keyboard. */
async function startTyping($: EngineInterface, id: string) {
  await update($, TYPING, () => id)
  // A click leaves the keys with the prompt, and `ui.focus` is refused in a pane that lacks them.
  await openPane($)
  await $.ui.focus({ requestId: PANE, key: `type-${id}` }).catch(() => undefined)
}

/**
 * Sends the person's own words about an item as their message. A question
 * closes with those words as its answer, as an option press does. A task
 * stays open, since Claude closes it once the message settles it.
 */
async function sendTypedForItem($: EngineInterface, item: Item, text: string) {
  await update($, TYPING, () => null)
  const words = text.trim()
  if (!words) return
  if (item.kind === 'task') await send($, `Re the task you left for me, "${item.ask}": ${words}`)
  else await sendAnswer($, item, words)
}

/** Sends the person's own words about a finding, which leaves the Findings tab as Address does. */
async function sendTypedForFinding($: EngineInterface, finding: Finding, text: string) {
  await update($, TYPING, () => null)
  const words = text.trim()
  if (!words) return
  await removeFinding($, finding.id)
  await send($, [`About this finding you recorded:`, ...findingBody(finding), '', words].join('\n'))
}

/** A finding as Claude reads it back: its kind and title, its detail, and its file. */
function findingBody(finding: Finding): string[] {
  return [
    `${FINDING_BADGES[finding.kind].label}: ${finding.title}`,
    finding.detail,
    ...(finding.path ? [`File: ${finding.path}`] : []),
  ]
}

async function removeFinding($: EngineInterface, id: string) {
  await commitLedger($, l => ({ ...l, findings: l.findings.filter(f => f.id !== id) }))
}

/** How many things wait on the person: open questions and tasks, and the session's checks left failing with no fix sent. */
function needsYouCount(ledger: Ledger, checks: Checks): number {
  return ledger.items.length + needsYou(checks, root).count
}

/** Hides a failing check's row in the Needs you tab until the check runs again. */
async function dismissCheck($: EngineInterface, check: Check) {
  await update($, CHECKS, c => dismissed(c, check))
}

/** Asks Claude to fix a failing check, and marks that run's row as handed to Claude. */
async function sendFix($: EngineInterface, check: Check) {
  await send($, fixMessage(check, root))
  const at = await $.clock.now()
  await update($, CHECKS, c => fixSent(c, check, at))
}

/** Sends the finding back to Claude, to fix it or to talk it through first. */
async function actOnFinding($: EngineInterface, finding: Finding, how: 'address' | 'discuss') {
  await removeFinding($, finding.id)
  const opening =
    how === 'address'
      ? 'Please address this finding you recorded:'
      : "Let's talk through this finding you recorded before changing anything:"
  await send($, [opening, ...findingBody(finding)].join('\n'))
}

async function showTab($: EngineInterface, tab: Tab) {
  await update($, TAB, () => tab)
  await $.ui.scroll({ in: PANE, to: 'start' }).catch(() => undefined)
  if (tab === 'prs') void findPrs($)
}

/** Refreshes the PRs tab as it comes into view, asking gh for the branch's PR. The demo shows sample PRs, so it asks nothing. */
async function findPrs($: EngineInterface) {
  if (!(await read($, IS_DEMO))) await fetchPrs($, true)
}

/**
 * Selects a row and scrolls the pane the least that shows it whole. The row's
 * scroll target is drawn only once the row redraws expanded, and the engine
 * refuses a key it has not drawn, so the scroll retries for a few frames.
 * Measured before the redraw, the row's end would land out of view.
 */
async function select($: EngineInterface, tab: Tab, id: string, index: number) {
  await update($, SELECTION, s => ({ ...s, [tab]: { id, index } }))
  await update($, TYPING, t => (t === id ? t : null))
  for (let tries = 0; tries < 10; tries++) {
    const result = await $.ui
      .scroll({ in: PANE, to: { key: `view-${id}` }, block: 'nearest' })
      .catch((): UiScrollResult => ({}))
    if (result.deny === undefined) return
    await $.clock.sleep(30)
  }
}

/**
 * The selected row's position: the cursor's row while it exists, else the row
 * now at its old position, so closing an item selects the one after it.
 */
function selectedIndex(ids: string[], cursor: Cursor): number {
  if (ids.length === 0) return -1
  const at = cursor.id === null ? -1 : ids.indexOf(cursor.id)

  return at >= 0 ? at : Math.min(cursor.index, ids.length - 1)
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

  return screenText(await isPaneShown($), TABS.find(t => t.id === tab)?.label ?? tab)
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
    const stillLinked = (await read($, LEDGER)).prs
    const views = Object.fromEntries(
      Object.entries(fetched).filter(([ref]) => ref === branchRef || stillLinked.includes(ref)),
    )
    await update($, PR_VIEWS, () => ({ views, branchRef, isFetching: false }))
  } catch {
    await update($, PR_VIEWS, v => ({ ...v, isFetching: false }))
  }
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

async function openUrl($: EngineInterface, url: string) {
  const r = await $.process.run(['open', url])
  if (r.exitCode !== 0) $.ui.toast(`Could not open ${url}`)
}

/** The id of a failing PR check's row, which also keys its Fix mark. */
function prCheckId(pr: PrView, check: PrCheck): string {
  return `${pr.ref} check ${check.name}`
}

/** Asks Claude to fix a failing PR check, and marks that run of it as handed to Claude. */
async function sendPrFix($: EngineInterface, pr: PrView, check: PrCheck) {
  await send($, prompts.fix(pr, check))
  const at = await $.clock.now()
  await update($, PR_FIXES_SENT, sent => ({ ...sent, [prCheckId(pr, check)]: { at, url: check.url } }))
}

async function dismissPr($: EngineInterface, ref: string) {
  await commitLedger($, l => ({ ...l, prs: l.prs.filter(r => r !== ref) }))
  await update($, PR_VIEWS, v => {
    const views = { ...v.views }
    delete views[ref]
    return { ...v, views }
  })
}

type Action = {
  key: string
  label: string
  variant?: 'primary'
  dimColor?: boolean
  onPress: (press: UiPressArgument) => void
}

function answerActions($: EngineInterface, item: Item): Action[] {
  return item.options.map((answer, n) => ({
    key: `answer-${item.id}-${n}`,
    // Pressing it sends the answer alone, without the note.
    label: answer === item.rec ? `${clipLabel(answer, 32)} (recommended)` : clipLabel(answer, 32),
    ...(answer === item.rec ? { variant: 'primary' as const } : {}),
    onPress: () => void sendAnswer($, item, answer),
  }))
}

function helpActions($: EngineInterface, item: Item): Action[] {
  return steps(item.helps).map(({ label, step }, n) => ({
    key: `help-${item.id}-${n}`,
    label,
    onPress: (press: UiPressArgument) => void useStep($, item, step, press),
  }))
}

function doneAction($: EngineInterface, item: Item): Action {
  return {
    key: `done-${item.id}`,
    label: 'Done',
    onPress: () => void close($, item.id, { how: 'done', outcome: 'done' }),
  }
}

/** A pane action with the key that presses it while the pane has focus. */
type KeyAction = Action & { hotkey: string }

// The keys of a question's answers and a task's helps, lettered as a multiple-choice
// question letters them. The digits switch tabs, and the letters left out are the
// keys of a Needs you row's other actions and of moving the selection.
const CHOICE_KEYS = [...'abcfghilm']

/**
 * The selected item's actions. `keys` finish it: answers and helps on letters,
 * and Done for a task. `more` are the other ways to respond: your own words,
 * Explain, and Dismiss for a question.
 */
function itemKeys($: EngineInterface, item: Item): { keys: KeyAction[]; more: KeyAction[] } {
  const lettered = [...(item.kind === 'task' ? [] : answerActions($, item)), ...helpActions($, item)]
    .slice(0, CHOICE_KEYS.length)
    .map((a, n) => ({ ...a, hotkey: CHOICE_KEYS[n]! }))
  const explainKey = { key: `explain-${item.id}`, label: 'Explain', hotkey: 'e', onPress: () => void explain($, item) }
  const typeKey = {
    key: `typekey-${item.id}`,
    label: item.kind === 'task' ? 'Type a reply' : 'Type an answer',
    hotkey: 't',
    onPress: () => void startTyping($, item.id),
  }
  if (item.kind === 'task')
    return { keys: [...lettered, { ...doneAction($, item), hotkey: 'd' }], more: [typeKey, explainKey] }

  return {
    keys: lettered,
    more: [
      typeKey,
      explainKey,
      {
        key: `dismiss-${item.id}`,
        label: 'Dismiss',
        hotkey: 'x',
        onPress: () => void close($, item.id, { how: 'dismissed', outcome: 'dismissed' }),
      },
    ],
  }
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function closedLine(d: Closed): string {
  return `${d.ask} → ${d.outcome}`
}

/** An item that closed without the person deciding it: dismissed, expired, or overtaken by the work. */
function isLapsed(d: Closed): boolean {
  if (d.how === 'dismissed' || d.how === 'expired' || d.how === 'claude') return true
  // The per-reply update writes its own outcome, so only its wording says the work overtook the item.
  return d.how === 'update' && /^(no longer applies|replaced|superseded|moot)/i.test(d.outcome)
}

/** The outcome as the pane shows it: "Dismissed", "Yes, renamed". */
function outcomeText(d: Closed): string {
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

/** Runs a git command that reads a repo's working tree; null when it fails. Optional locks are off, so it never takes the index lock from a commit. */
async function runGit($: EngineInterface, repo: string, args: string[], stdin?: string): Promise<string | null> {
  const r = await $.process
    .run(['git', '--no-optional-locks', ...args], {
      cwd: repo,
      timeoutMs: 15_000,
      ...(stdin === undefined ? {} : { stdin }),
    })
    .catch(() => null)

  return r && r.exitCode === 0 ? r.stdout : null
}

/** Each file's blob id, as a commit would store it. A folder, such as a submodule's, gets a mark of its own. */
async function hashFiles($: EngineInterface, repo: string, paths: string[]): Promise<string[] | null> {
  const out = await runGit($, repo, ['hash-object', '--stdin-paths'], `${paths.join('\n')}\n`)
  if (out !== null) return out.split('\n')
  // One path git cannot hash fails the whole call, so hash the files alone.
  const kinds = await Promise.all(
    paths.map(p =>
      $.fs.stat(`${repo}/${p}`).then(
        s => s.kind,
        () => 'other' as const,
      ),
    ),
  )
  const files = paths.filter((_p, i) => kinds[i] === 'file')
  const hashed =
    files.length > 0 ? await runGit($, repo, ['hash-object', '--stdin-paths'], `${files.join('\n')}\n`) : ''
  if (hashed === null) return null
  const ids = hashed.split('\n')

  return paths.map((_p, i) => (kinds[i] === 'file' ? (ids[files.indexOf(paths[i] ?? '')] ?? '') : `${kinds[i]}`))
}

/** A repo's working tree content, read without writing to the repo. */
async function readSnapshot($: EngineInterface, repo: string): Promise<Snapshot | null> {
  const [out, headOut] = await Promise.all([
    runGit($, repo, ['status', '--porcelain=v1', '-z', '-uall']),
    runGit($, repo, ['rev-parse', '--verify', '-q', 'HEAD']),
  ])
  if (out === null) return null
  const head = headOut?.trim() || null
  const changed = readChanged(out).slice(0, SNAPSHOT_MAX)
  const dirty: Snapshot['dirty'] = {}
  for (const c of changed) if (c.isDeleted) dirty[c.path] = ''
  const present = changed.filter(c => !c.isDeleted && !c.path.includes('\n')).map(c => c.path)
  if (present.length > 0) {
    const ids = await hashFiles($, repo, present)
    if (!ids) return null
    present.forEach((path, i) => {
      dirty[path] = ids[i] ?? ''
    })
  }

  return { head, dirty }
}

/** Each path's object id in a commit, for the paths it has. */
async function lsTree(
  $: EngineInterface,
  repo: string,
  head: string,
  paths: string[],
): Promise<Record<string, string> | null> {
  const ids: Record<string, string> = {}
  for (let i = 0; i < paths.length; i += 200) {
    const out = await runGit($, repo, ['ls-tree', '-z', '--full-tree', head, '--', ...paths.slice(i, i + 200)])
    if (out === null) return null
    Object.assign(ids, readLsTree(out))
  }

  return ids
}

/** The paths whose content differs between two snapshots of a repo, or null when git could not tell. A commit only moves content into HEAD, so it changes nothing. */
async function contentChanges($: EngineInterface, repo: string, a: Snapshot, b: Snapshot): Promise<string[] | null> {
  if (a.head !== b.head && !b.head) return null
  let committed: string[] = []
  if (a.head && b.head && a.head !== b.head) {
    const out = await runGit($, repo, ['diff', '--name-only', '-z', '--no-renames', a.head, b.head])
    if (out === null) return null
    committed = out.split('\0').filter(Boolean)
  }
  const paths = candidates(a, b, committed)
  if (paths.length === 0) return []
  const none = Promise.resolve<Record<string, string>>({})
  const reading = a.head ? lsTree($, repo, a.head, paths) : none
  const [before, after] = await Promise.all([
    reading,
    b.head === a.head ? reading : b.head ? lsTree($, repo, b.head, paths) : none,
  ])
  if (!before || !after) return null

  return changedPaths(a, b, paths, before, after)
}

/** The top folder of the git repo that holds `folder`; null outside git. */
function repoOf($: EngineInterface, folder: string): Promise<string | null> {
  if (folder === root) return Promise.resolve(top)
  const known = repoTops.get(folder)
  if (known) return known
  const found = $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: folder, timeoutMs: 5000 }).then(
    r => (r.exitCode === 0 ? r.stdout.trim() || null : null),
    () => null,
  )
  repoTops.set(folder, found)

  return found
}

/**
 * Drops the checks that ran in a folder that is gone, such as a removed
 * worktree's: they can be neither fixed nor run again.
 */
async function dropGoneFolders($: EngineInterface) {
  const folders = [...new Set((await read($, CHECKS)).results.flatMap(c => (c.folder ? [c.folder] : [])))]
  const found = await Promise.all(folders.map(f => $.fs.exists(f).catch(() => true)))
  const gone = new Set(folders.filter((_f, i) => !found[i]))
  if (gone.size > 0) await update($, CHECKS, c => pruned(c, gone))
}

/**
 * Drops the checks whose folder is gone, then reads the working tree of each
 * repo in `repos`, or of each repo a recorded check ran in. A repo whose
 * content differs from its last reading makes the checks that ran there
 * stale. Readings run one at a time.
 */
function refreshTree($: EngineInterface, repos?: string[]): Promise<void> {
  refreshing = refreshing
    .then(async () => {
      await dropGoneFolders($)
      const checked = repos ?? (await read($, CHECKS)).results.flatMap(c => (c.repo ? [c.repo] : []))
      const before = await read($, SNAPSHOTS)
      for (const repo of new Set(checked)) {
        const snapshot = await readSnapshot($, repo)
        const last = before[repo]
        if (!snapshot || (last && sameSnapshot(last, snapshot))) continue
        // A path list git could not read counts as a change to code.
        const changes = last ? await contentChanges($, repo, last, snapshot) : []
        await update($, SNAPSHOTS, s => ({ ...s, [repo]: snapshot }))
        if (changes !== null && changes.length === 0) continue
        await update($, CHECKS, c => changed(c, repo, changes, root))
      }
    })
    .catch(() => undefined)

  return refreshing
}

/** Records how each check a Bash command ran ended, and in which folder; `cwd` is where the shell started. */
async function recordChecks($: EngineInterface, command: string, cwd: string, output: string, isError: boolean) {
  const runs = checkRuns(command, cwd, home)
  // With other checks in the command, the output's failure lines may be theirs.
  const isAlone = new Set(runs.map(x => x.call.name)).size === 1
  const ended = readResults(command, runs, output, isError).flatMap(r => {
    const own = runs.filter(x => x.call.name === r.call.name)
    // A folder the command hides, as after `cd "$(git rev-parse --show-toplevel)"`, is taken as the session's.
    const folders = new Set(own.map(x => x.folder ?? root))
    const [folder = root] = folders
    // A check run in several folders at once says nothing about any one of them.
    if (folders.size > 1) return []
    const failures = r.result === 'fail' && isAlone ? failureLines(output) : []

    return [{ ...r, folder, command: own[0]?.command ?? '', failures, target: own[0]?.target ?? NO_TARGET }]
  })
  if (ended.length === 0) return
  const results = await Promise.all(ended.map(async r => ({ ...r, repo: await repoOf($, r.folder) })))
  // Edits made before the check count as before it.
  await refreshTree(
    $,
    results.flatMap(r => (r.repo ? [r.repo] : [])),
  )
  const ranAt = await $.clock.now()
  await update($, CHECKS, c =>
    recorded(
      c,
      results.map(r => ({
        name: r.call.name,
        kind: r.call.kind,
        folder: r.folder,
        result: r.result,
        summary: r.summary,
        command: r.command,
        failures: r.failures,
        repo: r.repo,
        target: r.target,
      })),
      ranAt,
      root,
    ),
  )
}

/**
 * What the band and the pane draw: the session's own state, or the samples
 * `/inbox demo` shows in its place.
 */
async function drawnState($: EngineInterface): Promise<View & { now: number }> {
  const [ledger, stop, checks, settled, prViews, prFixesSent, isDemo, now] = await Promise.all([
    read($, LEDGER),
    read($, STOP),
    read($, CHECKS),
    read($, SETTLED),
    read($, PR_VIEWS),
    read($, PR_FIXES_SENT),
    read($, IS_DEMO),
    $.clock.now(),
  ])

  return { ...(isDemo ? demoView(now) : { ledger, stop, checks, settled, prViews, prFixesSent }), now }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    isOn = e.isInteractive
    if (!isOn) return r
    ;[sessionId, root, home] = await Promise.all([
      $.session.id(),
      $.session.root(),
      $.env.get('HOME').then(h => h ?? ''),
    ])
    isSaved = false
    // A reload stops any update the previous load had running, and state outlives
    // it, so an update in flight at load was cut off: record it as failed.
    const [git, presence, now, current, saved] = await Promise.all([
      $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd: root, timeoutMs: 5000 }).catch(() => null),
      update($, PRESENCE, p => (p.isUpdating ? { ...p, isUpdating: false, ledgerState: 'failed' as const } : p)),
      $.clock.now(),
      upgradeState($),
      $.store.get(`s:${sessionId}`) as Promise<{ savedAt: number; ledger: Ledger } | undefined>,
      $.command.register({ name: 'inbox', description: 'Show where this session stands and what is waiting on you' }),
      $.tool.register({ name: 'record_finding', description: FINDING_DESCRIPTION, inputSchema: FINDING_SCHEMA }),
      $.tool.register({ name: 'close', description: CLOSE_DESCRIPTION, inputSchema: CLOSE_SCHEMA }),
      syncTheme($),
    ])
    top = git?.exitCode === 0 ? git.stdout.trim() || null : null
    const sessionRepo = top
    if (sessionRepo !== null) await update($, CHECKS, c => addRepo(c, sessionRepo))
    // A reload cancels the timers that clear just-closed rows, so the rows still showing get new ones.
    const settled = await update($, SETTLED, s => s.filter(x => now - x.at < SETTLED_MS))
    if (settled.length > 0) expireSettled($, settled, Math.max(...settled.map(s => s.at + SETTLED_MS - now)))
    let loaded = current
    if (current.turn === 0 && !current.card) {
      if (saved) {
        // A resumed session: bring its card back and show it as a return.
        loaded = upgradeLedger(saved.ledger)
        await update($, LEDGER, () => loaded)
        await update($, PRESENCE, p => ({ ...p, lastActiveAt: saved.savedAt, isAway: true }))
      } else {
        const prev = (await $.store.get(`p:${root}`)) as Omit<Previous, 'isBroughtIn'> | undefined
        if (prev?.ledger.card && now - prev.savedAt < PREVIOUS_MAX_AGE_MS) {
          await update($, PREVIOUS, () => ({ ...prev, ledger: upgradeLedger(prev.ledger), isBroughtIn: false }))
        }
      }
    }
    $.clock.every(60_000, () => {
      void tick($)
    })
    $.clock.every(PR_POLL_MS, () => {
      void pollPrs($)
    })
    // Catch up now after a failed update; after a turn whose reply never reached
    // the ledger, as when a reload cut off the end-of-turn hook before it queued the
    // update; or when the ledger is empty in a conversation that already has turns:
    // the mod loaded mid-session, or its saved state was lost.
    const isEmpty = !loaded.card && loaded.items.length === 0
    const { turnsStarted, turnsApplied } = await read($, PRESENCE)
    if (
      presence.ledgerState !== 'current' ||
      turnsStarted > turnsApplied ||
      (isEmpty && (await $.session.turns().catch(() => 0)) > 0)
    )
      queueUpdate($, null)
    void publishStatus($)
    // A resumed session's linked PRs; the branch's PR waits for the PRs tab.
    if (loaded.prs.length > 0) void fetchPrs($, false)

    return r
  })

  on('session.end', async ($, e, next) => {
    // The pane outlives the session, so its sidebar line goes with it.
    if (isOn) {
      await Promise.all([
        update($, STOP, () => null),
        update($, DIALOGS, () => []),
        update($, CHECKS, () => NO_CHECKS),
        update($, PR_FIXES_SENT, () => ({})),
        update($, SNAPSHOTS, () => ({})),
        update($, SETTLED, () => []),
        update($, IS_DEMO, () => false),
        publishStatus($, true),
      ])
    }
    if (isOn && e.reason === 'clear') {
      await Promise.all([
        update($, LEDGER, () => EMPTY),
        update($, PREVIOUS, () => null),
        update($, PRESENCE, p => ({ ...p, isAway: false, ledgerState: 'current' as const })),
      ])
      resetTurn()
      shellCommand = null
      toldInbox = null
      toldClosed = new Set()
      contextFor.clear()
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
    result: await recordFinding($, e as unknown as Record<string, unknown>),
  }))
  on('tool.describe', { tool: CLOSE_TOOL }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }))
  on('tool.check', { tool: CLOSE_TOOL }, () => ({ decision: 'allow' }))
  on('tool.call', { tool: CLOSE_TOOL }, async ($, e) => ({
    result: await recordClose($, e as unknown as Record<string, unknown>),
  }))

  on('tool.call', async ($, e, next) => {
    if (!isOn) return next(e)
    const { tool: _tool, tool_use_id: _id, agentId: _agent, ...input } = e as unknown as Record<string, unknown>
    const key = callKey(String(e.tool), input)
    const run = async () => {
      const ran = await clearingDialog($, key, () => next(e))
      // A file edited by Claude or a subagent makes its repo one of the session's.
      const path = input[e.tool === 'NotebookEdit' ? 'notebook_path' : 'file_path']
      if (EDIT_TOOLS.has(String(e.tool)) && typeof path === 'string' && typeof ran.deny !== 'string') {
        const repo = await repoOf($, path.slice(0, Math.max(path.lastIndexOf('/'), 1)))
        if (repo !== null) await update($, CHECKS, c => addRepo(c, repo))
      }

      return ran
    }
    // A subagent's call can raise a permission prompt too, which the person answers.
    if (e.agentId) return run()
    const line = toolActivity(String(e.tool), input)
    if (line) noteActivity(line)
    if (e.tool === 'Bash') {
      // A command moved to the background has not finished its checks.
      const calls = e.run_in_background ? [] : checksIn(e.command)
      // The command's own `cd` moves the session's folder, so read where it starts first.
      const cwd = calls.length > 0 ? await $.session.cwd() : null
      const ran = await run()
      const output = resultFields(ran)
      if (cwd !== null && !output.interrupted && !output.backgroundTaskId && typeof ran.deny !== 'string') {
        await recordChecks($, e.command, cwd, ran.text ?? '', ran.isError === true)
      }
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

  // A reply that claims a check passes when its latest run failed, or ran
  // before the last edit, sends Claude back once to run it or say so.
  on('classic.Stop', async ($, e, next) => {
    const r = await next(e)
    if (!isOn || e.agent_id) return r
    const reply = e.last_assistant_message ?? ''
    if (!reply.trim()) return r
    const result = r.block || e.stop_hook_active ? r : await blockOnClaim($, r, reply)
    // The reply Claude is sent back from never becomes the turn's final answer.
    if (result.block) sentBack.push(reply)

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    isTurnRunning = false
    // No dialog outlives the turn that raised it.
    await closeDialogs($, null)
    if (!isOn) return r
    // A check still failing when Claude stops waits on the person, in the Needs you tab.
    await update($, CHECKS, turnEnded)
    if (e.reason !== 'answer' || e.answer.trim() === '') return r

    let checks = await read($, CHECKS)
    if (checks.results.length > 0) {
      await refreshTree($)
      checks = await read($, CHECKS)
    }
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
      checks: checks.results.map(c => checkLine(c, root)),
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
  on(
    'session.append',
    { door: ['prompt', 'delivery'], origin: { kind: 'plugin', name: 'inbox' } },
    async ($, e, next) => {
      if (!isOn || e.agentId) return next(e)
      const text = messageText(e.message)
      const context = contextFor.get(text)
      contextFor.delete(text)
      if (context) await appendContext($, context)

      return next(e)
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
    const isDemo = e.args.trim() === 'demo' ? await update($, IS_DEMO, d => !d) : await read($, IS_DEMO)
    const opened = await openPane($)
    if (opened.isPlaced && (await read($, TAB)) === 'prs') void findPrs($)

    return {
      text: isDemo ? 'Showing sample entries in the inbox. Run /inbox demo again to go back.' : 'Opened the inbox.',
    }
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
    const [{ ledger, prViews: prs, stop, checks, settled, now }, presence, prev] = await Promise.all([
      drawnState($),
      read($, PRESENCE),
      read($, PREVIOUS),
    ])
    const isWorking = e.props.isWorking

    // A stop is the one thing to act on, so it takes the band.
    if (stop) {
      return (
        <Text wrap="truncate-end">
          <Text color="error">! Stopped {ago(now - stop.at)}: </Text>
          {stopText(stop)}. <Text dimColor>{stopFix(stop)}</Text>
        </Text>
      )
    }

    if (prev && ledger.turn === 0) {
      const c = prev.ledger.card
      const waiting = prev.ledger.items.length

      return (
        <Box flexDirection="column">
          <Text bold>
            Last session in this folder <Text dimColor>· {ago(now - prev.savedAt)}</Text>
          </Text>
          {c && <Text wrap="truncate-end"> Goal {c.goal}</Text>}
          {c?.now && (
            <Text wrap="truncate-end" dimColor>
              {' '}
              Now {c.now}
            </Text>
          )}
          {waiting > 0 && (
            <Text wrap="truncate-end" dimColor>
              {'  '}
              {waiting} {waiting === 1 ? 'item was' : 'items were'} waiting on you
            </Text>
          )}
          <Box flexDirection="row" gap={1}>
            {prev.isBroughtIn ? (
              <Text dimColor> Added to your next message.</Text>
            ) : (
              <Button
                key="bring"
                label="Continue from it"
                variant="primary"
                onPress={() => update($, PREVIOUS, p => (p ? { ...p, isBroughtIn: true } : p))}
              />
            )}
            <Button key="dismiss-prev" label="Dismiss" onPress={() => update($, PREVIOUS, () => null)} />
          </Box>
        </Box>
      )
    }

    const card = ledger.card
    // A failed check gets a line of its own, so a narrow band cannot cut it off.
    const lines = bandLines(checks, root)
    const failedRows = lines.failing.map(c => (
      <Text wrap="truncate-end" color="error">
        {'  '}
        {checkLine(c, root)}
      </Text>
    ))

    if (!card && ledger.items.length === 0 && ledger.findings.length === 0 && settled.length === 0) {
      // Before the session's first card, failed checks are all the band has to show.
      if (isWorking || failedRows.length === 0) return next(e)

      return <Box flexDirection="column">{failedRows}</Box>
    }
    const settledHint = settled.map(s => (
      <Text color={DONE}>
        {' · ✓ '}
        {s.ask} → {outcomeText(s)}
      </Text>
    ))

    const goal = card?.goal || 'This session'
    const waiting = needsYouCount(ledger, checks)
    const findingCount = ledger.findings.length
    const prAlert = prAttention(Object.values(prs.views))
    // The items themselves live in /inbox; the band only says how many wait.
    const hints = [
      ...settledHint,
      waiting > 0 ? <Text color={NEEDS_YOU}> · {waiting} waiting on you in /inbox</Text> : null,
      findingCount > 0 ? (
        <Text color={FINDINGS}> · {findingCount === 1 ? '1 finding' : `${findingCount} findings`} in /inbox</Text>
      ) : null,
      prAlert ? <Text color={PRS}> · {prAlert}</Text> : null,
    ]

    if (isWorking) {
      return (
        <Text wrap="truncate-end">
          <Text color={ACCENT}>◆ </Text>
          <Text dimColor>{goal}</Text>
          {settledHint}
          {waiting > 0 ? <Text color={NEEDS_YOU}> · {waiting} waiting on you</Text> : null}
        </Text>
      )
    }

    const openRows = (card?.running ?? []).slice(0, 3).map(run => (
      <Text wrap="truncate-end">
        <Text color={DONE}> ● </Text>
        <Text dimColor>{run}</Text>
      </Text>
    ))

    if (presence.isAway && card) {
      const rows = [
        <Text wrap="truncate-end">
          <Text color={ACCENT}>◆ </Text>
          <Text bold>{card.goal}</Text>
          <Text dimColor> · last active {ago(now - presence.lastActiveAt)}</Text>
          {hints}
        </Text>,
        ...(card.done.length > 0
          ? [
              <Text wrap="truncate-end">
                <Text color={DONE}> ✓ </Text>
                <Text dimColor>{card.done.slice(-3).join(' · ')}</Text>
              </Text>,
            ]
          : []),
        <Text wrap="truncate-end">
          <Text dimColor> → </Text>
          {card.now}
        </Text>,
        ...(lines.summary.length > 0
          ? [
              <Text wrap="truncate-end" dimColor>
                {'  '}
                {lines.summary.map(c => checkLine(c, root)).join(' · ')}
              </Text>,
            ]
          : []),
        ...openRows,
        ...(ledger.closed.length > 0
          ? [
              <Text wrap="truncate-end" dimColor>
                {'  Closed: '}
                {ledger.closed.slice(-2).map(closedLine).join(' · ')}
              </Text>,
            ]
          : []),
      ]

      return <Box flexDirection="column">{rows.slice(0, Math.max(1, e.props.maxRows))}</Box>
    }

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text color={ACCENT}>◆ </Text>
          <Text dimColor>
            {goal}
            {card?.now ? ` · ${card.now}` : ''}
          </Text>
          {hints}
        </Text>
        {failedRows}
        {openRows}
      </Box>
    )
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined) await update($, THEME, () => (typeof r.value === 'string' ? r.value : ''))

    return r
  })

  // Sample entries can be selected and opened, but what they would send goes nowhere.
  on('ui.press', { plugin: 'inbox', requestId: PANE }, async ($, e, next) => {
    if (DEMO_PRESSES.test(e.element) || !(await read($, IS_DEMO))) return next(e)
    $.ui.toast(SAMPLE_PRESS)

    return { element: e.element }
  })
  on('ui.input', { plugin: 'inbox', requestId: PANE }, async ($, e, next) => {
    if (e.kind !== 'submit' || !(await read($, IS_DEMO))) return next(e)
    $.ui.toast(SAMPLE_PRESS)

    return { element: e.element, value: e.value }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Markdown, Text } = elements
    // The mobile app draws no text field, so there the typed reply is not offered.
    const Input = 'Input' in elements ? elements.Input : null
    // Inline above the prompt, the pane takes its room from the conversation, so
    // it drops the section cards, the tab panels and the blank lines between parts.
    const isInline = e.props.placement === 'inline'
    const blankLine = isInline ? 0 : 1
    const [
      { ledger, prViews: prState, prFixesSent, stop, checks, settled, now },
      presence,
      tab,
      selection,
      theme,
      typing,
      unfolded,
      isKeyListShown,
      isCheckDetailShown,
    ] = await Promise.all([
      drawnState($),
      read($, PRESENCE),
      read($, TAB),
      read($, SELECTION),
      read($, THEME),
      read($, TYPING),
      read($, UNFOLDED),
      read($, IS_KEY_LIST_SHOWN),
      read($, IS_CHECK_DETAIL_SHOWN),
    ])
    const card = ledger.card
    const prViews = Object.values(prState.views)
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
      /** Unselected, the row is one line: `before` muted, `text` as a button that selects the row, then `after`, muted or in a tone. */
      line?: { before?: string; text: string; after?: string; afterTone?: Tone }
      /** Unselected, text that does not fit beside `after` goes on a second line instead of being cut. */
      hasSecondLine?: boolean
      body?: JSX.Element | null
      keys: () => KeyAction[]
      /** Actions that talk about the row or drop it, after `keys` and a muted dot. */
      moreKeys?: () => KeyAction[]
      /** Where the person's own words go, for a row that takes them. */
      onType?: (text: string) => void
      typeHint?: string
    }
    // An item's group header says whether it is a question or a task, so the row
    // needs no context line. The recommended answer is marked on its key.
    const itemRow = (item: Item, handle: string): Row => {
      const asked = item.at === null ? undefined : ` · ${ago(now - item.at)}`

      return {
        id: item.id,
        handle,
        title: item.ask,
        titleAfter: asked,
        hasSecondLine: item.kind === 'question',
        body: null,
        keys: () => itemKeys($, item).keys,
        moreKeys: () => itemKeys($, item).more,
        onType: (text: string) => void sendTypedForItem($, item, text),
        typeHint: item.kind === 'task' ? 'Your reply to Claude' : 'Your answer',
      }
    }
    const findingRow = (finding: Finding): Row => ({
      id: finding.id,
      handle: '•',
      title: finding.title,
      meta: (
        <Text wrap="truncate-end">
          <Text color={pal.mark[FINDING_BADGES[finding.kind].tone]}>{FINDING_BADGES[finding.kind].mark} </Text>
          <Text color={pal.tone[FINDING_BADGES[finding.kind].tone]}>{FINDING_BADGES[finding.kind].label}</Text>
          <Text color={pal.muted}> {ago(now - finding.at)}</Text>
        </Text>
      ),
      line: { text: finding.title, after: ` · ${ago(now - finding.at)}` },
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
      onType: (text: string) => void sendTypedForFinding($, finding, text),
      typeHint: 'Your reply to Claude',
      keys: () => [
        {
          key: `address-${finding.id}`,
          label: 'Address it',
          hotkey: 'a',
          onPress: () => void actOnFinding($, finding, 'address'),
        },
      ],
      moreKeys: () => [
        {
          key: `typekey-${finding.id}`,
          label: 'Type a reply',
          hotkey: 't',
          onPress: () => void startTyping($, finding.id),
        },
        {
          key: `discuss-${finding.id}`,
          label: 'Discuss',
          hotkey: 'e',
          onPress: () => void actOnFinding($, finding, 'discuss'),
        },
        { key: `drop-${finding.id}`, label: 'Dismiss', hotkey: 'x', onPress: () => void removeFinding($, finding.id) },
      ],
    })
    // A Fix mark holds only for the run it was pressed on, so a rerun that fails again asks for the person again.
    const prFixSentAt = (pr: PrView, c: PrCheck) => {
      const sent = prFixesSent[prCheckId(pr, c)]

      return sent && sent.url === c.url ? sent.at : null
    }
    const checkRow = (pr: PrView, c: PrCheck): Row => {
      const sentAt = prFixSentAt(pr, c)

      return {
        id: prCheckId(pr, c),
        handle: '✗',
        handleTone: 'error',
        meta: (
          <Text color={pal.tone.error} bold>
            Failing check
          </Text>
        ),
        title: c.name,
        line:
          sentAt === null
            ? { text: c.name, after: ' · failing check', afterTone: 'error' }
            : { text: c.name, after: ` · fix sent ${ago(now - sentAt)}`, afterTone: 'done' },
        body: sentAt === null ? null : <Text color={pal.tone.done}>Fix sent · {ago(now - sentAt)}</Text>,
        keys: () => [
          {
            key: `fix-${pr.ref}-${c.name}`,
            label: sentAt === null ? 'Fix' : 'Fix again',
            hotkey: 'a',
            onPress: () => void sendPrFix($, pr, c),
          },
          {
            key: `log-${pr.ref}-${c.name}`,
            label: 'Open log',
            hotkey: 'o',
            onPress: () => void openUrl($, c.url ?? pr.url),
          },
        ],
      }
    }
    // What failed in up to two lines, naming the file, with the output and the
    // command folded under Details. Once Fix is pressed, the row waits on Claude.
    const failedCheckRow = (c: Check): Row => {
      const id = `check:${checkKey(c)}`
      const { file, text } = failureSummary(c)
      // Without failure lines, the summary above is the output's only line.
      const output = outputLines(c).filter(line => line !== text)
      const hasDetail = c.command !== '' || output.length > 0
      const fixSent = c.fixSentAt === null ? null : `Fix sent · ${ago(now - c.fixSentAt)}`
      const fix = {
        key: `fix-${id}`,
        label: fixSent ? 'Fix again' : 'Fix',
        hotkey: 'a',
        onPress: () => void sendFix($, c),
      }
      const dismiss = { key: `dismiss-${id}`, label: 'Dismiss', hotkey: 'x', onPress: () => void dismissCheck($, c) }

      return {
        id,
        handle: '✗',
        handleTone: 'error',
        title: checkName(c, root),
        titleAfter: ` · ${ago(now - c.ranAt)}${c.isStale ? ', before the last edit' : ''}`,
        line:
          c.fixSentAt === null
            ? { text: checkName(c, root), after: `${file ? ` · ${file}` : ''} · ${ago(now - c.ranAt)}` }
            : { text: checkName(c, root), after: ` · fix sent ${ago(now - c.fixSentAt)}`, afterTone: 'done' },
        body: (
          <Box flexDirection="column">
            {wrapLines(file ? `${file}: ${text}` : text, e.props.bodyColumns - 10, 2).map(line => (
              <Text wrap="truncate-end">{line}</Text>
            ))}
            {hasDetail ? (
              <Box flexDirection="row">
                <Button
                  plain
                  key={`fold-details-${id}`}
                  label={isCheckDetailShown ? '▾ Details' : '▸ Details'}
                  onPress={() => void update($, IS_CHECK_DETAIL_SHOWN, shown => !shown)}
                />
              </Box>
            ) : null}
            {hasDetail && isCheckDetailShown ? (
              // The output's failure lines, then where and how it ran, as a shell prompt would show it.
              <Box flexDirection="column" rowGap={blankLine}>
                {output.length > 0 ? (
                  <Box flexDirection="column">
                    {output.map(line => (
                      <Text wrap="wrap">{line}</Text>
                    ))}
                  </Box>
                ) : null}
                {c.command ? (
                  <Text wrap="wrap" color={pal.muted}>
                    {c.folder ? `${tilde(c.folder)} ` : ''}$ {tilde(c.command)}
                  </Text>
                ) : null}
              </Box>
            ) : null}
            {fixSent ? (
              <Box marginTop={blankLine}>
                <Text color={pal.tone.done}>{fixSent}</Text>
              </Box>
            ) : null}
          </Box>
        ),
        keys: () => [fix],
        moreKeys: () => [dismiss],
      }
    }
    const threadRow = (pr: PrView, t: PrThread): Row => {
      const latest = t.reply ?? { author: t.author, body: t.body }

      return {
        id: `${pr.ref} thread ${t.id}`,
        handle: '◦',
        meta: (
          <Text wrap="truncate-end">
            <Text color={pal.tone.prs} bold>
              Review thread
            </Text>
            <Text color={pal.muted}>
              {t.replies > 0 ? ` · ${t.replies + 1} comments` : ''}
              {t.isOutdated ? ' · outdated' : ''}
            </Text>
          </Text>
        ),
        title: threadWhere(t),
        line: { before: `${threadWhere(t, baseName(t.path))} `, text: commentLine(latest.body) },
        body: (
          <Box flexDirection="column">
            {t.reply ? (
              <Text color={pal.muted} wrap="wrap">
                @{t.author}: {clipLabel(commentLine(t.body), 200)}
              </Text>
            ) : null}
            <Markdown text={`**@${latest.author}:** ${clipLabel(readableComment(latest.body), 1200)}`} />
          </Box>
        ),
        keys: () => [
          {
            key: `address-${t.id}`,
            label: 'Address',
            hotkey: 'a',
            onPress: () => void send($, prompts.address(pr, [t])),
          },
          {
            key: `draft-${t.id}`,
            label: 'Draft reply',
            hotkey: 'r',
            onPress: () => void send($, prompts.draft(pr, t)),
          },
          {
            key: `open-${t.id}`,
            label: 'Open',
            hotkey: 'o',
            onPress: () => void openUrl($, t.reply?.url || t.url || pr.url),
          },
        ],
        moreKeys: () => [
          {
            key: `discuss-${t.id}`,
            label: 'Discuss',
            hotkey: 'e',
            onPress: () => void send($, prompts.discuss(pr, t)),
          },
        ],
      }
    }

    // Each tab's rows in order: the cursor, the counts and the drawing all read these.
    const { rows: failedChecks, count: checksNeedingYou } = needsYou(checks, root)
    const failedCheckRows = failedChecks.map(failedCheckRow)
    const needsYouGroups = NEEDS_YOU_GROUPS.map(g => ({
      ...g,
      rows: listedItems(ledger.items, g.kind).map((item, n) =>
        itemRow(item, g.kind === 'question' ? `${n + 1})` : '•'),
      ),
    }))
    const prGroups = prViews.map(pr => ({
      pr,
      rows: [...failingChecks(pr).map(c => checkRow(pr, c)), ...waitingThreads(pr).map(t => threadRow(pr, t))],
    }))
    const rows: Record<Tab, Row[]> = {
      needsYou: [...failedCheckRows, ...needsYouGroups.flatMap(g => g.rows)],
      findings: [...ledger.findings].reverse().map(findingRow),
      prs: prGroups.flatMap(g => g.rows),
    }
    // What each tab's count says waits on the person: a check whose fix went to Claude waits on Claude.
    const tabCounts: Record<Tab, number> = {
      needsYou: needsYouCount(ledger, checks),
      findings: rows.findings.length,
      prs: rows.prs.length - prViews.flatMap(pr => failingChecks(pr).filter(c => prFixSentAt(pr, c) !== null)).length,
    }
    const ids = rows[tab].map(r => r.id)
    const indexOf = new Map(ids.map((id, n) => [id, n]))
    const at = selectedIndex(ids, selection[tab])

    // A Button draws its hotkey in the theme's accent, which Claude Code's light
    // theme draws at 2.9:1 on the selected row. So a key's letter is Text in the
    // palette's color, its label a Button, and the key itself a hidden Button.
    const keyedButton = ({ hotkey, ...action }: KeyAction) => (
      <Box key={`keyed-${action.key}`} flexDirection="row">
        <Text color={pal.key}>{hotkey}</Text>
        <Button plain {...action} label={`: ${action.label}`} />
      </Box>
    )
    // A row's other actions follow its main ones after a muted dot.
    const keyRow = (keys: KeyAction[], more: KeyAction[] = []) => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {keys.map(keyedButton)}
        {keys.length > 0 && more.length > 0 ? <Text color={pal.muted}>·</Text> : null}
        {more.map(keyedButton)}
      </Box>
    )
    // The Buttons that take the pane's keys, drawn in a hidden Box.
    const keyBindings = (keys: KeyAction[], suffix = '') =>
      keys.map(({ key, ...k }) => <Button key={`${key}${suffix}`} plain {...k} />)
    // A selected row's secondary keys share its key row when they fit, and
    // otherwise take a line of their own rather than wrap mid-row. A key draws
    // "key: label", and keyRow puts 2 columns between keys and the dot.
    const keysWidth = (keys: KeyAction[], more: KeyAction[]) => {
      const all = [...keys, ...more]
      const dot = keys.length > 0 && more.length > 0 ? 3 : 0

      return all.reduce((w, k) => w + k.hotkey.length + 2 + k.label.length, 0) + 2 * Math.max(0, all.length - 1) + dot
    }
    // A typed reply needs a text field, so it is left out where there is none.
    const pressable = (keys: KeyAction[]) => keys.filter(k => Input || !k.key.startsWith('typekey-'))
    // A section's children hang from its title like a directory listing. A
    // child's row has a 1-column bar, 3 columns for the tree, 3 for its marker,
    // then its text. `branch` draws the tree: ├─ on the child's first line, or
    // └─ on the last child's, then │ below while siblings follow; `pass` is │
    // throughout, for a block between a title and its children. The lines sit
    // in an absolute Box that spans the row, however it wraps, and the row clips
    // the rest. The row clips, not this Box: once its row scrolled out of view,
    // Claude Code drew lines this Box clipped elsewhere in the pane (anthropics/claude-code#100030).
    const branch = (pos: TreePos, lead = 0) => (
      <Box position="absolute" top={0} bottom={0} left={1} width={2}>
        <Text color={pal.line}>{treeText(pos, lead)}</Text>
      </Box>
    )
    // A row with no marker, such as a group's empty line, starts its text right after the tree.
    const treeRow = (pos: TreePos | null, marker: JSX.Element | null, content: JSX.Element, key?: string) => (
      <Box key={key} flexDirection="row" overflow="hidden">
        <Box width={4} flexShrink={0} />
        {marker ? (
          <Box width={3} flexShrink={0}>
            {marker}
          </Box>
        ) : null}
        <Box flexDirection="column" flexShrink={1} flexGrow={1} paddingRight={1}>
          {content}
        </Box>
        {pos ? branch(pos) : null}
      </Box>
    )
    const childPos = (n: number, count: number): TreePos => (n === count - 1 ? 'last' : 'mid')
    // A list's rows with a divider between each two. It starts where the rows'
    // text starts and runs to the pane's edge; in a section, the tree's │ passes it.
    // A divider line from `inset` columns in to the pane's edge.
    const rule = (inset: number) => (
      <Text color={pal.divider}>{'─'.repeat(Math.max(0, e.props.bodyColumns - inset))}</Text>
    )
    const divided = (rowEls: JSX.Element[], group: string, isTree: boolean) =>
      rowEls.flatMap((el, n) =>
        n === 0 || isInline
          ? [el]
          : [
              isTree ? (
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
    // The selected row gets a blue background, or a bar where the palette has
    // no selection color, and reads top to bottom:
    // context line, title, body, keys. In the docked pane a blank line sets each
    // part off. The handle is a Button, so a click selects the row.
    // A Button label does not wrap or truncate, so the clickable text is clipped
    // to what fits beside the handle and the row's other text.
    // A row with a second line breaks its text at a space before `after`, which
    // stays on the first line, and clips the rest to the second.
    const unselectedLine = (row: Row, onPress: () => void, inset: number) => {
      const line = row.line ?? { text: row.title, after: row.titleAfter }
      const width = e.props.bodyColumns - 3 - inset - (line.before?.length ?? 0)
      const room = Math.max(12, width - (line.after?.length ?? 0))
      const text = line.text.trim()
      const space = text.lastIndexOf(' ', room)
      const isWrapped = row.hasSecondLine === true && text.length > room && space > 0
      const first = isWrapped ? text.slice(0, space) : clipLabel(text, room)
      const second = isWrapped ? clipLabel(text.slice(space + 1), Math.max(12, width)) : null

      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            {line.before ? <Text color={pal.muted}>{line.before}</Text> : null}
            <Button plain key={`title-${row.id}`} label={first} onPress={onPress} />
            {line.after ? (
              <Text wrap="truncate-end" color={line.afterTone ? pal.tone[line.afterTone] : pal.muted}>
                {line.after}
              </Text>
            ) : null}
          </Box>
          {second ? (
            <Box paddingLeft={line.before?.length ?? 0}>
              <Button plain key={`title-${row.id}-2`} label={second} onPress={onPress} />
            </Box>
          ) : null}
        </Box>
      )
    }
    // `tree` places the row as a section's child; without it, as in Findings, the
    // handle sits in the 4 columns after the bar.
    const listRow = (row: Row, tree?: TreePos) => {
      const index = indexOf.get(row.id) ?? -1
      const isSelected = index === at
      const keys = isSelected ? pressable(row.keys()) : []
      const more = isSelected ? pressable(row.moreKeys?.() ?? []) : []

      return (
        <Box
          key={`row-${row.id}`}
          flexDirection="row"
          overflow="hidden"
          backgroundColor={isSelected ? pal.selection : undefined}
        >
          <Box width={1} flexShrink={0} />
          {tree ? <Box width={3} flexShrink={0} /> : null}
          <Box width={tree ? 3 : 4} flexShrink={0} paddingLeft={tree ? 0 : 2} paddingY={isSelected ? blankLine : 0}>
            {row.handleTone ? (
              <Text color={pal.mark[row.handleTone]}>{row.handle}</Text>
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
                {row.titleAfter ? <Text color={pal.muted}>{row.titleAfter}</Text> : null}
              </Text>
              {row.body ? <Box marginTop={blankLine}>{row.body}</Box> : null}
              <Box flexDirection="column" marginTop={blankLine}>
                {keys.length === 0
                  ? keyRow(more)
                  : keysWidth(keys, more) <= e.props.bodyColumns - 3 - (tree ? 7 : 5)
                    ? keyRow(keys, more)
                    : [keyRow(keys), keyRow(more)]}
              </Box>
              {Input && row.onType && typing === row.id ? (
                <Box marginTop={blankLine}>
                  <Input
                    key={`type-${row.id}`}
                    placeholder={row.typeHint}
                    submitLabel="send"
                    autoFocus
                    onSubmit={(value: string) => row.onType?.(value)}
                  />
                </Box>
              ) : null}
            </Box>
          ) : (
            <Box flexShrink={1} flexGrow={1} paddingRight={1}>
              {unselectedLine(row, () => void select($, tab, row.id, index), tree ? 7 : 5)}
            </Box>
          )}
          {tree ? branch(tree, isSelected ? blankLine : 0) : null}
          {/* What select() scrolls into view. Drawn on the selected row alone, so the key exists
          only once that row has redrawn expanded. */}
          {isSelected ? (
            <Box key={`view-${row.id}`} position="absolute" top={0} bottom={0} left={0} width={1}>
              {pal.selection ? null : <Text color={pal.key}>{SELECTION_BAR}</Text>}
            </Box>
          ) : null}
        </Box>
      )
    }
    const emptyLine = (text: string) => (
      <Box paddingLeft={1}>
        <Text color={pal.muted} wrap="wrap">
          {text}
        </Text>
      </Box>
    )

    const newest = prViews.reduce((t, v) => Math.max(t, v.fetchedAt), 0)
    const status =
      tab === 'prs' && prViews.length > 0
        ? prState.isFetching
          ? 'Refreshing PRs'
          : `PRs checked ${ago(now - newest)}`
        : presence.isUpdating
          ? 'Updating…'
          : card
            ? `Updated ${ago(now - card.updatedAt)}`
            : 'Not updated yet'

    // The keys no row shows, listed in the footer.
    const keyList = [
      { keys: TABS.map(t => t.hotkey).join(' '), does: 'Switch tabs' },
      { keys: 'j k', does: 'Select the next or previous row' },
      { keys: 'ctrl+x tab', does: 'Move focus between the pane and the prompt' },
    ]
    const keyColumn = Math.max(...keyList.map(k => k.keys.length)) + 2

    // The tab bar is drawn on the pane's own background, as part of the pane's
    // title bar, with when the inbox last updated at its right end, or under the
    // tabs when the pane is too narrow. Inline, its names line up with the group titles.
    const tabs = (
      <Box
        paddingLeft={isInline ? 2 : 1}
        paddingRight={1}
        flexDirection="row"
        flexWrap="wrap"
        alignItems="center"
        justifyContent="space-between"
        columnGap={3}
      >
        <Box flexDirection="row" columnGap={isInline ? 3 : 1}>
          {TABS.map(({ id, label }) => {
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

            const width = `${label}${count > 0 ? ` ${count}` : ''}`.length + 2

            // The selected tab is a raised panel three lines tall, with its name on
            // the middle line and a line of its color along the top edge.
            if (tab === id)
              return (
                <Box flexDirection="column">
                  <Text color={pal.mark[id]} backgroundColor={pal.raised}>
                    {'▔'.repeat(width)}
                  </Text>
                  <Text backgroundColor={pal.raised}>
                    {' '}
                    <Text bold color={pal.raisedText} backgroundColor={pal.raised}>
                      {label}
                    </Text>
                    {count > 0 ? (
                      <Text bold color={pal.tone[id] ?? pal.raisedText} backgroundColor={pal.raised}>
                        {' '}
                        {count}
                      </Text>
                    ) : null}{' '}
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
                  <Button plain key={`tab-${id}-before`} label=" " hover={raise} onPress={show} />
                  <Button plain key={`tab-${id}`} label={label} hover={raise} onPress={show} />
                  {count > 0 ? (
                    <Text color={pal.tone[id]} hover={raise}>
                      {' '}
                      {count}
                    </Text>
                  ) : null}
                  <Button plain key={`tab-${id}-after`} label=" " hover={raise} onPress={show} />
                </Box>
                <Button plain key={`tab-${id}-below`} label={' '.repeat(width)} hover={raise} onPress={show} />
              </Box>
            )
          })}
        </Box>
        <Box flexDirection="row" columnGap={2}>
          <Text color={pal.muted}>{status}</Text>
          {presence.ledgerState === 'failed' && !presence.isUpdating ? (
            <Text color={pal.tone.error}>update failed, retries after the next reply</Text>
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
      <Box paddingLeft={1}>
        <Text>
          {title}
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
              <Text color={pal.line}>{hasChildren ? '│' : ' '}</Text>
            </Box>,
          ]
    const needsYouView = () => {
      // An item that just closed stays where its row was in its group, with a
      // check and its outcome, until it joins the group's closed items. It
      // cannot be selected.
      const fresh = [...settled].sort((a, b) => a.index - b.index)
      const showing = new Set(settled.map(s => s.id))
      const settledRow = (s: Settled, pos: TreePos) =>
        treeRow(
          pos,
          <Text color={pal.mark.done}>✓</Text>,
          <Box flexDirection="column">
            <Text wrap="truncate-end" color={pal.muted}>
              {s.ask}
            </Text>
            <Text wrap="wrap" color={pal.tone.done}>
              {outcomeText(s)}
            </Text>
          </Box>,
          `settled-${s.id}`,
        )
      // A closed item under its group's open ones: what was asked, then how it closed and when.
      const closedRow = (d: Closed, pos: TreePos) =>
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
              <Text color={pal.muted}> · {ago(now - d.at)}</Text>
            </Text>
          </Box>,
          `closed-${d.id}`,
        )
      // The row that folds or unfolds a group's closed items, with how many there are.
      const foldRow = (kind: Item['kind'], count: number, isUnfolded: boolean, pos: TreePos) => {
        const toggle = () =>
          void update($, UNFOLDED, u => (u.includes(kind) ? u.filter(k => k !== kind) : [...u, kind]))

        // One Button for the arrow and the count; the two spaces put the count where other rows' text starts.
        return treeRow(
          pos,
          null,
          <Box flexDirection="row">
            <Button plain key={`fold-${kind}`} label={`${isUnfolded ? '▾' : '▸'}  ${count} Closed`} onPress={toggle} />
          </Box>,
          `fold-row-${kind}`,
        )
      }
      const groups = needsYouGroups.map(g => {
        const entries: ({ row: Row } | { settled: Settled })[] = g.rows.map(row => ({ row }))
        for (const s of fresh.filter(x => x.kind === g.kind))
          entries.splice(Math.min(s.index, entries.length), 0, { settled: s })
        const closed = ledger.closed
          .filter(d => d.kind === g.kind && !showing.has(d.id))
          .slice(-CLOSED_SHOWN)
          .reverse()
        const isUnfolded = unfolded.includes(g.kind)
        // The group's children in order: its open items, or a line saying it has
        // none; then the fold row and, unfolded, the closed items.
        const top: ((pos: TreePos) => JSX.Element)[] =
          entries.length > 0
            ? entries.map(x => (pos: TreePos) => ('row' in x ? listRow(x.row, pos) : settledRow(x.settled, pos)))
            : [
                (pos: TreePos) =>
                  treeRow(
                    pos,
                    null,
                    <Text color={pal.muted} wrap="wrap">
                      {g.empty}
                    </Text>,
                    `empty-${g.kind}`,
                  ),
              ]
        const rest: ((pos: TreePos) => JSX.Element)[] =
          closed.length === 0
            ? []
            : [
                (pos: TreePos) => foldRow(g.kind, closed.length, isUnfolded, pos),
                ...(isUnfolded ? closed.map(d => (pos: TreePos) => closedRow(d, pos)) : []),
              ]
        const count = top.length + rest.length
        const open = divided(
          top.map((draw, n) => draw(childPos(n, count))),
          g.kind,
          true,
        )
        // Each closed item is two lines, so a blank line of the tree sets it and the fold row apart.
        const tail = rest.flatMap((draw, n) => [...titleGap(), draw(childPos(top.length + n, count))])

        return section([groupTitle(g.title, g.rows.length), ...titleGap(), ...open, ...tail])
      })
      // Checks still failing when Claude stopped come first, since they block the work. The group shows only with some.
      const failed =
        failedCheckRows.length > 0
          ? [
              section([
                groupTitle('Failing checks', checksNeedingYou),
                ...titleGap(),
                ...divided(
                  failedCheckRows.map((row, n) => listRow(row, childPos(n, failedCheckRows.length))),
                  'checks',
                  true,
                ),
              ]),
            ]
          : []
      // A stop is fixed in the session, not here, so it shows above the list without keys.
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
                <Text wrap="wrap">
                  {capitalized(stopText(stop))}. {stopFix(stop)}
                </Text>
              </Box>,
            ),
          ]
        : []

      return (
        <Box flexDirection="column" gap={1}>
          {outside}
          {failed}
          {groups}
        </Box>
      )
    }

    const findingsView = () =>
      rows.findings.length === 0
        ? emptyLine(
            'No findings. Claude records one when it notices an issue or an opportunity outside the current task.',
          )
        : section(
            divided(
              rows.findings.map(r => listRow(r)),
              'findings',
              false,
            ),
          )

    const prBlock = ({ pr, rows: prRows }: { pr: PrView; rows: Row[] }) => {
      const { status, text: statusText } = readiness(pr)
      const { mark, tone } = PR_STATUSES[status]
      const hasRows = prRows.length > 0
      const counts = checkCounts(pr)
      const waitingOn = waitingThreads(pr)
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
            {pr.error ? (
              <Text color={pal.tone.error} wrap="wrap">
                Last refresh failed: {pr.error}
              </Text>
            ) : null}
            <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={blankLine}>
              {waitingOn.length > 1 ? (
                <Button
                  key={`address-all-${pr.ref}`}
                  label={`Address all ${waitingOn.length} threads`}
                  onPress={() => void send($, prompts.address(pr, waitingOn))}
                />
              ) : null}
              <Button key={`open-${pr.ref}`} label="Open PR" onPress={() => void openUrl($, pr.url)} />
              {pr.ref !== prState.branchRef ? (
                <Button key={`dismiss-pr-${pr.ref}`} label="Dismiss" onPress={() => void dismissPr($, pr.ref)} />
              ) : null}
            </Box>
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
      <Box flexDirection="column" gap={1}>
        {prGroups.length === 0
          ? emptyLine(
              prState.isFetching
                ? 'Checking for PRs…'
                : 'No PRs. A PR shows here when this session opens or links one, or when this branch has one.',
            )
          : prGroups.map(prBlock)}
      </Box>
    )

    const move = (step: number) => {
      const to = Math.min(Math.max(at + step, 0), ids.length - 1)
      void select($, tab, ids[to] ?? '', to)
    }
    const moveKeys: KeyAction[] =
      ids.length > 1
        ? [
            { key: 'next', label: 'Next', hotkey: 'j', onPress: () => move(1) },
            { key: 'previous', label: 'Previous', hotkey: 'k', onPress: () => move(-1) },
          ]
        : []
    const tabKeys: KeyAction[] = TABS.map(({ id, label, hotkey }) => ({
      key: `tab-key-${id}`,
      label,
      hotkey,
      onPress: () => void showTab($, id),
    }))

    const selectedRow = rows[tab][at]
    const rowKeys = selectedRow ? pressable([...selectedRow.keys(), ...(selectedRow.moreKeys?.() ?? [])]) : []

    // Docked, the pane takes at least the window's height, so the footer sits at
    // its bottom edge until the content is taller than the window. The engine has
    // no fixed footer, so past that it follows the content. Inline, the frame fits
    // the tree. A pane takes a key only as a Button's hotkey, so the tab keys, j,
    // k and the selected row's keys are Buttons in a hidden Box.
    return (
      <Box flexDirection="column" minHeight={isInline ? undefined : e.props.scroll.bodyRows} backgroundColor={pal.body}>
        {tabs}
        <Box flexDirection="column" paddingX={1} paddingTop={blankLine} flexGrow={1}>
          {tab === 'findings' ? findingsView() : tab === 'prs' ? prsView() : needsYouView()}
        </Box>
        {footer}
        <Box display="none">
          {keyBindings([...tabKeys, ...moveKeys])}
          {keyBindings(rowKeys, '-key')}
        </Box>
      </Box>
    )
  })
}
