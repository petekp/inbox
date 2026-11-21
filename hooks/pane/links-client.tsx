import type { ClientModule } from 'claude-code'

/** `isOut`: its press is out, so it draws dim and does not highlight under the pointer. */
type ClientLink = { key: string; label: string; width: number; isOut?: boolean }

export type LinksProps = {
  links: ClientLink[]
  gap: number
  /** The region's width before its first layout, when `surface.columns` is still 0. */
  fallbackColumns: number
  /** While the row ignores clicks, as just after it opens, every label stays muted. */
  isGuarded: boolean
  /** A null color is the theme's own. */
  colors: { muted: string | null; hover: string | null }
}

type State = { hover: string | null }

/** Splits the links into lines no wider than `columns`. A link wider than a line gets a line of its own. */
function linkLines(props: LinksProps, columns: number): ClientLink[][] {
  const lines: ClientLink[][] = []
  let used = 0
  for (const link of props.links) {
    const line = lines.at(-1)
    if (line && used + props.gap + link.width <= columns) {
      line.push(link)
      used += props.gap + link.width
    } else {
      lines.push([link])
      used = link.width
    }
  }

  return lines
}

function linkAt(props: LinksProps, columns: number, x: number, y: number): string | null {
  let left = 0
  for (const link of linkLines(props, columns)[y] ?? []) {
    if (x >= left && x < left + link.width) return link.key
    left += link.width + props.gap
  }

  return null
}

const Links: ClientModule<LinksProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state?.hover ?? null
  const columns = surface.columns || props.fallbackColumns
  // Set on every call, so the listener reads this call's props; a later call replaces it.
  surface.onPointer(e => {
    const at =
      e.type === 'leave' || e.y < 0 || e.y >= Math.max(1, surface.rows) ? null : linkAt(props, columns, e.x, e.y)
    if (at !== (surface.state?.hover ?? null)) surface.setState({ hover: at })
    if (e.type === 'down' && e.button === 'left' && at !== null) surface.post({ key: at })
  })

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
            width: link.width,
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

export default Links
