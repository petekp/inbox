import type { Item, LastAction, Ledger, PressKind, PrCheck, PrThread, PrView, PrViews } from '../types'
import { baseName, isFoldingPress, localLast, pendingResult, prSteps, recordPress, withQueued } from './presses'
import type { Effect, HelpStep, PrActionId, RowPress } from './presses'
import { clipLabel } from './text'
import {
  commentLine,
  commentParts,
  failingChecks,
  inPrOrder,
  isKeptPr,
  parseRef,
  prompts,
  prRefs,
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
import { DOT, SETTLED_MS, feedbackIn, isAgain, outAction, pressOutAction } from './view'
import type { ActionEmphasis, PressState, RowWait } from './view'

export const MAX_PRS = 12

/** Runs gh with these arguments in the session's folder. */
export type GhRun = (args: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>

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

export function splitLinked(prState: PrViews, linked: string[]): { tracked: string[]; older: string[] } {
  const shown = linked.filter(ref => !isLeftOut(prState, ref))

  return { tracked: shown.slice(-MAX_PRS), older: shown.slice(0, Math.max(0, shown.length - MAX_PRS)) }
}

export function olderPrsText(prState: PrViews, linked: string[]): string | null {
  const { older } = splitLinked(prState, linked)
  if (older.length === 0) return null
  const numbers = older.map(ref => `#${parseRef(ref).number}`).reverse()

  return `${older.length} older ${older.length === 1 ? 'PR' : 'PRs'} not shown: ${numbers.join(', ')}`
}

/**
 * Only `findsBranchPr` asks gh which PR the branch has; otherwise the last one found is refreshed by its ref.
 */
export async function fetchTracked(
  gh: GhRun,
  state: PrViews,
  linked: string[],
  findsBranchPr: boolean,
): Promise<{ views: Record<string, PrView>; branchRef: string | null }> {
  const { tracked } = splitLinked(state, linked)
  const branchTarget = findsBranchPr ? null : state.branchRef
  const isBranchLinked = branchTarget !== null && tracked.includes(branchTarget)
  const [branch, ...rest] = await Promise.all([
    findsBranchPr || (branchTarget && !isBranchLinked) ? fetchPr(gh, branchTarget, state.views, state.branchRef) : null,
    ...tracked.map(ref => fetchPr(gh, ref, state.views, null)),
  ])
  const views: Record<string, PrView> = {}
  for (const v of [...rest, branch]) if (v) views[v.ref] = v

  return { views, branchRef: findsBranchPr ? (branch?.ref ?? null) : state.branchRef }
}

/**
 * `target` is "owner/repo#123", or null for
 * the current branch's PR, whose ref is known only from gh's answer.
 * `knownBranchRef` is the branch's PR as of the last fetch: it stays the
 * branch's PR when the lookup fails for any reason but "no pull requests found".
 */
export async function fetchPr(
  gh: GhRun,
  target: string | null,
  views: Record<string, PrView>,
  knownBranchRef: string | null,
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
  const hasNoPr = view.exitCode !== 0 && /no pull requests found/i.test(view.stderr)
  const ref = target ?? (view.exitCode === 0 ? urlRef(view.stdout) : hasNoPr ? null : knownBranchRef)
  if (!ref) return null
  const previous = views[ref]
  const base = view.exitCode === 0 ? readView(ref, view.stdout) : null
  if (!base)
    return previous ? { ...previous, error: view.stderr.trim().split('\n')[0] || 'gh could not read the PR' } : null
  const threads = early ?? (await threadsOf(ref))
  const answer = threads.exitCode === 0 ? readThreadsAnswer(threads.stdout) : null

  return {
    ...base,
    threads: answer?.threads ?? previous?.threads ?? [],
    isYours: answer?.isYours ?? previous?.isYours ?? null,
    wasSeenOpen: base.state === 'OPEN' || previous?.wasSeenOpen === true,
    error: answer ? null : 'could not read review threads',
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

export const GH_MISSING_TEXT = 'The inbox could not find gh, so it cannot read your PRs.'

/** The hint under an empty PRs tab. `place` is the host's word for a conversation with the agent. */
export function prsEmptyHint(place: string): string {
  return `Your PRs show here when this ${place} opens or links one, or when your branch has one.`
}

/** What an empty PRs tab says. With gh missing, its hint is the missing-gh text. */
export function prsEmptyText(prs: { isFetching: boolean; isGhMissing: boolean }, place: string) {
  return {
    title: prs.isFetching ? 'Checking for PRs…' : 'No PRs',
    hint: prs.isGhMissing ? GH_MISSING_TEXT : prsEmptyHint(place),
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

export const PR_GROUP_TITLES = { threads: 'Review threads', checks: 'Failing checks' }

/** The mark before a PR row's title, its tone, and whether it says the row's work is done. */
export type PrRowMark = { text: string; tone: 'done' | 'error' | null; isDone: boolean }

/** What a review thread's row says, for each look to draw in its own controls. */
export type ThreadRowText = {
  /** ✓ once the agent has the thread and its message arrived, else ◦. */
  mark: PrRowMark
  /** Set when the row folds to one line: the agent has the thread, or its lines changed since the comment. */
  fold: { note?: string } | null
  title: string
  meta: string
}

export function threadRowText(pr: PrView, t: PrThread, lastActions: Record<string, LastAction>): ThreadRowText {
  const isSent = threadSentIn(lastActions)(pr, t)
  const isChanged = !isSent && t.isLinesChanged

  const showsCheck = threadShowsCheckIn(lastActions)(pr, t)

  return {
    mark: showsCheck ? { text: '✓', tone: 'done', isDone: true } : { text: '◦', tone: null, isDone: false },
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

/** What a failing check's row says. `lead` names its workflow, drawn before the check's name. */
export function checkRowText(c: PrCheck): { mark: PrRowMark; lead: string | null; title: string; meta: string } {
  return {
    mark: { text: '✗', tone: 'error', isDone: false },
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

export function threadShowsCheckIn(lastActions: Record<string, LastAction>): IsThreadSent {
  const isSent = threadSentIn(lastActions)
  return (pr, t) => {
    const delivery = lastActions[prThreadId(pr, t)]?.delivery
    return isSent(pr, t) && delivery?.state !== 'unconfirmed'
  }
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

export function isTracked(prState: PrViews, linked: string[], ref: string): boolean {
  return splitLinked(prState, linked).tracked.includes(ref) || prState.branchRef === ref
}

/** Whether the session keeps a PR's view: the tab tracks the PR, or it is linked and left out, which keeps a fetch from reading it again. */
export function keepsView(prState: PrViews, linked: string[], ref: string): boolean {
  return isTracked(prState, linked, ref) || (linked.includes(ref) && isLeftOut(prState, ref))
}

export function isDismissing(lastActions: Record<string, LastAction>, ref: string, now: number): boolean {
  const mark = lastActions[prMarkId(ref)]

  return mark?.action === 'pr-dismiss' && now - mark.at < SETTLED_MS
}

export function drawnPrs(
  prState: PrViews,
  linked: string[],
  lastActions: Record<string, LastAction>,
  now: number,
): { pr: PrView; isSettled: boolean }[] {
  return inPrOrder(Object.values(prState.views)).flatMap((pr): { pr: PrView; isSettled: boolean }[] =>
    isTracked(prState, linked, pr.ref)
      ? [{ pr, isSettled: false }]
      : isDismissing(lastActions, pr.ref, now)
        ? [{ pr, isSettled: true }]
        : [],
  )
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

/** The open or refresh a Local PR press runs. Null for a press that sends or marks, or whose row is gone. */
export function prPressEffect(pr: PrView, p: PrPress): Effect | null {
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
  if ('check' in p) return checkRowId(p.ref, p.check)
  if ('thread' in p) return threadRowId(p.ref, p.thread)

  return prMarkId(p.ref)
}

export function pressRowId(p: RowPress | PrPress): string {
  return 'ref' in p ? prRowId(p) : p.id
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
  const feedback = feedbackIn(rowId, { is: 'open' }, last, presses.notes?.[rowId], presses.turns, presses.now)

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
      label: again(row, 'check-fix', 'Fix'),
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
            label: again(row, 'pr-conflicts', 'Resolve conflicts'),
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

/**
 * Pure. Stale when the PR
 * is no longer tracked or drawn, its thread or check is gone, or what the
 * press acts on is over: the PR no longer conflicts, or no thread waits on the
 * person. Undo is stale unless the PR's block still holds its Dismiss.
 */
export function applyPrPress(
  ledger: Ledger,
  prState: PrViews,
  lastActions: Record<string, LastAction>,
  p: PrPress,
  ctx: { now: number; turnsStarted: number; localPressId?: string },
): Applied {
  const stale = { stale: true as const }
  const pr = prState.views[p.ref]
  const markId = prMarkId(p.ref)
  const applied = (a: Partial<Exclude<Applied, { stale: true }>>): Applied => {
    const effects = a.effects ?? []
    const lasts = Object.fromEntries(Object.entries(a.lasts ?? {}).map(([id, l]) => [id, withQueued(l, effects)]))

    return { ledger, drop: [], ...a, lasts, effects }
  }
  if (p.action === 'pr-undo') {
    // Like an item's Undo, it does not check the settle window, so a press just after it ends still lands.
    if (!pr || isTracked(prState, ledger.prs, p.ref) || lastActions[markId]?.action !== 'pr-dismiss') return stale
    return applied({ ledger: { ...ledger, prs: [...ledger.prs, p.ref] }, drop: [markId] })
  }
  if (!pr || !isTracked(prState, ledger.prs, p.ref)) return stale
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
        lasts: { [markId]: record(markId, 'handoff', p.action, 'Resolve conflicts') },
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
        lasts: { [id]: record(id, 'handoff', p.action, 'Fix') },
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
