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
const { countCellsAsOmp } = await import('../omp/src/panel-view')

/** omp's TUI module, which counts cells as the installed omp does. Its source fails this project's strict type check, so tsc does not follow it. */
const PI_TUI: string = '../omp/node_modules/@oh-my-pi/pi-tui/src/index'
const piTui = await import(PI_TUI)

/** As `wakeLater` in `omp/src/host-sessions.ts` waits past the settle window. */
const WAKE_MARGIN_MS = 250

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

const ESC = String.fromCodePoint(0x1b)
const codesOf = (s: string) => [...s].map(c => c.codePointAt(0)).join(';')
const mark = (code: string, s: string) => `${ESC}[${code}m${s}${ESC}[0m`

/**
 * Marks each style with an escape that names it and its arguments, which omp measures as no width, so two draws that
 * differ only in style differ as text.
 */
const MARKED: Style = {
  bold: s => mark('1', s),
  dim: s => mark('2', s),
  inverse: s => mark('7', s),
  underline: s => mark('4', s),
  tone: (n, s) => mark(`90;${codesOf(n)}`, s),
  banner: (t, part, s) => mark(`91;${codesOf(t)};${codesOf(part)}`, s),
  tint: (t, share, s, rest) => mark(`92;${codesOf(t)};${Math.round(share * 1000)};${codesOf(rest ?? '')}`, s),
}

/** A draw's lines, plain, and `styled` with each style marked as `MARKED` does. */
export type OmpDraw = {
  at: number
  after: number
  lines: string[]
  styled: string[]
  view: SessionView | null
  ui: PanelUi | null
}

/**
 * How many chained promise callbacks a key's own draw waits for, as omp renders only after its handler's microtasks.
 * The stand-in host answers a press a timer later, as the live host reads and locks the session's files first.
 */
const MICROTASK_HOPS = 10

/**
 * A key the person pressed, by the indexes of three draws: the last before it, its own, drawn once the key's
 * microtasks have run, and the first after the work the key started settled.
 */
export type OmpKey = { key: string; before: number; own: number; settled: number }

export type OmpRun = {
  width: number
  draws: OmpDraw[]
  keys: OmpKey[]
  notes: string[]
  error: { at: number; after: number; message: string } | null
}

type Timer = { fn: () => void; ms: number; at: number; isOnce: boolean; isStopped: boolean }

const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * Runs a case through omp's own panel controller, over a source the in-memory host backs, as `omp/src/host-panel.ts`
 * builds the live one. It counts cells as omp does only while the case runs, since Herdr cases run in the same process.
 */
export async function runOmp(c: Case, restMs = 3000): Promise<OmpRun> {
  const restore = countCellsAsOmp(piTui)
  try {
    return await runOmpCase(c, restMs)
  } finally {
    restore()
  }
}

async function runOmpCase(c: Case, restMs: number): Promise<OmpRun> {
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
      await new Promise(resolve => setTimeout(resolve, 0))
      const outcome = await press(host, p, false, holds, undefined, when)
      if (outcome.wakesAfterSettle) add(() => void wakeAfterSettle(host), SETTLED_MS + WAKE_MARGIN_MS, true)
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
  let style = PLAIN
  const panel = createPanel({
    source,
    style: {
      bold: s => style.bold(s),
      dim: s => style.dim(s),
      inverse: s => style.inverse(s),
      underline: s => style.underline(s),
      tone: (n, s) => style.tone(n, s),
      banner: (t, part, s) => style.banner(t, part, s),
      tint: (t, share, s, rest) => style.tint(t, share, s, rest),
    },
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
  const keys: OmpKey[] = []
  const notes: string[] = []
  let after = -1
  const draw = () => {
    lastDrawn = null
    const lines = panel.render(c.width)
    const drawn = lastDrawn as Drawn | null
    style = MARKED
    const styled = panel.render(c.width)
    style = PLAIN
    draws.push({ at: clock - START, after, lines, styled, view: drawn?.view ?? null, ui: drawn?.ui ?? null })
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
    if (e.is === 'key') {
      const before = draws.length - 1
      panel.handleInput(e.key, e.text ?? (e.key.length === 1 ? e.key : undefined))
      for (let i = 0; i < MICROTASK_HOPS; i++) await Promise.resolve()
      draw()
      keys.push({ key: e.key, before, own: draws.length - 1, settled: draws.length })
      return `pressed ${e.key}`
    }
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
      keys,
      notes,
      error: { at: clock - START, after, message: err instanceof Error ? (err.stack ?? err.message) : String(err) },
    }
  } finally {
    panel.dispose()
  }

  return { width: c.width, draws, keys, notes, error: null }
}
