import type { UiPressArgument } from 'claude-code'

import { startPress, wakeAfterSettle as wakeSessionAfterSettle } from '../../core/runtime/host-press'
import { runDemoPress } from './mod-demo'
import { drawnState, later } from './mod-drawn'
import { keepUndoVisible } from './mod-pane-scroll'
import type { Mod } from './mod-ports'
import { currentOwner } from './mod-sessions'
import { cancelUndoScroll, paneState, suspendUndoReveal } from './mod-state'
import { isPrPress, pressRowId, type PrPress } from '../../core/view/pr-press'
import { prUndoBlockAfter } from '../../core/view/pr-views'
import type { RowPress } from '../../core/domain/presses'
import type { Precondition } from '../../core/domain/preconditions'
import { allRows } from '../../core/view/rows'
import { type Holds, SETTLED_MS } from '../../core/view/timing'
import type { SettledOutcome } from '../../core/view/ui-controller-types'

type PressRunCalls = Pick<
  Mod,
  | 'atoms'
  | 'clock'
  | 'pane'
  | 'saves'
  | 'history'
  | 'pluginRoot'
  | 'commit'
  | 'sendUi'
  | 'publishStatus'
  | 'syncLook'
  | 'hostOf'
  | 'fetchPrs'
>

/** Runs the press the controller sent as `pressId`, then tells it how the press ended. */
export async function runPress(
  m: PressRunCalls & Pick<Mod, 'focusPaneKey'>,
  pressId: number,
  p: RowPress | PrPress,
  holds: Holds,
  surface?: UiPressArgument['surface'],
  when: Precondition[] = [],
) {
  const mayStayOnRow = isPrPress(p)
    ? ['pr-open', 'pr-refresh', 'thread-open', 'log', 'check-rerun'].includes(p.action)
    : p.action === 'step' || p.action === 'previews'
  const undoRevision = mayStayOnRow ? suspendUndoReveal() : cancelUndoScroll()
  const now = await m.clock.now()
  const isDemo = (await m.atoms.demo.read()) !== null
  const started = isDemo ? null : await startPress(m.hostOf(currentOwner(), surface), p, false, holds, undefined, when)
  const demo = isDemo ? await runDemoPress(m, pressId, p, holds, now) : null
  const effects = started?.effects ?? (demo?.hasEffects ? [] : null)
  if (effects) {
    if (mayStayOnRow && effects.some(effect => effect.kind === 'send')) cancelUndoScroll()
    const undoKey = await undoKeyAfterPress(m, p, surface)
    const isUndoCurrent = () => undoRevision === paneState.undoScrollRevision
    if (undoKey !== null && isUndoCurrent()) {
      if (paneState.isInlineTerminalPane) await keepUndoVisible(m, undoKey, pressRowId(p), now, undoRevision)
      void m.focusPaneKey(undoKey, isUndoCurrent).catch(() => undefined)
    }
  }
  const outcome = started ? await started.finish() : null
  if (outcome?.wakesAfterSettle) later(m, SETTLED_MS, () => wakeAfterSettle(m))
  if (outcome?.isRowFailed) void m.publishStatus()
  const settled: SettledOutcome = outcome
    ? {
        error: outcome.error,
        note: outcome.note,
        isUnconfirmed: outcome.isUnconfirmed,
        isRowFailed: outcome.isRowFailed,
      }
    : (demo?.outcome ?? { error: null, note: 'stale', isUnconfirmed: false })
  await m.sendUi(['read', { type: 'press-settled', pressId, outcome: settled }], surface)
}

async function undoKeyAfterPress(
  m: PressRunCalls,
  p: RowPress | PrPress,
  surface?: UiPressArgument['surface'],
): Promise<string | null> {
  if (surface !== 'terminal') return null
  const { view } = await drawnState(m)
  if (isPrPress(p)) {
    const block = prUndoBlockAfter(view.prs.drawn, p)
    return block ? `undo-${block}` : null
  }
  const row = allRows(view).find(r => r.id === p.id)
  return row?.state.is === 'settled' && row.actions.some(a => a.press.action === 'undo')
    ? `undo-${pressRowId(p)}`
    : null
}

/** Takes a dismissed PR off the tab once its row settles, unless it is still tracked or the Dismiss was undone. */
/** Sends the answers and Fixes held for Undo, and tells Claude about rows closed with Done, once their settle window has passed. */
export async function wakeAfterSettle(m: PressRunCalls) {
  await wakeSessionAfterSettle(m.hostOf(currentOwner()))
}

/**
 * Sends the held messages that are due, and wakes again when the next one falls due. A load or a pane opening calls
 * it, since the timer a press started does not survive a reload.
 */
export async function wakeForHeldSends(m: PressRunCalls) {
  await wakeAfterSettle(m)
  const [{ lastActions }, now] = await Promise.all([m.atoms.session.read(), m.clock.now()])
  const dueTimes = Object.values(lastActions).flatMap(a => (a.delivery?.state === 'held' ? [a.delivery.until] : []))
  if (dueTimes.length > 0) later(m, Math.max(0, Math.min(...dueTimes) - now), () => wakeAfterSettle(m))
}
