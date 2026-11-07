import type { PaneBase } from './pane-context'
import { DESKTOP_MARK_CELLS, DESKTOP_SIDE_CELLS } from './pane-sizes'

export function paneRowFrame({ space, Box }: Pick<PaneBase, 'space' | 'Box'>) {
  const desktopFrame = ({
    key,
    mark = null,
    side = null,
    fill,
    padY = space.rowPad,
    isSideCentered = false,
    indent = 0,
    isMarkHung = true,
    markCells = DESKTOP_MARK_CELLS,
    gapY = 0,
    tree = null,
    hasSide = true,
    children,
  }: {
    key?: string
    mark?: JSX.Element | null
    side?: JSX.Element | null
    /** Whether it keeps the side column, so its text lines up with rows that show an age there. */
    hasSide?: boolean
    /** An absolute Box in the mark column, which the frame stretches to the row's height. */
    tree?: JSX.Element | null
    fill?: string | undefined
    padY?: number
    /** Centers the side and the mark with its text on each other, for a side taller than a line of text, as Undo is. */
    isSideCentered?: boolean
    indent?: number
    isMarkHung?: boolean
    markCells?: number
    /** Space above and below the frame, in the hooks tree's half lines. */
    gapY?: number
    children: JSX.Element | (JSX.Element | null)[]
  }) => {
    const markColumn = (
      <Box key="mark" width={indent + markCells + (isMarkHung ? 0 : 1)} flexShrink={0} paddingLeft={indent}>
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
    return (
      <Box
        key={key}
        flexDirection="row"
        alignItems={isSideCentered ? 'center' : tree ? 'stretch' : 'flex-start'}
        marginY={gapY}
        borderStyle="single"
        borderColor="#0000"
        paddingY={padY}
        {...(fill ? { backgroundColor: fill } : {})}
      >
        {isSideCentered ? (
          <Box flexDirection="row" alignItems="flex-start" flexShrink={1} flexGrow={1} minWidth={0}>
            {markColumn}
            {textColumn}
          </Box>
        ) : (
          [markColumn, textColumn]
        )}
        {hasSide ? (
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
        ) : null}
      </Box>
    )
  }

  return { desktopFrame }
}

export type PaneRowFrame = ReturnType<typeof paneRowFrame>
