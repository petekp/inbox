import type { LastAction, Ledger, PrCheck, PrThread, PrView, PrViews, Session } from '../types'
import { withQueued } from './press-reducer'
import type { Effect } from './press-reducer'
import { localLast, pendingResult, recordPress } from './pressed'
import type { PrActionId } from './presses'
import { checkKey, inPrOrder, parseRef, prompts, rankOf, readiness, threadsOnYou } from './prs'
import type { IsThreadSent } from './prs'
import type { PressState } from './feedback'
import { prCheckId, prMarkId, PR_REFRESH_ID, prThreadId, RANK_AGAIN_ID, threadRowId, threadSentIn } from './pr-rows'
import { PR_REFRESH_LABEL } from './pr-refresh'
import { isTracked, PR_CLOSED_LABEL, PR_DISMISSED_LABEL, PR_MERGED_LABEL } from './pr-views'
import { splitLinked, tabPrs } from './pr-fetch'
import type { PrLinks } from './pr-fetch'
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
  RERUN_LABEL,
  rerunEffect,
  retryAction,
  sameRunChecks,
  withOut,
} from './pr-press'
import type { Applied, PlannedPrAction, PrAction, PrPress } from './pr-press'

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

/**
 * A failing check offers Fix. A cancelled one offers Re-run in Fix's place when `rerunEffect` allows. Re-run draws out
 * while another row of its run has a re-run out, since that re-run covers this row too.
 */
export function checkActions(pr: PrView, c: PrCheck, presses: PressState): PrAction[] {
  const row = lastPressOf(presses, prCheckId(pr, c))
  const on = { ref: pr.ref, check: checkKey(c) }
  const isCancelled = c.bucket === 'cancelled'
  const isRunRerunOut = sameRunChecks(pr, c).some(o => lastPressOf(presses, prCheckId(pr, o)).out === 'check-rerun')
  const mainMove: PlannedPrAction[] = isCancelled
    ? rerunEffect(pr, c)
      ? [
          {
            press: { action: 'check-rerun', ...on },
            label: RERUN_LABEL,
            kind: 'local',
            emphasis: 'primary',
            hotkey: 'a',
          },
        ]
      : []
    : [
        {
          press: { action: 'check-fix', ...on },
          label: again(row, 'check-fix', PR_FIX_LABELS['check-fix']),
          kind: 'handoff',
          emphasis: 'primary',
          hotkey: 'a',
        },
      ]

  const actions = withOut(row, [
    ...retryAction(prRetryOf(row.last, pr.ref, null, on.check)),
    ...mainMove,
    {
      press: { action: 'log', ...on },
      label: 'Open log',
      kind: 'local',
      emphasis: 'normal',
      icon: 'open',
      hotkey: 'o',
    },
  ])

  return isRunRerunOut ? actions.map(a => (a.press.action === 'check-rerun' ? { ...a, isOut: true } : a)) : actions
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

/** `ledger` with `refs` off the PRs tab: unlinked, and dismissed from the agent's order if it ranks them. */
function withDismissed(ledger: Ledger, refs: string[]): Ledger {
  const order = ledger.prOrder
  const ranked = refs.filter(ref => order?.refs.includes(ref) && !order.dismissed.includes(ref))

  return {
    ...ledger,
    prs: ledger.prs.filter(r => !refs.includes(r)),
    prOrder: order && ranked.length > 0 ? { ...order, dismissed: [...order.dismissed, ...ranked] } : order,
  }
}

/** The Dismiss press on `ref`, which notes a PR the session had not linked, so its Undo does not link it. */
function dismissPress(
  ledger: Ledger,
  ref: string,
  ctx: { now: number; turnsStarted: number },
  previous: LastAction | undefined,
): LastAction {
  const last = recordPress('mark', 'pr-dismiss', PR_DISMISSED_LABEL, ctx, previous)

  return ledger.prs.includes(ref) ? last : { ...last, isUnlinked: true }
}

/**
 * `ledger` with a dismissed PR back on the PRs tab: linked again if it was linked, and no longer dismissed from the
 * agent's order. Null when neither brings it back, as for a PR only an order that was since cleared ranked.
 */
function withUndismissed(ledger: Ledger, ref: string, wasLinked: boolean): Ledger | null {
  const order = ledger.prOrder
  const isDismissedFromOrder = order?.dismissed.includes(ref) === true
  if (!wasLinked && !isDismissedFromOrder) return null

  return {
    ...ledger,
    prs: wasLinked ? [...ledger.prs, ref] : ledger.prs,
    prOrder: order && isDismissedFromOrder ? { ...order, dismissed: order.dismissed.filter(r => r !== ref) } : order,
  }
}

/**
 * The tab's merged and closed PRs that Dismiss takes: those it draws as open blocks, but the branch's own, which has
 * no Dismiss.
 */
function finishedTabPrs(prState: PrViews, links: PrLinks): string[] {
  return splitLinked(prState, links).tracked.filter(ref => {
    const view = prState.views[ref]

    return view !== undefined && view.state !== 'OPEN' && ref !== prState.branchRef
  })
}

/**
 * The button at the top of the PRs tab, under the notices and Refresh PRs, while the tab draws a merged or closed PR
 * it can dismiss. Its press dismisses each as the PR's own Dismiss does, so each settles with its own Undo.
 */
export function prClearActions(prState: PrViews, links: PrLinks): PrAction[] {
  if (finishedTabPrs(prState, links).length === 0) return []

  return [
    {
      press: { action: 'pr-clear-finished' },
      label: 'Clear merged and closed',
      kind: 'mark',
      emphasis: 'normal',
      hotkey: 'm',
      isOut: false,
    },
  ]
}

/**
 * The session after a fetch: each tab PR the fetch first finds merged or closed leaves the tab as Dismiss would take
 * it, so its block settles with "Merged" or "Closed" and offers Undo, which keeps it on the tab. Nothing waits on the
 * person for a finished PR. The branch's own PR stays, since the tab shows it while the branch has it.
 */
export function withFinishedPrsSettled(
  s: Pick<Session, 'ledger' | 'prViews' | 'lastActions'>,
  fetched: PrViews['views'],
  ctx: { now: number; turnsStarted: number },
): { ledger: Ledger; lastActions: Record<string, LastAction> } {
  const finished = Object.values(fetched).filter(
    pr =>
      pr.state !== 'OPEN' &&
      s.prViews.views[pr.ref]?.state === 'OPEN' &&
      pr.ref !== s.prViews.branchRef &&
      tabPrs(s.ledger).includes(pr.ref),
  )
  if (finished.length === 0) return { ledger: s.ledger, lastActions: s.lastActions }
  const lasts = finished.map(pr => {
    const id = prMarkId(pr.ref)
    const label = pr.state === 'MERGED' ? PR_MERGED_LABEL : PR_CLOSED_LABEL

    return [id, { ...dismissPress(s.ledger, pr.ref, ctx, s.lastActions[id]), text: label }] as const
  })

  return {
    ledger: withDismissed(
      s.ledger,
      finished.map(pr => pr.ref),
    ),
    lastActions: { ...s.lastActions, ...Object.fromEntries(lasts) },
  }
}

/**
 * Pure. Stale when the PR
 * is no longer tracked or drawn, its thread or check is gone, or what the
 * press acts on is over: the PR no longer conflicts, or no thread waits on the
 * person. Undo is stale unless the PR's block still holds its Dismiss and `withUndismissed` brings it back. Clear
 * merged and closed is stale when no PR it dismisses is left.
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
  if (p.action === 'pr-refresh') {
    const effects = [PR_REFRESH]
    const result = pendingResult(effects, ctx.now, ctx.localPressId)
    const last = localLast(lastActions[PR_REFRESH_ID], { action: p.action, text: PR_REFRESH_LABEL }, result)

    return applied({ lasts: { [PR_REFRESH_ID]: last }, effects })
  }
  if (p.action === 'pr-clear-finished') {
    const refs = finishedTabPrs(prState, ledger)
    if (refs.length === 0) return stale
    const lasts = refs.map(ref => {
      const id = prMarkId(ref)
      return [id, dismissPress(ledger, ref, ctx, lastActions[id])] as const
    })
    return applied({ ledger: withDismissed(ledger, refs), lasts: Object.fromEntries(lasts) })
  }
  const pr = prState.views[p.ref]
  const markId = prMarkId(p.ref)
  if (p.action === 'pr-undo') {
    // Like an item's Undo, it does not check SETTLED_MS, so a press just after its button goes still lands.
    const dismissed = lastActions[markId]
    if (!pr || isTracked(prState, ledger, p.ref) || dismissed?.action !== 'pr-dismiss') return stale
    const back = withUndismissed(ledger, p.ref, dismissed.isUnlinked !== true)
    if (!back) return stale
    return applied({ ledger: back, drop: [markId] })
  }
  if (!pr || !isTracked(prState, ledger, p.ref)) return stale
  const record = (rowId: string, kind: 'talk' | 'handoff' | 'mark', action: PrActionId, text: string) =>
    recordPress(kind, action, text, ctx, lastActions[rowId])
  const send = (text: string): Effect => ({ kind: 'send', text, by: null })
  const local = (rowIds: string[], text: string, effect: Effect): Applied => {
    const effects = [effect]
    const result = pendingResult(effects, ctx.now, ctx.localPressId)
    const lasts = Object.fromEntries(
      rowIds.map(id => [id, localLast(lastActions[id], { action: p.action, text }, result)]),
    )

    return applied({ lasts, effects })
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
      if (p.action === 'thread-open') return local([id], 'Open', commentEffect(pr, t))
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
    case 'pr-merge': {
      const shown = readiness(pr, threadSentIn(lastActions))
      if (shown.status !== 'ready') return stale
      return applied({
        lasts: { [markId]: record(markId, 'handoff', p.action, 'Merge') },
        effects: [send(prompts.merge(pr, shown.text))],
      })
    }
    case 'pr-open':
      return local([markId], 'Open PR', prPageEffect(pr))
    case 'pr-dismiss':
      if (!tabPrs(ledger).includes(p.ref) || prState.branchRef === p.ref) return stale
      return applied({
        ledger: withDismissed(ledger, [p.ref]),
        lasts: { [markId]: dismissPress(ledger, p.ref, ctx, lastActions[markId]) },
      })
    case 'check-fix': {
      const check = pr.checks.find(c => checkKey(c) === p.check && c.bucket === 'fail')
      if (!check) return stale
      const id = prCheckId(pr, check)
      return applied({
        lasts: { [id]: record(id, 'handoff', p.action, PR_FIX_LABELS[p.action]) },
        effects: [send(prompts.fixCheck(pr, check))],
      })
    }
    case 'check-rerun': {
      // The PR block shows the result too, since the row leaves once the refresh after the re-run finds it running.
      const check = pr.checks.find(c => checkKey(c) === p.check)
      const rerun = check && rerunEffect(pr, check)
      const isRunRerunOut =
        check !== undefined &&
        sameRunChecks(pr, check).some(o => lastActions[prCheckId(pr, o)]?.result?.state === 'pending')
      if (!check || !rerun || isRunRerunOut) return stale
      return local([prCheckId(pr, check), markId], RERUN_LABEL, rerun)
    }
    case 'log': {
      const check = pr.checks.find(c => checkKey(c) === p.check)
      if (!check) return stale
      return local([prCheckId(pr, check)], 'Open log', logEffect(pr, check))
    }
  }
}
