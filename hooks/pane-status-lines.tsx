import { desktopLines, desktopTextPt } from './desktop-metrics'
import type { PaneBase } from './pane-context'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import {
  DESKTOP_ARM_GAP,
  DESKTOP_CELL_PT,
  DESKTOP_HAIR_LINES,
  DESKTOP_MARK_CELLS,
  DESKTOP_SIDE_CELLS,
  DESKTOP_TREE_AT,
  STATUS_PAD_Y,
  TREE_LINE_AT,
} from './pane-sizes'
import { nameBeforeStall, STATUS_TEXT_LINES, type StatusBranch, type StatusStall } from './status-page'
import { STALL_GAP } from './status-page-parts'
import { desktopSpanLines, type TerminalSpan, terminalSpanLines } from './terminal-text'
import { cellWidth } from './text'
import { paneDesktopTree } from './pane-desktop-tree'
import { desktopTextLines } from './pane-status-tops'
import type { Drawn, Lines } from './pane-status-tops'

export function paneStatusLines({
  Box,
  Text,
  pal,
  look,
  listColumns,
  terminalText,
  desktopColumnPt,
  markWidth,
  branch,
  desktopHairline,
}: Pick<PaneBase, 'Box' | 'Text' | 'pal' | 'look' | 'listColumns' | 'terminalText'> &
  Pick<PaneRowKeys, 'desktopColumnPt'> &
  Pick<PaneRowLines, 'markWidth' | 'branch' | 'desktopHairline'>) {
  /** Where a Status row's mark sits in the terminal: in the head's column, so the list lines up with it. */
  const statusMarkAt = TREE_LINE_AT
  /** The text column of a Status line at `depth`, in cells on the terminal and in points on desktop. */
  const statusTextWidth = (depth: number) =>
    look === 'desktop'
      ? desktopColumnPt(1 + DESKTOP_MARK_CELLS * (depth * 2 + 1)) + DESKTOP_SIDE_CELLS * DESKTOP_CELL_PT
      : listColumns - 1 - statusMarkAt - markWidth * (depth + 1)
  /** The text column of a desktop block, which has no mark column, in points. */
  const desktopBlockWidth = desktopColumnPt(0) + DESKTOP_SIDE_CELLS * DESKTOP_CELL_PT
  const fitsStatusLine = (depth: number) => (text: string) =>
    look === 'desktop' ? desktopTextPt(text) <= statusTextWidth(depth) : cellWidth(text) <= statusTextWidth(depth)
  /**
   * A Status text: on the terminal its lines, each already wrapped, and on desktop one line that desktop wraps in
   * `widthPt`.
   */
  const wrappedText = (key: string, lines: TerminalSpan[][], widthPt: number): Drawn => {
    const count: Lines =
      look === 'desktop'
        ? desktopTextLines(
            lines
              .flat()
              .map(s => s.text)
              .join(''),
            widthPt,
          )
        : { least: lines.length, most: lines.length }

    return {
      el: (
        <Box key={key}>
          <Text wrap="wrap">{terminalText(lines)}</Text>
        </Box>
      ),
      lines: count,
    }
  }
  /** One text of a Status line, wrapped to at most `limit` lines and cut with an ellipsis past them. */
  const statusPageText = (key: string, spans: TerminalSpan[], depth: number, limit = STATUS_TEXT_LINES): Drawn =>
    wrappedText(
      key,
      look === 'desktop'
        ? [desktopSpanLines(spans, statusTextWidth(depth), limit)]
        : terminalSpanLines(spans, statusTextWidth(depth), limit),
      statusTextWidth(depth),
    )
  /** A row's stall word, muted, never split by a wrap. */
  const stallSpan = (stall: StatusStall): TerminalSpan => {
    const text = look === 'desktop' ? stall.text.replaceAll(' ', '\u00a0') : stall.text

    return { text, isUnbroken: true, isMuted: true }
  }
  /**
   * A row's name with its stall word after `STALL_GAP`, on the line of the name's last word, which a wrap never
   * splits from them. `nameBeforeStall` cuts the name so the line fits `STATUS_TEXT_LINES`.
   */
  const nameSpans = (name: TerminalSpan, stall: StatusStall, depth: number, reserve = 0) => {
    const width = statusTextWidth(depth) - reserve
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

    return { spans: spans(shown), width }
  }
  /** A name line's spans, with `reserve` of the line's width left free after them, and the width they wrap in. */
  const nameLineSpans = (name: TerminalSpan, stall: StatusStall | null, depth: number, reserve: number) =>
    stall ? nameSpans(name, stall, depth, reserve) : { spans: [name], width: statusTextWidth(depth) - reserve }
  const statusNameLine = (key: string, name: TerminalSpan, stall: StatusStall | null, depth: number): Drawn => {
    if (!stall) return statusPageText(key, [name], depth)
    const { spans, width } = nameSpans(name, stall, depth)

    return wrappedText(key, look === 'desktop' ? [spans] : terminalSpanLines(spans, width), width)
  }
  /** A Status row frame's padding and 1 pt border above or below its text on desktop, in half lines. */
  const statusFrameEdge = STATUS_PAD_Y + 2 * DESKTOP_HAIR_LINES
  const { desktopTreeLine } = paneDesktopTree({ Box, desktopHairline, pal })
  /**
   * The line that ties the rows under a subject to it, in the subject's mark column. `down` runs from under the
   * subject's mark to the end of its row. `mid` and `last` reach across to a child's mark, and `mid` runs on to the
   * next row, so a row that wraps keeps the line beside each of its lines. `depth` is the subject's.
   */
  const statusTree = (
    key: string,
    shape: 'down' | StatusBranch,
    depth: number,
    padY = STATUS_PAD_Y,
    padBelow = padY,
  ) => {
    if (look === 'terminal') {
      const at = statusMarkAt + markWidth * depth
      return shape === 'down' ? branch('pass', 0, at, pal.line, 1, key) : branch(shape, 0, at, pal.line, 0, key)
    }
    return desktopTreeLine(key, shape, {
      at: DESKTOP_MARK_CELLS * 2 * depth + DESKTOP_TREE_AT,
      arm: DESKTOP_MARK_CELLS * 2 - DESKTOP_TREE_AT - DESKTOP_ARM_GAP,
      edge: padY,
      edgeBelow: padBelow,
    })
  }

  return {
    statusMarkAt,
    fitsStatusLine,
    statusTextWidth,
    desktopBlockWidth,
    statusPageText,
    statusNameLine,
    nameLineSpans,
    statusFrameEdge,
    statusTree,
  }
}

export type PaneStatusLines = ReturnType<typeof paneStatusLines>
