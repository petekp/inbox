import type { ClientElements, ClientModule } from 'claude-code'

import type { OverCopy } from './client-copy'

export type ParentProps = {
  /** The name line in order: the name, the stall word, then the fold's chevron and count. */
  parts: { text: string; tone: PartTone; bold: boolean }[]
  /** A null color is the theme's own. */
  colors: { muted: string | null; faint: string | null; needsYou: string | null; hoverText: string | null }
}

type PartTone = 'plain' | 'muted' | 'faint' | 'needsYou'

type State = { hover: boolean }

/** A Status parent's name line, drawn by the Client or, until the Client posts, by the pane with its own elements. */
export function parentTree(props: ParentProps, { Box, Text }: Pick<ClientElements, 'Box' | 'Text'>, hover: boolean) {
  const colorOf = (tone: PartTone, isChevron: boolean) => {
    if (hover && isChevron && props.colors.hoverText) return props.colors.hoverText

    return tone === 'plain' ? null : props.colors[tone]
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

/**
 * A Status parent's name line in the desktop pane. A click anywhere on it folds the parent's rows or opens them, and
 * hovering it brightens the chevron and count, the last part, and nothing else.
 */
const Parent: ClientModule<ParentProps & OverCopy, State> = (props, surface) => {
  const hover = surface.state?.hover ?? false
  const set = (next: State) => {
    if (next.hover !== (surface.state?.hover ?? false)) surface.setState(next)
  }
  surface.onPointer(e => {
    if (e.type === 'leave') return set({ hover: false })
    const inside = e.x >= 0 && e.x < surface.columns && e.y >= 0 && e.y < surface.rows
    if (e.type === 'down' && e.button === 'left') {
      set({ hover: true })
      surface.post({ isAll: e.alt === true })
    } else if (e.type === 'up' || e.type === 'move' || e.type === 'enter') set({ hover: inside })
  })
  if (props.isOverCopy) surface.post({ isRunning: true })

  return parentTree(props, surface.elements, hover)
}

export default Parent
