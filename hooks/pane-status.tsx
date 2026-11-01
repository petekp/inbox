import { statusKeyPlan } from './action-plan'
import { DESKTOP_CHARS_PER_CELL } from './desktop-metrics'
import { LOOK_GAP_PT } from './layout'
import type { PaneAskTabs } from './pane-asks'
import type { PaneBase, PaneHandlers } from './pane-context'
import type { KeyAction } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import type { PaneRowParts } from './pane-row-parts'
import {
  DESKTOP_CELL_PT,
  DESKTOP_DASH_GAP_PT,
  DESKTOP_DASH_PT,
  DESKTOP_HAIR_LINES,
  DESKTOP_LINE_PT,
  DESKTOP_MARK_CELLS,
  FRAME_INSET_PT,
  STATUS_PAD_Y,
} from './pane-sizes'
import type { PaneStatusLines } from './pane-status-lines'
import { LOOK_DASH, mergedLine, type StatusRow, WAS_PREFIX } from './status-page'
import { SELECTION_BAR } from './terminal-text'
import { cellWidth } from './text'

export function paneStatus(
  {
    listColumns,
    look,
    Box,
    Text,
    pal,
    statusKeyRow,
    view,
    isInline,
    statusMarkAt,
    statusFrameEdge,
    statusNameLine,
    statusPageText,
    fitsStatusLine,
    statusTree,
    statusHead,
    markWidth,
    desktopHairline,
    markGlyph,
    desktopFrame,
    keyRow,
    emptyState,
    sections,
    section,
  }: Pick<PaneBase, 'listColumns' | 'look' | 'Box' | 'Text' | 'pal' | 'statusKeyRow' | 'view' | 'isInline'> &
    Pick<
      PaneStatusLines,
      | 'statusMarkAt'
      | 'statusFrameEdge'
      | 'statusNameLine'
      | 'statusPageText'
      | 'fitsStatusLine'
      | 'statusTree'
      | 'statusHead'
    > &
    Pick<PaneRowLines, 'markWidth' | 'desktopHairline' | 'markGlyph'> &
    Pick<PaneRowFrame, 'desktopFrame'> &
    Pick<PaneRowKeys, 'keyRow'> &
    Pick<PaneAskTabs, 'emptyState'> &
    Pick<PaneRowParts, 'sections' | 'section'>,
  { showAsk }: Pick<PaneHandlers, 'showAsk'>,
) {
  // A Status rule starts at the text column, as the rules between sections and between Asks rows do. In the
  // terminal it stops at the end of the list's columns. On desktop it runs to the pane's edge.
  const statusRuleAt = statusMarkAt + markWidth
  const statusRuleCells = Math.max(0, listColumns - statusRuleAt)
  const desktopStatusRuleLeft = FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_MARK_CELLS
  /** The rule above a Status row that starts an item. */
  const statusRule = (id: string) =>
    look === 'desktop' ? (
      desktopHairline(`status-rule-${id}`, 'across', { marginLeft: desktopStatusRuleLeft })
    ) : (
      <Box key={`status-rule-${id}`} flexDirection="row">
        <Box width={statusRuleAt} flexShrink={0} />
        <Text color={pal.divider}>{'─'.repeat(statusRuleCells)}</Text>
      </Box>
    )
  /**
   * A dashed 1 pt line on desktop, about `cells` wide: dashes that grow to share the room, so the line fills it at any
   * width. Desktop has no dashed border, and a run of a dash glyph wraps.
   */
  const desktopDashes = (key: string, cells: number) => {
    const count = Math.max(1, Math.round((cells * DESKTOP_CELL_PT) / (DESKTOP_DASH_PT + DESKTOP_DASH_GAP_PT)))
    const dashes = Array.from({ length: count }, (_, n) => [
      ...(n > 0 ? [<Box key={`dash-gap-${n}`} width={DESKTOP_DASH_GAP_PT / DESKTOP_CELL_PT} flexShrink={0} />] : []),
      <Box key={`dash-${n}`} flexGrow={1} height={DESKTOP_HAIR_LINES} backgroundColor={pal.divider} />,
    ]).flat()

    return (
      <Box key={key} flexGrow={1} flexDirection="row" height={DESKTOP_HAIR_LINES}>
        {dashes}
      </Box>
    )
  }
  /**
   * The look line: "Last seen" in the middle of a dashed rule that spans what the rule above a row spans, with space
   * above it, and below it unless it ends the list.
   */
  const statusLookLine = (text: string, isLast: boolean) => {
    // The terminal draws whole lines, so its space is a blank line.
    const gap = (key: string) => <Box key={key} height={look === 'desktop' ? LOOK_GAP_PT / DESKTOP_LINE_PT : 1} />
    const label = ` ${text} `
    const fill = Math.max(4, statusRuleCells - cellWidth(label))
    const before = Math.floor(fill / 2)
    const ruleCells = (listColumns - desktopStatusRuleLeft - 2 - text.length / DESKTOP_CHARS_PER_CELL) / 2
    // On desktop it sits outside a frame, whose border would inset the rule's right end, so the padding stands in for
    // the frame's.
    const rule =
      look === 'desktop' ? (
        <Box flexDirection="row" alignItems="center" marginLeft={desktopStatusRuleLeft} paddingY={statusFrameEdge}>
          {desktopDashes('look-before', ruleCells)}
          <Box flexShrink={0} paddingX={1}>
            <Text color={pal.muted}>{text}</Text>
          </Box>
          {desktopDashes('look-after', ruleCells)}
        </Box>
      ) : (
        <Box flexDirection="row">
          <Box width={statusRuleAt} flexShrink={0} />
          <Text color={pal.divider}>{`${LOOK_DASH.repeat(before)}${label}${LOOK_DASH.repeat(fill - before)}`}</Text>
        </Box>
      )

    return (
      <Box key="status-look" flexDirection="column">
        {gap('look-above')}
        {rule}
        {isLast ? null : gap('look-below')}
      </Box>
    )
  }
  /** One line of the Status tab's list: a mark and its text. `depth` 1 sits under a subject's text. */
  const statusRowLine = ({
    key,
    depth = 0,
    mark,
    content,
    tree = null,
    isSelected = false,
  }: {
    key: string
    depth?: number
    mark: JSX.Element | null
    content: JSX.Element | JSX.Element[]
    tree?: JSX.Element | null
    /** The row whose keys work, which the terminal marks with the selection bar, as on a row tab. */
    isSelected?: boolean
  }) =>
    look === 'desktop' ? (
      desktopFrame({
        key,
        indent: DESKTOP_MARK_CELLS * (depth * 2),
        isMarkHung: false,
        padY: STATUS_PAD_Y,
        hasSide: false,
        mark,
        tree,
        children: Array.isArray(content) ? content : [content],
      })
    ) : (
      <Box
        key={key}
        flexDirection="row"
        alignItems="flex-start"
        overflow="hidden"
        backgroundColor={isSelected ? pal.selection : undefined}
      >
        <Box width={statusMarkAt + markWidth * depth} flexShrink={0} />
        <Box width={markWidth} flexShrink={0}>
          {mark}
        </Box>
        <Box flexDirection="column" flexShrink={1} flexGrow={1}>
          {content}
        </Box>
        {tree}
        {isSelected ? (
          <Box position="absolute" top={0} bottom={0} left={0} width={1}>
            {pal.selection ? null : <Text color={pal.key}>{SELECTION_BAR}</Text>}
          </Box>
        ) : null}
      </Box>
    )
  /** A Status row's buttons from its plan. Only the selected row's key presses it, so only that row names its key. */
  const statusKeys = (r: StatusRow): KeyAction[] =>
    statusKeyPlan(r).map(k => ({
      key: `${k.press.action}-${r.id}`,
      label: k.label,
      kind: k.kind,
      ...(r.id === statusKeyRow?.id ? { hotkey: k.hotkey } : {}),
      onPress: () => showAsk(k.press.askId),
    }))
  const statusMark = (r: Pick<StatusRow & { kind: 'subject' }, 'id' | 'mark' | 'tone' | 'isRunning'>) =>
    markGlyph({ text: r.mark, isRunning: r.isRunning }, r.id, r.tone ? pal.mark[r.tone] : pal.muted)
  const statusRow = (r: StatusRow) => {
    if (r.kind === 'subject') {
      const keys = statusKeys(r)
      const mark = statusMark(r)
      const content = [
        statusNameLine(`status-${r.id}-name`, { text: r.name }, r.stall, 0),
        ...(r.text ? [statusPageText(`status-${r.id}-text`, [{ text: r.text, isMuted: true }], 0)] : []),
        ...(r.merged
          ? [
              statusPageText(
                `status-${r.id}-merged`,
                [{ text: mergedLine(r.merged, fitsStatusLine(0)), isMuted: true }],
                0,
              ),
            ]
          : []),
        ...(r.was ? [statusPageText(`status-${r.id}-was`, [{ text: `${WAS_PREFIX}${r.was}`, isMuted: true }], 0)] : []),
        ...(keys.length > 0 ? [<Box key={`status-${r.id}-keys`}>{keyRow(r.id, keys)}</Box>] : []),
      ]

      return statusRowLine({
        key: `status-${r.id}`,
        mark,
        content,
        tree: r.hasChildren ? statusTree(`status-${r.id}-tree`, 'down') : null,
        isSelected: look === 'terminal' && r.id === statusKeyRow?.id,
      })
    }
    if (r.kind === 'child') {
      const mark = statusMark(r)
      const depth = r.branch === null ? 0 : 1

      return statusRowLine({
        key: `status-${r.id}`,
        depth,
        mark,
        content: statusNameLine(`status-${r.id}-name`, { text: r.name, isMuted: true }, r.stall, depth),
        tree: r.branch ? statusTree(`status-${r.id}-tree`, r.branch) : null,
      })
    }
    if (r.kind === 'more')
      return statusRowLine({
        key: `status-${r.id}`,
        depth: 1,
        mark: null,
        content: <Text color={pal.muted}>{r.text}</Text>,
        tree: statusTree(`status-${r.id}-tree`, r.branch),
      })
    if (r.kind === 'look') return statusLookLine(r.text, r.isLast)

    return statusRowLine({
      key: `status-${r.id}`,
      mark: <Text color={r.tone ? pal.mark[r.tone] : pal.muted}>{r.mark}</Text>,
      content: <Text color={pal.muted}>{r.text}</Text>,
    })
  }
  const statusView = () => {
    const page = view.statusPage
    if (page.isEmpty)
      return (
        <Box flexDirection="column" flexGrow={1}>
          {emptyState(page.empty)}
        </Box>
      )

    return sections([
      ...(page.head ? [statusHead(page.head)] : []),
      ...(page.rows.length > 0
        ? [
            section(
              page.rows.flatMap(r => {
                const isRuleDrawn = r.isRuledAbove && !isInline

                return isRuleDrawn ? [statusRule(r.id), statusRow(r)] : [statusRow(r)]
              }),
            ),
          ]
        : []),
    ])
  }

  return { statusRowLine, statusKeys, statusView }
}

export type PaneStatus = ReturnType<typeof paneStatus>
