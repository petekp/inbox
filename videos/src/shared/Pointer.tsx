import { Easing, interpolate } from 'remotion'

/**
 * A click, in screen pixels, and the second it happens. A mark with `press: false` only moves the pointer there.
 * `settle` is how long before `at` the pointer arrives: the take moves the VM's pointer onto its target this early, so
 * the target lights as the drawn pointer reaches it.
 */
export type ClickMark = { at: number; x: number; y: number; press?: boolean; settle?: number }

/** How long before a click the pointer arrives on its target, in seconds, when the mark doesn't say. */
const SETTLE = 0.3
/** How long the click's ring takes to fade out, in seconds. */
const RING = 0.4

/** Where the pointer is at second `t`: resting at `from`, then gliding to each click in turn. */
export function pointerAt(from: { x: number; y: number }, clicks: ClickMark[], t: number) {
  let position = from
  let readyAt = -Infinity
  for (const c of clicks) {
    const distance = Math.hypot(c.x - position.x, c.y - position.y)
    const travel = Math.min(0.75, Math.max(0.35, 0.3 + distance / 1800))
    const arrive = c.at - (c.settle ?? SETTLE)
    const leave = Math.max(arrive - travel, readyAt)
    if (t < leave) return position
    if (t < arrive) {
      const p = Easing.inOut(Easing.cubic)((t - leave) / (arrive - leave))
      return { x: position.x + (c.x - position.x) * p, y: position.y + (c.y - position.y) * p }
    }
    position = { x: c.x, y: c.y }
    readyAt = c.at + 0.1
  }
  return position
}

/** A macOS-style arrow at the pointer's place, which dips and leaves a ring on each click. */
export function Pointer({ from, clicks, t }: { from: { x: number; y: number }; clicks: ClickMark[]; t: number }) {
  const { x, y } = pointerAt(from, clicks, t)
  const last = clicks.filter(c => c.press !== false && c.at <= t).pop()
  const age = last ? t - last.at : Infinity
  const dip = age < 0.16 ? interpolate(age, [0, 0.06, 0.16], [1, 0.82, 1]) : 1
  return (
    <>
      {last && age < RING && (
        <div
          style={{
            position: 'absolute',
            left: last.x,
            top: last.y,
            width: 0,
            height: 0,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -interpolate(age, [0, RING], [8, 34]),
              top: -interpolate(age, [0, RING], [8, 34]),
              width: 2 * interpolate(age, [0, RING], [8, 34]),
              height: 2 * interpolate(age, [0, RING], [8, 34]),
              borderRadius: '50%',
              border: '4px solid rgba(255, 255, 255, 0.9)',
              boxSizing: 'border-box',
              opacity: interpolate(age, [0, RING], [0.85, 0]),
            }}
          />
        </div>
      )}
      <svg
        width={30}
        height={42}
        viewBox="0 0 28 40"
        style={{
          position: 'absolute',
          left: x - 2,
          top: y - 2,
          transformOrigin: '2px 2px',
          transform: `scale(${dip})`,
          filter: 'drop-shadow(0 3px 4px rgba(0, 0, 0, 0.45))',
        }}
      >
        <path
          d="M2 2 L2 31 L9 24.5 L13.5 35 L18 33 L13.7 22.8 L23 22.8 Z"
          fill="#000"
          stroke="#fff"
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
      </svg>
    </>
  )
}
