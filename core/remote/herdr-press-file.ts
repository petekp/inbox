import type { RemoteViewerUpdate } from '../runtime/remote-viewers'
import type { RemoteCommand } from './remote-commands'
import { HERDR_FORMAT } from './herdr'
import type { PrPress } from '../view/pr-press'
import type { RowPress } from '../domain/presses'
import type { ReportedLook } from '../domain/status-children'
import { listInputOf } from '../view/timing'
import type { Holds } from '../view/timing'

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

/** A row the person collapsed in the Herdr look, or expanded, at `at`. */
export type CollapseFile = {
  format: typeof HERDR_FORMAT
  id: string
  collapse: { row: string; isCollapsed: boolean; at: number }
}

/** A report, written while the Herdr look shows a session's PRs tab, that it shows it at `at`. */
type PrsShownFile = { format: typeof HERDR_FORMAT; id: string; prsShown: { at: number } }

/** A file the Herdr look writes to a session's press folder. */
export type HerdrFile = PressFile | LookFile | CollapseFile | PrsShownFile | RemoteCommand | RemoteViewerUpdate

export const isLookFile = (file: HerdrFile): file is LookFile => 'look' in file

export const isPrsShownFile = (file: HerdrFile): file is PrsShownFile => 'prsShown' in file

export const isPressFile = (file: HerdrFile): file is PressFile => file.format === HERDR_FORMAT && 'press' in file

/** When a file's press or collapse was made, or its look ended, so a host applies a folder's files in that order. */
export const fileTime = (file: HerdrFile) =>
  file.format === 2
    ? file.issuedAt
    : isLookFile(file)
      ? file.look.endedAt
      : isPrsShownFile(file)
        ? file.prsShown.at
        : isPressFile(file)
          ? file.pressedAt
          : file.collapse.at

/** The field that names what each press acts on: a row's `id`, a PR's `ref`, or none for the PRs tab's own buttons. */
const PRESS_TARGETS: Record<RowPress['action'] | PrPress['action'], 'id' | 'ref' | null> = {
  answer: 'id',
  type: 'id',
  explain: 'id',
  'show-explanation': 'id',
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
  'take-goal': 'id',
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
  if (!isTime(look.drawnWrittenAt)) return 'look without when its Status was written'

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
  if (file.format === 2 && file.kind === 'viewer') {
    const ids = (value: unknown) =>
      Array.isArray(value) &&
      value.length <= 256 &&
      value.every(id => typeof id === 'string' && /^[\w-]{1,100}$/.test(id))
    const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    const valid =
      typeof file.id === 'string' &&
      /^[\w-]{16,100}$/.test(file.id) &&
      typeof file.session === 'string' &&
      /^[\w-]{1,100}$/.test(file.session) &&
      isTime(file.issuedAt) &&
      integer(file.generation) &&
      integer(file.sequence) &&
      typeof file.active === 'boolean' &&
      typeof file.listActive === 'boolean' &&
      (file.seenAt === undefined || isTime(file.seenAt)) &&
      (file.visibleForMs === undefined || (isTime(file.visibleForMs) && file.visibleForMs >= 0)) &&
      ['overview', 'needsYou', 'findings', 'prs'].includes(String(file.tab)) &&
      ids(file.replies) &&
      ids(file.shownRows)
    return valid ? { ok: true, file: file as RemoteViewerUpdate } : { ok: false, reason: 'invalid remote viewer' }
  }
  if (file.format === 2 && file.kind === 'command') {
    const isGoalPress = isRecord(file.press) && file.press.id === 'goal'
    const valid =
      typeof file.id === 'string' &&
      /^[a-z0-9]{1,12}-[a-zA-Z0-9_-]{16,100}$/.test(file.id) &&
      typeof file.session === 'string' &&
      /^[\w-]{1,100}$/.test(file.session) &&
      isTime(file.issuedAt) &&
      Number.isSafeInteger(file.issuedAt) &&
      file.issuedAt >= 0 &&
      typeof file.expected === 'string' &&
      file.expected.length <= 16000 &&
      pressProblem(file.press) === null &&
      isRecord(file.press) &&
      typeof file.press.id === 'string' &&
      (isGoalPress || /^[if]\d{1,16}$/.test(file.press.id)) &&
      (file.press.action === 'type'
        ? typeof file.press.text === 'string' && file.press.text.trim() !== '' && file.press.text.length <= 8000
        : file.press.action === 'answer'
          ? !isGoalPress &&
            typeof file.press.option === 'string' &&
            file.press.option.length <= 8000 &&
            file.press.option.trim() !== ''
          : (isGoalPress
              ? ['remove-goal', 'restore-goal', 'take-goal']
              : ['done', 'address', 'undo', 'dismiss', 'discuss', 'explain', 'compare', 'issue', 'discard']
            ).includes(String(file.press.action)))
    return valid ? { ok: true, file: file as RemoteCommand } : { ok: false, reason: 'invalid remote command' }
  }
  if (file.format !== HERDR_FORMAT) return { ok: false, reason: `unknown format ${String(file.format)}` }
  if (typeof file.id !== 'string' || file.id === '') return { ok: false, reason: 'no id' }
  if ('look' in file) {
    const reason = lookProblem(file.look)
    return reason ? { ok: false, reason } : { ok: true, file: file as LookFile }
  }
  if ('prsShown' in file) {
    return isRecord(file.prsShown) && isTime(file.prsShown.at)
      ? { ok: true, file: file as PrsShownFile }
      : { ok: false, reason: 'prsShown without a time' }
  }
  if ('collapse' in file) {
    const c = file.collapse
    const isCollapse = isRecord(c) && typeof c.row === 'string' && typeof c.isCollapsed === 'boolean' && isTime(c.at)
    return isCollapse ? { ok: true, file: file as CollapseFile } : { ok: false, reason: 'collapse without row or time' }
  }
  if (typeof file.pressedAt !== 'number' || !Number.isFinite(file.pressedAt))
    return { ok: false, reason: 'no pressedAt' }
  const reason = pressProblem(file.press) ?? holdsProblem(file.holds) ?? resultProblem(file.result)

  if (reason) return { ok: false, reason }
  const read = file as PressFile

  return { ok: true, file: { ...read, holds: { ...read.holds, listInput: listInputOf(read.holds.listInput) } } }
}
