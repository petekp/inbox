import type { LastAction, Ledger, PrCheck, PrThread, PrView, PrViews } from '../types'
import { withQueued } from './press-reducer'
import type { Effect } from './press-reducer'
import { localLast, pendingResult, recordPress } from './pressed'
import type { PrActionId } from './presses'
import { inPrOrder, parseRef, prompts, rankOf, readiness, threadsOnYou } from './prs'
import type { IsThreadSent } from './prs'
import type { PressState } from './feedback'
import { checkRowId, prCheckId, prMarkId, prThreadId, RANK_AGAIN_ID, threadRowId, threadSentIn } from './pr-rows'
import { isTracked, PR_DISMISSED_LABEL } from './pr-views'
import type { DrawnPr } from './pr-views'
import { changedRankedPrs, RANK_AGAIN_LABEL } from './pr-order'
import {
  again,
  commentEffect,
  lastPressOf,
  logEffect,
  PR_FIX_LABELS,
  PR_REFRESH,
  prPageEffect,
  prRetryOf,
  retryAction,
  withOut,
} from './pr-press'
import type { Applied, PlannedPrAction, PrAction, PrPress } from './pr-press'

export {
  checkRowText,
  DISMISS_MERGED_ID,
  ghNoticeOf,
  PR_GROUP_TITLES,
  PR_QUOTE_CHARS,
  PR_TONES,
  prCheckId,
  prMarkId,
  prRefreshFailedText,
  prsEmptyText,
  prThreadId,
  RANK_AGAIN_ID,
  splitFollowUps,
  threadRowText,
  threadSentIn,
} from './pr-rows'
export { isDismissed, openPrViews } from './pr-views'
export type { DrawnPr } from './pr-views'
export { prRankText } from './pr-order'
export { isPrPress, pressRowId } from './pr-press'
export type { Applied, PrAction, PrPress } from './pr-press'

/**
 * The button under a failed refresh. It is not "Try again", since a failed send on the same block draws that.
 */
const PR_REFRESH_LABEL = 'Refresh PRs'

const DISMISS_MERGED_LABEL = 'Dismiss merged'

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
  if (p.action === 'pr-rank-again') {
    const order = ledger.prOrder
    if (!order) return stale
    const open = Object.values(prState.views).filter(
      pr => isTracked(prState, ledger, pr.ref) && rankOf(pr, order.refs) !== null,
    )
    const changed = changedRankedPrs(order, open)
    if (changed.length === 0) return stale
    const repo = parseRef(order.refs[0] ?? '').repo
    return applied({
      lasts: {
        [RANK_AGAIN_ID]: recordPress('talk', p.action, RANK_AGAIN_LABEL, ctx, lastActions[RANK_AGAIN_ID]),
      },
      effects: [
        {
          kind: 'send',
          text: prompts.rankAgain({ label: order.label, repo }, changed, inPrOrder(open, order.refs)),
          by: null,
        },
      ],
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
