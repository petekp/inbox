import { desktopLines, desktopTextPt } from './desktop-metrics'
import type { PaneBase } from './pane-context'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import {
  DESKTOP_ARM_GAP,
  DESKTOP_CELL_PT,
  DESKTOP_HAIR_CELLS,
  DESKTOP_HAIR_LINES,
  DESKTOP_MARK_CELLS,
  DESKTOP_SIDE_CELLS,
  DESKTOP_TREE_AT,
  STATUS_PAD_Y,
  TREE_LINE_AT,
} from './pane-sizes'
import {
  nameBeforeStall,
  STALL_GAP,
  STATUS_TEXT_LINES,
  type StatusBranch,
  type StatusPage,
  type StatusStall,
} from './status-page'
import { desktopSpanLines, type TerminalSpan, terminalSpanLines } from './terminal-text'
import { cellWidth } from './text'

export function paneStatusLines({
  Box,
  Text,
  pal,
  look,
  listColumns,
  terminalText,
  desktopFrame,
  desktopColumnPt,
  markWidth,
  branch,
  desktopHairline,
}: Pick<PaneBase, 'Box' | 'Text' | 'pal' | 'look' | 'listColumns' | 'terminalText'> &
  Pick<PaneRowFrame, 'desktopFrame'> &
  Pick<PaneRowKeys, 'desktopColumnPt'> &
  Pick<PaneRowLines, 'markWidth' | 'branch' | 'desktopHairline'>) {
  /** The head reads like a row: its title in bold, and its description muted on the line under it. */
  const statusHead = (head: NonNullable<StatusPage['head']>) => {
    const lines = (
      <Box flexDirection="column">
        <Text wrap="wrap" bold>
          {head.title}
        </Text>
        {head.description ? (
          <Text wrap="wrap" color={pal.muted}>
            {head.description}
          </Text>
        ) : null}
      </Box>
    )

    return look === 'desktop' ? (
      desktopFrame({ key: 'status-head', padY: 0, markCells: 0, hasSide: false, children: lines })
    ) : (
      <Box key="status-head" paddingLeft={TREE_LINE_AT}>
        {lines}
      </Box>
    )
  }
  /** Where a Status row's mark sits in the terminal: in the head's column, so the list lines up with it. */
  const statusMarkAt = TREE_LINE_AT
  /** The text column of a Status line at `depth`, in cells on the terminal and in points on desktop. */
  const statusTextWidth = (depth: number) =>
    look === 'desktop'
      ? desktopColumnPt(1 + DESKTOP_MARK_CELLS * (depth * 2 + 1)) + DESKTOP_SIDE_CELLS * DESKTOP_CELL_PT
      : listColumns - 1 - statusMarkAt - markWidth * (depth + 1)
  const fitsStatusLine = (depth: number) => (text: string) =>
    look === 'desktop' ? desktopTextPt(text) <= statusTextWidth(depth) : cellWidth(text) <= statusTextWidth(depth)
  /** One text of a Status line, wrapped to at most `limit` lines and cut with an ellipsis past them. */
  const statusPageText = (key: string, spans: TerminalSpan[], depth: number, limit = STATUS_TEXT_LINES) => (
    <Box key={key}>
      <Text wrap="wrap">
        {terminalText(
          look === 'desktop'
            ? [desktopSpanLines(spans, statusTextWidth(depth), limit)]
            : terminalSpanLines(spans, statusTextWidth(depth), limit),
        )}
      </Text>
    </Box>
  )
  /** A row's stall word in the stall's tone, never split by a wrap. */
  const stallSpan = (stall: StatusStall): TerminalSpan => {
    const text = look === 'desktop' ? stall.text.replaceAll(' ', '\u00a0') : stall.text
    const tone = stall.tone === 'needsYou' ? { isNeedsYou: true as const } : { isDone: true as const }

    return { text, isUnbroken: true, ...tone }
  }
  /**
   * A row's name with its stall word after `STALL_GAP`, on the line of the name's last word, which a wrap never
   * splits from them. `nameBeforeStall` cuts the name so the line fits `STATUS_TEXT_LINES`.
   */
  const statusNameLine = (key: string, name: TerminalSpan, stall: StatusStall | null, depth: number) => {
    if (!stall) return statusPageText(key, [name], depth)
    const width = statusTextWidth(depth)
    const gap = look === 'desktop' ? STALL_GAP.replaceAll(' ', '\u00a0') : STALL_GAP
    const spans = (shown: string): TerminalSpan[] => [
      { ...name, text: shown },
      { text: gap, isMuted: true, isUnbroken: true },
      stallSpan(stall),
    ]
    const lineCount = (shown: string) =>
      look === 'desktop'
        ? desktopLines(
            spans(shown)
              .map(s => s.text)
              .join(''),
            width,
          ).length
        : terminalSpanLines(spans(shown), width).length
    const shown = nameBeforeStall(name.text, x => lineCount(x) <= STATUS_TEXT_LINES)

    return (
      <Box key={key}>
        <Text wrap="wrap">
          {terminalText(look === 'desktop' ? [spans(shown)] : terminalSpanLines(spans(shown), width))}
        </Text>
      </Box>
    )
  }
  /** A Status row frame's padding and 1 pt border above or below its text on desktop, in half lines. */
  const statusFrameEdge = STATUS_PAD_Y + 2 * DESKTOP_HAIR_LINES
  /**
   * The line that ties the rows under a subject to it, in the subject's mark column. `down` runs from under the
   * subject's mark to the end of its row. `mid` and `last` reach across to a child's mark, and `mid` runs on to the
   * next row, so a row that wraps keeps the line beside each of its lines.
   */
  const statusTree = (key: string, shape: 'down' | StatusBranch) => {
    if (look === 'terminal')
      return shape === 'down'
        ? branch('pass', 0, statusMarkAt, pal.line, 1, key)
        : branch(shape, 0, statusMarkAt, pal.line, 0, key)
    // The line spans the mark column, which spans the frame's content. To meet the next row's line, each end reaches
    // over the frame's padding and its border.
    const reach = -statusFrameEdge
    const firstLineMiddle = 0.5
    const hair = (key: string, grow: boolean, ends: { marginTop?: number; marginBottom?: number }) => (
      <Box key={key} flexDirection="row" {...(grow ? { flexGrow: 1 } : { height: firstLineMiddle })}>
        {desktopHairline('line', 'down', ends)}
      </Box>
    )
    const arm = DESKTOP_MARK_CELLS * 2 - DESKTOP_TREE_AT - DESKTOP_ARM_GAP
    const parts =
      shape === 'down'
        ? [<Box key="under-mark" height={firstLineMiddle + 0.4} />, hair('down', true, { marginBottom: reach })]
        : [
            hair('to-arm', false, { marginTop: reach }),
            desktopHairline('arm', 'across', { width: arm }),
            ...(shape === 'mid' ? [hair('on', true, { marginBottom: reach })] : []),
          ]

    return (
      <Box key={key} position="absolute" top={0} bottom={0} left={0} flexDirection="row">
        <Box width={DESKTOP_TREE_AT - DESKTOP_HAIR_CELLS / 2} flexShrink={0} />
        <Box flexDirection="column" flexShrink={0}>
          {parts}
        </Box>
      </Box>
    )
  }

  return { statusHead, statusMarkAt, fitsStatusLine, statusPageText, statusNameLine, statusFrameEdge, statusTree }
}

export type PaneStatusLines = ReturnType<typeof paneStatusLines>
