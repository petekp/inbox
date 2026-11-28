import { randomUUID } from 'node:crypto'
import { NO_PR_SHARED } from '../../core/domain/pr-fetch'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { version } from '../package.json'

import type { AssistantMessage, Context, Model } from '@oh-my-pi/pi-ai'
import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent'

import { copyToClipboard } from './clipboard'
import { TIMED_OUT_CODE, UNSTARTABLE_CODE } from '../../core/domain/gh'
import { herdrReporter, herdrTarget } from '../../core/remote/herdr'
import { delegateReader } from '../../core/remote/hc-terminals'
import type { HerdrTarget } from '../../core/remote/herdr'
import { herdrPanelOpener } from '../../core/remote/herdr-open'
import type { Run } from '../../core/domain/gh'
import { COMPARE_PAGE_FILE } from '../../core/domain/press-messages'
import { recorded } from '../../core/runtime/session-presses'
import type { PreviewPages } from '../../core/runtime/preview-pages'
import { ompPreviewPages } from './preview-pages'
import { addsTabPr, prFetchTracker } from '../../core/runtime/host-prs'
import type { SessionHost } from '../../core/runtime/session-host'
import { agentTools } from '../../core/runtime/tools'
import { TOOL_FIELDS } from '../../core/domain/tool-schemas'
import type { AgentTool } from '../../core/runtime/tools'
import type { ToolAnswer } from '../../core/runtime/tool-answer'
import { NEXT_BUILD_MARK } from '../../core/view/banners'
import { NO_HOLDS, RUNNING_FRAME_MS, SETTLED_MS } from '../../core/view/timing'
import { INBOX_COMMAND_TEXT } from '../../core/view/tabs'
import { createPanel } from './controller'
import { demoSource } from './demo'
import { bandLines, withScreenReadFailed } from './panel'
import type { InboxModel, PanelScreen } from './panel'
import { wrapText } from './panel-text'
import { countCellsAsOmp, panelView, screenRows } from './panel-view'
import { inboxModel } from './inbox-model'
import { styleOf } from './theme'
import type { OmpState } from './state'
import { recordMatchesNow, useQuestionHistory } from './state'
import { questionHistoryPlace } from './question-history'
import { registryFolder } from '../../core/runtime/session-registry'
import type { HistoryPlace } from '../../core/runtime/history-store'
import { OMP, TOOL_LABELS } from './texts'
import { activityHandlers } from './host-activity'
import { isUnattended, sessionIdOf } from './host-context'
import type { HostContext } from './host-context'
import { ompPresses, startOmpInHerdrApp } from './host-presses'
import { herdrLog } from './herdr-log'
import { agentSender, messageOf } from './host-send'
import { ompHerdrAsk } from './host-herdr-ask'
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
  /** Whether the installed extension's folder holds `NEXT_BUILD_MARK`, which adds "next" to the version label and keeps Status call records. */
  isNextBuild: boolean
  /** The page template for a comparison, beside the extension's bundle. */
  comparePage: string
  /** Each session's previews pages, which log a failure with `log`. Without it, no page is written. */
  previewPages?: (log: (text: string) => void) => PreviewPages
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
  /** The question history for the sessions saved in `dir`. A host without one saves no history. */
  questionHistory?: (dir: string) => HistoryPlace | null
  /** The session registry folder, from `registryFolder`. A host without one writes no registry entry. */
  registryFolder?: string | null
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

const defaultDeps: HostDeps = {
  stateDir: pi => join(pi.pi.getAgentDir(), 'inbox'),
  now: Date.now,
  newId: randomUUID,
  settleWindowMs: SETTLED_MS,
  home: homedir(),
  isNextBuild: existsSync(join(dirname(dirname(fileURLToPath(import.meta.url))), NEXT_BUILD_MARK)),
  comparePage: join(dirname(fileURLToPath(import.meta.url)), COMPARE_PAGE_FILE),
  previewPages: log =>
    ompPreviewPages(process.env, join(dirname(fileURLToPath(import.meta.url)), COMPARE_PAGE_FILE), log),
  complete: defaultComplete,
  copy: copyToClipboard,
  background: work => void work.catch(() => undefined),
  after: (ms, fn) => void setTimeout(fn, ms).unref(),
  isUsageLimit: isUsageLimitOutcome,
  herdrTarget: herdrTarget(process.env),
  questionHistory: dir => questionHistoryPlace(process.env, dir),
  registryFolder: registryFolder(process.env),
}

export function createInbox(pi: ExtensionAPI, deps: HostDeps = defaultDeps): Inbox {
  const dir = deps.stateDir(pi)
  useQuestionHistory(deps.questionHistory?.(dir) ?? null)

  const run: Run = async (args, { cwd, timeoutMs }) => {
    const [file = '', ...rest] = args
    try {
      const r = await pi.exec(file, rest, { cwd, timeout: timeoutMs })

      return { code: r.killed ? TIMED_OUT_CODE : r.code, stdout: r.stdout, stderr: r.stderr }
    } catch (err) {
      return { code: UNSTARTABLE_CODE, stdout: '', stderr: messageOf(err) }
    }
  }

  const { sendToAgent, onRunStart } = agentSender(pi)

  function askFor(ctx: ExtensionContext, id: string): SessionHost<OmpState>['ask'] {
    return async (prompt, system, _kind, report) => {
      const model = inboxModel(ctx.models)
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

  const inboxModelOf = (ctx: ExtensionContext): InboxModel => {
    const model = inboxModel(ctx.models)

    const keys = ctx.modelRegistry.authStorage.keys
    const hasSignIn = (provider: string) => keys.source(provider) !== undefined || keys.keyless(provider)

    return {
      modelName: model ? (model.name ?? model.id) : null,
      isSignedIn: ctx.models.list().some(m => hasSignIn(m.provider)),
    }
  }

  const logHerdr = herdrLog(dir)
  const context: HostContext = {
    deps,
    dir,
    openPanels: new Map(),
    openAsks: new Map(),
    uiStates: new Map(),
    prepared: new Set(),
    prFetches: prFetchTracker(deps.now, id => sessions.notifyChanged(id)),
    listeners: new Map(),
    reportToHerdr: herdrReporter(logHerdr),
    logHerdr,
    presses: ompPresses(deps.herdrTarget, (ctx, file) => inbox.herdrFile(ctx, file), logHerdr),
    run,
    delegate: delegateReader(deps.herdrTarget, run),
    memory: {
      isGhMissing: false,
      prShared: NO_PR_SHARED,
      shownId: null,
      framesFor: null,
      shownCwd: null,
      herdrModFailure: null,
      herdrAsk: null,
    },
    sendToAgent,
    askFor,
    dropTools,
    showBand,
    inboxModelOf,
    sendNotes: notes =>
      pi.sendMessage(
        { customType: MESSAGE_TYPE, content: notes.join('\n\n'), display: false, attribution: 'agent' },
        { deliverAs: 'nextTurn' },
      ),
  }
  const sessions = sessionCalls(context)
  const { changeByTool, fetchPrsNow } = sessions
  const turns = turnHandlers(context, sessions)
  const { start } = turns
  const activity = activityHandlers(context, sessions)
  const herdrAsk = ompHerdrAsk(deps.herdrTarget, context.memory, () => {
    for (const listeners of context.listeners.values()) for (const listener of listeners) listener()
  })
  const { inbox, liveSource } = panelCalls(context, sessions, herdrAsk)

  pi.events.on('task:subagent:lifecycle', activity.onSubagentLifecycle)
  pi.events.on('task:subagent:progress', activity.onSubagentProgress)
  let isHerdrStarted = false
  pi.on('session_start', (_event, ctx) => {
    if (!isHerdrStarted)
      void startOmpInHerdrApp(deps.herdrTarget, run, logHerdr)
        .then(result => herdrAsk.started(result))
        .catch(() => undefined)
    isHerdrStarted = true
    return start(ctx)
  })
  pi.on('session_switch', (event, ctx) => start(ctx, event.reason === 'fork' ? event.previousSessionFile : undefined))
  // A `/btw` promotion, a fork from an entry and a command's branch give the session a new id, with the old file as
  // `previousSessionFile`. A `/branch` in the same file keeps the id, and the fork step then finds nothing to copy.
  pi.on('session_branch', (event, ctx) => start(ctx, event.previousSessionFile))
  pi.on('session_shutdown', turns.onSessionShutdown)
  // omp sends session_clear at `/clear` from 18.20.1. Older omp never sends it, and the pinned types do not list it.
  ;(pi.on as (event: string, handler: typeof turns.onSessionClear) => void)('session_clear', turns.onSessionClear)
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
  pi.on('agent_end', (event, ctx) => {
    activity.onAgentEnd(event, ctx)
    return turns.onAgentEnd(event, ctx)
  })

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
        const delegate = await context.delegate()
        const input = args as Record<string, unknown>
        const earlier = name === 'record' ? await recordMatchesNow(input, deps.now()) : []
        let addsPr = false
        await changeByTool(sessionIdOf(ctx), s => {
          const r = recorded(OMP, s, name, input, deps.now(), TOOL_FIELDS, delegate, earlier)
          answer = r
          addsPr = addsTabPr(s, r.state)

          return r.state
        })
        if (addsPr) fetchPrsNow(ctx)
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
        let newestRefresh = 0
        const refresh = () => {
          const mine = ++newestRefresh

          return inbox
            .screen(ctx)
            .then(next => {
              if (mine !== newestRefresh) return
              screen = next
              tui.requestRender()
            })
            .catch(() => {
              if (mine === newestRefresh && screen && !screen.isReadFailed) {
                screen = withScreenReadFailed(screen)
                tui.requestRender()
              }
            })
        }
        void refresh()
        const stop = inbox.onChange(ctx, () => void refresh())
        const frames = setInterval(() => {
          if (screen?.view.sync.ledger.is === 'checking') tui.requestRender()
        }, RUNNING_FRAME_MS)

        return {
          render: width => (screen ? bandLines(screen, width, deps.now(), style) : []),
          invalidate: () => {},
          dispose: () => {
            clearInterval(frames)
            stop()
          },
        }
      },
      { placement: 'aboveEditor' },
    )
  }

  async function openPanelUi(ctx: ExtensionContext, isDemo: boolean): Promise<void> {
    const openedAt = deps.now()
    const tui = await import('@oh-my-pi/pi-tui')
    const source = isDemo
      ? demoSource({
          now: deps.now,
          settleWindowMs: deps.settleWindowMs,
          version,
          isNextBuild: deps.isNextBuild,
          comparePage: deps.comparePage,
          inboxModel: inboxModelOf(ctx),
        })
      : liveSource(ctx)
    hideBand(ctx)
    if (!isDemo) await inbox.openPanel(ctx, openedAt)
    // omp 19.2 calls no dispose on a node view, so the panel is disposed once the view closes.
    let dispose = () => {}
    try {
      await ctx.ui.custom<null>((ui, theme, _keybindings, done) => {
        const panel = createPanel({
          source,
          style: styleOf(theme),
          now: deps.now,
          openedAt,
          requestRender: () => shown.requestRender(),
          close: () => done(null),
          timers: {
            every: (fn, ms) => ctx.setInterval(fn, ms),
            after: (fn, ms) => ctx.setTimeout(fn, ms),
            stop: handle => ctx.clearTimer(handle as never),
          },
          height: () => Math.max(10, screenRows(ui) - 4),
        })
        const shown = panelView(tui, ui, panel)
        dispose = shown.dispose
        void panel.start()

        return shown.view as never
      })
    } finally {
      dispose()
      if (!isDemo) inbox.closePanel(ctx)
      showBand(ctx)
    }
  }

  const openHerdrPanel = herdrPanelOpener()
  const isFile = (path: string) => stat(path).then(s => s.isFile())

  pi.registerCommand('inbox', {
    description: INBOX_COMMAND_TEXT,
    handler: async (args, ctx) => {
      if (args.trim() === 'herdr') {
        const again = await herdrAsk.again()
        ctx.ui.notify(again.text, 'info')
        if (again.isShown && ctx.mode === 'tui') await openPanelUi(ctx, false)
        return
      }
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
            settleWindowMs: deps.settleWindowMs,
            version,
            comparePage: deps.comparePage,
            inboxModel: inboxModelOf(ctx),
          }).screen(NO_HOLDS, {})
        : await inbox.screen(ctx)
      const { needsYou, findings } = screen.view
      ctx.ui.notify(`Asks ${needsYou.count}, Finds ${findings.count}`, 'info')
    },
  })

  return inbox
}

export default function (pi: ExtensionAPI): void {
  void import('@oh-my-pi/pi-tui').then(countCellsAsOmp)
  createInbox(pi)
}
