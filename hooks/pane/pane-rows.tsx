import { desktopButtonPt, desktopLines, desktopTextPt } from './desktop-metrics'
import { isStatusUnderActions, stoppedWarningOf } from '../../core/view/feedback'
import { paneState, sessionState } from '../mod/mod-state'
import { paneAskTree } from './pane-ask-tree'
import { paneDesktopCard } from './pane-desktop-card'
import { paneDesktopTree } from './pane-desktop-tree'
import { partSpace } from './pane-part-space'
import { newTitleTint } from './pane-title-tint'
import type { PaneBase, PaneClient, PaneHandlers, Row } from './pane-context'
import { fieldKey, openFields } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import { settledScrollKey } from './pane-selection'
import { rowClient, titleClient } from './pane-row-clients'
import { heldClients, isComingBack } from './held-clients'
import {
  DESKTOP_CELL_PT,
  DESKTOP_FIELD_PT,
  DESKTOP_LINE_PT,
  DESKTOP_MARK_CELLS,
  DESKTOP_REPLY_ROWS,
  DESKTOP_SIDE_CELLS,
  fieldRows,
  FRAME_INSET_PT,
  REPLY_ROWS,
  SELECTED_GAP_PT,
  TERMINAL_SIDE_CELLS,
  TREE_LINE_AT,
} from './pane-sizes'
import type { RowPart } from '../../core/view/row-parts'
import { DOT, ROW_COPY } from '../../core/view/rows'
import { lineCount, partedLines, SELECTION_BAR, statusAfterTitle, type TreePos } from './terminal-text'
import { cellWidth } from '../../core/domain/text'

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
    ui,
    isAgeInSide,
    listColumns,
    isInline,
    e,
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
    withDoneText,
    feedbackColor,
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
    keyedButton,
    answersFit,
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
      | 'ui'
      | 'isAgeInSide'
      | 'listColumns'
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
      | 'withDoneText'
      | 'feedbackColor'
      | 'sideAge'
      | 'withSideAge'
      | 'unselectedLine'
      | 'branch'
      | 'desktopHairline'
    > &
    Pick<
      PaneRowKeys,
      | 'rowActions'
      | 'desktopRowTextPt'
      | 'keyLines'
      | 'keyRow'
      | 'fieldActions'
      | 'actionRows'
      | 'keyedButton'
      | 'answersFit'
    > &
    Pick<PaneRowFrame, 'desktopFrame'>,
  { editDraft, sendTyped, pressTitle }: Pick<PaneHandlers, 'editDraft' | 'sendTyped' | 'pressTitle'>,
) {
  const newTitleColor = newTitleTint({ look, pal, now, ui, shownTab })
  const handleTint = (row: Row) => newTitleColor(row.id, row.handleTone ? pal.mark[row.handleTone] : pal.muted)
  const { askTree, rowEntries, hasTree, restColor, treeTextIndent } = paneAskTree(
    { look, Box, Text, pal, space },
    { branch },
    keyedButton,
    answersFit,
  )
  const { desktopTreeLine } = paneDesktopTree({ Box, desktopHairline, pal })
  const spaceBetween = partSpace(look, isInline)
  const desktopCard = paneDesktopCard({
    Box,
    Text,
    pal,
    space,
    partSpace: spaceBetween,
    restColor,
    desktopFrame,
    desktopTreeLine,
    gutterMark,
    sideAge,
    keyedButton,
  })
  /** Whether the row draws open: the cursor rests on it and it is not collapsed. */
  const isRowOpen = (id: string) => (indexOf.get(id) ?? -1) === at && !collapsed.has(id)
  const listRow = (row: Row, tree: TreePos) => {
    const columns = columnsFor(row)
    const index = indexOf.get(row.id) ?? -1
    const isCursor = index === at
    const isSelected = isRowOpen(row.id)
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
              {gutter ?? toned(row, handleTint(row)) ?? (
                <Text color={handleTint(row) ?? (row.handleTone ? pal.mark[row.handleTone] : undefined)}>
                  {row.handle}
                </Text>
              )}
            </Box>
          ) : null}
          <Box position="relative" width="100%">
            {rowClient(elements, `select-${row.id}`, rowClientProps(row, desktopRowTextPt, newTitleColor(row.id)))}
            {isComingBack(ui, row.id) ? heldClients(elements, desktopFrame, row.id) : null}
          </Box>
        </Box>
      )
    }
    const { options, keys, more, answerRow } = isSelected
      ? rowActions(row)
      : { options: [], keys: [], more: [], answerRow: null }
    const handleText =
      row.handle && !row.isHandleRunning ? (
        <Text color={handleTint(row) ?? pal.muted}>{row.handle}</Text>
      ) : (
        row.handle || ' '
      )
    const isTyping = Input !== null && !!row.typeHint && typing === row.id
    const textWidth = listColumns - 1 - columns.textAt
    const submitLabel = look === 'desktop' ? ROW_COPY.send : 'send'
    /** The terminal draws `⏎` and the submit label beside the field. */
    const terminalFieldColumns = textWidth - cellWidth(`⏎ ${submitLabel}`) - 1
    const isDesktopFieldLine = isTyping && look === 'desktop'
    /** The field's line runs under the row's side column, which holds only the age beside the title. */
    const desktopFieldLinePt = desktopRowTextPt + DESKTOP_SIDE_CELLS * DESKTOP_CELL_PT
    /** The desktop field's Box shrinks it below its own width when its line cannot also hold its Send button. */
    const desktopFieldPt = Math.min(DESKTOP_FIELD_PT, desktopFieldLinePt - desktopButtonPt(submitLabel, true))
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
          onInput={(value: string) => void editDraft(row.id, value)}
          onSubmit={(value: string, submit) => sendTyped(row.id, value, submit.surface)}
        />
      ) : null
    const f = feedbackLabel(row.id, row)
    const isStatusUnder = f !== null && isStatusUnderActions(f.feedback, isSelected)
    const titleAfter = (isStatusUnder ? null : pressedAge(row)) ?? (isAgeInSide ? undefined : row.titleAfter)
    const shown = f?.text ?? null
    const warning = isSelected ? stoppedWarningOf(sessionState.isSendHeld, [...options, ...keys, ...more], shown) : null
    const { treeEntries, isDesktopTree, descriptionEntries, statusWarning } = rowEntries(row.view, {
      options,
      answerRow,
      textWidth,
      isSelected,
      warning,
    })
    const fitsStatusLine = (text: string) =>
      look === 'desktop' ? desktopTextPt(text) <= desktopRowTextPt : cellWidth(text) <= textWidth
    const noteLines = row.fold?.note ? partedLines(row.fold.note.split(DOT), fitsStatusLine) : []
    const status = [
      ...noteLines.map(text => ({ text, color: pal.muted })),
      ...(f && !f.isAfterTitle && !isStatusUnder ? [{ text: f.text, color: feedbackColor(f.tone) }] : []),
      ...(isTyping && paneState.fieldWithoutKeys === row.id ? [{ text: ROW_COPY.clickField, color: pal.muted }] : []),
      ...(statusWarning ? [{ text: statusWarning, color: pal.tone.error }] : []),
    ]

    const titleWidth = textWidth - TERMINAL_SIDE_CELLS
    const fitsTitleLine = (text: string) =>
      look === 'desktop' ? desktopTextPt(text) <= desktopRowTextPt : text.length <= titleWidth
    const after = titleAfter ? statusAfterTitle(titleAfter, row.title, fitsTitleLine) : null
    // Claude Code's terminal starts a new line at a line feed inside wrapped text.
    const shownAfter = after ? `${after.isUnder ? '\n' : ''}${after.text}` : ''
    const titleLines = after?.isUnder
      ? lineCount(row.title, titleWidth) + after.text.split('\n').reduce((n, l) => n + lineCount(l, titleWidth), 0)
      : lineCount(`${row.title}${shownAfter}`, titleWidth)
    const bodyLines =
      isSelected && isInline && look === 'terminal' && row.clippedBody
        ? e.props.scroll.bodyRows -
          2 * space.rowPad -
          titleLines -
          status.length -
          keyLines(keys, more, textWidth) -
          (isStatusUnder ? lineCount(f.text, textWidth) : 0)
        : null
    const body =
      bodyLines !== null && row.clippedBody && row.body
        ? row.clippedBody(bodyLines, textWidth)
        : row.bodyAt
          ? row.bodyAt(look === 'desktop' ? fitsTitleLine : s => cellWidth(s) <= textWidth)
          : (row.body ?? null)
    const isTrunkBridged = look === 'terminal' && isSelected && row.view !== undefined && hasTree(row.view, options)
    const descriptionsBlock = row.view ? askTree(row.view.id, descriptionEntries, textWidth, spaceBetween) : null
    const bodyEnd: RowPart = body ? (row.bodyEnd ?? 'detail') : 'title'
    const treeEnd = (isDesktopTree ? treeEntries : descriptionEntries).at(-1)?.part ?? bodyEnd
    const actionsPart = isTyping ? 'field' : 'buttons'
    const bodyBlock = body ? <Box marginTop={spaceBetween('title', 'detail')}>{body}</Box> : null
    const trunked = (above: JSX.Element) =>
      isTrunkBridged ? (
        <Box
          flexDirection="column"
          position="relative"
          overflow="hidden"
          marginLeft={-treeTextIndent}
          paddingLeft={treeTextIndent}
        >
          {branch('pass', 0, 0, pal.selectionLine ?? pal.line, 1, `trunk-${row.id}`)}
          {above}
        </Box>
      ) : (
        above
      )
    const keysBlock = (
      <Box
        key="actions"
        flexDirection="column"
        marginTop={spaceBetween(status.length > 0 ? 'status' : treeEnd, actionsPart)}
      >
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
          <Box key="result" marginTop={spaceBetween(actionsPart, 'result')}>
            <Text color={f.tone === 'error' ? pal.tone.error : pal.muted} wrap="wrap">
              {withDoneText(f.text, f.doneText)}
            </Text>
          </Box>
        ) : null}
      </Box>
    )
    // The `view-` Box is what select() scrolls into view. Drawn on the selected row alone, so the key exists only
    // once that row has redrawn expanded.
    const desktopAfter =
      f?.isAfterTitle && !isStatusUnder ? statusAfterTitle(`${DOT}${f.text}`, row.title, fitsTitleLine) : null
    const desktopTitle = hasClient ? (
      titleClient(elements, `collapse-${row.id}`, {
        title: row.title,
        titleColor: newTitleColor(row.id) ?? null,
        after: desktopAfter?.text ?? '',
        isAfterUnder: desktopAfter?.isUnder ?? false,
        colors: {
          muted: pal.muted,
          hover: pal.raised,
          hoverText: pal.raisedText ?? null,
          pressed: pal.selection ?? pal.raised,
        },
      })
    ) : (
      <Box flexDirection="column">
        <Text wrap="wrap">
          <Text bold color={newTitleColor(row.id)}>
            {row.title}
          </Text>
          {desktopAfter && !desktopAfter.isUnder ? <Text color={pal.muted}>{desktopAfter.text}</Text> : null}
        </Text>
        {desktopAfter?.isUnder ? (
          <Text wrap="wrap" color={pal.muted}>
            {desktopAfter.text}
          </Text>
        ) : null}
      </Box>
    )
    const selectedGapY = (2 * SELECTED_GAP_PT) / DESKTOP_LINE_PT
    if (isDesktopTree)
      return desktopCard({
        row,
        entries: treeEntries,
        title: desktopTitle,
        body: body ? { node: body, end: bodyEnd } : null,
        status,
        keys: keysBlock,
        isKeysBelow: isDesktopFieldLine,
        gapY: selectedGapY,
      })
    if (look === 'desktop' && isSelected)
      return (
        <Box key={`row-${row.id}`} flexDirection="column">
          {desktopFrame({
            key: `frame-${row.id}`,
            markCells: DESKTOP_MARK_CELLS,
            mark: row.view
              ? gutterMark(row)
              : (toned(row, handleTint(row)) ??
                (row.handleTone ? (
                  <Text color={handleTint(row) ?? pal.mark[row.handleTone]}>{row.handle}</Text>
                ) : (
                  <Text>{row.handle}</Text>
                ))),
            side: <Text color={pal.selectionFaint ?? pal.faint}>{sideAge(row)}</Text>,
            fill: pal.selection,
            gapY: selectedGapY,
            children: [
              <Box key={`view-${row.id}`} position="absolute" top={0} bottom={0} left={0} width={1} />,
              desktopTitle,
              row.subtitle ?? null,
              bodyBlock,
              descriptionsBlock,
              status.length > 0 ? (
                <Box key="status" flexDirection="column" marginTop={spaceBetween(treeEnd, 'status')}>
                  {status.map(st => (
                    <Text color={st.color} wrap="wrap">
                      {st.text}
                    </Text>
                  ))}
                </Box>
              ) : null,
              isDesktopFieldLine ? null : keysBlock,
            ],
            below: isDesktopFieldLine ? keysBlock : null,
          })}
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
              <Text color={handleTint(row) ?? pal.mark[row.handleTone]}>{row.handle}</Text>
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
                      <Text bold color={newTitleColor(row.id)}>
                        {row.title}
                      </Text>
                      {titleAfter ? (
                        <Text color={pal.muted}>{withDoneText(shownAfter, isStatusUnder ? null : f?.doneText)}</Text>
                      ) : null}
                    </Text>
                  </Button>,
                )}
                {row.subtitle}
                {bodyBlock}
              </Box>,
            )}
            {descriptionsBlock}
            {status.length > 0 ? (
              <Box key="status" flexDirection="column" marginTop={spaceBetween(treeEnd, 'status')}>
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
            {unselectedLine(row, () => void pressTitle(row.id), columns.textAt, newTitleColor(row.id))}
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
            <Text color={isCursorMarked ? (pal.selectionFaint ?? pal.faint) : pal.faint}>{sideAge(row)}</Text>
          </Box>
        ) : null}
        {isSelected ? branch(tree, blankLine, TREE_LINE_AT, pal.selectionLine ?? pal.line) : branch(tree, 0)}
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

  return { listRow, isRowOpen }
}

export type PaneRows = ReturnType<typeof paneRows>
