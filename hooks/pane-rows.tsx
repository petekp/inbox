import { desktopButtonPt, desktopLines, desktopTextPt } from './desktop-metrics'
import { isStatusUnderActions } from './feedback'
import { paneState } from './mod-state'
import { type AskEntry, paneAskTree } from './pane-ask-tree'
import { paneDesktopTree } from './pane-desktop-tree'
import { paneNewBar } from './pane-new-bar'
import type { PaneBase, PaneClient, PaneHandlers, Row } from './pane-context'
import { fieldKey, openFields } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import { settledScrollKey } from './pane-selection'
import {
  DESKTOP_CELL_PT,
  DESKTOP_FIELD_PT,
  DESKTOP_LINE_PT,
  DESKTOP_MARK_CELLS,
  DESKTOP_REPLY_ROWS,
  fieldRows,
  DESKTOP_ARM_GAP,
  DESKTOP_TREE_AT,
  FRAME_INSET_PT,
  REPLY_ROWS,
  SELECTED_GAP_PT,
  TERMINAL_SIDE_CELLS,
  TREE_LINE_AT,
} from './pane-sizes'
import { DOT, ROW_COPY } from './rows'
import { lineCount, SELECTION_BAR, type TreePos } from './terminal-text'
import { cellWidth } from './text'

export function paneRows(
  {
    hasClient,
    elements,
    indexOf,
    at,
    collapsed,
    Box,
    space,
    Text,
    pal,
    Input,
    typing,
    drafts,
    look,
    now,
    isAgeInSide,
    listColumns,
    unbroken,
    isInline,
    e,
    optionsShown,
    blankLine,
    Button,
    settledLayout,
    shownTab,
    columnsFor,
    gutterMark,
    toned,
    rowClientProps,
    feedbackLabel,
    pressedAge,
    withDoneMark,
    sideAge,
    withSideAge,
    unselectedLine,
    branch,
    desktopHairline,
    rowActions,
    desktopRowTextPt,
    keyLines,
    keyRow,
    fieldActions,
    actionRows,
    desktopFrame,
  }: PaneClient &
    Pick<
      PaneBase,
      | 'indexOf'
      | 'at'
      | 'collapsed'
      | 'Box'
      | 'space'
      | 'Text'
      | 'pal'
      | 'Input'
      | 'typing'
      | 'drafts'
      | 'look'
      | 'now'
      | 'isAgeInSide'
      | 'listColumns'
      | 'unbroken'
      | 'isInline'
      | 'e'
      | 'optionsShown'
      | 'blankLine'
      | 'Button'
      | 'settledLayout'
      | 'shownTab'
    > &
    Pick<
      PaneRowLines,
      | 'columnsFor'
      | 'gutterMark'
      | 'toned'
      | 'rowClientProps'
      | 'feedbackLabel'
      | 'pressedAge'
      | 'withDoneMark'
      | 'sideAge'
      | 'withSideAge'
      | 'unselectedLine'
      | 'branch'
      | 'desktopHairline'
    > &
    Pick<PaneRowKeys, 'rowActions' | 'desktopRowTextPt' | 'keyLines' | 'keyRow' | 'fieldActions' | 'actionRows'> &
    Pick<PaneRowFrame, 'desktopFrame'>,
  { updateDrafts, sendTyped, pressTitle }: Pick<PaneHandlers, 'updateDrafts' | 'sendTyped' | 'pressTitle'>,
) {
  const { newBar } = paneNewBar({ look, elements, Box, Text, pal, now, shownTab, space })
  const { askTree, askEntries, hasTree, treeTextIndent } = paneAskTree(
    { look, Box, Text, pal, optionsShown, blankLine },
    { branch },
  )
  const { desktopTreeLine } = paneDesktopTree({ Box, desktopHairline, pal })
  const listRow = (row: Row, tree: TreePos) => {
    const columns = columnsFor(row)
    const index = indexOf.get(row.id) ?? -1
    const isCursor = index === at
    const isSelected = isCursor && !collapsed.has(row.id)
    /** The terminal marks the cursor on a collapsed row, which j and k reach. */
    const isCursorMarked = isCursor && look === 'terminal'
    // On desktop a Client takes a click on every cell of the row, where a Button takes one only on its label.
    if (!isSelected && hasClient) {
      const gutter = gutterMark(row)
      return (
        <Box key={`row-${row.id}`} flexDirection="row" overflow="hidden">
          {row.handle || gutter ? (
            <Box
              position="absolute"
              top={0}
              left={0}
              paddingLeft={(FRAME_INSET_PT - DESKTOP_CELL_PT) / DESKTOP_CELL_PT}
              paddingTop={space.rowPad}
            >
              {gutter ?? toned(row) ?? (
                <Text color={row.handleTone ? pal.mark[row.handleTone] : undefined}>{row.handle}</Text>
              )}
            </Box>
          ) : null}
          <Box position="relative" width="100%">
            <elements.Client
              key={`select-${row.id}`}
              module="./row-client.tsx"
              width="100%"
              props={rowClientProps(row, desktopRowTextPt)}
            />
          </Box>
          {newBar(row)}
        </Box>
      )
    }
    const { keys, more } = isSelected ? rowActions(row) : { keys: [], more: [] }
    const handleText =
      row.handle && !row.isHandleRunning ? <Text color={pal.muted}>{row.handle}</Text> : row.handle || ' '
    const isTyping = Input !== null && !!row.typeHint && typing === row.id
    const textWidth = listColumns - 1 - columns.textAt
    const submitLabel = look === 'desktop' ? ROW_COPY.send : 'send'
    /** The terminal draws `⏎` and the submit label beside the field. */
    const terminalFieldColumns = textWidth - cellWidth(`⏎ ${submitLabel}`) - 1
    /** The desktop field's Box shrinks it below its own width when the row cannot also hold its Send button. */
    const desktopFieldPt = Math.min(DESKTOP_FIELD_PT, desktopRowTextPt - desktopButtonPt(submitLabel, true))
    /**
     * A terminal field that passes one row takes all `REPLY_ROWS`. Claude Code's hint beside a field of several rows
     * changes with the pane's width, so the rows its text wraps to cannot be counted here.
     */
    const fieldRowCount = (text: string) => {
      if (look === 'desktop')
        return fieldRows(text, line => desktopLines(line, desktopFieldPt).length, DESKTOP_REPLY_ROWS)
      const fitsOneRow = fieldRows(text, line => lineCount(line, terminalFieldColumns), REPLY_ROWS) === 1
      return fitsOneRow ? 1 : REPLY_ROWS
    }
    const field =
      Input && isTyping ? (
        <Input
          key={fieldKey(row.id)}
          placeholder={row.typeHint}
          {...(openFields.get(row.id)?.seed ? { value: openFields.get(row.id)?.seed } : {})}
          submitLabel={submitLabel}
          autoFocus
          rows={fieldRowCount(drafts[row.id]?.text ?? openFields.get(row.id)?.seed ?? '')}
          onInput={(value: string) =>
            void updateDrafts(d => ({ ...d, [row.id]: { text: value, since: d[row.id]?.since ?? now } }))
          }
          onSubmit={(value: string, submit) => sendTyped(row.id, value, submit.surface)}
        />
      ) : null
    const f = feedbackLabel(row.id, row)
    const isStatusUnder = f !== null && isStatusUnderActions(f.feedback, isSelected)
    const titleAfter = (isStatusUnder ? null : pressedAge(row)) ?? (isAgeInSide ? undefined : row.titleAfter)
    const status = [
      ...(row.fold?.note ? [{ text: row.fold.note, color: pal.muted }] : []),
      ...(f && !f.isAfterTitle ? [{ text: f.text, color: f.isFailure ? pal.tone.error : pal.muted }] : []),
      ...(isTyping && paneState.fieldWithoutKeys === row.id ? [{ text: ROW_COPY.clickField, color: pal.muted }] : []),
    ]

    const titleWidth = textWidth - TERMINAL_SIDE_CELLS
    const fitsTitleLine = (text: string) =>
      look === 'desktop' ? desktopTextPt(text) <= desktopRowTextPt : text.length <= titleWidth
    const shownAfter = titleAfter ? unbroken(titleAfter, row.title, fitsTitleLine) : ''
    const bodyLines =
      isSelected && isInline && look === 'terminal' && row.clippedBody
        ? e.props.scroll.bodyRows -
          2 * space.rowPad -
          lineCount(`${row.title}${shownAfter}`, titleWidth) -
          status.length -
          keyLines(keys, more, textWidth) -
          (isStatusUnder ? lineCount(f.text, textWidth) : 0)
        : null
    const body =
      bodyLines !== null && row.clippedBody && row.body ? row.clippedBody(bodyLines, textWidth) : (row.body ?? null)
    const treeEntries = row.view && look === 'desktop' && isSelected ? askEntries(row.view) : []
    const isDesktopTree = treeEntries.some(en => en.pos === 'mid' || en.pos === 'last')
    const isTrunkBridged = look === 'terminal' && isSelected && row.view !== undefined && hasTree(row.view)
    const descriptionsBlock = row.view && !isDesktopTree ? askTree(row.view, isTrunkBridged) : null
    const trunked = (above: JSX.Element) =>
      isTrunkBridged ? (
        <Box
          flexDirection="column"
          position="relative"
          overflow="hidden"
          marginLeft={-treeTextIndent}
          paddingLeft={treeTextIndent}
          paddingBottom={blankLine}
        >
          {branch('pass', 0, 0, pal.selectionLine ?? pal.line, 1, `trunk-${row.id}`)}
          {above}
        </Box>
      ) : (
        above
      )
    const keysBlock = (
      <Box flexDirection="column" marginTop={isDesktopTree ? 0 : blankLine}>
        {isTyping ? (
          look === 'desktop' ? (
            <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={space.buttonGap} rowGap={1}>
              <Box flexShrink={1} minWidth={0} overflow="hidden">
                {field}
              </Box>
              {/* The desktop Input supplies its own Send button. */}
              {keyRow(
                row.id,
                fieldActions(row).filter(a => !a.key.startsWith('send-')),
              )}
            </Box>
          ) : (
            [
              // Claude Code wraps a focused field of several rows at the pane's width less its hint, whatever its
              // Box's width, and draws only one row of it in a narrower Box.
              <Box key={`field-${row.id}`} width={e.props.bodyColumns} flexShrink={0}>
                {field}
              </Box>,
              keyRow(row.id, fieldActions(row)),
            ]
          )
        ) : (
          actionRows(row.id, keys, more, textWidth)
        )}
        {isStatusUnder ? (
          <Text color={pal.muted} wrap="wrap">
            {withDoneMark(f.text, f.doneMark)}
          </Text>
        ) : null}
      </Box>
    )
    // The `view-` Box is what select() scrolls into view. Drawn on the selected row alone, so the key exists only
    // once that row has redrawn expanded.
    const desktopAfter = f?.isAfterTitle && !isStatusUnder ? unbroken(`${DOT}${f.text}`, row.title, fitsTitleLine) : ''
    const desktopTitle = hasClient ? (
      <elements.Client
        key={`collapse-${row.id}`}
        module="./title-client.tsx"
        width="100%"
        props={{
          title: row.title,
          after: desktopAfter,
          colors: {
            muted: pal.muted,
            hover: pal.raised,
            hoverText: pal.raisedText ?? null,
            pressed: pal.selection ?? pal.raised,
          },
        }}
      />
    ) : (
      <Text wrap="wrap">
        <Text bold>{row.title}</Text>
        {desktopAfter ? <Text color={pal.muted}>{desktopAfter}</Text> : null}
      </Text>
    )
    const selectedGapY = (2 * SELECTED_GAP_PT) / DESKTOP_LINE_PT
    if (isDesktopTree) {
      const contextEntry = treeEntries.find(en => en.key === 'context')
      const groups = treeEntries
        .filter(en => en.key !== 'context')
        .reduce<AskEntry[][]>(
          (all, en) => (en.pos === 'pass' ? [...all.slice(0, -1), [...all.at(-1)!, en]] : [...all, [en]]),
          [],
        )
      const hungMarkCenter = DESKTOP_TREE_AT - 1
      const textAt = DESKTOP_MARK_CELLS
      const line = (en: AskEntry) => (
        <Text key={en.key} wrap="wrap">
          {en.label ? <Text>{en.label}</Text> : null}
          <Text color={pal.muted}>{en.rest}</Text>
        </Text>
      )
      const treeBox = (key: string, shape: 'down' | 'mid' | 'last', edge: number) =>
        desktopTreeLine(key, shape, {
          at: hungMarkCenter,
          arm: textAt - DESKTOP_ARM_GAP - hungMarkCenter,
          edge,
        })

      return (
        <Box key={`row-${row.id}`} flexDirection="column" marginY={selectedGapY} position="relative">
          <Box key={`view-${row.id}`} position="absolute" top={0} bottom={0} left={0} width={1} />
          {desktopFrame({
            key: `row-${row.id}-title`,
            markCells: DESKTOP_MARK_CELLS,
            mark: gutterMark(row),
            side: <Text color={pal.age}>{sideAge(row)}</Text>,
            fill: pal.selection,
            tree: treeBox(`row-${row.id}-trunk`, 'down', space.rowPad),
            children: [
              desktopTitle,
              row.subtitle ?? null,
              row.body ? <Box marginTop={blankLine}>{row.body}</Box> : null,
              contextEntry ? <Box marginTop={blankLine}>{line(contextEntry)}</Box> : null,
            ],
          })}
          {groups.map(group =>
            desktopFrame({
              key: `row-${row.id}-${group[0]!.key}`,
              markCells: DESKTOP_MARK_CELLS,
              fill: pal.selection,
              padY: 0,
              tree: treeBox(`row-${row.id}-${group[0]!.key}-tree`, group[0]!.pos === 'last' ? 'last' : 'mid', 0),
              children: group.map(line),
            }),
          )}
          {desktopFrame({
            key: `row-${row.id}-keys`,
            markCells: DESKTOP_MARK_CELLS,
            fill: pal.selection,
            children: [
              status.length > 0 ? (
                <Box flexDirection="column" marginTop={blankLine}>
                  {status.map(st => (
                    <Text color={st.color} wrap="wrap">
                      {st.text}
                    </Text>
                  ))}
                </Box>
              ) : null,
              keysBlock,
            ],
          })}
          {newBar(row)}
        </Box>
      )
    }
    if (look === 'desktop' && isSelected)
      return (
        <Box key={`row-${row.id}`} flexDirection="column">
          {desktopFrame({
            key: `frame-${row.id}`,
            markCells: DESKTOP_MARK_CELLS,
            mark: row.view
              ? gutterMark(row)
              : (toned(row) ??
                (row.handleTone ? (
                  <Text color={pal.mark[row.handleTone]}>{row.handle}</Text>
                ) : (
                  <Text>{row.handle}</Text>
                ))),
            side: <Text color={pal.age}>{sideAge(row)}</Text>,
            fill: pal.selection,
            gapY: selectedGapY,
            children: [
              <Box key={`view-${row.id}`} position="absolute" top={0} bottom={0} left={0} width={1} />,
              desktopTitle,
              row.subtitle ?? null,
              row.body ? <Box marginTop={blankLine}>{row.body}</Box> : null,
              descriptionsBlock,
              status.length > 0 ? (
                <Box flexDirection="column" marginTop={blankLine}>
                  {status.map(st => (
                    <Text color={st.color} wrap="wrap">
                      {st.text}
                    </Text>
                  ))}
                </Box>
              ) : null,
              keysBlock,
            ],
          })}
          {newBar(row, { top: selectedGapY })}
        </Box>
      )

    return (
      <Box
        key={`row-${row.id}`}
        flexDirection="row"
        alignItems="flex-start"
        overflow="hidden"
        backgroundColor={isSelected || isCursorMarked ? pal.selection : undefined}
      >
        <Box width={columns.lead} flexShrink={0} />
        {row.view && look === 'terminal' && !row.handle ? null : (
          <Box
            width={columns.textAt - columns.lead}
            flexShrink={0}
            paddingLeft={columns.handleAt - columns.lead}
            paddingY={isSelected ? space.rowPad : 0}
          >
            {row.handleTone ? (
              <Text color={pal.mark[row.handleTone]}>{row.handle}</Text>
            ) : look === 'desktop' ? (
              (gutterMark(row) ?? <Text>{row.handle}</Text>)
            ) : isSelected ? (
              <Text>{handleText}</Text>
            ) : (
              <Button plain key={`select-${row.id}`} onPress={() => void pressTitle(row.id)}>
                {handleText}
              </Button>
            )}
          </Box>
        )}
        {isSelected ? (
          <Box flexDirection="column" flexShrink={1} flexGrow={1} paddingRight={1} paddingY={space.rowPad}>
            {trunked(
              <Box flexDirection="column">
                {withSideAge(
                  row,
                  <Button plain key={`collapse-${row.id}`} onPress={() => void pressTitle(row.id)}>
                    <Text wrap="wrap">
                      <Text bold>{row.title}</Text>
                      {titleAfter ? (
                        <Text color={pal.muted}>{withDoneMark(shownAfter, isStatusUnder ? null : f?.doneMark)}</Text>
                      ) : null}
                    </Text>
                  </Button>,
                )}
                {row.subtitle}
                {body ? <Box marginTop={blankLine}>{body}</Box> : null}
              </Box>,
            )}
            {descriptionsBlock}
            {status.length > 0 ? (
              <Box flexDirection="column" marginTop={blankLine}>
                {status.map(s => (
                  <Text color={s.color} wrap="wrap">
                    {s.text}
                  </Text>
                ))}
              </Box>
            ) : null}
            {keysBlock}
          </Box>
        ) : (
          <Box flexShrink={1} flexGrow={1} paddingRight={1}>
            {unselectedLine(row, () => void pressTitle(row.id), columns.textAt)}
          </Box>
        )}
        {isAgeInSide && !isSelected ? (
          <Box
            width={TERMINAL_SIDE_CELLS}
            flexShrink={0}
            justifyContent="flex-end"
            paddingRight={1}
            paddingTop={isSelected ? space.rowPad : 0}
          >
            <Text color={pal.age}>{sideAge(row)}</Text>
          </Box>
        ) : null}
        {isSelected ? branch(tree, blankLine, TREE_LINE_AT, pal.selectionLine ?? pal.line) : branch(tree, 0)}
        {isCursorMarked && !pal.selection
          ? null
          : newBar(row, { top: isSelected ? space.rowPad : 0, isSelected: isSelected || isCursorMarked })}
        {isCursorMarked ? (
          <Box
            key={settledScrollKey(`view-${row.id}`, settledLayout)}
            position="absolute"
            top={0}
            bottom={0}
            left={0}
            width={1}
          />
        ) : null}
        {/* What select() scrolls into view. Drawn on the selected row alone, so the key exists
          only once that row has redrawn expanded. */}
        {isSelected || isCursorMarked ? (
          <Box
            key={`view-${row.id}`}
            position="absolute"
            top={0}
            bottom={0}
            left={0}
            width={1}
            // Desktop draws a column of ▌ as broken dashes, so there the bar is the Box's own fill.
            {...(look === 'desktop' && !pal.selection ? { backgroundColor: pal.key } : {})}
          >
            {pal.selection || look === 'desktop' ? null : <Text color={pal.key}>{SELECTION_BAR}</Text>}
          </Box>
        ) : null}
      </Box>
    )
  }

  return { listRow }
}

export type PaneRows = ReturnType<typeof paneRows>
