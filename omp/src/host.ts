import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AssistantMessage, Context, Model } from '@oh-my-pi/pi-ai'
import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent'

import { flattenConversation } from '../../hooks/conversation'
import { ompTodoFromBranch } from '../../hooks/host-tasks'
import type { Turn } from '../../hooks/conversation'
import { dialogActivity, dialogQuestions, guidanceText, screenText, toolActivity } from '../../hooks/model-text'
import type { DialogOutcome, ScreenTab } from '../../hooks/model-text'
import type { PrPress } from '../../hooks/pr-tab'
import { noteDialog } from '../../hooks/dialogs'
import { ghFinder, ghIn } from '../../hooks/gh'
import type { Run } from '../../hooks/gh'
import type { RowPress } from '../../hooks/presses'
import {
  endTurn,
  forkedFrom,
  hasLedger,
  isUnseen,
  lookEndedOn,
  lookStartedOn,
  needsUpdate,
  noteActivity,
  noteCommandOutput,
  notePrompt,
  recorded,
  sessionView,
  turnEnded,
  turnStarted,
} from '../../hooks/session'
import type { SessionView } from '../../hooks/session'
import {
  askOverConversation,
  fetchPrs,
  prFetchTracker,
  press,
  orderedKeys,
  reconcileUpdateStatus,
  runUpdates,
  wakeForDone,
} from '../../hooks/session-host'
import type { PressOutcome, SessionHost, UpdateHost } from '../../hooks/session-host'
import { agentTools } from '../../hooks/tools'
import { DARK_TONES, LIGHT_TONES } from '../../hooks/tones'
import { clip } from '../../hooks/text'
import { NEXT_BUILD_MARK, NO_HOLDS, RESUME_TEXT, SETTLED_MS, TABS } from '../../hooks/view'
import type { ReplyHolds, ShownTab } from '../../hooks/view'
import { openTarget } from './commands'
import { createPanel } from './controller'
import type { PanelSource } from './controller'
import { demoSource } from './demo'
import { bandLines } from './panel'
import type { Style, Tone } from './panel'
import { exclusiveRun, pruneSessions, readState, updateState } from './state'
import type { OmpState } from './state'
import { OMP } from './texts'
import type { Stop } from '../../types'

const INBOX_MODEL_TIMEOUT_MS = 120_000
/** Added to the settle window so the timer fires after the window has fully passed. */
const WAKE_MARGIN_MS = 250
const MESSAGE_TYPE = 'inbox'
const BAND_KEY = 'inbox-band'

type Complete = (
  model: Model,
  context: Context,
  options: { apiKey: string; signal: AbortSignal },
) => Promise<AssistantMessage>

/** What the host takes from outside, so a test can supply its own. */
export type HostDeps = {
  /** The folder that holds the inbox's saved sessions. */
  stateDir: (pi: ExtensionAPI) => string
  now: () => number
  newId: () => string
  settleWindowMs: number
  home: string
  /** Whether the installed extension's folder holds `NEXT_BUILD_MARK`. */
  isNextBuild: boolean
  complete: Complete
  /** Copies text to the clipboard. Returns why it could not, or null. */
  copy: (text: string) => Promise<string | null>
  /** Runs work the handler that started it does not wait for. */
  background: (work: Promise<unknown>) => void
  /** Whether a failed request hit the account's usage limit, by omp's own rule. */
  isUsageLimit: (status: number | undefined, message: string) => Promise<boolean>
}

/** The view a look draws, with the facts about the host that the shared view does not hold. */
export type InboxScreen = {
  view: SessionView
  /** The model that runs the inbox update, or null when the person has none. */
  modelName: string | null
  isGhMissing: boolean
  isFetchingPrs: boolean
  stop: Stop | null
  isNextBuild: boolean
}

/** What a panel needs from the host. */
export type Inbox = {
  screen(ctx: ExtensionContext, holds?: ReplyHolds): Promise<InboxScreen>
  /** Marks the panel open, and runs what a freshly opened panel needs: Done messages due, and a PR fetch when due. */
  openPanel(ctx: ExtensionContext): Promise<void>
  /** Records the tab an open panel shows. */
  showTab(ctx: ExtensionContext, tab: ShownTab): void
  closePanel(ctx: ExtensionContext): void
  fetchPrsWhenDue(ctx: ExtensionContext): void
  /** Calls `listener` after the session's saved state changes. Returns how to stop. */
  onChange(ctx: ExtensionContext, listener: () => void): () => void
  /** Applies a press for the session. */
  press(ctx: ExtensionContext, p: RowPress | PrPress, holds: ReplyHolds): Promise<PressOutcome>
  /** Sends the message that resumes a stopped turn. Returns why it could not, or null. */
  resume(ctx: ExtensionContext): string | null
}

async function defaultComplete(
  model: Model,
  context: Context,
  options: { apiKey: string; signal: AbortSignal },
): Promise<AssistantMessage> {
  const { completeSimple } = await import('@oh-my-pi/pi-ai')

  return completeSimple(model, context, options)
}

async function isUsageLimitOutcome(status: number | undefined, message: string): Promise<boolean> {
  const ai = await import('@oh-my-pi/pi-ai')

  return ai.isUsageLimitOutcome(status, message)
}

async function copyToClipboard(text: string): Promise<string | null> {
  const candidates =
    process.platform === 'darwin'
      ? [['pbcopy']]
      : process.platform === 'win32'
        ? [['clip']]
        : [['wl-copy'], ['xclip', '-selection', 'clipboard']]
  for (const argv of candidates) {
    try {
      const child = Bun.spawn(argv, { stdin: Buffer.from(text), stdout: 'ignore', stderr: 'ignore' })
      if ((await child.exited) === 0) return null
    } catch {
      continue
    }
  }

  return `no clipboard command started (${candidates.map(c => c[0]).join(', ')})`
}

const defaultDeps: HostDeps = {
  stateDir: pi => join(pi.pi.getAgentDir(), 'inbox'),
  now: Date.now,
  newId: randomUUID,
  settleWindowMs: SETTLED_MS,
  home: homedir(),
  isNextBuild: existsSync(join(dirname(dirname(fileURLToPath(import.meta.url))), NEXT_BUILD_MARK)),
  complete: defaultComplete,
  copy: copyToClipboard,
  background: work => void work.catch(() => undefined),
  isUsageLimit: isUsageLimitOutcome,
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * True for a session nobody watches: a subagent, or a main session run without a UI, such as print mode. omp 18.1.17
 * gives an extension no `ctx.agent`, and starts a subagent with no UI, so the read is guarded.
 */
function isUnattended(ctx: ExtensionContext): boolean {
  const agent = (ctx as { agent?: { kind?: unknown } }).agent

  return agent?.kind === 'sub' || !ctx.hasUI
}

const sessionIdOf = (ctx: ExtensionContext) => ctx.sessionManager.getSessionId()

/** The session id in a session file's name, `<timestamp>_<sessionId>.jsonl`. Null for any other name. */
export function sessionIdInFile(file: string): string | null {
  return /(?:^|[\\/])[^_\\/]+_([^\\/]+)\.jsonl$/.exec(file)?.[1] ?? null
}

/** Orders models newest first by the `major.minor.patch` revision omp classifies from each id. */
function byNewestRevision(a: Model, b: Model): number {
  const parts = (m: Model) => (m.identity.revision ?? '0.0.0').split('.').map(Number)
  const [x, y] = [parts(a), parts(b)]
  const differing = x.findIndex((n, i) => n !== y[i])

  return differing === -1 ? 0 : (y[differing] ?? 0) - (x[differing] ?? 0)
}

/**
 * The inbox model: the person's `@inbox` role when it names a model omp can use. omp's `resolve` returns nothing for
 * an unset role, an unknown model or one with no sign-in, and the inbox then falls through. A model that resolves
 * but fails when called fails that update like any other.
 * Next the newest Sonnet model the person's providers offer, since the inbox model evals pass on Sonnet.
 * omp's model lists also hold retired Sonnets, which no longer answer. The `anthropic` provider is preferred.
 * Otherwise omp's `@smol` role.
 */
export function inboxModel(ctx: ExtensionContext): Model | null {
  const sonnets = ctx.models
    .list()
    .filter(m => m.identity.family === 'sonnet')
    .toSorted(byNewestRevision)
  const sonnet = sonnets.find(m => m.provider === 'anthropic') ?? sonnets[0]

  return ctx.models.resolve('@inbox') ?? sonnet ?? ctx.models.resolve('@smol') ?? null
}

/** The text blocks of a message's content, joined. */
function textOfBlocks(content: unknown): string {
  if (!Array.isArray(content)) return ''

  return content
    .flatMap((b: { type?: unknown; text?: unknown }) =>
      b.type === 'text' && typeof b.text === 'string' ? [b.text] : [],
    )
    .join('\n')
}

type Reply = { role?: unknown; content?: unknown; stopReason?: unknown; errorMessage?: unknown; errorStatus?: unknown }

function lastAssistant(messages: readonly unknown[]): Reply | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as Reply | undefined
    if (m?.role === 'assistant' && Array.isArray(m.content)) return m
  }

  return null
}

function apiErrorDetail(status: number | undefined, message: string): string {
  if (status === 429) return 'rate_limit'
  if (status === 503 || status === 529) return 'overloaded'
  if (status !== undefined) return String(status)

  return clip(message.split('\n')[0]?.trim() || 'no status', 60)
}

/** Why a turn stopped, from its last assistant message. Null when the turn did not end on an error. */
export async function stopOf(
  reply: Reply | null,
  isUsageLimit: HostDeps['isUsageLimit'],
  at: number,
): Promise<Stop | null> {
  if (reply?.stopReason !== 'error') return null
  const message = typeof reply.errorMessage === 'string' ? reply.errorMessage : ''
  const status = typeof reply.errorStatus === 'number' ? reply.errorStatus : undefined
  const detail = status === undefined ? '' : String(status)
  if (await isUsageLimit(status, message).catch(() => false)) return { kind: 'usage-limit', detail, resets: null, at }
  if (status === 401 || status === 403) return { kind: 'sign-in', detail, resets: null, at }

  return { kind: 'api-error', detail: apiErrorDetail(status, message), resets: null, at }
}

/** The text of a user message. */
function userText(content: unknown): string {
  return typeof content === 'string' ? content : textOfBlocks(content)
}

/** The activity line for an omp tool call, through the names the shared `toolActivity` knows. */
function activityOf(tool: string, input: Record<string, unknown>): string | null {
  switch (tool) {
    case 'bash':
      return toolActivity('Bash', { command: input.command, run_in_background: input.async === true })
    case 'edit':
    case 'write':
      return toolActivity('Edit', { file_path: input.path ?? input.file_path })
  }

  return null
}

/** How an `ask` dialog ended, from its tool result. */
function askOutcome(event: {
  content: { type: string; text?: string }[]
  isError: boolean
  details?: unknown
}): DialogOutcome {
  const details = (event.details ?? {}) as { timedOut?: boolean; chatRedirect?: boolean }
  const answer = event.content.flatMap(b => (b.type === 'text' && b.text ? [b.text] : [])).join('\n')
  if (event.isError || details.chatRedirect || answer === '') return { kind: 'dismissed' }

  return { kind: details.timedOut ? 'timed-out' : 'answered', answer }
}

/** Whether a message is the result of an ask dialog the person dismissed. */
function isDismissedAsk(message: unknown): boolean {
  const m = message as { role?: unknown; toolName?: unknown; content?: unknown; isError?: unknown; details?: unknown }

  return (
    m?.role === 'toolResult' &&
    m.toolName === 'ask' &&
    Array.isArray(m.content) &&
    askOutcome({ content: m.content, isError: m.isError === true, details: m.details }).kind === 'dismissed'
  )
}

type Entry = { type?: unknown; message?: unknown }

type Message = {
  role?: unknown
  content?: unknown
  synthetic?: unknown
  command?: unknown
  toolCallId?: unknown
  isError?: unknown
  details?: unknown
}

/** The conversation of a session branch as turns, from the last `/clear` on. omp's own `/new` starts another session. */
export function conversationOf(entries: readonly unknown[]): Turn[] {
  const path = entries as Entry[]
  const messages = path
    .slice(path.findLastIndex(e => e.type === 'reset_boundary') + 1)
    .flatMap(e => (e.type === 'message' && e.message ? [e.message as Message] : []))
  const results = new Map(
    messages.flatMap(m => (m.role === 'toolResult' && typeof m.toolCallId === 'string' ? [[m.toolCallId, m]] : [])),
  )

  return messages.flatMap((m): Turn[] => {
    if (m.role === 'user' && m.synthetic !== true) return [{ role: 'person', text: userText(m.content), activity: [] }]
    if (m.role === 'bashExecution' && typeof m.command === 'string')
      return [{ role: 'person', text: `$ ${m.command}`, activity: [] }]
    if (m.role !== 'assistant' || !Array.isArray(m.content)) return []
    const activity = m.content.flatMap(
      (block: { type?: unknown; id?: unknown; name?: unknown; arguments?: unknown }) => {
        if (block.type !== 'toolCall' || typeof block.name !== 'string') return []
        const input = (block.arguments ?? {}) as Record<string, unknown>
        const result = typeof block.id === 'string' ? results.get(block.id) : undefined
        const line =
          block.name === 'ask'
            ? dialogActivity(
                dialogQuestions(input.questions),
                result
                  ? askOutcome({ ...result, content: result.content as never, isError: result.isError === true })
                  : { kind: 'open' },
              )
            : activityOf(block.name, input)

        return line ? [line] : []
      },
    )

    return [{ role: 'agent', text: textOfBlocks(m.content), activity }]
  })
}

/** The slice of omp's theme the panel's style uses. */
type OmpTheme = {
  isLight: boolean
  bold(text: string): string
  inverse(text: string): string
  underline(text: string): string
  fg(color: 'accent' | 'statusLineSep', text: string): string
}

const ESC = '\x1b['

function truecolor(hex: string, text: string): string {
  const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16))

  return `${ESC}38;2;${r};${g};${b}m${text}${ESC}39m`
}

/** Maps the panel's styles onto omp's theme. The separator and the accent follow the theme; the tones follow `hooks/tones.ts`. */
export function styleOf(theme: OmpTheme): Style {
  const tones = theme.isLight ? LIGHT_TONES : DARK_TONES

  return {
    bold: theme.bold.bind(theme),
    dim: text => `${ESC}2m${text}${ESC}22m`,
    inverse: theme.inverse.bind(theme),
    underline: theme.underline.bind(theme),
    tone: (name: Tone, text) =>
      name === 'sep' || name === 'accent'
        ? theme.fg(name === 'sep' ? 'statusLineSep' : 'accent', text)
        : truecolor(tones[name], text),
  }
}

export function createInbox(pi: ExtensionAPI, deps: HostDeps = defaultDeps): Inbox {
  const dir = deps.stateDir(pi)
  /** The open panels, with the tab each shows. */
  const openPanels = new Map<string, ShownTab>()

  function screenTabOf(id: string): ScreenTab | null {
    const tab = openPanels.get(id)
    const shown = TABS.find(t => t.id === tab)

    return tab === undefined ? null : { label: shown?.label ?? tab, isPage: tab === 'overview' }
  }
  const prepared = new Set<string>()
  const prFetches = prFetchTracker(deps.now)
  const listeners = new Map<string, Set<() => void>>()
  let noted: { id: string; prompt: string; notes: string[] } | null = null
  let isGhMissing = false

  /** Changes a session's saved state, then tells whoever draws it. */
  const notifyChanged = (id: string) => listeners.get(id)?.forEach(listener => listener())

  const change = async (id: string, fn: Parameters<typeof updateState>[2]) => {
    let isChanged = false
    const saved = await updateState(dir, id, async current => {
      const changed = await fn(current)
      isChanged = changed !== current

      return changed
    })
    if (isChanged) notifyChanged(id)

    return saved
  }

  const run: Run = async (args, { cwd, timeoutMs }) => {
    const [file = '', ...rest] = args
    try {
      const r = await pi.exec(file, rest, { cwd, timeout: timeoutMs })

      return { code: r.killed ? -1 : r.code, stdout: r.stdout, stderr: r.stderr }
    } catch (err) {
      return { code: -1, stdout: '', stderr: messageOf(err) }
    }
  }
  const gh = ghFinder(run)

  /** Sends text to the agent as if the person typed it. Returns why it could not, or null. */
  const sendToAgent = (ctx: ExtensionContext, text: string): string | null => {
    try {
      pi.sendUserMessage(text, ctx.isIdle() ? undefined : { deliverAs: 'followUp' })

      return null
    } catch (err) {
      return messageOf(err)
    }
  }

  function askFor(ctx: ExtensionContext, id: string): SessionHost<OmpState>['ask'] {
    return async (prompt, system) => {
      const model = inboxModel(ctx)
      if (!model) return null
      try {
        const apiKey = await ctx.modelRegistry.getApiKey(model, id)
        if (!apiKey) return null
        const reply = await deps.complete(
          model,
          {
            systemPrompt: [system],
            messages: [{ role: 'user', content: prompt, timestamp: deps.now() }],
          },
          { apiKey, signal: AbortSignal.timeout(INBOX_MODEL_TIMEOUT_MS) },
        )
        if (reply.stopReason === 'error' || reply.stopReason === 'aborted') return null
        const text = reply.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')

        return text === '' ? null : text
      } catch {
        return null
      }
    }
  }

  /** The sessions whose results calls run one after another. They hold no lock, so a ledger call never waits for one. */
  const resultsOrder = orderedKeys()

  function hostFor(ctx: ExtensionContext): SessionHost<OmpState> {
    const id = sessionIdOf(ctx)

    return {
      now: deps.now,
      read: () => readState(dir, id),
      update: fn => change(id, fn),
      exclusive: fn => exclusiveRun(dir, id, fn),
      ask: askFor(ctx, id),
      deliver: async (_s, text) => {
        const why = sendToAgent(ctx, text)

        return why === null ? { state: 'accepted', queuedId: null } : { state: 'rejected', reason: why }
      },
      perform: async (_s, effect) => {
        if (effect.kind === 'refresh-prs') {
          await prFetches.fetchNow(id, () => fetchPrs(hostFor(ctx), true))
          return null
        }
        return effect.kind === 'copy' ? deps.copy(effect.text) : openTarget(run, effect.target, ctx.cwd, deps.home)
      },
      gh: {
        find: gh.find,
        forget: gh.forget,
        run: (_s, bin, onUnstartable) => ghIn(run, bin, ctx.cwd, onUnstartable),
        noteMissing: isMissing => {
          isGhMissing = isMissing
        },
      },
      settleWindowMs: deps.settleWindowMs,
      newId: deps.newId,
    }
  }

  /** The session branch's conversation as the inbox model reads it. Empty when there is none or it cannot be read. */
  const conversationText = (ctx: ExtensionContext): string => {
    try {
      return flattenConversation(conversationOf(ctx.sessionManager.getBranch()))
    } catch {
      return ''
    }
  }

  /** The host for an update, which catches up over the branch's conversation when the ledger may have missed turns. */
  function updateHostFor(ctx: ExtensionContext): UpdateHost<OmpState> {
    const host = hostFor(ctx)
    const id = sessionIdOf(ctx)

    return {
      ...host,
      names: OMP,
      inOrder: fn => resultsOrder.run(id, fn),
      background: results => deps.background(results),
      catchUp: s =>
        askOverConversation(
          host.ask,
          OMP,
          s,
          screenText(OMP, openPanels.has(id), screenTabOf(id)),
          conversationText(ctx),
        ),
    }
  }

  /**
   * A session that holds turns the inbox never saw, as when it is resumed or forked, or the extension was turned on
   * in it, is marked `behind`, and its first update catches up over the branch.
   */
  async function catchUpUnseen(ctx: ExtensionContext): Promise<void> {
    if (conversationText(ctx) === '') return
    let isMarked = false
    await change(sessionIdOf(ctx), s => {
      if (!isUnseen(s)) return s
      isMarked = true

      return { ...s, presence: { ...s.presence, ledgerState: 'behind' } }
    })
    if (isMarked) await runUpdates(updateHostFor(ctx))
  }

  /**
   * A forked session continues its parent's ledger, as the mod's fork does, when the parent saved one. The Overview, items,
   * the task list and closed records carry over, so the fork's catch-up does not offer back what the person already closed.
   * A parent with no saved ledger leaves the fork to catch up over its branch.
   */
  async function continueFork(ctx: ExtensionContext, parentFile: string | undefined): Promise<void> {
    const parentId = parentFile === undefined ? null : sessionIdInFile(parentFile)
    if (parentId === null || parentId === sessionIdOf(ctx)) return
    const parent = await readState(dir, parentId).catch(() => null)
    if (parent === null || !hasLedger(parent)) return
    await change(sessionIdOf(ctx), s => forkedFrom(s, parent))
  }

  /** Runs once for each session in this process: clears an update flag a crashed process left, and prunes old sessions. */
  function prepare(ctx: ExtensionContext): void {
    const id = sessionIdOf(ctx)
    if (prepared.has(id)) return
    prepared.add(id)
    deps.background(reconcileUpdateStatus(hostFor(ctx)))
    deps.background(pruneSessions(dir, id))
  }

  function fetchPrsWhenDue(ctx: ExtensionContext): void {
    const id = sessionIdOf(ctx)
    if (prFetches.isFetching(id)) return
    deps.background(
      (async () => {
        const host = hostFor(ctx)
        const fetching = prFetches.fetchWhenDue(id, await host.read(), () => fetchPrs(host, true))
        if (!fetching) return
        notifyChanged(id)
        await fetching
        notifyChanged(id)
      })(),
    )
  }

  function wakeLater(ctx: ExtensionContext): void {
    ctx.setTimeout(() => deps.background(wakeForDone(hostFor(ctx))), deps.settleWindowMs + WAKE_MARGIN_MS)
  }

  /** Counts a prompt that reached the agent: matches it to a press and returns the notes the agent is told. */
  async function arrive(id: string, text: string): Promise<string[]> {
    let notes: string[] = []
    await change(id, s => {
      const r = notePrompt(OMP, s, text, openPanels.has(id))
      notes = r.notes

      return r.state
    })

    return notes
  }

  /** Takes record and close out of a session nobody watches, so its agent does not spend calls on them. */
  const dropTools = async () => {
    const active = pi.getActiveTools()
    const kept = active.filter(name => name !== 'record' && name !== 'close')
    if (kept.length !== active.length) await pi.setActiveTools(kept)
  }

  const start = async (ctx: ExtensionContext, parentFile?: string) => {
    if (isUnattended(ctx)) return dropTools()
    // No turn runs as a session starts, so a running turn saved here was cut off by a process that ended.
    const id = sessionIdOf(ctx)
    if ((await readState(dir, id).catch(() => null))?.presence.isTurnRunning)
      await change(id, s => (s.presence.isTurnRunning ? turnEnded(s) : s)).catch(() => undefined)
    prepare(ctx)
    showBand(ctx)
    deps.background(
      continueFork(ctx, parentFile)
        .catch(() => undefined)
        .then(async () => {
          const hostTasks = ompTodoFromBranch(ctx.sessionManager.getBranch())
          const saved = await readState(dir, id).catch(() => null)
          if (hostTasks.length > 0 || (saved?.hostTasks.length ?? 0) > 0) await change(id, s => ({ ...s, hostTasks }))
        })
        .catch(() => undefined)
        .then(() => catchUpUnseen(ctx)),
    )
  }
  pi.on('session_start', (_event, ctx) => start(ctx))
  pi.on('session_switch', (event, ctx) => start(ctx, event.reason === 'fork' ? event.previousSessionFile : undefined))
  // A `/btw` promotion, a fork from an entry and a command's branch give the session a new id, with the old file as
  // `previousSessionFile`. A `/branch` in the same file keeps the id, and the fork step then finds nothing to copy.
  pi.on('session_branch', (event, ctx) => start(ctx, event.previousSessionFile))
  pi.on('session_shutdown', (_event, ctx) => {
    const id = sessionIdOf(ctx)
    openPanels.delete(id)
    prepared.delete(id)
    if (noted?.id === id) noted = null
  })

  pi.on('before_agent_start', async (event, ctx) => {
    if (isUnattended(ctx)) return
    prepare(ctx)
    const id = sessionIdOf(ctx)
    const guidance = guidanceText(OMP)
    const systemPrompt = event.systemPrompt.includes(guidance) ? event.systemPrompt : [...event.systemPrompt, guidance]
    // omp can run this handler again for one prompt. The prompt counts once.
    if (noted?.id !== id || noted.prompt !== event.prompt) {
      const notes = await arrive(id, event.prompt).catch(() => null)
      if (notes) noted = { id, prompt: event.prompt, notes }
    }
    const notes = noted?.notes ?? []

    return {
      systemPrompt,
      ...(notes.length > 0
        ? {
            message: {
              customType: MESSAGE_TYPE,
              content: notes.join('\n\n'),
              display: false,
              attribution: 'agent' as const,
            },
          }
        : {}),
    }
  })

  // Not before_agent_start, which can run twice for one prompt and does not run for a queued message.
  pi.on('agent_start', async (_event, ctx) => {
    if (isUnattended(ctx)) return
    await change(sessionIdOf(ctx), turnStarted).catch(() => undefined)
  })

  pi.on('turn_start', async (_event, ctx) => {
    noted = null
    if (isUnattended(ctx)) return
    await change(sessionIdOf(ctx), s => (s.stop ? { ...s, stop: null } : s)).catch(() => undefined)
  })

  /** Activity notes are best effort, so a failed write never surfaces as an extension error. */
  const noteQuietly = async (ctx: ExtensionContext, line: string | null) => {
    if (!line) return
    try {
      await change(sessionIdOf(ctx), s => noteActivity(s, line))
    } catch {
      return
    }
  }

  // Noted as the tool starts, not in tool_call, which omp waits on before every tool runs.
  pi.on('tool_execution_start', async (event, ctx) => {
    if (isUnattended(ctx)) return
    await noteQuietly(ctx, activityOf(event.toolName, (event.args ?? {}) as Record<string, unknown>))
  })

  pi.on('tool_result', async (event, ctx) => {
    if (isUnattended(ctx)) return
    if (event.toolName === 'bash') {
      const command = (event.input as { command?: unknown }).command
      if (typeof command !== 'string') return
      let isLinked = false
      try {
        await change(sessionIdOf(ctx), s => {
          const after = noteCommandOutput(s, command, textOfBlocks(event.content))
          isLinked = after.ledger !== s.ledger
          return after
        })
      } catch {
        return
      }
      if (isLinked) fetchPrsWhenDue(ctx)
      return
    }
    if (event.toolName !== 'ask') return
    const questions = dialogQuestions((event.input as { questions?: unknown }).questions)
    const outcome = askOutcome(event)
    const line = dialogActivity(questions, outcome)
    await change(sessionIdOf(ctx), s => {
      const noted = noteActivity(s, line)
      return outcome.kind === 'dismissed' ? noteDialog(noted, null, questions) : noted
    }).catch(() => undefined)
  })

  /**
   * A press sent while a turn runs reaches the agent as a queued message, and omp does not run before_agent_start for
   * it. Its arrival is noted here, once the message starts.
   */
  pi.on('message_start', async (event, ctx) => {
    const message = event.message as { role?: unknown; content?: unknown }
    if (isUnattended(ctx) || message.role !== 'user') return
    const id = sessionIdOf(ctx)
    const text = userText(message.content)
    if (text === '' || (noted?.id === id && noted.prompt === text)) return
    try {
      const isSentByPress = (await readState(dir, id)).sent.some(x => x.text === text)
      if (!isSentByPress) return
      const notes = await arrive(id, text)
      noted = { id, prompt: text, notes }
      if (notes.length > 0) {
        pi.sendMessage(
          { customType: MESSAGE_TYPE, content: notes.join('\n\n'), display: false, attribution: 'agent' },
          { deliverAs: 'nextTurn' },
        )
      }
    } catch {
      return
    }
  })

  pi.on('agent_end', async (event, ctx) => {
    if (isUnattended(ctx) || event.willContinue) return
    prepare(ctx)
    const id = sessionIdOf(ctx)
    const last = lastAssistant(event.messages)
    const reply = last ? textOfBlocks(last.content) : ''
    const stop = await stopOf(last, deps.isUsageLimit, deps.now())
    // Escape on the ask dialog aborts the turn, so it ends with no reply text.
    const isDialogDismissed = event.messages.some(isDismissedAsk)
    const hostTasks = ompTodoFromBranch(ctx.sessionManager.getBranch())
    const written = await change(id, s => ({
      ...turnEnded(
        endTurn(OMP, { ...s, hostTasks }, reply, openPanels.has(id), {
          tab: screenTabOf(id),
          queuesEmptyReply: isDialogDismissed,
        }),
      ),
      stop,
    })).catch(() => null)
    if (!written) return
    const host = hostFor(ctx)
    if (needsUpdate(written)) deps.background(runUpdates(updateHostFor(ctx)))
    deps.background(wakeForDone(host))
  })

  const tool = (name: 'record' | 'close', description: string, parameters: object) => {
    pi.registerTool({
      name,
      label: name === 'record' ? 'Inbox record' : 'Inbox close',
      description,
      parameters: parameters as never,
      loadMode: 'essential',
      approval: 'read',
      execute: async (_toolCallId, args, _signal, _onUpdate, ctx) => {
        if (isUnattended(ctx)) return { content: [{ type: 'text', text: 'The inbox is not shown in this session.' }] }
        let result = ''
        await change(sessionIdOf(ctx), s => {
          const r = recorded(OMP, s, name, args as Record<string, unknown>, deps.now())
          result = r.result

          return r.state
        })

        return { content: [{ type: 'text', text: result }] }
      },
    })
  }
  for (const { name, description, inputSchema } of agentTools(OMP)) tool(name, description, inputSchema)

  const modelNameOf = (ctx: ExtensionContext) => {
    const model = inboxModel(ctx)

    return model ? (model.name ?? model.id) : null
  }

  const inbox: Inbox = {
    screen: async (ctx, holds = NO_HOLDS) => {
      const id = sessionIdOf(ctx)
      const s = await readState(dir, id)

      return {
        view: sessionView(s, deps.now(), deps.settleWindowMs, true, holds),
        modelName: modelNameOf(ctx),
        isGhMissing,
        isFetchingPrs: prFetches.isFetching(id),
        stop: s.stop,
        isNextBuild: deps.isNextBuild,
      }
    },
    openPanel: async ctx => {
      openPanels.set(sessionIdOf(ctx), 'needsYou')
      await wakeForDone(hostFor(ctx)).catch(() => undefined)
      fetchPrsWhenDue(ctx)
    },
    showTab: (ctx, tab) => {
      const id = sessionIdOf(ctx)
      if (!openPanels.has(id)) return
      const isChanged = openPanels.get(id) !== tab
      openPanels.set(id, tab)
      if (isChanged)
        deps.background(
          change(id, s => (tab === 'overview' ? lookStartedOn(s, deps.now()) : lookEndedOn(s, deps.now()))),
        )
    },
    closePanel: ctx => {
      const id = sessionIdOf(ctx)
      openPanels.delete(id)
      deps.background(change(id, s => lookEndedOn(s, deps.now())))
    },
    fetchPrsWhenDue,
    onChange: (ctx, listener) => {
      const id = sessionIdOf(ctx)
      const set = listeners.get(id) ?? new Set()
      set.add(listener)
      listeners.set(id, set)

      return () => void set.delete(listener)
    },
    press: async (ctx, p, holds) => {
      const outcome = await press(hostFor(ctx), p, false, holds)
      if (outcome.wakesForDone) wakeLater(ctx)

      return outcome
    },
    resume: ctx => sendToAgent(ctx, RESUME_TEXT),
  }

  const liveSource = (ctx: ExtensionContext): PanelSource => ({
    screen: holds => inbox.screen(ctx, holds),
    press: async (p, holds) => {
      const outcome = await inbox.press(ctx, p, holds)

      return { error: outcome.error, note: outcome.note, isUnconfirmed: outcome.isUnconfirmed }
    },
    resume: async () => inbox.resume(ctx),
    fetchPrsWhenDue: () => inbox.fetchPrsWhenDue(ctx),
    shown: tab => inbox.showTab(ctx, tab),
    onChange: listener => inbox.onChange(ctx, listener),
  })

  const hideBand = (ctx: ExtensionContext) => ctx.ui.setWidget(BAND_KEY, undefined)

  function showBand(ctx: ExtensionContext): void {
    if (ctx.mode !== 'tui') return
    ctx.ui.setWidget(
      BAND_KEY,
      (tui, theme) => {
        const style = styleOf(theme)
        let screen: InboxScreen | null = null
        const refresh = () =>
          inbox
            .screen(ctx)
            .then(next => {
              screen = next
              tui.requestRender()
            })
            .catch(() => undefined)
        void refresh()
        const stop = inbox.onChange(ctx, () => void refresh())

        return {
          render: width => (screen ? bandLines(screen, width, deps.now(), style) : []),
          invalidate: () => {},
          dispose: stop,
        }
      },
      { placement: 'aboveEditor' },
    )
  }

  async function openPanelUi(ctx: ExtensionContext, isDemo: boolean): Promise<void> {
    const { parseKey, extractPrintableText, truncateToWidth } = await import('@oh-my-pi/pi-tui')
    const source = isDemo
      ? demoSource({
          now: deps.now,
          after: (fn, ms) => void ctx.setTimeout(fn, ms),
          settleWindowMs: deps.settleWindowMs,
          isNextBuild: deps.isNextBuild,
        })
      : liveSource(ctx)
    hideBand(ctx)
    if (!isDemo) await inbox.openPanel(ctx)
    try {
      await ctx.ui.custom<null>((tui, theme, _keybindings, done) => {
        const panel = createPanel({
          source,
          style: styleOf(theme),
          now: deps.now,
          requestRender: () => tui.requestRender(),
          close: () => done(null),
          timers: { every: (fn, ms) => ctx.setInterval(fn, ms), stop: handle => ctx.clearTimer(handle as never) },
          height: () => Math.max(10, tui.terminal.rows - 4),
        })
        void panel.start()

        return {
          render: width => panel.render(width).map(line => truncateToWidth(line, width)),
          handleInput: raw => {
            const key = parseKey(raw) ?? ''
            panel.handleInput(key, extractPrintableText(raw))
          },
          invalidate: () => {},
          dispose: () => panel.dispose(),
        }
      })
    } finally {
      if (!isDemo) inbox.closePanel(ctx)
      showBand(ctx)
    }
  }

  pi.registerCommand('inbox', {
    description: 'Show where this session stands and what waits on you',
    handler: async (args, ctx) => {
      const isDemo = args.trim() === 'demo'
      if (ctx.mode === 'tui') return openPanelUi(ctx, isDemo)
      const screen = isDemo
        ? await demoSource({ now: deps.now, after: () => {}, settleWindowMs: deps.settleWindowMs }).screen(NO_HOLDS)
        : await inbox.screen(ctx)
      const { needsYou, findings } = screen.view
      ctx.ui.notify(`Needs you ${needsYou.count}, Findings ${findings.count}`, 'info')
    },
  })

  return inbox
}

export default function (pi: ExtensionAPI): void {
  createInbox(pi)
}
