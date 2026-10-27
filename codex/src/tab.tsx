import { render } from 'preact'
import manifest from '../plugin/.codex-plugin/plugin.json'
import { ActionButton, RowActions, ledgerActions, Icon } from './row-actions'
import type { ComponentChildren, JSX } from 'preact'
import type { IconName } from './row-actions'

import { closedState } from '../../hooks/ledger'
import { ago, clipLabel } from '../../hooks/text'
import type { ClosedState } from '../../hooks/ledger'
import { canUndoRefused, closedMark, settledMark, versionLabel } from '../../hooks/view'
import { actionId, capitalized, isPressConfirmed, noteText, pendingResult, stepEffects } from '../../hooks/presses'
import type { Effect, RowPress } from '../../hooks/presses'
import {
  allRows,
  closedShown,
  closedTotal,
  DEMO_NOTICE,
  DOT,
  earlierLabel,
  drawnLists,
  earlierTitle,
  emptyText,
  groupEmptyText,
  entryId,
  isListedTab,
  isRowTab,
  isShownTab,
  LISTED_TABS,
  shownTabs,
  drawnTabOf,
  feedbackOf,
  feedbackText,
  markedFeedbackText,
  fieldExit,
  foldLabel,
  hasAge,
  heldReplies,
  isFailure,
  isGuarded,
  isStatusUnderActions,
  waitingCount,
  firstWaiting,
  keptOpen,
  footerStatus,
  listWaits,
  PRESS_GUARD_MS,
  rowAfterClose,
  replyHint,
  rowMark,
  rowFeedbackText,
  RUNNING_PULSE_MS,
  settledLabel,
  ROW_COPY,
  READING_TEXT,
  SETTLED_MS,
  settledIn,
  shortAgo,
  shownOptionDescriptions,
} from '../../hooks/view'
import { LEAD_GAP_PT, OVERVIEW_ROW_PAD_PT, ROW_PAD_PT } from '../../hooks/layout'
import type {
  ActionEmphasis,
  DrawnEntry,
  DrawnLists,
  Feedback,
  OverviewPage,
  OverviewRow,
  PressState,
  ReplyHolds,
  RowView,
  RowWait,
  ShownTab,
} from '../../hooks/view'
import {
  checkActions,
  checkRowText,
  PR_QUOTE_CHARS,
  splitFollowUps,
  GH_MISSING_TEXT,
  PR_GROUP_TITLES,
  PR_TONES,
  prBlockActions,
  prCheckId,
  prMarkId,
  prRowWaits,
  prsEmptyText,
  prPressEffect,
  prRefreshFailedText,
  PR_DISMISSED_LABEL,
  prThreadId,
  threadActions,
  threadRowText,
  threadSentIn,
} from '../../hooks/pr-tab'
import type { PrAction, PrPress } from '../../hooks/pr-tab'
import { commentParts, failingChecks, readableComment, readiness, threadWhere, waitingThreads } from '../../hooks/prs'
import type { Draft, Finding, PrCheck, PrThread, PrView, Tab } from '../../types'
import { ARRIVAL_TABS, followTo } from '../../hooks/arrivals'
import { parseInline } from '../../hooks/inline'
import { isShownEmpty, newRows, openRows, TAB_OF } from './arrivals'
import type { FoldGroup, Group, SeenRows } from './arrivals'
import type { TabView as View } from './core'
import type { PressReply } from './server'
import { ENTER_MS, EXIT_MS, isMoving, MOVE_MS, ROW_STATE_MS, stepRow } from './rows'
import type { RowState, RowTarget, RowTrack } from './rows'
import { PRESS_TIMEOUT_MS } from '../../hooks/session'
import { drawnSettled, POLL_MS, settledIds, settledSeen } from './settle'

type Tone = 'needsYou' | 'issue' | 'findings' | 'done' | 'error'

type Emphasis = ActionEmphasis

type Key = {
  hotkey?: string
  label: string
  emphasis: Emphasis
  isDismiss?: boolean
  icon?: IconName
  isOut?: boolean
  run: () => void
}

type Row = {
  id: string
  view?: RowView
  handle: string
  handleTone?: Tone
  /** A PR row's mark says its work is done. */
  isMarkDone?: boolean
  kind?: Finding['kind']
  lead?: string
  title: string
  meta?: string
  age?: string
  body?: JSX.Element | null
  keys: Key[]
  more: Key[]
  fold?: { note?: string }
  typing?: { hint: string; send: (text: string) => void }
  feedback: Feedback | null
}

type Entry = DrawnEntry<Row>

let view: View | null = null
let isDemo = false
let readError: string | null = null
let serverNote: { text: string; isReloadable: boolean } | null = null
let isLoadingShown = false
let isConnected = false
let initializing: Promise<boolean> | null = null
let didStart = false
type HostContext = Parameters<typeof applyHost>[0]
let hostContext: HostContext = {}
let stagedHostChanges: HostContext = {}
let pollFailures = 0
let readAt = 0
let tab: ShownTab = 'needsYou'
/** The tab drawn: the shown tab when the view's build draws it, else the build's first tab, and Asks while the view has no Overview page, as from an older server. */
function drawnTab(): ShownTab {
  const drawn = drawnTabOf(tab, view?.isNextBuild === true)

  return drawn === 'overview' && !view?.overviewPage ? 'needsYou' : drawn
}

const selection: Record<Tab, { id: string; openedAt: number; index?: number } | null> = {
  needsYou: null,
  findings: null,
  prs: null,
}
let typing: string | null = null
let focusTyping = false
const drafts = new Map<string, Draft>()
const discarded = new Map<string, number>()
const optionsShown = new Set<string>()
const unfolded = new Set<FoldGroup>()
/**
 * The latest press on its way, by row id: its request number, its pending Local result or null for a message, which
 * reads SENDING, and its action, so its button draws as out before the view says so. A reply's action is null, since
 * a reply is never out.
 */
const sending = new Map<string, { seq: number; pending: Feedback | null; action: string | null }>()
const SENDING = 'Sending…'
const errors = new Map<string, string>()
const notes = new Map<string, { text: string; at: number }>()
const copies = new Map<string, { name: string; text: string }>()
let lineNote: { text: string; at: number; isError?: boolean } | null = null
let seen = new Map<string, number>()
let rowsSeen: SeenRows = {}
const entering = new Set<string>()
const undoing = new Set<string>()
const closingFolds = new Set<FoldGroup>()
type DrawnRow = { track: RowTrack; openRow?: Row }
const drawnRows = new Map<string, DrawnRow>()
let lastLists: Lists | null = null
let requested = 0
let shown = 0
let activePresses = 0
let viewGeneration = 0

type Kept = {
  /** 2 while a page tab shows. An older page reads only version 1, so it drops the whole kept state instead of a tab it cannot draw. */
  version: 1 | 2
  isDemo: boolean
  tab: ShownTab
  selection: Record<Tab, string | null>
  typing: string | null
  /** An earlier page kept each draft as its text alone. */
  drafts: [string, Draft | string][]
  optionsShown: string[]
  /** An earlier page kept 'finding' for the one fold the Finds tab had. */
  unfolded: (FoldGroup | 'finding')[]
}
type CandidatePage = {
  initialize: () => Promise<boolean>
  activate: (kept: Kept) => void
  start: () => void
  dispose: () => void
}
type PageHandoff = {
  page: string
  root: HTMLDivElement
  aborted: boolean
  dispose?: () => void
  ready: (candidate: CandidatePage) => void
}
const KEPT_KEY = 'inbox-tab-kept'
const inboxWindow = window as Window & {
  __inboxPage?: string
  __inboxKept?: Kept
  __inboxRequestId?: number
  __inboxHandoff?: PageHandoff
}
const handoff = inboxWindow.__inboxHandoff ?? null
const root = handoff?.root ?? document.getElementById('app')!
const instanceAbort = new AbortController()
const timers = new Set<number>()
const animations = new Set<Animation>()
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer?: number }>()
let isDisposed = false
let isActive = handoff === null
if (handoff) handoff.dispose = dispose

function later(run: () => void, ms: number): number {
  if (isDisposed) return 0
  const id = window.setTimeout(() => {
    timers.delete(id)
    if (!isDisposed) run()
  }, ms)
  timers.add(id)
  return id
}

function cancelTimer(id: number | undefined) {
  if (id === undefined) return
  window.clearTimeout(id)
  timers.delete(id)
}

function dispose() {
  if (isDisposed) return
  isDisposed = true
  instanceAbort.abort()
  for (const timer of timers) window.clearTimeout(timer)
  timers.clear()
  for (const animation of animations) {
    animation.onfinish = null
    animation.oncancel = null
    animation.cancel()
  }
  animations.clear()
  for (const request of pending.values()) request.reject(new Error('Inbox page replaced'))
  pending.clear()
  render(null, root)
  if (isActive) document.body.classList.remove('still')
}

function capturedState(): Kept {
  return {
    version: isRowTab(tab) ? 1 : 2,
    isDemo,
    tab,
    selection: {
      needsYou: selection.needsYou?.id ?? null,
      findings: selection.findings?.id ?? null,
      prs: selection.prs?.id ?? null,
    },
    typing,
    drafts: [...drafts],
    optionsShown: [...optionsShown],
    unfolded: [...unfolded],
  }
}

function restoreState(incoming?: Kept) {
  let kept: Kept | null = incoming ?? inboxWindow.__inboxKept ?? null
  if (!incoming) {
    delete inboxWindow.__inboxKept
    try {
      const raw = sessionStorage.getItem(KEPT_KEY)
      sessionStorage.removeItem(KEPT_KEY)
      kept ??= raw ? (JSON.parse(raw) as Kept) : null
    } catch {}
  }
  if (kept?.version !== 1 && kept?.version !== 2) return
  isDemo = kept.isDemo
  if (isShownTab(kept.tab)) tab = kept.tab
  for (const t of ARRIVAL_TABS) {
    const id = kept.selection[t]
    selection[t] = id ? { id, openedAt: 0 } : null
  }
  typing = kept.typing
  focusTyping = typing !== null
  // A draft an earlier page kept as text began before now, so a row that closed before this page stays closed.
  for (const [id, draft] of kept.drafts)
    drafts.set(id, typeof draft === 'string' ? { text: draft, since: Date.now() } : draft)
  for (const id of kept.optionsShown) optionsShown.add(id)
  for (const g of kept.unfolded)
    for (const fold of g === 'finding' ? (['issue', 'opportunity'] as const) : [g]) unfolded.add(fold)
}

function request(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
  if (isDisposed) return Promise.reject(new Error('Inbox page replaced'))
  return new Promise((resolve, reject) => {
    const id = (inboxWindow.__inboxRequestId = (inboxWindow.__inboxRequestId ?? Date.now()) + 1)
    const timer =
      timeoutMs === undefined
        ? undefined
        : later(() => {
            if (pending.delete(id)) reject(new Error(`The inbox did not answer in ${Math.round(timeoutMs / 1000)} s`))
          }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*')
  })
}

window.addEventListener(
  'message',
  e => {
    if (isDisposed) return
    const m = e.data
    if (!m || m.jsonrpc !== '2.0') return
    if (m.id != null && !m.method && pending.has(m.id)) {
      const p = pending.get(m.id)!
      pending.delete(m.id)
      cancelTimer(p.timer)
      if (m.error) p.reject(m.error)
      else p.resolve(m.result)
      return
    }
    if (m.method === 'ui/notifications/host-context-changed') {
      if (isActive) applyHost(m.params ?? {})
      else stagedHostChanges = mergeHostContext(stagedHostChanges, m.params ?? {})
    }
    if (!isActive) return
    if (m.id != null && m.method) parent.postMessage({ jsonrpc: '2.0', id: m.id, result: {} }, '*')
  },
  { signal: instanceAbort.signal },
)

function applyHost(ctx: { theme?: string; styles?: { variables?: Record<string, string> } }) {
  if (isDisposed || !isActive) return
  if (ctx.theme) document.documentElement.dataset.theme = ctx.theme
  for (const [k, v] of Object.entries(ctx.styles?.variables ?? {})) document.documentElement.style.setProperty(k, v)
}

function mergeHostContext(current: HostContext, next: HostContext): HostContext {
  return {
    ...current,
    ...next,
    styles: {
      ...current.styles,
      ...next.styles,
      variables: { ...current.styles?.variables, ...next.styles?.variables },
    },
  }
}

async function callTool<T>(name: string, args: unknown = {}, timeoutMs?: number): Promise<T> {
  const r = (await request('tools/call', { name, arguments: args }, timeoutMs)) as
    { structuredContent?: T; isError?: boolean; content?: { text?: string }[] } | undefined
  if (isDisposed) throw new Error('Inbox page replaced')
  if (!r || r.isError || r.structuredContent === undefined)
    throw new Error((r?.isError && r.content?.[0]?.text) || 'The answer had nothing to show')

  return r.structuredContent
}

function applyView(next: View, seq: number) {
  if (isDisposed || seq < shown) return
  shown = seq
  readError = null
  pollFailures = 0
  readAt = Date.now()
  const before = seen
  seen = settledSeen(seen, settledIds(next), Date.now())
  if ([...seen.keys()].some(id => !before.has(id))) drawIn(SETTLED_MS)
  view = next
  for (const { pr, isSettled } of next.prs.drawn)
    if (isSettled) drawIn(Math.max(0, SETTLED_MS - (next.at - (next.lastActions[prMarkId(pr.ref)]?.at ?? next.at))))
  const isOpening = LISTED_TABS.every(t => rowsSeen[t.id] === undefined)
  const rows = newRows(rowsSeen, next, next.isFetchingPrs)
  rowsSeen = rows.seen
  const added = [...rows.added.needsYou, ...rows.added.findings]
  for (const id of added) entering.add(id)
  for (const { id: t } of LISTED_TABS) {
    const id = !selection[t] && rows.added[t].length > 0 ? keptOpen(tabWaits(next, t), rows.added[t]) : null
    if (id) selection[t] = { id, openedAt: 0 }
  }
  follow(next, isOpening ? openRows(next) : rows.added)
  draw()
}

function follow(v: View, added: Record<Tab, string[]>) {
  const shownTab = drawnTab()
  if (!isRowTab(shownTab)) return
  const drawn = shownSettled()
  const to = followTo(ARRIVAL_TABS, shownTab, isShownEmpty(v, shownTab, drawn, unfolded, v.isFetchingPrs), added)
  if (!to) return
  tab = to
  selection[to] = null
}

const LOADING_DELAY_MS = 300
const PAGE_START_MS = 2_000

const READ_TIMEOUT_MS = 3 * POLL_MS

async function read() {
  const generation = viewGeneration
  const seq = ++requested
  try {
    const next = await callTool<View>('inbox_view', { demo: isDemo, tab, ...holds() }, READ_TIMEOUT_MS)
    if (generation !== viewGeneration || seq < shown) return
    requestedPage = next.devPage
    if (updateError?.page !== requestedPage) updateError = null
    const isPageOld = requestedPage !== PAGE
    if (isPageOld && !updateError) void swapPage(requestedPage)
    serverNote = next.isPluginFolderGone
      ? {
          text: 'Quit and reopen Codex to load the installed inbox. Its files were moved or removed, so it still runs the version Codex started with.',
          isReloadable: false,
        }
      : next.serverLoadError
        ? {
            text: `The inbox server could not load its new build, so it still runs the last one. ${next.serverLoadError}`,
            isReloadable: false,
          }
        : next.serverBuild !== SERVER_BUILD && !isPageOld
          ? { text: 'This tab and the inbox server are from different builds.', isReloadable: true }
          : null
    applyView(next, seq)
  } catch (err) {
    if (isDisposed || generation !== viewGeneration || seq < shown) return
    if (view) pollFailures++
    else readError = failureText(err)
    draw()
  }
}

/** The host rejects with its JSON-RPC error object, not an Error. */
function failureText(err: unknown): string {
  const message =
    typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : String(err)
  const reason =
    clipLabel(
      message
        .replace(/^(Failed|Not done): /, '')
        .replace(/\s+/g, ' ')
        .trim(),
      120,
    ) || 'No reason given'

  return capitalized(/[.!?…]$/.test(reason) ? reason : `${reason}.`)
}

const PAGE = handoff?.page ?? inboxWindow.__inboxPage
let isSwapping = false
let requestedPage: string | null = null
let updateError: { page: string; text: string } | null = null

async function swapPage(target: string) {
  if (isSwapping || isDisposed || target === PAGE) return
  isSwapping = true
  let staged: PageHandoff | null = null
  let nextScript: HTMLScriptElement | null = null
  let committed = false
  try {
    const { html } = await callTool<{ html: string }>('inbox_tab_page', {}, READ_TIMEOUT_MS)
    if (isDisposed || requestedPage !== target) return
    if (!/<\/html>\s*$/i.test(html)) throw new Error('The new page is incomplete.')
    const incoming = new DOMParser().parseFromString(html, 'text/html')
    const pageRoot = incoming.getElementById('app')
    const pageStyle = incoming.getElementById('inbox-style') ?? incoming.head.querySelector('style')
    const pageScript = incoming.getElementById('inbox-script') ?? incoming.body.querySelector('script')
    const stamp = [...incoming.head.querySelectorAll('script')]
      .map(script => script.textContent?.match(/^\s*window\.__inboxPage\s*=\s*("[^"\n]+")\s*;?\s*$/)?.[1])
      .find(value => value !== undefined)
    const page = stamp ? (JSON.parse(stamp) as unknown) : null
    const supportsHandoff = incoming.querySelector('meta[name="inbox-handoff"]')?.getAttribute('content') === '1'
    const ownedStyle = document.getElementById('inbox-style')
    const ownedScript = document.getElementById('inbox-script')
    if (
      !(pageRoot instanceof HTMLDivElement) ||
      pageRoot.childNodes.length > 0 ||
      !(pageStyle instanceof HTMLStyleElement) ||
      !pageStyle.textContent ||
      !(pageScript instanceof HTMLScriptElement) ||
      pageScript.src ||
      !pageScript.textContent ||
      typeof page !== 'string' ||
      page !== target ||
      !/^ui:\/\/inbox\/tab-[a-f0-9]{12}$/.test(page) ||
      !supportsHandoff ||
      !(ownedStyle instanceof HTMLStyleElement) ||
      !(ownedScript instanceof HTMLScriptElement)
    )
      throw new Error('The new page is incomplete.')
    const nextRoot = document.createElement('div')
    nextRoot.id = 'app'
    const nextStyle = document.createElement('style')
    nextStyle.id = 'inbox-style'
    nextStyle.textContent = pageStyle.textContent
    nextScript = document.createElement('script')
    nextScript.id = 'inbox-script-candidate'
    nextScript.textContent = pageScript.textContent
    let ready!: (candidate: CandidatePage) => void
    const candidateReady = new Promise<CandidatePage>(resolve => (ready = resolve))
    staged = {
      page,
      root: nextRoot,
      aborted: false,
      ready: candidate => {
        if (!staged?.aborted && inboxWindow.__inboxHandoff === staged) ready(candidate)
      },
    }
    inboxWindow.__inboxHandoff = staged
    document.body.append(nextScript)
    const waitFor = <T,>(promise: Promise<T>, ms: number) =>
      new Promise<T>((resolve, reject) => {
        const timeout = later(() => reject(new Error('The new page did not start.')), ms)
        void promise.then(
          value => {
            cancelTimer(timeout)
            resolve(value)
          },
          error => {
            cancelTimer(timeout)
            reject(error)
          },
        )
      })
    const candidate = await waitFor(candidateReady, PAGE_START_MS)
    if (!(await waitFor(candidate.initialize(), READ_TIMEOUT_MS))) throw new Error('The new page could not connect.')
    const deadline = Date.now() + PRESS_TIMEOUT_MS
    while (activePresses > 0 && Date.now() < deadline) await new Promise<void>(resolve => later(resolve, 30))
    if (activePresses > 0) throw new Error('The current press is still running.')
    if (isDisposed || requestedPage !== target || staged.aborted) return
    const kept = capturedState()
    root.replaceWith(nextRoot)
    try {
      ownedStyle.replaceWith(nextStyle)
      candidate.activate(kept)
      candidate.start()
    } catch (err) {
      if (nextRoot.isConnected) nextRoot.replaceWith(root)
      if (nextStyle.isConnected) nextStyle.replaceWith(ownedStyle)
      applyPageVariables()
      throw err
    }
    dispose()
    ownedScript.remove()
    nextScript.id = 'inbox-script'
    inboxWindow.__inboxPage = page
    committed = true
  } catch {
    if (!isDisposed && requestedPage === target) {
      updateError = { page: target, text: 'Could not load the inbox update.' }
      draw()
    }
  } finally {
    if (staged) {
      staged.aborted = true
      if (inboxWindow.__inboxHandoff === staged) delete inboxWindow.__inboxHandoff
      if (!committed) {
        try {
          staged.dispose?.()
        } catch {}
      }
    }
    if (!committed) nextScript?.remove()
    isSwapping = false
  }
}

async function poll() {
  if (activePresses === 0) await read()
  later(poll, POLL_MS)
}

function isListed(v: View, id: string): boolean {
  return (
    allRows(v).some(r => r.id === id && r.state.is !== 'settled') ||
    prRows(v).some(r => r.id === id) ||
    v.prs.drawn.some(d => prMarkId(d.pr.ref) === id)
  )
}

function isNotSent(v: View, id: string): boolean {
  return (
    allRows(v).some(r => r.id === id && r.feedback?.is === 'notSent') ||
    feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at)?.is === 'notSent'
  )
}

async function act(rowId: string, press: RowPress | PrPress, onSent?: () => void, pending: Feedback | null = null) {
  if (isDisposed) return
  const generation = viewGeneration
  const seq = ++requested
  const isLatest = () => sending.get(rowId)?.seq === seq
  if (press.action !== 'undo' && !rowId.startsWith('pr:')) keepPressedOpen(rowId)
  const t = drawnTab()
  const wasWaiting = !!view && isRowTab(t) && tabWaits(view, t).some(r => r.id === rowId && r.isWaiting)
  sending.set(rowId, { seq, pending, action: press.action === 'type' ? null : actionId(press) })
  errors.delete(rowId)
  notes.delete(rowId)
  copies.delete(rowId)
  draw()
  activePresses++
  try {
    const r = await callTool<PressReply>(
      'inbox_press',
      { press, thread: view?.thread, demo: isDemo, ...holds() },
      PRESS_TIMEOUT_MS,
    )
    if (isDisposed || generation !== viewGeneration) return
    if (r.copy) await copy(rowId, r.copy, isLatest)
    if (isDisposed || generation !== viewGeneration || !isLatest()) return
    if (r.view) applyView(r.view, seq)
    if (r.error && !(view && isNotSent(view, rowId))) errors.set(rowId, r.error)
    const isConfirmed = isPressConfirmed({ error: r.error, note: r.note, isUnconfirmed: r.delivery === 'unconfirmed' })
    // After the view, so `onSent` reads the rows as they are after the press.
    if (isConfirmed) onSent?.()
    if (isConfirmed && r.view && wasWaiting && typing !== rowId) openAfterClose(r.view, rowId)
    const { note } = r
    if (note && view && isListed(view, rowId)) {
      notes.set(rowId, { text: noteText(), at: Date.now() })
      drawIn(SETTLED_MS)
      if (note === 'stale' && press.action === 'type') typing = rowId
    } else if (note) {
      lineNote = { text: noteText(), at: Date.now() }
      drawIn(SETTLED_MS)
    }
  } catch {
    if (isDisposed || generation !== viewGeneration || !isLatest()) return
    errors.set(rowId, 'Not confirmed: the inbox did not answer.')
  } finally {
    activePresses--
    if (isLatest()) {
      sending.delete(rowId)
      draw()
    }
  }
}

function tabWaits(v: View, t: Tab): RowWait[] {
  return t === 'prs'
    ? prRowWaits(
        v.prs.drawn.filter(x => !x.isSettled).map(x => x.pr),
        v.lastActions,
      )
    : listWaits(v)[t]
}

function openAfterClose(v: View, id: string) {
  const t = drawnTab()
  if (!isRowTab(t) || selection[t]?.id !== id) return
  const rows = tabWaits(v, t)
  if (rows.find(r => r.id === id)?.isWaiting) return
  const next = rowAfterClose(rows, id)
  const index = next === null ? -1 : tabRows(v, t).findIndex(r => r.id === next)
  if (next === null || index < 0) {
    selection[t] = null
    return
  }
  open(t, next, index)
  // After the press's own draw, which draws the row open.
  later(revealSelected, 0)
}

async function copy(rowId: string, c: { text: string; name: string }, isLatest: () => boolean) {
  try {
    await navigator.clipboard.writeText(c.text)
  } catch {
    if (!isLatest()) return
    // The tab's frame may not get the clipboard, so the text shows for a manual copy.
    errors.set(rowId, `Could not copy ${c.name}: this tab has no clipboard access`)
    copies.set(rowId, c)
  }
}

function replies(): Record<string, number> {
  return heldReplies(typing, Object.fromEntries(drafts))
}

function holds(): ReplyHolds {
  const now = Date.now()
  for (const [id, at] of discarded) if (now - at >= SETTLED_MS) discarded.delete(id)

  return { replies: replies(), discarded: Object.fromEntries(discarded) }
}

function sendReply(id: string, text: string) {
  const draft = drafts.get(id)
  void act(id, { action: 'type', id, text }, () => {
    if (drafts.get(id) === draft) drafts.delete(id)
  })
}

function startTyping(id: string) {
  keepPressedOpen(id)
  const wasHeld = id in replies()
  if (!drafts.has(id)) drafts.set(id, { text: '', since: view?.at ?? Date.now() })
  typing = id
  focusTyping = true
  draw()
  if (wasHeld) return
  // A view requested before this did not carry this row's reply, so it would draw the row's close as final.
  shown = ++requested
  void read()
}

function discardReply(id: string) {
  discarded.set(id, Date.now())
  drafts.delete(id)
  if (typing === id) typing = null
  draw()
  void read()
}

function rowKeys(r: RowView): { keys: Key[]; more: Key[] } {
  const actions = ledgerActions(r, optionsShown.has(r.id), sending.get(r.id)?.action ?? null, {
    press: p => {
      const step = p.action === 'step' ? r.steps[p.step] : undefined
      const action = r.actions.find(a => a.press.action === 'step' && p.action === 'step' && a.press.step === p.step)
      const pending: Feedback | null =
        action?.kind === 'local' && r.item && step
          ? { is: 'local', result: pendingResult(stepEffects(r.item, step), Date.now()) }
          : null
      void act(r.id, p, undefined, pending)
    },
    reply: () => startTyping(r.id),
    discard: () => discardReply(r.id),
    showOptions: () => {
      optionsShown.add(r.id)
      draw()
    },
  })
  return actions
}

function itemRow(v: View, r: RowView): Row {
  const mark = rowMark(r, 'codex')
  const isHandedOff = r.state.is === 'handedOff'
  const id = r.id
  const described = shownOptionDescriptions(r, optionsShown.has(id))

  return {
    id,
    view: r,
    handle: mark.text,
    handleTone: mark.tone,
    ...(isHandedOff ? { fold: {} } : {}),
    title: r.title,
    age: r.at === null ? undefined : shortAgo(v.at - r.at),
    ...(described.length > 0
      ? {
          body: (
            <div>
              {described.map(o => (
                <p class="option-description" title={`${o.label}: ${o.description}`}>
                  {o.label}
                  <span class="muted">: {o.description}</span>
                </p>
              ))}
            </div>
          ),
        }
      : {}),
    ...rowKeys(r),
    typing: {
      hint: replyHint(r, 'Codex'),
      send: text => sendReply(id, text),
    },
    feedback: r.feedback,
  }
}

function findingRow(v: View, r: RowView, f: Finding): Row {
  const isHandedOff = r.state.is === 'handedOff'
  const id = r.id
  const mark = rowMark(r, 'codex')

  return {
    id,
    view: r,
    handle: mark.text,
    handleTone: mark.tone,
    kind: f.kind,
    ...(isHandedOff ? { fold: {} } : {}),
    title: r.title,
    age: r.at === null ? undefined : shortAgo(v.at - r.at),
    body: (
      <div>
        <p style={{ whiteSpace: 'pre-line' }}>{inlineHtml(r.detail ?? '')}</p>
        {f.path ? (
          <p>
            <span class="muted">{ROW_COPY.relevantFile}</span>
            <code title={f.path}>{r.fileName}</code>
          </p>
        ) : null}
      </div>
    ),
    ...rowKeys(r),
    typing: {
      hint: replyHint(r, 'Codex'),
      send: text => sendReply(id, text),
    },
    feedback: r.feedback,
  }
}

const pressesOf = (v: View): PressState => ({ lastActions: v.lastActions, turns: v.turns, now: v.at })

function prKey(rowId: string, pr: PrView, a: PrAction): Key {
  const effect = a.kind === 'local' ? prPressEffect(pr, a.press) : null
  const pending = effect ? pendingLocal(effect) : null

  return {
    ...(a.hotkey ? { hotkey: a.hotkey } : {}),
    label: a.label,
    emphasis: a.emphasis,
    ...(a.icon ? { icon: a.icon } : {}),
    ...(a.press.action === 'pr-dismiss' ? { isDismiss: true } : {}),
    ...(a.isOut || sending.get(rowId)?.action === a.press.action ? { isOut: true } : {}),
    run: () => void act(rowId, a.press, undefined, pending),
  }
}

function pendingLocal(effect: Effect): Feedback {
  return { is: 'local', result: pendingResult([effect], Date.now()) }
}

function prThreadRow(v: View, pr: PrView, t: PrThread): Row {
  const id = prThreadId(pr, t)
  const text = threadRowText(pr, t, v.lastActions)
  const press =
    (action: 'thread-address' | 'thread-draft' | 'thread-discuss' | 'thread-open', pending: Feedback | null = null) =>
    () =>
      void act(id, { action, ref: pr.ref, thread: t.id }, undefined, pending)
  const where = threadWhere(t)
  const { rest } = commentParts(t.body)
  const actions = splitFollowUps(threadActions(pr, t, pressesOf(v)))
  const openEffect = prPressEffect(pr, { action: 'thread-open', ref: pr.ref, thread: t.id })

  return {
    id,
    handle: text.mark.text,
    handleTone: text.mark.tone ?? undefined,
    isMarkDone: text.mark.isDone,
    ...(text.fold ? { fold: text.fold } : {}),
    title: text.title,
    meta: text.meta,
    age: t.at === null ? undefined : shortAgo(v.at - t.at),
    body: (
      <div>
        {rest ? <p class="quote">{inlineHtml(clipLabel(rest, PR_QUOTE_CHARS))}</p> : null}
        <p class="muted">
          <button type="button" class="link" onClick={press('thread-open', openEffect && pendingLocal(openEffect))}>
            {where}
          </button>
          {`${DOT}@${t.author}`}
        </p>
        {t.reply ? (
          <p class="quote">
            <b>@{t.reply.author}:</b> {inlineHtml(clipLabel(readableComment(t.reply.body), PR_QUOTE_CHARS))}
          </p>
        ) : null}
      </div>
    ),
    keys: actions.keys.map(a => prKey(id, pr, a)),
    more: actions.more.map(a => prKey(id, pr, a)),
    feedback: feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at),
  }
}

function prCheckRow(v: View, pr: PrView, c: PrCheck): Row {
  const id = prCheckId(pr, c)
  const text = checkRowText(c)
  const ran = text.meta

  return {
    id,
    handle: text.mark.text,
    handleTone: text.mark.tone ?? undefined,
    isMarkDone: text.mark.isDone,
    ...(text.lead ? { lead: `${text.lead} /` } : {}),
    title: text.title,
    meta: ran,
    age: c.finishedAt === undefined ? undefined : shortAgo(v.at - c.finishedAt),
    body: <div class="muted">{ran}</div>,
    keys: checkActions(pr, c, pressesOf(v)).map(a => prKey(id, pr, a)),
    more: [],
    feedback: feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at),
  }
}

function prSettledStart(v: View, pr: PrView): number {
  return readAt - (v.at - (v.lastActions[prMarkId(pr.ref)]?.at ?? v.at))
}

type PrBlockPlan = { pr: PrView; isSettled: boolean; threads: Row[]; checks: Row[] }

function prPlan(v: View): { blocks: PrBlockPlan[]; rows: Row[] } {
  const blocks: PrBlockPlan[] = []
  for (const { pr, isSettled } of v.prs.drawn) {
    if (isSettled) {
      const id = prMarkId(pr.ref)
      if (undoing.has(id) || Date.now() - prSettledStart(v, pr) < SETTLED_MS)
        blocks.push({ pr, isSettled, threads: [], checks: [] })
    } else
      blocks.push({
        pr,
        isSettled,
        threads: waitingThreads(pr).map(t => prThreadRow(v, pr, t)),
        checks: failingChecks(pr).map(c => prCheckRow(v, pr, c)),
      })
  }

  return { blocks, rows: blocks.flatMap(b => [...b.threads, ...b.checks]) }
}

function prRows(v: View): Row[] {
  return prPlan(v).rows
}

function tabRows(v: View, t: Tab): Row[] {
  return t === 'prs' ? prRows(v) : listsOf(v, shownSettled()).byTab[t]
}

type Lists = DrawnLists<Row>

function listsOf(v: View, drawn: ReadonlySet<string>): Lists {
  const held = replies()

  return drawnLists(
    v,
    id => drawn.has(id),
    r =>
      r.state.is === 'held' && !(r.id in held)
        ? null
        : r.item
          ? itemRow(v, r)
          : r.finding
            ? findingRow(v, r, r.finding)
            : null,
  )
}

function shownSettled(): Set<string> {
  return drawnSettled(seen, Date.now(), undoing)
}

const LIST_OF = { question: 'questions', task: 'tasks', finding: 'findings' } as const

function stepLists(v: View): { lists: Lists; changed: Set<string> } {
  const now = Date.now()
  const lists = listsOf(v, shownSettled())
  const t = drawnTab()
  const rows = isListedTab(t) ? lists.byTab[t] : []
  const openId = isRowTab(t) ? rows[selectedIndex(rows, t, v)]?.id : undefined
  const changed = new Set<string>()
  const kept = new Set<string>()
  for (const group of (Object.keys(LIST_OF) as Group[]).filter(g => TAB_OF[g] === t)) {
    const listed = lists[LIST_OF[group]]
    const listedIds = new Set(listed.map(entryId))
    const entries = [...listed]
    for (const [n, last] of (lastLists?.[LIST_OF[group]] ?? []).entries()) {
      const id = entryId(last)
      if (!listedIds.has(id) && drawnRows.has(id)) entries.splice(Math.min(n, entries.length), 0, last)
    }
    const drawn: Entry[] = []
    for (const x of entries) {
      const id = entryId(x)
      const before = drawnRows.get(id)
      const target: RowTarget = !listedIds.has(id)
        ? 'gone'
        : 'settled' in x
          ? undoing.has(id)
            ? 'undoing'
            : 'settled'
          : id === openId
            ? 'open'
            : 'closed'
      const track = stepRow(before?.track, target, now, entering.has(id), reducedMotion.matches)
      if (!track) continue
      if (track !== before?.track) changed.add(id)
      const openRow = !track.hasPanel ? undefined : 'row' in x && listedIds.has(id) ? x.row : before?.openRow
      drawnRows.set(id, { track, openRow })
      kept.add(id)
      drawn.push(x)
    }
    lists[LIST_OF[group]] = drawn
  }
  lists.findingGroups = lists.findingGroups.map(g => ({
    ...g,
    entries: lists.findings.filter(x => ('row' in x ? x.row.kind : x.settled.finding?.kind) === g.kind),
  }))
  for (const id of [...drawnRows.keys()]) if (!kept.has(id)) drawnRows.delete(id)
  return { lists, changed }
}

async function undo(r: RowView) {
  if (undoing.has(r.id)) return
  const t = TAB_OF[r.type]
  undoing.add(r.id)
  try {
    await act(r.id, { action: 'undo', id: r.id }, () => open(t, r.id))
  } finally {
    undoing.delete(r.id)
    const at = seen.get(r.id)
    const isTimeLeft = at !== undefined && Date.now() - at < SETTLED_MS
    const error = errors.get(r.id)
    if (error && !isTimeLeft) {
      lineNote = { text: error, at: Date.now(), isError: true }
      drawIn(SETTLED_MS)
    }
    if (at !== undefined && !isTimeLeft) seen.set(r.id, Date.now() - SETTLED_MS)
    draw()
  }
}

function selectedIndex(rows: Row[], t: Tab, v: View): number {
  const s = selection[t]
  if (s) {
    const at = rows.findIndex(r => r.id === s.id)
    if (at >= 0 || drawnRows.has(s.id) || rows.length === 0) return at
    const index = Math.min(s.index ?? 0, rows.length - 1)
    open(t, rows[index]!.id, index)
    return index
  }
  const id = firstWaiting(tabWaits(v, t))

  return id ? rows.findIndex(r => r.id === id) : -1
}

function open(t: Tab, id: string, index?: number) {
  selection[t] = { id, openedAt: Date.now(), ...(index === undefined ? {} : { index }) }
  if (typing !== id) typing = null
  drawIn(PRESS_GUARD_MS)
}

function select(t: Tab, rows: Row[], index: number) {
  const row = rows[index]
  if (!row) return
  open(t, row.id, index)
  draw()
}

function keepPressedOpen(id: string) {
  const t = drawnTab()
  if (isRowTab(t) && !selection[t]) selection[t] = { id, openedAt: 0 }
}

function isOpenGuarded(): boolean {
  const t = drawnTab()

  return isRowTab(t) && isGuarded(selection[t]?.openedAt ?? 0, Date.now())
}

function rowActions(row: Row): { keys: Key[]; more: Key[] } {
  if (row.typing && typing === row.id) return { keys: [], more: [] }

  return { keys: row.keys, more: row.more }
}

function KeyButton({ k }: { k: Key }) {
  return <ActionButton action={k} isBlocked={() => false} />
}

function feedbackLabel(row: Row): string | null {
  const f = row.feedback
  if (!f) return null

  return row.view ? rowFeedbackText(row.view, 'codex') : markedFeedbackText(f, row.isMarkDone ?? false, 'codex')
}

function noteOf(id: string): string | null {
  const n = notes.get(id)

  return n && Date.now() - n.at < SETTLED_MS ? n.text : null
}

function isFeedbackShown(row: Row): boolean {
  return !errors.has(row.id) && noteOf(row.id) === null && !copies.has(row.id)
}

function ListRow({ row, track, onSelect, now }: { row: Row; track: RowTrack; onSelect: () => void; now: number }) {
  const isClosing = track.hasPanel && (track.state === 'closing' || track.state === 'leaving')
  const isSelected = track.hasPanel && !isClosing
  const handle = <span class={`mark ${row.handleTone ?? ''}`}>{row.handle}</span>

  const isPressing = sending.has(row.id)
  const pending = sending.get(row.id)?.pending ?? null
  const isSending = isPressing && pending === null
  const f = isFeedbackShown(row) ? row.feedback : null
  const label = isSending ? null : pending ? feedbackText(pending, 'codex') : f ? feedbackLabel(row) : null
  const ageAt = !isPressing && f && hasAge(f) ? f.at : null
  const isInSide = ageAt !== null && !isSelected && !isClosing && f?.is !== 'queued' && f?.is !== 'unconfirmed'
  const statusUnder = !isSending && isStatusUnderActions(pending ?? f, isSelected || isClosing) ? label : null
  const last = isInSide || statusUnder ? null : label
  const side = isSending ? SENDING : ageAt !== null ? shortAgo(now - ageAt) : last ? null : row.age
  const afterTone = !isPressing && isFailure(row.feedback) ? 'error' : undefined

  return (
    <div
      class={`row ${isSelected ? 'selected' : 'collapsed'}${isClosing ? ' closing' : ''}`}
      onClick={isSelected ? undefined : onSelect}
    >
      {handle}
      <div class="content">
        <button
          type="button"
          class="line"
          {...(isSelected ? { tabIndex: -1, 'aria-disabled': true } : { 'aria-expanded': false })}
        >
          <span class="text">
            {row.lead ? (
              <>
                <span class="lead">{row.lead}</span>{' '}
              </>
            ) : null}
            {row.title}
          </span>
          {row.meta ? <span class="meta">{row.meta}</span> : null}
          {last ? (
            <span class={`after ${afterTone ? `tone-${afterTone}` : ''}`}>
              {isSelected || isClosing ? `${DOT}${last}` : last}
            </span>
          ) : null}
        </button>
      </div>
      <span class="side" data-room={SENDING}>
        {isInSide ? <span class="side-label">{label}</span> : null}
        {side}
      </span>
      {isSelected || isClosing ? <Panel row={row} isClosing={isClosing} status={statusUnder} /> : null}
    </div>
  )
}

function Panel({ row, isClosing, status }: { row: Row; isClosing: boolean; status?: string | null }) {
  const { keys, more } = rowActions(row)
  const copied = copies.get(row.id)
  const note = noteOf(row.id)
  const isTyping = !!row.typing && typing === row.id
  const notes = [
    row.fold?.note ? <div class="muted">{row.fold.note}</div> : null,
    note ? <div class="muted">{note}</div> : null,
    errors.has(row.id) ? <div class="tone-error">{errors.get(row.id)}</div> : null,
  ].filter(Boolean)

  return (
    <div class={isClosing ? 'panel closing' : 'panel'} inert={isClosing}>
      {row.body ? <div class="body">{row.body}</div> : null}
      {notes.length > 0 ? <div>{notes}</div> : null}
      <RowActions
        keys={keys}
        more={more}
        reply={
          isTyping
            ? {
                id: row.id,
                hint: row.typing!.hint,
                draft: () => drafts.get(row.id)?.text ?? '',
                onDraft: text =>
                  drafts.set(row.id, { text, since: drafts.get(row.id)?.since ?? view?.at ?? Date.now() }),
                send: text => {
                  typing = null
                  row.typing!.send(text)
                },
                exit: row.view ? fieldExit(row.view) : 'cancel',
                onExit: () => {
                  if (row.view && fieldExit(row.view) === 'discard') discardReply(row.id)
                  else {
                    typing = null
                    draw()
                  }
                },
              }
            : null
        }
        isBlocked={isOpenGuarded}
      />
      {status ? <div class="muted">{status}</div> : null}
      {copied ? (
        <div>
          <div class="muted">Copy {copied.name} from here:</div>
          <textarea rows={3} readOnly value={copied.text} onFocus={e => e.currentTarget.select()} />
          <button
            type="button"
            class="key"
            onClick={() => {
              copies.delete(row.id)
              draw()
            }}
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  )
}

function SettledView({ settled: r, panel }: { settled: RowView; panel: Row | undefined }) {
  const { state } = r
  if (state.is !== 'settled') return null
  const start = seen.get(r.id) ?? Date.now()
  const isUndoing = undoing.has(r.id)
  const error = errors.get(r.id)

  return (
    <div class={panel ? 'row settled was-open' : 'row settled'}>
      <span class="mark">{settledMark(state.delivery)}</span>
      <div class="content">
        <div class="settled-head">
          <div class="settled-line">
            <span class="what">{r.title}</span>
            <span class="outcome-label">
              {DOT}
              {settledLabel(state.label, state.delivery)}
            </span>
            {error ? (
              <span class="tone-error">
                {DOT}
                {error}
              </span>
            ) : null}
          </div>
          {state.canUndo ? (
            <button
              type="button"
              class={isUndoing ? 'key undo undoing' : 'key undo'}
              disabled={isUndoing}
              onClick={() => void undo(r)}
            >
              {/* The delay is set once, when it is drawn: the animation keeps its own time after that. */}
              <span
                key={start}
                class={isUndoing ? 'time-left paused' : 'time-left'}
                style={{ animationDuration: `${SETTLED_MS}ms` }}
                ref={el => {
                  if (el && !el.style.animationDelay) el.style.animationDelay = `-${Math.max(0, Date.now() - start)}ms`
                }}
              />
              <Icon name="undo" />
              Undo
            </button>
          ) : null}
        </div>
        {panel ? <Panel row={panel} isClosing /> : null}
      </div>
    </div>
  )
}

function Entries({ entries, group, all, now }: { entries: Entry[]; group: Group; all: Row[]; now: number }) {
  const t = TAB_OF[group]
  if (entries.length === 0) return null

  return (
    <div class="list">
      {entries.map(x => {
        const id = entryId(x)
        // stepLists tracked every entry it returned.
        const drawn = drawnRows.get(id)!

        return (
          <div class="entry" key={id} data-motion={id}>
            {'row' in x ? (
              <ListRow row={x.row} track={drawn.track} now={now} onSelect={() => select(t, all, all.indexOf(x.row))} />
            ) : (
              <SettledView settled={x.settled} panel={drawn.openRow} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Starts every running mark's pulse at the page's time origin, so a mark drawn at a later poll moves in step. */
function pulseInStep(el: HTMLElement | null) {
  for (const a of el?.getAnimations?.() ?? []) a.startTime = 0
}

function MarkedRow({ row }: { row: OverviewRow }) {
  const markClass = ['mark', row.tone, row.isRunning ? 'running' : null].filter(Boolean).join(' ')

  return (
    <div class="entry">
      <div class="row">
        <span class={markClass} ref={row.isRunning ? pulseInStep : undefined}>
          {row.mark}
        </span>
        <div class="content tight">
          <div>{row.text}</div>
          {row.detail ? <div class="outcome">{row.detail}</div> : null}
        </div>
      </div>
    </div>
  )
}

function OverviewTab({ page }: { page: OverviewPage }) {
  if (page.isEmpty)
    return (
      <div class="empty">
        <div class="title">{page.empty.title}</div>
        <div class="muted">{page.empty.hint}</div>
      </div>
    )
  const { lead, sections, earlier } = page

  return (
    <main class="overview">
      {lead.length > 0 ? (
        <section>
          {lead.map(line =>
            line.id === 'headline' ? (
              <h1 class="overview-goal" key={line.id}>
                {line.text}
              </h1>
            ) : (
              <div class={line.hasGapAbove ? 'overview-now overview-gap muted' : 'overview-now muted'} key={line.id}>
                {line.text}
              </div>
            ),
          )}
        </section>
      ) : null}
      {sections.map(part => (
        <section key={part.id}>
          <GroupTitle title={part.title} count={0} />
          <div class="list">
            {part.rows.map(r => (
              <MarkedRow key={r.id} row={r} />
            ))}
          </div>
        </section>
      ))}
      {earlier.length > 0 ? (
        <section>
          <GroupTitle title={earlierTitle('chat')} count={0} />
          <div class="list">
            {earlier.map((text, n) => (
              <div class="earlier muted" key={n}>
                {text}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}

function GroupTitle({ title, count }: { title: string; count: number }) {
  return (
    <div class="group-title">
      <b>{title}</b>
      {count > 0 ? (
        <span class="count">
          {DOT}
          {count}
        </span>
      ) : null}
    </div>
  )
}

function itemsClosed(v: View, kind: 'question' | 'task', entries: Entry[]): ClosedLine[] {
  return closedShown(v.needsYou.closed[kind === 'question' ? 'questions' : 'tasks'], settledIn(entries)).map(d => ({
    id: d.id,
    ask: d.ask,
    outcomeLabel: d.outcomeLabel,
    state: closedState(d),
    at: d.at,
    delivery: d.delivery,
  }))
}

function ItemGroup({
  v,
  kind,
  entries,
  all,
  now,
}: {
  v: View
  kind: 'question' | 'task'
  entries: Entry[]
  all: Row[]
  now: number
}) {
  const title = kind === 'question' ? 'Questions' : 'Tasks'
  const rest = staying(entries)
  const closed = itemsClosed(v, kind, rest)
  const rows = rest.flatMap(x => ('row' in x ? [x.row] : []))

  return (
    <section>
      <GroupTitle title={title} count={waitingCount(rows.map(r => r.view))} />
      <Entries entries={entries} group={kind} all={all} now={now} />
      <GroupEnd
        group={kind}
        empty={groupEmpty(title, rest)}
        closed={closed}
        total={closedTotal(v.needsYou.closed[kind === 'question' ? 'questions' : 'tasks'], settledIn(rest))}
        now={now}
      />
    </section>
  )
}

function staying(entries: Entry[]): Entry[] {
  return entries.filter(x => drawnRows.get(entryId(x))?.track.state !== 'leaving')
}

type GroupEmpty = { text: string; isLeaving: boolean }

function groupEmpty(title: string, rest: Entry[]): GroupEmpty | null {
  const isArriving = rest.every(x => drawnRows.get(entryId(x))?.track.state === 'entering')

  return rest.length === 0 || isArriving ? { text: groupEmptyText(title), isLeaving: rest.length > 0 } : null
}

type ClosedLine = {
  id: string
  ask: string
  outcomeLabel: string
  state: ClosedState
  at: number
  delivery: Parameters<typeof settledLabel>[1]
}

/** Preact escapes each span's text, so no HTML gets through. */
function inlineHtml(text: string) {
  return parseInline(text).map(s => {
    let node: ComponentChildren = s.code ? <code>{s.text}</code> : s.text
    if (s.italic) node = <i>{node}</i>
    if (s.bold) node = <b>{node}</b>
    if (s.strike) node = <s>{node}</s>
    return s.link ? (
      <>
        <u>{node}</u>
        <span class="muted"> {s.link}</span>
      </>
    ) : (
      node
    )
  })
}

function GroupEnd({
  group,
  empty,
  closed,
  total,
  now,
}: {
  group: FoldGroup
  empty: GroupEmpty | null
  closed: ClosedLine[]
  total: number
  now: number
}) {
  const earlier = earlierLabel(total, closed.length)
  const isUnfolded = unfolded.has(group)
  const isListed = total > 0 && (isUnfolded || closingFolds.has(group))

  return (
    <>
      <div class="group-end" data-motion={`end-${group}`}>
        <div class="group-end-content">
          {empty ? (
            <div class={empty.isLeaving ? 'group-empty leaving' : 'group-empty'} aria-hidden={empty.isLeaving}>
              {empty.text}
            </div>
          ) : null}
          {total > 0 ? (
            <button type="button" class="fold" data-fold={group} onClick={() => toggleFold(group)}>
              <Icon name={isUnfolded ? 'down' : 'right'} />
              {foldLabel(total)}
            </button>
          ) : null}
        </div>
      </div>
      {isListed ? (
        <div class="list closed-list" data-motion={`closed-${group}`}>
          {closed.map(d => (
            <div class="entry" key={`closed-${d.id}`}>
              <div class="row">
                <span class="mark">{closedMark(d.state, d.delivery)}</span>
                <div class="content tight">
                  <div class="muted">{d.ask}</div>
                  <div class="outcome">{settledLabel(d.outcomeLabel, d.delivery)}</div>
                  {canUndoRefused(d.delivery) ? (
                    <button
                      type="button"
                      disabled={sending.has(d.id)}
                      onClick={() => act(d.id, { id: d.id, action: 'undo' })}
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
                <span class="side">{shortAgo(now - d.at)}</span>
              </div>
            </div>
          ))}
          {earlier ? <div class="earlier muted">{earlier}</div> : null}
        </div>
      ) : null}
    </>
  )
}

const HOOKS_TRUST_TEXT: Record<NonNullable<View['hooksTrust']>, [string, string]> = {
  untrusted: [
    'The inbox stays empty until Codex runs its hooks.',
    'Click the hook icon beside the approval setting, then Allow all.',
  ],
  modified: [
    'Codex stopped the inbox’s hooks when the inbox updated.',
    'To trust them again, click the hook icon beside the approval setting, then Allow all.',
  ],
}

function notHeardText(v: View): [string, string?] | null {
  if (v.heard === 'heard') return null
  if (v.heard === 'none' && v.hooksTrust) return HOOKS_TRUST_TEXT[v.hooksTrust]

  if (v.heard === 'none') return ['The inbox starts with your next message.']

  return ['Items from Codex’s replies are missing.', 'The inbox has not heard from this chat’s hooks.']
}

function NeedsYou({ v, lists, now }: { v: View; lists: Lists; now: number }) {
  const all = lists.byTab.needsYou
  const isNothing = lists.questions.length === 0 && lists.tasks.length === 0
  const hasClosed =
    itemsClosed(v, 'question', lists.questions).length > 0 || itemsClosed(v, 'task', lists.tasks).length > 0
  const notHeard = notHeardText(v)
  if (isNothing && !hasClosed)
    return notHeard ? (
      <div class="empty">
        <div class="title">{notHeard[0]}</div>
        {notHeard[1] ? <div class="muted">{notHeard[1]}</div> : null}
      </div>
    ) : (
      <div class="empty">
        <div class="title">{emptyText('needsYou', 'Codex').title}</div>
        <div class="muted">{emptyText('needsYou', 'Codex').hint}</div>
      </div>
    )

  return (
    <main>
      {notHeard ? (
        <section>
          <div class="group-title">
            {notHeard[0]}
            {notHeard[1] ? <div class="muted">{notHeard[1]}</div> : null}
          </div>
        </section>
      ) : null}
      <ItemGroup v={v} kind="question" entries={lists.questions} all={all} now={now} />
      <ItemGroup v={v} kind="task" entries={lists.tasks} all={all} now={now} />
    </main>
  )
}

function Findings({ v, lists, now }: { v: View; lists: Lists; now: number }) {
  const settled = settledIn(staying(lists.findings))
  const closedOf = (kind: Finding['kind']) => v.findings.closed.filter(f => f.kind === kind)
  const shown = (kind: Finding['kind']) =>
    closedShown(closedOf(kind), settled).map(f => ({
      id: f.id,
      ask: f.title,
      outcomeLabel: f.outcomeLabel,
      state: closedState(f),
      at: f.closedAt,
      delivery: f.delivery,
    }))
  const isNothing = lists.findings.length === 0
  if (isNothing && closedTotal(v.findings.closed, settled) === 0)
    return (
      <div class="empty">
        <div class="title">{emptyText('findings', 'Codex').title}</div>
        <div class="muted">{emptyText('findings', 'Codex').hint}</div>
      </div>
    )

  return (
    <main>
      {lists.findingGroups.map(g => {
        const rest = staying(g.entries)
        const rows = rest.flatMap(x => ('row' in x ? [x.row] : []))
        return (
          <section>
            <GroupTitle title={g.title} count={waitingCount(rows.map(r => r.view))} />
            <Entries entries={g.entries} group="finding" all={lists.byTab.findings} now={now} />
            <GroupEnd
              group={g.kind}
              empty={groupEmpty(g.title, rest)}
              closed={shown(g.kind)}
              total={closedTotal(closedOf(g.kind), settled)}
              now={now}
            />
          </section>
        )
      })}
    </main>
  )
}

function SettledPr({ v, pr }: { v: View; pr: PrView }) {
  const id = prMarkId(pr.ref)
  const start = prSettledStart(v, pr)
  const isUndoing = undoing.has(id)
  const error = errors.get(id)

  return (
    <div class="row settled">
      <span class="mark">✓</span>
      <div class="content">
        <div class="settled-head">
          <div class="settled-line">
            <span class="what">
              <span class="tone-prs">#{pr.number}</span> {pr.title}
            </span>
            <span class="outcome-label">{`${DOT}${PR_DISMISSED_LABEL}`}</span>
            {error ? <span class="tone-error">{`${DOT}${error}`}</span> : null}
          </div>
          <button
            type="button"
            class={isUndoing ? 'key undo undoing' : 'key undo'}
            disabled={isUndoing}
            onClick={() => void undoPr(id, pr.ref)}
          >
            <span
              key={start}
              class={isUndoing ? 'time-left paused' : 'time-left'}
              style={{ animationDuration: `${SETTLED_MS}ms` }}
              ref={el => {
                if (el && !el.style.animationDelay) el.style.animationDelay = `-${Math.max(0, Date.now() - start)}ms`
              }}
            />
            <Icon name="undo" />
            Undo
          </button>
        </div>
      </div>
    </div>
  )
}

async function undoPr(id: string, ref: string) {
  if (undoing.has(id)) return
  undoing.add(id)
  try {
    await act(id, { action: 'pr-undo', ref })
  } finally {
    undoing.delete(id)
    draw()
  }
}

function prLastLine(v: View, id: string): { text: string; isError: boolean } | null {
  if (sending.has(id)) {
    const pending = sending.get(id)?.pending
    return { text: pending ? feedbackText(pending, 'codex') : SENDING, isError: false }
  }
  const error = errors.get(id)
  if (error) return { text: error, isError: true }
  const note = noteOf(id)
  if (note) return { text: note, isError: false }
  const f =
    v.lastActions[id]?.action === 'pr-dismiss' ? null : feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at)
  if (!f) return null
  const text = feedbackText(f, 'codex')

  return { text: hasAge(f) ? `${text}${DOT}${ago(v.at - f.at)}` : text, isError: isFailure(f) }
}

function PrBlock({
  v,
  pr,
  threads,
  checks,
  openId,
  all,
  now,
}: PrBlockPlan & { v: View; openId: string | undefined; all: Row[]; now: number }) {
  const isSent = threadSentIn(v.lastActions)
  const { status, head, unlisted } = readiness(pr, isSent)
  const tone = PR_TONES[status]
  const id = prMarkId(pr.ref)
  const keys = prBlockActions(pr, isSent, v.prs.branchRef, pressesOf(v)).map(a => prKey(id, pr, a))
  const last = prLastLine(v, id)

  return (
    <section>
      <div class="pr-head">
        <span class="tone-prs num">#{pr.number}</span> {pr.title}{' '}
        <span class={tone ? `pr-verdict tone-${tone}` : 'pr-verdict muted'}>{head}</span>
        <span class="pr-verdict muted">{unlisted.map(r => `${DOT}${r}`).join('')}</span>
      </div>
      {pr.error ? <div class="pr-status tone-error">{prRefreshFailedText(pr.error)}</div> : null}
      <div class="pr-actions keys">
        {keys.map(k => (
          <KeyButton k={k} />
        ))}
      </div>
      {last ? <div class={last.isError ? 'pr-last tone-error' : 'pr-last muted'}>{last.text}</div> : null}
      <div class="pr-groups">
        <PrRows title={PR_GROUP_TITLES.threads} rows={threads} all={all} openId={openId} now={now} />
        <PrRows title={PR_GROUP_TITLES.checks} rows={checks} all={all} openId={openId} now={now} />
      </div>
    </section>
  )
}

function PrRows({
  title,
  rows,
  all,
  openId,
  now,
}: {
  title: string
  rows: Row[]
  all: Row[]
  openId: string | undefined
  now: number
}) {
  if (rows.length === 0) return null

  return (
    <>
      <GroupTitle title={title} count={rows.length} />
      <div class="list">
        {rows.map(row => {
          const isOpen = row.id === openId
          const track: RowTrack = { state: isOpen ? 'open' : 'closed', since: 0, hasPanel: isOpen }

          return (
            <div class="entry" key={row.id}>
              <ListRow row={row} track={track} now={now} onSelect={() => select('prs', all, all.indexOf(row))} />
            </div>
          )
        })}
      </div>
    </>
  )
}

function Prs({ v, now }: { v: View; now: number }) {
  const { blocks, rows } = prPlan(v)
  const empty = prsEmptyText({ isFetching: v.isFetchingPrs, isGhMissing: v.isGhMissing }, 'chat')
  if (blocks.length === 0)
    return (
      <div class="empty">
        <div class="title">{empty.title}</div>
        <div class="muted">{empty.hint}</div>
      </div>
    )
  const openId = rows[selectedIndex(rows, 'prs', v)]?.id

  return (
    <main>
      {v.isGhMissing ? (
        <section>
          <div class="group-title muted">{GH_MISSING_TEXT}</div>
        </section>
      ) : null}
      {blocks.map(b =>
        b.isSettled ? (
          <section>
            <SettledPr v={v} pr={b.pr} />
          </section>
        ) : (
          <PrBlock {...b} v={v} openId={openId} all={rows} now={now} />
        ),
      )}
      {v.prs.olderText ? (
        <section>
          <div class="group-title muted">{v.prs.olderText}</div>
        </section>
      ) : null}
    </main>
  )
}

const LATE_READ_MS = 60_000

function footerOf(v: View) {
  return footerStatus(drawnTab(), v.status, { isFetching: v.isFetchingPrs, hasPrs: v.prs.drawn.length > 0 })
}

function Status({ v }: { v: View }) {
  const sinceRead = Date.now() - readAt
  const status =
    pollFailures >= 2 ? (
      <span class={sinceRead > LATE_READ_MS ? 'tone-error' : undefined}>
        Last read {ago(sinceRead)}
        {DOT}retrying
      </span>
    ) : (
      footerOf(v).text
    )

  return <div class="status">{status}</div>
}

function TabBar({ v }: { v: View }) {
  const counts: Record<Tab, number> = { needsYou: v.needsYou.count, findings: v.findings.count, prs: v.prs.count }
  const { error } = footerOf(v)
  const shown = drawnTab()

  return (
    <nav>
      <div class="tabs">
        {shownTabs(v.isNextBuild === true).map(t => (
          <button
            type="button"
            class={`tab ${shown === t.id ? 'shown' : ''}`}
            title={t.label}
            onClick={() => {
              tab = t.id
              draw()
            }}
          >
            <span class="tab-symbol" aria-hidden="true">
              {t.symbol}
            </span>
            <span class="tab-word">{t.label}</span>
            {isRowTab(t.id) && counts[t.id] > 0 ? <span class={`count tone-${t.id}`}>{counts[t.id]}</span> : null}
          </button>
        ))}
      </div>
      {serverNote ? (
        serverNote.isReloadable ? (
          <ErrorStrip text={serverNote.text} reload={() => location.reload()} />
        ) : (
          <div class="status-line tone-error">{serverNote.text}</div>
        )
      ) : null}
      {updateError ? (
        <ErrorStrip
          text={updateError.text}
          label={ROW_COPY.retry}
          reload={() => {
            const page = updateError?.page
            updateError = null
            draw()
            if (page) void swapPage(page)
          }}
        />
      ) : null}
      {error ? <div class="status-line tone-error">{error}</div> : null}
      {lineNote && Date.now() - lineNote.at < SETTLED_MS ? (
        <div class={lineNote.isError ? 'status-line tone-error' : 'status-line muted'}>{lineNote.text}</div>
      ) : null}
    </nav>
  )
}

async function toggleDemo() {
  viewGeneration++
  isDemo = !isDemo
  readError = null
  pollFailures = 0
  view = null
  seen = new Map()
  rowsSeen = {}
  drawnRows.clear()
  lastLists = null
  selection.needsYou = null
  selection.findings = null
  selection.prs = null
  typing = null
  draw()
  await read()
}

function ErrorStrip({ text, reload, label = 'Reload' }: { text: string; reload: () => void; label?: string }) {
  return (
    <div class="error-strip">
      <span>{text}</span>
      <button type="button" class="key" onClick={reload}>
        {label}
      </button>
    </div>
  )
}

function App({ lists }: { lists: Lists | null }): ComponentChildren {
  if (!view || !lists)
    return readError !== null ? (
      <ErrorStrip
        text={`Could not read the inbox. ${readError}`}
        reload={() => void (isConnected ? read() : initialize())}
      />
    ) : isLoadingShown ? (
      <div class="notice muted">{READING_TEXT}</div>
    ) : null
  const v = view
  const now = v.at
  const shown = drawnTab()

  return (
    <>
      {isDemo && !DEMO_RECORDING ? (
        <div class="demo-note">
          <span>{DEMO_NOTICE}</span>
          <button type="button" class="key ghost" onClick={() => void toggleDemo()}>
            Hide demo
          </button>
        </div>
      ) : null}
      <TabBar v={v} />
      {shown === 'needsYou' ? (
        <NeedsYou v={v} lists={lists} now={now} />
      ) : shown === 'findings' ? (
        <Findings v={v} lists={lists} now={now} />
      ) : shown === 'prs' ? (
        <Prs v={v} now={now} />
      ) : (
        <OverviewTab page={v.overviewPage} />
      )}
      <footer>
        {isDemo || !DEMO_BUTTON ? null : (
          <button type="button" class="demo-toggle" onClick={() => void toggleDemo()}>
            Show demo
          </button>
        )}
        <div class="footer-end">
          <Status v={v} />
          <span class="version">{versionLabel(manifest.version, v.isNextBuild === true)}</span>
        </div>
      </footer>
    </>
  )
}

// The Codex app's own curves, from its bundled styles: --cubic-enter, --cubic-move and --cubic-exit.
const ENTER: KeyframeAnimationOptions = { duration: ENTER_MS, easing: 'cubic-bezier(.19, 1, .22, 1)' }
const MOVE: KeyframeAnimationOptions = { duration: MOVE_MS, easing: 'cubic-bezier(.65, 0, .35, 1)' }
const EXIT: KeyframeAnimationOptions = { duration: EXIT_MS, easing: 'cubic-bezier(.8, 0, .4, 1)', fill: 'forwards' }
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

type Heights = Map<string, { el: HTMLElement; height: number }>

function measure(): Heights {
  const heights: Heights = new Map()
  for (const el of root.querySelectorAll<HTMLElement>('[data-motion]'))
    heights.set(el.dataset.motion!, { el, height: el.getBoundingClientRect().height })

  return heights
}

function run(el: HTMLElement, frames: Keyframe[], timing: KeyframeAnimationOptions, to: number) {
  el.style.overflow = 'hidden'
  el.dataset.to = String(to)
  const a = el.animate(frames, timing)
  animations.add(a)
  const done = () => {
    animations.delete(a)
    if (isDisposed) return
    if (el.getAnimations().length === 0) unclip(el)
  }
  a.onfinish = done
  a.oncancel = done
}

function release(el: HTMLElement) {
  for (const a of el.getAnimations()) a.cancel()
  unclip(el)
}

function unclip(el: HTMLElement) {
  el.style.overflow = ''
  delete el.dataset.to
}

/**
 * A row entry's or a group end's content height, which an animation of its own height does not change, as its scroll
 * height does while the animation holds it taller or shorter than its content. Its children stack with no gaps or
 * padding.
 */
function contentHeight(el: HTMLElement): number {
  return [...el.children].reduce((sum, child) => sum + child.getBoundingClientRect().height, 0)
}

type Frame = { height: number; opacity: number }

function tween(el: HTMLElement, from: Frame, to: Frame, timing: KeyframeAnimationOptions) {
  const keyframe = (f: Frame) => ({ height: `${f.height}px`, opacity: f.opacity })
  run(el, [keyframe(from), keyframe(to)], timing, to.height)
}

function growIn(el: HTMLElement, height: number) {
  tween(el, { height: 0, opacity: 0 }, { height, opacity: 1 }, ENTER)
}

function animateDraw(before: Heights, changed: ReadonlySet<string>) {
  if (reducedMotion.matches) {
    entering.clear()
    return
  }
  const started = new Set([...changed].map(key => drawnRows.get(key)?.track.state))
  const besideRow: KeyframeAnimationOptions = started.has('leaving')
    ? { ...EXIT, fill: 'none' }
    : started.has('entering')
      ? ENTER
      : MOVE
  for (const el of root.querySelectorAll<HTMLElement>('[data-motion]')) {
    const key = el.dataset.motion!
    const was = before.get(key)
    if (el.dataset.closing) continue
    const state = drawnRows.get(key)?.track.state
    const isFresh = !was || was.el !== el
    const from = () => (el.getAnimations().length > 0 || isFresh ? el.getBoundingClientRect().height : was.height)
    if (state && changed.has(key) && startState(el, state, from)) continue
    if (state === 'closing' || state === 'settling' || state === 'leaving') continue
    if (state && !isMoving(state) && !sending.has(key)) {
      release(el)
      continue
    }
    const target = state || el.classList.contains('group-end') ? contentHeight(el) : el.scrollHeight
    if (isFresh) {
      if (!state && entering.delete(key)) growIn(el, target)
      continue
    }
    const anims = el.getAnimations()
    if (anims.length > 0 && Math.abs(Number(el.dataset.to) - target) < 1) continue
    const height = from()
    const opacity = anims.length > 0 ? Number(getComputedStyle(el).opacity) : 1
    for (const a of anims) a.cancel()
    if (Math.abs(height - target) < 1 && opacity > 0.99) continue
    tween(el, { height, opacity }, { height: target, opacity: 1 }, state ? MOVE : besideRow)
  }
  entering.clear()
}

function startState(el: HTMLElement, state: RowState, from: () => number): boolean {
  switch (state) {
    case 'opening':
      return false
    case 'entering':
      release(el)
      growIn(el, contentHeight(el))
      return true
    case 'closing':
    case 'settling':
      collapse(el, drawnFrame(el, from))
      return true
    case 'leaving': {
      const frame = drawnFrame(el, from)
      for (const a of el.getAnimations()) a.cancel()
      tween(el, frame, { height: 0, opacity: 0 }, EXIT)
      return true
    }
    default:
      release(el)
      return true
  }
}

function drawnFrame(el: HTMLElement, height: () => number): Frame {
  return { height: height(), opacity: Number(getComputedStyle(el).opacity) }
}

function collapse(el: HTMLElement, from: Frame) {
  const panel = el.querySelector<HTMLElement>('.panel.closing')
  // A closing row keeps its open line until the panel goes, so its end height is measured as it will draw then.
  const row = el.querySelector<HTMLElement>('.row.closing')
  row?.classList.remove('closing')
  if (panel) panel.style.display = 'none'
  const target = contentHeight(el)
  if (panel) panel.style.display = ''
  row?.classList.add('closing')
  for (const a of el.getAnimations()) a.cancel()
  tween(el, from, { height: target, opacity: 1 }, { ...MOVE, fill: 'forwards' })
}

function toggleFold(group: FoldGroup) {
  const el = root.querySelector<HTMLElement>(`[data-motion="closed-${group}"]`)
  if (!unfolded.has(group)) {
    unfolded.add(group)
    if (closingFolds.delete(group) && el) delete el.dataset.closing
    else entering.add(`closed-${group}`)
    draw()
    return
  }
  unfolded.delete(group)
  if (!el || reducedMotion.matches) {
    draw()
    return
  }
  closingFolds.add(group)
  draw()
  el.dataset.closing = '1'
  const height = el.getBoundingClientRect().height
  for (const a of el.getAnimations()) a.cancel()
  tween(el, { height, opacity: 1 }, { height: 0, opacity: 0 }, EXIT)
  later(() => {
    if (unfolded.has(group) || !closingFolds.delete(group)) return
    draw()
  }, EXIT_MS)
}

function revealSelected() {
  if (isDisposed) return
  root.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' })
  if (!reducedMotion.matches)
    later(() => root.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' }), MOVE_MS + 20)
}

function applyPageVariables() {
  document.documentElement.style.setProperty('--row-pad', `${ROW_PAD_PT}px`)
  document.documentElement.style.setProperty('--lead-gap', `${LEAD_GAP_PT}px`)
  document.documentElement.style.setProperty('--overview-row-pad', `${OVERVIEW_ROW_PAD_PT}px`)
  document.documentElement.style.setProperty('--pulse', `${RUNNING_PULSE_MS}ms`)
  document.documentElement.style.setProperty('--move', `${MOVE_MS}ms ${MOVE.easing}`)
  document.documentElement.style.setProperty('--enter', `${ENTER_MS}ms ${ENTER.easing}`)
}

const TIMER_SLACK_MS = 50

function drawIn(ms: number) {
  later(draw, ms + TIMER_SLACK_MS)
}

let moveWake: { at: number; timer: ReturnType<typeof later> } | null = null

function wakeForMoves() {
  const now = Date.now()
  const ends = [...drawnRows.values()].flatMap(({ track: t }) =>
    isMoving(t.state) ? [t.since + ROW_STATE_MS[t.state]] : [],
  )
  if (ends.length === 0) return
  const at = Math.min(...ends) + TIMER_SLACK_MS
  if (moveWake && moveWake.at <= at) return
  if (moveWake) cancelTimer(moveWake.timer)
  moveWake = {
    at,
    timer: later(() => {
      moveWake = null
      draw()
    }, at - now),
  }
}

function draw() {
  if (isDisposed || !isActive) return
  const before = measure()
  const step = view ? stepLists(view) : null
  lastLists = step?.lists ?? null
  wakeForMoves()
  render(<App lists={lastLists} />, root)
  animateDraw(before, step?.changed ?? new Set())
  const fieldToFocus = focusTyping && typing ? document.getElementById(`type-${typing}`) : null
  if (fieldToFocus) {
    focusTyping = false
    fieldToFocus.focus()
  }
}

let pressedAt: { x: number; y: number } | null = null
document.addEventListener(
  'pointerdown',
  e => {
    if (!isActive) return
    if (!(e.target instanceof Element) || !root.contains(e.target) || !e.target.closest('.list, .fold')) return
    pressedAt = { x: e.clientX, y: e.clientY }
    document.body.classList.add('still')
  },
  { signal: instanceAbort.signal },
)
document.addEventListener(
  'pointermove',
  e => {
    if (!isActive) return
    if (!pressedAt || Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y) < 3) return
    pressedAt = null
    document.body.classList.remove('still')
  },
  { signal: instanceAbort.signal },
)

document.addEventListener(
  'keydown',
  e => {
    if (!isActive) return
    if (e.metaKey || e.ctrlKey || e.altKey || !view) return
    const target = e.target as HTMLElement | null
    if (target?.closest('input, textarea')) {
      if (e.key === 'Escape' && target.tagName === 'INPUT') {
        typing = null
        draw()
      }
      return
    }
    const switched = shownTabs(view.isNextBuild === true).find(t => t.hotkey === e.key)
    if (switched) {
      tab = switched.id
      draw()
      return
    }
    const t = drawnTab()
    if (!isRowTab(t)) return
    const rows = tabRows(view, t)
    const at = selectedIndex(rows, t, view)
    const move = e.key === 'j' || e.key === 'ArrowDown' ? 1 : e.key === 'k' || e.key === 'ArrowUp' ? -1 : 0
    if (move !== 0) {
      e.preventDefault()
      select(t, rows, Math.max(0, Math.min(rows.length - 1, at + move)))
      revealSelected()
      return
    }
    const row = rows[at]
    if (!row) return
    const { keys, more } = rowActions(row)
    const k = [...keys, ...more].find(x => x.hotkey === e.key)
    if (k) {
      e.preventDefault()
      if (!k.isOut) k.run()
    }
  },
  { signal: instanceAbort.signal },
)

function startConnected() {
  if (isDisposed || !isActive || !isConnected || didStart) return
  didStart = true
  applyHost(hostContext)
  applyHost(stagedHostChanges)
  parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} }, '*')
  void poll()
}

function initialize(): Promise<boolean> {
  if (isDisposed) return Promise.resolve(false)
  if (isConnected) return Promise.resolve(true)
  if (initializing) return initializing
  readError = null
  if (isActive) draw()
  initializing = request(
    'ui/initialize',
    {
      protocolVersion: '2026-01-26',
      appInfo: { name: 'inbox', version: '0.2.11' },
      appCapabilities: { tools: {} },
    },
    READ_TIMEOUT_MS,
  )
    .then(r => {
      if (isDisposed) return false
      hostContext = (r as { hostContext?: Parameters<typeof applyHost>[0] } | undefined)?.hostContext ?? {}
      isConnected = true
      startConnected()
      return true
    })
    .catch(() => {
      if (isActive && !isDisposed) {
        readError = 'The inbox could not connect to Codex.'
        draw()
      }
      return false
    })
    .finally(() => {
      initializing = null
    })
  return initializing
}

function startPage() {
  startConnected()
  later(() => {
    isLoadingShown = true
    if (!view && readError === null) draw()
  }, LOADING_DELAY_MS)
}

function activatePage(kept: Kept) {
  if (isDisposed || !handoff || handoff.aborted) throw new Error('The new page stopped.')
  restoreState(kept)
  isActive = true
  applyPageVariables()
  draw()
}

if (handoff) handoff.ready({ initialize, activate: activatePage, start: startPage, dispose })
else {
  applyPageVariables()
  restoreState()
  void initialize()
  startPage()
}
