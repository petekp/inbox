import type { ClientModule } from 'claude-code'

/**
 * The desktop pane's tab bar. Only a Button takes a click on desktop, and a
 * Button is as small as its label, so the tabs are drawn here instead: this
 * region gets the pointer over every cell of every tab, draws the hover, and
 * posts the clicked tab's id to the hooks module, which shows that tab.
 */

/** One tab, its width in cells set by the hooks module, which knows the font. */
export type ClientTab = {
  id: string
  label: string
  count: number
  width: number
}

/**
 * Only the shown tab has a fill, `raised`. A hovered tab takes `tab`, or `raised` where the palette
 * has no `tab`, and then the shown tab's bold label tells them apart. A null color is the theme's own.
 */
export type TabsProps = {
  tabs: ClientTab[]
  shown: string
  gap: number
  colors: { tab: string | null; raised: string | null; raisedText: string | null; muted: string | null }
}

type State = { hover: string | null }

/**
 * A tab's drawn height in lines. A fill comes out rounded only inside a border, which insets the label by
 * half a line on each side, so 1.25 lines fits the label and matches the app's own segmented control.
 */
const TAB_HEIGHT = 1.25

/** The tab under (`x`, `y`) in the region, or null over a gap or outside the tabs. */
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
      const background = isShown ? colors.raised : isHovered ? (colors.tab ?? colors.raised) : null
      // Text on `raised` takes `raisedText` where the palette sets one: there the muted gray can match the fill.
      const onRaised = background !== null && background === colors.raised ? colors.raisedText : null
      const labelColor = onRaised ?? (isShown || isHovered ? null : colors.muted)
      const countColor = onRaised ?? colors.muted
      const count = Text({ ...(countColor ? { color: countColor } : {}), children: String(tab.count) })

      return Box({
        key: tab.id,
        width: tab.width,
        height: TAB_HEIGHT,
        borderStyle: 'single',
        borderColor: '#0000',
        alignItems: 'center',
        justifyContent: 'center',
        ...(background ? { backgroundColor: background } : {}),
        children: Text({
          ...(labelColor ? { color: labelColor } : {}),
          bold: isShown,
          children: tab.count > 0 ? [tab.label, ' ', count] : tab.label,
        }),
      })
    }),
  })
}

export default Tabs
