import { mock, setSystemTime } from 'bun:test'
import type { SessionView } from '../core/view/session-view'
import type { PanelUi } from '../omp/src/panel'
import { press, wakeAfterSettle } from '../core/runtime/host-press'
import { withCollapse } from '../core/view/collapse'
import { sessionView } from '../core/view/session-view'
import { NO_SYNC_INPUTS } from '../core/view/sync-state'
import { SETTLED_MS } from '../core/view/timing'
import type { PanelSource } from '../omp/src/controller'
import type { Style } from '../omp/src/panel'
import type { Case, Ev } from './case'
import { fuzzHost } from './host'
import { isAgentEv, runAgent } from './agent'
import { START } from './gen'

const drawing = await import('../omp/src/panel')
const realDrawPanel = drawing.drawPanel
type Drawn = { view: SessionView; ui: PanelUi }
let lastDrawn: Drawn | null = null
mock.module('../omp/src/panel', () => ({
  ...drawing,
  drawPanel: (...args: Parameters<typeof realDrawPanel>) => {
    lastDrawn = { view: args[0].view, ui: args[1] }
    return realDrawPanel(...args)
  },
}))
const { createPanel } = await import('../omp/src/controller')

/** Draws every style as plain text, so any escape in a line came from the input. */
const PLAIN: Style = {
  bold: s => s,
  dim: s => s,
  inverse: s => s,
  underline: s => s,
  tone: (_n, s) => s,
  banner: (_t, _p, s) => s,
  tint: (_tone, _share, s) => s,
}

export type OmpDraw = { at: number; after: number; lines: string[]; view: SessionView | null; ui: PanelUi | null }

export type OmpRun = {
  width: number
  draws: OmpDraw[]
  notes: string[]
  error: { at: number; after: number; message: string } | null
}

type Timer = { fn: () => void; ms: number; at: number; isOnce: boolean; isStopped: boolean }

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

/** Runs a case through omp's own panel controller, over a source the in-memory host backs, as `omp/src/host-panel.ts` builds the live one. */
export async function runOmp(c: Case, restMs = 3000): Promise<OmpRun> {
  let clock = START
  setSystemTime(new Date(clock))
  const host = fuzzHost(structuredClone(c.session), c.outcomes)
  const timers: Timer[] = []
  const add = (fn: () => void, ms: number, isOnce: boolean) =>
    timers.push({ fn, ms, at: clock + ms, isOnce, isStopped: false }) - 1
  const listeners = new Set<() => void>()
  host.changed.add(() => listeners.forEach(l => l()))
  let isClosed = false
  const source: PanelSource = {
    screen: async (holds, notes) => ({
      view: sessionView(host.state(), Date.now(), SETTLED_MS, holds, notes, false, NO_SYNC_INPUTS),
      modelName: 'Claude Sonnet 5.5',
      isSignedIn: true,
      isGhMissing: false,
      isFetchingPrs: false,
      stop: null,
      version: '1.2.3',
    }),
    press: async (p, holds, _pressId, when) => {
      const outcome = await press(host, p, false, holds, undefined, when)
      if (outcome.wakesAfterSettle) add(() => void wakeAfterSettle(host), SETTLED_MS, true)
      return {
        error: outcome.error,
        note: outcome.note,
        isUnconfirmed: outcome.isUnconfirmed,
        isRowFailed: outcome.isRowFailed,
      }
    },
    resume: async () => null,
    collapse: async (id, isCollapsed) => host.set(s => withCollapse(s, id, isCollapsed, Date.now())),
    savedUi: async () => null,
    keepUi: () => {},
    fetchPrsWhenDue: () => {},
    checkDelegatesWhenDue: () => {},
    shown: () => {},
    showedRows: () => {},
    onChange: listener => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  const panel = createPanel({
    source,
    style: PLAIN,
    now: () => Date.now(),
    openedAt: clock,
    requestRender: () => {},
    close: () => void (isClosed = true),
    timers: {
      every: (fn, ms) => add(fn, ms, false),
      after: (fn, ms) => add(fn, ms, true),
      stop: handle => {
        const t = timers[handle as number]
        if (t) t.isStopped = true
      },
    },
    height: () => undefined,
  })
  const draws: OmpDraw[] = []
  const notes: string[] = []
  let after = -1
  const draw = () => {
    lastDrawn = null
    const lines = panel.render(c.width)
    const drawn = lastDrawn as Drawn | null
    draws.push({ at: clock - START, after, lines, view: drawn?.view ?? null, ui: drawn?.ui ?? null })
  }
  const wait = async (ms: number) => {
    const end = clock + ms
    for (let guard = 0; guard < 400; guard++) {
      const due = timers.filter(t => !t.isStopped && t.at <= end).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      clock = Math.max(clock, due.at)
      setSystemTime(new Date(clock))
      if (due.isOnce) due.isStopped = true
      else due.at = clock + due.ms
      due.fn()
      await flush()
      draw()
    }
    clock = end
    setSystemTime(new Date(clock))
  }
  const apply = async (e: Ev): Promise<string> => {
    if (e.is === 'wait') return (await wait(e.ms), '')
    if (isAgentEv(e)) return runAgent(host, e)
    if (e.is === 'type') {
      for (const ch of e.text) panel.handleInput(ch, ch)
      return 'typed'
    }
    if (e.is === 'key') return (panel.handleInput(e.key, e.text), `pressed ${e.key}`)
    return ''
  }

  try {
    await panel.start()
    await flush()
    draw()
    for (const [i, e] of c.events.entries()) {
      if (isClosed) break
      after = i
      notes.push(await apply(e))
      await flush()
      draw()
    }
    after = c.events.length
    if (!isClosed) await wait(restMs)
    draw()
  } catch (err) {
    return {
      width: c.width,
      draws,
      notes,
      error: { at: clock - START, after, message: err instanceof Error ? (err.stack ?? err.message) : String(err) },
    }
  } finally {
    panel.dispose()
  }

  return { width: c.width, draws, notes, error: null }
}
