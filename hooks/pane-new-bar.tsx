import { fadedOver } from './tones'
import { newRowIn, settledBarClock, steppedShare } from './arrivals'
import { BAR_MAX_PT, newBarSvg, settledBarSvg } from './desktop-svg'
import { ROW_BARS } from './terminal-text'
import { paneState } from './mod-state'
import { settledBarTone, type SettledState } from './rows'
import type { PaneBase, PaneClient, Row } from './pane-context'
import { DESKTOP_CELL_PT, FRAME_INSET_PT } from './pane-sizes'

type BarArgs = Pick<PaneBase, 'look' | 'Box' | 'Text' | 'pal' | 'now' | 'space'> & Pick<PaneClient, 'elements'>

/**
 * A bar at a row's left edge, from the top of the row's first line to the bottom of its last, whatever the row holds
 * between. `inset` is the space the row leaves above and below, on top of its own padding. On desktop the Svg is taller
 * than any row and the Box clips it to the row's height.
 */
function barBoxes({ look, elements, Box, space }: Pick<BarArgs, 'look' | 'elements' | 'Box' | 'space'>) {
  const DesktopSvg = look === 'desktop' && 'Svg' in elements ? elements.Svg : null
  const rowBar = (key: string, inset: number, bar: JSX.Element | null) => {
    const edge = DesktopSvg ? space.rowPad + inset : inset

    return (
      <Box
        key={key}
        position="absolute"
        top={0}
        bottom={0}
        left={0}
        marginTop={edge}
        marginBottom={edge}
        width={DesktopSvg ? undefined : 1}
        overflow="hidden"
      >
        {bar}
      </Box>
    )
  }
  const desktopBar = (source: string) =>
    DesktopSvg ? (
      <DesktopSvg source={source} alt="" width={FRAME_INSET_PT - DESKTOP_CELL_PT} height={BAR_MAX_PT} />
    ) : null

  return { isDesktop: DesktopSvg !== null, rowBar, desktopBar }
}

export function paneNewBar(args: BarArgs & Pick<PaneBase, 'shownTab'>) {
  const { look, Text, pal, now, shownTab } = args
  const { isDesktop, rowBar, desktopBar } = barBoxes(args)
  /**
   * The bar at a new row's left edge, which fades once its tab is shown, or null for a row not new. `top` is the space
   * the row leaves above and below its text, and on a selected row the terminal fades it toward the selection's color.
   */
  const newBar = (row: Row, { top = 0, isSelected = false }: { top?: number; isSelected?: boolean } = {}) => {
    const newRow = newRowIn(paneState.newRows, row.id, shownTab)
    if (isDesktop && newRow) return rowBar(`new-${row.id}`, top, desktopBar(newBarSvg(newRow.shownAt ?? now, now)))
    const share = steppedShare(newRow, now)
    if (look !== 'terminal' || share === 0) return null
    const under = isSelected && pal.selection ? pal.selection : pal.under

    return rowBar(
      `new-${row.id}`,
      top,
      <Text color={under ? fadedOver(pal.key, under, share) : pal.key}>{ROW_BARS}</Text>,
    )
  }

  return { newBar }
}

/**
 * The bar at a settled row's left edge, in the tone of why it closed. It holds and fades on the clock of a new row's
 * bar, from the moment the row closed, and draws nothing once it has faded.
 */
export function paneSettledBar(args: BarArgs) {
  const { Text, pal, now } = args
  const { isDesktop, rowBar, desktopBar } = barBoxes(args)

  return (id: string, state: SettledState) => {
    const share = steppedShare(settledBarClock(state.at), now)
    if (share === 0) return null
    const tone = settledBarTone(state)
    if (isDesktop) return rowBar(`bar-${id}`, 0, desktopBar(settledBarSvg(tone, state.at, now)))
    const color = tone === 'muted' ? pal.muted : pal.mark[tone]

    return rowBar(
      `bar-${id}`,
      0,
      <Text color={pal.under ? fadedOver(color, pal.under, share) : color}>{ROW_BARS}</Text>,
    )
  }
}
