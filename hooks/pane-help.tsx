import { toneSvg } from './desktop-svg'
import { HELP_COPY, type LegendEntry, MARK_LEGEND } from './help'
import { markShape } from './marks'
import type { PaneBase } from './pane-context'
import type { PaneRowLines } from './pane-row-lines'
import type { PaneRowParts } from './pane-row-parts'
import { DESKTOP_LINE_PT, TREE_LINE_AT } from './pane-sizes'
import type { PaneStatus } from './pane-status'

export function paneHelp({
  pal,
  keyList,
  Box,
  keyColumn,
  Text,
  hasRail,
  ToneSvg,
  svgCell,
  markGlyph,
  section,
  groupTitle,
  sections,
  statusRowLine,
}: Pick<PaneBase, 'pal' | 'keyList' | 'Box' | 'keyColumn' | 'Text' | 'hasRail'> &
  Pick<PaneRowLines, 'ToneSvg' | 'svgCell' | 'markGlyph'> &
  Pick<PaneRowParts, 'section' | 'groupTitle' | 'sections'> &
  Pick<PaneStatus, 'statusRowLine'>) {
  /** A legend mark, drawn as rows draw it: the running mark moves, and desktop draws a shape where it has one. */
  const legendMark = (m: LegendEntry) => {
    if (ToneSvg && m.tone && markShape(m.mark, DESKTOP_LINE_PT / 2) !== null)
      return svgCell(toneSvg(m.tone, m.mark), m.mark)

    return markGlyph(
      { text: m.mark, isRunning: m.isRunning },
      `legend-${m.mark}`,
      m.tone ? pal.mark[m.tone] : pal.muted,
    )
  }
  const helpKeysSection = () =>
    section([
      groupTitle(HELP_COPY.keys, 0),
      ...keyList.map(k => (
        <Box key={`help-key-${k.keys}`} flexDirection="row" paddingLeft={TREE_LINE_AT}>
          <Box width={keyColumn} flexShrink={0}>
            <Text bold>{k.keys}</Text>
          </Box>
          <Box flexShrink={1}>
            <Text color={pal.muted} wrap="wrap">
              {k.does}
            </Text>
          </Box>
        </Box>
      )),
    ])
  const helpMarksSection = () =>
    section([
      groupTitle(HELP_COPY.marks, 0),
      ...MARK_LEGEND.map(m =>
        statusRowLine({
          key: `help-mark-${m.mark}`,
          mark: legendMark(m),
          content: (
            <Text color={pal.muted} wrap="wrap">
              {m.words}
            </Text>
          ),
        }),
      ),
    ])
  /** Help in place of the tab's body: the keys where keys work, then the legend. A wide inline pane sets them side by side. */
  const helpView = () => {
    if (keyList.length === 0) return sections([helpMarksSection()])
    if (hasRail)
      return (
        <Box flexDirection="row" columnGap={4} flexGrow={1}>
          <Box flexDirection="column" width="50%" flexShrink={1}>
            {helpKeysSection()}
          </Box>
          <Box flexDirection="column" width="50%" flexShrink={1}>
            {helpMarksSection()}
          </Box>
        </Box>
      )

    return sections([helpKeysSection(), helpMarksSection()])
  }

  return { helpView }
}
