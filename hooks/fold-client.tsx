import type { ClientModule } from 'claude-code'

/**
 * A list's "▸ N Closed" line in the desktop pane. A Button takes a click only
 * on its label, so the line is drawn here instead: this region gets the
 * pointer over every cell of the line, draws the hover, and posts the fold
 * state the click asks for to the hooks module, which sets it.
 */

export type FoldProps = {
  /** The column the arrow starts at, where the closed items' tree hangs from it. */
  inset: number
  count: number
  isUnfolded: boolean
  /** A null color is the theme's own. */
  colors: { rest: string | null; text: string | null; hover: string | null; hoverText: string | null }
}

/** `pending` is the state the last click asked for, drawn until the hooks module's redraw or `PENDING_MS`. */
type State = { hover: boolean; pending: { isUnfolded: boolean; seq: number } | null }

/** How long a click's state draws without the hooks module's redraw, in case its post was lost. */
const PENDING_MS = 1000

const Fold: ClientModule<FoldProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state?.hover ?? false
  const isUnfolded = surface.state?.pending?.isUnfolded ?? props.isUnfolded
  // Reads the state when an event arrives: two events can both arrive before the next call.
  const now = (): State => surface.state ?? { hover: false, pending: null }
  const set = (next: State) => {
    const was = now()
    if (next.hover !== was.hover || next.pending !== was.pending) surface.setState(next)
  }
  surface.onPointer(e => {
    if (e.type === 'leave') return set({ ...now(), hover: false })
    // While a button is held, moves arrive past the region's edges too.
    const inside = e.x >= 0 && e.x < surface.columns && e.y >= 0 && e.y < surface.rows
    if (e.type === 'down' && e.button === 'left') {
      // The target comes from the drawn props, so a second click before the redraw asks for the same state.
      const target = !props.isUnfolded
      const seq = (now().pending?.seq ?? 0) + 1
      set({ hover: true, pending: { isUnfolded: target, seq } })
      surface.post({ isUnfolded: target })
      const stop = surface.every(PENDING_MS, () => {
        stop()
        if (now().pending?.seq === seq) set({ ...now(), pending: null })
      })
    } else if (e.type === 'up' || e.type === 'move' || e.type === 'enter') set({ ...now(), hover: inside })
  })

  const background = hover ? props.colors.hover : props.colors.rest
  const color = hover && props.colors.hoverText ? props.colors.hoverText : props.colors.text

  return Box({
    flexDirection: 'row',
    ...(background ? { backgroundColor: background } : {}),
    children: [
      Box({ width: props.inset, flexShrink: 0 }),
      Text({ ...(color ? { color } : {}), children: `${isUnfolded ? '▾' : '▸'} ${props.count} Closed` }),
    ],
  })
}

export default Fold
