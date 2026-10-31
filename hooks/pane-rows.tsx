import { desktopTextPt } from './desktop-metrics'
import { isStatusUnderActions } from './feedback'
import { paneState } from './mod-state'
import type { PaneBase, PaneClient, PaneHandlers, Row } from './pane-context'
import { fieldKey, openFields } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import { settledScrollKey } from './pane-selection'
import {
  DESKTOP_CELL_PT,
  DESKTOP_LINE_PT,
  DESKTOP_MARK_CELLS,
  DESKTOP_REPLY_ROWS,
  FRAME_INSET_PT,
  REPLY_ROWS,
  SELECTED_GAP_PT,
  TERMINAL_SIDE_CELLS,
  TREE_LINE_AT,
} from './pane-sizes'
import { DOT, ROW_COPY, shownOptionDescriptions } from './rows'
import { lineCount, SELECTION_BAR, type TreePos } from './terminal-text'
import { clipLabel } from './text'

export function paneRows(
  {
    hasClient,
    elements,
    indexOf,
    at,
    Box,
    space,
    Text,
    pal,
    Input,
    typing,
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
    tab,
    settledLayout,
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
      | 'Box'
      | 'space'
      | 'Text'
      | 'pal'
      | 'Input'
      | 'typing'
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
      | 'tab'
      | 'settledLayout'
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
    > &
    Pick<PaneRowKeys, 'rowActions' | 'desktopRowTextPt' | 'keyLines' | 'keyRow' | 'fieldActions' | 'actionRows'> &
    Pick<PaneRowFrame, 'desktopFrame'>,
  { updateDrafts, sendTyped, select }: Pick<PaneHandlers, 'updateDrafts' | 'sendTyped' | 'select'>,
) {
  const listRow = (row: Row, tree: TreePos) => {
    const columns = columnsFor(row)
    const index = indexOf.get(row.id) ?? -1
    const isSelected = index === at
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
              props={rowClientProps(row)}
            />
          </Box>
        </Box>
      )
    }
    const { keys, more } = isSelected ? rowActions(row) : { keys: [], more: [] }
    const isTyping = Input !== null && !!row.typeHint && typing === row.id
    const field =
      Input && isTyping ? (
        <Input
          key={fieldKey(row.id)}
          placeholder={row.typeHint}
          {...(openFields.get(row.id)?.seed ? { value: openFields.get(row.id)?.seed } : {})}
          submitLabel={look === 'desktop' ? ROW_COPY.send : 'send'}
          autoFocus
          {...(look === 'terminal' ? { rows: REPLY_ROWS } : look === 'desktop' ? { rows: DESKTOP_REPLY_ROWS } : {})}
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

    const textWidth = listColumns - 1 - columns.textAt
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
    const described = row.view ? shownOptionDescriptions(row.view, optionsShown.includes(row.id)) : []
    const descriptionsBlock =
      described.length > 0 ? (
        <Box flexDirection="column" marginTop={blankLine}>
          {described.map(o => {
            const line = clipLabel(`${o.label}: ${o.description}`, look === 'desktop' ? titleWidth : textWidth)
            return (
              <Text wrap="truncate-end">
                <Text>{line.slice(0, o.label.length)}</Text>
                <Text color={pal.muted}>{line.slice(o.label.length)}</Text>
              </Text>
            )
          })}
        </Box>
      ) : null
    const keysBlock = (
      <Box flexDirection="column" marginTop={blankLine}>
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
            [field, keyRow(row.id, fieldActions(row))]
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
    if (look === 'desktop' && isSelected)
      return desktopFrame({
        key: `row-${row.id}`,
        markCells: DESKTOP_MARK_CELLS,
        mark: row.view
          ? gutterMark(row)
          : (toned(row) ??
            (row.handleTone ? <Text color={pal.mark[row.handleTone]}>{row.handle}</Text> : <Text>{row.handle}</Text>)),
        side: <Text color={pal.age}>{sideAge(row)}</Text>,
        fill: pal.selection,
        gapY: (2 * SELECTED_GAP_PT) / DESKTOP_LINE_PT,
        children: [
          <Box key={`view-${row.id}`} position="absolute" top={0} bottom={0} left={0} width={1} />,
          <Text wrap="wrap">
            <Text bold>{row.title}</Text>
            {f?.isAfterTitle && !isStatusUnder ? (
              <Text color={pal.muted}>{unbroken(`${DOT}${f.text}`, row.title, fitsTitleLine)}</Text>
            ) : null}
          </Text>,
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
      })

    return (
      <Box
        key={`row-${row.id}`}
        flexDirection="row"
        alignItems="flex-start"
        overflow="hidden"
        backgroundColor={isSelected ? pal.selection : undefined}
      >
        <Box width={columns.lead} flexShrink={0} />
        {row.view && look === 'terminal' ? null : (
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
            ) : (
              <Button
                plain
                key={`select-${row.id}`}
                label={row.handle || ' '}
                onPress={() => void select(tab, row.id, index)}
              />
            )}
          </Box>
        )}
        {isSelected ? (
          <Box flexDirection="column" flexShrink={1} flexGrow={1} paddingRight={1} paddingY={space.rowPad}>
            {withSideAge(
              row,
              <Text wrap="wrap">
                <Text bold>{row.title}</Text>
                {titleAfter ? (
                  <Text color={pal.muted}>{withDoneMark(shownAfter, isStatusUnder ? null : f?.doneMark)}</Text>
                ) : null}
              </Text>,
            )}
            {row.subtitle}
            {body ? <Box marginTop={blankLine}>{body}</Box> : null}
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
            {unselectedLine(row, () => void select(tab, row.id, index), columns.textAt)}
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
        {isSelected && look === 'terminal' ? (
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
        {isSelected ? (
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
