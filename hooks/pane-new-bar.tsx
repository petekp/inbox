import { fadedOver } from './tones'
import { newRowIn, steppedShare } from './arrivals'
import { ROW_BAR } from './help'
import { newBarSvg } from './desktop-svg'
import { ROW_PAD_PT } from './layout'
import { paneState } from './mod-state'
import type { PaneBase, PaneClient, Row } from './pane-context'
import { DESKTOP_CELL_PT, DESKTOP_LINE_PT, FRAME_INSET_PT } from './pane-sizes'

export function paneNewBar({
  look,
  elements,
  Box,
  Text,
  pal,
  now,
  shownTab,
}: Pick<PaneBase, 'look' | 'Box' | 'Text' | 'pal' | 'now' | 'shownTab'> & Pick<PaneClient, 'elements'>) {
  const DesktopSvg = look === 'desktop' && 'Svg' in elements ? elements.Svg : null
  /**
   * The bar at a new row's left edge, which fades once its tab is shown, or null for a row not new. `top` lines it up
   * with the title, and on a selected row the terminal fades it toward the selection's color.
   */
  const newBar = (row: Row, { top = 0, isSelected = false }: { top?: number; isSelected?: boolean } = {}) => {
    const newRow = newRowIn(paneState.newRows, row.id, shownTab)
    if (DesktopSvg && newRow)
      return (
        <Box key={`new-${row.id}`} position="absolute" top={0} left={0} marginTop={top}>
          <DesktopSvg
            source={newBarSvg(newRow.shownAt ?? now, now)}
            alt=""
            width={FRAME_INSET_PT - DESKTOP_CELL_PT}
            height={2 * ROW_PAD_PT + DESKTOP_LINE_PT}
          />
        </Box>
      )
    const share = steppedShare(newRow, now)
    if (look !== 'terminal' || share === 0) return null
    const under = isSelected && pal.selection ? pal.selection : pal.under
    return (
      <Box key={`new-${row.id}`} position="absolute" top={0} left={0} width={1} marginTop={top}>
        <Text color={under ? fadedOver(pal.key, under, share) : pal.key}>{ROW_BAR}</Text>
      </Box>
    )
  }

  return { newBar }
}
