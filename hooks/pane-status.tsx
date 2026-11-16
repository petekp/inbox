import type { UiPressArgument } from 'claude-code'
import { foldKey } from './fold-keys'
import type { PaneAskTabs } from './pane-asks'
import type { PaneBase, PaneClient, PaneHandlers } from './pane-context'
import type { KeyAction } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import type { PaneRowParts } from './pane-row-parts'
import { DESKTOP_HAIR_LINES, DESKTOP_MARK_CELLS, desktopPads, DESKTOP_SECTION_SPACE, STATUS_PAD_Y } from './pane-sizes'
import { emptyTab } from './empty-tab'
import { paneStatusGoal } from './pane-status-goal'
import { paneStatusParent } from './pane-status-parent'
import { paneStatusPart } from './pane-status-part'
import { paneStatusPath } from './pane-status-path'
import {
  desktopButtonLines,
  desktopCountsLines,
  desktopFrameLines,
  desktopSpaceLines,
  desktopTextLines,
  exactly,
  inkLines,
  plus,
  spacedItems,
  stacked,
  stackedIn,
} from './pane-status-tops'
import type { Drawn, RowTop } from './pane-status-tops'
import type { PaneStatusLines } from './pane-status-lines'
import { GOAL_KEYS_ID, statusKeyPlan, type StatusKeyTarget } from './status-keys'
import { mergedLine, seenSubjectIds, STALL_GAP, type StatusCount, type StatusRow, WAS_PREFIX } from './status-page'
import { isParentCollapsed, unfoldedRows } from './status-folds'
import { statusRowPads } from './status-gaps'
import { SELECTION_BAR } from './terminal-text'
import { cellWidth } from './text'

export function paneStatus(
  {
    hasClient,
    elements,
    terminalText,
    Button,
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
    nameLineSpans,
    statusPageText,
    statusTextWidth,
    desktopBlockWidth,
    fitsStatusLine,
    statusTree,
    markWidth,
    keyLines,
    terminalKeyCells,
    markGlyph,
    desktopFrame,
    keyRow,
    emptyState,
    sections,
    section,
    terminalSectionGap,
    foldRow,
    foldButton,
    desktopFoldLines,
    statusUnfolded,
  }: PaneClient &
    Pick<
      PaneBase,
      | 'terminalText'
      | 'Button'
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
      | 'nameLineSpans'
      | 'statusPageText'
      | 'statusTextWidth'
      | 'desktopBlockWidth'
      | 'fitsStatusLine'
      | 'statusTree'
    > &
    Pick<PaneRowLines, 'markWidth' | 'markGlyph'> &
    Pick<PaneRowFrame, 'desktopFrame'> &
    Pick<PaneRowKeys, 'keyRow' | 'keyLines' | 'terminalKeyCells'> &
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
    | 'toggleParent'
  >,
) {
  const { showAsk, runPress, startTyping, selectStatusRow, updateStatusUnfolded, toggleParent } = handlers
  const isUnfolded = (id: string) => statusUnfolded.includes(id)
  const isCollapsed = (id: string) => view.collapsed.includes(id)
  const { parentName } = paneStatusParent(
    {
      // Rebuilt in each branch so TypeScript keeps `hasClient` paired with `elements`.
      ...(hasClient ? { hasClient, elements } : { hasClient, elements }),
      look,
      Box,
      Text,
      Button,
      pal,
      terminalText,
      statusNameLine,
      nameLineSpans,
      statusTextWidth,
      statusKeyRow,
    },
    handlers,
  )
  const toggleFold = (id: string) =>
    void updateStatusUnfolded(u => (u.includes(id) ? u.filter(k => k !== id) : [...u, id]))
  const { statusPartLine } = paneStatusPart({
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
  })
  /** One line of the Status tab's list: a mark and its text, `depth` steps in. Each step sits under the text of the row it hangs from. */
  const statusRowLine = ({
    key,
    depth = 0,
    mark,
    content,
    tree = null,
    isSelected = false,
    padY = STATUS_PAD_Y,
    padBelow = padY,
  }: {
    key: string
    depth?: number
    mark: JSX.Element | null
    content: Drawn | Drawn[]
    tree?: JSX.Element | null
    /** The row whose keys work, which the terminal marks with the selection bar, as on a row tab. */
    isSelected?: boolean
    padY?: number
    padBelow?: number
  }): Drawn => {
    const parts = Array.isArray(content) ? content : [content]
    const children = parts.map(p => p.el)
    const el =
      look === 'desktop' ? (
        desktopFrame({
          key,
          indent: DESKTOP_MARK_CELLS * (depth * 2),
          isMarkHung: false,
          padY,
          padBelow,
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
          <Box width={markWidth} flexShrink={0}>
            {mark}
          </Box>
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

    return {
      el,
      lines: look === 'desktop' ? plus(textLines, desktopFrameLines(padY, padBelow)) : textLines,
      ...(look !== 'desktop' && isSelected ? { isSelected } : {}),
    }
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
   * Removes the goal and selects its Undo, or brings it back, or sets the suggested goal and selects Edit, then scrolls to the button and focuses it. The pressed button is gone, and the terminal would move its focus to the next button
   * drawn.
   */
  const pressGoal = async (
    action: 'remove-goal' | 'restore-goal' | 'take-goal',
    surface: UiPressArgument['surface'],
  ) => {
    await runPress({ action, id: GOAL_KEYS_ID }, surface)
    const next = action === 'remove-goal' ? 'restore-goal' : 'type-goal'
    await selectStatusRow(GOAL_KEYS_ID, `${next}-${GOAL_KEYS_ID}`)
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
              : press.action === 'toggle-collapse'
                ? void toggleParent(press.id)
                : pressGoal(press.action, p.surface),
    }))
  const { goalSection, setGoalBare, markRun, isTypingGoal } = paneStatusGoal(
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
      statusTextWidth,
      desktopBlockWidth,
      markGlyph,
      markWidth,
      keyRow,
      terminalKeyCells,
      desktopFrame,
    },
    handlers,
    {
      statusRowLine,
      drawRows: (rows, pads) => drawStatusRows(rows, pads),
      keysRow,
      statusKeys,
      statusPartLine,
      isUnfolded,
      isCollapsed,
      parentName,
      path: paneStatusPath(
        { look, Box, Text, pal, statusMarkAt, statusFrameEdge, statusTextWidth, foldRow, foldButton, desktopFoldLines },
        { isUnfolded, toggleFold },
      ),
    },
  )
  const statusMark = (r: Pick<StatusRow & { kind: 'subject' }, 'id' | 'mark' | 'tone' | 'isRunning'>) =>
    markGlyph({ text: r.mark, isRunning: r.isRunning }, r.id, r.tone ? pal.mark[r.tone] : pal.muted)
  // On desktop a row's first line starts under its frame's border and padding.
  const firstLine = (padY: number) => (look === 'desktop' ? desktopSpaceLines(padY) + DESKTOP_HAIR_LINES : 0)
  const seenTops = (r: StatusRow, padY = STATUS_PAD_Y) =>
    seenSubjectIds(r).map(id => [id, exactly(firstLine(padY))] as [string, RowTop])
  const statusRow = (r: StatusRow, n: number, pad: { padY: number; padBelow: number }, rowAbovePad: number) => {
    if (r.kind === 'subject') {
      const mark = statusMark(r)
      const isFolded = isParentCollapsed(r, isCollapsed)
      const content = [
        r.foldCount > 0
          ? parentName(r.id, { text: r.name }, r.stall, r.depth, { isCollapsed: isFolded, count: r.foldCount })
          : statusNameLine(`status-${r.id}-name`, { text: r.name }, r.stall, r.depth),
        ...(r.waitsOn
          ? [statusPageText(`status-${r.id}-waits-on`, [{ text: r.waitsOn, isNeedsYou: true }], r.depth)]
          : []),
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
        tree:
          r.hasChildren && !isFolded
            ? statusTree(`status-${r.id}-tree`, 'down', r.depth, pad.padY, pad.padBelow)
            : null,
        isSelected: look === 'terminal' && r.id === statusKeyRow?.id,
        ...pad,
      })

      return { ...line, tops: seenTops(r, pad.padY) }
    }
    if (r.kind === 'child') {
      const mark = statusMark(r)

      return statusRowLine({
        key: `status-${r.id}`,
        depth: r.depth,
        mark,
        content: statusNameLine(`status-${r.id}-name`, { text: r.name, isMuted: true }, null, r.depth),
        tree: r.branch ? statusTree(`status-${r.id}-tree`, r.branch, r.depth - 1, pad.padY, pad.padBelow) : null,
        ...pad,
      })
    }
    if (r.kind === 'more')
      return statusRowLine({
        key: `status-${r.id}`,
        depth: r.depth,
        mark: null,
        content: plainText(<Text color={pal.muted}>{r.text}</Text>, r.text, r.depth),
        tree: statusTree(`status-${r.id}-tree`, r.branch, r.depth - 1, pad.padY, pad.padBelow),
        ...pad,
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
            content: plainText(foldButton(key, r.text, isUnfolded(r.id), toggle), r.text, r.depth),
            isSelected: r.id === statusKeyRow?.id,
            ...pad,
          })
    }
    if (r.kind === 'part')
      return statusPartLine(r.id, r.text, n === 0, r.isTitle ? { description: r.description } : undefined, rowAbovePad)
    if (r.kind === 'counts')
      return statusRowLine({
        key: `status-${r.id}`,
        depth: r.depth,
        mark: null,
        content: {
          el: markRun(`status-${r.id}-counts`, r.counts, STALL_GAP, true),
          lines:
            look === 'desktop'
              ? desktopCountsLines(r.counts, statusTextWidth(r.depth))
              : countsCells(r.counts) < statusTextWidth(r.depth)
                ? exactly(1)
                : null,
        },
        ...pad,
      })

    const fold = statusRowLine({
      key: `status-${r.id}`,
      depth: r.depth,
      mark: <Text color={r.tone ? pal.mark[r.tone] : pal.muted}>{r.mark}</Text>,
      content: plainText(<Text color={pal.muted}>{r.text}</Text>, r.text, r.depth),
      ...pad,
    })

    return { ...fold, tops: seenTops(r, pad.padY) }
  }
  /** A Status list's rows, each padded by half the gap `statusGaps` sets on each side, as desktop writes padding. */
  /** Status rows, each padded as `pads` says, by default half the gap beside it. */
  const drawStatusRows = (rows: StatusRow[], pads = statusRowPads(rows)): Drawn[] => {
    return pads.map((p, n) => statusRow(rows[n] as StatusRow, n, desktopPads(p), pads[n - 1]?.below ?? 0))
  }
  const statusRows = (rows: StatusRow[]): Drawn[] => {
    const shown = unfoldedRows(rows, isUnfolded, isCollapsed)
    const drawn = drawStatusRows(shown)
    if (look === 'desktop' || isInline) return drawn

    return spacedItems(shown, drawn, n => ({ el: <Box key={`gap-${n}`} height={1} />, lines: exactly(1) }))
  }
  /** The padding a desktop section starts with, above its first part, in cells as written. */
  const sectionPadCells = isInline ? 0 : 1
  const desktopSectionPad: Drawn[] =
    look === 'desktop' ? [{ el: <Box key="section-pad" />, lines: exactly(desktopSpaceLines(sectionPadCells)) }] : []
  /** The Status page, and each subject row's first line from the page's top. */
  const drawStatus = (): { el: JSX.Element; tops: Map<string, RowTop> } => {
    const page = view.statusPage
    const empty = emptyTab(view, { tab: 'overview', isGoalFieldOpen: isTypingGoal })
    if (empty) {
      const below = empty.under?.is === 'set-goal' ? setGoalBare(empty.under, page).map(p => p.el) : []

      return {
        el: (
          <Box flexDirection="column" flexGrow={1}>
            {emptyState(empty, below)}
          </Box>
        ),
        tops: new Map(),
      }
    }
    const rows = page.rows.length > 0 ? statusRows(page.rows) : []
    const shown = [goalSection(page), rows]
      .filter(lines => lines.length > 0)
      .map(lines => stackedIn(section(lines.map(p => p.el)), [...desktopSectionPad, ...lines]))
    // A hairline between two desktop sections sits a margin under the one above, and the section below it starts a
    // margin under it, less the section's own padding, which `desktopSectionPad` counts.
    const desktopSectionGap =
      DESKTOP_HAIR_LINES +
      desktopSpaceLines(DESKTOP_SECTION_SPACE) +
      desktopSpaceLines(DESKTOP_SECTION_SPACE - sectionPadCells)
    const sectionGap = look === 'desktop' ? desktopSectionGap : terminalSectionGap
    // The goal's section and the list after it draw no hairline between them: Other work's own rule sets that list
    // apart while the goal shows milestones, and nothing does while it shows none. With no goal, a heading's own rule
    // sets the list apart.
    const isUnruledAfterGoal = (page.goal !== null || page.rows[0]?.kind === 'part') && rows.length > 0

    return {
      el: sections(
        shown.map(p => p.el),
        DESKTOP_SECTION_SPACE,
        isUnruledAfterGoal ? [shown.length - 1] : [],
      ),
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
