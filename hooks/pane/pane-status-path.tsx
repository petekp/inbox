import { foldGlyph } from '../../core/view/fold-chevron'
import { foldKey } from './fold-keys'
import type { PaneBase } from './pane-context'
import type { PaneRowParts } from './pane-row-parts'
import {
  DESKTOP_ARM_GAP,
  DESKTOP_CELL_PT,
  DESKTOP_HAIR_CELLS,
  DESKTOP_HAIR_LINES,
  DESKTOP_MARK_CELLS,
  DESKTOP_TREE_AT,
  FRAME_INSET_PT,
} from './pane-sizes'
import type { PaneStatusLines } from './pane-status-lines'
import { inkLines, stackedIn } from './pane-status-tops'
import type { Drawn } from './pane-status-tops'
import type { MilestoneRow } from '../../core/view/status-goal-page'
import type { PathLine, WorkJoint } from '../../core/view/status-path'

/** More lines than a milestone and its work take. The milestone's Box clips the rest. */
const PATH_LINES = 200
const pathTexts: Record<NonNullable<PathLine>, string> = {
  continues: Array<string>(PATH_LINES).fill('│').join('\n'),
  'to-next': Array<string>(PATH_LINES).fill('┆').join('\n'),
}

/**
 * The goal's path in the terminal and desktop looks: the line in the milestones' mark column, and a done milestone
 * folded to its name.
 */
export function paneStatusPath(
  {
    look,
    Box,
    Text,
    pal,
    statusMarkAt,
    statusFrameEdge,
    statusTextWidth,
    foldRow,
    foldButton,
    desktopFoldLines,
  }: Pick<PaneBase, 'look' | 'Box' | 'Text' | 'pal'> &
    Pick<PaneStatusLines, 'statusMarkAt' | 'statusFrameEdge' | 'statusTextWidth'> &
    Pick<PaneRowParts, 'foldRow' | 'foldButton' | 'desktopFoldLines'>,
  { isUnfolded, toggleFold }: { isUnfolded: (id: string) => boolean; toggleFold: (id: string) => void },
) {
  /**
   * What a terminal connector's glyphs draw in beside a part: inside the selection, the selection's color with the
   * connector's tint over it, so the highlight reads as laid over the line.
   */
  const glyphLook = (isSelected: boolean | undefined) =>
    isSelected && pal.selection
      ? { color: pal.selectionLine ?? pal.line, backgroundColor: pal.selection }
      : { color: pal.line }
  /**
   * The line from under a milestone's mark to the next milestone's mark. The terminal draws it in text, `┆` into the
   * milestone that reads next. Desktop draws a 1 pt line, solid throughout, since stacked glyphs break into bars there.
   */
  const lineEl = (line: NonNullable<PathLine>, isSelected?: boolean, top = 1, edge = statusFrameEdge) =>
    look === 'terminal' ? (
      <Box key="path-line" position="absolute" top={top} bottom={0} left={statusMarkAt} width={1}>
        <Text {...glyphLook(isSelected)}>{pathTexts[line]}</Text>
      </Box>
    ) : (
      <Box key="path-line" position="absolute" top={0} bottom={0} left={0} flexDirection="row">
        <Box width={FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_TREE_AT - DESKTOP_HAIR_CELLS / 2} flexShrink={0} />
        <Box flexDirection="column" flexShrink={0}>
          <Box height={edge + 0.9} />
          <Box flexGrow={1} width={DESKTOP_HAIR_CELLS} backgroundColor={pal.line} marginBottom={-statusFrameEdge} />
        </Box>
      </Box>
    )
  /** The terminal clips a column of glyphs to the box it runs beside. */
  const clip = look === 'terminal' ? { overflow: 'hidden' as const } : {}
  /**
   * A milestone's lines and the space under it, with the path's line beside them when the path goes on. Desktop draws
   * the line once across the group, from `edge`, the milestone frame's padding and border above its name, past the
   * mark. The terminal draws it beside each part that has no joint of its own, so a selected part draws it on its
   * highlight: see `lineBeside`.
   */
  const pathGroup = (key: string, line: PathLine, parts: Drawn[], edge = statusFrameEdge): Drawn[] =>
    line === null || look === 'terminal'
      ? parts
      : [
          stackedIn(
            <Box key={key} flexDirection="column">
              {parts.map(p => p.el)}
              {lineEl(line, false, 1, edge)}
            </Box>,
            parts,
          ),
        ]
  /**
   * In the terminal, `part` with the path's line beside it. The line runs down from under the mark on a milestone's
   * first line, or from `top` when the part is the space under a milestone, which has no mark. The line draws over the
   * part, so a selected part's highlight does not cover it.
   */
  const lineBeside = (key: string, line: NonNullable<PathLine>, part: Drawn, top = 1): Drawn =>
    look === 'desktop'
      ? part
      : {
          ...part,
          el: (
            <Box key={key} flexDirection="column" {...clip}>
              {part.el}
              {lineEl(line, part.isSelected, top)}
            </Box>
          ),
        }
  /**
   * A milestone with the nesting connector running down from under its mark to the end of its row, where its work's
   * joints take it on and no path's line runs.
   */
  const connectorDown = (key: string, milestone: Drawn, edge = statusFrameEdge): Drawn => ({
    ...milestone,
    el: (
      <Box key={key} flexDirection="column" {...clip}>
        {milestone.el}
        {look === 'terminal' ? (
          lineEl('continues', milestone.isSelected)
        ) : (
          <Box key="down" position="absolute" top={0} bottom={0} left={0} flexDirection="row">
            <Box width={FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_TREE_AT - DESKTOP_HAIR_CELLS / 2} flexShrink={0} />
            <Box flexDirection="column" flexShrink={0}>
              <Box height={edge + 0.9} />
              {desktopColumn('below', true, null)}
            </Box>
          </Box>
        )}
      </Box>
    ),
  })
  const glyphs: Record<'connector' | NonNullable<PathLine>, string> = { connector: '│', continues: '│', 'to-next': '┆' }
  /** The cells or points from the column to a work row's mark, as a subject's tree reaches to a child's. */
  const desktopArm = DESKTOP_MARK_CELLS * 2 - DESKTOP_TREE_AT - DESKTOP_ARM_GAP
  /** A stretch of the column on desktop: `height` lines, or the rest of the row. */
  const desktopColumn = (key: string, isDrawn: boolean, height: number | null) => (
    <Box key={key} flexDirection="row" {...(height === null ? { flexGrow: 1 } : { height })}>
      {isDrawn ? <Box width={DESKTOP_HAIR_CELLS} backgroundColor={pal.line} /> : null}
    </Box>
  )
  /**
   * A work row's joint in the milestones' mark column: its arm to the row's mark on the first line, and the connector or
   * the path's line beside its lines. The terminal draws the path's own glyph past an arm, since it draws over the line.
   * On desktop the tree line's color is translucent, so each point is drawn once: the column's stretches stack, and an arm
   * beside the path's own hairline starts a hairline to its right.
   */
  const jointEl = ({ arm, beside }: WorkJoint, edge: number, isSelected?: boolean) => {
    if (look === 'terminal') {
      const glyph = beside === null ? ' ' : glyphs[beside]
      const first = arm === 'tee' ? '├─' : arm === 'elbow' ? '└─' : glyph
      return (
        <Box key="joint" position="absolute" top={0} bottom={0} left={statusMarkAt} width={2}>
          <Text {...glyphLook(isSelected)}>{[first, ...Array<string>(PATH_LINES).fill(glyph)].join('\n')}</Text>
        </Box>
      )
    }
    const isConnectorAbove = beside === 'connector' || arm === 'elbow'
    const isBesidePath = beside !== null && beside !== 'connector'
    const armSlot =
      arm !== null ? (
        <Box
          key="arm"
          height={DESKTOP_HAIR_LINES}
          width={isBesidePath ? desktopArm - DESKTOP_HAIR_CELLS : desktopArm}
          {...(isBesidePath ? { marginLeft: DESKTOP_HAIR_CELLS } : {})}
          backgroundColor={pal.line}
        />
      ) : (
        <Box key="arm" height={DESKTOP_HAIR_LINES} flexDirection="row">
          {beside === 'connector' ? <Box width={DESKTOP_HAIR_CELLS} backgroundColor={pal.line} /> : null}
        </Box>
      )
    return (
      <Box key="joint" position="absolute" top={0} bottom={0} left={0} flexDirection="row">
        <Box width={FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_TREE_AT - DESKTOP_HAIR_CELLS / 2} flexShrink={0} />
        <Box flexDirection="column" flexShrink={0}>
          {desktopColumn('above', isConnectorAbove, edge + 0.5)}
          {armSlot}
          {desktopColumn('below', beside === 'connector', null)}
        </Box>
      </Box>
    )
  }
  /** A work row with its joint in the milestones' mark column. `edge` is its frame's padding and border above its text. */
  const jointed = (key: string, row: Drawn, joint: WorkJoint, edge = statusFrameEdge): Drawn =>
    joint.arm === null && joint.beside === null
      ? row
      : {
          ...row,
          el: (
            <Box key={key} flexDirection="column" {...clip}>
              {row.el}
              {jointEl(joint, edge, row.isSelected)}
            </Box>
          ),
        }
  /**
   * A done milestone folded to its name, or a met goal's milestones folded into the line that names them. The terminal
   * draws the name muted with the fold's chevron after it, as one button. Desktop draws a fold line, since only a
   * `Client` takes a click across the line.
   */
  const foldedName = (
    m: Pick<MilestoneRow, 'id' | 'name'> & { foldId: string },
    mark: { text: string; color: string | null } | null = null,
  ) => {
    const toggle = () => toggleFold(m.foldId)
    const isOpen = isUnfolded(m.foldId)
    const key = foldKey({ statusId: m.foldId })
    if (look === 'desktop')
      return {
        el: (
          <Box key={`status-${m.id}`}>
            {foldRow(key, m.name, isOpen, toggle, undefined, undefined, undefined, { mark })}
          </Box>
        ),
        lines: desktopFoldLines,
      }

    return {
      el: <Box key={`goal-${m.id}-fold`}>{foldButton(key, m.name, isOpen, toggle)}</Box>,
      lines: inkLines(`${m.name} ${foldGlyph(false)}`, statusTextWidth(0)),
    }
  }

  return { pathGroup, lineBeside, connectorDown, jointed, foldedName }
}

export type PaneStatusPath = ReturnType<typeof paneStatusPath>
