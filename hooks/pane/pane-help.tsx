import { desktopMarkShape, toneSvg } from './desktop-svg'
import { HELP_COPY, helpVersionText, type HelpKey, type LegendEntry, MARK_LEGEND } from '../../core/view/help'
import { mod } from '../mod/mod-state'
import type { PaneBase } from './pane-context'
import type { PaneRowLines } from './pane-row-lines'
import type { PaneRowParts } from './pane-row-parts'
import { TREE_LINE_AT } from './pane-sizes'

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
  markWidth,
  section,
  groupTitle,
  sections,
}: Pick<PaneBase, 'pal' | 'keyList' | 'Box' | 'keyColumn' | 'Text' | 'hasRail'> &
  Pick<PaneRowLines, 'ToneSvg' | 'svgCell' | 'markGlyph' | 'markWidth'> &
  Pick<PaneRowParts, 'section' | 'groupTitle' | 'sections'>) {
  /** A legend mark, drawn as rows draw it: the running mark moves, and desktop draws a shape where it has one. */
  const legendMark = (m: LegendEntry) => {
    if (ToneSvg && m.tone && desktopMarkShape(m.mark) !== null) {
      const { source, cells } = toneSvg(m.tone, m.mark)
      return svgCell(source, m.mark, undefined, cells)
    }

    return markGlyph(
      { text: m.mark, isRunning: m.isRunning },
      `legend-${m.mark}`,
      m.tone ? pal.mark[m.tone] : pal.muted,
    )
  }
  /**
   * Help's one pair of columns, in cells: a key, a mark or a tab's symbol in the first, which starts one mark column under
   * its section's title, and its words in the second. A tab's symbol takes two cells, so the column is the wider of that and the keys' column.
   */
  const helpColumn = Math.max(keyColumn, 4)
  const listIndent = TREE_LINE_AT + markWidth
  /** Help's two-column lines: what to press or look for, and what it does or names. */
  const keyRows = (list: readonly HelpKey[], prefix: string) =>
    list.map(k => (
      <Box key={`${prefix}-${k.keys}`} flexDirection="row" paddingLeft={listIndent}>
        <Box width={helpColumn} flexShrink={0}>
          <Text bold>{k.keys}</Text>
        </Box>
        <Box flexShrink={1}>
          <Text color={pal.muted} wrap="wrap">
            {k.does}
          </Text>
        </Box>
      </Box>
    ))
  /** Which inbox build this is, in the muted words of the legend. A build with no version, as in a test, draws none. */
  const versionText = mod.version ? helpVersionText(mod.version, mod.isNextBuild) : undefined
  const helpKeysSection = () =>
    section([groupTitle(HELP_COPY.keys, 0, undefined, false, versionText), ...keyRows(keyList, 'help-key')])
  const helpMarksSection = () =>
    section([
      groupTitle(HELP_COPY.indicators, 0),
      ...MARK_LEGEND.map(m => (
        <Box key={`help-mark-${m.mark}`} flexDirection="row" paddingLeft={listIndent}>
          <Box width={helpColumn} flexShrink={0}>
            {legendMark(m)}
          </Box>
          <Box flexShrink={1}>
            <Text color={pal.muted} wrap="wrap">
              {m.words}
            </Text>
          </Box>
        </Box>
      )),
    ])
  /** With no keys to give a title to, the version closes Help under the legend. */
  const helpVersionSection = () =>
    versionText
      ? section(
          <Box key="help-version" flexDirection="row" paddingLeft={listIndent + helpColumn}>
            <Text color={pal.muted}>{versionText}</Text>
          </Box>,
        )
      : null
  /** Help in place of the tab's body: the keys where keys work, then the legend. A wide inline pane sets them side by side. */
  const helpView = () => {
    const version = helpVersionSection()
    if (keyList.length === 0) return sections([helpMarksSection(), ...(version ? [version] : [])])
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
