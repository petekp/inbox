import { mock, setSystemTime } from 'bun:test'
import { allOf, appModules, keysHolder, openPanel, typeIn } from '../herdr/tests/gpui-stand-in'
import { SESSION_LABEL } from '../core/remote/herdr-labels'
import type { Painted } from '../herdr/tests/gpui-stand-in'
import type { Block } from '../herdr/src/blocks'
import type { Step } from '../herdr/tests/frames'
import type { SessionView } from '../core/view/session-view'
import { notesOf } from '../core/view/ui-controller'
import { holdsOf } from '../core/view/ui-controller-reply'
import type { LookUi } from '../herdr/src/draw'
import type { Case, Ev } from './case'
import { fuzzHost } from './host'
import { isAgentEv, runAgent } from './agent'

type File = { text: string; at: number }
const files = new Map<string, File>()
let isEnded = false
const ok = { code: 0, stdout: '', stderr: '' }

mock.module('herdr', () => ({
  ...appModules.herdr,
  readTextFile: async (path: string) => files.get(path)?.text ?? null,
  writeTextFile: async (path: string, text: string) => (files.set(path, { text, at: Date.now() }), null),
  exec: async (command: string, args: string[]) => {
    if (command !== 'mv') return ok
    const had = files.delete(args[0] ?? '')
    return had ? ok : { ...ok, code: 1 }
  },
  terminals: () => [
    isEnded
      ? { address: 't1', labels: {}, program: { name: 'zsh', shell: true } }
      : { address: 't1', labels: { [SESSION_LABEL]: 's1' }, program: { name: 'Claude Code', shell: false } },
    { address: 't2', labels: {}, program: { name: 'zsh', shell: true } },
  ],
}))

const motion = await import('../herdr/src/motion')
const { readView } = await import('../herdr/src/screen')
const realMoveRows = motion.moveRows
let wasInput = false
let wasFirst = false
mock.module('../herdr/src/motion', () => ({
  ...motion,
  moveRows: (...args: Parameters<typeof realMoveRows>) => {
    wasFirst = args[3]
    wasInput = args[4] ?? false
    return realMoveRows(...args)
  },
}))
const { publishedText, startedFile, startHerdrFile } = await import('../core/remote/herdr-app')
const { wakeAfterSettle } = await import('../core/runtime/host-press')
const { SETTLED_MS } = await import('../core/view/timing')

/** How long after a press's settle window a host wakes to send what the press held, as `wakeLater` in `omp/src/host-sessions.ts` waits. */
const WAKE_AFTER_MS = SETTLED_MS + 250
const { publishedSessionPath } = await import('../core/remote/herdr')
const { pressFile } = await import('../core/remote/herdr-press-file')
const { REREAD_MS, AGE_TICK_MS } = await import('../herdr/src/status-look')
const { lookUiOf } = await import('../herdr/src/controller')

export const START = Date.UTC(2026, 10, 10, 12)

/** One draw of the look: when, after which event, its painted tree, its blocks, and the view and look state it drew. */
export type HerdrDraw = {
  at: number
  after: number
  root: Painted
  blocks: Block[]
  view: SessionView | null
  ui: LookUi
  isMessage: boolean
}

/** `notes` says what each event did, such as the button a click pressed. */
export type HerdrRun = {
  draws: HerdrDraw[]
  steps: Step[]
  /** The times of the draws that showed a new page, a tab, Help or session, which the view draws at rest. */
  pageAt: number[]
  notes: string[]
  error: { at: number; after: number; message: string } | null
}

type Timer = { at: number; every: number | null; fn: (cx: unknown) => void; isCancelled: boolean }

/**
 * The time between the draw a person sees and their input, so the view takes the input as a move after that draw, as it
 * always is live. Input targets that draw's tree.
 */
const INPUT_GAP_MS = 1

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0))
}

/** Runs a case through the Herdr look's own view, with the host applying its press files from an in-memory folder. */
export async function runHerdr(c: Case, restMs = 3000): Promise<HerdrRun> {
  files.clear()
  isEnded = false
  let clock = START
  setSystemTime(new Date(clock))
  const host = fuzzHost(structuredClone(c.session), c.outcomes)
  let isPublished = false
  const source = { host: 'claude-code' as const, agent: 'Claude', sessionId: 's1', terminal: 't1' }
  const publish = () => {
    const text = publishedText({ ...source, writtenAt: Date.now() }, host.state(), () => {})
    files.set(publishedSessionPath('/app', 's1'), { text, at: Date.now() })
    isPublished = true
  }
  host.changed.add(publish)
  publish()
  const p = await openPanel()
  const timers: Timer[] = []
  const add = (ms: number, fn: Timer['fn'], every: number | null) => {
    const t: Timer = { at: clock + Math.max(0, ms), every, fn, isCancelled: false }
    timers.push(t)
    return { cancel: () => void (t.isCancelled = true) }
  }
  Object.assign(p.cx, {
    timer: {
      after: (ms: number, fn: Timer['fn']) => add(ms, fn, null),
      every: (ms: number, fn: Timer['fn']) => add(ms, fn, ms),
    },
  })
  add(REREAD_MS, () => p.panel.sessionId && p.panel.load(p.panel.sessionId, p.cx as never), REREAD_MS)
  add(AGE_TICK_MS, () => p.panel.viewCache.prepare(p.cx as never, true), AGE_TICK_MS)
  await settle()

  const draws: HerdrDraw[] = []
  const notes: string[] = []
  const steps: Step[] = []
  const pageAt: number[] = []
  let after = -1
  const draw = () => {
    wasInput = false
    wasFirst = false
    const root = p.paint()
    const isInput = wasInput
    if (wasFirst && pageAt.at(-1) !== clock - START) pageAt.push(clock - START)
    const blocks = p.panel.blocks
    const read = p.panel.readSession
    const view = read && readView(read, clock, holdsOf(p.panel.ui, clock), notesOf(p.panel.ui))
    draws.push({
      at: clock - START,
      after,
      root,
      blocks,
      view,
      ui: lookUiOf(p.panel.ui, view),
      isMessage: p.panel.readSession === null,
    })
    const last = steps.at(-1)
    if (last && last[0] === clock - START) steps.pop()
    steps.push(isInput ? [clock - START, blocks, 'input'] : [clock - START, blocks])
  }
  const reread = async () => {
    if (!isPublished) return
    isPublished = false
    if (p.panel.sessionId) p.panel.load(p.panel.sessionId, p.cx as never)
    await settle()
  }
  const takePresses = async () => {
    if (c.takeAfterMs === null) return false
    const due = [...files].filter(([path, f]) => path.includes('/presses/') && f.at + (c.takeAfterMs ?? 0) <= clock)
    for (const [path, f] of due) {
      files.delete(path)
      const read = pressFile(f.text)
      if (!read.ok) continue
      const started = startedFile(await startHerdrFile(host, read.file, 's1'), outcome => {
        if (outcome.wakesAfterSettle) add(WAKE_AFTER_MS, () => void wakeAfterSettle(host), null)
      })
      if (started.waiting) host.held.push(started.waiting)
    }
    return due.length > 0
  }
  const nextDue = () => {
    const pressAt =
      c.takeAfterMs === null
        ? Infinity
        : Math.min(
            ...[...files].filter(([path]) => path.includes('/presses/')).map(([, f]) => f.at + (c.takeAfterMs ?? 0)),
          )
    const timerAt = Math.min(...timers.filter(t => !t.isCancelled).map(t => t.at))
    return Math.min(pressAt, timerAt)
  }
  const wait = async (ms: number) => {
    const end = clock + ms
    for (let guard = 0; guard < 400; guard++) {
      const at = nextDue()
      if (at > end) break
      clock = Math.max(clock, at)
      setSystemTime(new Date(clock))
      const fired = timers.filter(t => !t.isCancelled && t.at <= clock)
      for (const t of fired) {
        if (t.every === null) t.isCancelled = true
        else t.at = clock + t.every
        t.fn(p.cx)
      }
      await settle()
      await takePresses()
      await reread()
      draw()
    }
    clock = end
    setSystemTime(new Date(clock))
  }

  draw()
  try {
    for (const [i, e] of c.events.entries()) {
      after = i
      notes.push((await apply(e)) ?? '')
      await settle()
      await reread()
      draw()
    }
    after = c.events.length
    await wait(restMs)
    draw()
  } catch (err) {
    return {
      draws,
      steps,
      pageAt,
      notes,
      error: { at: clock - START, after, message: err instanceof Error ? (err.stack ?? err.message) : String(err) },
    }
  }

  return { draws, steps, pageAt, notes, error: null }

  async function apply(e: Ev): Promise<string | void> {
    if (e.is === 'wait') return wait(e.ms)
    if (isAgentEv(e)) return runAgent(host, e)
    if (e.is === 'end') {
      isEnded = true
      return 'the terminal went back to its shell'
    }
    const field = keysHolder()
    const isTyping = field !== null && field !== 'panel'
    const root = draws.at(-1)?.root ?? p.paint()
    clock += INPUT_GAP_MS
    setSystemTime(new Date(clock))
    if (e.is === 'type') return isTyping ? (typeIn(field, e.text), 'typed in the open field') : 'no field is open'
    if (e.is === 'key') {
      if (isTyping && e.key === 'enter') return (field.submit(), 'submitted the open field')
      const text = e.text ?? (e.key.length === 1 ? e.key : undefined)
      if (isTyping && text !== undefined) return (typeIn(field, field.value() + text), 'typed in the open field')
      allOf(root)
        .find(n => n.keyDown !== null)
        ?.keyDown?.({ keystroke: e.key }, p.cx)
      return isTyping ? `pressed ${e.key} in the open field` : `pressed ${e.key}`
    }
    const nodes = allOf(root)
    if (e.on === 'row' || e.on === 'tab') {
      const targets = nodes.filter(n => n.id?.startsWith(e.on === 'row' ? 'row ' : 'tab ') && n.click !== null)
      const target = pickOf(targets, e)
      if (!target) return `no ${e.on} to click`
      p.click(target)
      return `clicked ${target.id}`
    }
    const selected = p.panel.blocks.find(b => b.kind === 'row' && b.isSelected)
    const row = selected && nodes.find(n => n.id === `row ${selected.id}`)
    const buttons = row ? allOf(row).filter(n => n.click !== null && n.label !== null) : []
    const button = pickOf(buttons, e)
    if (!button) return 'no button to click'
    p.click(button)
    return `clicked "${button.label}" on ${row?.id}`
  }
}

function pickOf(targets: Painted[], e: { n: number; label?: string }): Painted | undefined {
  const { label } = e
  if (label !== undefined) return targets.find(t => t.id?.includes(label) || t.label?.includes(label))

  return targets[e.n % Math.max(1, targets.length)]
}
