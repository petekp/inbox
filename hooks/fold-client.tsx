import type { ClientModule } from 'claude-code'

export type FoldProps = {
  markCells: number
  label: string
  /** The label as units that wrap whole, each text with the color its mark has, or null for the theme's. Drawn in place of `label`. */
  units?: { text: string; color: string | null }[][]
  isUnfolded: boolean
  /** The fold's chevron, from `foldGlyph`. */
  chevron: string
  /** Lines of padding above and below the text. */
  padY: number
  /** A null color is the theme's own. */
  colors: { rest: string | null; text: string | null; hoverText: string | null }
}

type State = { hover: boolean }

const Fold: ClientModule<FoldProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state?.hover ?? false
  // Reads the state when an event arrives: two events can both arrive before the next call.
  const set = (next: State) => {
    if (next.hover === (surface.state?.hover ?? false)) return
    surface.setState(next)
  }
  surface.onPointer(e => {
    if (e.type === 'leave') return set({ hover: false })
    // While a button is held, moves arrive past the region's edges too. `surface.rows` rounds the
    // padded height down, so the padding is added back.
    const inside = e.x >= 0 && e.x < surface.columns && e.y >= 0 && e.y < surface.rows + 2 * props.padY
    if (e.type === 'down' && e.button === 'left') {
      // The target comes from the drawn props, so a second click before the redraw asks for the same state.
      set({ hover: true })
      surface.post({ isUnfolded: !props.isUnfolded, isAll: e.alt === true })
    } else if (e.type === 'up' || e.type === 'move' || e.type === 'enter') set({ hover: inside })
  })

  const background = props.colors.rest
  const color = hover && props.colors.hoverText ? props.colors.hoverText : props.colors.text

  return Box({
    flexDirection: 'row',
    borderStyle: 'single',
    borderColor: '#0000',
    paddingY: props.padY,
    ...(background ? { backgroundColor: background } : {}),
    children: [
      Box({ width: props.markCells, flexShrink: 0 }),
      props.units
        ? Box({
            flexDirection: 'row',
            flexWrap: 'wrap',
            children: props.units.map((unit, n) =>
              Box({
                flexDirection: 'row',
                flexShrink: 0,
                children: [
                  ...unit.map(part =>
                    Text({ ...((part.color ?? color) ? { color: part.color ?? color! } : {}), children: part.text }),
                  ),
                  ...(n === props.units!.length - 1
                    ? [Text({ ...(color ? { color } : {}), children: ` ${props.chevron}` })]
                    : []),
                ],
              }),
            ),
          })
        : Text({ ...(color ? { color } : {}), children: `${props.label} ${props.chevron}` }),
    ],
  })
}

export default Fold
