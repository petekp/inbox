import type { ClientModule } from 'claude-code'

/**
 * The bar under a just-closed desktop row that drains while its Undo lasts.
 * A redraw of the pane every fraction of a second breaks clicks on its
 * Buttons (anthropics/claude-code#100924), so the bar ticks here, inside its
 * own region, and the pane draws once when the row leaves.
 */

export type CountdownProps = {
  /** When the row closed, on the hooks module's clock. */
  startedAt: number
  /** How long the row stays in place. */
  totalMs: number
  /** A null color is the theme's own. */
  colors: { bar: string | null; track: string | null }
}

type State = { now: number }

const TICK_MS = 100
/** The bar's height in lines: about 2 pt. */
const BAR_HEIGHT = 0.1

const Countdown: ClientModule<CountdownProps, State> = (props, surface) => {
  const { Box } = surface.elements
  const leftAt = (now: number) => Math.max(0, props.totalMs - (now - props.startedAt))
  // Started once, while the state is still undefined; the timer stops when the bar is empty.
  if (surface.state === undefined) {
    surface.setState({ now: Date.now() })
    const stop = surface.every(TICK_MS, () => {
      const now = Date.now()
      surface.setState({ now })
      if (leftAt(now) === 0) stop()
    })
  }
  const left = leftAt(surface.state?.now ?? props.startedAt)
  const columns = surface.columns

  return Box({
    flexDirection: 'row',
    height: BAR_HEIGHT,
    ...(props.colors.track ? { backgroundColor: props.colors.track } : {}),
    children:
      columns > 0 && left > 0
        ? Box({
            width: (left / props.totalMs) * columns,
            height: BAR_HEIGHT,
            ...(props.colors.bar ? { backgroundColor: props.colors.bar } : {}),
          })
        : [],
  })
}

export default Countdown
