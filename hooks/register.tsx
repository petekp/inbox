import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  ModelCompleteResult,
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
  OldPresence,
  PrViews,
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
  placed,
  cutOffTurn,
  withNewPrRefs,
  type SentBy,
} from './session-turns'
import { emptySession, upgradeSession, type SavedSession } from './session-files'
import { pressOn, recorded, pruned, type SendOutcome } from './session-presses'
import { sessionView, showsRunningMark, type SessionView } from './session-view'
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
import { runUpdates } from './session-host'
import { fetchPrs as fetchSessionPrs, isPrFetchDue } from './host-prs'
import { refreshStatus, type StatusCall, type StatusRecords, type RecordFiles } from './status-records'
import { startPress, wakeForDone as wakeSessionForDone } from './host-press'
import type { Ask, CallReport, CatchUpReply, SessionHost } from './session-host'
import { SESSION_VERSION } from './session-version'
import { demoView, isDemoCopy } from './demo'
import { claudeTasksAfter } from './host-tasks'
import { noteDialog } from './dialogs'
import { isPrPress, pressRowId, type Applied, type PrPress } from './pr-press'
import { openPrViews } from './pr-views'
import { prMarkId, threadSentIn } from './pr-rows'
import { failingChecks, prRefs, prNeedsYou, waitingThreads } from './prs'
import { EMPTY, KEPT_SESSIONS, isBlankLedger } from './ledger'
import { closeItem } from './ledger-close'
import { readKind, tasksRunBy } from './reply-parse'
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
import { branchIn, GH_TIMEOUT_MS, ghIn, TIMED_OUT_CODE, UNSTARTABLE_CODE } from './gh'
import type { Run } from './gh'
import { CLEARED_TOKENS, delegatesInHerdr, HERDR_CHECK_MS, herdrTokens } from './herdr'
import { ago, cellWidth, turnReply } from './text'
import { COMPARE_PAGE_FILE } from './press-messages'
import { demoAfterPress, demoReplied, demoSent, type DemoSent } from './press-effects'
import { isPressConfirmed, type Effect } from './press-reducer'
import { openTarget, type PathProbe } from './open-targets'
import type { RowPress } from './presses'
import { footerStatus } from './view'
import { DOT, NEEDS_YOU_GROUPS, settledRowIds, allRows, type RowView } from './rows'
import { isResumable, RESUME_TEXT, stopFix, stopText, DEMO_NOTICE, bannerOf, NEXT_BUILD_MARK } from './banners'
import {
  drawnLists,
  rowKeyPlan,
  statusKeyRows,
  statusSelected,
  rowsIn,
  firstWaiting,
  keptOpen,
  rowAfterClose,
  type PlannedKey,
} from './action-plan'
import {
  isRowTab,
  isShownTab,
  LISTED_TABS,
  screenTabOf,
  shownTabs,
  drawnTabOf,
  tabBadge,
  inboxCommandText,
  type ShownTab,
} from './tabs'
import {
  heldReplies,
  isGuarded,
  PERMISSION_FALLBACK_DELAY_MS,
  PRESS_GUARD_MS,
  QUEUED_AFTER_MS,
  compareEndsAt,
  SETTLED_MS,
  keptDiscards,
  type Holds,
} from './timing'
import { helpKeys } from './help'
import { agentTools } from './tools'
import type { AgentTool } from './tools'
import type { ToolAnswer } from './tools'
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
import { DESKTOP_ROW_PAD, DESKTOP_WIDE_AT, INLINE_RAIL_AT, RAIL_GUTTER, TAB_PAD } from './pane-sizes'
import { lookOf, paletteFor } from './palettes'
import { animateRunningMarks } from './running-mark-timer'
import { type TerminalSpan } from './terminal-text'
import {
  FOLD_KINDS,
  lastUndoEnd,
  NO_CURSOR,
  NO_SELECTION,
  type PendingUndoScroll,
  RESIZE_SCROLL_MS,
  sameCursor,
  selectedIndex,
  settledLayoutId,
  settledScrollKey,
  type Showing,
  type Shown,
  tabRowIds,
  tabWaits,
  UNDO_REDRAW_STEPS,
} from './pane-selection'
import {
  type Action,
  ACTION_GLYPHS,
  COPY_FAILURES,
  fieldKey,
  focusHintFor,
  focusKeys,
  followUpPresses,
  type KeyAction,
  openedField,
  openFields,
  paneHasKeys,
} from './pane-keys'
import {
  arrived,
  forgetStored,
  messageText,
  noteStored,
  settleRewrite,
  stored,
  uncertainRecord,
  withLostSendsUncertain,
} from './mod-delivery'
import {
  askedCalls,
  callKey,
  childRefOf,
  delegateWaits,
  endedAgentOf,
  endedCallRan,
  HOST_TASK_TOOLS,
  isActivityWorthSaving,
  isHerdrCheckDue,
  MAX_PERSON_LINES,
  noteRanCall,
  permissionText,
  reportToHerdr,
  spawnedBy,
  startedTaskOf,
  toolRecord,
  workflowTasks,
} from './mod-records'
import {
  AWAY_MS,
  CAN_CATCH_UP,
  type Changed,
  conversation,
  currentOwner,
  cutOffUpdate,
  DESKTOP_APP_ENTRYPOINTS,
  drawnSession,
  isCurrent,
  isLockHeld,
  LOCK_RETRY_WAITS_MS,
  MAX_TRIES,
  type ModSession,
  NO_SESSION,
  type Owner,
  PR_POLL_MS,
  PRESENT,
  prunedSaves,
  resultsOrder,
  type SavedRecord,
  savedRevisions,
  savesBySession,
  sessionKey,
  track,
  updating,
  withoutRowActions,
} from './mod-sessions'
import { cancelUndoScroll, mod, paneState, sessionState, suspendUndoReveal } from './mod-state'
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

const TAB = atom({ plugin: 'inbox', key: 'tab' } as const, 'needsYou' as Tab)
/**
 * The page tab shown in place of `TAB`, or null while a row tab shows. Kept apart from `TAB` so a build that
 * does not know the page still reads a row tab there.
 */
const PAGE = atom({ plugin: 'inbox', key: 'page' } as const, null as PageTab | null)
const SELECTION = atom({ plugin: 'inbox', key: 'selection' } as const, NO_SELECTION)
/** The Status row whose keys work, by id, as `statusSelected` resolves it. */
const STATUS_SELECTION = atom({ plugin: 'inbox', key: 'statusSelection' } as const, null as string | null)
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
/** Switching tabs or closing the pane closes Help. */
const IS_HELP_SHOWN = atom({ plugin: 'inbox', key: 'isHelpShown' } as const, false)
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

function resetTurn() {
  sessionState.stepTexts = []
  sessionState.turnBox = null
  sessionState.isDialogDismissed = false
}

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
      inOrder: fn => resultsOrder.run(owner.id, fn),
      records: recordsOf($, owner),
    })
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
  sessionState.savedWrites++
  // The read, the change and the write run in the save queue, so two changes to one saved session cannot both
  // start from the same read.
  // A retry reads again, so it cannot write over a save another process made meanwhile.
  const changed = sessionState.saving.then(() =>
    whileLockHeld($, async (): Promise<Changed> => {
      const saved = await readSaved($, id)
      if (!saved?.session) return { before: emptySession(), after: emptySession(), isDrawn: false }
      const before = upgradeSession(saved.session)
      const result = await change(before)
      if (result === before) return { before, after: before, isDrawn: false }
      const after = pruned({ ...result, heldRows: [], shownSince: null })
      await $.store.set(sessionKey(id), { version: SESSION_VERSION, savedAt: saved.session.savedAt, ...after })

      return { before, after, isDrawn: false }
    }).catch((error: unknown): Changed => {
      if (!isLockHeld(error)) throw error
      logSaveFailure($, id, error)
      return { before: emptySession(), after: emptySession(), isDrawn: false }
    }),
  )
  const write = changed.then(() => undefined)
  sessionState.saving = write.catch(() => undefined)
  track(id, write)

  return changed
}

/** Runs `write`, and again after each wait in `LOCK_RETRY_WAITS_MS` while the store's lock is held. */
async function whileLockHeld<T>($: EngineInterface, write: () => Promise<T>): Promise<T> {
  for (const ms of LOCK_RETRY_WAITS_MS) {
    try {
      return await write()
    } catch (error) {
      if (!isLockHeld(error)) throw error
      await $.clock.sleep(ms)
    }
  }
  return write()
}

function logSaveFailure($: EngineInterface, id: string, error: unknown) {
  $.ui.log(`inbox: saving session ${id} failed: ${error instanceof Error ? error.message : String(error)}`, {
    to: 'debug',
  })
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
  const setAndPrune = Promise.all([sessionState.saving, $.clock.now()]).then(async ([, savedAt]) => {
    if (s.revision < (savedRevisions.get(generation) ?? 0)) return
    await whileLockHeld($, () => $.store.set(key, { version: SESSION_VERSION, savedAt, ...session }))
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
    await Promise.all(
      [...stale, ...keys.filter(k => k.startsWith('p:'))].map(old => whileLockHeld($, () => $.store.delete(old))),
    )
    prunedSaves.add(generation)
  })
  const write = setAndPrune.catch((error: unknown) => {
    // The session stays drawn, and the conversation's next save writes it whole.
    if (!isLockHeld(error)) throw error
    logSaveFailure($, owner.id, error)
  })
  sessionState.saving = write.catch(() => undefined)
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

const MODEL = 'sonnet'

/** The engine does not say which model answered. */
function callReport(r: ModelCompleteResult): CallReport {
  if (r.isAnswered) return { model: MODEL }
  const error = r.reason === 'api-error' ? `api-error ${r.status ?? 'with no response'}: ${r.error}` : r.reason

  return { model: MODEL, error }
}

/** Calls the inbox model, reports the call, and returns the answer. */
async function askInboxModel(
  $: EngineInterface,
  prompt: string,
  system: string,
  timeoutMs: number,
  report: Parameters<Ask>[2],
): Promise<string | null> {
  const r = await $.model.complete({
    model: MODEL,
    system: [{ text: system, cache: true }],
    prompt,
    maxTokens: 1600,
    effort: 'low',
    timeoutMs,
  })
  report?.(callReport(r))
  return r.isAnswered ? r.text : null
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

/** The folder a next build keeps its Status call records in, under Claude Code's configuration folder. */
async function recordsFolder($: EngineInterface): Promise<string | null> {
  const home = await $.env.get('HOME')
  const config = (await $.env.get('CLAUDE_CONFIG_DIR')) || (home ? `${home}/.claude` : null)

  return config ? `${config}/plugins/data/inbox/overview-calls` : null
}

function statusRecords($: EngineInterface, folder: string, owner: Owner): StatusRecords {
  return { host: 'claude-code', folder, session: owner.id, files: recordFiles($) }
}

function pathProbe($: EngineInterface): PathProbe {
  return {
    stat: async path => {
      if (!(await $.fs.exists(path))) return null
      const stat = await $.fs.stat(path)
      return { isFile: () => stat.kind === 'file' }
    },
    isExecutable: async path => (await $.process.run(['test', '-x', path])).exitCode === 0,
  }
}

async function perform(
  $: EngineInterface,
  effect: Extract<Effect, { kind: 'open' | 'copy' }>,
  surface: UiPressArgument['surface'],
): Promise<string | null> {
  try {
    if (effect.kind === 'open') {
      const home = (await $.env.get('HOME')) ?? ''
      return await openTarget(processRun($), pathProbe($), effect.target, conversation.root, home)
    }
    const r = await $.ui.copy({ text: effect.text, surface })
    return r.isCopied ? null : COPY_FAILURES[r.reason]
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/**
 * `$.process.run` as the shared `Run`. It rejects when the command cannot start, and also when it is still running at
 * the timeout, with no code to tell them apart. A rejection that comes `timeoutMs` or more after the call is the
 * timeout's; one that comes sooner is a command that could not start.
 */
function processRun($: EngineInterface): Run {
  return async (args, { cwd, timeoutMs, env }) => {
    const startedAt = await $.clock.now()
    try {
      const r = await $.process.run(args, { cwd, timeoutMs, env })

      return { code: r.exitCode, stdout: r.stdout, stderr: r.stderr }
    } catch (err) {
      const isTimedOut = (await $.clock.now()) - startedAt >= timeoutMs

      return {
        code: isTimedOut ? TIMED_OUT_CODE : UNSTARTABLE_CODE,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

async function isGhUnstartable($: EngineInterface): Promise<boolean> {
  const r = await processRun($)(['gh', '--version'], { cwd: conversation.root, timeoutMs: GH_TIMEOUT_MS })

  return r.code === UNSTARTABLE_CODE
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
    ask: (prompt, system, report) => askInboxModel($, prompt, system, 45_000, report),
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
      run: (_s, _bin, onUnstartable) => ghIn(processRun($), 'gh', conversation.root, onUnstartable),
      noteMissing: opts.onGhMissing,
    },
    settleWindowMs: opts.settleWindowMs,
    comparePage: comparePagePath($),
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

/** At `expiresAt`, redraws the pane and runs that Undo's end work. On the terminal, one loop redraws to the last end. */
function redrawWhileUndoLasts($: EngineInterface, expiresAt: number) {
  const ends = paneState.undoEnds
  if (ends.has(expiresAt)) return
  ends.add(expiresAt)
  const redrawAll = () => Promise.all([redraw($), update($, DEMO, d => d && { ...d })])
  // Desktop redraws once, when Undo ends: while the terminal's steps redrew every 213 ms there, clicks on the
  // pane's Buttons, Undo among them, did nothing.
  if (paneState.paneLook === 'terminal' && !paneState.isUndoLoopRunning) {
    paneState.isUndoLoopRunning = true
    void (async () => {
      const stepMs = Math.ceil(SETTLED_MS / UNDO_REDRAW_STEPS)
      try {
        while ((await $.clock.now()) + stepMs < Math.max(...ends)) await $.clock.sleep(stepMs).then(redrawAll)
      } finally {
        paneState.isUndoLoopRunning = false
      }
    })().catch(() => undefined)
  }
  later($, 0, async () => {
    await $.clock.sleep(Math.max(0, expiresAt - (await $.clock.now())))
    ends.delete(expiresAt)
    await redrawAll()
    await openLeftRows($)
    await finishPendingUndoScroll($)
  })
}

function later($: EngineInterface, waitMs: number, run: () => unknown) {
  void (async () => {
    await $.clock.sleep(waitMs)
    await run()
  })().catch(() => undefined)
}

/** Redraws when the soonest Compare press reaches its limit, then waits for the next one. */
async function redrawAtCompareEnd($: EngineInterface) {
  const { lastActions, now } = await drawnState($)
  const at = compareEndsAt(lastActions, now)
  if (at === null || (paneState.compareRedrawAt !== null && paneState.compareRedrawAt <= at)) return
  paneState.compareRedrawAt = at
  later($, at - now, async () => {
    paneState.compareRedrawAt = null
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

/** The Status call after a catch-up, over the whole transcript. */
function catchUpStatus($: EngineInterface, owner: Owner, transcript: string): StatusCall {
  return {
    exchange: { kind: 'catch-up', conversation: transcript },
    ask: async (prompt, system, report) => (isCurrent(owner) ? askInboxModel($, prompt, system, 90_000, report) : null),
  }
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
  // The Status call reads the transcript.
  const statusCall = transcript ? catchUpStatus($, owner, transcript) : null
  const forked = await $.model.fork({ prompt: catchUpPrompt(CLAUDE_CODE, ledger, shown) })
  if (!isCurrent(owner)) return { kind: 'failed' }
  if (forked.isAnswered) return { kind: 'reply', text: forked.text, source: null, statusCall }
  // A fork has nothing to read until this process sends its first request,
  // as after a resume. The model then reads the transcript instead, uncached.
  if (forked.reason !== 'nothing-to-fork') return { kind: 'failed' }
  if (!transcript) return { kind: 'unreadable' }
  const prompt = transcriptCatchUpPrompt(ledger, shown, transcript)
  const text = await askInboxModel($, prompt, systemText(CLAUDE_CODE), 90_000, undefined)
  if (!isCurrent(owner)) return { kind: 'failed' }

  return text === null ? { kind: 'failed' } : { kind: 'reply', text, source: transcript, statusCall }
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
  return mod.statusRecordsFolder === null ? undefined : statusRecords($, mod.statusRecordsFolder, owner)
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
  tool: AgentTool,
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
  paneState.paneClosesOnEscape = !isFieldOpen
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
 * Starts a look while the Status shows in the pane, and ends it when it stops showing there. Both are
 * idempotent, so every place that opens, closes or changes the pane's page can call it, after `syncShown`. The sample
 * leaves the real session's look alone. `isOpen` is whether the pane shows, when the caller knows.
 */
async function syncLook($: EngineInterface, isOpen?: boolean) {
  if (await read($, DEMO)) return
  const [page, isPaneOpen, now] = await Promise.all([readPage($), isOpen ?? isPaneShown($), $.clock.now()])
  const isShown = isPaneOpen && page === 'overview'
  await commit($, currentOwner(), s => withLook(s, isShown, now)).catch(() => undefined)
  followDelegates($, isShown)
}

/**
 * Asks Herdr about the running delegates each `HERDR_CHECK_MS` while the Status shows, and once as it starts to
 * show, so a delegate's row follows Herdr while this session waits. The first tick after the Status stops showing
 * stops the timer.
 */
function followDelegates($: EngineInterface, isShown: boolean) {
  if (!isShown) {
    paneState.herdrCheckTimer?.cancel()
    paneState.herdrCheckTimer = null
    return
  }
  void checkDelegates($).catch(() => undefined)
  paneState.herdrCheckTimer ??= $.clock.every(HERDR_CHECK_MS, () => {
    void (async () => {
      const isStillShown = (await readPage($)) === 'overview' && (await isPaneShown($))
      if (isStillShown && !(await read($, DEMO))) return checkDelegates($)
      paneState.herdrCheckTimer?.cancel()
      paneState.herdrCheckTimer = null
    })().catch(() => undefined)
  })
}

async function checkDelegates($: EngineInterface) {
  const owner = currentOwner()
  if (!isHerdrCheckDue(owner.id, await $.clock.now())) return
  const states = await read($, SESSION).then(s => delegatesInHerdr(upgradeSession(s).ledger.overview, processRun($)))
  if (!states) return
  const at = await $.clock.now()
  await commit($, owner, s => statusChanged(s, o => delegatesSettled(o, states, at)))
}

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
  if (closesOnEscape === paneState.paneClosesOnEscape) return
  paneState.paneClosesOnEscape = closesOnEscape
  if (!(await $.ui.panes()).some(p => p.id === PANE)) return
  await $.ui.open({ id: PANE, title: 'Inbox', ...(closesOnEscape ? { closeOnEscape: true as const } : {}) })
}

async function openTopRow($: EngineInterface) {
  const [{ view, lastActions }, tab] = await Promise.all([drawnState($), readRowTab($)])
  if (tab === null) return
  const prViews = openPrViews(view.prs.drawn)
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
  if (isWithoutKeys === (paneState.fieldWithoutKeys === id)) return
  paneState.fieldWithoutKeys = isWithoutKeys ? id : null
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

  return page !== null && drawnTabOf(page, mod.isNextBuild) === page ? page : null
}

/** The shown row tab; null while the Status page shows, where no row is drawn, selected or scrolled to. */
async function readRowTab($: EngineInterface): Promise<Tab | null> {
  const [page, tab] = await Promise.all([readPage($), read($, TAB)])

  return page === null ? tab : null
}

async function showTab($: EngineInterface, tab: ShownTab) {
  cancelUndoScroll()
  await update($, IS_HELP_SHOWN, () => false)
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

async function select($: EngineInterface, tab: Tab, id: string, index: number, scroll = true) {
  if (scroll) {
    if (paneState.pendingUndoScroll && paneState.pendingUndoScroll.tab === tab) suspendUndoReveal()
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

async function selectStatusRow($: EngineInterface, id: string) {
  await update($, STATUS_SELECTION, () => id)
  await scrollToKey($, `status-${id}`, 'nearest')
}

async function scrollToRow($: EngineInterface, id: string) {
  await scrollToKey($, `view-${id}`, paneState.isInlinePane ? 'start' : 'nearest')
}

async function revealPendingUndo($: EngineInterface): Promise<boolean> {
  const pending = paneState.pendingUndoScroll
  if (!pending || !pending.revealUndo || !paneState.isInlineTerminalPane || pending.sessionId !== conversation.id)
    return false
  const [tab, selection, drawn] = await Promise.all([readRowTab($), read($, SELECTION), drawnState($)])
  if (paneState.pendingUndoScroll !== pending || tab === null) return false
  if (tab !== pending.tab || !sameCursor(selection[tab], pending.cursor) || drawn.now >= pending.expiresAt) return false
  const prs = drawn.view.prs.drawn
  const key = settledScrollKey(
    pending.key,
    settledLayoutId(tab, drawn.view, prs, drawn.lastActions, drawn.notes, drawn.now, paneState.terminalInlineSize),
  )
  return scrollToKey($, key, pending.block, () => paneState.pendingUndoScroll === pending && pending.revealUndo, 5)
}

async function keepUndoVisible($: EngineInterface, key: string, block: UiScrollBlock, at: number, revision: number) {
  if (revision !== paneState.undoScrollRevision) return
  const [tab, selection] = await Promise.all([readRowTab($), read($, SELECTION)])
  if (revision !== paneState.undoScrollRevision || tab === null) return
  const pending: PendingUndoScroll = {
    key,
    tab,
    cursor: selection[tab],
    block,
    expiresAt: at + SETTLED_MS,
    sessionId: conversation.id,
    revealUndo: true,
  }
  paneState.pendingUndoScroll = pending
  await revealPendingUndo($)
}

async function finishPendingUndoScroll($: EngineInterface) {
  const pending = paneState.pendingUndoScroll
  if (!pending) return
  const revision = paneState.undoScrollRevision
  const [tab, selection, drawn] = await Promise.all([readRowTab($), read($, SELECTION), drawnState($)])
  if (paneState.pendingUndoScroll !== pending || revision !== paneState.undoScrollRevision) return
  const cursor = tab === null ? NO_CURSOR : selection[tab]
  if (tab !== null && tab === pending.tab && paneState.isInlineTerminalPane && conversation.id === pending.sessionId) {
    const prs = drawn.view.prs.drawn
    const openId =
      cursor.id ??
      (cursor.openedAt === 0 ? firstWaiting(tabWaits(tab, drawn.view, openPrViews(prs), drawn.lastActions)) : null)
    const isSettling = drawn.now < pending.expiresAt
    const baseKey = isSettling && pending.revealUndo ? pending.key : openId ? `view-${openId}` : null
    const block = isSettling && pending.revealUndo ? pending.block : 'start'
    if (baseKey) {
      const key = settledScrollKey(
        baseKey,
        settledLayoutId(tab, drawn.view, prs, drawn.lastActions, drawn.notes, drawn.now, paneState.terminalInlineSize),
      )
      await scrollToKey(
        $,
        key,
        block,
        () => paneState.pendingUndoScroll === pending && revision === paneState.undoScrollRevision,
        5,
      )
    }
  }
  if (
    drawn.now >= pending.expiresAt &&
    paneState.pendingUndoScroll === pending &&
    revision === paneState.undoScrollRevision
  )
    paneState.pendingUndoScroll = null
}

async function scrollToOpenRow($: EngineInterface, tab: Tab, surface?: RenderSurface) {
  const revision = paneState.undoScrollRevision
  if (surface !== 'desktop' && (await revealPendingUndo($))) return
  if (revision !== paneState.undoScrollRevision) return
  if (paneState.isInlinePane) {
    const [selection, { view, lastActions }] = await Promise.all([read($, SELECTION), drawnState($)])
    const prViews = openPrViews(view.prs.drawn)
    const cursor = selection[tab]
    const id = cursor.id ?? (cursor.openedAt === 0 ? firstWaiting(tabWaits(tab, view, prViews, lastActions)) : null)
    if (revision !== paneState.undoScrollRevision) return
    if (id !== null) {
      await scrollToKey($, `view-${id}`, 'start', () => revision === paneState.undoScrollRevision)
      return
    }
  }
  if (revision !== paneState.undoScrollRevision) return
  await $.ui.scroll({ in: PANE, to: 'start' }).catch(() => undefined)
}

async function selectClicked($: EngineInterface, id: string) {
  const [{ view, now }, tab, selection] = await Promise.all([drawnState($), readRowTab($), read($, SELECTION)])
  if (tab === null) return
  const prViews = openPrViews(view.prs.drawn)
  const index = tabRowIds(view, prViews)[tab].indexOf(id)
  if (index < 0 || isGuarded(selection[tab].openedAt, now)) return
  // The Client leaves the drawing as its row opens, so the focus repair moves the focus to the row's first action.
  paneState.focusedKey = `select-${id}`
  paneState.focusHint = null
  await select($, tab, id, index)
}

/** A Status row's View press: Asks shows with the ask selected and in view. */
async function showAsk($: EngineInterface, askId: string) {
  const { view } = await drawnState($)
  const prViews = openPrViews(view.prs.drawn)
  const index = Math.max(0, tabRowIds(view, prViews).needsYou.indexOf(askId))
  paneState.focusedKey = `select-${askId}`
  paneState.focusHint = null
  await select($, 'needsYou', askId, index, false)
  await showTab($, 'needsYou')
  await scrollToRow($, askId)
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

async function openLeftRows($: EngineInterface) {
  const { view, now } = await drawnState($)
  const prViews = openPrViews(view.prs.drawn)
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
  const { seen, added } = recordRows(
    paneState.recordedRows?.isDemo === isDemo ? paneState.recordedRows.ids : {},
    current,
  )
  paneState.recordedRows = { isDemo, ids: seen }

  return added
}

async function jumpTo($: EngineInterface, tab: Tab) {
  cancelUndoScroll()
  await writeRowTab($, tab)
  await update($, SELECTION, s => ({ ...s, [tab]: NO_CURSOR }))
  await scrollToOpenRow($, tab)
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
  const prViews = openPrViews(prs)
  const ids = tabRowIds(view, prViews)
  if (isOpening) paneState.recordedRows = null
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
    if (paneState.isInlinePane && keeps.some(k => k.t === tab)) void scrollToOpenRow($, tab)
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
  if (mod.nextFetchFindsBranchPr !== null) {
    mod.nextFetchFindsBranchPr ||= findsBranchPr
    return mod.fetchingPrs
  }
  mod.nextFetchFindsBranchPr = findsBranchPr
  mod.fetchingPrs = mod.fetchingPrs
    .then(() => {
      const finds = mod.nextFetchFindsBranchPr ?? false
      mod.nextFetchFindsBranchPr = null
      return fetchPrsNow($, finds)
    })
    .catch(() => undefined)

  return mod.fetchingPrs
}

async function fetchPrsNow($: EngineInterface, findsBranchPr: boolean) {
  const owner = currentOwner()
  await markFetching($, true)
  try {
    await fetchSessionPrs(hostOf($, owner), findsBranchPr)
  } finally {
    mod.prFetchEndedAt = await $.clock.now()
    // Fetches run one at a time across conversations, so the drawn session reads whether one still runs.
    await markFetching($, mod.nextFetchFindsBranchPr !== null)
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
  const mayStayOnRow = isPrPress(p)
    ? ['pr-open', 'pr-refresh', 'thread-open', 'log'].includes(p.action)
    : p.action === 'step'
  const undoRevision = mayStayOnRow ? suspendUndoReveal() : cancelUndoScroll()
  const rowId = pressRowId(p)
  if (p.action !== 'undo' && !rowId.startsWith('pr:')) await keepPressedOpen($, rowId)
  const wasWaiting = (await shownWaits($)).rows.some(r => r.id === rowId && r.isWaiting)
  if (await read($, DEMO)) return runDemoPress($, p, wasWaiting, undoRevision, surface)
  const now = await $.clock.now()
  const draft = !isPrPress(p) && p.action === 'type' ? (await read($, DRAFTS))[p.id] : undefined
  const keepReply = () =>
    !isPrPress(p) && p.action === 'type'
      ? update($, DRAFTS, d => (d[p.id] ? d : { ...d, [p.id]: { text: p.text, since: draft?.since ?? now } }))
      : undefined
  if (!isPrPress(p) && p.action === 'type') {
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
  const canRevealUndo = undoKey !== null && undoRevision === paneState.undoScrollRevision
  const { isMoved, undoBlock } = await openAfterClose($, rowId, wasWaiting, canRevealUndo)
  if (canRevealUndo) await keepUndoVisible($, undoKey, undoBlock, now, undoRevision)
  if (!isPrPress(p) && p.action === 'done') later($, SETTLED_MS, () => wakeForDone($))
  if (!isPrPress(p) && p.action === 'compare') void redrawAtCompareEnd($).catch(() => undefined)
  if (!isPrPress(p) && p.action === 'undo') await selectRestored($, p.id)
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
  if (surface !== 'terminal' || !paneState.isInlineTerminalPane) return null
  const { view } = await drawnState($)
  if (isPrPress(p)) {
    if (p.action === 'pr-dismiss-merged') {
      const nearest = view.prs.drawn.filter(x => x.state.is === 'settled' && x.state.canUndo).at(-1)
      return nearest ? `undo-${prMarkId(nearest.pr.ref)}` : null
    }
    if (p.action !== 'pr-dismiss') return null
    return view.prs.drawn.some(x => x.pr.ref === p.ref && x.state.is === 'settled') ? `undo-${pressRowId(p)}` : null
  }
  const row = allRows(view).find(r => r.id === p.id)
  return row?.state.is === 'settled' && row.actions.some(a => a.press.action === 'undo')
    ? `undo-${pressRowId(p)}`
    : null
}

async function shownWaits($: EngineInterface) {
  const [{ lastActions, view }, tab] = await Promise.all([drawnState($), readRowTab($)])
  const prViews = openPrViews(view.prs.drawn)
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
  if (!isPrPress(p) && p.action === 'type') await update($, TYPING, t => (t === p.id ? null : t))
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
  if (!isPrPress(p) && p.action === 'type')
    await update($, DRAFTS, d => {
      if ('stale' in pressed) return { ...d, [p.id]: { text: p.text, since: d[p.id]?.since ?? now } }
      const { [p.id]: _sent, ...rest } = d
      return rest
    })
  if (!('stale' in pressed) && !isPrPress(p) && p.action === 'undo') await selectRestored($, p.id)
  if (!('stale' in pressed)) {
    const undoKey = await undoKeyAfterPress($, p, surface)
    const canRevealUndo = undoKey !== null && undoRevision === paneState.undoScrollRevision
    const { undoBlock } = await openAfterClose($, rowId, wasWaiting, canRevealUndo)
    if (canRevealUndo) await keepUndoVisible($, undoKey, undoBlock, now, undoRevision)
  }
  if ('stale' in pressed || pressed.effects.length > 0)
    later($, SETTLED_MS, () => update($, DEMO, d => d && { ...d, ...(reply ? demoReplied(d, reply) : {}) }))
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
  mod.statusRecordsFolder = mod.isNextBuild ? await recordsFolder($).catch(() => null) : null
}

async function initializeInbox($: EngineInterface) {
  // A hot reload keeps state an older build wrote. Draws start once isOn is set, and they read the current shape and
  // the tabs that the next-build mark decides.
  await Promise.all([upgradeState($), readVersion($)])
  mod.isOn = true
  mod.toolsRefused = false
  paneState.compareRedrawAt = null
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
  const revision = ++sessionState.loadRevision
  return prepareConversation($, id, revision, forkedFrom)
}

async function prepareConversation($: EngineInterface, id: string, revision: number, forkedFrom?: string) {
  const writesAtRead = sessionState.savedWrites
  const [sessionRoot, saved] = await Promise.all([$.session.root(), readSettled($, id)])
  if (revision !== sessionState.loadRevision) return
  const applying = sessionState.applyingConversation.then(async () => {
    if (revision !== sessionState.loadRevision) return
    // A write to a saved session after the read above, such as a refused Done message, is read again.
    const latest = writesAtRead === sessionState.savedWrites ? saved : await readSettled($, id)
    // A fork continues its parent's inbox, so a new id with no saved state starts from the parent's.
    const parent = latest?.session || !forkedFrom ? null : await readSettled($, forkedFrom)
    await applyConversation($, id, revision, sessionRoot, latest, parent?.session)
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
  if (revision !== sessionState.loadRevision) return
  const isLoading = () => revision === sessionState.loadRevision && conversation.id === id
  cancelUndoScroll()
  sessionState.stopGeneration++
  sessionState.resuming = null
  conversation.id = id
  conversation.root = sessionRoot
  paneState.recordedRows = null
  sessionState.isReadingAgain = false
  // A reload stops any update the previous load had running, and state outlives
  // it, so an update in flight at load was cut off: record it as failed.
  // The theme read at the start is gone after /clear, so each conversation reads it.
  const [current] = await Promise.all([upgradeState($), syncTheme($)])
  const loadedAt = await $.clock.now()
  // The pane now shows another conversation, so it starts a new showing.
  await syncShown($, { since: loadedAt })
  await replaceDrawn($, s => statusChanged(cutOffTurn(cutOffUpdate(s)), o => childrenCutOff(o, loadedAt)))
  if (revision !== sessionState.loadRevision) return
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
  if (sessionState.isReadingAgain) return
  sessionState.isReadingAgain = true
  const id = conversation.id
  if ((await read($, UNREADABLE)) !== id) {
    sessionState.isReadingAgain = false
    return
  }
  await redrawPane($)
  const saved = await readSaved($, id)
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
    if (mod.isOn && e.session_id !== conversation.id)
      await loadConversation($, e.session_id, e.source === 'fork' ? conversation.id : undefined)

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
        publishStatus($, true),
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
        forgetRowState($),
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
      const parent = sessionState.endReason === 'resume' ? conversation.id : undefined
      sessionState.endReason = null
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
      const agentId = endedAgentOf(ran.result)
      if (agentId) await noteChild($, (o, at) => childEnded(o, agentId, at))

      return ran
    }
    if (e.tool === 'Monitor' || e.tool === 'Workflow') {
      const ran = await run()
      const child = startedTaskOf(e.tool, ran.result, e.description)
      if (child) {
        if (child.kind === 'workflow' && e.tool_use_id) workflowTasks.set(e.tool_use_id, child.ref)
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
      const withSubagents = running ? statusChanged(ended, o => subagentsSettled(o, running, endedAt)) : ended
      const withDelegates = inHerdr
        ? statusChanged(withSubagents, o => delegatesSettled(o, inHerdr, endedAt))
        : withSubagents
      return root ? placed(withDelegates, root, branch) : withDelegates
    })
    if (e.reason === 'error' && !sessionState.hasStopFromError) await setStopFromLastReply($)
    void wakeForDone($).catch(() => undefined)
    void followNewRows($).catch(() => undefined)
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
    const linksNewPr = prRefs(reply).some(ref => !before.ledger.prs.includes(ref))
    const tracksPrs = after.ledger.prs.length > 0 || after.prViews.branchRef !== null
    if (linksNewPr || (tracksPrs && isPrFetchDue(after, mod.prFetchEndedAt, now)))
      void fetchPrs($, await isPrsTabShown($))

    return r
  })

  on(
    'session.append',
    { door: ['prompt', 'delivery'], origin: { kind: 'plugin', name: 'inbox' } },
    async ($, e, next) => {
      if (!mod.isOn || e.agentId) return next(e)
      const text = messageText(e.message)
      const count = noteStored(text)
      const notes = await notePrompt($, text, { match: current => arrived(current, text, count) })
      if (notes.length > 0) await appendContext($, notes)

      return next(e)
    },
  )

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

  on('ui.press', async (_$, e, next) => {
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

  on('ui.scroll', { requestId: PANE }, async (_$, e, next) => {
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
      paneState.focusedKey = e.element
      paneState.focusHint = focusHintFor(data.key)
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
    await update($, IS_HELP_SHOWN, () => false)

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
            label={sessionState.resuming?.is === 'sending' ? 'Resuming…' : 'Resume'}
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
    const [
      { prViews: prState, lastActions, notes, turns, stop, view, showsDemoNotices, isUnread, now },
      savedTab,
      savedPage,
      selection,
      theme,
      typing,
      unfolded,
      foldHover,
      isHelpShown,
      optionsShown,
      termProgram,
      statusSelection,
    ] = await Promise.all([
      drawnState($),
      read($, TAB),
      readPage($),
      read($, SELECTION),
      read($, THEME),
      read($, TYPING),
      read($, UNFOLDED),
      read($, FOLD_HOVER),
      read($, IS_HELP_SHOWN),
      read($, OPTIONS_SHOWN),
      $.env.get('TERM_PROGRAM'),
      read($, STATUS_SELECTION),
      // A redraw loop on desktop blocks clicks, as `redrawWhileUndoLasts` says.
      look === 'terminal' ? read($, RUNNING_FRAME) : null,
    ])
    const tab: Tab = isShownTab(savedTab) && isRowTab(savedTab) ? savedTab : 'needsYou'
    const isStatusShown = savedPage === 'overview'
    const shownTab: ShownTab = isStatusShown ? 'overview' : tab
    const tabList = shownTabs(mod.isNextBuild)
    if (look === 'terminal')
      animateRunningMarks(
        showsRunningMark(view, shownTab, isHelpShown, kind => unfolded.includes(kind)),
        now,
        (ms, fn) => $.clock.every(ms, fn),
        () => void update($, RUNNING_FRAME, n => n + 1).catch(() => undefined),
      )
    const undoEnd = lastUndoEnd(view)
    if (undoEnd !== null) redrawWhileUndoLasts($, undoEnd)
    // A hot reload keeps TYPING but empties openFields, so an open field takes its key and seed again here.
    if (typing !== null && !openFields.has(typing))
      openFields.set(typing, openedField(typing, (await read($, DRAFTS))[typing]))
    if (e.props.isFocused || typing !== paneState.fieldWithoutKeys) paneState.fieldWithoutKeys = null
    // Escape, or a click outside the pane, closes the field and keeps its draft, as Cancel does.
    if (isKeyboardHandedBack && typing !== null) later($, 0, () => update($, TYPING, t => (t === typing ? null : t)))
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
                : span.isDone
                  ? (pal.tone.done ?? pal.mark.done)
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

    const client: PaneClient = hasClient ? { hasClient: true, elements } : { hasClient: false, elements }
    const handlers: PaneHandlers = {
      rowKeyActions: (r, isAllShown) => rowKeyActions($, r, isAllShown),
      unlessGuarded: (rowId, press, onPress) => unlessGuarded($, rowId, press, onPress),
      sendDraft: (id, surface) => sendDraft($, id, surface),
      discardReply: id => discardReply($, id),
      updateTyping: fn => update($, TYPING, fn),
      updateDrafts: fn => update($, DRAFTS, fn),
      sendTyped: (id, text, surface) => sendTyped($, id, text, surface),
      select: (tab, id, index) => select($, tab, id, index),
      showTab: tab => showTab($, tab),
      updateHelpShown: fn => update($, IS_HELP_SHOWN, fn),
      updateUnfolded: fn => update($, UNFOLDED, fn),
      runPress: (p, surface) => runPress($, p, surface),
      readAgain: () => readAgain($),
      resume: () => resume($),
      showAsk: askId => showAsk($, askId),
    }
    const { itemRow, findingRow } = paneAskRows(
      { now, look, Text, pal, optionsShown, Box, blankLine, terminalText, inlineText },
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
    const prGroups = (isListShown ? shownPrs : [])
      .map(d => ({
        ...d,
        checks: d.state.is === 'settled' ? [] : failingChecks(d.pr).map(c => checkRow(d.pr, c)),
        threads: d.state.is === 'settled' ? [] : waitingThreads(d.pr).map(t => threadRow(d.pr, t)),
      }))
      .map(g => ({ ...g, rows: [...g.threads, ...g.checks] }))
    const prTabKeys = view.prs.tabActions.map(a => prKeyAction(a, 'tab'))
    const prOrderKeys = (view.prs.order?.changed?.actions ?? []).map(a => prKeyAction(a, 'order'))
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
    const settledIds = new Set(isListShown ? settledRowIds(allRows(view)) : [])
    const top = isListShown ? firstWaiting(tabWaits(tab, view, openPrViews(shownPrs), lastActions)) : null
    const at = selectedIndex(ids, cursor, top, id => settledIds.has(id))
    const isOpenGuarded = !isStatusShown && isGuarded(cursor.openedAt, now)
    const statusKeyRow = isStatusShown ? statusSelected(view.statusPage, statusSelection) : null
    const statusPressRows = isStatusShown ? statusKeyRows(view.statusPage) : []

    const {
      desktopColumnPt,
      desktopRowTextPt,
      desktopLabel,
      keyRow,
      keyBindings,
      keyLines,
      actionRows,
      rowActions,
      fieldActions,
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
      withDoneMark,
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
    const { listRow } = paneRows(
      {
        ...client,
        indexOf,
        at,
        Box,
        space,
        Text,
        pal,
        Input,
        typing,
        look,
        now,
        isAgeInSide,
        listColumns,
        unbroken,
        isInline,
        e,
        optionsShown,
        blankLine,
        Button,
        tab,
        settledLayout,
        columnsFor,
        gutterMark,
        toned,
        rowClientProps,
        feedbackLabel,
        pressedAge,
        withDoneMark,
        sideAge,
        withSideAge,
        unselectedLine,
        branch,
        rowActions,
        desktopRowTextPt,
        keyLines,
        keyRow,
        fieldActions,
        actionRows,
        desktopFrame,
      },
      handlers,
    )

    const shownStatus = footerStatus(
      shownTab,
      view.status,
      { isFetching: prState.isFetching, hasPrs: prViews.length > 0 },
      view.statusPage.error,
    )
    const status = shownStatus.text ?? ''

    const openIds = openRowIds(view)
    const drawnIds = new Set([...openIds.needsYou, ...openIds.findings, ...prRowIds(shownPrs)])
    const lineNote = Object.entries(notes)
      .filter(([id, n]) => !drawnIds.has(id) && now - n.at < SETTLED_MS)
      .map(([, n]) => n)
      .sort((a, b) => b.at - a.at)[0]

    const keyList = helpKeys(look, mod.isNextBuild, shownTab, statusPressRows.length > 0)
    const keyColumn = Math.max(0, ...keyList.map(k => cellWidth(k.keys))) + 2

    const { banner, tabs, rail, statusBlock, footer } = paneFrame(
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
        shownStatus,
        lineNote,
        tabText,
        termProgram,
        Button,
        tabTone,
        raiseEdge,
        raise,
        status,
        railWidth,
        hasRail,
        blankLine,
        isHelpShown,
      },
      handlers,
    )

    const { groupEmpty, groupTitle, section, sections, titleGap, closedFold, undoPlace, settledContent, settledRow } =
      paneRowParts(
        {
          ...client,
          look,
          Text,
          pal,
          Box,
          blankLine,
          isInline,
          space,
          now,
          foldHover,
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
        Button,
        stop,
        glued,
        now,
        findingEntries,
        lists,
        divided,
        listRow,
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
      prTabKeys,
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
      listRow,
      prKeyAction,
      desktopLabel,
      keyRow,
      emptyState,
      banner,
    })

    const { statusHead, statusMarkAt, fitsStatusLine, statusPageText, statusNameLine, statusFrameEdge, statusTree } =
      paneStatusLines({
        Box,
        Text,
        pal,
        look,
        listColumns,
        terminalText,
        desktopFrame,
        desktopColumnPt,
        markWidth,
        branch,
        desktopHairline,
      })
    const { statusRowLine, statusKeys, statusView } = paneStatus(
      {
        listColumns,
        look,
        Box,
        Text,
        pal,
        statusKeyRow,
        view,
        isInline,
        statusMarkAt,
        statusFrameEdge,
        statusNameLine,
        statusPageText,
        fitsStatusLine,
        statusTree,
        statusHead,
        markWidth,
        desktopHairline,
        markGlyph,
        desktopFrame,
        keyRow,
        emptyState,
        sections,
        section,
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
      section,
      groupTitle,
      sections,
      statusRowLine,
    })

    const move = (step: number) => {
      const to = Math.min(Math.max(at + step, 0), ids.length - 1)
      void select($, tab, ids[to] ?? '', to)
    }
    const canMove = !isStatusShown && !isHelpShown && (ids.length > 1 || (at < 0 && ids.length > 0))
    const moveStatus = (step: number) => {
      const from = statusPressRows.findIndex(r => r.id === statusKeyRow?.id)
      const to = statusPressRows[Math.min(Math.max(from + step, 0), statusPressRows.length - 1)]
      if (to) void selectStatusRow($, to.id)
    }
    const moveBy = (by: number) =>
      isHelpShown ? undefined : isStatusShown ? moveStatus(by) : canMove ? move(by) : undefined
    // Claude Code sends a key no Button binds to the prompt and gives it the keyboard, so the keys
    // stay bound when there is nothing to move to or close.
    const moveKeys: KeyAction[] = [
      { key: 'next', label: 'Next', hotkey: 'j', kind: 'view', onPress: () => moveBy(1) },
      { key: 'previous', label: 'Previous', hotkey: 'k', kind: 'view', onPress: () => moveBy(-1) },
    ]
    const tabKeys: KeyAction[] = tabList.map(({ id, label, hotkey }) => ({
      key: `tab-key-${id}`,
      label,
      hotkey,
      kind: 'view',
      onPress: () => void showTab($, id),
    }))

    const selectedRow = isStatusShown || isHelpShown ? undefined : rows[tab][at]
    const selectedActions = selectedRow ? rowActions(selectedRow) : null
    const closeKeysWithoutRow: KeyAction[] = ['d', 'x'].map(hotkey => ({
      key: `no-row-${hotkey}`,
      label: 'Close',
      hotkey,
      kind: 'view',
      onPress: () => undefined,
    }))
    const rowKeys = [
      ...(statusKeyRow && !isHelpShown ? statusKeys(statusKeyRow) : []),
      ...(selectedActions ? [...selectedActions.keys, ...selectedActions.more] : closeKeysWithoutRow),
      ...(tab === 'prs' && !isHelpShown ? [...prOrderKeys, ...prTabKeys] : []),
    ]

    // A pane takes a key
    // only as a Button's hotkey, so the tab keys, j, k and the selected row's keys
    // are Buttons in a hidden Box.
    const tabView = isHelpShown
      ? helpView()
      : isStatusShown
        ? statusView()
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
    if (look === 'desktop' && paneState.focusedKey !== null) {
      const keys = focusKeys(drawn)
      const hint = paneState.focusHint?.startsWith('type-')
        ? fieldKey(paneState.focusHint.slice('type-'.length))
        : paneState.focusHint
      const opensField = hint?.startsWith('type-') && keys.has(hint)
      if (!keys.has(paneState.focusedKey) || opensField) {
        const focusKey = [hint, rowKeys[0]?.key, ...keys].find((k): k is string => !!k && keys.has(k)) ?? null
        paneState.focusedKey = focusKey
        paneState.focusHint = null
        // After this hook returns, since a focus asked from inside a drawing's own hook cannot wait on it.
        if (focusKey) later($, 0, () => $.ui.focus({ requestId: PANE, key: focusKey }))
      }
    }

    return drawn
  })
}
