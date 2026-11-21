import type { PrPress } from '../../core/view/pr-press'
import { isCompareInBackground } from '../../core/domain/press-messages'
import { withCollapse } from '../../core/view/collapse'
import { demoAfterPress, demoReplied, demoSent } from '../../core/runtime/press-effects'
import type { RowPress } from '../../core/domain/presses'
import { pressOn } from '../../core/runtime/session-presses'
import { SETTLED_MS } from '../../core/view/timing'
import type { Holds } from '../../core/view/timing'
import type { TabView } from './core'
import { demoState } from './demo'
import type { PressReply, ServerDeps } from './server'
import { SETTLE_WINDOW_MS } from './settle'
import type { SessionState } from './state'

export function makeDemo(
  deps: ServerDeps,
  served: (s: SessionState, id: string, isDemo?: boolean, holds?: Holds) => Promise<TabView>,
) {
  const { now } = deps

  const demos = new Map<string, SessionState>()
  const demoOf = (id: string) => {
    const s = demos.get(id) ?? demoState(now())
    demos.set(id, s)
    return s
  }

  async function onDemoPress(id: string, p: RowPress | PrPress, thread: unknown, holds: Holds): Promise<PressReply> {
    const s = demoOf(id)
    const r =
      thread === id
        ? pressOn(
            s,
            p,
            now(),
            { settleWindowMs: SETTLE_WINDOW_MS, holds },
            {
              comparePage: deps.comparePage,
              compareInBackground: isCompareInBackground('codex'),
            },
          )
        : ({ stale: true } as const)
    if ('stale' in r) return { view: await served(s, id, true, holds), copy: null, error: null, note: 'stale' }
    const after = demoAfterPress(
      { lastActions: s.lastActions, turns: s.presence },
      r,
      new Set(Object.keys(holds.replies)),
    )
    const next: SessionState = {
      ...s,
      ledger: after.ledger,
      lastActions: after.lastActions,
      presence: { ...s.presence, ...after.turns },
    }
    demos.set(id, next)
    const sent = demoSent(r, after.turns)
    if (sent)
      setTimeout(() => {
        const d = demos.get(id)
        if (!d) return
        const replied = demoReplied({ lastActions: d.lastActions, turns: d.presence }, sent)
        demos.set(id, { ...d, lastActions: replied.lastActions, presence: { ...d.presence, ...replied.turns } })
      }, SETTLED_MS).unref()

    return {
      view: await served(next, id, true, holds),
      copy: null,
      error: null,
      note: null,
    }
  }

  async function collapseDemo(id: string, row: string, isCollapsed: boolean, holds: Holds): Promise<TabView> {
    const next = withCollapse(demoOf(id), row, isCollapsed, now())
    demos.set(id, next)
    return served(next, id, true, holds)
  }

  return { demoOf, onDemoPress, collapseDemo }
}
