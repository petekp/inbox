import { randomUUID } from 'node:crypto'
import { NO_PR_SHARED } from '../../hooks/pr-fetch'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { version } from '../package.json'

import type { AssistantMessage, Context, Model } from '@oh-my-pi/pi-ai'
import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent'

import { TIMED_OUT_CODE, UNSTARTABLE_CODE } from '../../hooks/gh'
import { herdrReporter, herdrTarget } from '../../hooks/herdr'
import type { HerdrTarget } from '../../hooks/herdr'
import { herdrPanelOpener } from '../../hooks/herdr-open'
import type { PressFile } from '../../hooks/herdr-press-file'
import type { Run } from '../../hooks/gh'
import { COMPARE_PAGE_FILE } from '../../hooks/press-messages'
import { recorded } from '../../hooks/session-presses'
import { prFetchTracker } from '../../hooks/host-prs'
import type { SessionHost } from '../../hooks/session-host'
import { agentTools } from '../../hooks/tools'
import type { AgentTool, ToolAnswer } from '../../hooks/tools'
import { NEXT_BUILD_MARK } from '../../hooks/banners'
import { NO_HOLDS, SETTLED_MS } from '../../hooks/timing'
import { inboxCommandText } from '../../hooks/tabs'
import { createPanel } from './controller'
import { demoSource } from './demo'
import { bandLines } from './panel'
import type { PanelScreen } from './panel'
import { wrapText } from './panel-text'
import { styleOf } from './theme'
import type { OmpState } from './state'
import { OMP, TOOL_LABELS } from './texts'
import { activityHandlers } from './host-activity'
import { isUnattended, sessionIdOf } from './host-context'
import type { HostContext, OmpContext } from './host-context'
import { herdrLog, ompPresses } from './host-presses'
import { panelCalls } from './host-panel'
import type { Inbox } from './host-panel'
import { sessionCalls } from './host-sessions'
import { MESSAGE_TYPE, turnHandlers } from './host-turns'
import { shownLine } from './omp-messages'
import type { ToolDetails } from './omp-messages'

const INBOX_MODEL_TIMEOUT_MS = 120_000

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
  /** The page template for a comparison, beside the extension's bundle. */
  comparePage: string
  complete: Complete
  /** Copies text to the clipboard. Returns why it could not, or null. */
  copy: (text: string) => Promise<string | null>
  /** Runs work the handler that started it does not wait for. */
  background: (work: Promise<unknown>) => void
  /** Runs `fn` once, `ms` from now, without keeping omp running. */
  after: (ms: number, fn: () => Promise<unknown>) => void
  /** Whether a failed request hit the account's usage limit, by omp's own rule. */
  isUsageLimit: (status: number | undefined, message: string) => Promise<boolean>
  /** The Herdr pane or app terminal omp runs in, from `herdrTarget`, or null outside Herdr. */
  herdrTarget: HerdrTarget | null
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
  comparePage: join(dirname(fileURLToPath(import.meta.url)), COMPARE_PAGE_FILE),
  complete: defaultComplete,
  copy: copyToClipboard,
  background: work => void work.catch(() => undefined),
  after: (ms, fn) => void setTimeout(fn, ms).unref(),
  isUsageLimit: isUsageLimitOutcome,
  herdrTarget: herdrTarget(process.env),
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

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
function inboxModel(ctx: ExtensionContext): Model | null {
  const sonnets = ctx.models
    .list()
    .filter(m => m.identity.family === 'sonnet')
    .toSorted(byNewestRevision)
  const sonnet = sonnets.find(m => m.provider === 'anthropic') ?? sonnets[0]

  return ctx.models.resolve('@inbox') ?? sonnet ?? ctx.models.resolve('@smol') ?? null
}

export function createInbox(pi: ExtensionAPI, deps: HostDeps = defaultDeps): Inbox {
  const dir = deps.stateDir(pi)

  const run: Run = async (args, { cwd, timeoutMs }) => {
    const [file = '', ...rest] = args
    try {
      const r = await pi.exec(file, rest, { cwd, timeout: timeoutMs })

      return { code: r.killed ? TIMED_OUT_CODE : r.code, stdout: r.stdout, stderr: r.stderr }
    } catch (err) {
      return { code: UNSTARTABLE_CODE, stdout: '', stderr: messageOf(err) }
    }
  }

  /** The sends of each session that wait for its next run to start. */
  const runStartWaiters = new Map<string, Set<() => void>>()

  /**
   * Sends text to the agent as if the person typed it. Returns why it could not, or null. From omp 18.18.2,
   * `sendUserMessage` rejects when omp drops the message before a run starts, as for the cost cap. Sent while the
   * agent is idle, it settles only when the whole run ends, so this also returns null once the session's next run
   * starts. omp 18.18.1 and older return nothing, and a send that does not throw has gone.
   */
  const sendToAgent = async (ctx: ExtensionContext, text: string): Promise<string | null> => {
    const id = sessionIdOf(ctx)
    const waiters = runStartWaiters.get(id) ?? new Set<() => void>()
    runStartWaiters.set(id, waiters)
    let started = () => {}
    const runStarted = new Promise<null>(resolve => {
      started = () => resolve(null)
    })
    waiters.add(started)
    try {
      const options = ctx.isIdle() ? undefined : { deliverAs: 'followUp' as const }
      const sent = Promise.resolve(pi.sendUserMessage(text, options)).then(
        () => null,
        (err: unknown) => messageOf(err),
      )

      return await Promise.race([sent, runStarted])
    } catch (err) {
      return messageOf(err)
    } finally {
      waiters.delete(started)
    }
  }

  const onRunStart = (ctx: ExtensionContext) => {
    for (const started of runStartWaiters.get(sessionIdOf(ctx)) ?? []) started()
  }

  function askFor(ctx: ExtensionContext, id: string): SessionHost<OmpState>['ask'] {
    return async (prompt, system, _kind, report) => {
      const model = inboxModel(ctx)
      if (!model) {
        report?.({ model: 'none', error: 'omp offers no model for the inbox', cause: 'error' })
        return null
      }
      const asked = `${model.provider}/${model.id}`
      try {
        const apiKey = await ctx.modelRegistry.getApiKey(model, id)
        if (!apiKey) {
          report?.({ model: asked, error: 'omp has no sign-in for the model', cause: 'error' })
          return null
        }
        const reply = await deps.complete(
          model,
          {
            systemPrompt: [system],
            messages: [{ role: 'user', content: prompt, timestamp: deps.now() }],
          },
          { apiKey, signal: AbortSignal.timeout(INBOX_MODEL_TIMEOUT_MS) },
        )
        if (reply.stopReason === 'error' || reply.stopReason === 'aborted') {
          const status = reply.errorStatus === undefined ? '' : ` ${reply.errorStatus}`
          report?.({
            model: asked,
            error: `${reply.stopReason}${status}: ${reply.errorMessage ?? ''}`.trim(),
            cause: 'error',
          })
          return null
        }
        const text = reply.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
        // `model` repeats the id asked for. `upstreamModel` names the model that answered, when omp can tell.
        const answeredBy = reply.upstreamModel === undefined ? {} : { answeredBy: reply.upstreamModel }
        report?.({
          model: asked,
          ...answeredBy,
          ...(text === '' ? { error: 'the reply held no text', cause: 'no-reply' as const } : {}),
        })

        return text === '' ? null : text
      } catch (err) {
        report?.({ model: asked, error: messageOf(err), cause: 'error' })
        return null
      }
    }
  }

  /** Takes record and close out of a session nobody watches, so its agent does not spend calls on them. */
  const dropTools = async () => {
    const active = pi.getActiveTools()
    const kept = active.filter(name => name !== 'record' && name !== 'close')
    if (kept.length !== active.length) await pi.setActiveTools(kept)
  }

  const modelNameOf = (ctx: ExtensionContext) => {
    const model = inboxModel(ctx)

    return model ? (model.name ?? model.id) : null
  }

  const logHerdr = herdrLog(dir)
  const applyHerdrPress = async (ctx: OmpContext, file: PressFile) => {
    await inbox.press(ctx, file.press, file.holds, file)
  }

  const context: HostContext = {
    deps,
    dir,
    openPanels: new Map(),
    prepared: new Set(),
    prFetches: prFetchTracker(deps.now),
    listeners: new Map(),
    reportToHerdr: herdrReporter(logHerdr),
    logHerdr,
    presses: ompPresses(deps.herdrTarget, (ctx, file) => applyHerdrPress(ctx, file), logHerdr),
    run,
    memory: { isGhMissing: false, prShared: NO_PR_SHARED, shownId: null, framesFor: null, shownCwd: null },
    sendToAgent,
    askFor,
    dropTools,
    showBand,
    modelNameOf,
    sendNotes: notes =>
      pi.sendMessage(
        { customType: MESSAGE_TYPE, content: notes.join('\n\n'), display: false, attribution: 'agent' },
        { deliverAs: 'nextTurn' },
      ),
  }
  const sessions = sessionCalls(context)
  const { change } = sessions
  const turns = turnHandlers(context, sessions)
  const { start } = turns
  const activity = activityHandlers(context, sessions)
  const { inbox, liveSource } = panelCalls(context, sessions)

  pi.events.on('task:subagent:lifecycle', activity.onSubagentLifecycle)
  pi.events.on('task:subagent:progress', activity.onSubagentProgress)
  pi.on('session_start', (_event, ctx) => start(ctx))
  pi.on('session_switch', (event, ctx) => start(ctx, event.reason === 'fork' ? event.previousSessionFile : undefined))
  // A `/btw` promotion, a fork from an entry and a command's branch give the session a new id, with the old file as
  // `previousSessionFile`. A `/branch` in the same file keeps the id, and the fork step then finds nothing to copy.
  pi.on('session_branch', (event, ctx) => start(ctx, event.previousSessionFile))
  pi.on('session_shutdown', turns.onSessionShutdown)
  pi.on('before_agent_start', turns.onBeforeAgentStart)
  pi.on('input', turns.onInput)
  pi.on('agent_start', (event, ctx) => {
    onRunStart(ctx)

    return turns.onAgentStart(event, ctx)
  })
  pi.on('turn_start', turns.onTurnStart)
  pi.on('tool_execution_start', activity.onToolExecutionStart)
  pi.on('tool_execution_end', activity.onToolExecutionEnd)
  pi.on('tool_result', activity.onToolResult)
  pi.on('message_end', turns.onMessageEnd)
  pi.on('message_start', turns.onMessageStart)
  pi.on('agent_end', turns.onAgentEnd)

  const tool = (name: AgentTool, description: string, parameters: object) => {
    pi.registerTool({
      name,
      label: TOOL_LABELS[name],
      description,
      parameters: parameters as never,
      loadMode: 'essential',
      approval: 'read',
      execute: async (_toolCallId, args, _signal, _onUpdate, ctx) => {
        if (isUnattended(ctx)) return { content: [{ type: 'text', text: 'The inbox is not shown in this session.' }] }
        let answer: Omit<ToolAnswer, 'ledger'> = { result: '', personLine: null }
        await change(sessionIdOf(ctx), s => {
          const r = recorded(OMP, s, name, args as Record<string, unknown>, deps.now())
          answer = r

          return r.state
        })
        const details: ToolDetails = { personLine: answer.personLine }

        return { content: [{ type: 'text', text: answer.result }], details }
      },
      renderResult: (result, _options, theme) => {
        const line = shownLine(result)

        return {
          render: width => (line === null ? [] : wrapText(line, width).map(l => theme.fg('toolOutput', l))),
          invalidate: () => {},
        }
      },
      describeResult: result => {
        const line = shownLine(result)

        return { tool: {}, body: line === null ? undefined : [{ k: 'text', p: { text: line } }] }
      },
    })
  }

  for (const { name, description, inputSchema } of agentTools(OMP)) tool(name, description, inputSchema)

  const hideBand = (ctx: ExtensionContext) => ctx.ui.setWidget(BAND_KEY, undefined)

  function showBand(ctx: ExtensionContext): void {
    if (ctx.mode !== 'tui') return
    ctx.ui.setWidget(
      BAND_KEY,
      (tui, theme) => {
        const style = styleOf(theme)
        let screen: PanelScreen | null = null
        const refresh = () =>
          inbox
            .screen(ctx)
            .then(next => {
              screen = next
              tui.requestRender()
            })
            .catch(() => {
              if (screen && !screen.isReadFailed) {
                screen = { ...screen, isReadFailed: true }
                tui.requestRender()
              }
            })
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
    const openedAt = deps.now()
    const { parseKey, extractPrintableText, truncateToWidth } = await import('@oh-my-pi/pi-tui')
    const source = isDemo
      ? demoSource({
          now: deps.now,
          after: (fn, ms) => void ctx.setTimeout(fn, ms),
          settleWindowMs: deps.settleWindowMs,
          version,
          isNextBuild: deps.isNextBuild,
          comparePage: deps.comparePage,
          modelName: modelNameOf(ctx),
        })
      : liveSource(ctx)
    hideBand(ctx)
    if (!isDemo) await inbox.openPanel(ctx, openedAt)
    try {
      await ctx.ui.custom<null>((tui, theme, _keybindings, done) => {
        const panel = createPanel({
          source,
          style: styleOf(theme),
          now: deps.now,
          openedAt,
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

  const openHerdrPanel = herdrPanelOpener()
  const isFile = (path: string) => stat(path).then(s => s.isFile())

  pi.registerCommand('inbox', {
    description: inboxCommandText(deps.isNextBuild),
    handler: async (args, ctx) => {
      const isDemo = args.trim() === 'demo'
      const target = deps.herdrTarget
      const isHerdrApp = ctx.mode === 'tui' && !args.trim() && target?.kind === 'terminal'
      const herdr = isHerdrApp ? await openHerdrPanel({ run, isFile }, target) : null
      if (herdr) ctx.ui.notify(herdr.text, herdr.isShown ? 'info' : 'warning')
      if (herdr?.isShown) return
      if (ctx.mode === 'tui') return openPanelUi(ctx, isDemo)
      const screen = isDemo
        ? await demoSource({
            now: deps.now,
            after: () => {},
            settleWindowMs: deps.settleWindowMs,
            version,
            comparePage: deps.comparePage,
            modelName: modelNameOf(ctx),
          }).screen(NO_HOLDS)
        : await inbox.screen(ctx)
      const { needsYou, findings } = screen.view
      ctx.ui.notify(`Asks ${needsYou.count}, Finds ${findings.count}`, 'info')
    },
  })

  return inbox
}

export default function (pi: ExtensionAPI): void {
  createInbox(pi)
}
