import { closedTitleClock, newRowIn, newRowShare, steppedTitleTint, TITLE_TINT, type NewRow } from './arrivals'
import { fadedOver } from './tones'
import { closedTitleTone, type SettledState } from './rows'
import { newRowsOf } from './ui-controller-tabs'
import type { PaneBase } from './pane-context'

type TintArgs = Pick<PaneBase, 'look' | 'pal' | 'now' | 'ui'>

/**
 * The color a title takes while its tint lasts, or undefined for its own. The terminal steps from the tint back to
 * the title's own color, `rest`. Desktop holds the tint, then drops it, because a redraw loop there blocks clicks.
 */
function tintColor({ look, pal, now }: TintArgs, tone: string, rest: string | undefined, clock: NewRow | undefined) {
  const share = look === 'terminal' ? steppedTitleTint(clock, now) : newRowShare(clock, now) > 0 ? TITLE_TINT : 0
  if (share === 0) return undefined

  return pal.under && rest ? fadedOver(tone, rest, share) : tone
}

/**
 * A new row's color in the key color, or undefined once the tint has gone or for a row not new. It fades to `rest`, the
 * color of what it tints: the title's by default, or the mark's.
 */
export function newTitleTint(args: TintArgs & Pick<PaneBase, 'shownTab'>) {
  return (id: string, rest = args.pal.text) =>
    tintColor(args, args.pal.key, rest, newRowIn(newRowsOf(args.ui), id, args.shownTab))
}

/** A closed row's title and mark color in the tone of how it closed, or undefined once the tint has gone. */
export function closedTitleTint(args: TintArgs) {
  const { pal, now } = args

  return (id: string, state: SettledState) => {
    const tone = closedTitleTone(state)
    if (tone === 'muted') return undefined

    return tintColor(
      args,
      pal.mark[tone],
      pal.muted,
      closedTitleClock(new Map(Object.entries(args.ui.closedSeen)), id, state.at, now),
    )
  }
}
