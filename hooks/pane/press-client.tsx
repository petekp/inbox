import type { ClientModule } from 'claude-code'

/** A region that posts `pressKey` when it is clicked anywhere and tints itself under the pointer. */
export type PressAreaProps = {
  pressKey: string
  hover: string
}

type State = { hover: boolean }

const PressArea: ClientModule<PressAreaProps, State> = (props, surface) => {
  const { Box } = surface.elements
  const hover = surface.state?.hover ?? false
  // Set on every call, so the listener reads this call's props.
  surface.onPointer(e => {
    const inside =
      e.type !== 'leave' && e.x >= 0 && e.x < surface.columns && e.y >= 0 && e.y < Math.max(1, surface.rows)
    if (inside !== hover) surface.setState({ hover: inside })
    // A button goes down only inside the region. Moves past its edge arrive only while a button is held.
    if (e.type === 'down' && e.button === 'left') surface.post({ key: props.pressKey })
  })

  return Box({
    width: '100%',
    height: '100%',
    ...(hover ? { backgroundColor: props.hover, borderStyle: 'single', borderColor: '#0000' } : {}),
  })
}

export default PressArea
