import type { PaneBase } from './pane-context'
import type { PaneRowLines } from './pane-row-lines'
import { DESKTOP_HAIR_CELLS, DESKTOP_HAIR_LINES } from './pane-sizes'

type TreeLineShape = 'down' | 'pass' | 'mid' | 'last'

/**
 * Where a desktop tree line sits in its frame's mark column, as cells from that column's left edge. `at` is the
 * line's center. `arm` is the length of the arm that reaches across to a child. `edge` and `edgeBelow` are the padding
 * the frame has above and below its content, in half lines, which the line reaches across to meet the next frame's line.
 * `seam` is what lies between two frames besides that padding: the two borders of frames that draw their own.
 */
type TreeLineBox = { at: number; arm: number; edge: number; edgeBelow?: number; seam?: number }

export function paneDesktopTree({
  Box,
  desktopHairline,
  pal,
}: Pick<PaneBase, 'Box' | 'pal'> & Pick<PaneRowLines, 'desktopHairline'>) {
  /**
   * The line that ties child frames to their parent on desktop, drawn from 1 pt hairlines in the mark column.
   * `down` runs from under the parent's mark to the end of its frame. `pass` runs the frame's whole height, for a
   * line between children that has no arm. `mid` and `last` reach across to a child, and `mid` runs on to the next
   * frame.
   */
  const desktopTreeLine = (
    key: string,
    shape: TreeLineShape,
    { at, arm, edge, edgeBelow = edge, seam = 2 * DESKTOP_HAIR_LINES }: TreeLineBox,
  ) => {
    const reach = -(edge + seam)
    const reachBelow = -(edgeBelow + seam)
    const firstLineMiddle = 0.5
    const hair = (hairKey: string, grow: boolean, ends: { marginTop?: number; marginBottom?: number }) => (
      <Box key={hairKey} flexDirection="row" {...(grow ? { flexGrow: 1 } : { height: firstLineMiddle })}>
        {desktopHairline('line', 'down', ends, pal.line)}
      </Box>
    )
    const parts =
      shape === 'down'
        ? [<Box key="under-mark" height={firstLineMiddle + 0.4} />, hair('down', true, { marginBottom: reachBelow })]
        : shape === 'pass'
          ? [hair('pass', true, { marginTop: reach, marginBottom: reachBelow })]
          : [
              hair('to-arm', false, { marginTop: reach }),
              desktopHairline('arm', 'across', { width: arm }, pal.line),
              ...(shape === 'mid' ? [hair('on', true, { marginBottom: reachBelow })] : []),
            ]

    return (
      <Box key={key} position="absolute" top={0} bottom={0} left={0} flexDirection="row">
        <Box flexDirection="column" flexShrink={0} marginLeft={at - DESKTOP_HAIR_CELLS / 2}>
          {parts}
        </Box>
      </Box>
    )
  }

  return { desktopTreeLine }
}
