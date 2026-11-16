import { div } from 'gpui-kit'
import type { Element } from 'gpui-kit'
import { NEW_FADE_MS, NEW_HOLD_MS, NEW_STEPS, newRowIn, newRowShare, settledBarClock } from '../../hooks/arrivals'
import type { NewRow, NewRows } from '../../hooks/arrivals'
import { ROW_PAD_PT } from '../../hooks/layout'
import type { Block, RowBlock } from './blocks'
import { colorOf, EDGE, NEST } from './paint-theme'
import type { Paint } from './paint-theme'

const FADE_STEP_MS = NEW_FADE_MS / NEW_STEPS
/** The bar's width, and the space between it and the row's mark. */
const BAR_W = 3
const BAR_GAP = 6

/** When a new row's bar next takes a step: the end of its hold, the next step of its fade, or its end. Null once gone. */
function nextStepAt(row: NewRow, now: number): number | null {
  if (row.shownAt === null) return null
  const fadeAt = row.shownAt + NEW_HOLD_MS
  const endAt = fadeAt + NEW_FADE_MS
  if (now >= endAt) return null
  if (now < fadeAt) return fadeAt

  return Math.min(endAt, fadeAt + (Math.floor((now - fadeAt) / FADE_STEP_MS) + 1) * FADE_STEP_MS)
}

/** When the look draws again for a new row's bar or a settled row's, or null when no bar moves. */
export function newRowsNextAt(rows: NewRows, blocks: readonly Block[], now: number): number | null {
  const settled = blocks.flatMap(b => (b.kind === 'row' && b.settled?.bar ? [settledBarClock(b.settled.at)] : []))
  const clocks = [...rows.values(), ...settled]
  const at = clocks.map(r => nextStepAt(r, now)).filter(a => a !== null)

  return at.length > 0 ? Math.min(...at) : null
}

/**
 * The bar at a new row's left edge, before its mark. GPUI glides `opacity` but no color, so the bar fades through its
 * opacity. Every draw sets the opacity the clock reaches at the bar's next step, and GPUI glides to it over the time
 * left until then, as a timed button's fill does, while the look draws each step.
 */
export function newBarEls(r: RowBlock, p: Paint): Element[] {
  const row = newRowIn(p.newRows, r.id, p.tab)
  const at = row ? nextStepAt(row, p.now) : null
  if (!row || at === null) return []
  const bar = barEl(r, `new ${r.id}`).bg(p.t.ansi4).opacity(newRowShare(row, at))

  return [bar.transition('opacity', { duration: at - p.now, easing: 'linear' })]
}

/** A settled row's bar, in the tone of why it closed, on the clock of a new row's bar from the moment the row closed. */
export function settledBarEls(r: RowBlock, p: Paint): Element[] {
  if (!r.settled?.bar) return []
  const row = settledBarClock(r.settled.at)
  const at = nextStepAt(row, p.now)
  if (at === null) return []
  const bar = barEl(r, `settled ${r.id}`).bg(colorOf(p.t, r.settled.bar)).opacity(newRowShare(row, at))

  return [bar.transition('opacity', { duration: at - p.now, easing: 'linear' })]
}

/** A bar at a row's left edge, before its mark, from the top of the row's first line to the bottom of its last. */
function barEl(r: RowBlock, id: string) {
  return div()
    .id(id)
    .absolute()
    .left(EDGE + r.depth * NEST - BAR_GAP - BAR_W)
    .top(ROW_PAD_PT)
    .bottom(ROW_PAD_PT)
    .w(BAR_W)
    .rounded(BAR_W / 2)
}
