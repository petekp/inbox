import type { ClientModule } from 'claude-code'

/**
 * The desktop pane's tab bar. Only a Button takes a click on desktop, and a
 * Button is as small as its label, so the tabs are drawn here instead: this
 * region gets the pointer over every cell of every tab, draws the hover, and
 * posts the clicked tab's id to the hooks module, which shows that tab.
 */

/**
 * One tab, its width in cells set by the hooks module, which knows the font. `toneColor` draws the line along
 * the shown tab's top. A null color is the theme's own.
 */
export type ClientTab = {
  id: string
  label: string
  count: number
  countColor: string | null
  toneColor: string | null
  width: number
}

/** The shown tab and a hovered one are both `raised`; the shown one's bold label and tone line tell them apart. */
export type TabsProps = {
  tabs: ClientTab[]
  shown: string
  gap: number
  colors: { tab: string | null; raised: string | null; raisedText: string | null }
}

type State = { hover: string | null }

/** A tab's drawn height: the row its tone line takes, its label line and a blank line under it. */
const TAB_ROWS = 3

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
      const isShown = tab.id === props.shown
      const isRaised = isShown || tab.id === hover
      const background = isRaised ? props.colors.raised : props.colors.tab
      const text = isRaised ? props.colors.raisedText : null
      const count = Text({ ...(tab.countColor ? { color: tab.countColor } : {}), children: String(tab.count) })
      // A ▔ covers about 0.7 of a cell, so the run is twice the tab's width and the row clips it.
      const toneLine =
        isShown && tab.toneColor
          ? Text({ color: tab.toneColor, children: '▔'.repeat(2 * tab.width) })
          : Text({ children: ' ' })

      return Box({
        key: tab.id,
        width: tab.width,
        flexDirection: 'column',
        alignItems: 'center',
        ...(background ? { backgroundColor: background } : {}),
        children: [
          Box({ width: tab.width, height: 1, overflow: 'hidden', children: toneLine }),
          Text({
            ...(text ? { color: text } : {}),
            bold: isShown,
            children: tab.count > 0 ? [tab.label, ' ', count] : tab.label,
          }),
          Text({ children: ' ' }),
        ],
      })
    }),
  })
}

export default Tabs
