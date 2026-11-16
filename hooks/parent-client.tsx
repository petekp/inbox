import type { ClientModule } from 'claude-code'

export type ParentProps = {
  /** The name line in order: the name, the stall word, then the fold's chevron and count. */
  parts: { text: string; tone: 'plain' | 'muted' | 'needsYou'; bold: boolean }[]
  /** A null color is the theme's own. */
  colors: { muted: string | null; needsYou: string | null; hoverText: string | null }
}

type State = { hover: boolean }

/**
 * A Status parent's name line in the desktop pane. A click anywhere on it folds the parent's rows or opens them, and
 * hovering it brightens the chevron and count, the last part, and nothing else.
 */
const Parent: ClientModule<ParentProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state?.hover ?? false
  const set = (next: State) => {
    if (next.hover !== (surface.state?.hover ?? false)) surface.setState(next)
  }
  surface.onPointer(e => {
    if (e.type === 'leave') return set({ hover: false })
    const inside = e.x >= 0 && e.x < surface.columns && e.y >= 0 && e.y < surface.rows
    if (e.type === 'down' && e.button === 'left') {
      set({ hover: true })
      surface.post({})
    } else if (e.type === 'up' || e.type === 'move' || e.type === 'enter') set({ hover: inside })
  })
  const colorOf = (tone: 'plain' | 'muted' | 'needsYou', isChevron: boolean) => {
    if (hover && isChevron && props.colors.hoverText) return props.colors.hoverText

    return tone === 'muted' ? props.colors.muted : tone === 'needsYou' ? props.colors.needsYou : null
  }

  return Box({
    children: Text({
      wrap: 'wrap',
      children: props.parts.map((p, n) => {
        const color = colorOf(p.tone, n === props.parts.length - 1)

        return Text({ ...(p.bold ? { bold: true } : {}), ...(color ? { color } : {}), children: p.text })
      }),
    }),
  })
}

export default Parent
