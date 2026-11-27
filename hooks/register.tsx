import { atom, type EngineInterface, read, type Register, update } from 'claude-code'

import type { DemoCopy, Dialog } from '../types'

import { band } from './mod/mod-band'
import { runOf } from './mod/mod-commands'
import { callAllowed, permissionAsked, waitForPermission } from './mod/mod-dialogs'
import { configFolder, type EngineCalls } from './mod/mod-engine-calls'
import type { HerdrCalls } from './mod/mod-herdr'
import type { HistoryEngine } from './mod/mod-history'
import { hostOf } from './mod/mod-host'
import { conversationSwitched, sessionMoved } from './mod/mod-load'
import { paneClosed, paneMessaged, panePressed, paneScrolled } from './mod/mod-pane-events'
import { syncLook, takePaneKeys } from './mod/mod-pane-open'
import { paneTree } from './mod/mod-pane-render'
import { type Mod, PANE } from './mod/mod-ports'
import { commandRowStored, ownMessageStored, promptSubmitted, replyStored } from './mod/mod-prompts'
import { fetchPrs } from './mod/mod-prs'
import { publishStatus } from './mod/mod-publish'
import { callInput, noteRanCall } from './mod/mod-records'
import type { SaveEngine } from './mod/mod-saves'
import { commit } from './mod/mod-session-write'
import { NO_SESSION, PRESENT } from './mod/mod-sessions'
import { inboxCommand } from './mod/mod-command'
import { ensureOn, registerInboxCommand, sessionEnded, sessionStarted } from './mod/mod-lifecycle'
import { nextBuildMarkPath } from './mod/mod-plugin-files'
import { cancelUndoScroll, mod, sessionState } from './mod/mod-state'
import { agentSpawned, runTool, toolCalled } from './mod/mod-tool-calls'
import { noteStopFailure, noteTurnEnd, noteTurnStart } from './mod/mod-turns'
import { sendUi } from './mod/mod-ui-loop'
import type { UiState } from '../core/view/ui-controller-types'
import { CLAUDE_CODE, guidedCloseDescription } from '../core/domain/model-text'
import { drawableText } from '../core/domain/text'
import { runningSessions } from './mod/running-sessions'
import { modCommandStore } from './mod/mod-command-log'
import { INBOX_COMMAND_TEXT } from '../core/view/tabs'

// The plugin directory accepts `$` passed only to a function declared at the top of this file, so the functions
// below bind the engine calls the mod's modules make, and each hook hands them over in `modOf($)`.

/** The pane's interaction state for the drawn conversation, which the shared controller runs through `sendUi`. */
const UI = atom({ plugin: 'inbox', key: 'ui' } as const, null as UiState | null)
const THEME = atom({ plugin: 'inbox', key: 'theme' } as const, '')
const DIALOGS = atom({ plugin: 'inbox', key: 'dialogs' } as const, [] as Dialog[])
const REDRAW = atom({ plugin: 'inbox', key: 'redraw' } as const, 0)
const RUNNING_FRAME = atom({ plugin: 'inbox', key: 'runningFrame' } as const, 0)
const SESSION = atom({ plugin: 'inbox', key: 'session' } as const, NO_SESSION)
const AWAY = atom({ plugin: 'inbox', key: 'away' } as const, PRESENT)
const UNREADABLE = atom({ plugin: 'inbox', key: 'unreadable' } as const, null as string | null)
const DEMO = atom({ plugin: 'inbox', key: 'demo' } as const, null as DemoCopy | null)
const DEMO_RECORDING = atom({ plugin: 'inbox', key: 'isDemoRecording' } as const, false)
/**
 * The person's line for each `record` or `close` call that has one, by `tool_use_id`. It lives as long as the
 * process, so a call from before it draws nothing under its row.
 */
const PERSON_LINES = atom({ plugin: 'inbox', key: 'personLines' } as const, {} as Record<string, string>)

const RECORD_TOOL = 'mcp__inbox__record'
const CLOSE_TOOL = 'mcp__inbox__close'
const ORDER_TOOL = 'mcp__inbox__order_prs'

function commandCalls($: EngineInterface): EngineCalls {
  return {
    root: () => $.session.root(),
    exists: path => $.fs.exists(path),
    stat: path => $.fs.stat(path),
    run: (argv, init) => $.process.run(argv, init),
    now: () => $.clock.now(),
    write: (path, text) => $.fs.write(path, text),
    list: folder => $.fs.list(folder),
    home: () => $.env.get('HOME'),
    configDir: () => $.env.get('CLAUDE_CONFIG_DIR'),
  }
}

/** The store, clock, debug log and running-conversation calls that `hooks/mod/mod-saves.ts` makes. */
function saveEngine($: EngineInterface, commands: EngineCalls): SaveEngine {
  return {
    store: {
      get: key => $.store.get(key),
      set: (key, value) => $.store.set(key, value),
      delete: key => $.store.delete(key),
      keys: () => $.store.keys(),
    },
    sleep: ms => $.clock.sleep(ms),
    now: () => $.clock.now(),
    after: (ms, fn) => $.clock.after(ms, fn),
    log: text => $.ui.log(text, { to: 'debug' }),
    runningSessions: () =>
      runningSessions({
        configFolder: () => configFolder(commands),
        sessionId: () => $.session.id(),
        list: folder => $.fs.list(folder),
        read: path => $.fs.read(path),
        run: (argv, init) => $.process.run(argv, init),
      }).catch(() => null),
    commands: (id, onChange) =>
      modCommandStore(
        {
          stateEnv: async () => ({ XDG_STATE_HOME: await $.env.get('XDG_STATE_HOME'), HOME: await $.env.get('HOME') }),
          exists: path => $.fs.exists(path),
          read: path => $.fs.read(path),
          write: (path, text) => $.fs.write(path, text),
          run: argv => runOf(commands)(argv, { cwd: '/', timeoutMs: 5000 }),
          now: () => $.clock.now(),
          log: text => $.ui.log(text, { to: 'debug' }),
        },
        id,
        onChange,
      ),
  }
}

function historyEngine($: EngineInterface, saves: SaveEngine): HistoryEngine {
  return {
    ...saves,
    stateEnv: async () => ({ XDG_STATE_HOME: await $.env.get('XDG_STATE_HOME'), HOME: await $.env.get('HOME') }),
    fs: { list: p => $.fs.list(p), read: p => $.fs.read(p), write: (p, text) => $.fs.write(p, text) },
  }
}

function herdrCalls($: EngineInterface, commands: EngineCalls): HerdrCalls {
  return {
    run: runOf(commands),
    env: () =>
      Promise.all([
        $.env.get('HERDR_PANE_ID'),
        $.env.get('HC_TERMINAL_ID'),
        $.env.get('HERDR_APP_HOME'),
        $.env.get('HOME'),
      ]),
    write: (path, text) => $.fs.write(path, text),
    read: path => $.fs.read(path),
    list: folder => $.fs.list(folder),
    stat: path => $.fs.stat(path),
    spawn: argv => $.process.spawn({ argv }),
    now: () => $.clock.now(),
    after: (ms, fn) => void $.clock.after(ms, fn),
    every: (ms, fn) => $.clock.every(ms, fn),
    log: text => void $.ui.log(text, { to: 'debug' }),
    pluginRoot: $.plugin.root,
  }
}

/** What the mod's modules reach through this hook's `$`. */
function modOf($: EngineInterface): Mod {
  const commands = commandCalls($)
  const saves = saveEngine($, commands)
  const m: Mod = {
    atoms: {
      ui: { read: () => read($, UI), update: change => update($, UI, change) },
      theme: { read: () => read($, THEME), update: change => update($, THEME, change) },
      dialogs: { read: () => read($, DIALOGS), update: change => update($, DIALOGS, change) },
      redraw: { read: () => read($, REDRAW), update: change => update($, REDRAW, change) },
      runningFrame: { read: () => read($, RUNNING_FRAME), update: change => update($, RUNNING_FRAME, change) },
      session: { read: () => read($, SESSION) },
      away: { read: () => read($, AWAY), update: change => update($, AWAY, change) },
      unreadable: { read: () => read($, UNREADABLE), update: change => update($, UNREADABLE, change) },
      demo: { read: () => read($, DEMO), update: change => update($, DEMO, change) },
      demoRecording: { read: () => read($, DEMO_RECORDING), update: change => update($, DEMO_RECORDING, change) },
      personLines: { read: () => read($, PERSON_LINES), update: change => update($, PERSON_LINES, change) },
      writtenSession: async () => (await $.state.get({ plugin: 'inbox', key: 'session' })).value,
      old: {
        ledger: () => $.state.get({ plugin: 'inbox', key: 'ledger' }),
        presence: () => $.state.get({ plugin: 'inbox', key: 'presence' }),
        prViews: () => $.state.get({ plugin: 'inbox', key: 'prViews' }),
        stop: () => $.state.get({ plugin: 'inbox', key: 'stop' }),
        lastActions: () => $.state.get({ plugin: 'inbox', key: 'lastActions' }),
        sent: () => $.state.get({ plugin: 'inbox', key: 'sent' }),
        untrackedSent: () => $.state.get({ plugin: 'inbox', key: 'untrackedSent' }),
        tab: () => $.state.get({ plugin: 'inbox', key: 'tab' }),
        page: () => $.state.get({ plugin: 'inbox', key: 'page' }),
        selection: () => $.state.get({ plugin: 'inbox', key: 'selection' }),
        statusSelection: () => $.state.get({ plugin: 'inbox', key: 'statusSelection' }),
        typing: () => $.state.get({ plugin: 'inbox', key: 'typing' }),
        drafts: () => $.state.get({ plugin: 'inbox', key: 'drafts' }),
        discarded: () => $.state.get({ plugin: 'inbox', key: 'discarded' }),
        shown: () => $.state.get({ plugin: 'inbox', key: 'shown' }),
        notes: () => $.state.get({ plugin: 'inbox', key: 'notes' }),
        unfolded: () => $.state.get({ plugin: 'inbox', key: 'unfolded' }),
        closedAll: () => $.state.get({ plugin: 'inbox', key: 'closedAll' }),
        statusUnfolded: () => $.state.get({ plugin: 'inbox', key: 'statusUnfolded' }),
        optionsShown: () => $.state.get({ plugin: 'inbox', key: 'optionsShown' }),
        isHelpShown: () => $.state.get({ plugin: 'inbox', key: 'isHelpShown' }),
      },
    },
    clock: {
      now: () => $.clock.now(),
      sleep: ms => $.clock.sleep(ms),
      after: (ms, fn) => $.clock.after(ms, fn),
      every: (ms, fn) => $.clock.every(ms, fn),
    },
    pane: {
      open: opts => $.ui.open({ id: PANE, title: 'Inbox', ...opts }),
      close: () => $.ui.close({ id: PANE }),
      find: async () => (await $.ui.panes()).find(p => p.id === PANE),
      focus: key => $.ui.focus({ requestId: PANE, key }),
      scrollTo: (key, block) => $.ui.scroll({ in: PANE, to: { key }, block }),
      scrollToStart: () => $.ui.scroll({ in: PANE, to: 'start' }),
      scrollConversation: requestId => $.ui.scroll({ to: { requestId }, block: 'start' }),
      copy: (text, surface) => $.ui.copy({ text, surface }),
      redrawAll: () => $.ui.invalidate('ui.render'),
    },
    conversation: {
      id: () => $.session.id(),
      root: () => $.session.root(),
      turns: () => $.session.turns(),
      messages: () => $.session.messages(),
      append: text => $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }),
      submit: text => $.prompt.submit({ text, asUser: true }),
      agents: () => $.agent.list(),
      checkTool: (tool, input) => $.tool.check({ tool, input }),
    },
    model: { complete: request => $.model.complete(request), fork: request => $.model.fork(request) },
    setup: {
      registerCommand: () => $.command.register({ name: 'inbox', description: INBOX_COMMAND_TEXT, immediate: true }),
      registerTool: tool => $.tool.register(tool),
      surfaces: () => $.session.surfaces(),
      launchEnv: () => Promise.all([$.env.get('CLAUDE_CODE_ENTRYPOINT'), $.env.get('CLAUDE_CODE_CHILD_SESSION')]),
      terminalProgram: () => $.env.get('TERM_PROGRAM'),
      manifest: () => $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`),
      isNextBuild: () => $.fs.exists(nextBuildMarkPath($.plugin.root)),
      theme: async () => (await $.config.list()).find(row => row.key === 'theme')?.value,
    },
    saves,
    history: historyEngine($, saves),
    commands,
    herdr: herdrCalls($, commands),
    pluginRoot: $.plugin.root,
    writeSession: change => update($, SESSION, change),
    commit: (owner, change) => commit(m, owner, change),
    sendUi: (events, surface) => sendUi(m, events, surface),
    publishStatus: (isEnding, isExit) => publishStatus(m, isEnding, isExit),
    syncLook: isOpen => syncLook(m, isOpen),
    takePaneKeys: () => takePaneKeys(m),
    hostOf: (owner, surface) => hostOf(m, owner, surface),
    fetchPrs: (findsBranchPr, isPress) => fetchPrs(m, findsBranchPr, isPress),
  }

  return m
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const m = modOf($)
    await registerInboxCommand(m)
    const r = await next(e)
    await sessionStarted(m, e.isInteractive)

    return r
  })

  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    await ensureOn(modOf($))

    return next(e)
  })

  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    const r = await next(e)
    await conversationSwitched(modOf($), e.session_id, e.source)

    return r
  })

  on('classic.SessionStart', { source: 'startup' }, async ($, e, next) => {
    const r = await next(e)
    await sessionMoved(modOf($))

    return r
  })

  on('session.end', async ($, e, next) => {
    await sessionEnded(modOf($), e.reason)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const notes = await promptSubmitted(modOf($), e)

    return notes.length === 0 ? next(e) : next({ ...e, context: [...(e.context ?? []), ...notes] })
  })

  on('turn.start', async ($, e, next) => {
    await noteTurnStart(modOf($), e.agentId)

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    await agentSpawned(modOf($), e, r.deny === undefined ? r.agentId : undefined)

    return r
  })

  on('tool.describe', { tool: RECORD_TOOL }, async (_$, e, next) => ({ ...(await next(e)), isDeferred: false }))
  on('tool.call', { tool: RECORD_TOOL }, async ($, e) => ({
    result: await runTool(modOf($), 'record', e as unknown as Record<string, unknown>, e.tool_use_id),
  }))
  on('tool.describe', { tool: CLOSE_TOOL }, async (_$, e, next) => {
    const r = await next(e)

    return { ...r, description: guidedCloseDescription(CLAUDE_CODE, r.description), isDeferred: false }
  })
  on('tool.call', { tool: CLOSE_TOOL }, async ($, e) => ({
    result: await runTool(modOf($), 'close', e as unknown as Record<string, unknown>, e.tool_use_id),
  }))
  on('tool.describe', { tool: ORDER_TOOL }, async (_$, e, next) => ({ ...(await next(e)), isDeferred: false }))
  on('tool.call', { tool: ORDER_TOOL }, async ($, e) => ({
    result: await runTool(modOf($), 'order_prs', e as unknown as Record<string, unknown>, e.tool_use_id),
  }))

  on('tool.call', async ($, e, next) => toolCalled(modOf($), e, next))

  on('classic.PostToolUse', async (_$, e, next) => {
    if (mod.isOn) noteRanCall(e.tool_use_id, e.tool_name)
    return next(e)
  })
  on('classic.PostToolUseFailure', async (_$, e, next) => {
    if (mod.isOn) noteRanCall(e.tool_use_id, e.tool_name)
    return next(e)
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    mod.hasPermissionRequestHook = true
    await permissionAsked(modOf($), e.tool_name, e.tool_input)

    return next(e)
  })

  // Where the guard skips classic.PermissionRequest, the permission row comes from here. The plugin
  // directory accepts a permission hook only when it returns next(e) itself, so waitForPermission
  // asks for the verdict with a query of its own.
  on('tool.check', async ($, e, next) => {
    const mayShowRow = mod.isOn && !mod.hasPermissionRequestHook && !e.agentId && e.tool !== 'AskUserQuestion'
    if (mayShowRow && e.tool_use_id) void waitForPermission(modOf($), e.tool_use_id, e.tool, e.input)

    return next(e)
  })

  on('tool.run', async ($, e, next) => {
    if (mod.isOn) void callAllowed(modOf($), e.tool_use_id, String(e.tool), callInput(e)).catch(() => undefined)

    return next(e)
  })

  on('classic.StopFailure', async ($, e, next) => {
    const r = await next(e)
    await noteStopFailure(modOf($), e)

    return r
  })

  on('turn.step', async function* (_$, e, next) {
    if (!mod.isOn || e.agentId) return yield* next(e)
    const response = yield* next(e)
    sessionState.stepTexts.push(response.answer)

    return response
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await noteTurnEnd(modOf($), e)

    return r
  })

  on(
    'session.append',
    { door: ['prompt', 'delivery'], origin: { kind: 'plugin', name: 'inbox' } },
    async ($, e, next) => {
      await ownMessageStored(modOf($), e)

      return next(e)
    },
  )

  on('session.append', { door: 'response' }, async ($, e, next) => {
    const r = await next(e)
    await replyStored(modOf($), e)

    return r
  })

  on('session.append', { door: 'command' }, async ($, e, next) => {
    const r = await next(e)
    await commandRowStored(modOf($), e)

    return r
  })

  on('command.run', { command: 'inbox' }, async ($, e) => inboxCommand(modOf($), e))

  on('ui.press', async ($, e, next) => {
    await panePressed(modOf($), e)
    return next(e)
  })

  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    await paneScrolled(modOf($), e.origin.kind === 'person')
    return next(e)
  })

  on('ui.message', async ($, e, next) => {
    const r = await next(e)
    await paneMessaged(modOf($), e)

    return r
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'plugin') return next(e)
    cancelUndoScroll()
    const r = await next(e)
    await paneClosed(modOf($))

    return r
  })

  // The ctrl+o transcript draws the text the agent read.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const isInboxTool = [RECORD_TOOL, CLOSE_TOOL, ORDER_TOOL].includes(e.props.tool)
    if (!mod.isOn || !isInboxTool || e.props.isExpanded || e.props.isErrored) return next(e)
    const line = (await read($, PERSON_LINES))[e.props.tool_use_id]
    if (line === undefined) {
      const { Box } = $.ui.resolve(e)

      return <Box />
    }

    return next({ ...e, props: { ...e.props, output: drawableText(line) } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!mod.isOn || e.props.hasSurvey) return next(e)

    return band(modOf($), e, $.ui.resolve(e), () => next(e))
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined) await update($, THEME, () => (typeof r.value === 'string' ? r.value : ''))

    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => paneTree(modOf($), e, $.ui.resolve(e)))
}
