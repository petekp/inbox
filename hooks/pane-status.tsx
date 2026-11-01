import type { UiPressArgument } from 'claude-code'
import { DESKTOP_CHARS_PER_CELL } from './desktop-metrics'
import { LOOK_GAP_PT } from './layout'
import type { PaneAskTabs } from './pane-asks'
import type { PaneBase, PaneHandlers } from './pane-context'
import type { KeyAction } from './pane-keys'
import { openFields } from './pane-keys'
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
import { paneStatusGoal } from './pane-status-goal'
import type { PaneStatusLines } from './pane-status-lines'
import { GOAL_KEYS_ID, statusKeyPlan, type StatusKeyTarget } from './status-keys'
import { LOOK_DASH, mergedLine, STALL_GAP, type StatusRow, WAS_PREFIX } from './status-page'
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
    Input,
    typing,
    now,
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
  }: Pick<
    PaneBase,
    'listColumns' | 'look' | 'Box' | 'Text' | 'pal' | 'statusKeyRow' | 'view' | 'isInline' | 'Input' | 'typing' | 'now'
  > &
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
  handlers: Pick<PaneHandlers, 'showAsk' | 'runPress' | 'updateDrafts' | 'updateTyping' | 'sendTyped'>,
) {
  const { showAsk, runPress, updateDrafts, updateTyping } = handlers
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
  /** The rule that starts Other work: its name, then a solid rule to the end of the list's columns. */
  const statusPartLine = (id: string, text: string) =>
    look === 'desktop' ? (
      <Box
        key={`status-${id}`}
        flexDirection="row"
        alignItems="center"
        marginLeft={desktopStatusRuleLeft}
        paddingY={statusFrameEdge}
      >
        <Box flexShrink={0} paddingRight={1}>
          <Text color={pal.muted}>{text}</Text>
        </Box>
        <Box flexGrow={1} height={DESKTOP_HAIR_LINES} backgroundColor={pal.divider} />
      </Box>
    ) : (
      <Box key={`status-${id}`} flexDirection="row">
        <Box width={statusRuleAt} flexShrink={0} />
        <Text color={pal.muted}>{`${text} `}</Text>
        <Text color={pal.divider}>{'─'.repeat(Math.max(4, statusRuleCells - cellWidth(text) - 1))}</Text>
      </Box>
    )
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
  /** Opens the goal's field with `text` in it, as a fresh draft. */
  const openGoalField = async (text: string) => {
    openFields.delete(GOAL_KEYS_ID)
    await updateDrafts(d => ({ ...d, [GOAL_KEYS_ID]: { text, since: now } }))
    await updateTyping(() => GOAL_KEYS_ID)
  }
  /** A target's buttons from its plan. Only the selected target's keys press it, so only that one names its keys. */
  const statusKeys = (t: StatusKeyTarget): KeyAction[] =>
    t.keys.map(({ press, label, kind, hotkey, emphasis }) => ({
      key: `${press.action}-${t.id}`,
      label,
      kind,
      emphasis,
      ...(t.id === statusKeyRow?.id && typing !== GOAL_KEYS_ID ? { hotkey } : {}),
      onPress: (p: UiPressArgument) =>
        press.action === 'show-ask'
          ? showAsk(press.askId)
          : press.action === 'type-goal'
            ? openGoalField(press.text)
            : runPress({ action: press.action, id: GOAL_KEYS_ID }, p.surface),
    }))
  const { goalAbove, setGoal, setGoalBare, nowLine, markRun } = paneStatusGoal(
    {
      look,
      Box,
      Text,
      pal,
      Input,
      typing,
      now,
      statusKeyRow,
      statusMarkAt,
      statusNameLine,
      statusPageText,
      markGlyph,
      keyRow,
      desktopFrame,
    },
    handlers,
    { statusRowLine, statusKeys },
  )
  const statusMark = (r: Pick<StatusRow & { kind: 'subject' }, 'id' | 'mark' | 'tone' | 'isRunning'>) =>
    markGlyph({ text: r.mark, isRunning: r.isRunning }, r.id, r.tone ? pal.mark[r.tone] : pal.muted)
  const statusRow = (r: StatusRow) => {
    if (r.kind === 'subject') {
      const keys = statusKeys({ id: r.id, keys: statusKeyPlan(r) })
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
    if (r.kind === 'part') return statusPartLine(r.id, r.text)
    if (r.kind === 'counts')
      return statusRowLine({
        key: `status-${r.id}`,
        mark: null,
        content: markRun(`status-${r.id}-counts`, r.counts, STALL_GAP, true),
      })

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
          {emptyState(page.empty, setGoalBare(page))}
        </Box>
      )
    const above = goalAbove(page)
    const head = page.nowLine ? nowLine(page.nowLine) : page.head ? statusHead(page.head) : null

    return sections([
      ...(above.length > 0 ? [section(above)] : []),
      ...(head || page.goal === null ? [section([...(head ? [head] : []), ...setGoal(page)])] : []),
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
