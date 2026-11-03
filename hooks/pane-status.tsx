import type { UiPressArgument } from 'claude-code'
import { DESKTOP_CHARS_PER_CELL } from './desktop-metrics'
import { foldKey } from './fold-keys'
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
import { paneStatusGoal } from './pane-status-goal'
import {
  desktopButtonLines,
  desktopFrameLines,
  desktopSpaceLines,
  desktopTextLines,
  exactly,
  inkLines,
  plus,
  stacked,
  stackedIn,
} from './pane-status-tops'
import type { Drawn, RowTop } from './pane-status-tops'
import type { PaneStatusLines } from './pane-status-lines'
import { GOAL_KEYS_ID, statusKeyPlan, type StatusKeyTarget } from './status-keys'
import { LOOK_DASH, mergedLine, STALL_GAP, type StatusCount, type StatusRow, WAS_PREFIX } from './status-page'
import { unfoldedRows } from './status-page-parts'
import { SELECTION_BAR } from './terminal-text'
import { cellWidth } from './text'

export function paneStatus(
  {
    e,
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
    drafts,
    now,
    statusMarkAt,
    statusFrameEdge,
    statusNameLine,
    statusPageText,
    statusTextWidth,
    desktopBlockWidth,
    fitsStatusLine,
    statusTree,
    statusHead,
    markWidth,
    keyLines,
    terminalKeyCells,
    desktopHairline,
    markGlyph,
    desktopFrame,
    keyRow,
    textKey,
    emptyState,
    sections,
    section,
    terminalSectionGap,
    foldRow,
    foldButton,
    desktopFoldLines,
    statusUnfolded,
  }: Pick<
    PaneBase,
    | 'e'
    | 'listColumns'
    | 'look'
    | 'Box'
    | 'Text'
    | 'pal'
    | 'statusKeyRow'
    | 'view'
    | 'isInline'
    | 'Input'
    | 'typing'
    | 'drafts'
    | 'now'
    | 'statusUnfolded'
  > &
    Pick<
      PaneStatusLines,
      | 'statusMarkAt'
      | 'statusFrameEdge'
      | 'statusNameLine'
      | 'statusPageText'
      | 'statusTextWidth'
      | 'desktopBlockWidth'
      | 'fitsStatusLine'
      | 'statusTree'
      | 'statusHead'
    > &
    Pick<PaneRowLines, 'markWidth' | 'desktopHairline' | 'markGlyph'> &
    Pick<PaneRowFrame, 'desktopFrame'> &
    Pick<PaneRowKeys, 'keyRow' | 'textKey' | 'keyLines' | 'terminalKeyCells'> &
    Pick<PaneAskTabs, 'emptyState'> &
    Pick<PaneRowParts, 'sections' | 'section' | 'terminalSectionGap' | 'foldRow' | 'foldButton' | 'desktopFoldLines'>,
  handlers: Pick<
    PaneHandlers,
    | 'showAsk'
    | 'runPress'
    | 'updateDrafts'
    | 'updateTyping'
    | 'sendTyped'
    | 'startTyping'
    | 'selectStatusRow'
    | 'updateStatusUnfolded'
  >,
) {
  const { showAsk, runPress, startTyping, selectStatusRow, updateStatusUnfolded } = handlers
  const isUnfolded = (id: string) => statusUnfolded.includes(id)
  const toggleFold = (id: string) =>
    void updateStatusUnfolded(u => (u.includes(id) ? u.filter(k => k !== id) : [...u, id]))
  // A Status rule starts at the text column, as the rules between sections and between Asks rows do. In the
  // terminal it stops at the end of the list's columns. On desktop it runs to the pane's edge.
  const statusRuleAt = statusMarkAt + markWidth
  const statusRuleCells = Math.max(0, listColumns - statusRuleAt)
  const desktopStatusRuleLeft = FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_MARK_CELLS
  /** The rule above a Status row that starts an item. */
  const statusRule = (id: string): Drawn =>
    look === 'desktop'
      ? {
          el: desktopHairline(`status-rule-${id}`, 'across', { marginLeft: desktopStatusRuleLeft }),
          lines: exactly(DESKTOP_HAIR_LINES),
        }
      : {
          el: (
            <Box key={`status-rule-${id}`} flexDirection="row">
              <Box width={statusRuleAt} flexShrink={0} />
              <Text color={pal.divider}>{'─'.repeat(statusRuleCells)}</Text>
            </Box>
          ),
          lines: exactly(1),
        }
  /** A part drawn on one terminal line, and in `desktopLines` on desktop. */
  const oneLine = (el: JSX.Element, desktopLines: number): Drawn => ({
    el,
    lines: exactly(look === 'terminal' ? 1 : desktopLines),
  })
  /** A line of text that never wraps, in a Box padded by a frame's edge above and below, as a frame's text sits. */
  const desktopEdgedLine = 1 + 2 * desktopSpaceLines(statusFrameEdge)
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
  /** The space above a labeled rule. The terminal draws whole lines, so its space is a blank line. */
  const gap = (key: string) =>
    oneLine(
      <Box key={key} height={look === 'desktop' ? LOOK_GAP_PT / DESKTOP_LINE_PT : 1} />,
      LOOK_GAP_PT / DESKTOP_LINE_PT,
    )
  /**
   * The look line: "Last seen" in the middle of a dashed rule that spans what the rule above a row spans, with space
   * above it, and below it unless it ends the list. At `depth` it starts that many steps in, as the rows beside it do.
   */
  const statusLookLine = (id: string, text: string, isLast: boolean, depth: number) => {
    const label = ` ${text} `
    const fill = Math.max(4, statusRuleCells - markWidth * depth - cellWidth(label))
    const before = Math.floor(fill / 2)
    const desktopLeft = desktopStatusRuleLeft + DESKTOP_MARK_CELLS * 2 * depth
    const ruleCells = (listColumns - desktopLeft - 2 - text.length / DESKTOP_CHARS_PER_CELL) / 2
    // On desktop it sits outside a frame, whose border would inset the rule's right end, so the padding stands in for
    // the frame's.
    const rule =
      look === 'desktop' ? (
        <Box flexDirection="row" alignItems="center" marginLeft={desktopLeft} paddingY={statusFrameEdge}>
          {desktopDashes('look-before', ruleCells)}
          <Box flexShrink={0} paddingX={1}>
            <Text color={pal.muted}>{text}</Text>
          </Box>
          {desktopDashes('look-after', ruleCells)}
        </Box>
      ) : (
        <Box flexDirection="row">
          <Box width={statusRuleAt + markWidth * depth} flexShrink={0} />
          <Text color={pal.divider}>{`${LOOK_DASH.repeat(before)}${label}${LOOK_DASH.repeat(fill - before)}`}</Text>
        </Box>
      )

    const parts = [gap('look-above'), oneLine(rule, desktopEdgedLine), ...(isLast ? [] : [gap('look-below')])]

    return stackedIn(
      <Box key={`status-${id}`} flexDirection="column">
        {parts.map(p => p.el)}
      </Box>,
      parts,
    )
  }
  /** Other work's line: the space above it, its name, then a solid rule to the end of the list's columns. */
  const statusPartLine = (id: string, text: string) => {
    const above = gap('part-above')
    const line = oneLine(
      look === 'desktop' ? (
        <Box flexDirection="row" alignItems="center" marginLeft={desktopStatusRuleLeft} paddingY={statusFrameEdge}>
          <Box flexShrink={0} paddingRight={1}>
            <Text color={pal.muted}>{text}</Text>
          </Box>
          <Box flexGrow={1} height={DESKTOP_HAIR_LINES} backgroundColor={pal.divider} />
        </Box>
      ) : (
        <Box flexDirection="row">
          <Box width={statusRuleAt} flexShrink={0} />
          <Text color={pal.muted}>{`${text} `}</Text>
          <Text color={pal.divider}>{'─'.repeat(Math.max(4, statusRuleCells - cellWidth(text) - 1))}</Text>
        </Box>
      ),
      desktopEdgedLine,
    )

    return stackedIn(
      <Box key={`status-${id}`} flexDirection="column">
        {above.el}
        {line.el}
      </Box>,
      [above, line],
    )
  }
  /** One line of the Status tab's list: a mark and its text, `depth` steps in. Each step sits under the text of the row it hangs from. */
  const statusRowLine = ({
    key,
    depth = 0,
    mark,
    content,
    tree = null,
    isSelected = false,
    isFold = false,
  }: {
    key: string
    depth?: number
    mark: JSX.Element | null
    content: Drawn | Drawn[]
    tree?: JSX.Element | null
    /** A fold's line in the terminal, whose control draws its chevron in the mark column and its count at the text column. */
    isFold?: boolean
    /** The row whose keys work, which the terminal marks with the selection bar, as on a row tab. */
    isSelected?: boolean
  }): Drawn => {
    const parts = Array.isArray(content) ? content : [content]
    const children = parts.map(p => p.el)
    const el =
      look === 'desktop' ? (
        desktopFrame({
          key,
          indent: DESKTOP_MARK_CELLS * (depth * 2),
          isMarkHung: false,
          padY: STATUS_PAD_Y,
          hasSide: false,
          mark,
          tree,
          children,
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
          {isFold ? null : (
            <Box width={markWidth} flexShrink={0}>
              {mark}
            </Box>
          )}
          <Box flexDirection="column" flexShrink={1} flexGrow={1}>
            {children}
          </Box>
          {tree}
          {isSelected ? (
            <Box position="absolute" top={0} bottom={0} left={0} width={1}>
              {pal.selection ? null : <Text color={pal.key}>{SELECTION_BAR}</Text>}
            </Box>
          ) : null}
        </Box>
      )

    const textLines = stacked(parts).lines

    return { el, lines: look === 'desktop' ? plus(textLines, desktopFrameLines(STATUS_PAD_Y)) : textLines }
  }
  /**
   * A key row in a column `width` wide, in cells on the terminal and points on desktop. The terminal knows its lines
   * when one cell more would not wrap it differently.
   */
  const keysRow = (t: StatusKeyTarget, width: number): Drawn[] => {
    const keys = statusKeys(t)
    if (keys.length === 0) return []
    const el = <Box key={`${t.id}-keys`}>{keyRow(t.id, keys)}</Box>
    if (look === 'desktop')
      return [
        {
          el,
          lines: desktopButtonLines(
            keys.map(k => k.label),
            width,
          ),
        },
      ]
    const lines = keyLines(keys, [], width)
    const isKnown = lines === keyLines(keys, [], width + 1)

    return [{ el, lines: isKnown ? exactly(lines) : null }]
  }
  /** The cells a `counts` row's marks and words take on one line. */
  const countsCells = (counts: StatusCount[]) =>
    counts.reduce((n, x, i) => n + (i > 0 ? cellWidth(STALL_GAP) : 0) + 2 + cellWidth(x.text), 0)
  /** Plain text that Claude Code or desktop wraps, `depth` steps in. */
  const plainText = (el: JSX.Element, text: string, depth: number): Drawn => ({
    el,
    lines: look === 'desktop' ? desktopTextLines(text, statusTextWidth(depth)) : inkLines(text, statusTextWidth(depth)),
  })
  /**
   * Answers the proposal, then selects the goal's button, scrolls to it and focuses it. The pressed button is gone, and
   * the terminal would move its focus to the next button drawn, a milestone's View.
   */
  const answerProposal = async (action: 'use-goal' | 'decline-goal', surface: UiPressArgument['surface']) => {
    await runPress({ action, id: GOAL_KEYS_ID }, surface)
    await selectStatusRow(GOAL_KEYS_ID, `type-goal-${GOAL_KEYS_ID}`)
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
            ? startTyping(GOAL_KEYS_ID, press.text)
            : press.action === 'toggle-fold'
              ? toggleFold(press.foldId)
              : answerProposal(press.action, p.surface),
    }))
  const { goalAbove, setGoal, setGoalBare, markRun } = paneStatusGoal(
    {
      e,
      look,
      Box,
      Text,
      pal,
      Input,
      typing,
      drafts,
      listColumns,
      now,
      statusKeyRow,
      statusMarkAt,
      statusNameLine,
      statusPageText,
      desktopBlockWidth,
      markGlyph,
      markWidth,
      keyRow,
      textKey,
      terminalKeyCells,
      desktopFrame,
    },
    handlers,
    { statusRowLine, statusKeys, statusRows: rows => statusRows(rows), keysRow },
  )
  const statusMark = (r: Pick<StatusRow & { kind: 'subject' }, 'id' | 'mark' | 'tone' | 'isRunning'>) =>
    markGlyph({ text: r.mark, isRunning: r.isRunning }, r.id, r.tone ? pal.mark[r.tone] : pal.muted)
  const statusRow = (r: StatusRow) => {
    if (r.kind === 'subject') {
      const mark = statusMark(r)
      const content = [
        statusNameLine(`status-${r.id}-name`, { text: r.name }, r.stall, r.depth),
        ...(r.text ? [statusPageText(`status-${r.id}-text`, [{ text: r.text, isMuted: true }], r.depth)] : []),
        ...(r.merged
          ? [
              statusPageText(
                `status-${r.id}-merged`,
                [{ text: mergedLine(r.merged, fitsStatusLine(r.depth)), isMuted: true }],
                r.depth,
              ),
            ]
          : []),
        ...(r.was
          ? [statusPageText(`status-${r.id}-was`, [{ text: `${WAS_PREFIX}${r.was}`, isMuted: true }], r.depth)]
          : []),
        ...keysRow({ id: r.id, keys: statusKeyPlan(r) }, statusTextWidth(r.depth)),
      ]
      const line = statusRowLine({
        key: `status-${r.id}`,
        depth: r.depth,
        mark,
        content,
        tree: r.hasChildren ? statusTree(`status-${r.id}-tree`, 'down', r.depth) : null,
        isSelected: look === 'terminal' && r.id === statusKeyRow?.id,
      })

      // On desktop the row's first line starts under its frame's border and padding.
      const firstLine = look === 'desktop' ? desktopSpaceLines(STATUS_PAD_Y) + DESKTOP_HAIR_LINES : 0

      return { ...line, tops: [[r.id, exactly(firstLine)] as [string, RowTop]] }
    }
    if (r.kind === 'child') {
      const mark = statusMark(r)

      return statusRowLine({
        key: `status-${r.id}`,
        depth: r.depth,
        mark,
        content: statusNameLine(`status-${r.id}-name`, { text: r.name, isMuted: true }, r.stall, r.depth),
        tree: r.branch ? statusTree(`status-${r.id}-tree`, r.branch, r.depth - 1) : null,
      })
    }
    if (r.kind === 'more')
      return statusRowLine({
        key: `status-${r.id}`,
        depth: r.depth,
        mark: null,
        content: plainText(<Text color={pal.muted}>{r.text}</Text>, r.text, r.depth),
        tree: statusTree(`status-${r.id}-tree`, r.branch, r.depth - 1),
      })
    if (r.kind === 'done-fold') {
      const key = foldKey({ statusId: r.id })
      const toggle = () => toggleFold(r.id)

      return look === 'desktop'
        ? {
            el: (
              <Box key={`status-${r.id}`} paddingLeft={DESKTOP_MARK_CELLS * 2 * r.depth}>
                {foldRow(key, r.text, isUnfolded(r.id), toggle)}
              </Box>
            ),
            lines: desktopFoldLines,
          }
        : statusRowLine({
            key: `status-${r.id}`,
            depth: r.depth,
            mark: null,
            content: plainText(
              foldButton(key, r.text, isUnfolded(r.id), toggle, ' '.repeat(Math.max(1, markWidth - 1))),
              r.text,
              r.depth,
            ),
            isSelected: r.id === statusKeyRow?.id,
            isFold: true,
          })
    }
    if (r.kind === 'look') return statusLookLine(r.id, r.text, r.isLast, r.depth)
    if (r.kind === 'part') return statusPartLine(r.id, r.text)
    if (r.kind === 'counts')
      return statusRowLine({
        key: `status-${r.id}`,
        depth: r.depth,
        mark: null,
        content: {
          el: markRun(`status-${r.id}-counts`, r.counts, STALL_GAP, true),
          lines: look === 'terminal' && countsCells(r.counts) < statusTextWidth(r.depth) ? exactly(1) : null,
        },
      })

    return statusRowLine({
      key: `status-${r.id}`,
      depth: r.depth,
      mark: <Text color={r.tone ? pal.mark[r.tone] : pal.muted}>{r.mark}</Text>,
      content: plainText(<Text color={pal.muted}>{r.text}</Text>, r.text, r.depth),
    })
  }
  /** Rows of the Status's list, each after its rule when it has one. The inline pane draws no rules. */
  const statusRows = (rows: StatusRow[]): Drawn[] =>
    unfoldedRows(rows, isUnfolded).flatMap(r =>
      r.isRuledAbove && !isInline ? [statusRule(r.id), statusRow(r)] : [statusRow(r)],
    )
  /** The padding a desktop section starts with, above its first part. */
  const desktopSectionPad: Drawn[] =
    look === 'desktop' ? [{ el: <Box key="section-pad" />, lines: exactly(desktopSpaceLines(isInline ? 0 : 1)) }] : []
  /** The Status page, and each subject row's first line from the page's top. */
  const drawStatus = (): { el: JSX.Element; tops: Map<string, RowTop> } => {
    const page = view.statusPage
    if (page.isEmpty)
      return {
        el: (
          <Box flexDirection="column" flexGrow={1}>
            {emptyState(
              page.empty,
              setGoalBare(page).map(p => p.el),
            )}
          </Box>
        ),
        tops: new Map(),
      }
    const { proposal, goal } = goalAbove(page)
    const head = page.goal === null && page.head ? statusHead(page.head) : null
    const headLines = [...(head ? [head] : []), ...setGoal(page)]
    const goalParts = page.proposal?.isBelowGoal ? [goal, proposal] : [proposal, goal]
    const parts = [...goalParts, headLines, ...(page.rows.length > 0 ? [statusRows(page.rows)] : [])]
    const shown = parts
      .filter(lines => lines.length > 0)
      .map(lines => stackedIn(section(lines.map(p => p.el)), [...desktopSectionPad, ...lines]))
    // A hairline between two desktop sections sits a margin under the one above.
    const sectionGap = look === 'desktop' ? DESKTOP_HAIR_LINES + desktopSpaceLines(1) : terminalSectionGap

    return {
      el: sections(shown.map(p => p.el)),
      tops: new Map(stacked(shown, sectionGap).tops),
    }
  }
  let drawn: ReturnType<typeof drawStatus> | null = null
  const drawnStatus = () => (drawn ??= drawStatus())
  const statusView = () => drawnStatus().el
  /** Each subject row's first line, from the top of `statusView`. */
  const statusTops = () => drawnStatus().tops

  return { statusRowLine, statusKeys, statusView, statusTops }
}

export type PaneStatus = ReturnType<typeof paneStatus>
