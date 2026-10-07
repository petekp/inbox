import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionAppendMessage, UiPressArgument, UiScrollResult } from 'claude-code'

import type {
  Checks,
  Cursor,
  Decided,
  Dialog,
  Help,
  Item,
  Ledger,
  Finding,
  PrCheck,
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
  checkRuns,
  checkLine,
  checksIn,
  claimMessage,
  contradictedClaim,
  isTemporary,
  readResults,
  recordCheck,
} from './checks'
import { demoView } from './demo'
import type { View } from './demo'
import { candidates, changedPaths, readChanged, readLsTree, sameSnapshot } from './git'
import type { Exchange, Press, Update } from './ledger'
import {
  THREADS_QUERY,
  VIEW_FIELDS,
  checkCounts,
  failingChecks,
  parseRef,
  prAttention,
  prRefs,
  prompts,
  readThreads,
  readView,
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
    appliedTurn: 0,
    minute: 0,
  } as Presence,
)
const PREVIOUS = atom({ plugin: 'inbox', key: 'previous' } as const, null as Previous | null)
const TAB = atom({ plugin: 'inbox', key: 'tab' } as const, 'waiting' as Tab)
const NO_CURSOR: Cursor = { id: null, index: 0 }
const NO_SELECTION: Record<Tab, Cursor> = { waiting: NO_CURSOR, findings: NO_CURSOR, prs: NO_CURSOR }
const SELECTION = atom({ plugin: 'inbox', key: 'selection' } as const, NO_SELECTION)
// Whether Claude Code uses its `dark` theme, which picks the selected row's tint.
const IS_DARK_THEME = atom({ plugin: 'inbox', key: 'isDarkTheme' } as const, false)
const PR_VIEWS = atom(
  { plugin: 'inbox', key: 'prViews' } as const,
  { views: {}, branchRef: null, isFetching: false } as PrViews,
)
const STOP = atom({ plugin: 'inbox', key: 'stop' } as const, null as Stop | null)
const DIALOGS = atom({ plugin: 'inbox', key: 'dialogs' } as const, [] as Dialog[])
const NO_CHECKS: Checks = { results: [], changedAt: 0, codeChangedAt: 0 }
const CHECKS = atom({ plugin: 'inbox', key: 'checks' } as const, NO_CHECKS)
const SNAPSHOT = atom({ plugin: 'inbox', key: 'snapshot' } as const, null as Snapshot | null)
const TYPING = atom({ plugin: 'inbox', key: 'typing' } as const, null as string | null)
const SETTLED = atom({ plugin: 'inbox', key: 'settled' } as const, [] as Settled[])
const UNFOLDED = atom({ plugin: 'inbox', key: 'unfolded' } as const, [] as Item['kind'][])
// How long a closed item's row stays in place, with its outcome, before it moves to Closed.
const SETTLED_MS = 8000
const IS_DEMO = atom({ plugin: 'inbox', key: 'isDemo' } as const, false)
const SAMPLE_PRESS = 'Sample entry: nothing was sent. Run /inbox demo to go back.'
// The pane's buttons that only move around it, which work in the demo. Every other press there sends nothing.
const DEMO_PRESSES = /^(tab-|title-|select-|typekey-|fold-|next$|previous$)/
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
const WAITING = 'warning'
// The tab bar's panel: a theme key a shade off the pane's background, in every theme.
const PANEL_BG = 'userMessageBackground'
// The selected row in every tab is blue. In the dark theme its background is
// the `ide` blue at about 20% over the pane's rgb(38, 38, 38), muted next to
// the theme's selectionBg. Hex does not follow the theme, so other themes use SELECTION_BG.
const DARK_SELECTION = '#2d3846'
const SELECTION_BG = 'selectionBg'
// In the dark theme, the pane's body is darker than its rgb(38, 38, 38), and
// each section sits on a card of that color. Hex does not follow the theme,
// so other themes draw neither.
const DARK_BODY = '#1a1a1a'
const CARD_BG = 'composerSidebarBackground'
// The tree's lines and the dividers between rows, quieter than the text.
const MUTED_LINE = 'subtle'
// The dividers in the dark theme: about half the contrast of `subtle`'s
// rgb(80, 80, 80) against the pane's rgb(38, 38, 38). Other themes use MUTED_LINE.
const DARK_DIVIDER = '#3c3c3c'
// The selected tab's panel, and an unselected tab's under the pointer: `subtle` is a step lighter than the tab bar.
const RAISED = 'subtle'
// `inverse: false` keeps the engine from inverting the line under the pointer inside the panel.
const RAISE = { dimColor: false, backgroundColor: RAISED, inverse: false }
// A child's place under its section: a middle child, the last, or a block the tree passes.
type TreePos = 'mid' | 'last' | 'pass'
// More tree lines than a row wraps to; the tree's Box clips the rest.
const TREE_DEPTH = 200
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
// Each pane tab has its own color, used by its marker and by what it shows.
const FINDINGS = 'autoAccept'
const PRS = 'planMode'
const TAB_COLORS: Record<Tab, string> = { waiting: WAITING, findings: FINDINGS, prs: PRS }
const TABS: { id: Tab; label: string; hotkey: string }[] = [
  { id: 'waiting', label: 'Waiting', hotkey: 'w' },
  { id: 'findings', label: 'Findings', hotkey: 'f' },
  { id: 'prs', label: 'PRs', hotkey: 'p' },
]
// The Waiting tab lists questions first, because each takes one key.
const WAITING_GROUPS: { kind: Item['kind']; title: string; empty: string }[] = [
  { kind: 'decide', title: 'Questions', empty: 'No questions are waiting on you.' },
  { kind: 'do', title: 'Your tasks', empty: 'No tasks are waiting on you.' },
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
// Set in session.start, which a hot reload runs again.
let sessionId = ''
let root = ''
// The repo's top folder, where git reads the working tree; null outside git.
let top: string | null = null
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

/** Reads whether Claude Code draws in its dark theme. */
async function syncTheme($: EngineInterface) {
  const theme = (await $.config.list().catch(() => [])).find(row => row.key === 'theme')?.value
  await update($, IS_DARK_THEME, () => theme === 'dark')
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
 * The open items of one kind in the order the Waiting tab lists them.
 * Questions go newest first, so a new batch's numbers match Claude's in its reply.
 */
function listedItems(items: Item[], kind: Item['kind']): Item[] {
  const listed = items.filter(i => i.kind === kind)
  return kind === 'decide' ? listed.sort((a, b) => b.turn - a.turn) : listed
}

/**
 * Keeps each item that just closed in its row for a few seconds, with its
 * outcome, so the person sees it was registered, however it closed.
 */
async function showSettled($: EngineInterface, before: Ledger, after: Ledger) {
  const open = new Set(after.items.map(i => i.id))
  const settled = before.items.flatMap(item => {
    const d = open.has(item.id) ? undefined : after.decided.find(x => x.id === item.id)
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
  const r = await askLedgerModel($, buildPrompt(await read($, LEDGER), ex), 45_000)
  // An Explain turn talks about its item without deciding it.
  const explained = ex.press?.action === 'explain' ? ex.press.id : null

  return applyLedgerReply($, r, [ex.reply, ...ex.activity].join('\n'), (l, u, now) =>
    applyUpdate(l, { ...u, closed: u.closed.filter(c => c.id !== explained) }, now, ex.turn),
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
function queueUpdate($: EngineInterface, ex: Exchange | null) {
  queue = queue.then(async () => {
    const [{ ledgerState }, { turn }] = await Promise.all([
      update($, PRESENCE, p => ({ ...p, isUpdating: true })),
      read($, LEDGER),
    ])
    const state = await (ledgerState !== 'current' || ex === null ? catchUp($) : runUpdate($, ex)).catch(
      (): LedgerState => 'failed',
    )
    const applied = ex?.turn ?? turn
    await update($, PRESENCE, p => ({
      ...p,
      ledgerState: state,
      isUpdating: false,
      appliedTurn: state === 'current' ? Math.max(p.appliedTurn, applied) : p.appliedTurn,
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
  const closed = closedText(ledger.decided.filter(d => !toldClosed.has(d.id)))
  const isEmpty = ledger.items.length === 0 && ledger.findings.length === 0
  if (closed || (inbox !== toldInbox && !(isEmpty && toldInbox === null))) {
    notes.push(closed ? `${inbox}\n${closed}` : inbox)
    toldInbox = inbox
    toldClosed = new Set(ledger.decided.map(d => d.id))
  }

  if (sentBy) press = sentBy
  notePerson(text)
  trigger = null

  return notes
}

/** Asks Claude what an item is about. The item stays open, since nothing was decided. */
async function explain($: EngineInterface, item: Item) {
  const what = item.kind === 'do' ? 'this task you left for me' : 'this question you asked me'
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

/** Each step's helps in order: one press copies then opens, for example. */
async function useStep($: EngineInterface, item: Item, step: Help[], press: UiPressArgument) {
  for (const help of step) await useHelp($, item, help, press)
}

/** A path inside the repo, relative to its top folder; any other path as given. */
function repoPath(path: string): string {
  const base = top ?? root

  return base && path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path
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
 * under `notes`, and `notes` as its tab.
 */
async function upgradeState($: EngineInterface): Promise<Ledger> {
  const [ledger] = await Promise.all([
    update($, LEDGER, upgradeLedger),
    update($, PREVIOUS, p => p && { ...p, ledger: upgradeLedger(p.ledger) }),
    update($, TAB, t => ((t as string) === 'notes' ? 'findings' : t)),
    update($, SELECTION, s => ({ ...NO_SELECTION, ...s })),
    // Presence from before appliedTurn existed has none, so that load catches up once.
    update($, PRESENCE, p => ({ ...p, appliedTurn: p.appliedTurn ?? 0 })),
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

/** Opens the free-text field under a row and gives it the keyboard. */
async function startTyping($: EngineInterface, id: string) {
  await update($, TYPING, () => id)
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
  if (item.kind === 'do') await send($, `Re the task you left for me, "${item.ask}": ${words}`)
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
 */
async function fetchPr(
  $: EngineInterface,
  target: string | null,
  views: Record<string, PrView>,
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
  const ref = target ?? (view.exitCode === 0 ? urlRef(view.stdout) : null)
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
      findsBranchPr || (branchTarget && !isBranchLinked) ? fetchPr($, branchTarget, state.views) : null,
      ...linked.map(ref => fetchPr($, ref, state.views)),
    ])
    const views: Record<string, PrView> = {}
    for (const v of [...rest, branch]) if (v) views[v.ref] = v
    await update($, PR_VIEWS, () => ({
      views,
      branchRef: findsBranchPr ? (branch?.ref ?? null) : state.branchRef,
      isFetching: false,
    }))
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

async function unlinkPr($: EngineInterface, ref: string) {
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

/** One-press answers: the options the agent offered, or a short recommendation. */
function answers(item: Item): string[] {
  if (item.options.length > 0) return item.options
  return item.rec && item.rec.length <= 32 ? [item.rec] : []
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
}

/**
 * Which answer the recommendation names, if any: the answer whose words all
 * appear in it, the longest when several do. "Symlink into a PATH folder"
 * names "Symlink into PATH".
 */
function recommendedIndex(all: string[], rec: string | null): number {
  if (!rec) return -1
  const named = new Set(words(rec))
  let best = -1
  let bestLength = 0
  all.forEach((answer, n) => {
    const w = words(answer)
    if (w.length > bestLength && w.every(x => named.has(x))) {
      best = n
      bestLength = w.length
    }
  })

  return best
}

function answerActions($: EngineInterface, item: Item): Action[] {
  const all = answers(item)
  const recommended = recommendedIndex(all, item.rec)

  return all.map((answer, n) => ({
    key: `answer-${item.id}-${n}`,
    label: n === recommended ? `${clipLabel(answer, 32)} (recommended)` : clipLabel(answer, 32),
    ...(n === recommended ? { variant: 'primary' as const } : {}),
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

/**
 * The selected item's actions. `keys` finish it: answers and helps on digits,
 * as a survey numbers them, and Done for a task. `more` are the other ways to
 * respond: your own words, Explain, and Dismiss for a question.
 */
function itemKeys($: EngineInterface, item: Item): { keys: KeyAction[]; more: KeyAction[] } {
  const numbered = [...(item.kind === 'do' ? [] : answerActions($, item)), ...helpActions($, item)]
    .slice(0, 9)
    .map((a, n) => ({ ...a, hotkey: String(n + 1) }))
  const explainKey = { key: `explain-${item.id}`, label: 'Explain', hotkey: 'e', onPress: () => void explain($, item) }
  const typeKey = {
    key: `typekey-${item.id}`,
    label: item.kind === 'do' ? 'Type a reply' : 'Type an answer',
    hotkey: 't',
    onPress: () => void startTyping($, item.id),
  }
  if (item.kind === 'do')
    return { keys: [...numbered, { ...doneAction($, item), hotkey: 'd' }], more: [typeKey, explainKey] }

  return {
    keys: numbered,
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

function decisionText(d: Decided): string {
  return `${d.ask} → ${d.outcome}`
}

/** An item that closed without the person deciding it: dismissed, expired, or overtaken by the work. */
function isLapsed(d: Decided): boolean {
  if (d.how === 'dismissed' || d.how === 'expired' || d.how === 'claude') return true
  // The per-reply update writes its own outcome, so only its wording says the work overtook the item.
  return d.how === 'update' && /^(no longer applies|replaced|superseded|moot)/i.test(d.outcome)
}

/** The outcome as the pane shows it: "Dismissed", "Yes, renamed". */
function outcomeText(d: Decided): string {
  return capitalized(d.outcome)
}

/** A finding's kind as the Findings tab draws it: a mark before its name, both in the kind's color. */
const FINDING_BADGES: Record<Finding['kind'], { label: string; mark: string; color: string }> = {
  issue: { label: 'Issue', mark: '▲', color: 'warning' },
  opportunity: { label: 'Opportunity', mark: '✦', color: 'success' },
}

/** Runs a git command that reads the working tree; null when it fails. Optional locks are off, so it never takes the index lock from a commit. */
async function runGit($: EngineInterface, args: string[], stdin?: string): Promise<string | null> {
  if (!top) return null
  const r = await $.process
    .run(['git', '--no-optional-locks', ...args], {
      cwd: top,
      timeoutMs: 15_000,
      ...(stdin === undefined ? {} : { stdin }),
    })
    .catch(() => null)

  return r && r.exitCode === 0 ? r.stdout : null
}

/** Each file's blob id, as a commit would store it. A folder, such as a submodule's, gets a mark of its own. */
async function hashFiles($: EngineInterface, paths: string[]): Promise<string[] | null> {
  const out = await runGit($, ['hash-object', '--stdin-paths'], `${paths.join('\n')}\n`)
  if (out !== null) return out.split('\n')
  // One path git cannot hash fails the whole call, so hash the files alone.
  const kinds = await Promise.all(
    paths.map(p =>
      $.fs.stat(`${top}/${p}`).then(
        s => s.kind,
        () => 'other' as const,
      ),
    ),
  )
  const files = paths.filter((_p, i) => kinds[i] === 'file')
  const hashed = files.length > 0 ? await runGit($, ['hash-object', '--stdin-paths'], `${files.join('\n')}\n`) : ''
  if (hashed === null) return null
  const ids = hashed.split('\n')

  return paths.map((_p, i) => (kinds[i] === 'file' ? (ids[files.indexOf(paths[i] ?? '')] ?? '') : `${kinds[i]}`))
}

/** The working tree's content, read without writing to the repo. */
async function readSnapshot($: EngineInterface): Promise<Snapshot | null> {
  const [out, headOut] = await Promise.all([
    runGit($, ['status', '--porcelain=v1', '-z', '-uall']),
    runGit($, ['rev-parse', '--verify', '-q', 'HEAD']),
  ])
  if (out === null) return null
  const head = headOut?.trim() || null
  const changed = readChanged(out).slice(0, SNAPSHOT_MAX)
  const dirty: Snapshot['dirty'] = {}
  for (const c of changed) if (c.isDeleted) dirty[c.path] = ''
  const present = changed.filter(c => !c.isDeleted && !c.path.includes('\n')).map(c => c.path)
  if (present.length > 0) {
    const ids = await hashFiles($, present)
    if (!ids) return null
    present.forEach((path, i) => {
      dirty[path] = ids[i] ?? ''
    })
  }

  return { head, dirty }
}

/** Each path's object id in a commit, for the paths it has. */
async function lsTree($: EngineInterface, head: string, paths: string[]): Promise<Record<string, string> | null> {
  const ids: Record<string, string> = {}
  for (let i = 0; i < paths.length; i += 200) {
    const out = await runGit($, ['ls-tree', '-z', '--full-tree', head, '--', ...paths.slice(i, i + 200)])
    if (out === null) return null
    Object.assign(ids, readLsTree(out))
  }

  return ids
}

/** The paths whose content differs between two snapshots, or null when git could not tell. A commit only moves content into HEAD, so it changes nothing. */
async function contentChanges($: EngineInterface, a: Snapshot, b: Snapshot): Promise<string[] | null> {
  if (a.head !== b.head && !b.head) return null
  let committed: string[] = []
  if (a.head && b.head && a.head !== b.head) {
    const out = await runGit($, ['diff', '--name-only', '-z', '--no-renames', a.head, b.head])
    if (out === null) return null
    committed = out.split('\0').filter(Boolean)
  }
  const paths = candidates(a, b, committed)
  if (paths.length === 0) return []
  const none = Promise.resolve<Record<string, string>>({})
  const reading = a.head ? lsTree($, a.head, paths) : none
  const [before, after] = await Promise.all([
    reading,
    b.head === a.head ? reading : b.head ? lsTree($, b.head, paths) : none,
  ])
  if (!before || !after) return null

  return changedPaths(a, b, paths, before, after)
}

/**
 * Reads the working tree again. When its content differs from the last
 * reading, now becomes when it changed, so checks that ran earlier read as
 * before the last edit. Readings run one at a time.
 */
function refreshTree($: EngineInterface): Promise<void> {
  refreshing = refreshing
    .then(async () => {
      const [snapshot, before] = await Promise.all([readSnapshot($), read($, SNAPSHOT)])
      if (!snapshot) return
      if (before && sameSnapshot(before, snapshot)) return
      // A path list git could not read counts as a change to code.
      const changes = before ? await contentChanges($, before, snapshot) : []
      await update($, SNAPSHOT, () => snapshot)
      if (changes !== null && changes.length === 0) return
      const now = await $.clock.now()
      await update($, CHECKS, c => ({
        ...c,
        changedAt: now,
        codeChangedAt: changes === null || changes.some(p => !/\.md$/i.test(p)) ? now : c.codeChangedAt,
      }))
    })
    .catch(() => undefined)

  return refreshing
}

/** Records how each check a Bash command ran ended, and in which folder; `cwd` is where the shell started. */
async function recordChecks($: EngineInterface, command: string, cwd: string, output: string, isError: boolean) {
  const runs = checkRuns(command, cwd, (await $.env.get('HOME')) ?? '')
  const results = readResults(command, runs, output, isError).flatMap(r => {
    // A folder the command hides, as after `cd "$(git rev-parse --show-toplevel)"`, is taken as the session's.
    const folders = new Set(runs.filter(x => x.call.name === r.call.name).map(x => x.folder ?? root))
    const [folder = root] = folders
    // A check run in several folders, or in a throwaway copy, says nothing about this session's work.
    if (folders.size > 1 || (isTemporary(folder) && !isTemporary(root))) return []

    return [{ ...r, folder: folder === root ? null : folder }]
  })
  if (results.length === 0) return
  // Edits made before the check count as before it.
  await refreshTree($)
  const ranAt = await $.clock.now()
  await update($, CHECKS, c => ({
    ...c,
    results: results.reduce(
      (all, r) =>
        recordCheck(all, {
          name: r.call.name,
          kind: r.call.kind,
          folder: r.folder,
          result: r.result,
          summary: r.summary,
          ranAt,
        }),
      c.results,
    ),
  }))
}

/**
 * What the band and the pane draw: the session's own state, or the samples
 * `/inbox demo` shows in its place.
 */
async function drawnState($: EngineInterface): Promise<View & { now: number }> {
  const [ledger, stop, checks, settled, prViews, isDemo, now] = await Promise.all([
    read($, LEDGER),
    read($, STOP),
    read($, CHECKS),
    read($, SETTLED),
    read($, PR_VIEWS),
    read($, IS_DEMO),
    $.clock.now(),
  ])

  return { ...(isDemo ? demoView(now) : { ledger, stop, checks, settled, prViews }), now }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    isOn = e.isInteractive
    if (!isOn) return r
    ;[sessionId, root] = await Promise.all([$.session.id(), $.session.root()])
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
    // A reload cancels the timers that clear just-closed rows, so the rows still showing get new ones.
    const settled = await update($, SETTLED, s => s.filter(x => now - x.at < SETTLED_MS))
    if (settled.length > 0) expireSettled($, settled, Math.max(...settled.map(s => s.at + SETTLED_MS - now)))
    let loaded = current
    if (current.turn === 0 && !current.card) {
      if (saved) {
        // A resumed session: bring its card back and show it as a return.
        loaded = upgradeLedger(saved.ledger)
        await update($, LEDGER, () => loaded)
        await update($, PRESENCE, p => ({ ...p, lastActiveAt: saved.savedAt, isAway: true, appliedTurn: loaded.turn }))
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
    // Catch up now after a failed update; after a prompt whose reply never reached
    // the ledger, as when a reload cut off the end-of-turn hook before it queued the
    // update; or when the ledger is empty in a conversation that already has turns:
    // the mod loaded mid-session, or its saved state was lost.
    const isEmpty = !loaded.card && loaded.items.length === 0
    const { appliedTurn } = await read($, PRESENCE)
    if (
      presence.ledgerState !== 'current' ||
      loaded.turn > appliedTurn ||
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
        update($, SNAPSHOT, () => null),
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
      activity = []
      person = null
      press = null
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
    // A turn that starts means the session runs again.
    if (isOn) await setStop($, null)

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
    const run = () => clearingDialog($, key, () => next(e))
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
    if (!isOn || e.agent_id || e.stop_hook_active || r.block) return r
    const reply = e.last_assistant_message ?? ''
    if (!reply.trim() || (await read($, CHECKS)).results.length === 0) return r
    await refreshTree($)
    const claim = contradictedClaim(reply, await read($, CHECKS))

    return claim ? { ...r, block: claimMessage(claim) } : r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) return r
    isTurnRunning = false
    // No dialog outlives the turn that raised it.
    await closeDialogs($, null)
    if (!isOn || e.reason !== 'answer' || e.answer.trim() === '') return r

    let checks = await read($, CHECKS)
    if (checks.results.length > 0) {
      await refreshTree($)
      checks = await read($, CHECKS)
    }
    const [ledger, shown, now] = await Promise.all([read($, LEDGER), screen($), $.clock.now()])
    const ex: Exchange = {
      person,
      trigger,
      activity,
      reply: e.answer,
      turn: ledger.turn,
      press,
      screen: shown,
      checks: checks.results.map(c => checkLine(c, checks)),
    }
    press = null
    person = null
    trigger = null
    activity = []
    await update($, PRESENCE, p => ({ ...p, lastActiveAt: now }))
    queueUpdate($, ex)
    await linkPrs($, prRefs(e.answer))

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
    const opened = await $.ui.open({ id: PANE, title: 'Inbox', focus: true, closeOnEscape: true })
    if (opened.isPlaced && (await read($, TAB)) === 'prs') void findPrs($)

    return {
      text: isDemo ? 'Showing sample entries in the inbox. Run /inbox demo again to go back.' : 'Opened the inbox.',
    }
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
            <Button key="hide-prev" label="Hide" onPress={() => update($, PREVIOUS, () => null)} />
          </Box>
        </Box>
      )
    }

    const card = ledger.card
    if (!card && ledger.items.length === 0 && ledger.findings.length === 0 && settled.length === 0) return next(e)
    const settledHint = settled.map(s => (
      <Text color={DONE}>
        {' · ✓ '}
        {s.ask} → {outcomeText(s)}
      </Text>
    ))

    const goal = card?.goal || 'This session'
    const waiting = ledger.items.length
    const findingCount = ledger.findings.length
    const prAlert = prAttention(Object.values(prs.views))
    // The items themselves live in /inbox; the band only says how many wait.
    const hints = [
      ...settledHint,
      waiting > 0 ? <Text color={WAITING}> · {waiting} waiting on you in /inbox</Text> : null,
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
          {waiting > 0 ? <Text color={WAITING}> · {waiting} waiting on you</Text> : null}
        </Text>
      )
    }

    const openRows = (card?.running ?? []).slice(0, 3).map(run => (
      <Text wrap="truncate-end">
        <Text color={DONE}> ● </Text>
        <Text dimColor>{run}</Text>
      </Text>
    ))

    // A failed check gets a line of its own, so a narrow band cannot cut it off.
    const failedRows = checks.results
      .filter(c => c.result === 'fail')
      .map(c => (
        <Text wrap="truncate-end" color="error">
          {'  '}
          {checkLine(c, checks)}
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
        ...(checks.results.length > 0
          ? [
              <Text wrap="truncate-end" dimColor>
                {'  '}
                {checks.results.map(c => checkLine(c, checks)).join(' · ')}
              </Text>,
            ]
          : []),
        ...openRows,
        ...(ledger.decided.length > 0
          ? [
              <Text wrap="truncate-end" dimColor>
                {'  Closed: '}
                {ledger.decided.slice(-2).map(decisionText).join(' · ')}
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
    if (r.deny === undefined) await update($, IS_DARK_THEME, () => r.value === 'dark')

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
    const [
      { ledger, prViews: prState, stop, checks, settled, now },
      presence,
      tab,
      selection,
      isDark,
      typing,
      unfolded,
    ] = await Promise.all([
      drawnState($),
      read($, PRESENCE),
      read($, TAB),
      read($, SELECTION),
      read($, IS_DARK_THEME),
      read($, TYPING),
      read($, UNFOLDED),
    ])
    const card = ledger.card
    const prViews = Object.values(prState.views)

    // One list row's content. Selected, a row shows its context line, its title
    // in full, its body and its keys; otherwise one line: `line`, or the title.
    type Row = {
      id: string
      handle: string
      meta?: JSX.Element
      title: string
      /** Dim text on the selected title's line, such as an age. */
      titleAfter?: string
      /** Unselected, the row is one line: `before` dimmed, `text` as a button that selects the row, then `after`. */
      line?: { before?: string; text: string; after?: string; afterColor?: string }
      body?: JSX.Element | null
      keys: () => KeyAction[]
      /** Secondary actions, dimmed on a line under `keys`. */
      moreKeys?: () => KeyAction[]
      /** Where the person's own words go, for a row that takes them. */
      onType?: (text: string) => void
      typeHint?: string
    }
    // An item's group header says whether it is a question or a task, so the row
    // needs no context line. A recommendation that names an answer is marked on
    // that answer's key instead of in the body.
    const itemRow = (item: Item, handle: string): Row => {
      const rec = item.rec && item.kind !== 'do' && recommendedIndex(answers(item), item.rec) < 0 ? item.rec : null

      const asked = item.at === null ? undefined : ` · ${ago(now - item.at)}`

      return {
        id: item.id,
        handle,
        title: item.ask,
        titleAfter: asked,
        body: rec ? (
          <Text wrap="wrap">
            <Text dimColor>Recommended: </Text>
            <Text bold>{rec}</Text>
          </Text>
        ) : null,
        keys: () => itemKeys($, item).keys,
        moreKeys: () => itemKeys($, item).more,
        onType: (text: string) => void sendTypedForItem($, item, text),
        typeHint: item.kind === 'do' ? 'Your reply to Claude' : 'Your answer',
      }
    }
    const findingRow = (finding: Finding): Row => ({
      id: finding.id,
      handle: '•',
      title: finding.title,
      meta: (
        <Text wrap="truncate-end">
          <Text color={FINDING_BADGES[finding.kind].color}>
            {FINDING_BADGES[finding.kind].mark} {FINDING_BADGES[finding.kind].label}
          </Text>
          <Text dimColor> {ago(now - finding.at)}</Text>
        </Text>
      ),
      line: { text: finding.title, after: ` · ${ago(now - finding.at)}` },
      body: (
        <Box flexDirection="column" rowGap={1}>
          <Text wrap="wrap">{finding.detail}</Text>
          {finding.path ? (
            <Text wrap="wrap">
              <Text dimColor>Relevant file: </Text>
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
        {
          key: `discuss-${finding.id}`,
          label: 'Discuss',
          hotkey: 'd',
          onPress: () => void actOnFinding($, finding, 'discuss'),
        },
        {
          key: `typekey-${finding.id}`,
          label: 'Type a reply',
          hotkey: 't',
          onPress: () => void startTyping($, finding.id),
        },
        { key: `drop-${finding.id}`, label: 'Dismiss', hotkey: 'x', onPress: () => void removeFinding($, finding.id) },
      ],
    })
    const checkRow = (pr: PrView, c: PrCheck): Row => ({
      id: `${pr.ref} check ${c.name}`,
      handle: '✗',
      meta: (
        <Text color="error" bold>
          Failing check
        </Text>
      ),
      title: c.name,
      line: { text: c.name, after: ' · failing check', afterColor: 'error' },
      keys: () => [
        { key: `fix-${pr.ref}-${c.name}`, label: 'Fix', hotkey: 'a', onPress: () => void send($, prompts.fix(pr, c)) },
        {
          key: `log-${pr.ref}-${c.name}`,
          label: 'Open log',
          hotkey: 'o',
          onPress: () => void openUrl($, c.url ?? pr.url),
        },
      ],
    })
    const threadRow = (pr: PrView, t: PrThread): Row => {
      const latest = t.reply ?? { author: t.author, body: t.body }

      return {
        id: `${pr.ref} thread ${t.id}`,
        handle: '◦',
        meta: (
          <Text wrap="truncate-end">
            <Text color={PRS} bold>
              Review thread
            </Text>
            <Text dimColor>
              {t.replies > 0 ? ` · ${t.replies + 1} comments` : ''}
              {t.isOutdated ? ' · outdated' : ''}
            </Text>
          </Text>
        ),
        title: threadWhere(t),
        line: { before: `${threadWhere(t, baseName(t.path))} `, text: latest.body.replace(/\s+/g, ' ') },
        body: (
          <Box flexDirection="column">
            {t.reply ? <Markdown dimColor text={`@${t.author}: ${clipLabel(t.body, 200)}`} /> : null}
            <Markdown text={`**@${latest.author}:** ${clipLabel(latest.body, 1200)}`} />
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
            key: `discuss-${t.id}`,
            label: 'Discuss',
            hotkey: 'd',
            onPress: () => void send($, prompts.discuss(pr, t)),
          },
          {
            key: `open-${t.id}`,
            label: 'Open',
            hotkey: 'o',
            onPress: () => void openUrl($, t.reply?.url || t.url || pr.url),
          },
        ],
      }
    }

    // Each tab's rows in order: the cursor, the counts and the drawing all read these.
    const waitingGroups = WAITING_GROUPS.map(g => ({
      ...g,
      rows: listedItems(ledger.items, g.kind).map((item, n) => itemRow(item, g.kind === 'decide' ? `${n + 1})` : '•')),
    }))
    const prGroups = prViews.map(pr => ({
      pr,
      rows: [...failingChecks(pr).map(c => checkRow(pr, c)), ...waitingThreads(pr).map(t => threadRow(pr, t))],
    }))
    const rows: Record<Tab, Row[]> = {
      waiting: waitingGroups.flatMap(g => g.rows),
      findings: [...ledger.findings].reverse().map(findingRow),
      prs: prGroups.flatMap(g => g.rows),
    }
    const ids = rows[tab].map(r => r.id)
    const indexOf = new Map(ids.map((id, n) => [id, n]))
    const at = selectedIndex(ids, selection[tab])

    const keyRow = (keys: KeyAction[], dimmed: KeyAction[] = []) => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {keys.map(k => (
          <Button plain {...k} />
        ))}
        {dimmed.map(k => (
          <Button plain {...k} dimColor />
        ))}
      </Box>
    )
    // A selected row's secondary keys share its key row, dimmed, when they fit,
    // and otherwise take a line of their own rather than wrap mid-row. A plain
    // Button draws "key: label", and keyRow puts 2 columns between Buttons.
    const keysWidth = (keys: KeyAction[]) =>
      keys.reduce((w, k) => w + k.hotkey.length + 2 + k.label.length, 0) + 2 * Math.max(0, keys.length - 1)
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
        <Text color={MUTED_LINE}>{treeText(pos, lead)}</Text>
      </Box>
    )
    const treeRow = (pos: TreePos | null, marker: JSX.Element, content: JSX.Element, key?: string) => (
      <Box key={key} flexDirection="row" overflow="hidden">
        <Box width={4} flexShrink={0} />
        <Box width={3} flexShrink={0}>
          {marker}
        </Box>
        <Box flexDirection="column" flexShrink={1} flexGrow={1} paddingRight={1}>
          {content}
        </Box>
        {pos ? branch(pos) : null}
      </Box>
    )
    const childPos = (n: number, count: number): TreePos => (n === count - 1 ? 'last' : 'mid')
    // A list's rows with a divider between each two. It starts where the rows'
    // text starts and runs to the pane's edge; in a section, the tree's │ passes it.
    const dividerColor = isDark ? DARK_DIVIDER : MUTED_LINE
    // A divider line from `inset` columns in to the pane's edge.
    const rule = (inset: number) => (
      <Text color={dividerColor}>{'─'.repeat(Math.max(0, e.props.bodyColumns - inset))}</Text>
    )
    const divided = (rowEls: JSX.Element[], group: string, isTree: boolean) =>
      rowEls.flatMap((el, n) =>
        n === 0
          ? [el]
          : [
              isTree ? (
                <Box key={`divider-${group}-${n}`} flexDirection="row">
                  <Box width={1} flexShrink={0} />
                  <Box width={6} flexShrink={0}>
                    <Text color={MUTED_LINE}>│</Text>
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
    // The selected row gets a blue background, and reads top to bottom:
    // context line, title, body, keys, each set off by a blank line. The handle
    // is a Button, so a click selects the row.
    // A Button label does not wrap or truncate, so the clickable text is clipped
    // to what fits beside the handle and the row's other text.
    const unselectedLine = (row: Row, onPress: () => void, inset: number) => {
      const line = row.line ?? { text: row.title, after: row.titleAfter }
      const room = Math.max(
        12,
        e.props.bodyColumns - 3 - inset - (line.before?.length ?? 0) - (line.after?.length ?? 0),
      )

      return (
        <Box flexDirection="row">
          {line.before ? <Text dimColor>{line.before}</Text> : null}
          <Button plain key={`title-${row.id}`} label={clipLabel(line.text, room)} onPress={onPress} />
          {line.after ? (
            <Text wrap="truncate-end" color={line.afterColor} dimColor={!line.afterColor}>
              {line.after}
            </Text>
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
          backgroundColor={isSelected ? (isDark ? DARK_SELECTION : SELECTION_BG) : undefined}
        >
          <Box width={1} flexShrink={0} />
          {tree ? <Box width={3} flexShrink={0} /> : null}
          <Box width={tree ? 3 : 4} flexShrink={0} paddingLeft={tree ? 0 : 2} paddingY={isSelected ? 1 : 0}>
            <Button
              plain
              key={`select-${row.id}`}
              label={row.handle}
              dimColor={!isSelected}
              onPress={() => void select($, tab, row.id, index)}
            />
          </Box>
          {isSelected ? (
            <Box flexDirection="column" flexShrink={1} flexGrow={1} paddingRight={1} paddingY={1}>
              {row.meta}
              <Text wrap="wrap">
                <Text bold>{row.title}</Text>
                {row.titleAfter ? <Text dimColor>{row.titleAfter}</Text> : null}
              </Text>
              {row.body ? <Box marginTop={1}>{row.body}</Box> : null}
              <Box flexDirection="column" marginTop={1}>
                {keys.length === 0
                  ? keyRow(more)
                  : keysWidth([...keys, ...more]) <= e.props.bodyColumns - 3 - (tree ? 7 : 5)
                    ? keyRow(keys, more)
                    : [keyRow(keys), keyRow([], more)]}
              </Box>
              {Input && row.onType && typing === row.id ? (
                <Box marginTop={1}>
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
          {tree ? branch(tree, isSelected ? 1 : 0) : null}
          {/* What select() scrolls into view. Drawn on the selected row alone, so the key exists
          only once that row has redrawn expanded. */}
          {isSelected ? <Box key={`view-${row.id}`} position="absolute" top={0} bottom={0} left={0} width={1} /> : null}
        </Box>
      )
    }
    const emptyLine = (text: string) => (
      <Box paddingLeft={1}>
        <Text dimColor wrap="wrap">
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

    // The tab bar is the pane's top panel, with when the inbox last updated at
    // its right end, or under the tabs when the pane is too narrow.
    const tabs = (
      <Box
        backgroundColor={PANEL_BG}
        paddingX={1}
        flexDirection="row"
        flexWrap="wrap"
        alignItems="center"
        justifyContent="space-between"
        columnGap={3}
      >
        <Box flexDirection="row" columnGap={1}>
          {TABS.map(({ id, label, hotkey }) => {
            const count = id === 'waiting' ? ledger.items.length : rows[id].length
            const counted = `${label}${count > 0 ? ` ${count}` : ''}`

            // The selected tab is a raised panel three lines tall, its name in the
            // middle line and a line of its color along the top edge.
            if (tab === id)
              return (
                <Box flexDirection="column">
                  <Text color={TAB_COLORS[id]} backgroundColor={RAISED}>
                    {'▔'.repeat(counted.length + 2)}
                  </Text>
                  <Text backgroundColor={RAISED} bold>
                    {` ${counted} `}
                  </Text>
                  <Text backgroundColor={RAISED}>{' '.repeat(counted.length + 2)}</Text>
                </Box>
              )
            // Each line is a Button, so a click anywhere on the tab's three lines
            // selects it. Under the pointer, the keyed Box raises all three as one
            // panel, the selected tab's shape without its line.
            const width = `${hotkey}: ${counted}`.length + 2
            const show = () => void showTab($, id)

            return (
              <Box key={`tab-block-${id}`} flexDirection="column">
                <Button plain key={`tab-${id}-above`} label={' '.repeat(width)} hover={RAISE} onPress={show} />
                <Box flexDirection="row">
                  <Button plain key={`tab-${id}-before`} label=" " hover={RAISE} onPress={show} />
                  <Button plain key={`tab-${id}`} hotkey={hotkey} label={label} dimColor hover={RAISE} onPress={show} />
                  {count > 0 ? (
                    <Text color={TAB_COLORS[id]} hover={RAISE}>
                      {' '}
                      {count}
                    </Text>
                  ) : null}
                  <Button plain key={`tab-${id}-after`} label=" " hover={RAISE} onPress={show} />
                </Box>
                <Button plain key={`tab-${id}-below`} label={' '.repeat(width)} hover={RAISE} onPress={show} />
              </Box>
            )
          })}
        </Box>
        <Box flexDirection="row" columnGap={2}>
          <Text dimColor>{status}</Text>
          {presence.ledgerState === 'failed' && !presence.isUpdating ? (
            <Text color="error">update failed, retries after the next reply</Text>
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
          {count > 0 ? <Text dimColor> {count}</Text> : null}
        </Text>
      </Box>
    )
    const sectionCard = (children: JSX.Element | JSX.Element[]) => (
      <Box flexDirection="column" paddingY={1} backgroundColor={isDark ? CARD_BG : undefined}>
        {children}
      </Box>
    )
    // A blank line in the tree, but for its │: under a title, so the children
    // do not crowd it, and between two-line entries, so they read apart.
    const titleGap = (hasChildren = true) => (
      <Box paddingLeft={1}>
        <Text color={MUTED_LINE}>{hasChildren ? '│' : ' '}</Text>
      </Box>
    )
    const waitingView = () => {
      // An item that just closed stays where its row was in its group, with a
      // check and its outcome, until it joins the group's closed items. It
      // cannot be selected.
      const fresh = [...settled].sort((a, b) => a.index - b.index)
      const showing = new Set(settled.map(s => s.id))
      const settledRow = (s: Settled, pos: TreePos) =>
        treeRow(
          pos,
          <Text color={DONE}>✓</Text>,
          <Box flexDirection="column">
            <Text wrap="truncate-end" dimColor>
              {s.ask}
            </Text>
            <Text wrap="wrap" color={DONE}>
              {outcomeText(s)}
            </Text>
          </Box>,
          `settled-${s.id}`,
        )
      // A closed item under its group's open ones: what was asked, then how it closed and when.
      const closedRow = (d: Decided, pos: TreePos) =>
        treeRow(
          pos,
          <Text dimColor>◇</Text>,
          <Box flexDirection="column">
            <Text wrap="wrap" dimColor>
              {d.ask}
            </Text>
            <Text wrap="wrap">
              <Text bold={!isLapsed(d)} dimColor={isLapsed(d)}>
                {outcomeText(d)}
              </Text>
              <Text dimColor> · {ago(now - d.at)}</Text>
            </Text>
          </Box>,
          `closed-${d.id}`,
        )
      // The row that folds or unfolds a group's closed items, with how many there are.
      const foldRow = (kind: Item['kind'], count: number, isUnfolded: boolean, pos: TreePos) => {
        const toggle = () =>
          void update($, UNFOLDED, u => (u.includes(kind) ? u.filter(k => k !== kind) : [...u, kind]))

        return treeRow(
          pos,
          <Button plain key={`fold-${kind}-caret`} label={isUnfolded ? '▾' : '▸'} dimColor onPress={toggle} />,
          <Box flexDirection="row">
            <Button plain key={`fold-${kind}`} label={`${count} Closed`} dimColor onPress={toggle} />
          </Box>,
          `fold-row-${kind}`,
        )
      }
      const groups = waitingGroups.map(g => {
        const entries: ({ row: Row } | { settled: Settled })[] = g.rows.map(row => ({ row }))
        for (const s of fresh.filter(x => x.kind === g.kind))
          entries.splice(Math.min(s.index, entries.length), 0, { settled: s })
        const closed = ledger.decided
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
                    <Text> </Text>,
                    <Text dimColor wrap="wrap">
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
        const tail = rest.flatMap((draw, n) => [titleGap(), draw(childPos(top.length + n, count))])

        return sectionCard([groupTitle(g.title, g.rows.length), titleGap(), ...open, ...tail])
      })
      // A stop is fixed in the session, not here, so it shows above the list without keys.
      const outside = stop
        ? [
            sectionCard(
              <Box flexDirection="column" paddingLeft={1}>
                <Text wrap="truncate-end">
                  <Text color="error" bold>
                    Stopped
                  </Text>
                  <Text dimColor> · {ago(now - stop.at)}</Text>
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
          {groups}
        </Box>
      )
    }

    const findingsView = () =>
      rows.findings.length === 0
        ? emptyLine(
            'No findings. Claude records one when it notices an issue or an opportunity outside the current task.',
          )
        : sectionCard(
            divided(
              rows.findings.map(r => listRow(r)),
              'findings',
              false,
            ),
          )

    const prBlock = ({ pr, rows: prRows }: { pr: PrView; rows: Row[] }) => {
      const ready = readiness(pr)
      const counts = checkCounts(pr)
      const waitingOn = waitingThreads(pr)
      // The viewer replied last. Their own notes with no reply wait on no one, so they don't count.
      const answered = pr.threads.filter(t => !t.isWaiting && t.reply !== null).length
      // The headline already names a draft and failing or running checks; this line adds only what it leaves out.
      const checksPass = pr.state === 'OPEN' && !ready.isReady && counts.fail === 0 && counts.pending === 0
      const facts = [
        checksPass && counts.pass > 0 ? `${counts.pass} ${counts.pass === 1 ? 'check passes' : 'checks pass'}` : null,
        answered > 0 ? `${answered} open ${answered === 1 ? 'thread' : 'threads'} you answered` : null,
      ].filter(Boolean)

      return sectionCard([
        <Box paddingLeft={1}>
          <Text wrap="wrap">
            <Text bold color={PRS}>
              #{pr.number}{' '}
            </Text>
            <Text bold>{pr.title}</Text>
          </Text>
        </Box>,
        titleGap(prRows.length > 0),
        treeRow(
          prRows.length > 0 ? 'pass' : null,
          <Text color={ready.isReady ? DONE : WAITING}>{ready.isReady ? '✓' : '◇'}</Text>,
          <Box flexDirection="column">
            <Text wrap="wrap" color={ready.isReady ? DONE : WAITING}>
              {ready.text}
            </Text>
            {facts.length > 0 ? (
              <Text dimColor wrap="wrap">
                {facts.join(' · ')}
              </Text>
            ) : null}
            {pr.error ? (
              <Text color="error" wrap="wrap">
                Last refresh failed: {pr.error}
              </Text>
            ) : null}
            <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
              {waitingOn.length > 1 ? (
                <Button
                  key={`address-all-${pr.ref}`}
                  label={`Address all ${waitingOn.length} threads`}
                  onPress={() => void send($, prompts.address(pr, waitingOn))}
                />
              ) : null}
              <Button key={`open-${pr.ref}`} label="Open PR" dimColor onPress={() => void openUrl($, pr.url)} />
              {pr.ref !== prState.branchRef ? (
                <Button key={`unlink-${pr.ref}`} label="Remove" dimColor onPress={() => void unlinkPr($, pr.ref)} />
              ) : null}
            </Box>
          </Box>,
        ),
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

    // At least the body's height, so the pane's background fills it. A pane takes a
    // key only as a Button's hotkey, so j and k are Buttons in a hidden Box.
    return (
      <Box
        flexDirection="column"
        gap={1}
        minHeight={e.props.scroll.bodyRows}
        backgroundColor={isDark ? DARK_BODY : undefined}
      >
        {tabs}
        <Box flexDirection="column" paddingX={1} flexGrow={1}>
          {tab === 'findings' ? findingsView() : tab === 'prs' ? prsView() : waitingView()}
        </Box>
        <Box display="none">{keyRow(moveKeys)}</Box>
      </Box>
    )
  })
}
