import type { ClientModule } from 'claude-code'

export type ClientTab = {
  id: string
  label: string
  count: number
  countColor: string
  width: number
}

/** A null color is the theme's own. */
export type TabsProps = {
  tabs: ClientTab[]
  shown: string
  gap: number
  /** False when only the shown tab has its rounded frame, so the others take only their label's width. */
  isEachFramed: boolean
  colors: { tab: string | null; raised: string; raisedText: string | null; muted: string | null }
}

type State = { hover: string | null }

export const TAB_HEIGHT = 1.5
export const TAB_COUNT_GAP = '  '

function tabAt(props: TabsProps, x: number, y: number): string | null {
  if (y < 0 || y >= TAB_HEIGHT) return null
  let left = 0
  for (const tab of props.tabs) {
    if (x >= left && x < left + tab.width) return tab.id
    left += tab.width + props.gap
  }

  return null
}

const Tabs: ClientModule<TabsProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state?.hover ?? null
  // Set on every call, so the listener reads this call's props; a later call replaces it.
  surface.onPointer(e => {
    const at = e.type === 'leave' ? null : tabAt(props, e.x, e.y)
    if (at !== (surface.state?.hover ?? null)) surface.setState({ hover: at })
    if (e.type === 'down' && e.button !== 'right' && at !== null && at !== props.shown) surface.post({ tab: at })
  })
  const { colors } = props

  return Box({
    flexDirection: 'row',
    gap: props.gap,
    children: props.tabs.map(tab => {
      const isShown = tab.id === props.shown
      const isHovered = !isShown && tab.id === hover
      const isFramed = isShown || props.isEachFramed
      const background = isShown ? colors.raised : isHovered && isFramed ? (colors.tab ?? colors.raised) : null
      const onRaised = background !== null && background === colors.raised ? colors.raisedText : null
      const labelColor = onRaised ?? (isShown || isHovered ? null : colors.muted)
      const count = Text({ color: tab.countColor, children: String(tab.count) })

      return Box({
        key: tab.id,
        width: tab.width,
        height: TAB_HEIGHT,
        ...(isFramed ? { borderStyle: 'single' as const, borderColor: '#0000' } : {}),
        alignItems: 'center',
        justifyContent: 'center',
        ...(background ? { backgroundColor: background } : {}),
        children: Text({
          ...(labelColor ? { color: labelColor } : {}),
          bold: isShown,
          children: tab.count > 0 ? [tab.label, TAB_COUNT_GAP, count] : tab.label,
        }),
      })
    }),
  })
}

export default Tabs
