import type { ShownTab } from '../../core/view/tabs'
import { root } from './tab-state'

/** What the page shows: a tab, or Help. */
type Place = ShownTab | 'help'

/** Where the page was scrolled on each tab when the tab last left it. Help keeps none, so it opens at its top. */
const offsets = new Map<Place, number>()

let drawnPlace: Place | null = null

const page = () => root.ownerDocument.scrollingElement ?? root.ownerDocument.documentElement

/** Notes where the page leaves the place it showed, before a draw that shows `place`. Returns whether the place changes. */
export function leavePlace(place: Place): boolean {
  const isSwitch = drawnPlace !== null && place !== drawnPlace
  if (isSwitch && drawnPlace !== null && drawnPlace !== 'help') offsets.set(drawnPlace, page().scrollTop)
  drawnPlace = place

  return isSwitch
}

/** Scrolls the page to where the person left `place`, or to its top. */
export function enterPlace(place: Place): void {
  page().scrollTop = offsets.get(place) ?? 0
}

/** Makes `tab` open at its top the next time it shows, as after a move the look made. */
export function startOver(tab: ShownTab): void {
  offsets.delete(tab)
}
