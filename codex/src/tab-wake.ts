import { isMoving, moveMs } from '../../core/view/row-motion'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import { tabState, drawnRows, root } from './tab-state'
import { later, cancelTimer } from './tab-host'
import { reducedMotion } from './tab-motion'

/** Scrolls the open row into view, and again once its height has come to rest. */
export function revealSelected() {
  if (tabState.isDisposed) return
  const behavior: ScrollBehavior = reducedMotion.matches ? 'auto' : 'smooth'
  const reveal = () =>
    [...root.querySelectorAll('.row.selected')]
      .find(row => !row.closest('.form-left'))
      ?.scrollIntoView({ block: 'nearest', behavior })
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
