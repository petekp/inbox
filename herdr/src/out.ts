import { feedbackText, feedbackTone, holdsStatusWhileOut, type FeedbackTone } from '../../core/view/feedback'
import type { Feedback } from '../../core/view/feedback'
import { sendingFeedback } from '../../core/view/unshown-press'
import { actionId } from '../../core/domain/press-labels'
import { pressRowId } from '../../core/view/pr-press'
import type { PrPress } from '../../core/view/pr-press'
import type { RowPress } from '../../core/domain/presses'
import { deliveryLabel } from '../../core/view/rows'
import type { SessionView } from '../../core/view/session-view'
import { GOAL_KEYS_ID } from '../../core/view/status-keys'
import type { SettledOutcome } from '../../core/view/ui-controller-types'
import type { LocalResult, PressKind } from '../../types'
import type { Block, Button } from './blocks'
import type { LastPress } from './files'

/** A press with no reread of the session file yet reads the file again then, in case a file watch was missed. */
const REREAD_AFTER_MS = 5_000
/** A written press with no result by then ends: not confirmed when a host took it, else the look takes it back. */
export const GIVE_UP_MS = 15_000

/**
 * A press the look sent that has no result yet. `action` is its button's action id, and `kind` its button's kind as
 * the press found it, or null for a press that no plan action makes. `uiPressId` is the id the shared controller gave
 * the press, which hears how it ended. `label` is its button's label, and `reply` the
 * text a reply sends. `pending` is what its opens, copies or refreshes read while under way, or null
 * for a press that sends, which reads `SENDING`. `result` is how the opens and copies the look ran itself went.
 * `before` is the row as the look drew it when pressed. `isWritten` is whether its press file is written, and
 * `waitingSince` when it was, or when the look last found a host had it. `isTaken` is whether the last read found the
 * file gone, which means a host took it to apply.
 */
export type Out = {
  pressId: string
  uiPressId: number
  rowId: string
  path: string
  action: string
  kind: PressKind | null
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
export type RowLine = { text: string; tone: FeedbackTone; source: Feedback }

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
  tone: feedbackTone({ is: 'local', result }),
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

/** A press the host refused, in its own words, which say that nothing was sent. */
const refusedLine = (why: string): RowLine => ({
  text: why,
  tone: 'error',
  source: { is: 'notSent', reason: why, retry: null },
})

/** A press that ended without a host applying it. */
export const notAppliedText = (why: string): RowLine => ({
  text: `Not applied: ${why}`,
  tone: 'error',
  source: { is: 'notSent', reason: why, retry: null },
})

/** How a press the look sent ended, for the shared controller, by the id the controller gave it. */
export type Ended = { uiPressId: number; outcome: SettledOutcome }

type Settled = {
  outs: Out[]
  lines: Record<string, RowLine>
  ended: Ended[]
  toClaim: Out[]
}

const UNCONFIRMED: SettledOutcome = { error: null, note: null, isUnconfirmed: true }
const STALE: SettledOutcome = { error: null, note: 'stale', isUnconfirmed: false }

/** A press a host applied, as its row's delivery reads now: sent, refused, or not confirmed. */
function appliedOutcome(view: SessionView, rowId: string): SettledOutcome {
  const delivery = view.lastActions[rowId]?.delivery

  return {
    error: delivery?.state === 'failed' ? delivery.reason : null,
    note: null,
    isUnconfirmed: delivery?.state === 'unconfirmed',
  }
}

/**
 * The presses still out after a read of the session, and how the others ended. The host's `lastPress` ends the press
 * it names: applied, stale when its row had already changed, or refused, with why on its row. Another press ends when its row changed. A host
 * applies presses oldest first and press ids sort by time, so a taken press older than `lastPress` will not be
 * reported, and reads as not confirmed. By `GIVE_UP_MS` after its write, a taken press reads the same, and one still
 * in its folder goes to `toClaim` for the look to take back.
 */
export function settleOuts(outs: readonly Out[], view: SessionView, lastPress: LastPress | null, now: number): Settled {
  const settled: Settled = { outs: [], lines: {}, ended: [], toClaim: [] }
  const end = (out: Out, outcome: SettledOutcome) => settled.ended.push({ uiPressId: out.uiPressId, outcome })
  for (const out of outs) {
    if (lastPress?.id === out.pressId && lastPress.outcome === 'refused') {
      settled.lines[out.rowId] = refusedLine(lastPress.why)
      end(out, { error: lastPress.why, note: null, isUnconfirmed: false })
      continue
    }
    if (lastPress?.id === out.pressId) {
      end(out, lastPress.outcome === 'stale' ? STALE : appliedOutcome(view, out.rowId))
      continue
    }
    if (rowSignature(view, out.rowId) !== out.before) {
      end(out, appliedOutcome(view, out.rowId))
      continue
    }
    const isPassed = lastPress !== null && lastPress.id > out.pressId
    const isGivenUp = out.waitingSince !== null && now - out.waitingSince >= GIVE_UP_MS
    if (out.isWritten && out.isTaken && (isPassed || isGivenUp)) {
      settled.lines[out.rowId] = unconfirmedLine(out, now)
      end(out, UNCONFIRMED)
    } else if (!out.isWritten || !isGivenUp) settled.outs.push(out)
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
 * the publish gave. While the press is out, its line reads as the press under way, wherever a look places that, unless
 * its kind holds the row's status, as `holdsStatusWhileOut` says, or a later press on its row was refused, which reads
 * why it was not sent.
 */
export function drawOuts(blocks: Block[], outs: readonly Out[], lines: Record<string, RowLine>, now: number): Block[] {
  const byRow = new Map(outs.map(o => [o.rowId, o]))
  const outRows = new Set(byRow.keys())
  const lineOf = (id: string): RowLine | null => {
    const out = byRow.get(id)
    const refused = lines[id]
    if (!out || holdsStatusWhileOut(out.kind) || refused) return refused ?? null
    const source: Feedback = out.pending ?? sendingFeedback(now)
    if (out.result) return { ...resultLine(out.result), source }
    return { text: feedbackText(source, 'herdr'), tone: 'muted', source }
  }

  return blocks.map((b): Block => {
    if (b.kind === 'row' || b.kind === 'pr' || b.kind === 'line' || b.kind === 'banner') {
      const line = lineOf(b.id)
      return { ...b, buttons: withOutButtons(b.buttons, outRows), ...(line ? { feedback: line } : {}) }
    }
    if (b.kind === 'empty' && b.under) {
      const line = lineOf(b.under.id)
      const under = {
        ...b.under,
        buttons: withOutButtons(b.under.buttons, outRows),
        ...(line ? { feedback: line } : {}),
      }
      return { ...b, under }
    }
    if (b.kind === 'status' || b.kind === 'heading') return { ...b, buttons: withOutButtons(b.buttons, outRows) }

    return b
  })
}
