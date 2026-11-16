import type { PaneBase } from './pane-context'
import type { PaneRowLines } from './pane-row-lines'
import type { PaneStatusLines } from './pane-status-lines'
import { ITEM_GAP_PT, LIST_GAP_PT, SECTION_GAP_PT } from './layout'
import { DESKTOP_CELL_PT, DESKTOP_HAIR_LINES, DESKTOP_LINE_PT, DESKTOP_MARK_CELLS, FRAME_INSET_PT } from './pane-sizes'
import { desktopSpaceLines, desktopTextLines, exactly, inkLines, stackedIn } from './pane-status-tops'
import type { Drawn } from './pane-status-tops'
import { cellWidth } from './text'

/** A Status part's line, such as Other work: the space above it, its name or the head's title, and its rule. */
export function paneStatusPart({
  look,
  Box,
  Text,
  pal,
  listColumns,
  statusMarkAt,
  markWidth,
  statusFrameEdge,
  desktopBlockWidth,
  statusTextWidth,
}: Pick<PaneBase, 'look' | 'Box' | 'Text' | 'pal' | 'listColumns'> &
  Pick<PaneRowLines, 'markWidth'> &
  Pick<PaneStatusLines, 'statusMarkAt' | 'statusFrameEdge' | 'desktopBlockWidth' | 'statusTextWidth'>) {
  // A Status rule starts at the text column, as the rules between sections and between Asks rows do. In the
  // terminal it stops at the end of the list's columns. On desktop it runs to the pane's edge.
  const statusRuleAt = statusMarkAt + markWidth
  const statusRuleCells = Math.max(0, listColumns - statusRuleAt)
  const desktopStatusRuleLeft = FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_MARK_CELLS
  /** A part drawn on one terminal line, and in `desktopLines` on desktop. */
  const oneLine = (el: JSX.Element, desktopLines: number): Drawn => ({
    el,
    lines: exactly(look === 'terminal' ? 1 : desktopLines),
  })
  /** A line of text that never wraps, in a Box padded by a frame's edge above and below, as a frame's text sits. */
  const desktopEdgedLine = 1 + 2 * desktopSpaceLines(statusFrameEdge)
  /**
   * The space above a labeled rule: `SECTION_GAP_PT` from the row above, less `rowAbovePad`, the padding under that row,
   * and the rule's own padding. The terminal draws whole lines, so its space is a blank line.
   */
  const gap = (key: string, rowAbovePad: number) => {
    const lines = (SECTION_GAP_PT - rowAbovePad - LIST_GAP_PT / 2) / DESKTOP_LINE_PT

    return oneLine(<Box key={key} height={look === 'desktop' ? lines : 1} />, lines)
  }
  /**
   * Other work's line: the space above it, its name, then a solid rule to the end of the list's columns. The head's
   * title draws in place of the name, in bold, with its description muted on the line under it, at the same column.
   */
  const statusPartLine = (
    id: string,
    text: string,
    isFirst: boolean,
    title?: { description: string | null },
    rowAbovePad = ITEM_GAP_PT / 2,
  ) => {
    const above = isFirst ? [] : [gap('part-above', rowAbovePad)]
    const line = oneLine(
      look === 'desktop' ? (
        <Box flexDirection="row" alignItems="center" marginLeft={desktopStatusRuleLeft} paddingY={statusFrameEdge}>
          <Box flexShrink={0} paddingRight={1}>
            <Text color={title ? undefined : pal.muted} bold={!!title}>
              {text}
            </Text>
          </Box>
          <Box flexGrow={1} height={DESKTOP_HAIR_LINES} backgroundColor={pal.divider} />
        </Box>
      ) : (
        <Box flexDirection="row">
          <Box width={statusRuleAt} flexShrink={0} />
          <Text color={title ? undefined : pal.muted} bold={!!title}>{`${text} `}</Text>
          <Text color={pal.divider}>{'─'.repeat(Math.max(4, statusRuleCells - cellWidth(text) - 1))}</Text>
        </Box>
      ),
      desktopEdgedLine,
    )

    const description = title?.description ? [statusPartDescription(id, title.description)] : []

    return stackedIn(
      <Box key={`status-${id}`} flexDirection="column">
        {above.map(p => p.el)}
        {line.el}
        {description.map(p => p.el)}
      </Box>,
      [...above, line, ...description],
    )
  }
  /** The head's description under its title's rule, wrapped at the text column. */
  const statusPartDescription = (id: string, text: string): Drawn => {
    const lines =
      look === 'desktop'
        ? desktopTextLines(text, desktopBlockWidth - desktopStatusRuleLeft * DESKTOP_CELL_PT)
        : inkLines(text, statusTextWidth(0))

    return {
      el: (
        <Box key={`status-${id}-description`} paddingLeft={look === 'desktop' ? desktopStatusRuleLeft : statusRuleAt}>
          <Text wrap="wrap" color={pal.muted}>
            {text}
          </Text>
        </Box>
      ),
      lines,
    }
  }

  return { statusPartLine }
}
