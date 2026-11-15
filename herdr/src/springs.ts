/** gpui-kit's spring policy: `response` in ms, `damping` as a ratio where 1 does not overshoot, `epsilon` in px. */
type Spring = { response: number; damping: number; epsilon: number }

/**
 * The spring every box's height moves on. Damping 1 does not overshoot: a box clips its content, so a box that
 * overshot would show blank space under its last line. Half a pixel is too small to see, so the spring stops there.
 */
export const HEIGHT_SPRING: Spring = { response: 300, damping: 1, epsilon: 0.5 }

/** The longest height move a settle time allows for, about 50 rows: a fold of a long group. */
const LONGEST_MOVE_PX = 2000

const FRAME_MS = 16
const STEP_MS = 1

/** A spring's position and velocity, in px and px per ms. */
type SpringState = { x: number; v: number }

/**
 * Moves a spring `ms` toward `target`, as a damped harmonic oscillator whose undamped period is `response`. That is
 * how SwiftUI reads the same two numbers. gpui-kit does not say how it reads them.
 */
function springStep(s: SpringState, target: number, ms: number, spring: Spring): SpringState {
  const w = (2 * Math.PI) / spring.response
  let { x, v } = s
  for (let t = 0; t < ms; t += STEP_MS) {
    const dt = Math.min(STEP_MS, ms - t)
    v += (-w * w * (x - target) - 2 * spring.damping * w * v) * dt
    x += v * dt
  }

  return { x, v }
}

const isAtRest = (s: SpringState, target: number, spring: Spring): boolean =>
  Math.abs(s.x - target) < spring.epsilon && Math.abs(s.v) * FRAME_MS < spring.epsilon

function msToRest(from: SpringState, target: number, spring: Spring): number {
  let s = from
  let ms = 0
  while (!isAtRest(s, target, spring) && ms < 10_000) {
    s = springStep(s, target, FRAME_MS, spring)
    ms += FRAME_MS
  }

  return ms
}

/**
 * The longest a height move takes to come to rest: within `epsilon` of its target, moving less than `epsilon` a
 * frame. It takes the longer of a move of `LONGEST_MOVE_PX` from rest, and that move turned back to its start at
 * any frame, which starts with the speed it had.
 */
function settleMs(spring: Spring): number {
  const fromRest = msToRest({ x: 0, v: 0 }, LONGEST_MOVE_PX, spring)
  let longest = fromRest
  let s: SpringState = { x: 0, v: 0 }
  for (let ms = FRAME_MS; ms < fromRest; ms += FRAME_MS) {
    s = springStep(s, LONGEST_MOVE_PX, FRAME_MS, spring)
    longest = Math.max(longest, msToRest(s, 0, spring))
  }

  return longest
}

/** How long a box's height can still move after its target last changed. */
export const HEIGHT_SETTLE_MS = settleMs(HEIGHT_SPRING)
