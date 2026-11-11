import { feedbackText } from '../../hooks/feedback'
import type { Feedback } from '../../hooks/feedback'
import { actionId } from '../../hooks/press-labels'
import { pressRowId } from '../../hooks/pr-press'
import type { PrPress } from '../../hooks/pr-press'
import type { RowPress } from '../../hooks/presses'
import type { SessionView } from '../../hooks/session-view'
import { GOAL_KEYS_ID } from '../../hooks/status-keys'
import type { RowNote } from '../../types'
import type { Block, Button } from './blocks'

/** What an out press's row reads until a publish shows the press, as the Codex tab's. */
export const SENDING = 'Sending…'

/** A press with no reread of the session file yet reads the file again then, in case a file watch was missed. */
const REREAD_AFTER_MS = 5_000
/** A press with no result by then reads as not applied. */
export const GIVE_UP_MS = 15_000
/** A press file the host took without a change shows as stale once this has passed with no publish. */
export const STALE_AFTER_TAKEN_MS = 1_000

/**
 * A press the look wrote that has no result yet. `action` is its button's action id, which draws out. `pending` is
 * what its opens, copies or refreshes read while under way, or null for a press that sends, which reads `SENDING`.
 * `before` is the row as the look drew it when pressed. `takenAt` is when a read first found the press file gone,
 * which means the host took it.
 */
export type Out = {
  pressId: string
  rowId: string
  path: string
  action: string
  pending: Feedback | null
  since: number
  before: string
  takenAt: number | null
}

/** The id the look tells a button's press by: a row press's `actionId`, a PR press's action. */
export const outAction = (p: RowPress | PrPress): string => ('id' in p ? actionId(p) : p.action)

/** What the host's publishes can change for a press on a row: its last press, its state, and the goal's text. */
export function rowSignature(view: SessionView, rowId: string): string {
  const rows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows]
  const state = rows.find(r => r.id === rowId)?.state.is ?? null
  const goal = rowId === GOAL_KEYS_ID ? (view.statusPage.goal?.text ?? null) : null

  return JSON.stringify([view.lastActions[rowId] ?? null, state, goal])
}

type Settled = {
  outs: Out[]
  notes: Record<string, RowNote>
  errors: Record<string, string>
}

/**
 * The presses still out after a read of the session. A press ends when the row changed, as its last press or its
 * state. One the host took without a change was stale, and gets the shared stale note. One with no answer by
 * `GIVE_UP_MS` reads as not applied.
 */
export function settleOuts(outs: readonly Out[], view: SessionView, now: number, agent: string): Settled {
  const settled: Settled = { outs: [], notes: {}, errors: {} }
  for (const out of outs) {
    if (rowSignature(view, out.rowId) !== out.before) continue
    if (out.takenAt !== null && now - out.takenAt >= STALE_AFTER_TAKEN_MS)
      settled.notes[out.rowId] = { note: 'stale', at: now }
    else if (now - out.since >= GIVE_UP_MS) settled.errors[out.rowId] = `Not applied: ${agent}'s inbox did not answer.`
    else settled.outs.push(out)
  }

  return settled
}

/** When the look next needs to read for its presses: a reread, a taken press's stale check, or giving up. */
export function nextOutCheckAt(outs: readonly Out[], now: number): number | null {
  const times = outs.flatMap(out => [
    out.since + REREAD_AFTER_MS,
    out.since + GIVE_UP_MS,
    ...(out.takenAt === null ? [] : [out.takenAt + STALE_AFTER_TAKEN_MS]),
  ])
  const later = times.filter(at => at > now)

  return later.length ? Math.min(...later) : null
}

type RowLine = { text: string; tone: 'error' | 'muted' } | null

function withOutButtons(buttons: Button[], byRow: ReadonlyMap<string, Out>): Button[] {
  return buttons.map(b => {
    if (b.does.is !== 'press') return b
    const out = byRow.get(pressRowId(b.does.press))
    return out?.action === outAction(b.does.press) ? { ...b, isOut: true } : b
  })
}

/**
 * The blocks with the look's presses drawn: each pressed button out, and its row's line reading the press under way,
 * or why it was not applied, in place of the line the publish gave.
 */
export function drawOuts(
  blocks: Block[],
  outs: readonly Out[],
  errors: Record<string, string>,
  look: 'herdr',
): Block[] {
  const byRow = new Map(outs.map(o => [o.rowId, o]))
  const lineOf = (id: string): RowLine => {
    const out = byRow.get(id)
    if (errors[id]) return { text: errors[id], tone: 'error' }
    if (!out) return null
    return { text: out.pending ? feedbackText(out.pending, look) : SENDING, tone: 'muted' }
  }

  return blocks.map((b): Block => {
    if (b.kind === 'row' || b.kind === 'pr' || b.kind === 'line') {
      const line = lineOf(b.id)
      return { ...b, buttons: withOutButtons(b.buttons, byRow), ...(line ? { feedback: line } : {}) }
    }
    if (b.kind === 'status' || b.kind === 'heading') return { ...b, buttons: withOutButtons(b.buttons, byRow) }

    return b
  })
}
