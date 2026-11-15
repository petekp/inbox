import type { ClientModule } from 'claude-code'

type TitleProps = {
  title: string
  /** Muted text after the title, such as a press's result, or empty for none. */
  after: string
  colors: { muted: string | null; hover: string | null; hoverText: string | null; pressed: string | null }
}

type State = { hover: boolean; pressed: boolean }

/** The open row's title in the desktop pane. A click anywhere on it collapses the row. */
const Title: ClientModule<TitleProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state?.hover ?? false
  const pressed = surface.state?.pressed ?? false
  const set = (next: State) => {
    if (next.hover !== (surface.state?.hover ?? false) || next.pressed !== (surface.state?.pressed ?? false))
      surface.setState(next)
  }
  surface.onPointer(e => {
    if (e.type === 'leave') return set({ hover: false, pressed: false })
    const inside = e.x >= 0 && e.x < surface.columns && e.y >= 0 && e.y < surface.rows
    if (e.type === 'down' && e.button === 'left') {
      set({ hover: true, pressed: true })
      surface.post({})
    } else if (e.type === 'up') set({ hover: inside, pressed: false })
    else if (e.type === 'move' || e.type === 'enter') set({ hover: inside, pressed: surface.state?.pressed ?? false })
  })
  const background = pressed ? props.colors.pressed : hover ? props.colors.hover : null
  const textColor = background !== null && background === props.colors.hover ? props.colors.hoverText : null
  const colored = (own: string | null) => {
    const c = textColor ?? own
    return c ? { color: c } : {}
  }

  return Box({
    ...(background ? { backgroundColor: background } : {}),
    children: Text({
      wrap: 'wrap',
      children: [
        Text({ bold: true, ...colored(null), children: props.title }),
        ...(props.after ? [Text({ ...colored(props.colors.muted), children: props.after })] : []),
      ],
    }),
  })
}

export default Title
