import { isMoving } from '../../core/view/row-motion'
import type { Block } from './blocks'
import type { TabCell } from './draw'
import type { RowMotion } from './motion'
import type { Tracks } from './tracks'

/**
 * A block at rest that changed in a draw that starts a move, such as a group's title as its count changes, keeps its
 * last form for that draw. The move's first draw only sets where its boxes move from, so the change lands in the draw
 * that sets them moving. Rows and an empty tab's text take their new form at once, since a press or a field on a row
 * must show at once, and so does a block whose new form fades in as it changes whole (`formKey`), which measures it.
 */
export function heldForm(b: Block, was: Tracks, motion: ReadonlyMap<string, RowMotion>): Block {
  const last = was.rows.get(b.id)?.block
  const m = motion.get(b.id)
  const isSwappedIn = (m?.blockSwap?.formKey ?? null) !== null
  const isHeld =
    last !== undefined &&
    b.kind !== 'row' &&
    b.kind !== 'empty' &&
    m !== undefined &&
    !isMoving(m.state) &&
    !isSwappedIn

  return isHeld && JSON.stringify(last) !== JSON.stringify(b) ? last : b
}

/**
 * The tab bar a draw shows. In a draw that starts a move, each tab keeps the count it last drew, or no count if it drew
 * none, so the count changes with the group titles, in the draw that sets the rows moving.
 */
export function heldTabs(tabs: TabCell[], last: readonly TabCell[], motion: ReadonlyMap<string, RowMotion>): TabCell[] {
  if (![...motion.values()].some(m => m.isStart)) return tabs

  return tabs.map(t => {
    const was = last.find(l => l.id === t.id)

    return was ? { ...t, badge: was.badge } : t
  })
}
