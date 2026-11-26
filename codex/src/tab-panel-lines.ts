import {
  feedbackText,
  feedbackTone,
  holdsStatusWhileOut,
  isStatusUnderActions,
  type FeedbackTone,
} from '../../core/view/feedback'
import type { DrawnAfter } from './tab-held-after'
import { tabState } from './tab-state'
import type { Row } from './tab-state'
import { errorOf } from './tab-ui'
import { outOn, outPending } from './tab-press'
import { stepLines } from './tab-line-steps'
import type { TextLine } from './tab-line-steps'
import { feedbackLabel, noteOf, isFeedbackShown } from './tab-parts'
import { statusLinesOf, statusMotion, type StatusLine } from './tab-status-part'

/**
 * A row's press as its line draws it: whether one is out or still sending, and the status it shows. A Mark press out
 * keeps the status the row drew before it, as `holdsStatusWhileOut` says, and only its side column reads "Sending…".
 */
export function pressOf(row: Row): Press {
  const out = outOn(row.id)
  const isStatusOut = out !== null && !holdsStatusWhileOut(out.kind)
  const pending = outPending(tabState.view, row.id, out !== null && !isStatusOut)
  const isSending = out !== null && out.pending === null
  const isStatusSending = isSending && isStatusOut
  const f = isFeedbackShown(row) ? row.feedback : null
  const label = isStatusSending ? null : pending ? feedbackText(pending, 'codex') : f ? feedbackLabel(row) : null
  const tone: FeedbackTone = isStatusOut ? 'muted' : feedbackTone(f)

  return { isStatusOut, pending, isSending, isStatusSending, f, label, tone }
}

type Press = {
  /** A press is out and its status takes the row's. */
  isStatusOut: boolean
  pending: ReturnType<typeof outPending>
  isSending: boolean
  /** The press is sending and its status takes the row's: the line draws none until the reply. */
  isStatusSending: boolean
  f: Row['feedback']
  label: string | null
  tone: FeedbackTone
  /** The status the row's line drew after its title, which the form a row leaves keeps. */
  after?: DrawnAfter | null
}

/** The press each row's line last drew, which the form a row leaves keeps while it fades out. */
export const drawnPresses = new Map<string, Press>()

/** The status an open row draws under its buttons, as `isStatusUnderActions` places it, and its tone. */
function statusUnderOf(row: Row, press = pressOf(row)): { text: string | null; tone: FeedbackTone } {
  const { pending, isStatusSending, f, label, tone } = press

  return { text: !isStatusSending && isStatusUnderActions(pending ?? f, true) ? label : null, tone }
}

type PressLine = TextLine & { tone: FeedbackTone }

/** The press status under each open row's buttons, and the status lines above them, as this draw steps them. */
export const pressLines = new Map<string, PressLine[]>()
export const pressMotion = (id: string) => `press-${id}`
export const statusLines = new Map<string, StatusLine[]>()

let lastPressLines = new Map<string, PressLine[]>()
let lastStatusLines = new Map<string, StatusLine[]>()

const statusTextOf = (row: Row) => ({ foldNote: row.fold?.note ?? null, note: noteOf(row.id), error: errorOf(row.id) })

/** Starts a draw's step of the panel lines. Each row's lines move from the ones the last draw drew. */
export function startPanelLines() {
  lastPressLines = new Map(pressLines)
  lastStatusLines = new Map(statusLines)
  pressLines.clear()
  statusLines.clear()
}

/**
 * Steps the lines an open row's panel draws, on any tab: its press status under its buttons and its status lines above
 * them. Each grows in when it shows and closes from its place when it goes. `press` is the press the row's line last
 * drew, for a row that draws the form it leaves.
 */
export function stepPanelLines(
  row: Row,
  press: Press | undefined,
  now: number,
  changed: Set<string>,
  kept: Set<string>,
) {
  const { text, tone } = statusUnderOf(row, press)
  const lines = text ? [{ id: row.id, text, tone }] : []
  pressLines.set(row.id, stepLines(lines, lastPressLines.get(row.id), pressMotion, now, changed, kept))
  const status = statusLinesOf(row.id, statusTextOf(row))
  statusLines.set(row.id, stepLines(status, lastStatusLines.get(row.id), statusMotion, now, changed, kept))
}

/** Keeps the panel lines a row drew last, unstepped, for a row drawn again from an earlier draw, as a settling PR block's. */
export function keepPanelLines(id: string, kept: Set<string>) {
  const press = lastPressLines.get(id)
  const status = lastStatusLines.get(id)
  if (press) pressLines.set(id, press)
  if (status) statusLines.set(id, status)
  for (const l of press ?? []) kept.add(pressMotion(l.id))
  for (const l of status ?? []) kept.add(statusMotion(l.id))
}
