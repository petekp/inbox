import type { Delivery, Item, LastAction, Ledger, PressKind, PrCheck, PrThread, PrView, PrViews } from '../types'
import { GH_TIMEOUT_MS, TIMED_OUT_CODE, UNSTARTABLE_CODE } from './gh'
import { baseName, isFoldingPress, localLast, pendingResult, prSteps, recordPress, withQueued } from './presses'
import type { Effect, HelpStep, PrActionId, RowPress } from './presses'
import { ago, clipLabel } from './text'
import {
  commentLine,
  commentParts,
  failingChecks,
  inPrOrder,
  isKeptPr,
  parseRef,
  prompts,
  prRefs,
  rankOf,
  readiness,
  readThreadsAnswer,
  readView,
  THREAD_TITLE_CHARS,
  threadsOnYou,
  THREADS_QUERY,
  threadWhere,
  took,
  VIEW_FIELDS,
  waitingThreads,
} from './prs'
import type { IsThreadSent, PrStatus } from './prs'
import {
  closedRowState,
  DOT,
  isAgain,
  isSettledInPlace,
  isShownSince,
  outAction,
  pressFeedbackIn,
  pressOutAction,
  PR_MARKS,
  RUNNING_MARK,
} from './view'
import type { ActionEmphasis, BannerKind, PressState, RowWait, SettledState, ViewInput } from './view'

export const MAX_PRS = 12

/** The most PRs an agent's order can rank. They are tracked beyond `MAX_PRS`. */
export const MAX_ORDERED_PRS = 30

/** How many gh runs a fetch has going at once. */
export const GH_RUNS_AT_ONCE = 8

/** The ledger's PR links, and the agent's order of them. */
export type PrLinks = Pick<Ledger, 'prs' | 'prOrder'>

/** Runs gh with these arguments in the session's folder. A run that cannot start or does not finish ends with code -1. */
export type GhRun = (args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>

/** gh's exit code for a command that needs a sign-in when gh has no token, as `gh help exit-codes` says. */
const GH_SIGN_IN_CODE = 4

/**
 * Whether gh's answer asks for a sign-in: gh has no token, or GitHub refused the token with HTTP 401, as it does for
 * an expired or revoked one.
 */
export function asksForSignIn(r: { exitCode: number; stderr: string }): boolean {
  return r.exitCode === GH_SIGN_IN_CODE || (r.exitCode !== 0 && /\bHTTP 401\b/.test(r.stderr))
}

export function linkedPrs(prs: string[], refs: string[]): string[] {
  return [...prs.filter(r => !refs.includes(r)), ...refs]
}

export function itemPrSteps(item: Item, prState: PrViews, linked: string[]): HelpStep[] {
  const refs = prState.branchRef ? [...linked, prState.branchRef] : linked

  return prSteps(
    item,
    refs.map(ref => ({ ref, url: prState.views[ref]?.url ?? null })),
  )
}

/**
 * A linked PR the tab leaves out for good, by `isKeptPr`: its view says someone else wrote it, or that it was merged
 * or closed before a fetch found it open. A fetch skips it, and a task naming it keeps its Open PR step.
 */
export function isLeftOut(prState: PrViews, ref: string): boolean {
  const view = prState.views[ref]

  return view !== undefined && !isKeptPr(view)
}

/**
 * The linked PRs the tab tracks: those the agent's order ranks, and the newest `MAX_PRS` of the rest. `older` names
 * the rest, which the tab does not show.
 */
export function splitLinked(prState: PrViews, links: PrLinks): { tracked: string[]; older: string[] } {
  const ranked = new Set(links.prOrder?.refs ?? [])
  const shown = links.prs.filter(ref => !isLeftOut(prState, ref))
  const unranked = shown.filter(ref => !ranked.has(ref))
  const older = unranked.slice(0, Math.max(0, unranked.length - MAX_PRS))

  return { tracked: shown.filter(ref => !older.includes(ref)), older }
}

export function olderPrsText(prState: PrViews, links: PrLinks): string | null {
  const { older } = splitLinked(prState, links)
  if (older.length === 0) return null
  const numbers = older.map(ref => `#${parseRef(ref).number}`).reverse()

  return `${older.length} older ${older.length === 1 ? 'PR' : 'PRs'} not shown: ${numbers.join(', ')}`
}

/**
 * Only `findsBranchPr` asks gh which PR the branch has; otherwise the last one found is refreshed by its ref.
 * `isGhSignedOut` says whether a gh run asked for a sign-in, and is null when no run gave an answer.
 */
export async function fetchTracked(
  run: GhRun,
  state: PrViews,
  links: PrLinks,
  findsBranchPr: boolean,
  now: () => number | Promise<number>,
): Promise<{ views: Record<string, PrView>; branchRef: string | null; isGhSignedOut: boolean | null }> {
  let isGhSignedOut: boolean | null = null
  const runs = limitedTo(GH_RUNS_AT_ONCE)
  const gh: GhRun = async args => {
    const r = await runs(() => run(args))
    const isAnswer = r.exitCode !== UNSTARTABLE_CODE && r.exitCode !== TIMED_OUT_CODE
    if (isAnswer) isGhSignedOut = isGhSignedOut === true || asksForSignIn(r)

    return r
  }
  const { tracked } = splitLinked(state, links)
  const branchTarget = findsBranchPr ? null : state.branchRef
  const isBranchLinked = branchTarget !== null && tracked.includes(branchTarget)
  const [branch, ...rest] = await Promise.all([
    findsBranchPr || (branchTarget && !isBranchLinked)
      ? fetchPr(gh, branchTarget, state.views, state.branchRef, now)
      : null,
    ...tracked.map(ref => fetchPr(gh, ref, state.views, null, now)),
  ])
  const views: Record<string, PrView> = {}
  for (const v of [...rest, branch]) if (v) views[v.ref] = v

  return { views, branchRef: findsBranchPr ? (branch?.ref ?? null) : state.branchRef, isGhSignedOut }
}

/**
 * `target` is "owner/repo#123", or null for
 * the current branch's PR, whose ref is known only from gh's answer.
 * `knownBranchRef` is the branch's PR as of the last fetch: it stays the
 * branch's PR when the lookup fails for any reason but "no pull requests found".
 * A PR that gh could not read because it asked for a sign-in keeps its last view, since the PRs tab's sign-in notice
 * says why. A view's `fetchedAt` is the time `now` reads once gh answers.
 */
export async function fetchPr(
  gh: GhRun,
  target: string | null,
  views: Record<string, PrView>,
  knownBranchRef: string | null,
  now: () => number | Promise<number>,
): Promise<PrView | null> {
  const threadsOf = (ref: string) => {
    const r = parseRef(ref)
    return gh([
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
  const [view, early] = await Promise.all([
    gh(['pr', 'view', ...(t ? [t.number, '-R', t.repo] : []), '--json', VIEW_FIELDS]),
    target ? threadsOf(target) : null,
  ])
  const fetchedAt = await now()
  const hasNoPr = view.exitCode !== 0 && /no pull requests found/i.test(view.stderr)
  const ref = target ?? (view.exitCode === 0 ? urlRef(view.stdout) : hasNoPr ? null : knownBranchRef)
  if (!ref) return null
  const previous = views[ref]
  const base = view.exitCode === 0 ? readView(ref, view.stdout) : null
  if (!base) {
    if (!previous || asksForSignIn(view)) return previous ?? null

    const error =
      view.exitCode === TIMED_OUT_CODE
        ? GH_TIMED_OUT_TEXT
        : view.stderr.trim().split('\n')[0] || 'gh could not read the PR'

    return { ...previous, error }
  }
  const threads = early ?? (await threadsOf(ref))
  const answer = threads.exitCode === 0 ? readThreadsAnswer(threads.stdout) : null

  return {
    ...base,
    threads: answer?.threads ?? previous?.threads ?? [],
    isYours: answer?.isYours ?? previous?.isYours ?? null,
    wasSeenOpen: base.state === 'OPEN' || previous?.wasSeenOpen === true,
    error: answer ? null : 'could not read review threads',
    fetchedAt,
  }
}

export function urlRef(json: string): string | null {
  try {
    return prRefs(String((JSON.parse(json) as { url?: unknown }).url ?? ''))[0] ?? null
  } catch {
    return null
  }
}

export function prThreadId(pr: PrView, t: PrThread): string {
  return threadRowId(pr.ref, t.id)
}

export function prCheckId(pr: PrView, check: PrCheck): string {
  return checkRowId(pr.ref, check.name)
}

export function threadRowId(ref: string, thread: string): string {
  return `${ref} thread ${thread}`
}

export function checkRowId(ref: string, check: string): string {
  return `${ref} check ${check}`
}

export function prMarkId(ref: string): string {
  return `pr:${ref}`
}

export const GH_MISSING_TEXT = 'The inbox could not find gh. It needs gh to read your PRs.'

export const GH_TIMED_OUT_TEXT = `gh did not answer within ${GH_TIMEOUT_MS / 1000} seconds`

export const GH_SIGNED_OUT_TEXT = 'gh is not signed in to GitHub. Run gh auth login so the inbox can read your PRs.'

/** Why gh cannot read the PRs, as the PRs tab says it, or null when nothing stops it. A missing gh comes first. */
export function ghNoticeOf(gh: {
  isGhMissing: boolean
  isGhSignedOut: boolean
}): { kind: Extract<BannerKind, 'gh-missing' | 'gh-signed-out'>; text: string } | null {
  if (gh.isGhMissing) return { kind: 'gh-missing', text: GH_MISSING_TEXT }
  if (gh.isGhSignedOut) return { kind: 'gh-signed-out', text: GH_SIGNED_OUT_TEXT }

  return null
}

/** The hint under an empty PRs tab. `place` is the host's word for a conversation with the agent. */
export function prsEmptyHint(place: string): string {
  return `Your PRs show here when this ${place} opens or links one, or when your branch has one.`
}

/** What an empty PRs tab says. When gh cannot read the PRs, its hint is the `ghNoticeOf` text. */
export function prsEmptyText(
  prs: { isFetching: boolean; isGhMissing: boolean; isGhSignedOut: boolean },
  place: string,
) {
  return {
    title: prs.isFetching ? 'Checking for PRs…' : 'No PRs',
    hint: ghNoticeOf(prs)?.text ?? prsEmptyHint(place),
  }
}

/** The line a PR block shows when its last refresh failed. */
export function prRefreshFailedText(error: string): string {
  return `Last refresh failed: ${error}`
}

/**
 * The button under a failed refresh. It is not "Try again", since a failed send on the same block draws that.
 */
export const PR_REFRESH_LABEL = 'Refresh PRs'

/** Fetches every PR the session tracks, so the row reads "Refreshing PRs…". */
export const PR_REFRESH: Effect = { kind: 'refresh-prs', name: 'PRs' }

/** The label of a dismissed PR's block while its Undo lasts. */
export const PR_DISMISSED_LABEL = 'Dismissed'

const DISMISS_MERGED_LABEL = 'Dismiss merged'

/** The row id of the PRs tab's Dismiss merged press. It starts with `pr:`, as a PR's mark id does, so no host takes it for an Asks row. */
export const DISMISS_MERGED_ID = 'pr:merged'

export const PR_GROUP_TITLES = { threads: 'Review threads', checks: 'Failing checks' }

/**
 * The mark before a PR row's title, its tone, and whether it says the row's work is done. `isRunning` says the look
 * draws its running mark in place of `text`, while what the row sent is on its way.
 */
export type PrRowMark = {
  text: string
  tone: 'done' | 'error' | 'needsYou' | null
  isDone: boolean
  isRunning: boolean
}

/** What a review thread's row says, for each look to draw in its own controls. */
export type ThreadRowText = {
  /** ◆ while the thread waits on the person, running while its message is on its way, then ✓. Blank while unconfirmed. */
  mark: PrRowMark
  /** Set when the row folds to one line: the agent has the thread, or its lines changed since the comment. */
  fold: { note?: string } | null
  title: string
  meta: string
}

export function threadRowText(pr: PrView, t: PrThread, lastActions: Record<string, LastAction>): ThreadRowText {
  const isSent = threadSentIn(lastActions)(pr, t)
  const isChanged = !isSent && t.isLinesChanged

  return {
    mark: threadMark(isSent ? lastActions[prThreadId(pr, t)]?.delivery : null),
    fold:
      isSent || isChanged
        ? t.isLinesChanged
          ? { note: `Lines changed since this comment${DOT}still open on GitHub` }
          : {}
        : null,
    title: clipLabel(commentParts(t.body).head, THREAD_TITLE_CHARS),
    meta: [
      threadWhere(t, baseName(t.path)),
      isChanged ? 'Lines changed' : '',
      t.reply ? `@${t.reply.author}: ${commentLine(t.reply.body)}` : `@${t.author}`,
    ]
      .filter(Boolean)
      .join(DOT),
  }
}

/** A thread's mark from the delivery of its hand-off, or null while it waits on the person. */
function threadMark(delivery: Delivery | null | undefined): PrRowMark {
  if (delivery === null) return { ...PR_MARKS.waiting, isDone: false, isRunning: false }
  if (delivery?.state === 'queued') return { text: RUNNING_MARK, tone: null, isDone: false, isRunning: true }
  if (delivery?.state === 'unconfirmed') return { text: '', tone: null, isDone: false, isRunning: false }
  return { ...PR_MARKS.sent, isDone: true, isRunning: false }
}

/** What a failing check's row says. `lead` names its workflow, drawn before the check's name. */
export function checkRowText(c: PrCheck): { mark: PrRowMark; lead: string | null; title: string; meta: string } {
  return {
    mark: { ...PR_MARKS.failing, isDone: false, isRunning: false },
    lead: c.workflow || null,
    title: c.name,
    meta: checkRunText(c),
  }
}

/** How many characters of a review comment, or of its latest reply, an open thread row shows. */
export const PR_QUOTE_CHARS = 1200

/** A row's actions split into the buttons it draws and the follow-ups drawn after them, as Discuss is. */
export function splitFollowUps<A extends { isFollowUp?: boolean }>(actions: A[]): { keys: A[]; more: A[] } {
  return { keys: actions.filter(a => !a.isFollowUp), more: actions.filter(a => a.isFollowUp) }
}

export function checkRunText(c: PrCheck): string {
  return c.startedAt !== undefined && c.finishedAt !== undefined
    ? `Failed after ${took(c.finishedAt - c.startedAt)}`
    : 'Failed'
}

/**
 * Which PR rows the person handed to Claude. A thread stays sent until a
 * comment newer than the press, and one whose message failed to send never was.
 */
export function threadSentIn(lastActions: Record<string, LastAction>): IsThreadSent {
  return (pr, t) => {
    const last = lastActions[prThreadId(pr, t)]

    return last?.kind === 'handoff' && last.delivery?.state !== 'failed' && last.at > ((t.reply ?? t).at ?? 0)
  }
}

/** Whether a PR block draws a running mark, so the terminal and omp keep their frame timer going. */
export function isPrTabRunning(prs: PrView[], lastActions: Record<string, LastAction>): boolean {
  return prs.some(pr => waitingThreads(pr).some(t => threadRowText(pr, t, lastActions).mark.isRunning))
}

/**
 * The rows of the PR blocks `prs` in drawn order, each block's review threads then its failing checks, and whether
 * each still waits on the person: a thread not sent to the agent, a check whose Fix was not handed off.
 */
export function prRowWaits(prs: PrView[], lastActions: Record<string, LastAction>): RowWait[] {
  const isSent = threadSentIn(lastActions)

  return prs.flatMap(pr => [
    ...waitingThreads(pr).map(t => ({ id: prThreadId(pr, t), isWaiting: !isSent(pr, t) })),
    ...failingChecks(pr).map(c => {
      const id = prCheckId(pr, c)
      const last = lastActions[id]

      return { id, isWaiting: !isFoldingPress(id, last) || last?.delivery?.state === 'failed' }
    }),
  ])
}

export function isTracked(prState: PrViews, links: PrLinks, ref: string): boolean {
  return splitLinked(prState, links).tracked.includes(ref) || prState.branchRef === ref
}

/** Whether the session keeps a PR's view: the tab tracks the PR, or it is linked and left out, which keeps a fetch from reading it again. */
function keepsView(prState: PrViews, links: PrLinks, ref: string): boolean {
  return isTracked(prState, links, ref) || (links.prs.includes(ref) && isLeftOut(prState, ref))
}

/** When the PR was dismissed, or null when its last press did not dismiss it. */
function dismissedAt(lastActions: Record<string, LastAction>, ref: string): number | null {
  const mark = lastActions[prMarkId(ref)]

  return mark?.action === 'pr-dismiss' ? mark.at : null
}

export function isDismissed(lastActions: Record<string, LastAction>, ref: string): boolean {
  return dismissedAt(lastActions, ref) !== null
}

/**
 * Whether a session keeps a PR's view: `keepsView` keeps it, or the PR was dismissed while the look shows the PRs tab,
 * so its settled block and Undo can draw it. Once the person leaves the tab, the block is gone and so is the view.
 */
export function isViewKept(
  prState: PrViews,
  links: PrLinks,
  lastActions: Record<string, LastAction>,
  ref: string,
  shownSince: number | null,
): boolean {
  const at = dismissedAt(lastActions, ref)

  return keepsView(prState, links, ref) || (at !== null && isShownSince(at, shownSince))
}

/**
 * A PR block a look draws: a tracked PR, which is open, or a PR dismissed while the look shows the PRs tab, which
 * settles in place as a dismissed row does. `rank` is its number in the agent's order, from 1, or null when the order
 * does not rank it. A look draws it before an open block's title.
 */
export type DrawnPr = { pr: PrView; state: { is: 'open' } | SettledState; rank: number | null }

/** The PRs of the drawn blocks that are not settled. */
export function openPrViews(drawn: DrawnPr[]): PrView[] {
  return drawn.filter(d => d.state.is === 'open').map(d => d.pr)
}

const DISMISSED_PR = { how: 'dismissed', outcome: PR_DISMISSED_LABEL } as const

/**
 * The PR blocks a look draws, in order. A PR dismissed while the look shows the PRs tab stays as a settled block as
 * long as a settled row would, by `isSettledInPlace`, and offers Undo for `settleWindowMs`.
 */
export function drawnPrs(
  prState: PrViews,
  links: PrLinks,
  lastActions: Record<string, LastAction>,
  now: number,
  settleWindowMs: number,
  placing: Pick<ViewInput, 'shownSince' | 'lastTypedMessageAt'>,
): DrawnPr[] {
  const ranked = links.prOrder?.refs ?? []
  const drawn = inPrOrder(Object.values(prState.views), ranked).flatMap((pr): Omit<DrawnPr, 'rank'>[] => {
    if (isTracked(prState, links, pr.ref)) return [{ pr, state: { is: 'open' } }]
    const at = dismissedAt(lastActions, pr.ref)
    if (at === null) return []
    const state = closedRowState(DISMISSED_PR, at, now, settleWindowMs, null)

    return isSettledInPlace(state, placing) ? [{ pr, state }] : []
  })
  let rank = 0

  return drawn.map(d => ({ ...d, rank: rankOf(d.pr, ranked) === null ? null : ++rank }))
}

/** A ranked PR's number in the agent's order, as a look draws it before the PR's title: "1. ". */
export function prRankText(rank: number): string {
  return `${rank}.\u2002`
}

/**
 * The line above the PR blocks while the agent's order ranks a block the tab draws, open or settling, as "Merge order ·
 * set by Claude 2m ago". Null otherwise.
 */
export function prOrderText(order: PrLinks['prOrder'], drawn: DrawnPr[], now: number): string | null {
  const isRanking = drawn.some(d => d.rank !== null)
  if (!order || !isRanking) return null

  return `${order.label ?? 'Order'}${DOT}set by ${order.by} ${ago(now - order.at)}`
}

/** Runs at most `limit` of the calls it is given at once, starting each in the order it was given. */
function limitedTo(limit: number): <T>(call: () => Promise<T>) => Promise<T> {
  let running = 0
  const waiting: (() => void)[] = []

  return async call => {
    if (running >= limit) await new Promise<void>(go => waiting.push(go))
    running += 1
    try {
      return await call()
    } finally {
      running -= 1
      waiting.shift()?.()
    }
  }
}

export const PR_TONES: Record<PrStatus, 'needsYou' | 'done' | 'findings' | 'error' | null> = {
  ready: 'done',
  blocked: 'needsYou',
  waiting: null,
  draft: null,
  merged: 'findings',
  closed: 'error',
}

export type PrPress =
  | { action: 'thread-address' | 'thread-draft' | 'thread-discuss' | 'thread-open'; ref: string; thread: string }
  | {
      action: 'pr-conflicts' | 'pr-address-all' | 'pr-merge' | 'pr-open' | 'pr-refresh' | 'pr-dismiss' | 'pr-undo'
      ref: string
    }
  | { action: 'check-fix' | 'log'; ref: string; check: string }
  | { action: 'pr-dismiss-merged' }

export function isPrPress(p: RowPress | PrPress): p is PrPress {
  return 'ref' in p || p.action === 'pr-dismiss-merged'
}

/**
 * A press's outcome as the runner applies it: the ledger after it, the last
 * action of each row it records on, the rows whose last action it removes, and
 * the effects to perform. `stale` when its row is gone or changed.
 */
export type Applied =
  | { ledger: Ledger; lasts: Record<string, LastAction>; drop: string[]; effects: Effect[]; reopenedId?: string }
  | { stale: true }

function commentEffect(pr: PrView, t: PrThread): Effect {
  return { kind: 'open', target: t.reply?.url || t.url || pr.url, name: 'the comment' }
}

function prPageEffect(pr: PrView): Effect {
  return { kind: 'open', target: pr.url, name: `PR #${pr.number}` }
}

function logEffect(pr: PrView, check: PrCheck): Effect {
  return { kind: 'open', target: check.url ?? pr.url, name: check.url ? 'the log' : `PR #${pr.number}` }
}

/** A PR press that hands off a fix. The saved view can predate a push, so the press reads the PR from GitHub first. */
export type PrFixPress = { action: 'pr-conflicts'; ref: string } | { action: 'check-fix'; ref: string; check: string }

/** The labels of the buttons that hand a PR's fix to the agent. */
export const PR_FIX_LABELS: Record<PrFixPress['action'], string> = {
  'pr-conflicts': 'Resolve conflicts',
  'check-fix': 'Fix',
}

export function isPrFixPress(p: PrPress): p is PrFixPress {
  return p.action === 'pr-conflicts' || p.action === 'check-fix'
}

/** The refresh a fix press runs before it sends, so its row reads "Refreshing PR #12…". */
export function fixCheckEffect(pr: PrView): Effect {
  return { kind: 'refresh-prs', name: `PR #${pr.number}` }
}

/**
 * The open or refresh a PR press runs before any message: a Local press's open or refresh, or a fix press's
 * `fixCheckEffect`. Null for a press that only sends or marks, or whose row is gone.
 */
export function prPressEffect(pr: PrView, p: PrPress): Effect | null {
  if (isPrFixPress(p)) return fixCheckEffect(pr)
  switch (p.action) {
    case 'thread-open': {
      const t = pr.threads.find(x => x.id === p.thread)
      return t ? commentEffect(pr, t) : null
    }
    case 'pr-open':
      return prPageEffect(pr)
    case 'pr-refresh':
      return PR_REFRESH
    case 'log': {
      const check = pr.checks.find(c => c.name === p.check)
      return check ? logEffect(pr, check) : null
    }
    default:
      return null
  }
}

export function prRowId(p: PrPress): string {
  if (p.action === 'pr-dismiss-merged') return DISMISS_MERGED_ID
  if ('check' in p) return checkRowId(p.ref, p.check)
  if ('thread' in p) return threadRowId(p.ref, p.thread)

  return prMarkId(p.ref)
}

export function pressRowId(p: RowPress | PrPress): string {
  return isPrPress(p) ? prRowId(p) : p.id
}

function prRetryOf(
  last: LastAction | undefined,
  ref: string,
  thread: string | null,
  check: string | null = null,
): { press: PrPress; kind: PressKind } | null {
  if (last?.delivery?.state !== 'failed') return null
  const a = last.action
  if (check !== null) return a === 'check-fix' ? { press: { action: a, ref, check }, kind: last.kind } : null
  if (thread !== null && (a === 'thread-address' || a === 'thread-draft' || a === 'thread-discuss'))
    return { press: { action: a, ref, thread }, kind: last.kind }
  if (thread === null && (a === 'pr-conflicts' || a === 'pr-address-all' || a === 'pr-merge'))
    return { press: { action: a, ref }, kind: last.kind }

  return null
}

/**
 * A plan lists its buttons in the order every look shows them. A follow-up is drawn after the row's other buttons, as Discuss is.
 */
export type PrAction = {
  press: PrPress
  label: string
  kind: PressKind
  emphasis: ActionEmphasis
  icon?: 'retry' | 'open'
  hotkey?: string
  isFollowUp?: boolean
  /** A failed send's Try again, which repeats its button's press. */
  isRetry?: boolean
  /** Its press is out, so it draws dim and ignores another press until the press settles. */
  isOut: boolean
}

type PlannedPrAction = Omit<PrAction, 'isOut'>

/**
 * A row's last press, the action whose press is still out, which reads "… again" only once it settles,
 * and the action that draws out, which `outAction` narrows.
 */
type LastPress = { last: LastAction | undefined; pressing: string | null; out: string | null }

function lastPressOf(presses: PressState, rowId: string): LastPress {
  const last = presses.lastActions[rowId]
  const feedback = pressFeedbackIn(rowId, { is: 'open' }, last, presses.turns, presses.now)

  return { last, pressing: pressOutAction(last, feedback), out: outAction(last, feedback) }
}

function again(row: LastPress, action: PrActionId, label: string): string {
  return isAgain(row.last, action, row.pressing === action) ? `${label} again` : label
}

function withOut(row: LastPress, actions: PlannedPrAction[]): PrAction[] {
  return actions.map(a => ({ ...a, isOut: a.press.action === row.out }))
}

function retryAction(retry: { press: PrPress; kind: PressKind } | null): PlannedPrAction[] {
  return retry
    ? [{ press: retry.press, label: 'Try again', kind: retry.kind, emphasis: 'normal', icon: 'retry', isRetry: true }]
    : []
}

export function threadActions(pr: PrView, t: PrThread, presses: PressState): PrAction[] {
  const row = lastPressOf(presses, threadRowId(pr.ref, t.id))
  const on = { ref: pr.ref, thread: t.id }

  return withOut(row, [
    ...retryAction(prRetryOf(row.last, pr.ref, t.id)),
    {
      press: { action: 'thread-address', ...on },
      label: again(row, 'thread-address', 'Address'),
      kind: 'handoff',
      emphasis: 'primary',
      hotkey: 'a',
    },
    {
      press: { action: 'thread-draft', ...on },
      label: again(row, 'thread-draft', 'Draft reply'),
      kind: 'talk',
      emphasis: 'normal',
      hotkey: 'r',
    },
    {
      press: { action: 'thread-open', ...on },
      label: 'Open comment',
      kind: 'local',
      emphasis: 'normal',
      icon: 'open',
      hotkey: 'o',
    },
    {
      press: { action: 'thread-discuss', ...on },
      label: again(row, 'thread-discuss', 'Discuss'),
      kind: 'talk',
      emphasis: 'quiet',
      hotkey: 'd',
      isFollowUp: true,
    },
  ])
}

export function checkActions(pr: PrView, c: PrCheck, presses: PressState): PrAction[] {
  const row = lastPressOf(presses, checkRowId(pr.ref, c.name))
  const on = { ref: pr.ref, check: c.name }

  return withOut(row, [
    ...retryAction(prRetryOf(row.last, pr.ref, null, c.name)),
    {
      press: { action: 'check-fix', ...on },
      label: again(row, 'check-fix', PR_FIX_LABELS['check-fix']),
      kind: 'handoff',
      emphasis: 'primary',
      hotkey: 'a',
    },
    {
      press: { action: 'log', ...on },
      label: 'Open log',
      kind: 'local',
      emphasis: 'normal',
      icon: 'open',
      hotkey: 'o',
    },
  ])
}

/**
 * The branch's own PR has no Dismiss, since the PRs tab shows it while the branch has it.
 */
export function prBlockActions(
  pr: PrView,
  isThreadSent: IsThreadSent,
  branchRef: string | null,
  presses: PressState,
): PrAction[] {
  const row = lastPressOf(presses, prMarkId(pr.ref))
  const { status } = readiness(pr, isThreadSent)
  const waitingOn = threadsOnYou(pr, isThreadSent).length
  const moves: Omit<PlannedPrAction, 'emphasis'>[] = [
    ...(status === 'ready'
      ? [
          {
            press: { action: 'pr-merge' as const, ref: pr.ref },
            label: again(row, 'pr-merge', 'Merge'),
            kind: 'handoff' as const,
          },
        ]
      : []),
    ...(pr.state === 'OPEN' && pr.mergeable === 'CONFLICTING'
      ? [
          {
            press: { action: 'pr-conflicts' as const, ref: pr.ref },
            label: again(row, 'pr-conflicts', PR_FIX_LABELS['pr-conflicts']),
            kind: 'handoff' as const,
          },
        ]
      : []),
    ...(waitingOn > 1
      ? [
          {
            press: { action: 'pr-address-all' as const, ref: pr.ref },
            label: again(row, 'pr-address-all', `Address all ${waitingOn} threads`),
            kind: 'handoff' as const,
          },
        ]
      : []),
  ]

  return withOut(row, [
    ...(pr.error
      ? [
          {
            press: { action: 'pr-refresh' as const, ref: pr.ref },
            label: PR_REFRESH_LABEL,
            kind: 'local' as const,
            emphasis: 'normal' as const,
            icon: 'retry' as const,
          },
        ]
      : []),
    ...retryAction(prRetryOf(row.last, pr.ref, null)),
    ...moves.map((m, n): PlannedPrAction => ({ ...m, emphasis: n === 0 ? 'primary' : 'normal' })),
    { press: { action: 'pr-open', ref: pr.ref }, label: 'Open PR', kind: 'local', emphasis: 'normal', icon: 'open' },
    ...(pr.ref === branchRef
      ? []
      : [
          {
            press: { action: 'pr-dismiss' as const, ref: pr.ref },
            label: 'Dismiss',
            kind: 'mark' as const,
            emphasis: 'quiet' as const,
          },
        ]),
  ])
}

/** Whether Dismiss merged dismisses the PR. The branch's own PR has no Dismiss, so it is left. */
function isDismissedByMerged(pr: PrView, branchRef: string | null): boolean {
  return pr.state === 'MERGED' && pr.ref !== branchRef
}

/**
 * The PRs tab's own buttons, drawn after its PR blocks: Dismiss merged, while the tab draws a merged PR it can
 * dismiss. It dismisses each as the PR's own Dismiss does, so each settles with its own Undo.
 */
export function prTabActions(drawn: DrawnPr[], branchRef: string | null): PrAction[] {
  const hasMerged = drawn.some(d => d.state.is === 'open' && isDismissedByMerged(d.pr, branchRef))

  return hasMerged
    ? [
        {
          press: { action: 'pr-dismiss-merged' },
          label: DISMISS_MERGED_LABEL,
          kind: 'mark',
          emphasis: 'normal',
          hotkey: 'm',
          isOut: false,
        },
      ]
    : []
}

/**
 * Pure. Stale when the PR
 * is no longer tracked or drawn, its thread or check is gone, or what the
 * press acts on is over: the PR no longer conflicts, or no thread waits on the
 * person. Undo is stale unless the PR's block still holds its Dismiss. Dismiss merged is stale when no PR it dismisses
 * is left.
 */
export function applyPrPress(
  ledger: Ledger,
  prState: PrViews,
  lastActions: Record<string, LastAction>,
  p: PrPress,
  ctx: { now: number; turnsStarted: number; localPressId?: string },
): Applied {
  const stale = { stale: true as const }
  const applied = (a: Partial<Exclude<Applied, { stale: true }>>): Applied => {
    const effects = a.effects ?? []
    const lasts = Object.fromEntries(Object.entries(a.lasts ?? {}).map(([id, l]) => [id, withQueued(l, effects)]))

    return { ledger, drop: [], ...a, lasts, effects }
  }
  if (p.action === 'pr-dismiss-merged') {
    const refs = Object.values(prState.views)
      .filter(pr => isTracked(prState, ledger, pr.ref) && isDismissedByMerged(pr, prState.branchRef))
      .map(pr => pr.ref)
    if (refs.length === 0) return stale
    return applied({
      ledger: { ...ledger, prs: ledger.prs.filter(r => !refs.includes(r)) },
      lasts: Object.fromEntries(
        refs.map(ref => {
          const id = prMarkId(ref)
          return [id, recordPress('mark', 'pr-dismiss', PR_DISMISSED_LABEL, ctx, lastActions[id])]
        }),
      ),
    })
  }
  const pr = prState.views[p.ref]
  const markId = prMarkId(p.ref)
  if (p.action === 'pr-undo') {
    // Like an item's Undo, it does not check SETTLED_MS, so a press just after its button goes still lands.
    if (!pr || isTracked(prState, ledger, p.ref) || lastActions[markId]?.action !== 'pr-dismiss') return stale
    return applied({ ledger: { ...ledger, prs: [...ledger.prs, p.ref] }, drop: [markId] })
  }
  if (!pr || !isTracked(prState, ledger, p.ref)) return stale
  const record = (rowId: string, kind: 'talk' | 'handoff' | 'mark', action: PrActionId, text: string) =>
    recordPress(kind, action, text, ctx, lastActions[rowId])
  const send = (text: string): Effect => ({ kind: 'send', text, by: null })
  const local = (rowId: string, text: string, effect: Effect): Applied => {
    const effects = [effect]
    const result = pendingResult(effects, ctx.now, ctx.localPressId)

    return applied({ lasts: { [rowId]: localLast(lastActions[rowId], { action: p.action, text }, result) }, effects })
  }
  switch (p.action) {
    case 'thread-address':
    case 'thread-draft':
    case 'thread-discuss':
    case 'thread-open': {
      const t = pr.threads.find(x => x.id === p.thread)
      if (!t) return stale
      if (p.action === 'thread-address' && !t.isWaiting) return stale
      const id = prThreadId(pr, t)
      if (p.action === 'thread-open') return local(id, 'Open', commentEffect(pr, t))
      if (p.action === 'thread-address')
        return applied({
          lasts: { [id]: record(id, 'handoff', p.action, 'Address') },
          effects: [send(prompts.address(pr, [t]))],
        })
      if (p.action === 'thread-draft')
        return applied({
          lasts: { [id]: record(id, 'talk', p.action, 'Draft reply') },
          effects: [send(prompts.draft(pr, t))],
        })
      return applied({
        lasts: { [id]: record(id, 'talk', p.action, 'Discuss') },
        effects: [send(prompts.discuss(pr, t))],
      })
    }
    case 'pr-conflicts':
      if (pr.state !== 'OPEN' || pr.mergeable !== 'CONFLICTING') return stale
      return applied({
        lasts: { [markId]: record(markId, 'handoff', p.action, PR_FIX_LABELS[p.action]) },
        effects: [send(prompts.resolve(pr))],
      })
    case 'pr-address-all': {
      const waiting = threadsOnYou(pr, threadSentIn(lastActions))
      if (waiting.length === 0) return stale
      const threads = waiting.map(t => {
        const id = prThreadId(pr, t)
        return [id, record(id, 'handoff', 'thread-address', 'Address')]
      })
      return applied({
        lasts: {
          [markId]: record(markId, 'handoff', p.action, `Address all ${waiting.length} threads`),
          ...Object.fromEntries(threads),
        },
        effects: [send(prompts.address(pr, waiting))],
      })
    }
    case 'pr-merge':
      if (readiness(pr, threadSentIn(lastActions)).status !== 'ready') return stale
      return applied({
        lasts: { [markId]: record(markId, 'handoff', p.action, 'Merge') },
        effects: [send(prompts.merge(pr))],
      })
    case 'pr-open':
      return local(markId, 'Open PR', prPageEffect(pr))
    case 'pr-refresh':
      return local(markId, PR_REFRESH_LABEL, PR_REFRESH)
    case 'pr-dismiss':
      if (!ledger.prs.includes(p.ref) || prState.branchRef === p.ref) return stale
      return applied({
        ledger: { ...ledger, prs: ledger.prs.filter(r => r !== p.ref) },
        lasts: { [markId]: record(markId, 'mark', p.action, PR_DISMISSED_LABEL) },
      })
    case 'check-fix': {
      const check = pr.checks.find(c => c.name === p.check && c.bucket === 'fail')
      if (!check) return stale
      const id = prCheckId(pr, check)
      return applied({
        lasts: { [id]: record(id, 'handoff', p.action, PR_FIX_LABELS[p.action]) },
        effects: [send(prompts.fixCheck(pr, check))],
      })
    }
    case 'log': {
      const check = pr.checks.find(c => c.name === p.check)
      if (!check) return stale
      return local(prCheckId(pr, check), 'Open log', logEffect(pr, check))
    }
  }
}
