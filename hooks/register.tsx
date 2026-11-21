import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  Register,
  RenderSurface,
  UiPressArgument,
  UiScrollBlock,
  UiScrollResult,
} from 'claude-code'

import type {
  Cursor,
  DemoCopy,
  Dialog,
  Draft,
  FoldKind,
  Ledger,
  LastAction,
  SessionStatus,
  PageTab,
  RowNote,
  SentPrompt,
  Stop,
  Tab,
  Session,
} from '../types'
import { childEnded } from './status-children'
import { claimedStatusRefresh, forkedFrom, statusChanged, withLook } from './session-status'
import {
  cleared,
  commandFindings,
  endTurn,
  messageTyped,
  noteActivity as noteTurnActivity,
  recordPrompt,
  startTurn,
  turnEnded,
  turnStarted,
  cutOffTurn,
  withNewPrRefs,
  type SentBy,
} from './session-turns'
import { upgradeSession, type SavedSession } from './session-files'
import { pruned, type SendOutcome } from './session-presses'
import { isCompareInBackground } from './press-messages'
import { sessionView, type SessionView } from './session-view'
import {
  childrenCutOff,
  childStarted,
  childWorked,
  delegateRef,
  delegatesSettled,
  delegatesStarted,
  delegateSteps,
  delegatesTakenBack,
  delegateWaitsEnded,
  noticeApplied,
  subagentsSettled,
  taskNotice,
  waitsOnDelegate,
} from './children'
import { CATCH_UP_CALL, runUpdates } from './session-host'
import { heardCall } from './call-record'
import { fetchPrs as fetchSessionPrs, isPrFetchDue, isPrPollDue, PR_POLL_MS } from './host-prs'
import { tabPrs } from './pr-fetch'
import type { FetchAsk } from './pr-fetch'
import { prSharedStore } from './mod-pr-shared'
import { refreshStatus, type StatusCall, type StatusRecords } from './status-records'
import { configFolder, recordsFolder, statusRecords, type EngineCalls } from './mod-engine-calls'
import { startPress, wakeAfterSettle as wakeSessionAfterSettle } from './host-press'
import type { Ask, CatchUpReply, SessionHost } from './session-host'
import { callReport, MODEL } from './inbox-model'
import { demoView, isDemoCopy } from './demo'
import { claudeTasksAfter } from './host-tasks'
import { noteAnsweredDialog, noteDialog } from './dialogs'
import { isPrPress, pressRowId, type PrPress } from './pr-press'
import { openPrViews, prUndoBlockAfter } from './pr-views'
import { prBlockRows, threadSentIn } from './pr-rows'
import { prNeedsYou } from './prs'
import { EMPTY, isBlankLedger } from './ledger'
import { closeItem } from './ledger-close'
import { tasksRunBy } from './reply-parse'
import { CLAUDE_CODE, guidedCloseDescription } from './model-text'
import { statusCarryText, screenText, type ScreenTab } from './inbox-text'
import { catchUpPrompt, dialogActivity, dialogQuestions, toolActivity, transcriptCatchUpPrompt } from './catch-up-text'
import { systemText } from './ledger-prompt'
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
import { ghIn } from './gh'
import { isGhUnstartable, pathProbe, placeChange, runOf, sessionFolder } from './mod-commands'
import type { HerdrFile } from './herdr-press-file'
import { startedFile, startHerdrFile } from './herdr-app'
import type { StartedFile } from './herdr-app'
import {
  delegatesAsked,
  followDelegates as followHerdrDelegates,
  listenForHerdrPresses,
  startInHerdr,
  askHerdrModAgain,
  openInHerdr,
  isExitReason,
  modDelegate,
  publishToHerdr,
  type HerdrCalls,
} from './mod-herdr'
import { ago, cellWidth, turnReply } from './text'
import { demoReplied } from './press-effects'
import type { Effect } from './press-reducer'
import { openTarget } from './open-targets'
import type { RowPress } from './presses'
import { statusKeyRows, statusSelected } from './status-keys'
import { footerError } from './view'
import { DOT, NEEDS_YOU_GROUPS, allRows, resumeLabel } from './rows'
import { isResumable, RESUME_TEXT, stopFix, stopText, DEMO_NOTICE, bannerOf } from './banners'
import { rowKeyActions } from './row-key-actions'
import { comparePagePath, nextBuildMarkPath } from './mod-plugin-files'
import { bandCounts, isMaybeStale, noCountsText } from './band'
import { drawnLists, rowsIn, tabUndos, latestUndo } from './action-plan'
import { isRowTab, isShownTab, screenTabOf, shownTabs, tabBadge, INBOX_COMMAND_TEXT, type ShownTab } from './tabs'
import { heldReplies, PERMISSION_FALLBACK_DELAY_MS, PRESS_GUARD_MS, SETTLED_MS, earliestOf, type Holds } from './timing'
import { COLLAPSE_KEY, FOLD_ALL_KEY, helpKeys, UNDO_KEY } from './help'
import { agentTools, NOT_SAVED } from './tools'
import type { AgentTool } from './tools'
import type { ToolAnswer } from './tools'
import { paneText } from './pane-text'
import { PARENT_PREFIX } from './pane-status-parent'
import {
  DESKTOP_OFFSET_ROUNDING,
  DESKTOP_ROW_PAD,
  DESKTOP_WIDE_AT,
  INLINE_RAIL_AT,
  RAIL_GUTTER,
  TAB_PAD,
} from './pane-sizes'
import { lookOf, paletteFor } from './palettes'
import { glued } from './terminal-text'
import { RESIZE_SCROLL_MS, settledLayoutId, settledScrollKey, tabRowIds, undoBlockOf } from './pane-selection'
import {
  type Action,
  COPY_FAILURES,
  fieldKey,
  focusHintFor,
  focusKeys,
  followUpPresses,
  type KeyAction,
  KEY_BINDING_SUFFIX,
  pressedBy,
  type PressVia,
  openedField,
  openFields,
  paneHasKeys,
  closeKeysWithoutRow,
  undoKey,
} from './pane-keys'
import {
  arrived,
  forgetStored,
  messageText,
  noteStored,
  settleRewrite,
  stored,
  withLostSendsUncertain,
} from './mod-delivery'
import { NO_OLD_PRESENCE, NO_OLD_PR_VIEWS, sessionFromOldFields } from './mod-old-fields'
import {
  askedCalls,
  callKey,
  childRefOf,
  delegateWaits,
  endedAgentOf,
  endedCallRan,
  HOST_TASK_TOOLS,
  isActivityWorthSaving,
  MAX_PERSON_LINES,
  noteRanCall,
  permissionText,
  spawnedBy,
  startedWorkflowOf,
  toolRecord,
  workflowTasks,
} from './mod-records'
import {
  AWAY_MS,
  answerToolCall,
  broughtBack,
  type Changed,
  conversation,
  currentOwner,
  cutOffUpdate,
  DESKTOP_APP_ENTRYPOINTS,
  drawnSession,
  isCurrent,
  MAX_TRIES,
  type ModSession,
  NO_SESSION,
  type Owner,
  PRESENT,
  resultsOrder,
  type SavedRecord,
  updating,
  withLoadedToolFields,
  type LoadedBy,
  withoutRowActions,
} from './mod-sessions'
import { isPrFetchBusy, queuePrFetch } from './mod-pr-queue'
import { cancelUndoScroll, mod, paneState, resetTurn, sessionState, suspendUndoReveal } from './mod-state'
import { scrollFailure, withExplanationAwaited, withExplanationReply, withReplyWaitEnded } from './explanation-reply'
import { noteStatusDrawn, takeShownRows } from './pane-status-shown'
import { demoPressOn, type DemoPressed } from './mod-demo-press'
import {
  applyUiEvents,
  hostFactsOf,
  isReadWake,
  lookConfigOf,
  modUiOf,
  type OldPaneFields,
  uiFromOldFields,
  undoStepAt,
  withPaneShown,
} from './mod-ui'
import { keptUiStates, noticeOf, notesOf, restoredUi } from './ui-controller'
import { nextWakeAt } from './ui-controller-clock'
import { holdsOf } from './ui-controller-reply'
import { collapsedOf, isGuardedPress, selectedOf } from './ui-controller-selection'
import { freshUi, type SettledOutcome, type UiCommand, type UiEvent, type UiState } from './ui-controller-types'
import { withCollapse } from './collapse'
import { desktopSpaceLines } from './pane-status-tops'
import {
  changeSaved,
  isLastSaveRefused,
  readRemoteState,
  readDurableSession,
  readSaved,
  readSettled,
  readSettledSession,
  save,
  type SaveEngine,
} from './mod-saves'
import { type HistoryEngine, modRecordMatches, withHistory } from './mod-history'
import { runningSessions } from './running-sessions'
import { paneAskRows, paneAskTabs } from './pane-asks'
import { paneRowKeys } from './pane-row-keys'
import { paneRowLines } from './pane-row-lines'
import { paneRowFrame } from './pane-row-frame'
import { paneRows } from './pane-rows'
import { paneFrame } from './pane-frame'
import { paneRowParts } from './pane-row-parts'
import type { PaneClient, PaneHandlers, Row } from './pane-context'
import { panePrBlocks, panePrRows } from './pane-prs'
import { paneStatusLines } from './pane-status-lines'
import { paneStatus } from './pane-status'
import { paneHelp } from './pane-help'
import { foldOf } from './fold-keys'

/** The pane's interaction state for the drawn conversation, which the shared controller runs through `sendUi`. */
const UI = atom({ plugin: 'inbox', key: 'ui' } as const, null as UiState | null)
const THEME = atom({ plugin: 'inbox', key: 'theme' } as const, '')
const DIALOGS = atom({ plugin: 'inbox', key: 'dialogs' } as const, [] as Dialog[])
const REDRAW = atom({ plugin: 'inbox', key: 'redraw' } as const, 0)
const RUNNING_FRAME = atom({ plugin: 'inbox', key: 'runningFrame' } as const, 0)
const SESSION = atom({ plugin: 'inbox', key: 'session' } as const, NO_SESSION)
const AWAY = atom({ plugin: 'inbox', key: 'away' } as const, PRESENT)
const UNREADABLE = atom({ plugin: 'inbox', key: 'unreadable' } as const, null as string | null)
/** The fields an older build kept the pane's state in. `upgradePane` moves them into `UI` once. */
const OLD_TAB = atom({ plugin: 'inbox', key: 'tab' } as const, 'needsYou' as Tab)
const OLD_PAGE = atom({ plugin: 'inbox', key: 'page' } as const, null as PageTab | null)
const OLD_SELECTION = atom({ plugin: 'inbox', key: 'selection' } as const, {} as Record<Tab, Cursor>)
const OLD_STATUS_SELECTION = atom({ plugin: 'inbox', key: 'statusSelection' } as const, null as string | null)
const OLD_TYPING = atom({ plugin: 'inbox', key: 'typing' } as const, null as string | null)
const OLD_DRAFTS = atom({ plugin: 'inbox', key: 'drafts' } as const, {} as Record<string, Draft>)
const OLD_DISCARDED = atom({ plugin: 'inbox', key: 'discarded' } as const, {} as Record<string, number>)
const OLD_SHOWN = atom(
  { plugin: 'inbox', key: 'shown' } as const,
  null as { tab: ShownTab; isDemo: boolean; since: number } | null,
)
const OLD_NOTES = atom({ plugin: 'inbox', key: 'notes' } as const, {} as Record<string, RowNote>)
const OLD_UNFOLDED = atom({ plugin: 'inbox', key: 'unfolded' } as const, [] as FoldKind[])
const OLD_CLOSED_ALL = atom({ plugin: 'inbox', key: 'closedAll' } as const, [] as FoldKind[])
const OLD_STATUS_UNFOLDED = atom({ plugin: 'inbox', key: 'statusUnfolded' } as const, [] as string[])
const OLD_OPTIONS_SHOWN = atom({ plugin: 'inbox', key: 'optionsShown' } as const, [] as string[])
const OLD_IS_HELP_SHOWN = atom({ plugin: 'inbox', key: 'isHelpShown' } as const, false)
const DEMO = atom({ plugin: 'inbox', key: 'demo' } as const, null as DemoCopy | null)
const DEMO_RECORDING = atom({ plugin: 'inbox', key: 'isDemoRecording' } as const, false)

const RECORD_TOOL = 'mcp__inbox__record'
const CLOSE_TOOL = 'mcp__inbox__close'
const ORDER_TOOL = 'mcp__inbox__order_prs'
/**
 * The person's line for each `record` or `close` call that has one, by `tool_use_id`. It lives as long as the
 * process, so a call from before it draws nothing under its row.
 */
const PERSON_LINES = atom({ plugin: 'inbox', key: 'personLines' } as const, {} as Record<string, string>)

const PANE = 'inbox'

/** Adds the person's words to the turn, as a shell command row does. */
function notePerson($: EngineInterface, line: string) {
  return commit($, currentOwner(), s => ({
    ...s,
    turn: { ...s.turn, person: s.turn.person === null ? line : `${s.turn.person}\n\n${line}` },
  }))
}

/** Notes the main agent's activity, and runs the Status call when the running turn is due one. */
async function noteActivity($: EngineInterface, line: string) {
  const owner = currentOwner()
  const now = await $.clock.now()
  let isClaimed = false
  await commit($, owner, s => {
    const noted = noteTurnActivity(s, line)
    const claimed = claimedStatusRefresh(noted, now)
    isClaimed = claimed !== noted
    return claimed
  }).catch(() => undefined)
  if (isClaimed)
    void refreshStatus({
      ...hostOf($, owner),
      names: CLAUDE_CODE,
      inOrder: fn => resultsOrder.run(owner.id, fn),
      records: recordsOf($, owner),
    })
}

async function syncTheme($: EngineInterface) {
  const theme = (await $.config.list().catch(() => [])).find(row => row.key === 'theme')?.value
  await update($, THEME, () => (typeof theme === 'string' ? theme : ''))
}

function herdrCalls($: EngineInterface): HerdrCalls {
  return {
    run: runOf(commandCalls($)),
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

function publishStatus($: EngineInterface, isEnding = false, isExit = false): Promise<boolean> {
  return publishToHerdr(
    herdrCalls($),
    isEnding ? conversation.id : null,
    async () => {
      const [session, dialogs, unreadable] = await Promise.all([
        read($, SESSION),
        read($, DIALOGS),
        read($, UNREADABLE),
      ])

      const root = (await sessionFolder(commandCalls($))) ?? ''

      return {
        id: conversation.id,
        root,
        session,
        dialogs,
        ...(await readRemoteState(saveEngine($), conversation.id, session)),
        isUnread: unreadable === conversation.id,
      }
    },
    isExit,
  )
}

/** Applies a Herdr look's press, and gives what waits for the agent's turn. Null when it is for another conversation. */
async function herdrPress($: EngineInterface, id: string, f: HerdrFile): Promise<StartedFile | null> {
  if (id !== conversation.id) return null
  const host = { ...hostOf($, currentOwner(), 'terminal'), refreshPrsIfDue: () => pollPrs($, true) }

  return startedFile(await startHerdrFile(host, f, id), outcome => {
    if (outcome.wakesAfterSettle) later($, SETTLED_MS, () => wakeAfterSettle($))
  })
}

async function setStop($: EngineInterface, stop: Stop | null) {
  if (stop === null && (await read($, SESSION)).stop === null) return
  sessionState.stopGeneration++
  sessionState.resuming = null
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
    if (!askedCalls.has(id) || mod.hasPermissionRequestHook) return
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
  if (sessionState.resuming?.is === 'sending') return
  const owner = currentOwner()
  const generation = sessionState.stopGeneration
  const isSameStop = () => isCurrent(owner) && generation === sessionState.stopGeneration
  sessionState.resuming = { is: 'sending' }
  await redraw($)
  if (!isSameStop()) return
  const sent = await deliver($, owner, RESUME_TEXT, crypto.randomUUID())
  if (sent.state === 'rejected' && isSameStop()) {
    sessionState.resuming = { is: 'refused', why: sent.reason }
    await redraw($)
  }
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

// The plugin directory refuses `$` passed to a function that another of the mod's files declares, so every
// function that takes `$`, the session's storage and the SessionHost included, lives in this file.

const OLD_LEDGER = atom({ plugin: 'inbox', key: 'ledger' } as const, EMPTY)
const OLD_PRESENCE = atom({ plugin: 'inbox', key: 'presence' } as const, NO_OLD_PRESENCE)
const OLD_PR_VIEWS = atom({ plugin: 'inbox', key: 'prViews' } as const, NO_OLD_PR_VIEWS)
const OLD_STOP = atom({ plugin: 'inbox', key: 'stop' } as const, null as Stop | null)
const OLD_LAST_ACTIONS = atom({ plugin: 'inbox', key: 'lastActions' } as const, {} as Record<string, LastAction>)
const OLD_SENT = atom({ plugin: 'inbox', key: 'sent' } as const, [] as SentPrompt[])
const OLD_UNTRACKED_SENT = atom(
  { plugin: 'inbox', key: 'untrackedSent' } as const,
  [] as { sessionId: string; text: string }[],
)

/** The session as an older build left it in its separate fields, for a hot reload into this build. */
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

  return sessionFromOldFields(id, { ledger, presence, prViews, stop, lastActions, sent, untracked })
}

/** Brings the drawn session to the current shape. */
async function upgradeDrawn($: EngineInterface): Promise<ModSession> {
  const written = await $.state.get({ plugin: 'inbox', key: 'session' })
  const base = written.value === undefined ? await fromOldFields($) : upgradeSession(written.value as SavedSession)

  return update($, SESSION, cur => {
    const s = written.value === undefined ? base : upgradeSession(cur as SavedSession)

    return { ...withLostSendsUncertain(s), revision: (cur.revision ?? 0) + 1 }
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
  change = withHistory(historyEngine($), owner.id, change)
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    if (!isCurrent(owner)) return changeSaved(saveEngine($), owner.id, change)
    const drawn = await read($, SESSION)
    // A hot reload can leave a session an earlier build wrote. The fetch that is running still runs.
    const upgraded = upgradeSession(drawn)
    const before = { ...upgraded, prViews: { ...upgraded.prViews, isFetching: drawn.prViews.isFetching } }
    const changed = await change(before)
    if (changed === before) return { before, after: before, isDrawn: true }
    // A resume drops the running turn, so a write that changes only the turn, such as each tool call's activity,
    // leaves the saved copy alone.
    const isTurnOnly = (Object.keys(changed) as (keyof Session)[]).every(k => k === 'turn' || changed[k] === before[k])
    const [ui, demo] = await Promise.all([readUi($), read($, DEMO)])
    const kept = pruned(
      { ...changed, heldRows: [...held], shownSince: demo === null ? ui.shownSince : null },
      Object.keys(changed.remoteViewers).length > 0 ? await $.clock.now() : 0,
    )
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
    if (!isTurnOnly && (await read($, UNREADABLE)) !== owner.id) await save(saveEngine($), owner, written)
    return { before, after: written, isDrawn: isCurrent(owner) }
  }
  throw new Error('The session kept changing under this write.')
}

function historyEngine($: EngineInterface): HistoryEngine {
  return {
    ...saveEngine($),
    stateEnv: async () => ({ XDG_STATE_HOME: await $.env.get('XDG_STATE_HOME'), HOME: await $.env.get('HOME') }),
    fs: { list: p => $.fs.list(p), read: p => $.fs.read(p), write: (p, text) => $.fs.write(p, text) },
  }
}

/** The store, clock, debug log and running-conversation calls that `hooks/mod-saves.ts` makes. */
function saveEngine($: EngineInterface): SaveEngine {
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
        configFolder: () => configFolder(commandCalls($)),
        sessionId: () => $.session.id(),
        list: folder => $.fs.list(folder),
        read: path => $.fs.read(path),
        run: (argv, init) => $.process.run(argv, init),
      }).catch(() => null),
  }
}

/** Calls the inbox model, reports the call, and returns the answer. */
async function askInboxModel(
  $: EngineInterface,
  prompt: string,
  system: string,
  timeoutMs: number,
  report: Parameters<Ask>[3],
): Promise<string | null> {
  const r = await $.model.complete({
    model: MODEL,
    system: [{ text: system, cache: true }],
    prompt,
    maxTokens: 1600,
    effort: 'low',
    timeoutMs,
  })
  report?.(callReport(r, MODEL))
  return r.isAnswered ? r.text : null
}

async function perform(
  $: EngineInterface,
  effect: Extract<Effect, { kind: 'open' | 'copy' | 'scroll' }>,
  surface: UiPressArgument['surface'],
): Promise<string | null> {
  try {
    if (effect.kind === 'scroll') {
      const r = await $.ui.scroll({ to: { requestId: effect.requestId }, block: 'start' })
      return r.deny === undefined ? null : scrollFailure(r.deny)
    }
    if (effect.kind === 'open') {
      const calls = commandCalls($)
      const [home, folder] = await Promise.all([calls.home(), sessionFolder(calls)])
      return await openTarget(runOf(calls), pathProbe(calls), effect.target, folder ?? '', home ?? '')
    }
    const r = await $.ui.copy({ text: effect.text, surface })
    return r.isCopied ? null : COPY_FAILURES[r.reason]
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
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
      return readSettledSession(saveEngine($), owner.id)
    },
    readDurable: () => readDurableSession(saveEngine($), owner.id),
    update: opts.update,
    exclusive: fn => updating.run(owner.id, fn),
    ask: (prompt, system, _kind, report) => askInboxModel($, prompt, system, 45_000, report),
    deliver: (_s, text, deliveryId) => deliver($, owner, text, deliveryId),
    isDeliveryHeldUntilRun: true,
    perform: async (_s, effect) => (opts.surface ? perform($, effect, opts.surface) : COPY_FAILURES['no-surface']),
    refreshPrs: opts.refreshPrs,
    gh: {
      shared: prSharedStore(saveEngine($)),
      find: async () => {
        if (ghFound === undefined) ghFound = (await isGhUnstartable(commandCalls($))) ? null : 'gh'
        return ghFound
      },
      forget: () => {
        ghFound = undefined
      },
      run: (_s, _bin, onUnstartable) => async args =>
        ghIn(runOf(commandCalls($)), 'gh', (await sessionFolder(commandCalls($))) ?? '', onUnstartable)(args),
      noteMissing: opts.onGhMissing,
    },
    settleWindowMs: opts.settleWindowMs,
    comparePage: comparePagePath($.plugin.root),
    compareInBackground: isCompareInBackground('claude-code'),
    newId: () => crypto.randomUUID(),
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

/**
 * Changes `owner`'s session, keeping the rows the person replies on. After a write to the drawn session, the status
 * line follows it, rows that just closed redraw as they leave, and the pane moves to rows that arrived.
 */
async function commit(
  $: EngineInterface,
  owner: Owner,
  change: (s: Session) => Session | Promise<Session>,
): Promise<Session> {
  const ui = await readUi($)
  const { before, after, isDrawn } = await changeSession(
    $,
    owner,
    change,
    new Set(Object.keys(heldReplies(ui.typing, ui.drafts))),
  )
  if (!isDrawn || after === before) return after
  if (before.ledger.overview === null && after.ledger.overview !== null) void syncLook($)
  void publishStatus($)
  void sendUi($, ['read'])

  return after
}

function later($: EngineInterface, waitMs: number, run: () => unknown) {
  void (async () => {
    await $.clock.sleep(waitMs)
    await run()
  })().catch(() => undefined)
}

/** A click on row `id`'s title. With `isAll`, it folds or opens every fold of the tab, as the row would go. */
async function pressTitle($: EngineInterface, id: string, isAll?: unknown) {
  if (!isAll) return sendUi($, [{ type: 'title-press', id, by: 'click' }])
  const { view } = await drawnState($)
  await sendUi($, [{ type: 'fold-all', isOpening: view.collapsed.includes(id) }])
}

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

/** Saves row `id` collapsed or open, in the sample copy while the sample shows. */
async function saveCollapse($: EngineInterface, id: string, isCollapsed: boolean) {
  const at = await $.clock.now()
  if (await read($, DEMO)) await update($, DEMO, d => d && withCollapse(d, id, isCollapsed, at))
  else await commit($, currentOwner(), s => withCollapse(s, id, isCollapsed, at))
}

async function toggleHelp($: EngineInterface) {
  await sendUi($, [{ type: 'show-help', isShown: !(await readUi($)).isHelpShown }])
}

/** A press on a Status parent's name or its Fold key. With `isAll`, every fold of the page goes the same way. */
async function toggleParent($: EngineInterface, id: string, isAll?: unknown) {
  const { view } = await drawnState($)
  const isOpening = view.collapsed.includes(id)
  await sendUi($, [isAll ? { type: 'fold-all', isOpening } : { type: 'collapse', id, isCollapsed: !isOpening }])
}

function catchUpStatus($: EngineInterface, owner: Owner, transcript: string): StatusCall {
  return {
    exchange: { kind: 'catch-up', conversation: transcript },
    ask: async (prompt, system, _kind, report) =>
      isCurrent(owner) ? askInboxModel($, prompt, system, 90_000, report) : null,
  }
}

/**
 * The model's answer to a catch-up over the whole conversation: from a fork of it, or from the transcript when there
 * is nothing to fork.
 */
async function catchUpReply($: EngineInterface, owner: Owner): Promise<CatchUpReply> {
  if (!isCurrent(owner)) return { kind: 'failed', heard: null }
  const [{ ledger }, shown, transcript] = await Promise.all([
    read($, SESSION),
    screen($),
    $.session.messages().then(transcriptText),
  ])
  // The Status call reads the transcript.
  const statusCall = transcript ? catchUpStatus($, owner, transcript) : null
  const forkedAt = await $.clock.now()
  const forked = await $.model.fork({ prompt: catchUpPrompt(CLAUDE_CODE, ledger, shown), effort: 'low' })
  if (!isCurrent(owner)) return { kind: 'failed', heard: null }
  // A fork has nothing to read until this process sends its first request,
  // as after a resume. The model then reads the transcript instead, uncached.
  if (!forked.isAnswered && forked.reason === 'nothing-to-fork')
    return transcriptReply($, owner, ledger, shown, transcript)
  const text = forked.isAnswered ? forked.text : null
  const heard = { text, report: callReport(forked, null), thrown: null, ms: (await $.clock.now()) - forkedAt }

  return text === null ? { kind: 'failed', heard } : { kind: 'reply', text, source: null, statusCall, heard }
}

/** The model's answer to a catch-up over the transcript, for a conversation with nothing to fork. */
async function transcriptReply(
  $: EngineInterface,
  owner: Owner,
  ledger: Ledger,
  shown: string,
  transcript: string | null,
): Promise<CatchUpReply> {
  if (!transcript) return { kind: 'unreadable' }
  const statusCall = catchUpStatus($, owner, transcript)
  const prompt = transcriptCatchUpPrompt(ledger, shown, transcript)
  const ask: Ask = (p, system, _kind, report) => askInboxModel($, p, system, 90_000, report)
  const heard = await heardCall(ask, prompt, systemText(CLAUDE_CODE), CATCH_UP_CALL, () => $.clock.now())
  if (!isCurrent(owner)) return { kind: 'failed', heard: null }

  return heard.text === null
    ? { kind: 'failed', heard }
    : { kind: 'reply', text: heard.text, source: transcript, statusCall, heard }
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
  mod.queue = mod.queue.then(async () => {
    if (!isCurrent(owner)) return
    await runUpdates({
      ...hostOf($, owner),
      names: CLAUDE_CODE,
      delegate: () => modDelegate(herdrCalls($)),
      catchUp: () => catchUpReply($, owner),
      inOrder: fn => resultsOrder.run(owner.id, fn),
      background: statuses => void statuses,
      records: recordsOf($, owner),
    })
    if (isCurrent(owner)) void publishStatus($)
  })
  // A rejected link would skip every later update, so the chain swallows it.
  mod.queue = mod.queue.catch(() => undefined)
}

function recordsOf($: EngineInterface, owner: Owner): StatusRecords | undefined {
  return mod.statusRecordsFolder === null ? undefined : statusRecords(commandCalls($), mod.statusRecordsFolder, owner)
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
    refreshPrs: () => fetchPrs($, true, true),
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
    personSource = 'prompt',
    isOwnTurn = true,
  }: {
    match?: (s: Session) => { state: Session; sentBy: SentBy | null }
    isTyped?: boolean
    personSource?: 'prompt' | 'command'
    isOwnTurn?: boolean
  } = {},
): Promise<string[]> {
  const [now, isShown] = await Promise.all([$.clock.now(), isPaneShown($)])
  await update($, AWAY, a => ({ ...a, lastActiveAt: now, isAway: false }))
  let notes: string[] = []
  await commit($, currentOwner(), s => {
    const matched = match(s)
    const lastActions = withExplanationAwaited(s.lastActions, matched.state.lastActions, isOwnTurn)
    const r = recordPrompt(CLAUDE_CODE, { ...matched.state, lastActions }, text, isShown, matched.sentBy, personSource)
    notes = r.notes
    return isTyped ? messageTyped(r.state, now) : r.state
  })

  return notes
}

/** Moves the pane's state from the separate fields of a build before the shared controller into `UI`, once. */
async function upgradePane($: EngineInterface) {
  if ((await read($, UI)) !== null) return
  const [
    tab,
    page,
    selection,
    statusSelection,
    typing,
    drafts,
    discarded,
    shown,
    notes,
    unfolded,
    closedAll,
    statusUnfolded,
    optionsShown,
    isHelpShown,
    now,
  ] = await Promise.all([
    read($, OLD_TAB),
    read($, OLD_PAGE),
    read($, OLD_SELECTION),
    read($, OLD_STATUS_SELECTION),
    read($, OLD_TYPING),
    read($, OLD_DRAFTS),
    read($, OLD_DISCARDED),
    read($, OLD_SHOWN),
    read($, OLD_NOTES),
    read($, OLD_UNFOLDED),
    read($, OLD_CLOSED_ALL),
    read($, OLD_STATUS_UNFOLDED),
    read($, OLD_OPTIONS_SHOWN),
    read($, OLD_IS_HELP_SHOWN),
    $.clock.now(),
  ])
  const old: OldPaneFields = {
    tab,
    page,
    selection,
    statusSelection,
    typing,
    drafts,
    discarded,
    shown,
    notes,
    unfolded,
    closedAll,
    statusUnfolded,
    optionsShown,
    isHelpShown,
  }
  await update($, UI, ui => ui ?? uiFromOldFields(old, lookConfigOf(paneState.paneLook), now))
}

/** A reload keeps $.state, so a running session can still hold its parts in the separate fields of an older build. */
async function upgradeState($: EngineInterface): Promise<Ledger> {
  const [session] = await Promise.all([
    upgradeDrawn($),
    upgradePane($),
    // A demo an earlier build seeded may lack a field this one draws, so it ends; /inbox demo seeds a new one.
    update($, DEMO, d => (d === null || isDemoCopy(d) ? d : null)),
  ])

  return session.ledger
}

async function runTool(
  $: EngineInterface,
  tool: AgentTool,
  input: Record<string, unknown>,
  toolUseId: string | undefined,
): Promise<string> {
  const [now, delegate, earlier] = await Promise.all([
    $.clock.now(),
    modDelegate(herdrCalls($)),
    tool === 'record' ? modRecordMatches(historyEngine($), input) : [],
  ])
  const owner = currentOwner()
  let answer: Omit<ToolAnswer, 'ledger'> = { result: '', personLine: null }
  await commit($, owner, s => {
    const r = answerToolCall(s, tool, input, now, delegate, earlier)
    answer = r
    return r.state
  })
  const { personLine } = answer
  if (personLine !== null && toolUseId)
    await update($, PERSON_LINES, lines =>
      Object.fromEntries([...Object.entries(lines), [toolUseId, personLine]].slice(-MAX_PERSON_LINES)),
    )
  const isChangeUnsaved = personLine !== null && isLastSaveRefused(owner.id)

  return isChangeUnsaved ? `${answer.result} ${NOT_SAVED}` : answer.result
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
  paneState.paneClosesOnEscape = !isFieldOpen
  paneState.isOpenUnheard = true
  const opened = $.ui.open({
    id: PANE,
    title: 'Inbox',
    focus: true,
    ...(isFieldOpen ? {} : { closeOnEscape: true as const }),
  })
  void opened
    .then(async () => {
      await sendUi($, (await readUi($)).shownSince === null ? [{ type: 'opened' }, 'read'] : ['read'])
      paneState.isOpenUnheard = false
      await syncLook($, true)
      await wakeForHeldSends($)
    })
    .catch(() => {
      paneState.isOpenUnheard = false
    })

  return opened
}

/**
 * Starts a look while the Status shows in the pane, and ends it when it stops showing there. Both are
 * idempotent, so every place that opens, closes or changes the pane's page can call it. The sample
 * leaves the real session's look alone. `isOpen` is whether the pane shows, when the caller knows.
 */
async function syncLook($: EngineInterface, isOpen?: boolean) {
  if (await read($, DEMO)) return
  const [ui, isPaneOpen, now] = await Promise.all([readUi($), isOpen ?? isPaneShown($), $.clock.now()])
  const isShown = isPaneOpen && ui.tab === 'overview'
  const shown = isShown ? {} : takeShownRows()
  await commit($, currentOwner(), s => withLook(s, isShown, now, shown)).catch(() => undefined)
  followDelegates($, isShown)
}

function followDelegates($: EngineInterface, isShown: boolean) {
  followHerdrDelegates(isShown, paneState, herdrCalls($), () => {
    const owner = currentOwner()
    return {
      run: runOf(commandCalls($)),
      now: () => $.clock.now(),
      ownerId: owner.id,
      overview: async () => upgradeSession(await read($, SESSION)).ledger.overview,
      isStatusShown: async () =>
        (await readUi($)).tab === 'overview' && (await isPaneShown($)) && !(await read($, DEMO)),
      settle: (agents, at) => commit($, owner, s => statusChanged(s, o => delegatesSettled(o, agents, at))),
    }
  })
}

/** Opens the open pane again, without asking for the keyboard, once a reply field opened or closed. */
async function matchPaneEscape($: EngineInterface) {
  const closesOnEscape = (await readUi($)).typing === null
  if (closesOnEscape === paneState.paneClosesOnEscape) return
  paneState.paneClosesOnEscape = closesOnEscape
  if (!(await $.ui.panes()).some(p => p.id === PANE)) return
  await $.ui.open({ id: PANE, title: 'Inbox', ...(closesOnEscape ? { closeOnEscape: true as const } : {}) })
}

async function showInbox($: EngineInterface, opening: ReturnType<typeof openInHerdr>) {
  const herdr = await opening
  if (herdr?.isShown) return herdr.text
  await openPane($)

  return herdr?.text
}

async function openInbox($: EngineInterface, isDemo: boolean) {
  const opening = isDemo ? null : openInHerdr(herdrCalls($))
  if (opening instanceof Promise && (await opening).isShown) return
  // Opened before any other await unless the Herdr look is opening. After one, the engine no longer counts the press as
  // asking for the pane, and below 144 columns, once the person has closed it, leaves it unplaced.
  await openPane($)
  if ((await readUi($)).tab === 'prs') await findPrs($)
}

async function sendDraft($: EngineInterface, id: string, surface: UiPressArgument['surface']) {
  await sendTyped($, id, (await readUi($)).drafts[id]?.text ?? '', surface)
}

async function sendTyped($: EngineInterface, id: string, text: string, surface: UiPressArgument['surface']) {
  if (text.trim()) await sendUi($, [{ type: 'press', press: { action: 'type', id, text }, by: 'click' }], surface)
  else await focusField($, id)
}

async function discardReply($: EngineInterface, id: string) {
  openFields.delete(id)
  await sendUi($, [{ type: 'close-field', id, isDiscard: true }])
}

/** Opens `id`'s field with its draft, or with `seed` as a fresh one. */
async function startTyping($: EngineInterface, id: string, seed?: string) {
  await sendUi($, [{ type: 'open-field', id, ...(seed === undefined ? {} : { seed }) }])
}

/** Closes `id`'s field and keeps its draft, as Cancel and Escape do. */
async function closeField($: EngineInterface, id: string) {
  await sendUi($, [{ type: 'close-field', id, isDiscard: false }])
}

/**
 * j or k: the cursor steps among `ids`, from the Status row the pane draws selected when one is given, picked or not.
 * On the Status, the row it lands on scrolls into view.
 */
async function stepCursor($: EngineInterface, by: 1 | -1, ids: string[], statusFrom: string | null = null) {
  const pick: UiEvent[] = statusFrom === null ? [] : [{ type: 'select', tab: 'overview', id: statusFrom, by: 'key' }]
  await sendUi($, [...pick, { type: 'step', by, ids }])
  const ui = await readUi($)
  if (ui.tab === 'overview' && ui.statusSelection !== null)
    await scrollToKey($, `status-${ui.statusSelection}`, 'nearest')
}

/** The controller opened `id`'s field: the pane draws it with its draft, and it takes the keys. */
async function focusOpenedField($: EngineInterface, id: string) {
  paneState.focusHint = `type-${id}`
  openFields.set(id, openedField(id, (await readUi($)).drafts[id]))
  await focusField($, id)
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
  if (isWithoutKeys === (paneState.fieldWithoutKeys === id)) return
  paneState.fieldWithoutKeys = isWithoutKeys ? id : null
  await redraw($)
}

async function showTab($: EngineInterface, tab: ShownTab) {
  if (tab === 'prs') await findPrs($)
  await sendUi($, [{ type: 'show-tab', tab }])
}

/** The controller showed `tab`: the look follows it, and a row tab scrolls to its open row. */
async function tabShown($: EngineInterface, tab: ShownTab) {
  cancelUndoScroll()
  void syncLook($)
  if (isRowTab(tab)) await scrollToOpenRow($, tab)
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

async function selectStatusRow($: EngineInterface, id: string, focusKey?: string) {
  await sendUi($, [{ type: 'select', tab: 'overview', id, by: 'click' }])
  const isDrawn = await scrollToKey($, `status-${id}`, 'nearest')
  if (isDrawn && focusKey) await $.ui.focus({ requestId: PANE, key: focusKey }).catch(() => {})
}

async function scrollToRow($: EngineInterface, id: string) {
  await scrollToKey($, `view-${id}`, paneState.isInlinePane ? 'start' : 'nearest')
}

/** Scrolls the pending Undo into view on the inline terminal, while it lasts and the person has not moved. */
async function revealPendingUndo($: EngineInterface): Promise<boolean> {
  const pending = paneState.pendingUndoScroll
  if (!pending || !pending.revealUndo || !paneState.isInlineTerminalPane || pending.sessionId !== conversation.id)
    return false
  const drawn = await drawnState($)
  const { ui, view, now } = drawn
  if (paneState.pendingUndoScroll !== pending || ui.tab !== pending.tab || now >= pending.expiresAt) return false
  const ids = tabRowIds(view, openPrViews(view.prs.drawn))[pending.tab]
  const block = undoBlockOf(ids, pending.rowId, selectedOf(ui, view, pending.tab))
  const prs = view.prs.drawn
  const layout = settledLayoutId(
    pending.tab,
    view,
    prs,
    drawn.lastActions,
    drawn.notes,
    now,
    paneState.terminalInlineSize,
  )
  const key = settledScrollKey(pending.key, layout)
  return scrollToKey($, key, block, () => paneState.pendingUndoScroll === pending && pending.revealUndo, 5)
}

/** Keeps the Undo `key` of row `rowId`, which a press just closed, in view on the inline terminal while it lasts. */
async function keepUndoVisible($: EngineInterface, key: string, rowId: string, at: number, revision: number) {
  const ui = await readUi($)
  if (revision !== paneState.undoScrollRevision || !isRowTab(ui.tab)) return
  const sessionId = conversation.id
  paneState.pendingUndoScroll = { key, rowId, tab: ui.tab, expiresAt: at + SETTLED_MS, sessionId, revealUndo: true }
  await revealPendingUndo($)
}

/**
 * The controller moved a tab's cursor to row `id`. After a close it moved off `closedId`, and an Undo the inline
 * terminal keeps in view for that row stays in view.
 */
async function revealRow($: EngineInterface, tab: Tab, id: string, closedId: string | null) {
  const pending = paneState.pendingUndoScroll
  if (closedId !== null && pending?.rowId === closedId && pending.revealUndo) return void (await revealPendingUndo($))
  if (closedId === null) {
    if (pending?.tab === tab) suspendUndoReveal()
    else cancelUndoScroll()
  }
  await scrollToRow($, id)
}

async function scrollToOpenRow($: EngineInterface, tab: Tab, surface?: RenderSurface) {
  const revision = paneState.undoScrollRevision
  if (surface !== 'desktop' && (await revealPendingUndo($))) return
  if (revision !== paneState.undoScrollRevision) return
  if (paneState.isInlinePane) {
    const { ui, view } = await drawnState($)
    const id = selectedOf(ui, view, tab)
    if (revision !== paneState.undoScrollRevision) return
    if (id !== null) {
      await scrollToKey($, `view-${id}`, 'start', () => revision === paneState.undoScrollRevision)
      return
    }
  }
  if (revision !== paneState.undoScrollRevision) return
  await $.ui.scroll({ in: PANE, to: 'start' }).catch(() => undefined)
}

/** A Status row's View press: Asks shows with the ask selected and in view. */
async function showAsk($: EngineInterface, askId: string) {
  await sendUi($, [{ type: 'show-ask', id: askId, by: 'click' }])
}

/** A set, not a toggle: a second click before the redraw posts the same state, so a double-click leaves it unfolded. */
async function setFold($: EngineInterface, key: string, isUnfolded: unknown, isAll?: unknown) {
  const fold = foldOf(key)
  if (!fold || typeof isUnfolded !== 'boolean') return
  if (isAll) return sendUi($, [{ type: 'fold-all', isOpening: isUnfolded }])
  await sendUi($, [
    'kind' in fold
      ? { type: 'fold', fold: fold.kind, isOpen: isUnfolded }
      : { type: 'status-fold', id: fold.statusId, isOpen: isUnfolded },
  ])
}

async function unlessGuarded($: EngineInterface, rowId: string, press: UiPressArgument, onPress: Action['onPress']) {
  const [ui, now] = await Promise.all([readUi($), $.clock.now()])
  if (!isGuardedPress(ui, ui.tab, rowId, 'click', now)) await onPress(press)
}

async function isPaneShown($: EngineInterface) {
  return (await $.ui.panes().catch(() => [])).some(p => p.id === PANE && p.isShown)
}

async function isPrsTabShown($: EngineInterface) {
  return (await readUi($)).tab === 'prs' && (await isPaneShown($))
}

/** The tab the pane shows, as the inbox model is told: the page tab when one shows, else the row tab. */
async function shownScreenTab($: EngineInterface): Promise<ScreenTab> {
  return screenTabOf((await readUi($)).tab)
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

function fetchPrs($: EngineInterface, findsBranchPr: boolean, isPress = false): Promise<void> {
  return queuePrFetch(findsBranchPr, isPress, ask => fetchPrsNow($, ask))
}

async function fetchPrsNow($: EngineInterface, ask: FetchAsk) {
  const owner = currentOwner()
  try {
    await markFetching($, true)
    await fetchSessionPrs(hostOf($, owner), ask.findsBranchPr, ask.isPress)
  } finally {
    mod.prFetchEndedAt = await $.clock.now()
    // Fetches run one at a time across conversations, so the drawn session reads whether one still runs.
    await markFetching($, mod.nextFetch !== null)
  }
  void sendUi($, ['read']).catch(() => undefined)
}

async function pollPrs($: EngineInterface, remote = false) {
  const [away, session, isTabShown, now] = await Promise.all([
    read($, AWAY),
    read($, SESSION),
    isPrsTabShown($),
    $.clock.now(),
  ])
  const poll = {
    lastFetchedAt: mod.prFetchEndedAt,
    now,
    isTabShown: isTabShown || remote,
    isAway: away.isAway && !remote,
  }
  const isFetching = isPrFetchBusy()
  if (isPrPollDue({ ...session, prViews: { ...session.prViews, isFetching } }, poll)) await fetchPrs($, poll.isTabShown)
}

/** Takes a dismissed PR off the tab once its row settles, unless it is still tracked or the Dismiss was undone. */
/** Sends the answers and Fixes held for Undo, and tells Claude about rows closed with Done, once their settle window has passed. */
async function wakeAfterSettle($: EngineInterface) {
  await wakeSessionAfterSettle(hostOf($, currentOwner()))
}

/**
 * Sends the held messages that are due, and wakes again when the next one falls due. A load or a pane opening calls
 * it, since the timer a press started does not survive a reload.
 */
async function wakeForHeldSends($: EngineInterface) {
  await wakeAfterSettle($)
  const [{ lastActions }, now] = await Promise.all([read($, SESSION), $.clock.now()])
  const dueTimes = Object.values(lastActions).flatMap(a => (a.delivery?.state === 'held' ? [a.delivery.until] : []))
  if (dueTimes.length > 0) later($, Math.max(0, Math.min(...dueTimes) - now), () => wakeAfterSettle($))
}

/** Runs the press the controller sent as `pressId`, then tells it how the press ended. */
async function runPress(
  $: EngineInterface,
  pressId: number,
  p: RowPress | PrPress,
  holds: Holds,
  surface?: UiPressArgument['surface'],
) {
  const mayStayOnRow = isPrPress(p)
    ? ['pr-open', 'pr-refresh', 'thread-open', 'log', 'check-rerun'].includes(p.action)
    : p.action === 'step'
  const undoRevision = mayStayOnRow ? suspendUndoReveal() : cancelUndoScroll()
  const now = await $.clock.now()
  const isDemo = (await read($, DEMO)) !== null
  const started = isDemo ? null : await startPress(hostOf($, currentOwner(), surface), p, false, holds)
  const demo = isDemo ? await runDemoPress($, pressId, p, holds, now) : null
  const effects = started?.effects ?? (demo?.hasEffects ? [] : null)
  if (effects) {
    if (mayStayOnRow && effects.some(effect => effect.kind === 'send')) cancelUndoScroll()
    const undoKey = await undoKeyAfterPress($, p, surface)
    if (undoKey !== null && undoRevision === paneState.undoScrollRevision)
      await keepUndoVisible($, undoKey, pressRowId(p), now, undoRevision)
  }
  const outcome = started ? await started.finish() : null
  if (outcome?.wakesAfterSettle) later($, SETTLED_MS, () => wakeAfterSettle($))
  if (outcome?.isRowFailed) void publishStatus($)
  const settled: SettledOutcome = outcome
    ? {
        error: outcome.error,
        note: outcome.note,
        isUnconfirmed: outcome.isUnconfirmed,
        isRowFailed: outcome.isRowFailed,
      }
    : (demo?.outcome ?? { error: null, note: 'stale', isUnconfirmed: false })
  await sendUi($, ['read', { type: 'press-settled', pressId, outcome: settled }], surface)
}

async function undoKeyAfterPress(
  $: EngineInterface,
  p: RowPress | PrPress,
  surface?: UiPressArgument['surface'],
): Promise<string | null> {
  if (surface !== 'terminal' || !paneState.isInlineTerminalPane) return null
  const { view } = await drawnState($)
  if (isPrPress(p)) {
    const block = prUndoBlockAfter(view.prs.drawn, p)
    return block ? `undo-${block}` : null
  }
  const row = allRows(view).find(r => r.id === p.id)
  return row?.state.is === 'settled' && row.actions.some(a => a.press.action === 'undo')
    ? `undo-${pressRowId(p)}`
    : null
}

/** A press on the sample, which changes the sample copy. The stand-in agent answers a sent message when it is due. */
async function runDemoPress($: EngineInterface, pressId: number, p: RowPress | PrPress, holds: Holds, now: number) {
  const texts = {
    comparePage: comparePagePath($.plugin.root),
    compareInBackground: isCompareInBackground('claude-code'),
  }
  const pressed: { r: DemoPressed | null } = { r: null }
  await update($, DEMO, d => {
    if (!d) return d
    pressed.r = demoPressOn(d, p, now, holds, texts)
    return pressed.r.demo
  })
  if (pressed.r?.sent) paneState.demoSends.set(pressId, pressed.r.sent)

  return pressed.r
}

async function demoReply($: EngineInterface, pressId: number) {
  const sent = paneState.demoSends.get(pressId)
  if (!sent) return
  paneState.demoSends.delete(pressId)
  await update($, DEMO, d => d && { ...d, ...demoReplied(d, sent) })
}

/** The pane's state: the saved controller state, with the terminal's config while it draws the pane, else desktop's. */
async function readUi($: EngineInterface): Promise<UiState> {
  return modUiOf(await read($, UI), paneState.drawsTerminal ? 'terminal' : paneState.paneLook)
}

/**
 * Runs `events` through the shared controller on the drawn view, one batch at a time, saves its state, and runs its
 * commands. `'read'` reads what the drawn session says about its host. A press's `surface` reaches its commands.
 */
function sendUi($: EngineInterface, events: (UiEvent | 'read')[], surface?: UiPressArgument['surface']) {
  const run = paneState.uiQueue.then(() => applyUi($, events, surface))
  paneState.uiQueue = run.catch(() => undefined)

  return run
}

async function applyUi($: EngineInterface, events: (UiEvent | 'read')[], surface?: UiPressArgument['surface']) {
  const [drawn, isPaneOpen] = await Promise.all([drawnState($), isPaneShown($)])
  const host = hostFactsOf(drawn)
  const synced = withPaneShown(events, drawn.ui, isPaneOpen)
  const all = synced.map((event): UiEvent => (event === 'read' ? { type: 'read', host } : event))
  const applied = applyUiEvents(drawn.ui, drawn.view, all, drawn.now)
  if (JSON.stringify(applied.ui) !== JSON.stringify(drawn.ui)) await update($, UI, () => applied.ui)
  scheduleUiWake($, applied.ui, drawn.view, applied.nextWakeAt, drawn.now)
  for (const c of applied.commands) void runUiCommand($, c, surface).catch(() => undefined)
}

/** Keeps the one timer at the controller's next wake, or the terminal's next Undo step when that comes first. */
function scheduleUiWake($: EngineInterface, ui: UiState, view: SessionView, wakeAt: number | null, now: number) {
  const undoStep = paneState.drawsTerminal && ui.shownSince !== null ? undoStepAt(view, now) : null
  const at = earliestOf([wakeAt, undoStep])
  const isRead = at !== null && isReadWake(ui, view, at, now)
  const wake = paneState.uiWake
  if (wake !== null && wake.at === at && wake.isRead === isRead) return
  wake?.timer.cancel()
  paneState.uiWake = null
  if (at === null) return
  try {
    paneState.uiWake = { at, isRead, timer: $.clock.after(Math.max(0, at - now), () => void wakeUi($)) }
  } catch {
    // An earlier mod can refuse the timer. The terminal's next render then starts it again.
  }
}

/** A terminal render draws the last frame, and starts the timer again when it died, as when the engine refused it. */
function landTerminalFrame($: EngineInterface, ui: UiState, view: SessionView, now: number) {
  paneState.drawsTerminal = true
  paneState.isTerminalFrameLanded = true
  const wake = paneState.uiWake
  if (wake === null || wake.at < now) scheduleUiWake($, ui, view, nextWakeAt(ui, view, now), now)
}

/** A wake reads the view again when it changed on the clock, and otherwise only draws the next frame or step. */
async function wakeUi($: EngineInterface) {
  const isRead = paneState.uiWake?.isRead === true
  paneState.uiWake = null
  if (!isRead && !paneState.isTerminalFrameLanded) return
  await sendUi($, [isRead ? 'read' : { type: 'tick' }])
  if (isRead) return redraw($)
  paneState.isTerminalFrameLanded = false
  await update($, RUNNING_FRAME, n => n + 1)
}

async function runUiCommand($: EngineInterface, c: UiCommand, surface?: UiPressArgument['surface']) {
  if (c.kind === 'press') await runPress($, c.pressId, c.press, c.holds, surface)
  else if (c.kind === 'save-collapse') await saveCollapse($, c.id, c.isCollapsed).then(() => sendUi($, ['read']))
  else if (c.kind === 'read') await sendUi($, ['read'])
  else if (c.kind === 'focus-field') await focusOpenedField($, c.id)
  else if (c.kind === 'reveal') await revealRow($, c.tab, c.id, c.closedId)
  else if (c.kind === 'tab-shown') await tabShown($, c.tab)
  else await demoReply($, c.pressId)
}

/** Keeps the leaving conversation's state among the others kept, and starts the pane over, closed, on the same tab. */
async function leaveUi($: EngineInterface) {
  const [ui, now] = await Promise.all([readUi($), $.clock.now()])
  const id = conversation.id
  paneState.keptUi = keptUiStates({ ...paneState.keptUi, [id]: { ui, shownAt: now } }, null)
  await update($, UI, () => freshUi(ui.config, ui.tab))
}

/** Takes the state kept for conversation `id`, else goes on from the current one. No press's answer survives a load. */
async function enterUi($: EngineInterface, id: string) {
  const { [id]: kept, ...others } = paneState.keptUi
  paneState.keptUi = others
  const ui = restoredUi(kept?.ui ?? (await readUi($)))
  openFields.clear()
  const isShown = await isPaneShown($)
  await update($, UI, () => ({ ...ui, shownSince: null }))
  await sendUi($, isShown ? [{ type: 'opened' }, 'read'] : ['read'])
}

/** The drawn session and its view. `canScrollConversation` is whether the surface drawing it can scroll the conversation. */
async function drawnState(
  $: EngineInterface,
  canScrollConversation = false,
): Promise<
  DemoCopy & {
    view: SessionView
    ui: UiState
    isDemo: boolean
    showsDemoNotices: boolean
    isUnread: boolean
    lastTypedMessageAt: number | null
    now: number
  }
> {
  const [session, ui, demo, isDemoRecording, unreadable, now] = await Promise.all([
    read($, SESSION),
    readUi($),
    read($, DEMO),
    read($, DEMO_RECORDING),
    read($, UNREADABLE),
    $.clock.now(),
    read($, REDRAW),
    // The minute tick while the person is away redraws the ages.
    read($, AWAY),
  ])
  const { ledger, stop, prViews, lastActions, presence } = session
  const turns = { turnsStarted: presence.turnsStarted, turnsApplied: presence.turnsApplied }
  const notes = notesOf(ui)
  const drawn: DemoCopy = demo
    ? { ...demo, notes }
    : {
        ledger,
        stop,
        prViews,
        lastActions,
        notes,
        turns,
      }

  const isUnread = demo === null && unreadable === conversation.id

  const drawnFrom = drawnSession(session, drawn, demo !== null, now)
  const view = sessionView(drawnFrom, now, SETTLED_MS, holdsOf(ui, now), notes, canScrollConversation)

  return {
    ...drawn,
    lastActions: view.lastActions,
    view,
    ui,
    lastTypedMessageAt: presence.lastTypedMessageAt,
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
  paneState.demoSends.clear()
  // The sample closes a row as it starts, at `now`, so its showing starts then too and the row stays in place. The
  // pane shows the sample or opens on it next.
  await sendUi($, isShown ? [{ type: 'reset' }, { type: 'opened' }, 'read'] : [{ type: 'reset' }, 'read'])
  await syncLook($, true)
  if ((await readUi($)).tab === 'prs') await findPrs($)
}

function readIsNextBuild($: EngineInterface): Promise<boolean> {
  return $.fs.exists(nextBuildMarkPath($.plugin.root)).catch(() => false)
}

function registerInboxCommand($: EngineInterface) {
  return $.command.register({ name: 'inbox', description: INBOX_COMMAND_TEXT, immediate: true }).catch(() => undefined)
}

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
  return mod.turningOn ?? (mod.isOn ? Promise.resolve() : turnOn($))
}

function turnOn($: EngineInterface): Promise<void> {
  return (mod.turningOn ??= initializeInbox($).finally(() => {
    mod.turningOn = null
  }))
}

async function readVersion($: EngineInterface) {
  try {
    const manifest: unknown = JSON.parse(await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`))
    const stated = (manifest as { version?: unknown } | null)?.version
    mod.version = typeof stated === 'string' ? stated : null
  } catch {
    mod.version = null
  }
  mod.isNextBuild = await readIsNextBuild($)
  mod.statusRecordsFolder = mod.isNextBuild ? await recordsFolder(commandCalls($)).catch(() => null) : null
}

async function initializeInbox($: EngineInterface) {
  // A hot reload keeps state an older build wrote. Draws start once isOn is set, and they read the current shape.
  await Promise.all([upgradeState($), readVersion($)])
  mod.isOn = true
  mod.toolsRefused = false
  const refused = () => {
    mod.toolsRefused = true
  }
  await Promise.all([
    registerInboxCommand($),
    ...agentTools(CLAUDE_CODE).map(tool => $.tool.register(tool).catch(refused)),
  ])
  // A pane kept across a hot reload is already drawn.
  if (mod.toolsRefused) await redrawPane($)
  for (const interval of mod.intervals) interval.cancel()
  mod.intervals = [
    $.clock.every(60_000, () => {
      void tick($)
    }),
    $.clock.every(PR_POLL_MS, () => {
      void pollPrs($)
    }),
  ]
  await loadConversation($, await $.session.id(), 'mod-start')
  void startInHerdr(herdrCalls($), () => redrawPane($))
  mod.stopHerdrPresses?.()
  mod.stopHerdrPresses = await listenForHerdrPresses(
    herdrCalls($),
    () => conversation.id,
    (id, f) => herdrPress($, id, f),
  )
  // After loadConversation, which brings saved state up to date. A band or pane drawn while the mod was off read no
  // state, so no state write draws it again.
  $.ui.invalidate('ui.render')
  await sendUi($, ['read'])
  await redraw($)
}

/**
 * Loads the conversation `id` the session runs: at the start, and after
 * /clear, /resume or /branch, which switch conversations under a new session
 * id without a session.start.
 */
function loadConversation($: EngineInterface, id: string, by: LoadedBy, forkedFrom?: string): Promise<void> {
  const revision = ++sessionState.loadRevision
  return prepareConversation($, id, revision, by, forkedFrom)
}

async function prepareConversation(
  $: EngineInterface,
  id: string,
  revision: number,
  by: LoadedBy,
  forkedFrom?: string,
) {
  const writesAtRead = sessionState.savedWrites
  const [sessionRoot, saved] = await Promise.all([$.session.root(), readSettled(saveEngine($), id)])
  if (revision !== sessionState.loadRevision) return
  const applying = sessionState.applyingConversation.then(async () => {
    if (revision !== sessionState.loadRevision) return
    // A write to a saved session after the read above, such as a refused Done message, is read again.
    const latest = writesAtRead === sessionState.savedWrites ? saved : await readSettled(saveEngine($), id)
    // A fork continues its parent's inbox, so a new id with no saved state starts from the parent's.
    const parent = latest?.session || !forkedFrom ? null : await readSettled(saveEngine($), forkedFrom)
    await applyConversation($, id, revision, by, sessionRoot, latest, parent?.session)
  })
  sessionState.applyingConversation = applying.catch(() => undefined)
  return applying
}

async function noteChild(
  $: EngineInterface,
  change: (o: SessionStatus | null, at: number) => SessionStatus | null,
  isWorthSaving: (at: number) => boolean = () => true,
) {
  const at = await $.clock.now()
  if (!isWorthSaving(at)) return null
  let before: SessionStatus | null = null
  const changed = (o: SessionStatus | null) => change((before = o), at)
  await commit($, currentOwner(), s => statusChanged(s, changed)).catch(() => undefined)

  return { before, at }
}

async function noteAgentWork($: EngineInterface, agentId: string) {
  const ref = childRefOf(agentId)
  await noteChild(
    $,
    (o, at) => childWorked(o, ref, at),
    at => isActivityWorthSaving(ref, at),
  )
}

async function notePlace($: EngineInterface) {
  const change = await placeNow($)
  if (change) await commit($, currentOwner(), change).catch(() => undefined)
}

/** The change that saves where the session runs now. Null when that folder is not known. */
async function placeNow($: EngineInterface): Promise<((s: Session) => Session) | null> {
  const folder = await sessionFolder(commandCalls($))
  if (!folder) return null
  const left = conversation.root
  conversation.root = folder
  const saved = (await read($, SESSION)).place?.folder ?? null

  return placeChange(commandCalls($), saved, left, folder)
}

async function applyConversation(
  $: EngineInterface,
  id: string,
  revision: number,
  by: LoadedBy,
  sessionRoot: string,
  saved: { session: SavedRecord | undefined } | null,
  parent?: SavedRecord,
) {
  if (revision !== sessionState.loadRevision) return
  const isLoading = () => revision === sessionState.loadRevision && conversation.id === id
  cancelUndoScroll()
  sessionState.stopGeneration++
  sessionState.resuming = null
  conversation.id = id
  conversation.root = sessionRoot
  sessionState.isReadingAgain = false
  // A reload stops any update the previous load had running, and state outlives
  // it, so an update in flight at load was cut off: record it as failed.
  // The theme read at the start is gone after /clear, so each conversation reads it.
  const [current] = await Promise.all([upgradeState($), syncTheme($)])
  const loadedAt = await $.clock.now()
  // The pane now shows another conversation, so it opens on it as on a new showing.
  await enterUi($, id)
  const turns = await $.session.turns().catch(() => null)
  const cutOff = (s: Session) => {
    const loaded = statusChanged(cutOffTurn(cutOffUpdate(s), loadedAt), o => childrenCutOff(o, loadedAt))

    return { ...loaded, lastActions: withReplyWaitEnded(loaded.lastActions) }
  }
  // Before notePlace's save, so this conversation is never saved with the previous one's tool fields.
  await replaceDrawn($, s => withLoadedToolFields(cutOff(s), by, saved?.session, parent, turns))
  if (revision !== sessionState.loadRevision) return
  void notePlace($)
  const isFresh = isBlankLedger(current)
  const isUnread =
    (await update($, UNREADABLE, u =>
      isLoading() ? (isFresh ? (saved === null ? id : null) : u === id ? u : null) : u,
    )) === id
  if (!isLoading()) return
  if (saved !== null) await bringBack($, parent ?? saved.session, isLoading, parent !== undefined)
  const { ledger, presence } = await read($, SESSION)
  const isEmpty = isBlankLedger(ledger)
  const needsCatchUp =
    presence.ledgerState !== 'current' ||
    presence.turnsStarted > presence.turnsApplied ||
    (!isUnread && isEmpty && (turns ?? 0) > 0)
  if (!isLoading()) return
  if (needsCatchUp) await catchUpNow($)
  void publishStatus($)
  void sendUi($, ['read']).catch(() => undefined)
  void wakeForHeldSends($).catch(() => undefined)
  if (tabPrs(ledger).length > 0) void fetchPrs($, false)
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

    return isFork ? forkedFrom(s, loaded) : broughtBack(s, loaded)
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
    sendUi($, [{ type: 'reset' }]),
  ])
}

async function readAgain($: EngineInterface) {
  if (sessionState.isReadingAgain) return
  sessionState.isReadingAgain = true
  const id = conversation.id
  if ((await read($, UNREADABLE)) !== id) {
    sessionState.isReadingAgain = false
    return
  }
  await redrawPane($)
  const saved = await readSaved(saveEngine($), id)
  if (conversation.id !== id) return
  sessionState.isReadingAgain = false
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
    if (tabPrs(ledger).length > 0) void fetchPrs($, false)
    void sendUi($, ['read']).catch(() => undefined)
  }
  await redrawPane($)
}

function redrawPane($: EngineInterface) {
  return redraw($)
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
    if (mod.isOn && e.session_id !== conversation.id)
      await loadConversation($, e.session_id, e.source, e.source === 'fork' ? conversation.id : undefined)

    return r
  })

  // The Claude app starts a new session in a spare folder and runs SessionStart only once it moves it to the project.
  on('classic.SessionStart', { source: 'startup' }, async ($, e, next) => {
    const r = await next(e)
    const seen = conversation.root
    if (mod.isOn && seen !== '' && (await sessionFolder(commandCalls($))) !== seen) {
      void notePlace($)
      void isPrsTabShown($).then(isShown => fetchPrs($, isShown))
    }

    return r
  })

  on('session.end', async ($, e, next) => {
    sessionState.endReason = e.reason
    sessionState.loadRevision++
    sessionState.stopGeneration++
    sessionState.resuming = null
    if (mod.isOn) {
      await Promise.all([
        replaceDrawn($, s => (s.stop ? { ...s, stop: null } : s)),
        update($, DIALOGS, () => []),
        update($, DEMO, () => null),
        update($, DEMO_RECORDING, () => false),
        publishStatus($, true, isExitReason(e.reason)),
      ])
    }
    // /clear, /resume and /branch (which reports resume) go on in this process with another conversation.
    if (mod.isOn && (e.reason === 'clear' || e.reason === 'resume')) {
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
        leaveUi($),
        update($, AWAY, a => ({ ...a, isAway: false })),
      ])
      resetTurn()
      sessionState.shellCommand = null
      forgetStored()
    }

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (!mod.isOn) return next(e)
    // Where a guard skips classic.SessionStart, the first prompt after /clear, /resume or /branch is what shows the
    // session has changed conversations. A reload that classic.SessionStart already did leaves the ids equal.
    const sessionId = await $.session.id()
    if (sessionId !== conversation.id) {
      const reason = sessionState.endReason
      sessionState.endReason = null
      const parent = reason === 'resume' ? conversation.id : undefined
      await loadConversation($, sessionId, reason === 'clear' ? 'clear' : 'resume', parent || undefined)
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

    const notes = await notePrompt($, e.text, { isTyped, personSource: e.command ? 'command' : 'prompt' })
    if (sessionState.carriedFor !== conversation.id) {
      sessionState.carriedFor = conversation.id
      const carry = statusCarryText((await read($, SESSION)).ledger)
      if (carry) notes.unshift(carry)
    }

    return notes.length === 0 ? next(e) : next({ ...e, context: [...(e.context ?? []), ...notes] })
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId) {
      if (mod.isOn) await noteAgentWork($, e.agentId)
      return next(e)
    }
    resetTurn()
    sessionState.hasStopFromError = false
    // Counted here, before the
    // turn can end, since a reload can cut off its end-of-turn hook.
    if (mod.isOn) {
      const before = await read($, SESSION)
      const startedAt = await $.clock.now()
      await commit($, currentOwner(), s => turnStarted(startTurn(s), startedAt))
      if (before.stop) {
        sessionState.stopGeneration++
        sessionState.resuming = null
        void publishStatus($)
      }
    }

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    const agentId = r.deny === undefined ? r.agentId : undefined
    if (!mod.isOn || !agentId || e.isTeammate) return r
    const parent = e.parentAgentId ?? (e.workflow ? e.tool_use_id : undefined)
    if (parent) {
      spawnedBy.set(agentId, parent)
      await noteAgentWork($, agentId)

      return r
    }
    await noteChild($, (o, at) => childStarted(o, { ref: agentId, kind: 'subagent', name: e.description }, at))

    return r
  })

  on('tool.describe', { tool: RECORD_TOOL }, async (_$, e, next) => ({ ...(await next(e)), isDeferred: false }))
  on('tool.call', { tool: RECORD_TOOL }, async ($, e) => ({
    result: await runTool($, 'record', e as unknown as Record<string, unknown>, e.tool_use_id),
  }))
  on('tool.describe', { tool: CLOSE_TOOL }, async (_$, e, next) => {
    const r = await next(e)

    return { ...r, description: guidedCloseDescription(CLAUDE_CODE, r.description), isDeferred: false }
  })
  on('tool.call', { tool: CLOSE_TOOL }, async ($, e) => ({
    result: await runTool($, 'close', e as unknown as Record<string, unknown>, e.tool_use_id),
  }))
  on('tool.describe', { tool: ORDER_TOOL }, async (_$, e, next) => ({ ...(await next(e)), isDeferred: false }))
  on('tool.call', { tool: ORDER_TOOL }, async ($, e) => ({
    result: await runTool($, 'order_prs', e as unknown as Record<string, unknown>, e.tool_use_id),
  }))

  on('tool.call', async ($, e, next) => {
    if (!mod.isOn) return next(e)
    const { tool: _tool, tool_use_id: _id, agentId: _agent, ...input } = e as unknown as Record<string, unknown>
    const key = callKey(String(e.tool), input)
    const activity = e.agentId ? null : toolActivity(String(e.tool), input)
    const call = { didRun: true }
    const run = async () => {
      try {
        return await clearingDialog($, key, () => next(e))
      } finally {
        if (e.tool_use_id) askedCalls.delete(e.tool_use_id)
        call.didRun = endedCallRan(e.tool_use_id, String(e.tool))
        if (call.didRun && activity) await noteActivity($, activity)
      }
    }
    if (e.agentId) {
      await noteAgentWork($, e.agentId)
      return run()
    }
    if (String(e.tool) === TURN_BOX_TOOL) sessionState.turnBox = turnBoxText(input) ?? sessionState.turnBox
    if (e.tool === 'Bash') {
      const steps = delegateSteps(e.command)
      const isDelegateCommand = steps.length > 0
      const isWait = waitsOnDelegate(e.command)
      const started = isWait ? await noteChild($, (o, at) => delegatesStarted(o, e.command, at)) : null
      const ran = await run()
      if (!call.didRun) {
        if (started) await noteChild($, o => delegatesTakenBack(o, e.command, started.before, started.at))
        return ran
      }
      if (isDelegateCommand && !isWait) await noteChild($, (o, at) => delegatesStarted(o, e.command, at))
      const found = commandFindings(e.command, ran.text ?? '')
      for (const line of found.lines) await noteActivity($, line)
      void linkPrs($, found.prRefs)
      const taskId = toolRecord('Bash', ran.result)?.backgroundTaskId
      const waitsOn = steps.filter(step => step.isWaitForEnd).map(step => step.name)
      if (taskId && isDelegateCommand) {
        for (const name of waitsOn) for (const id of [taskId, e.tool_use_id]) if (id) delegateWaits.set(id, name)
      } else if (!taskId && waitsOn.length > 0) {
        await noteChild($, (o, at) => delegateWaitsEnded(o, e.command, at))
      }

      return ran
    }
    if (e.tool === 'Agent') {
      const ran = await run()
      const agentId = endedAgentOf(ran.result)
      if (agentId) await noteChild($, (o, at) => childEnded(o, agentId, at))

      return ran
    }
    if (e.tool === 'Workflow') {
      const ran = await run()
      const child = startedWorkflowOf(ran.result, e.description)
      if (child) {
        if (e.tool_use_id) workflowTasks.set(e.tool_use_id, child.ref)
        await noteChild($, (o, at) => childStarted(o, child, at))
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
      if (wasDismissed) sessionState.isDialogDismissed = true
      const line = dialogActivity(asked, outcome)
      const endedAt = await $.clock.now()
      await commit($, currentOwner(), s => {
        const noted = noteTurnActivity(s, line)
        if (wasDismissed) return noteDialog(noted, null, asked)

        return outcome.kind === 'answered' ? noteAnsweredDialog(noted, asked, outcome, endedAt) : noted
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

  on('classic.PostToolUse', async (_$, e, next) => {
    if (mod.isOn) noteRanCall(e.tool_use_id, e.tool_name)
    return next(e)
  })
  on('classic.PostToolUseFailure', async (_$, e, next) => {
    if (mod.isOn) noteRanCall(e.tool_use_id, e.tool_name)
    return next(e)
  })

  // A question dialog opens from its own tool call, which also raises a permission request.
  on('classic.PermissionRequest', async ($, e, next) => {
    mod.hasPermissionRequestHook = true
    if (mod.isOn && e.tool_name !== 'AskUserQuestion') {
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
    const mayShowRow = mod.isOn && !mod.hasPermissionRequestHook && !e.agentId && e.tool !== 'AskUserQuestion'
    if (mayShowRow && e.tool_use_id) void waitForPermission($, e.tool_use_id, e.tool, e.input)

    return next(e)
  })

  on('classic.StopFailure', async ($, e, next) => {
    const r = await next(e)
    if (!mod.isOn || e.agent_id) return r
    sessionState.hasStopFromError = true
    const message = e.last_assistant_message ?? ''
    await setStop($, {
      kind: stopKindOf(String(e.error), message),
      detail: String(e.error),
      resets: resetTime(message),
      at: await $.clock.now(),
    })

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
    if (e.agentId) return r
    askedCalls.clear()
    await closeDialogs($, null)
    if (!mod.isOn) return r
    const endedAt = await $.clock.now()
    const [listed, inHerdr, place] = await Promise.all([
      $.agent.list().catch(() => null),
      read($, SESSION).then(s => delegatesAsked(herdrCalls($), upgradeSession(s).ledger.overview)),
      placeNow($),
    ])
    const running =
      listed && new Set(listed.filter(a => a.status === 'running' || a.status === 'pending').map(a => a.id))
    await commit($, currentOwner(), s => {
      const turnOver = turnEnded(s, endedAt)
      const ended = { ...turnOver, lastActions: withReplyWaitEnded(turnOver.lastActions) }
      const withSubagents = running ? statusChanged(ended, o => subagentsSettled(o, running, endedAt)) : ended
      const withDelegates = inHerdr
        ? statusChanged(withSubagents, o => delegatesSettled(o, inHerdr, endedAt))
        : withSubagents
      return place ? place(withDelegates) : withDelegates
    })
    if (e.reason === 'error' && !sessionState.hasStopFromError) await setStopFromLastReply($)
    void wakeAfterSettle($).catch(() => undefined)
    const reply = turnReply([turnReply(sessionState.stepTexts, e.answer), sessionState.turnBox ?? ''])
    const isAnswered = e.reason === 'answer' && reply !== ''
    if (!isAnswered && !sessionState.isDialogDismissed) return r

    const [screenTab, isShown, now, before] = await Promise.all([
      shownScreenTab($),
      isPaneShown($),
      $.clock.now(),
      read($, SESSION),
    ])
    const queuesEmptyReply = sessionState.isDialogDismissed
    resetTurn()
    await update($, AWAY, a => ({ ...a, lastActiveAt: now }))
    await commit($, currentOwner(), s => endTurn(CLAUDE_CODE, s, reply, isShown, { tab: screenTab, queuesEmptyReply }))
    updateLedger($)
    const after = await read($, SESSION)
    const linksNewPr = after.ledger.prs.some(ref => !before.ledger.prs.includes(ref))
    const tracksPrs = tabPrs(after.ledger).length > 0 || after.prViews.branchRef !== null
    const isTabShown = await isPrsTabShown($)
    if (linksNewPr || (tracksPrs && isPrFetchDue(after, mod.prFetchEndedAt, now, isTabShown)))
      void fetchPrs($, isTabShown)

    return r
  })

  on(
    'session.append',
    { door: ['prompt', 'delivery'], origin: { kind: 'plugin', name: 'inbox' } },
    async ($, e, next) => {
      if (!mod.isOn || e.agentId) return next(e)
      const text = messageText(e.message)
      const count = noteStored(text)
      const match = (current: Session) => arrived(current, text, count)
      const notes = await notePrompt($, text, { match, isOwnTurn: e.door === 'prompt' })
      if (notes.length > 0) await appendContext($, notes)

      return next(e)
    },
  )

  on('session.append', { door: 'response' }, async ($, e, next) => {
    const r = await next(e)
    if (!mod.isOn || e.agentId || messageText(e.message).trim() === '') return r
    const { lastActions } = await read($, SESSION)
    if (withExplanationReply(lastActions, e.uuid) !== lastActions)
      await commit($, currentOwner(), s => ({ ...s, lastActions: withExplanationReply(s.lastActions, e.uuid) }))

    return r
  })

  on('session.append', { door: 'command' }, async ($, e, next) => {
    const r = await next(e)
    if (!mod.isOn || e.agentId) return r
    const row = readCommandRow(messageText(e.message))
    if (!row) return r
    const line = commandRowLine(row)
    if (line) await notePerson($, line)
    if (row.kind === 'shell') {
      sessionState.shellCommand = row.command
    } else if (row.kind === 'output') {
      // The row has no exit code, so only a run with nothing on stderr closes a
      // task here.
      if (sessionState.shellCommand && !row.stderr) await closeTasksRunBy($, sessionState.shellCommand)
      sessionState.shellCommand = null
    } else if (row.name === 'login' && (await read($, SESSION)).stop?.kind === 'sign-in') {
      await setStop($, null)
    }

    return r
  })

  on('command.run', { command: 'inbox' }, async ($, e) => {
    if (!mod.isOn && !mod.turningOn && e.origin.kind !== 'composer') return {}
    await ensureOn($)
    const isShown = (await read($, DEMO)) !== null
    const args = e.args.trim().split(/\s+/).join(' ')
    if (args === 'herdr') return { text: await askHerdrModAgain(herdrCalls($), () => showInbox($, null)) }
    if (args === 'demo' || args === 'demo recording') await setDemo($, !isShown, args === 'demo recording')
    else if ((await readUi($)).tab === 'prs') await findPrs($)
    const [isDemo, isDemoRecording] = await Promise.all([read($, DEMO).then(d => d !== null), read($, DEMO_RECORDING)])
    const note = await showInbox($, args || isDemo ? null : openInHerdr(herdrCalls($)))

    return {
      text: !isDemo
        ? (note ?? 'Opened the inbox.')
        : isDemoRecording
          ? 'Showing sample entries without their notices, for a recording. Run /inbox demo to go back.'
          : 'Showing sample entries in the inbox. Run /inbox demo again to go back.',
    }
  })

  on('ui.press', async ($, e, next) => {
    if (e.requestId === PANE) await sendUi($, [{ type: 'list-input' }])
    if (e.requestId === PANE && e.surface === 'terminal') {
      if (e.element.startsWith('fold-') || e.element === 'hide-demo') cancelUndoScroll()
      else suspendUndoReveal()
    }
    if (e.requestId === PANE && e.surface === 'desktop') {
      paneState.focusedKey = e.element
      paneState.focusHint = focusHintFor(e.element)
    }
    return next(e)
  })

  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') {
      cancelUndoScroll()
      await sendUi($, [{ type: 'list-input' }])
    }
    return next(e)
  })

  on('ui.message', async ($, e, next) => {
    const r = await next(e)
    if (e.requestId !== PANE) return r
    await sendUi($, [{ type: 'list-input' }])
    const data = e.data as {
      tab?: unknown
      isUnfolded?: unknown
      isAll?: unknown
      key?: unknown
      isPointer?: unknown
      isHelp?: unknown
    } | null
    if (data?.isPointer === true) return r
    const shown = isShownTab(data?.tab) ? data.tab : null
    const followUp = typeof data?.key === 'string' ? followUpPresses.get(data.key) : undefined
    if (e.element === 'tabs' && data?.isHelp === true) await toggleHelp($)
    else if (e.element === 'tabs' && shown) await showTab($, shown)
    else if (e.element.startsWith('undo-') && followUp && typeof data?.key === 'string')
      followUp({
        plugin: 'inbox',
        element: data.key,
        component: e.component,
        requestId: e.requestId,
        surface: e.surface,
      })
    else if (e.element.startsWith('links-') && followUp && typeof data?.key === 'string') {
      // The Client is not a focusable key, so the next drawing moves the focus to the hint, when it is drawn.
      paneState.focusedKey = e.element
      paneState.focusHint = focusHintFor(data.key)
      followUp({
        plugin: 'inbox',
        element: data.key,
        component: e.component,
        requestId: e.requestId,
        surface: e.surface,
      })
    } else if (/^(select|collapse)-/.test(e.element)) await pressTitle($, e.element.replace(/^\w+-/, ''), data?.isAll)
    else if (e.element.startsWith(PARENT_PREFIX))
      await toggleParent($, e.element.slice(PARENT_PREFIX.length), data?.isAll)
    else if (e.element.startsWith('fold-'))
      await setFold($, e.element.slice('fold-'.length), data?.isUnfolded, data?.isAll)

    return r
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    cancelUndoScroll()
    const r = await next(e)
    paneHasKeys.clear()
    paneState.drawsTerminal = false
    await sendUi($, [{ type: 'closed' }])
    void syncLook($, false)

    return r
  })

  // A running tool row means the permission step is over: the dialog was answered or the
  // auto-mode classifier approved the call.
  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    if (mod.isOn && e.props.isRunning) endWaitFor($, e.props.tool_use_id)

    return next(e)
  })

  // A call folded into a collapsed group draws no ToolUse row; the group carries its state.
  on('ui.render', { component: 'ToolGroup' }, ($, e, next) => {
    if (mod.isOn) for (const call of e.props.calls) if (call.isRunning) endWaitFor($, call.tool_use_id)

    return next(e)
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

    return next({ ...e, props: { ...e.props, output: line } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!mod.isOn || e.props.hasSurvey) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const [{ ledger, stop, view, isDemo, showsDemoNotices, isUnread, now }, theme] = await Promise.all([
      drawnState($),
      read($, THEME),
    ])
    if (!stop && isBlankLedger(ledger) && !isMaybeStale(view, isUnread)) return next(e)
    // Every mod shares the band, and a tree without the drawing from next(e)
    // hides what the mods after this one draw there.
    const theirs = await next(e)
    const pal = paletteFor(theme, lookOf(e.surface))
    const counts = bandCounts(view).map(c => (
      <Text>
        <Text>{c.label} </Text>
        <Text color={pal.tone[c.id] ?? pal.mark[c.id]}>{c.count}</Text>
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
              <Text dimColor>{noCountsText(view, isUnread)}</Text>
            )}
          </Text>
        </Box>
        {showsDemoNotices ? <Button key="hide-demo" label="Hide demo" onPress={() => void setDemo($, false)} /> : null}
        <Button key="open-inbox" label="Open inbox" onPress={() => void openInbox($, isDemo)} />
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
    const notSent = canResume && sessionState.resuming?.is === 'refused' ? `Not sent: ${sessionState.resuming.why}` : ''
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
            label={resumeLabel(sessionState.resuming?.is === 'sending')}
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
    paneState.paneLook = look
    // The Claude app's pane reports `isFullscreen` too, but its `$.ui.scroll` answers "transcript not scrollable here".
    const canScrollConversation = e.surface === 'terminal' && e.viewport?.isFullscreen === true
    const hasClient = look === 'desktop' && 'Client' in elements
    // The mobile app draws no text field, so there the typed reply is not offered.
    const Input = 'Input' in elements ? elements.Input : null
    const isNarrowDesktop = look === 'desktop' && e.props.bodyColumns < DESKTOP_WIDE_AT
    const isAgeInSide = look === 'terminal'
    const isAgeDropped = isNarrowDesktop || isAgeInSide
    const isInline = e.props.placement === 'inline'
    paneState.isInlinePane = isInline
    if (e.surface === 'terminal') {
      paneState.isInlineTerminalPane = isInline
      if (!isInline && paneState.pendingUndoScroll) cancelUndoScroll()
    }
    const blankLine = isInline ? 0 : 1
    const space =
      look === 'desktop'
        ? { rowPad: 2 * DESKTOP_ROW_PAD, settledPad: 2 * DESKTOP_ROW_PAD, buttonGap: 1, isFoldGapped: false }
        : { rowPad: blankLine, settledPad: 0, buttonGap: 2, isFoldGapped: true }
    const [drawn, theme, termProgram] = await Promise.all([
      drawnState($, canScrollConversation),
      read($, THEME),
      $.env.get('TERM_PROGRAM'),
      // A redraw loop on desktop blocks clicks, so only the terminal draws running marks and Undo in frames.
      look === 'terminal' ? read($, RUNNING_FRAME) : null,
    ])
    const { prViews: prState, lastActions, notes, turns, stop, isDemo, showsDemoNotices, isUnread, now } = drawn
    // The pane can draw before the controller hears that it opened, so the first frame shows the tab the open moves to.
    const opening: UiEvent[] = [{ type: 'opened' }, { type: 'read', host: hostFactsOf(drawn) }]
    const isOpenUnheard = paneState.isOpenUnheard && drawn.ui.shownSince === null
    const ui = isOpenUnheard ? applyUiEvents(drawn.ui, drawn.view, opening, now).ui : drawn.ui
    if (look === 'terminal') landTerminalFrame($, ui, drawn.view, now)
    // A collapse the person made draws at once, before its save reaches the view.
    const view = { ...drawn.view, collapsed: collapsedOf(ui, drawn.view) }
    const { typing, drafts, unfolded, isHelpShown, optionsShown, statusSelection, statusUnfolded, closedAll } = ui
    const shownTab: ShownTab = ui.tab
    const tab: Tab = isRowTab(shownTab) ? shownTab : 'needsYou'
    const isStatusShown = shownTab === 'overview'
    const tabList = shownTabs()
    // A hot reload keeps the open field in `ui` but empties openFields, so the field takes its key and seed again here.
    if (typing !== null && !openFields.has(typing)) openFields.set(typing, openedField(typing, drafts[typing]))
    if (e.props.isFocused || typing !== paneState.fieldWithoutKeys) paneState.fieldWithoutKeys = null
    // Escape, or a click outside the pane, closes the field and keeps its draft, as Cancel does.
    if (isKeyboardHandedBack && typing !== null) later($, 0, () => closeField($, typing))
    if ((typing === null) !== paneState.paneClosesOnEscape) later($, 0, () => matchPaneEscape($))
    const size = isInline ? `${e.props.bodyColumns}x${e.props.scroll.bodyRows}` : null
    if (e.surface === 'terminal') paneState.terminalInlineSize = size
    if (size !== null && paneState.inlineSize !== null && size !== paneState.inlineSize) {
      const revision = paneState.undoScrollRevision
      later($, RESIZE_SCROLL_MS, () =>
        revision === paneState.undoScrollRevision && !isStatusShown ? scrollToOpenRow($, tab, e.surface) : undefined,
      )
    }
    paneState.inlineSize = size
    const shownPrs = view.prs.drawn
    const settledLayout = settledLayoutId(tab, view, shownPrs, lastActions, notes, now, paneState.terminalInlineSize)
    const pal = paletteFor(theme, look)
    const { inlineText, terminalText } = paneText({ Text, pal })
    const raise = {
      dimColor: false,
      backgroundColor: pal.raised,
      inverse: false,
      ...(pal.raisedText ? { color: pal.raisedText } : {}),
    }
    const raiseEdge = { dimColor: false, color: pal.raised, inverse: false }

    const client: PaneClient = hasClient ? { hasClient: true, elements } : { hasClient: false, elements }
    const runButtonPress = (p: RowPress | PrPress, via: PressVia) =>
      sendUi($, [{ type: 'press', press: p, by: pressedBy(via) }], via.surface)
    const handlers: PaneHandlers = {
      rowKeyActions: (r, isAllShown) =>
        rowKeyActions(
          {
            runPress: runButtonPress,
            startTyping: id => startTyping($, id),
            discardReply: id => discardReply($, id),
            showAllOptions: id => void sendUi($, [{ type: 'show-options', id }]),
          },
          r,
          isAllShown,
        ),
      unlessGuarded: (rowId, press, onPress) => unlessGuarded($, rowId, press, onPress),
      sendDraft: (id, surface) => sendDraft($, id, surface),
      discardReply: id => discardReply($, id),
      startTyping: (id, seed) => startTyping($, id, seed),
      selectStatusRow: (id, focusKey) => selectStatusRow($, id, focusKey),
      sendTyped: (id, text, surface) => sendTyped($, id, text, surface),
      pressTitle: id => pressTitle($, id),
      showTab: tab => showTab($, tab),
      toggleParent: id => toggleParent($, id),
      closeField: id => closeField($, id),
      editDraft: (id, text) => sendUi($, [{ type: 'edit-draft', id, text }]),
      toggleHelp: () => toggleHelp($),
      setFold: (fold, isOpen) => sendUi($, [{ type: 'fold', fold, isOpen }]),
      showEarlier: fold => sendUi($, [{ type: 'earlier', fold }]),
      setStatusFold: (id, isOpen) => sendUi($, [{ type: 'status-fold', id, isOpen }]),
      runPress: runButtonPress,
      readAgain: () => readAgain($),
      resume: () => resume($),
      showAsk: askId => showAsk($, askId),
    }
    const { itemRow, findingRow } = paneAskRows(
      { now, look, isInline, Text, pal, optionsShown, Box, terminalText, inlineText },
      handlers,
    )
    const isThreadSent = threadSentIn(lastActions)
    const presses = { lastActions, turns, now }
    const { prKeyAction, checkRow, threadRow } = panePrRows(
      { Text, pal, presses, Link, Box, Markdown, terminalText, lastActions, look, now },
      handlers,
    )

    // The Status and Help draw no rows, so none are built while either shows.
    const isListShown = !isStatusShown && !isHelpShown
    const lists = drawnLists(
      view,
      () => true,
      r => (!isListShown ? null : r.item ? itemRow(r) : r.finding ? findingRow(r) : null),
    )
    const needsYouGroups = NEEDS_YOU_GROUPS.map(g => ({ ...g, entries: lists[g.list], rows: rowsIn(lists[g.list]) }))
    const findingEntries = lists.findings
    const prGroups = (isListShown ? shownPrs : []).map(d => ({
      ...d,
      ...prBlockRows(d.pr, d.state.is === 'settled', {
        thread: t => threadRow(d.pr, t),
        check: c => checkRow(d.pr, c),
      }),
    }))
    const prOrderKeys = (view.prs.order?.changed?.actions ?? []).map(a => prKeyAction(a, 'order'))
    const prRefreshKeys = (view.prs.refresh?.actions ?? []).map(a => prKeyAction(a, 'prs'))
    const prClearKeys = view.prs.clear.map(a => prKeyAction(a, 'prs'))
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
    const guard = ui.selection[tab].guard
    const at = isListShown ? ids.indexOf(selectedOf(ui, drawn.view, tab) ?? '') : -1
    const isOpenGuarded = !isStatusShown && guard !== null && now < guard.at + PRESS_GUARD_MS
    const isStatusUnfolded = (id: string) => statusUnfolded.includes(id)
    const isStatusCollapsed = (id: string) => view.collapsed.includes(id)
    const statusKeyRow = isStatusShown
      ? statusSelected(view.statusPage, statusSelection, isStatusUnfolded, isStatusCollapsed)
      : null
    const statusPressRows = isStatusShown ? statusKeyRows(view.statusPage, isStatusUnfolded, isStatusCollapsed) : []

    const {
      desktopColumnPt,
      desktopRowTextPt,
      desktopLabel,
      keyRow,
      keyBindings,
      keyLines,
      terminalKeyCells,
      actionRows,
      rowActions,
      fieldActions,
      keyedButton,
      answersFit,
    } = paneRowKeys(
      { ...client, listColumns, isOpenGuarded, look, Button, Box, pal, Text, space, Input, typing },
      handlers,
    )
    const {
      feedbackLabel,
      lastActionText,
      pressedAge,
      branch,
      desktopHairline,
      columnsFor,
      markWidth,
      treeRow,
      divided,
      withDoneText,
      feedbackColor,
      unselectedLine,
      ToneSvg,
      svgCell,
      gutterMark,
      toned,
      sideAge,
      rowClientProps,
      withSideAge,
      markGlyph,
    } = paneRowLines({
      ...client,
      lastActions,
      notes,
      turns,
      now,
      look,
      isAgeDropped,
      pal,
      Box,
      Text,
      e,
      isInline,
      isAgeInSide,
      listColumns,
      Button,
    })
    const { desktopFrame } = paneRowFrame({ space, Box })
    const rowFns = paneRows(
      {
        ...client,
        ui,
        indexOf,
        at,
        collapsed: new Set(view.collapsed),
        Box,
        space,
        Text,
        pal,
        Input,
        typing,
        drafts,
        look,
        now,
        isAgeInSide,
        listColumns,
        isInline,
        e,
        optionsShown,
        blankLine,
        Button,
        settledLayout,
        shownTab,
        columnsFor,
        gutterMark,
        toned,
        rowClientProps,
        feedbackLabel,
        pressedAge,
        withDoneText,
        feedbackColor,
        sideAge,
        withSideAge,
        unselectedLine,
        branch,
        desktopHairline,
        rowActions,
        desktopRowTextPt,
        keyLines,
        keyRow,
        fieldActions,
        actionRows,
        keyedButton,
        answersFit,
        desktopFrame,
      },
      handlers,
    )

    const shownError = footerError(shownTab, view.status, view.statusPage)

    const notice = noticeOf(ui, now)

    const keyList = helpKeys(look)
    const keyColumn = Math.max(0, ...keyList.map(k => cellWidth(k.keys))) + 2

    const { banner, tabs, rail, statusBlock, isTabRowFit, desktopTabLines } = paneFrame(
      {
        ...client,
        e,
        tabList,
        badgeOf,
        shownTab,
        pal,
        look,
        isInline,
        Text,
        isNarrowDesktop,
        Box,
        shownError,
        notice,
        tabText,
        termProgram,
        Button,
        tabTone,
        raiseEdge,
        raise,
        railWidth,
        hasRail,
        isHelpShown,
      },
      handlers,
    )

    const {
      groupEmpty,
      groupTitle,
      section,
      sections,
      terminalSectionGap,
      titleGap,
      foldButton,
      foldRow,
      desktopFoldLines,
      desktopFoldLinesOf,
      closedFold,
      undoPlace,
      settledContent,
      settledRow,
    } = paneRowParts(
      {
        ...client,
        ui,
        look,
        listColumns,
        Text,
        pal,
        Box,
        blankLine,
        isInline,
        space,
        now,
        Button,
        settledLayout,
        desktopFrame,
        treeRow,
        ToneSvg,
        desktopHairline,
        markGlyph,
        markWidth,
      },
      handlers,
    )
    const { emptyState, needsYouView, findingsView } = paneAskTabs(
      {
        listColumns,
        look,
        isInline,
        Box,
        Text,
        blankLine,
        pal,
        needsYouGroups,
        view,
        isUnread,
        unfolded,
        closedAll,
        Button,
        stop,
        glued,
        now,
        findingEntries,
        lists,
        divided,
        ...rowFns,
        settledRow,
        closedFold,
        section,
        groupTitle,
        titleGap,
        groupEmpty,
        sections,
        banner,
      },
      handlers,
    )

    const { prsView } = panePrBlocks({
      look,
      pal,
      Text,
      Box,
      blankLine,
      isThreadSent,
      lastActions,
      prState,
      presses,
      space,
      Button,
      view,
      prOrderKeys,
      prRefreshKeys,
      prClearKeys,
      prGroups,
      section,
      undoPlace,
      settledContent,
      groupTitle,
      titleGap,
      sections,
      desktopFrame,
      markGlyph,
      divided,
      lastActionText,
      withDoneText,
      ...rowFns,
      prKeyAction,
      desktopLabel,
      desktopRowTextPt,
      listColumns,
      keyRow,
      emptyState,
      banner,
    })

    const statusLines = paneStatusLines({
      Box,
      Text,
      pal,
      look,
      listColumns,
      terminalText,
      desktopColumnPt,
      markWidth,
      branch,
      desktopHairline,
    })
    const { statusKeys, statusView, statusTops } = paneStatus(
      {
        ...client,
        terminalText,
        Button,
        e,
        listColumns,
        look,
        Box,
        Text,
        pal,
        statusKeyRow,
        view,
        isInline,
        ...statusLines,
        Input,
        typing,
        drafts,
        markWidth,
        markGlyph,
        desktopFrame,
        keyRow,
        keyLines,
        terminalKeyCells,
        emptyState,
        sections,
        terminalSectionGap,
        section,
        foldRow,
        foldButton,
        desktopFoldLines,
        desktopFoldLinesOf,
        statusUnfolded,
      },
      handlers,
    )

    const { helpView } = paneHelp({
      pal,
      keyList,
      Box,
      keyColumn,
      Text,
      hasRail,
      ToneSvg,
      svgCell,
      markGlyph,
      markWidth,
      section,
      groupTitle,
      sections,
    })

    const moveBy = (by: 1 | -1) =>
      isHelpShown
        ? undefined
        : isStatusShown
          ? void stepCursor(
              $,
              by,
              statusPressRows.map(r => r.id),
              statusKeyRow?.id ?? null,
            )
          : void stepCursor($, by, ids)
    const selectedId = isListShown ? (ids[at] ?? null) : null
    // Claude Code sends a key no Button binds to the prompt and gives it the keyboard, so the keys
    // stay bound when there is nothing to move to or close.
    const moveKeys: KeyAction[] = [
      { key: 'next', label: 'Next', hotkey: 'j', kind: 'view', onPress: () => moveBy(1) },
      { key: 'previous', label: 'Previous', hotkey: 'k', kind: 'view', onPress: () => moveBy(-1) },
      {
        key: 'collapse',
        label: 'Collapse',
        hotkey: COLLAPSE_KEY,
        kind: 'view',
        onPress: () =>
          isListShown && selectedId !== null
            ? void sendUi($, [{ type: 'collapse', id: selectedId, isCollapsed: !view.collapsed.includes(selectedId) }])
            : undefined,
      },
      {
        key: 'fold-all',
        label: 'Fold all',
        hotkey: FOLD_ALL_KEY,
        kind: 'view',
        onPress: () => (isHelpShown ? undefined : void sendUi($, [{ type: 'fold-all', isOpening: null }])),
      },
    ]
    const tabKeys: KeyAction[] = tabList.map(({ id, label, hotkey }) => ({
      key: `tab-key-${id}`,
      label,
      hotkey,
      kind: 'view',
      onPress: () => void showTab($, id),
    }))

    const selectedRow = isStatusShown || isHelpShown ? undefined : rows[tab][at]
    const selectedActions = selectedRow && !view.collapsed.includes(selectedRow.id) ? rowActions(selectedRow) : null
    const statusRowKeys = statusKeyRow && !isHelpShown ? statusKeys(statusKeyRow) : []
    const rowKeys = [
      ...statusRowKeys,
      ...(selectedActions
        ? [...selectedActions.options, ...selectedActions.keys, ...selectedActions.more]
        : closeKeysWithoutRow(statusRowKeys)),
      ...(tab === 'prs' && !isHelpShown ? [...prOrderKeys, ...prClearKeys] : []),
      // The goal's Undo takes the undo key on the Status, where no list row closes.
      ...(statusRowKeys.some(k => k.hotkey === UNDO_KEY)
        ? []
        : [
            undoKey(isListShown ? latestUndo(tabUndos(tab, lists, shownPrs)) : null, () =>
              sendUi($, [{ type: 'undo-key' }]),
            ),
          ]),
    ]

    // A pane takes a key
    // only as a Button's hotkey, so the tab keys, j, k and the selected row's keys
    // are Buttons in a hidden Box.
    const isLookCounted = isStatusShown && !isHelpShown && !isDemo
    if (isLookCounted) {
      // The lines above the Status: the tabs, unless the rail draws them beside it, and the space under them, which
      // desktop counts in half lines.
      const terminalTabLines = hasRail ? 0 : isTabRowFit ? (isInline ? 1 : 3) : null
      const tabLines = look === 'desktop' ? (hasRail ? null : desktopTabLines) : terminalTabLines
      const isChromeKnown = tabLines !== null && !statusBlock && !showsDemoNotices
      const spaceLines = hasRail ? 0 : look === 'desktop' ? desktopSpaceLines(blankLine) : blankLine
      const top = isChromeKnown ? tabLines + spaceLines : null
      const rounding = look === 'desktop' ? DESKTOP_OFFSET_ROUNDING : 0
      const pageTop = top === null ? null : { least: top - rounding, most: top + rounding }
      noteStatusDrawn({
        pageTop,
        tops: statusTops(),
        scroll: e.props.scroll,
        now,
        isUnplacedShown: look === 'terminal',
      })
    }
    const tabView = isHelpShown
      ? helpView()
      : isStatusShown
        ? statusView()
        : tab === 'findings'
          ? findingsView()
          : tab === 'prs'
            ? prsView()
            : needsYouView()
    const tree = (
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
        {look === 'desktop' ? null : (
          <Box display="none">
            {keyBindings([...tabKeys, ...moveKeys])}
            {keyBindings(rowKeys, KEY_BINDING_SUFFIX)}
          </Box>
        )}
      </Box>
    )
    if (look === 'desktop' && paneState.focusedKey !== null) {
      const keys = focusKeys(tree)
      const hint = paneState.focusHint?.startsWith('type-')
        ? fieldKey(paneState.focusHint.slice('type-'.length))
        : paneState.focusHint
      const opensField = hint?.startsWith('type-') && keys.has(hint)
      if (!keys.has(paneState.focusedKey) || opensField) {
        const focusKey = hint && keys.has(hint) ? hint : null
        paneState.focusedKey = focusKey
        paneState.focusHint = null
        // After this hook returns, since a focus asked from inside a drawing's own hook cannot wait on it.
        if (focusKey) later($, 0, () => $.ui.focus({ requestId: PANE, key: focusKey }))
      }
    }

    return tree
  })
}
