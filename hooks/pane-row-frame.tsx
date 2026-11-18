import type { PaneBase } from './pane-context'
import { DESKTOP_MARK_CELLS, DESKTOP_SIDE_CELLS } from './pane-sizes'

export function paneRowFrame({ space, Box }: Pick<PaneBase, 'space' | 'Box'>) {
  const desktopFrame = ({
    key,
    mark = null,
    side = null,
    fill,
    padY = space.rowPad,
    padBelow = padY,
    isSideCentered = false,
    indent = 0,
    isMarkHung = true,
    markCells = DESKTOP_MARK_CELLS,
    gapY = 0,
    tree = null,
    hasSide = true,
    isBordered = true,
    children,
    below = null,
  }: {
    key?: string
    mark?: JSX.Element | null
    side?: JSX.Element | null
    /** Whether it keeps the side column, so its text lines up with rows that show an age there. */
    hasSide?: boolean
    /** An absolute Box in the mark column, which the frame stretches to the row's height. */
    tree?: JSX.Element | null
    fill?: string | undefined
    /** False inside a Box that draws the border and fill around several frames, so the app rounds that Box once. */
    isBordered?: boolean
    padY?: number
    /** The padding under its text, where it differs from `padY` above. */
    padBelow?: number
    /** Centers the side and the mark with its text on each other, for a side taller than a line of text, as Undo is. */
    isSideCentered?: boolean
    indent?: number
    isMarkHung?: boolean
    markCells?: number
    /** Space above and below the frame, in the hooks tree's half lines. */
    gapY?: number
    children: JSX.Element | (JSX.Element | null)[]
    /** Drawn under the text, from its left edge across the side column, for a line that needs the row's whole width. */
    below?: JSX.Element | null
  }) => {
    const markWidth = indent + markCells + (isMarkHung ? 0 : 1)
    const markColumn = (
      <Box key="mark" width={markWidth} flexShrink={0} paddingLeft={indent}>
        {tree}
        {mark ? (
          <Box position="absolute" top={0} left={isMarkHung ? indent - 1 : indent}>
            {mark}
          </Box>
        ) : null}
      </Box>
    )
    const textColumn = (
      <Box key="text" flexDirection="column" flexShrink={1} flexGrow={1} minWidth={0}>
        {children}
      </Box>
    )
    const alignItems = isSideCentered ? 'center' : tree ? 'stretch' : 'flex-start'
    const main = isSideCentered ? (
      <Box flexDirection="row" alignItems="flex-start" flexShrink={1} flexGrow={1} minWidth={0}>
        {markColumn}
        {textColumn}
      </Box>
    ) : (
      [markColumn, textColumn]
    )
    const sideColumn = hasSide ? (
      <Box
        minWidth={DESKTOP_SIDE_CELLS}
        flexShrink={0}
        flexDirection="row"
        justifyContent="flex-end"
        alignItems="flex-start"
        paddingLeft={1}
      >
        {side}
      </Box>
    ) : null
    const frame = {
      marginY: gapY,
      ...(isBordered ? { borderStyle: 'single', borderColor: '#0000' } : {}),
      paddingTop: padY,
      paddingBottom: padBelow,
      ...(fill ? { backgroundColor: fill } : {}),
    }
    return below ? (
      <Box key={key} flexDirection="column" {...frame}>
        <Box key="line" flexDirection="row" alignItems={alignItems}>
          {main}
          {sideColumn}
        </Box>
        <Box key="below" flexDirection="column" paddingLeft={markWidth}>
          {below}
        </Box>
      </Box>
    ) : (
      <Box key={key} flexDirection="row" alignItems={alignItems} {...frame}>
        {main}
        {sideColumn}
      </Box>
    )
  }

  return { desktopFrame }
}

export type PaneRowFrame = ReturnType<typeof paneRowFrame>
