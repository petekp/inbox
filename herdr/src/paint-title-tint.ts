import { closedTitleClock, newRowIn, steppedTitleTint } from '../../core/view/arrivals'
import type { RowBlock } from './blocks'
import { colorOf, mixInto } from './paint-theme'
import type { Paint } from './paint-theme'

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
