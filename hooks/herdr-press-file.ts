import { HERDR_FORMAT } from './herdr'
import type { PrPress } from './pr-press'
import type { RowPress } from './presses'
import type { Holds } from './timing'

/** A press the Herdr look made, with the look's holds, which `press()` needs to tell a stale press. */
export type PressFile = {
  format: typeof HERDR_FORMAT
  id: string
  pressedAt: number
  press: RowPress | PrPress
  holds: Holds
  /**
   * The outcome of the opens and copies the look ran itself, in the terms of a host's `perform`: why they could not run,
   * or null. Without it, the host runs them.
   */
  result?: { error: string | null }
}

/** The field that names what each press acts on: a row's `id`, a PR's `ref`, or none for the PRs tab's own buttons. */
const PRESS_TARGETS: Record<RowPress['action'] | PrPress['action'], 'id' | 'ref' | null> = {
  answer: 'id',
  type: 'id',
  explain: 'id',
  compare: 'id',
  done: 'id',
  dismiss: 'id',
  address: 'id',
  issue: 'id',
  discuss: 'id',
  undo: 'id',
  discard: 'id',
  step: 'id',
  'remove-goal': 'id',
  'restore-goal': 'id',
  'thread-address': 'ref',
  'thread-draft': 'ref',
  'thread-discuss': 'ref',
  'thread-open': 'ref',
  'pr-conflicts': 'ref',
  'pr-address-all': 'ref',
  'pr-merge': 'ref',
  'pr-open': 'ref',
  'pr-dismiss': 'ref',
  'pr-undo': 'ref',
  'check-fix': 'ref',
  'check-rerun': 'ref',
  log: 'ref',
  'pr-rank-again': null,
  'pr-refresh': null,
  'pr-clear-finished': null,
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

const isTimes = (x: unknown): x is Record<string, number> =>
  isRecord(x) && Object.values(x).every(at => typeof at === 'number')

/** Why `press` is not a press the hosts know, or null when it is one. */
function pressProblem(press: unknown): string | null {
  if (!isRecord(press) || typeof press.action !== 'string') return 'press has no action'
  if (!Object.hasOwn(PRESS_TARGETS, press.action)) return `unknown action ${press.action}`
  const target = PRESS_TARGETS[press.action as keyof typeof PRESS_TARGETS]

  return target === null || typeof press[target] === 'string' ? null : `${press.action} has no ${target}`
}

/** Why `holds` are not a look's holds, or null when they are. */
function holdsProblem(holds: unknown): string | null {
  if (!isRecord(holds)) return 'no holds'
  if (!isTimes(holds.replies) || !isTimes(holds.discarded)) return 'holds without replies or discarded times'

  return holds.shownSince === null || typeof holds.shownSince === 'number' ? null : 'holds without shownSince'
}

/** Why `result` is not the outcome of a press the look ran, or null when it is one or is absent. */
function resultProblem(result: unknown): string | null {
  if (result === undefined) return null

  return isRecord(result) && (result.error === null || typeof result.error === 'string') ? null : 'result without error'
}

/** A press file's text, read and checked. The look does not report list use, so none holds a row. `reason` says why a file was refused. */
export function pressFile(text: string): { ok: true; file: PressFile } | { ok: false; reason: string } {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'not JSON' }
  }
  if (!isRecord(file)) return { ok: false, reason: 'not an object' }
  if (file.format !== HERDR_FORMAT) return { ok: false, reason: `unknown format ${String(file.format)}` }
  if (typeof file.id !== 'string' || file.id === '') return { ok: false, reason: 'no id' }
  if (typeof file.pressedAt !== 'number' || !Number.isFinite(file.pressedAt))
    return { ok: false, reason: 'no pressedAt' }
  const reason = pressProblem(file.press) ?? holdsProblem(file.holds) ?? resultProblem(file.result)

  if (reason) return { ok: false, reason }
  const read = file as PressFile

  return { ok: true, file: { ...read, holds: { ...read.holds, listInput: null } } }
}
