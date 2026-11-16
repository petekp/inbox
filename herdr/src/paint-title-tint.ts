import { NEW_FADE_MS, NEW_HOLD_MS, NEW_STEPS, closedTitleClock, newRowIn, steppedTitleTint } from '../../hooks/arrivals'
import type { ClosedSeen, NewRow, NewRows } from '../../hooks/arrivals'
import type { Block, RowBlock } from './blocks'
import { colorOf, mixInto } from './paint-theme'
import type { Paint } from './paint-theme'

const FADE_STEP_MS = NEW_FADE_MS / NEW_STEPS

/** When a title's tint next takes a step: the end of its hold, the next step of its fade, or its end. Null once gone. */
function nextStepAt(row: NewRow, now: number): number | null {
  if (row.shownAt === null) return null
  const fadeAt = row.shownAt + NEW_HOLD_MS
  const endAt = fadeAt + NEW_FADE_MS
  if (now >= endAt) return null
  if (now < fadeAt) return fadeAt

  return Math.min(endAt, fadeAt + (Math.floor((now - fadeAt) / FADE_STEP_MS) + 1) * FADE_STEP_MS)
}

/** When the look draws again for a new row's title tint or a closed row's, or null when no tint moves. */
export function titleTintNextAt(rows: NewRows, blocks: readonly Block[], seen: ClosedSeen, now: number): number | null {
  const closed = blocks.flatMap(b =>
    b.kind === 'row' && b.settled?.tint ? [closedTitleClock(seen, b.id, b.settled.at, now)] : [],
  )
  const at = [...rows.values(), ...closed].flatMap(r => (r ? [nextStepAt(r, now)] : [])).filter(a => a !== null)

  return at.length > 0 ? Math.min(...at) : null
}

/** The tone a row's tint is in and how strong it is now, or null when the row has none. */
function tintOf(r: RowBlock, p: Paint) {
  const { t } = p
  const clock = r.settled ? closedTitleClock(p.closedSeen, r.id, r.settled.at, p.now) : newRowIn(p.newRows, r.id, p.tab)
  const tone = r.settled ? (r.settled.tint ? colorOf(t, r.settled.tint) : null) : t.ansi4
  const share = steppedTitleTint(clock, p.now)

  return tone && share > 0 ? { tone, share } : null
}

/**
 * A row's title color: the theme's own, or while the row's tint lasts, its tone mixed into it. A new row's tint is the
 * theme's blue, and a closed row's takes the tone of how it closed. GPUI glides no text color, so the tint takes a step
 * at each draw, and the look draws again at each step.
 */
export function titleColorOf(r: RowBlock, p: Paint) {
  const own = r.isDim ? p.t.muted : p.t.foreground
  const tint = tintOf(r, p)

  return tint ? mixInto(tint.tone, own, tint.share) : own
}

/** A row's mark color, the same tint over the mark's own color, or null while the row has no tint. */
export function markTintOf(r: RowBlock, p: Paint) {
  const tint = tintOf(r, p)
  if (!tint) return null
  const own = r.mark === null || r.mark.tone === null ? p.t.muted : colorOf(p.t, r.mark.tone)

  return mixInto(tint.tone, own, tint.share)
}
