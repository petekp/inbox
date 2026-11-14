import { feedbackText } from '../../hooks/feedback'
import type { Feedback } from '../../hooks/feedback'
import { actionId } from '../../hooks/press-labels'
import { pressRowId } from '../../hooks/pr-press'
import type { PrPress } from '../../hooks/pr-press'
import type { RowPress } from '../../hooks/presses'
import { deliveryLabel } from '../../hooks/rows'
import type { SessionView } from '../../hooks/session-view'
import { GOAL_KEYS_ID } from '../../hooks/status-keys'
import type { LocalResult, RowNote } from '../../types'
import type { Block, Button } from './blocks'
import type { LastPress } from './files'

/** What an out press's row reads until a publish shows the press, as the Codex tab's. */
export const SENDING = 'Sending…'

/** A press with no reread of the session file yet reads the file again then, in case a file watch was missed. */
const REREAD_AFTER_MS = 5_000
/** A written press with no result by then ends: not confirmed when a host took it, else the look takes it back. */
export const GIVE_UP_MS = 15_000

/**
 * A press the look sent that has no result yet. `action` is its button's action id. `label` is its button's label,
 * and `reply` the text a reply sends. `pending` is what its opens, copies or refreshes read while under way, or null
 * for a press that sends, which reads `SENDING`. `result` is how the opens and copies the look ran itself went.
 * `before` is the row as the look drew it when pressed. `isWritten` is whether its press file is written, and
 * `waitingSince` when it was, or when the look last found a host had it. `isTaken` is whether the last read found the
 * file gone, which means a host took it to apply.
 */
export type Out = {
  pressId: string
  rowId: string
  path: string
  action: string
  label: string
  reply?: string
  pending: Feedback | null
  result: LocalResult | null
  before: string
  isWritten: boolean
  waitingSince: number | null
  isTaken: boolean
}

/** A line the look draws on a row in place of the one the publish gave, and the press result it reads. */
export type RowLine = { text: string; tone: 'error' | 'muted'; source: Feedback }

/** The id the look tells a button's press by: a row press's `actionId`, a PR press's action. */
export const outAction = (p: RowPress | PrPress): string => ('id' in p ? actionId(p) : p.action)

/** What the host's publishes can change for a press on a row: its last press, its state, and the goal's text. */
export function rowSignature(view: SessionView, rowId: string): string {
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows]
  const state = rows.find(r => r.id === rowId)?.state.is ?? null
  const goal = rowId === GOAL_KEYS_ID ? (view.statusPage.goal?.text ?? null) : null

  return JSON.stringify([view.lastActions[rowId] ?? null, state, goal])
}

/** How the opens and copies the look ran went: "✓ Opened x", or in red why one could not run. */
const resultLine = (result: LocalResult): RowLine => ({
  text: feedbackText({ is: 'local', result }, 'herdr'),
  tone: result.state === 'failed' ? 'error' : 'muted',
  source: { is: 'local', result },
})

/** A press a host took and never reported, in the words the hosts use for a message they could not confirm. */
function unconfirmedLine(out: Out, now: number): RowLine {
  if (out.result) return resultLine(out.result)
  const label = deliveryLabel('unconfirmed', out.label, out.reply)

  return { text: label, tone: 'muted', source: { is: 'unconfirmed', label, at: now } }
}

/** A press the look could not send, in the words the hosts use for one. */
export function notSentLine(reason: string): RowLine {
  const source: Feedback = { is: 'notSent', reason, retry: null }

  return { text: feedbackText(source, 'herdr'), tone: 'error', source }
}

/** A press no host took by the give-up time, once the look has taken its file back. */
export const notAppliedLine = (out: Out, agent: string): RowLine =>
  out.result ? resultLine(out.result) : notAppliedText(`${agent}'s inbox did not answer.`)

/** A press that ended without a host applying it. */
export const notAppliedText = (why: string): RowLine => ({
  text: `Not applied: ${why}`,
  tone: 'error',
  source: { is: 'notSent', reason: why, retry: null },
})

type Settled = {
  outs: Out[]
  notes: Record<string, RowNote>
  lines: Record<string, RowLine>
  toClaim: Out[]
}

/**
 * The presses still out after a read of the session. The host's `lastPress` ends the press it names: applied, or
 * stale when its row had already changed, which gets the shared stale note. Another press ends when its row changed.
 * A host applies presses oldest first and press ids sort by time, so a taken press older than `lastPress` will not be
 * reported, and reads as not confirmed. By `GIVE_UP_MS` after its write, a taken press reads the same, and one still
 * in its folder goes to `toClaim` for the look to take back.
 */
export function settleOuts(outs: readonly Out[], view: SessionView, lastPress: LastPress | null, now: number): Settled {
  const settled: Settled = { outs: [], notes: {}, lines: {}, toClaim: [] }
  for (const out of outs) {
    if (lastPress?.id === out.pressId) {
      if (lastPress.outcome === 'stale') settled.notes[out.rowId] = { note: 'stale', at: now }
      continue
    }
    if (rowSignature(view, out.rowId) !== out.before) continue
    const isPassed = lastPress !== null && lastPress.id > out.pressId
    if (out.isWritten && out.isTaken && isPassed) settled.lines[out.rowId] = unconfirmedLine(out, now)
    else if (!out.isWritten || out.waitingSince === null || now - out.waitingSince < GIVE_UP_MS) settled.outs.push(out)
    else if (out.isTaken) settled.lines[out.rowId] = unconfirmedLine(out, now)
    else settled.toClaim.push(out)
  }

  return settled
}

/** When the look next needs to read for its presses: a reread, or giving up. */
export function nextOutCheckAt(outs: readonly Out[], now: number): number | null {
  const times = outs.flatMap(out =>
    out.waitingSince === null ? [] : [out.waitingSince + REREAD_AFTER_MS, out.waitingSince + GIVE_UP_MS],
  )
  const later = times.filter(at => at > now)

  return later.length ? Math.min(...later) : null
}

const withOutButtons = (buttons: Button[], outRows: ReadonlySet<string>): Button[] =>
  buttons.map(b => (b.does.is === 'press' && outRows.has(pressRowId(b.does.press)) ? { ...b, isOut: true } : b))

/**
 * The blocks with the look's presses drawn: every press button on a row with a press out draws out, and the row's
 * line reads the press under way, how the look's own opens went, or why a press ended unreported, in place of the line
 * the publish gave.
 */
export function drawOuts(blocks: Block[], outs: readonly Out[], lines: Record<string, RowLine>, now: number): Block[] {
  const byRow = new Map(outs.map(o => [o.rowId, o]))
  const outRows = new Set(byRow.keys())
  const lineOf = (id: string): RowLine | null => {
    const out = byRow.get(id)
    if (!out) return lines[id] ?? null
    if (out.result) return resultLine(out.result)
    if (out.pending) return { text: feedbackText(out.pending, 'herdr'), tone: 'muted', source: out.pending }
    return { text: SENDING, tone: 'muted', source: { is: 'sending', label: SENDING, at: now } }
  }

  return blocks.map((b): Block => {
    if (b.kind === 'row' || b.kind === 'pr' || b.kind === 'line' || b.kind === 'banner') {
      const line = lineOf(b.id)
      return { ...b, buttons: withOutButtons(b.buttons, outRows), ...(line ? { feedback: line } : {}) }
    }
    if (b.kind === 'status' || b.kind === 'heading' || b.kind === 'empty')
      return { ...b, buttons: withOutButtons(b.buttons, outRows) }

    return b
  })
}
