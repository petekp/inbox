import type { ClientModule } from 'claude-code'

/**
 * The desktop pane's tab bar. Only a Button takes a click on desktop, and a
 * Button is as small as its label, so the tabs are drawn here instead: this
 * region gets the pointer over every cell of every tab, draws the hover, and
 * posts the clicked tab's id to the hooks module, which shows that tab.
 */

/** One tab, its width in cells set by the hooks module, which knows the font. A null color is the theme's own. */
export type ClientTab = { id: string; label: string; count: number; countColor: string | null; width: number }

export type TabsProps = {
  tabs: ClientTab[]
  shown: string
  gap: number
  colors: { tab: string | null; hover: string | null; hoverText: string | null; shown: string | null }
}

type State = { hover: string | null }

const PADDING_Y = 1
/** A tab's drawn height: its label line and the padding above and below it. */
const TAB_ROWS = 1 + 2 * PADDING_Y

/** The tab under cell (`x`, `y`) of the region, or null over a gap or outside the tabs' rows. */
function tabAt(props: TabsProps, x: number, y: number): string | null {
  if (y < 0 || y >= TAB_ROWS) return null
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

  return Box({
    flexDirection: 'row',
    gap: props.gap,
    children: props.tabs.map(tab => {
      const hovered = tab.id !== props.shown && tab.id === hover
      const background = tab.id === props.shown ? props.colors.shown : hovered ? props.colors.hover : props.colors.tab
      const text = hovered ? props.colors.hoverText : null
      const count = Text({ ...(tab.countColor ? { color: tab.countColor } : {}), children: String(tab.count) })

      return Box({
        key: tab.id,
        width: tab.width,
        paddingY: PADDING_Y,
        justifyContent: 'center',
        ...(background ? { backgroundColor: background } : {}),
        children: Text({
          ...(text ? { color: text } : {}),
          children: tab.count > 0 ? [tab.label, ' ', count] : tab.label,
        }),
      })
    }),
  })
}

export default Tabs
