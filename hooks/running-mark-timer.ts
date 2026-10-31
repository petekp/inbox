import type { Timer } from 'claude-code'
import { RUNNING_FRAME_MS } from './timing'

let runningMarkTimer: Timer | null = null
let isRunningMarkDrawn = false
let runningMarkDrawnAt = -Infinity

/**
 * The engine supersedes an unfinished drawing when another is asked, so a tick that follows no drawing stops the timer,
 * as after the pane closes. `hasStalled` catches a refused period, which ends the engine's interval with no callback.
 */
export function animateRunningMarks(
  isDrawn: boolean,
  now: number,
  every: (ms: number, fn: () => void) => Timer,
  nextFrame: () => void,
) {
  const hasStalled = isRunningMarkDrawn && now - runningMarkDrawnAt >= 2 * RUNNING_FRAME_MS
  isRunningMarkDrawn = isDrawn
  runningMarkDrawnAt = now
  if (hasStalled || !isDrawn) stopRunningMarks()
  if (!isDrawn || runningMarkTimer !== null) return
  runningMarkTimer = every(RUNNING_FRAME_MS, () => {
    if (!isRunningMarkDrawn) return stopRunningMarks()
    isRunningMarkDrawn = false
    nextFrame()
  })
}

function stopRunningMarks() {
  runningMarkTimer?.cancel()
  runningMarkTimer = null
}
