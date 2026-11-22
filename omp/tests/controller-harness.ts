import { SETTLED_MS } from '../../core/view/timing'
import type { UiState } from '../../core/view/ui-controller-types'
import type { Draft } from '../../types'
import { createPanel } from '../src/controller'
import type { PanelSource } from '../src/controller'
import { demoSource } from '../src/demo'
import type { PanelPress, Style } from '../src/panel'

const style: Style = {
  bold: s => s,
  dim: s => s,
  inverse: s => s,
  underline: s => s,
  tone: (_n, s) => s,
  banner: (_t, _p, s) => s,
  tint: (_tone, _share, s) => s,
}
export const flush = () => new Promise(resolve => setTimeout(resolve, 0))

type Timer = { fn: () => void; ms: number; dueAt: number; isOnce: boolean; stopped: boolean }

export const demoOf = (now: () => number) =>
  demoSource({
    inboxModel: { modelName: 'Claude Sonnet 5.5', isSignedIn: true },
    now,
    settleWindowMs: SETTLED_MS,
    version: '1.2.3',
    isNextBuild: true,
    comparePage: '/omp/dist/compare-page.html',
  })

export function open(overrides: Partial<PanelSource> = {}) {
  let now = 1_700_000_000_000
  const timers: Timer[] = []
  const pressed: PanelPress[] = []
  const calls = { renders: 0, closes: 0, fetches: 0, reads: 0 }
  const demo = demoOf(() => now)
  const source: PanelSource = {
    ...demo,
    screen: async (holds, notes) => {
      calls.reads++
      return demo.screen(holds, notes)
    },
    press: async (p, holds, pressId) => {
      pressed.push(p)

      return demo.press(p, holds, pressId)
    },
    fetchPrsWhenDue: () => void calls.fetches++,
    ...overrides,
  }
  const panel = createPanel({
    source,
    style,
    now: () => now,
    openedAt: now,
    requestRender: () => void calls.renders++,
    close: () => void calls.closes++,
    timers: {
      every: (fn, ms) => timers.push({ fn, ms, dueAt: now + ms, isOnce: false, stopped: false }) - 1,
      after: (fn, ms) => timers.push({ fn, ms, dueAt: now + ms, isOnce: true, stopped: false }) - 1,
      stop: handle => void (timers[handle as number]!.stopped = true),
    },
    height: () => undefined,
  })
  const wakes = () => timers.filter(t => t.isOnce && !t.stopped)
  async function runFor(ms: number): Promise<void> {
    const end = now + ms
    for (let wake = wakes()[0]; wake && wake.dueAt <= end; wake = wakes()[0]) {
      now = Math.max(now, wake.dueAt)
      wake.stopped = true
      wake.fn()
      for (let turn = 0; turn < 20; turn++) await Promise.resolve()
    }
    await flush()
    now = end
  }

  return {
    panel,
    timers,
    pressed,
    calls,
    source,
    wakes,
    runFor,
    now: () => now,
    advance: (ms: number) => void (now += ms),
  }
}

export function sharingUi() {
  const kept: { ui: UiState | null; drafts: Record<string, Draft>; saves: string[][] } = {
    ui: null,
    drafts: {},
    saves: [],
  }
  const overrides: Partial<PanelSource> = {
    savedUi: async () => kept.ui,
    keepUi: ui => {
      kept.ui = ui
      kept.drafts = ui.drafts
      kept.saves.push(Object.values(ui.drafts).map(d => d.text))
    },
  }

  return { kept, overrides }
}
