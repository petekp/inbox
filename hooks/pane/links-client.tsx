import type { ClientElements, ClientModule } from 'claude-code'

import type { OverCopy } from './client-copy'

/** `isOut`: its press is out, so it draws dim and does not highlight under the pointer. */
type ClientLink = { key: string; label: string; width: number; isOut?: boolean }

export type LinksProps = {
  /** Each link's `width` is its label's estimated width in cells, which sets where a click lands and where a line wraps. */
  links: ClientLink[]
  /** Cells between two links' drawn labels. Each link draws at its label's own width, so every gap is this. */
  gap: number
  /** Cells a line keeps free past its links' estimated widths when it decides where to wrap. */
  slack: number
  /** The region's width before its first layout, when `surface.columns` is still 0. */
  fallbackColumns: number
  /** While the row ignores clicks, as just after it opens, every label stays muted. */
  isGuarded: boolean
  /** A null color is the theme's own. */
  colors: { muted: string | null; hover: string | null }
}

type State = { hover: string | null }

/** The cells the links take on one line, which the pane gives the Client's region before it shrinks to its line. */
export function linksRegionWidth(props: LinksProps) {
  return Math.ceil(props.links.reduce((sum, l) => sum + l.width + props.slack, props.gap * (props.links.length - 1)))
}

/**
 * Splits the links into lines no wider than `columns`, counting `slack` past each link. A link wider than a line gets a
 * line of its own.
 */
function linkLines(props: LinksProps, columns: number): ClientLink[][] {
  const lines: ClientLink[][] = []
  let used = 0
  for (const link of props.links) {
    const line = lines.at(-1)
    const width = link.width + props.slack
    if (line && used + props.gap + width <= columns) {
      line.push(link)
      used += props.gap + width
    } else {
      lines.push([link])
      used = width
    }
  }

  return lines
}

/**
 * The link under cell `x` of line `y`. A link's label draws at its real width, which its estimate can miss by a few
 * points, so a link also takes the clicks in the half gap before its label and the half gap after it.
 */
function linkAt(props: LinksProps, columns: number, x: number, y: number): string | null {
  let left = 0
  for (const link of linkLines(props, columns)[y] ?? []) {
    if (x >= left - props.gap / 2 && x < left + link.width + props.gap / 2) return link.key
    left += link.width + props.gap
  }

  return null
}

/** The links, drawn by the Client or, until the Client posts, by the pane with its own elements. */
export function linksTree(
  props: LinksProps,
  { Box, Text }: Pick<ClientElements, 'Box' | 'Text'>,
  hover: string | null,
  columns: number,
) {
  return Box({
    flexDirection: 'column',
    children: linkLines(props, columns).map((line, i) =>
      Box({
        key: `line-${i}`,
        flexDirection: 'row',
        gap: props.gap,
        children: line.map(link => {
          const isHovered = link.key === hover && !props.isGuarded && !link.isOut
          const color = isHovered ? props.colors.hover : props.colors.muted

          return Box({
            key: link.key,
            flexShrink: 0,
            children: Text({
              ...(color ? { color } : {}),
              ...(link.isOut ? { dimColor: true } : {}),
              wrap: 'truncate-end',
              children: link.label,
            }),
          })
        }),
      }),
    ),
  })
}

const Links: ClientModule<LinksProps & OverCopy, State> = (props, surface) => {
  const hover = surface.state?.hover ?? null
  const columns = surface.columns || props.fallbackColumns
  // Set on every call, so the listener reads this call's props; a later call replaces it.
  surface.onPointer(e => {
    const at =
      e.type === 'leave' || e.y < 0 || e.y >= Math.max(1, surface.rows) ? null : linkAt(props, columns, e.x, e.y)
    if (at !== (surface.state?.hover ?? null)) surface.setState({ hover: at })
    if (e.type === 'down' && e.button === 'left' && at !== null) surface.post({ key: at })
  })
  if (props.isOverCopy) surface.post({ isRunning: true })

  return linksTree(props, surface.elements, hover, columns)
}

export default Links
