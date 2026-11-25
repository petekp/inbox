import { isMoving, moveMs } from '../../core/view/row-motion'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import { tabState, drawnRows, root } from './tab-state'
import { later, cancelTimer } from './tab-host'
import { reducedMotion } from './tab-motion'
import { scrollToNearest } from './tab-scroll'

/** Scrolls the open row into view, and again once its height has come to rest. */
export function revealSelected() {
  if (tabState.isDisposed) return
  const reveal = () => {
    if (tabState.isDisposed) return
    const row = [...root.querySelectorAll('.row.selected')].find(r => !r.closest('.form-left'))
    if (row) scrollToNearest(row, !reducedMotion.matches)
  }
  reveal()
  if (!reducedMotion.matches) later(reveal, HEIGHT_SETTLE_MS)
}

const TIMER_SLACK_MS = 50

let moveWake: { at: number; timer: ReturnType<typeof later> } | null = null

export function wakeForMoves() {
  const now = Date.now()
  const ends = [...drawnRows.values()].flatMap(({ track: t }) => (isMoving(t.state) ? [t.since + moveMs(t)] : []))
  if (ends.length === 0) return
  const at = Math.min(...ends) + TIMER_SLACK_MS
  if (moveWake && moveWake.at <= at) return
  if (moveWake) cancelTimer(moveWake.timer)
  moveWake = {
    at,
    timer: later(() => {
      moveWake = null
      tabState.draw()
    }, at - now),
  }
}
