import { desktopLines, desktopTextPt } from './desktop-metrics'
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
import { exactly, inkLines, stackedIn } from './pane-status-tops'
import type { Drawn } from './pane-status-tops'
import type { MilestoneRow } from './status-goal-page'
import { STALL_GAP } from './status-page'
import type { PathLine, WorkJoint } from './status-path'
import { terminalSpanLines } from './terminal-text'
import { cellWidth } from './text'

/** More lines than a milestone and its work take. The milestone's Box clips the rest. */
const PATH_LINES = 200
const pathTexts: Record<NonNullable<PathLine>, string> = {
  continues: Array<string>(PATH_LINES).fill('│').join('\n'),
  'to-next': Array<string>(PATH_LINES).fill('┆').join('\n'),
}
/** The cells, or spaces' width on desktop, between the end of a name's first line and its word. */
const WORD_GAP = '  '

/**
 * The goal's path in the terminal and desktop looks: the line in the milestones' mark column, the word at the right of a
 * name's first line, and a done milestone folded to its name.
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
   * The line from under a milestone's mark to the next milestone's mark. The terminal draws it in text, `┆` into the
   * milestone that reads next. Desktop draws a 1 pt line, solid throughout, since stacked glyphs break into bars there.
   */
  const lineEl = (line: NonNullable<PathLine>) =>
    look === 'terminal' ? (
      <Box key="path-line" position="absolute" top={1} bottom={0} left={statusMarkAt} width={1}>
        <Text color={pal.line}>{pathTexts[line]}</Text>
      </Box>
    ) : (
      <Box key="path-line" position="absolute" top={0} bottom={0} left={0} flexDirection="row">
        <Box width={FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_TREE_AT - DESKTOP_HAIR_CELLS / 2} flexShrink={0} />
        <Box flexDirection="column" flexShrink={0}>
          <Box height={statusFrameEdge + 0.9} />
          <Box flexGrow={1} width={DESKTOP_HAIR_CELLS} backgroundColor={pal.divider} marginBottom={-statusFrameEdge} />
        </Box>
      </Box>
    )
  /** The terminal clips a column of glyphs to the box it runs beside. */
  const clip = look === 'terminal' ? { overflow: 'hidden' as const } : {}
  /**
   * A milestone's lines and the space under it, with the path's line beside them when the path goes on. In the
   * terminal the work's joints draw over the line, so their arms show.
   */
  const pathGroup = (key: string, line: PathLine, parts: Drawn[]): Drawn[] =>
    line === null
      ? parts
      : [
          stackedIn(
            <Box key={key} flexDirection="column" {...clip}>
              {look === 'terminal' ? lineEl(line) : null}
              {parts.map(p => p.el)}
              {look === 'terminal' ? null : lineEl(line)}
            </Box>,
            parts,
          ),
        ]
  /**
   * A milestone with the nesting connector running down from under its mark to the end of its row, where its work's
   * joints take it on and no path's line runs.
   */
  const connectorDown = (key: string, milestone: Drawn): Drawn => ({
    ...milestone,
    el: (
      <Box key={key} flexDirection="column" {...clip}>
        {milestone.el}
        {look === 'terminal' ? (
          lineEl('continues')
        ) : (
          <Box key="down" position="absolute" top={0} bottom={0} left={0} flexDirection="row">
            <Box width={FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_TREE_AT - DESKTOP_HAIR_CELLS / 2} flexShrink={0} />
            <Box flexDirection="column" flexShrink={0}>
              <Box height={statusFrameEdge + 0.9} />
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
      {isDrawn ? <Box width={DESKTOP_HAIR_CELLS} backgroundColor={pal.divider} /> : null}
    </Box>
  )
  /**
   * A work row's joint in the milestones' mark column: its arm to the row's mark on the first line, and the connector or
   * the path's line beside its lines. The terminal draws the path's own glyph past an arm, since it draws over the line.
   * On desktop the path's hairline runs on its own, and each stretch is drawn once, so no two overlap.
   */
  const jointEl = ({ arm, beside }: WorkJoint) => {
    if (look === 'terminal') {
      const glyph = beside === null ? ' ' : glyphs[beside]
      const first = arm === 'tee' ? '├─' : arm === 'elbow' ? '└─' : glyph
      return (
        <Box key="joint" position="absolute" top={0} bottom={0} left={statusMarkAt} width={2}>
          <Text color={pal.line}>{[first, ...Array<string>(PATH_LINES).fill(glyph)].join('\n')}</Text>
        </Box>
      )
    }
    const isConnectorAbove = beside === 'connector' || arm === 'elbow'
    return (
      <Box key="joint" position="absolute" top={0} bottom={0} left={0} flexDirection="row">
        <Box width={FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_TREE_AT - DESKTOP_HAIR_CELLS / 2} flexShrink={0} />
        <Box flexDirection="column" flexShrink={0}>
          {desktopColumn('above', isConnectorAbove, statusFrameEdge + 0.5)}
          <Box
            height={DESKTOP_HAIR_LINES}
            width={desktopArm}
            backgroundColor={arm === null ? undefined : pal.divider}
          />
          {desktopColumn('below', beside === 'connector', null)}
        </Box>
      </Box>
    )
  }
  /** A work row with its joint in the milestones' mark column. */
  const jointed = (key: string, row: Drawn, joint: WorkJoint): Drawn =>
    joint.arm === null && joint.beside === null
      ? row
      : {
          ...row,
          el: (
            <Box key={key} flexDirection="column" {...clip}>
              {row.el}
              {jointEl(joint)}
            </Box>
          ),
        }
  /** Whether the word fits at the right of the name's first line, which it never shortens or pushes to more lines. */
  const wordFits = (m: MilestoneRow, word: string) => {
    const width = statusTextWidth(0)
    const name = m.stall ? `${m.name}${STALL_GAP}${m.stall.text}` : m.name
    if (look === 'desktop') return desktopTextPt(`${desktopLines(name, width)[0] ?? ''}${WORD_GAP}${word}`) <= width
    const first = (terminalSpanLines([{ text: name }], width)[0] ?? []).map(s => s.text).join('')

    return cellWidth(`${first}${WORD_GAP}${word}`) <= width
  }
  /** The milestone's word, muted at the right of its name's first line, where it fits. It takes no line of its own. */
  const pathWord = (m: MilestoneRow): Drawn[] =>
    m.word === null || !wordFits(m, m.word)
      ? []
      : [
          {
            el: (
              <Box key={`goal-${m.id}-word`} position="absolute" top={0} right={0}>
                <Text color={pal.muted}>{m.word}</Text>
              </Box>
            ),
            lines: exactly(0),
          },
        ]
  /**
   * A done milestone folded to its name. The terminal draws its name muted with the fold's chevron after it, as one
   * button. Desktop draws a fold line, whose chevron takes the mark's place, since only a `Client` takes a click across
   * the line.
   */
  const foldedName = (m: MilestoneRow & { foldId: string }) => {
    const toggle = () => toggleFold(m.foldId)
    const isOpen = isUnfolded(m.foldId)
    const key = foldKey({ statusId: m.foldId })
    if (look === 'desktop')
      return { el: <Box key={`status-${m.id}`}>{foldRow(key, m.name, isOpen, toggle)}</Box>, lines: desktopFoldLines }

    return {
      el: <Box key={`goal-${m.id}-fold`}>{foldButton(key, m.name, isOpen, toggle, ' ', true)}</Box>,
      lines: inkLines(`${m.name} ▸`, statusTextWidth(0)),
    }
  }

  return { pathGroup, connectorDown, jointed, pathWord, foldedName }
}

export type PaneStatusPath = ReturnType<typeof paneStatusPath>
