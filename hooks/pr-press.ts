import type { LastAction, Ledger, PrCheck, PressKind, PrThread, PrView } from '../types'
import type { Effect } from './press-reducer'
import type { PrActionId, RowPress } from './presses'
import { isAgain, outAction, pressFeedbackIn, pressOutAction } from './view'
import type { ActionEmphasis, PressState } from './view'
import { checkRowId, DISMISS_MERGED_ID, prMarkId, RANK_AGAIN_ID, threadRowId } from './pr-rows'

/** Fetches every PR the session tracks, so the row reads "Refreshing PRs…". */
export const PR_REFRESH: Effect = { kind: 'refresh-prs', name: 'PRs' }

export type PrPress =
  | { action: 'thread-address' | 'thread-draft' | 'thread-discuss' | 'thread-open'; ref: string; thread: string }
  | {
      action: 'pr-conflicts' | 'pr-address-all' | 'pr-merge' | 'pr-open' | 'pr-refresh' | 'pr-dismiss' | 'pr-undo'
      ref: string
    }
  | { action: 'check-fix' | 'log'; ref: string; check: string }
  | { action: 'pr-dismiss-merged' }
  | { action: 'pr-rank-again' }

export function isPrPress(p: RowPress | PrPress): p is PrPress {
  return 'ref' in p || p.action === 'pr-dismiss-merged' || p.action === 'pr-rank-again'
}

/**
 * A press's outcome as the runner applies it: the ledger after it, the last
 * action of each row it records on, the rows whose last action it removes, and
 * the effects to perform. `stale` when its row is gone or changed.
 */
export type Applied =
  | { ledger: Ledger; lasts: Record<string, LastAction>; drop: string[]; effects: Effect[]; reopenedId?: string }
  | { stale: true }

export function commentEffect(pr: PrView, t: PrThread): Effect {
  return { kind: 'open', target: t.reply?.url || t.url || pr.url, name: 'the comment' }
}

export function prPageEffect(pr: PrView): Effect {
  return { kind: 'open', target: pr.url, name: `PR #${pr.number}` }
}

export function logEffect(pr: PrView, check: PrCheck): Effect {
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

function prRowId(p: PrPress): string {
  if (p.action === 'pr-dismiss-merged') return DISMISS_MERGED_ID
  if (p.action === 'pr-rank-again') return RANK_AGAIN_ID
  if ('check' in p) return checkRowId(p.ref, p.check)
  if ('thread' in p) return threadRowId(p.ref, p.thread)

  return prMarkId(p.ref)
}

export function pressRowId(p: RowPress | PrPress): string {
  return isPrPress(p) ? prRowId(p) : p.id
}

export function prRetryOf(
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

export type PlannedPrAction = Omit<PrAction, 'isOut'>

/**
 * A row's last press, the action whose press is still out, which reads "… again" only once it settles,
 * and the action that draws out, which `outAction` narrows.
 */
export type LastPress = { last: LastAction | undefined; pressing: string | null; out: string | null }

export function lastPressOf(presses: PressState, rowId: string): LastPress {
  const last = presses.lastActions[rowId]
  const feedback = pressFeedbackIn(rowId, { is: 'open' }, last, presses.turns, presses.now)

  return { last, pressing: pressOutAction(last, feedback), out: outAction(last, feedback) }
}

export function again(row: LastPress, action: PrActionId, label: string): string {
  return isAgain(row.last, action, row.pressing === action) ? `${label} again` : label
}

export function withOut(row: LastPress, actions: PlannedPrAction[]): PrAction[] {
  return actions.map(a => ({ ...a, isOut: a.press.action === row.out }))
}

export function retryAction(retry: { press: PrPress; kind: PressKind } | null): PlannedPrAction[] {
  return retry
    ? [{ press: retry.press, label: 'Try again', kind: retry.kind, emphasis: 'normal', icon: 'retry', isRetry: true }]
    : []
}
