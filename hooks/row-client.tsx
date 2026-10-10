import type { ClientModule } from 'claude-code'

/**
 * A closed row in the desktop pane. A Button takes a click only on its label,
 * so the row is drawn here instead: this region gets the pointer over every
 * cell of the row, draws the hover and the press, and posts to the hooks
 * module, which opens the row. The hooks module reads the row from this
 * Client's key, so a post carries nothing.
 */

export type RowProps = {
  /** The column the handle starts at; the cells before it hold the new-row bar and the tree indent. */
  handleAt: number
  /** The column the text starts at. */
  textAt: number
  handle: string
  /** Muted, before the title, such as a review thread's path. */
  before: string
  title: string
  /** The age, or the row's last action in its place. */
  after: string
  /** Lines of padding above and below the text. The hover covers it. */
  padY: number
  /** 2 for a question, which can take two lines; 1 otherwise. */
  maxLines: number
  /** How many characters fit in a cell, counted low, so a clipped line does not wrap. */
  charsPerCell: number
  /** The region's width before its first layout, when `surface.columns` is still 0. */
  fallbackColumns: number
  /** The new-row bar's color while the row is new, else null. */
  newBar: string | null
  /** A null color is the theme's own. */
  colors: {
    handle: string | null
    muted: string | null
    after: string | null
    hover: string | null
    hoverText: string | null
    pressed: string | null
  }
}

type State = { hover: boolean; pressed: boolean }

/** A title clipped shorter than this reads as nothing, so `after` is cut instead. */
const MIN_TITLE = 12

/** `text` cut to `max` characters at a space, ending "…". */
function clipAtSpace(text: string, max: number): string {
  if (text.length <= max) return text
  const space = text.lastIndexOf(' ', max - 1)
  const head = space >= Math.min(MIN_TITLE, max) - 1 ? text.slice(0, space) : text.slice(0, max - 1)

  return `${head.trimEnd()}…`
}

/** The title and `after` cut to what fits in `budget` characters beside `before`. The title gives up room first. */
function fitLine(budget: number, before: string, title: string, after: string): { title: string; after: string } {
  const fitted = clipAtSpace(title, Math.max(MIN_TITLE, budget - before.length - after.length - 1))
  const room = budget - before.length - fitted.length - 1
  if (after.length <= room) return { title: fitted, after }

  return { title: fitted, after: room >= 2 ? `${after.slice(0, room - 1)}…` : '' }
}

const Row: ClientModule<RowProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state?.hover ?? false
  const pressed = surface.state?.pressed ?? false
  // Reads the state when an event arrives: a down and an up can both arrive before the next call.
  const set = (next: State) => {
    if (next.hover !== (surface.state?.hover ?? false) || next.pressed !== (surface.state?.pressed ?? false))
      surface.setState(next)
  }
  surface.onPointer(e => {
    if (e.type === 'leave') return set({ hover: false, pressed: false })
    // While a button is held, moves arrive past the region's edges too. `surface.rows` rounds the
    // padded height down, as 1 for 1.5 lines, so the padding is added back.
    const inside = e.x >= 0 && e.x < surface.columns && e.y >= 0 && e.y < surface.rows + 2 * props.padY
    if (e.type === 'down' && e.button === 'left') {
      set({ hover: true, pressed: true })
      surface.post({})
    } else if (e.type === 'up') set({ hover: inside, pressed: false })
    else if (e.type === 'move' || e.type === 'enter') set({ hover: inside, pressed: surface.state?.pressed ?? false })
  })

  const columns = surface.columns || props.fallbackColumns
  const budget = Math.floor((columns - props.textAt) * props.charsPerCell * props.maxLines)
  const line = fitLine(budget, props.before, props.title, props.after)
  const background = pressed ? props.colors.pressed : hover ? props.colors.hover : null
  // A raised background can share its color with muted text, so on it all text takes the palette's text for it.
  const isRaised = background !== null && background === props.colors.hover
  const color = (own: string | null) => (isRaised && props.colors.hoverText ? props.colors.hoverText : own)
  const colored = (own: string | null) => {
    const c = color(own)
    return c ? { color: c } : {}
  }

  return Box({
    flexDirection: 'row',
    ...(background ? { backgroundColor: background } : {}),
    children: [
      Box({
        width: 1,
        flexShrink: 0,
        ...(props.newBar ? { backgroundColor: props.newBar } : {}),
      }),
      Box({ width: props.handleAt - 1, flexShrink: 0 }),
      Box({
        width: props.textAt - props.handleAt,
        flexShrink: 0,
        // The padding is on the handle and text, so the new-row bar spans the row's full height.
        paddingY: props.padY,
        children: Text({ ...colored(props.colors.handle), children: props.handle }),
      }),
      Box({
        flexShrink: 1,
        flexGrow: 1,
        paddingY: props.padY,
        children: Text({
          wrap: 'wrap',
          ...colored(null),
          children: [
            ...(props.before ? [Text({ ...colored(props.colors.muted), children: props.before })] : []),
            line.title,
            ...(line.after ? [Text({ ...colored(props.colors.after), children: line.after })] : []),
          ],
        }),
      }),
    ],
  })
}

export default Row
