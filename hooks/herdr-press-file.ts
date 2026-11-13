import { HERDR_FORMAT } from './herdr'
import type { PrPress } from './pr-press'
import type { RowPress } from './presses'
import type { ReportedLook } from './status-children'
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

/** A look at the Status the Herdr look drew, written once the look ended. It has no press. */
type LookFile = { format: typeof HERDR_FORMAT; id: string; look: ReportedLook }

/** A file the Herdr look writes to a session's press folder. */
export type HerdrFile = PressFile | LookFile

export const isLookFile = (file: HerdrFile): file is LookFile => 'look' in file

/** When a file's press was made, or its look ended, so a host applies a folder's files in that order. */
export const fileTime = (file: HerdrFile) => (isLookFile(file) ? file.look.endedAt : file.pressedAt)

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

const isTime = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** Why `look` is not a look the Herdr look reports, or null when it is one. */
function lookProblem(look: unknown): string | null {
  if (!isRecord(look) || !isTime(look.startedAt) || !isTime(look.endedAt)) return 'look without its times'
  if (look.endedAt < look.startedAt) return 'look ends before it starts'

  return isTimes(look.shown) ? null : 'look without shown rows'
}

/**
 * A press file's text, read and checked: a press, or a look the Herdr look reports. The look does not report list use,
 * so no press holds a row. `reason` says why a file was refused.
 */
export function pressFile(text: string): { ok: true; file: HerdrFile } | { ok: false; reason: string } {
  let file: unknown
  try {
    file = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'not JSON' }
  }
  if (!isRecord(file)) return { ok: false, reason: 'not an object' }
  if (file.format !== HERDR_FORMAT) return { ok: false, reason: `unknown format ${String(file.format)}` }
  if (typeof file.id !== 'string' || file.id === '') return { ok: false, reason: 'no id' }
  if ('look' in file) {
    const reason = lookProblem(file.look)
    return reason ? { ok: false, reason } : { ok: true, file: file as LookFile }
  }
  if (typeof file.pressedAt !== 'number' || !Number.isFinite(file.pressedAt))
    return { ok: false, reason: 'no pressedAt' }
  const reason = pressProblem(file.press) ?? holdsProblem(file.holds) ?? resultProblem(file.result)

  if (reason) return { ok: false, reason }
  const read = file as PressFile

  return { ok: true, file: { ...read, holds: { ...read.holds, listInput: null } } }
}
