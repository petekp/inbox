import type { ClientElements, ClientModule } from 'claude-code'

import type { OverCopy } from './client-copy'

export type TitleProps = {
  title: string
  /** The title's tint, or null for the theme's own. */
  titleColor: string | null
  /** Muted text after the title, such as a press's result, or empty for none. */
  after: string
  /** Whether `after` draws on lines of its own under the title, rather than beside it. A line feed starts a new line. */
  isAfterUnder: boolean
  colors: { muted: string | null; hover: string | null; hoverText: string | null; pressed: string | null }
}

type State = { hover: boolean; pressed: boolean }

/** The open row's title, drawn by the Client or, until the Client posts, by the pane with its own elements. */
export function titleTree(
  props: TitleProps,
  { Box, Text }: Pick<ClientElements, 'Box' | 'Text'>,
  { hover, pressed }: State,
) {
  const background = pressed ? props.colors.pressed : hover ? props.colors.hover : null
  const textColor = background !== null && background === props.colors.hover ? props.colors.hoverText : null
  const colored = (own: string | null) => {
    const c = textColor ?? own
    return c ? { color: c } : {}
  }

  const after = props.after ? [Text({ ...colored(props.colors.muted), children: props.after })] : []

  return Box({
    flexDirection: 'column',
    ...(background ? { backgroundColor: background } : {}),
    children: [
      Text({
        wrap: 'wrap',
        children: [
          Text({ bold: true, ...colored(props.titleColor), children: props.title }),
          ...(props.isAfterUnder ? [] : after),
        ],
      }),
      ...(props.isAfterUnder
        ? props.after.split('\n').map(line => Text({ wrap: 'wrap', ...colored(props.colors.muted), children: line }))
        : []),
    ],
  })
}

/** The open row's title in the desktop pane. A click anywhere on it collapses the row. */

const Title: ClientModule<TitleProps & OverCopy, State> = (props, surface) => {
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
      surface.post({ isAll: e.alt === true })
    } else if (e.type === 'up') set({ hover: inside, pressed: false })
    else if (e.type === 'move' || e.type === 'enter') set({ hover: inside, pressed: surface.state?.pressed ?? false })
  })
  if (props.isOverCopy) surface.post({ isRunning: true })

  return titleTree(props, surface.elements, { hover, pressed })
}

export default Title
