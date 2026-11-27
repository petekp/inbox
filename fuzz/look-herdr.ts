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
let wasMoved = false
mock.module('../herdr/src/motion', () => ({
  ...motion,
  moveRows: (...args: Parameters<typeof realMoveRows>) => {
    wasMoved = true
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
const { fetchedIds } = await import('../herdr/src/fetched')

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
  /** The times of the draws that followed the person's key, click or typing. */
  inputAt: number[]
  /** Each key, click or typing, by its index in the case and the time it started. */
  inputStarts: { after: number; at: number }[]
  /** Each press and the host's answer to it: the draw's time, the block pressed and the press's label or key. */
  presses: Press[]
  /** The blocks a read changed in each draw that was not the host's answer to a press, by the draw's time. */
  fetchedAt: Map<number, ReadonlySet<string>>
  notes: string[]
  error: { at: number; after: number; message: string } | null
}

/**
 * A press, or the host taking its press file: when it came, the index of the case's event it came in, the index of
 * the first draw after it, the block pressed and the press's label or key.
 */
export type Press = { at: number; after: number; draw: number; block: string; label: string; by: 'person' | 'host' }

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
  const inputAt: number[] = []
  const inputStarts: HerdrRun['inputStarts'] = []
  const presses: Press[] = []
  /** The block and label of each press file the look wrote, by path, so the host's answer names them. */
  const pressed = new Map<string, Pick<Press, 'block' | 'label'>>()
  const fetchedAt = new Map<number, ReadonlySet<string>>()
  let drawnRead = p.panel.readSession
  let after = -1
  let wasMessage = false
  const draw = () => {
    wasInput = false
    wasFirst = false
    wasMoved = false
    const isMove = p.panel.movedAt > p.panel.tracks.drawnAt
    const root = p.paint()
    const isInput = wasInput
    const isMessageShown = !wasMoved && !wasMessage
    wasMessage = !wasMoved
    if ((wasFirst || isMessageShown) && pageAt.at(-1) !== clock - START) pageAt.push(clock - START)
    const blocks = p.panel.blocks
    const read = p.panel.readSession
    const fetched = isInput && !isMove ? [] : [...fetchedIds(p.panel, drawnRead, read, p.panel.ui, clock)]
    drawnRead = read
    if (fetched.length > 0) fetchedAt.set(clock - START, new Set([...(fetchedAt.get(clock - START) ?? []), ...fetched]))
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
    const isSameMs = last !== undefined && last[0] === clock - START
    if (isSameMs) steps.pop()
    const isInputMs = isInput || (isSameMs && last[2] === 'input')
    steps.push(isInputMs ? [clock - START, blocks, 'input'] : [clock - START, blocks])
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
      const from = pressed.get(path)
      if (from) presses.push({ ...from, at: clock - START, after, draw: draws.length, by: 'host' })
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
      const filesBefore = new Set(files.keys())
      const outBefore = new Set(Object.keys(p.panel.ui.pressesOut))
      const target = { block: null as string | null }
      const startedAt = clock - START
      const drawsBefore = draws.length
      if (isPersonEv(e)) inputStarts.push({ after: i, at: startedAt })
      notes.push((await apply(e, target)) ?? '')
      await settle()
      const outNow = Object.entries(p.panel.ui.pressesOut).filter(([id]) => !outBefore.has(id))
      const block = target.block ?? outNow[0]?.[1].rowId ?? null
      if (block !== null && (e.is === 'click' || e.is === 'key')) {
        const label = e.is === 'key' ? e.key : (notes.at(-1)?.match(/"(.*)"/)?.[1] ?? '')
        presses.push({ at: startedAt, after: i, draw: drawsBefore, block, label, by: 'person' })
        for (const path of files.keys())
          if (path.includes('/presses/') && !filesBefore.has(path)) pressed.set(path, { block, label })
      }
      await reread()
      draw()
      if (isPersonEv(e)) inputAt.push(clock - START)
    }
    after = c.events.length
    await wait(restMs)
    draw()
  } catch (err) {
    return {
      draws,
      steps,
      pageAt,
      inputAt,
      inputStarts,
      presses,
      fetchedAt,
      notes,
      error: { at: clock - START, after, message: err instanceof Error ? (err.stack ?? err.message) : String(err) },
    }
  }

  return { draws, steps, pageAt, inputAt, inputStarts, presses, fetchedAt, notes, error: null }

  async function apply(e: Ev, target: { block: string | null }): Promise<string | void> {
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
    const own = row ? allOf(row).filter(n => n.click !== null && n.label !== null) : []
    const others = nodes.filter(
      n => n.id?.startsWith('button ') && n.click !== null && n.label !== null && !own.includes(n) && isVisible(n),
    )
    const button = pickOf([...own, ...others], e)
    if (!button) return 'no button to click'
    p.click(button)
    target.block = own.includes(button) ? (selected?.id ?? null) : blockOfNode(button)
    return `clicked "${button.label}" on ${target.block ?? 'the list'}`
  }
}

/**
 * Whether a person can see a node: no box around it is set to no opacity. A box set to no height is not hidden, since a
 * box that fits its content holds no height until Herdr measures it a draw later.
 */
function isVisible(n: Painted): boolean {
  for (let up: Painted | null = n; up; up = up.parent) if (up.style.opacity === 0) return false
  return true
}

/** The block a drawn node belongs to: the id of the nearest box around it, as the frame stand-in names a text's block. */
function blockOfNode(n: Painted): string | null {
  for (let up: Painted | null = n; up; up = up.parent) if (up.id?.startsWith('box ')) return up.id.slice(4)
  return null
}

const isPersonEv = (e: Ev): boolean => e.is === 'key' || e.is === 'click' || e.is === 'type'

function pickOf(targets: Painted[], e: { n: number; label?: string }): Painted | undefined {
  const { label } = e
  if (label !== undefined) return targets.find(t => t.id?.includes(label) || t.label?.includes(label))

  return targets[e.n % Math.max(1, targets.length)]
}
