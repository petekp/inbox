import type { UiPressArgument } from 'claude-code'
import type { FoldKind } from '../../types'
import { groupEmptyText } from '../../core/view/banners'
import { RESULT_MARK_CELLS, toneSvg, undoSvg } from './desktop-svg'
import { closedTitleTint } from './pane-title-tint'
import { foldGlyph } from '../../core/view/fold-chevron'
import type { CountsUnits } from '../../core/view/status-folds'
import type { FoldProps } from './fold-client'
import { foldClient } from './pane-row-clients'
import { heldClients } from './held-clients'
import { LIST_MARGIN_PT, ROW_PAD_PT } from '../../core/view/layout'
import type { Tone } from './palettes'
import type { Entry, PaneBase, PaneClient, PaneHandlers } from './pane-context'
import { followUpPresses } from './pane-keys'
import { UNDO_KEY } from '../../core/view/help'
import type { PaneRowFrame } from './pane-row-frame'
import { childPos, type PaneRowLines } from './pane-row-lines'
import { settledScrollKey } from './pane-selection'
import type { ClosedLineView } from '../../core/view/closed-line'
import {
  DESKTOP_CELL_PT,
  DESKTOP_HAIR_LINES,
  DESKTOP_LINE_PT,
  DESKTOP_ROW_PT,
  DESKTOP_MARK_CELLS,
  UNDO_CELLS,
  DESKTOP_LIST_MARGIN,
  DESKTOP_ROW_PAD,
  DESKTOP_SECTION_SPACE,
  desktopPad,
  FRAME_INSET_PT,
  ROW_COLUMNS,
  TERMINAL_SIDE_CELLS,
  TREE_LINE_AT,
  UNDO_HEIGHT_PT,
} from './pane-sizes'
import { exactly, type Lines } from './pane-status-tops'
import { pressRowId, type PrPress } from '../../core/view/pr-press'
import type { RowPress } from '../../core/domain/presses'
import { foldGapRows } from '../../core/view/row-parts'
import {
  DOT,
  ROW_COPY,
  earlierLabel,
  foldLabel,
  type ResultMark,
  rowTitle,
  type RowView,
  settledLabel,
  settledMark,
  type SettledState,
  settledTone,
  shortAgo,
} from '../../core/view/rows'
import {
  SETTLED_LINE_GAP,
  TERMINAL_UNDO_LABEL,
  desktopSettledLine,
  terminalSettledCells,
  terminalSettledLabel,
  terminalSettledTitle,
  type TreePos,
} from './terminal-text'
import { SETTLED_MS } from '../../core/view/timing'
import type { PressAreaProps } from './press-client'

export function paneRowParts(
  {
    hasClient,
    elements,
    look,
    listColumns,
    Text,
    pal,
    Box,
    blankLine,
    isInline,
    space,
    now,
    ui,
    Button,
    settledLayout,
    desktopFrame,
    treeRow,
    ToneSvg,
    desktopHairline,
    markGlyph,
    markWidth,
  }: PaneClient &
    Pick<
      PaneBase,
      | 'look'
      | 'listColumns'
      | 'Text'
      | 'pal'
      | 'Box'
      | 'blankLine'
      | 'isInline'
      | 'space'
      | 'now'
      | 'ui'
      | 'Button'
      | 'settledLayout'
    > &
    Pick<PaneRowFrame, 'desktopFrame'> &
    Pick<PaneRowLines, 'treeRow' | 'ToneSvg' | 'desktopHairline' | 'markGlyph' | 'markWidth'>,
  { setFold, showEarlier, runPress }: Pick<PaneHandlers, 'setFold' | 'showEarlier' | 'runPress'>,
) {
  const groupEmpty = (title: string) =>
    look === 'desktop'
      ? desktopFrame({
          key: `empty-${title}`,
          children: <Text color={pal.muted}>{groupEmptyText(title)}</Text>,
        })
      : treeRow('last', null, <Text color={pal.muted}>{`  ${groupEmptyText(title)}`}</Text>, `empty-${title}`)
  /**
   * A Finds group's title leads with its kind's mark, since its rows draw none. `aside` is muted text at the title's right end. A title with no mark starts at the edge on desktop,
   * except under a PR, whose title starts at the text column.
   */
  const groupTitle = (
    title: string,
    count: number,
    mark?: { mark: string; tone: Tone },
    isUnderPr = false,
    aside?: string,
  ) => {
    const titled = (
      <Text>
        <Text bold>{title}</Text>
        {count > 0 ? <Text color={pal.muted}>{`${DOT}${count}`}</Text> : null}
      </Text>
    )
    const words = aside ? (
      <Box flexDirection="row" flexGrow={1}>
        {titled}
        <Box flexGrow={1} />
        <Text color={pal.muted}>{aside}</Text>
      </Box>
    ) : (
      titled
    )
    const markSvg = mark && ToneSvg ? toneSvg(mark.tone, mark.mark) : null
    const lead = mark ? (
      <Box width={RESULT_MARK_CELLS} flexShrink={0}>
        {ToneSvg && markSvg ? (
          <ToneSvg
            source={markSvg.source}
            alt={mark.mark}
            width={markSvg.cells * DESKTOP_CELL_PT}
            height={DESKTOP_LINE_PT}
          />
        ) : (
          <Text color={pal.mark[mark.tone]}>{mark.mark}</Text>
        )}
      </Box>
    ) : null
    const line = lead ? (
      <Box flexDirection="row">
        {lead}
        {words}
      </Box>
    ) : (
      words
    )

    return look === 'desktop' ? (
      desktopFrame({
        padY: 0,
        padBelow: desktopPad(LIST_MARGIN_PT),
        mark: lead,
        ...(lead || isUnderPr ? {} : { markCells: 0 }),
        children: words,
      })
    ) : (
      <Box paddingLeft={TREE_LINE_AT}>{line}</Box>
    )
  }
  /** The blank lines the terminal draws between sections. */
  const terminalSectionGap = isInline ? 1 : 2
  const section = (children: JSX.Element | JSX.Element[]) =>
    look === 'desktop' ? (
      <Box flexDirection="column" paddingTop={blankLine}>
        {children}
      </Box>
    ) : (
      <Box flexDirection="column">{children}</Box>
    )
  /**
   * Sections one under another. On desktop a hairline sits between each two, except above a section whose place in
   * `list` is in `unruled`, which keeps only the hairline's space.
   */
  const sections = (list: JSX.Element[], space = DESKTOP_SECTION_SPACE, unruled: number[] = []) => (
    <Box flexDirection="column" flexGrow={1} gap={look === 'desktop' ? 0 : terminalSectionGap}>
      {look === 'desktop'
        ? list.flatMap((el, n) => {
            if (n === 0) return [el]
            const box = {
              marginTop: space,
              marginBottom: space - blankLine,
              marginLeft: FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_MARK_CELLS,
            }

            return [
              unruled.includes(n) ? (
                <Box key={`rule-${n}`} height={DESKTOP_HAIR_LINES} {...box} />
              ) : (
                desktopHairline(`rule-${n}`, 'across', box)
              ),
              el,
            ]
          })
        : list}
    </Box>
  )
  const titleGap = (hasChildren = true) =>
    isInline || look === 'desktop'
      ? []
      : [
          <Box paddingLeft={TREE_LINE_AT}>
            <Text color={pal.line}>{hasChildren ? '│' : ' '}</Text>
          </Box>,
        ]
  /** A result mark and the space after it, before its label. A blank mark keeps its place, so the label stays put. */
  const resultLead = (mark: ResultMark, key: string, color: string) => (
    <Box key={`${key}-lead`} width={RESULT_MARK_CELLS} flexShrink={0}>
      {markGlyph(mark, key, color)}
    </Box>
  )
  const resultLine = (mark: ResultMark | null, key: string, markColor: string, label: JSX.Element) =>
    mark ? (
      <Box flexDirection="row" flexShrink={1}>
        {resultLead(mark, key, markColor)}
        {label}
      </Box>
    ) : (
      label
    )
  /** A Closed line's press: the Undo of a refused notification, or Reopen on a row the person dismissed. */
  const lineAction = (d: ClosedLineView) => {
    const { action } = d
    if (!action) return null
    if (d.isUndoOfRefusal) return undoButton(action.press, null)
    return (
      <Box key={`reopen-${d.id}`} flexDirection="row">
        <Button
          key={`reopen-${d.id}`}
          label={action.label}
          onPress={(press: UiPressArgument) => void runPress(action.press, press)}
        />
      </Box>
    )
  }
  const closedRow = (d: ClosedLineView, pos: TreePos) =>
    look === 'desktop'
      ? desktopFrame({
          key: `closed-${d.id}`,
          indent: DESKTOP_MARK_CELLS,
          isMarkHung: false,
          padY: space.rowPad / 2,
          mark: markGlyph(d.mark, `closed-${d.id}`, pal.age),
          side: <Text color={pal.faint}>{shortAgo(now - d.at)}</Text>,
          children: [
            <Text wrap="wrap" color={pal.muted}>
              {d.title}
            </Text>,
            <Text wrap="wrap" color={pal.age}>
              {d.outcome}
            </Text>,
            lineAction(d),
          ],
        })
      : treeRow(
          pos,
          null,
          <Box flexDirection="row">
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text wrap="wrap" color={pal.muted}>
                {d.title}
              </Text>
              {resultLine(
                d.mark,
                `closed-${d.id}`,
                pal.muted,
                <Text wrap="wrap" color={pal.age}>
                  {d.outcome}
                </Text>,
              )}
              {lineAction(d)}
            </Box>
            <Box width={TERMINAL_SIDE_CELLS} flexShrink={0} justifyContent="flex-end">
              <Text color={pal.faint}>{shortAgo(now - d.at)}</Text>
            </Box>
          </Box>,
          `closed-${d.id}`,
          1,
        )
  /** The terminal's fold control: `label`, a space and the chevron, one Button. */
  const foldButton = (key: string, label: string, isUnfolded: boolean, toggle: () => void, units?: CountsUnits) => (
    <Button plain dimColor key={`fold-${key}`} label={`${label}\u00a0${foldGlyph(isUnfolded)}`} onPress={toggle}>
      {units
        ? [
            ...units.flat().map((part, n) => (
              <Text key={`${n}`} {...(unitColor(part.tone) ? { color: unitColor(part.tone)! } : {})}>
                {part.text}
              </Text>
            )),
            `\u00a0${foldGlyph(isUnfolded)}`,
          ]
        : undefined}
    </Button>
  )
  /** A counts fold's mark draws in its tone; its other words, and a mark with no tone, in the fold's color. */
  const unitColor = (tone: CountsUnits[number][number]['tone']) =>
    tone === 'plain' || tone === null ? null : pal.mark[tone]
  // On desktop a Client takes a click on every cell of the line, where a Button takes one only on its label.
  /** A fold's line: `label`, then the chevron. Desktop posts its click under `fold-` and `key`. */
  const foldRow = (
    key: string,
    label: string,
    isUnfolded: boolean,
    toggle: () => void,
    padY = DESKTOP_ROW_PAD,
    units?: CountsUnits,
    textAt: number = ROW_COLUMNS.tree.textAt,
    status?: FoldProps['status'],
  ) =>
    hasClient ? (
      <Box key={`fold-row-${key}`} position="relative" width="100%">
        {foldClient(elements, `fold-${key}`, {
          markCells: DESKTOP_MARK_CELLS,
          label,
          ...(units
            ? { units: units.map(unit => unit.map(part => ({ text: part.text, color: unitColor(part.tone) }))) }
            : {}),
          isUnfolded,
          chevron: foldGlyph(isUnfolded),
          padY,
          ...(status ? { status } : {}),
          colors: {
            rest: isInline ? null : (pal.card ?? null),
            text: pal.age,
            hoverText: 'text',
          },
        })}
      </Box>
    ) : (
      treeRow(
        null,
        null,
        <Box flexDirection="row">{foldButton(key, label, isUnfolded, toggle, units)}</Box>,
        `fold-row-${key}`,
        0,
        textAt,
      )
    )
  /** The lines a desktop fold row takes: its chevron's height, in the pane's scroll rows. */
  const desktopFoldLinesOf = (lines: number): Lines | null =>
    hasClient && 'Svg' in elements ? exactly((2 * ROW_PAD_PT + lines * DESKTOP_LINE_PT) / DESKTOP_ROW_PT) : null
  const desktopFoldLines = desktopFoldLinesOf(1)
  /** The button that lists the rest of a Closed fold. */
  const earlierButton = (kind: FoldKind, label: string) => (
    <Button plain dimColor key={`earlier-${kind}`} label={label} onPress={() => void showEarlier(kind)} />
  )
  /**
   * A group's Closed fold, its label at `textAt`, where the group's rows start their text. `isAfterOpenRow` says the
   * row above it draws open, with its own blank row under its text.
   */
  const closedFold = (
    kind: FoldKind,
    closed: ClosedLineView[],
    total: number,
    isUnfolded: boolean,
    isAfterOpenRow: boolean,
    textAt: number = ROW_COLUMNS.tree.textAt,
  ) => {
    const earlier = earlierLabel(total, closed.length)
    return closed.length === 0
      ? []
      : [
          ...(space.isFoldGapped && foldGapRows(isAfterOpenRow, !isInline) > 0 ? titleGap(false) : []),
          foldRow(
            kind,
            foldLabel(total),
            isUnfolded,
            () => void setFold(kind, !isUnfolded),
            DESKTOP_LIST_MARGIN,
            undefined,
            textAt,
          ),
          ...(isUnfolded && look !== 'desktop' && !isInline
            ? [
                <Box key={`fold-gap-${kind}`} paddingLeft={TREE_LINE_AT + markWidth}>
                  <Text color={pal.line}>│</Text>
                </Box>,
              ]
            : []),
          ...(isUnfolded ? closed.map((d, n) => closedRow(d, childPos(n, closed.length + (earlier ? 1 : 0)))) : []),
          ...(isUnfolded && earlier
            ? [
                look === 'desktop'
                  ? desktopFrame({
                      key: `earlier-${kind}`,
                      indent: DESKTOP_MARK_CELLS,
                      isMarkHung: false,
                      padY: space.rowPad / 2,
                      children: earlierButton(kind, earlier),
                    })
                  : treeRow(
                      childPos(closed.length, closed.length + 1),
                      null,
                      earlierButton(kind, earlier),
                      `earlier-${kind}`,
                      1,
                    ),
              ]
            : []),
        ]
  }
  const svgClientElements = hasClient && 'Svg' in elements ? elements : null
  const undoButton = (undo: RowPress | PrPress, at: number | null) => {
    const key = `undo-${pressRowId(undo)}`
    const label = TERMINAL_UNDO_LABEL
    const onPress = (press: UiPressArgument) => runPress(undo, press)
    if (svgClientElements) {
      followUpPresses.set(key, onPress)
      const leftMs = at === null ? 0 : Math.max(0, SETTLED_MS - (now - at))
      return (
        <Box key={`${key}-${at}`} width={UNDO_CELLS} height={UNDO_HEIGHT_PT / DESKTOP_LINE_PT}>
          <svgClientElements.Svg
            source={undoSvg(leftMs / SETTLED_MS, leftMs)}
            alt={ROW_COPY.undo}
            width={UNDO_CELLS * DESKTOP_CELL_PT}
            height={UNDO_HEIGHT_PT}
          />
          <Box position="absolute" top={0} left={0}>
            <svgClientElements.Client
              key={key}
              module="./press-client.tsx"
              width={UNDO_CELLS}
              height={UNDO_HEIGHT_PT / DESKTOP_LINE_PT}
              props={{ pressKey: key, hover: 'rgba(128, 128, 128, 0.12)' } satisfies PressAreaProps}
            />
          </Box>
        </Box>
      )
    }
    if (look !== 'terminal' || at === null) return <Button key={key} label="↺ Undo" onPress={onPress} />
    const cells = [...label]
    const keyAt = cells.indexOf(UNDO_KEY)
    const filled = Math.ceil((Math.max(0, SETTLED_MS - (now - at)) / SETTLED_MS) * cells.length)

    return (
      <Button key={key} onPress={onPress}>
        {cells.map((cell, n) => (
          <Text
            key={`${key}-${n}`}
            {...(n < filled ? { backgroundColor: pal.divider } : {})}
            {...(n === keyAt ? { color: pal.key } : {})}
          >
            {cell}
          </Text>
        ))}
      </Button>
    )
  }
  // A desktop title wraps beside Undo, so Undo's place keeps its size after Undo ends and the title keeps its wrap.
  const undoPlace = (id: string, undo: RowPress | PrPress | null, at: number, offersUndo: boolean) =>
    svgClientElements && offersUndo ? (
      <Box key={`undo-place-${id}`} width={UNDO_CELLS} height={UNDO_HEIGHT_PT / DESKTOP_LINE_PT}>
        {undo ? undoButton(undo, at) : null}
      </Box>
    ) : undo ? (
      undoButton(undo, at)
    ) : null
  const settledContent = (
    what: string,
    { label, at, delivery, closedAs, reply }: SettledState,
    undo: RowPress | PrPress | null,
    mark: ResultMark | null,
    textCells: number,
    titleColor?: string,
  ) => (
    <Box flexDirection="column">
      <Text wrap="truncate-end" color={titleColor ?? pal.muted}>
        {what}
      </Text>
      <Box position="relative" flexDirection="row" columnGap={SETTLED_LINE_GAP}>
        {undo ? (
          <Box
            key={settledScrollKey(`undo-${pressRowId(undo)}`, settledLayout)}
            position="absolute"
            top={0}
            bottom={0}
            left={0}
            width={1}
          />
        ) : null}
        {resultLine(
          mark,
          `settled-${what}`,
          titleColor ?? pal.muted,
          <Text wrap="truncate-end" color={settledTone({ delivery, closedAs }) === 'done' ? pal.tone.done : pal.muted}>
            {terminalSettledLabel(settledLabel(label, delivery, reply), textCells, mark !== null, undo !== null)}
          </Text>,
        )}
        {undo ? undoButton(undo, at) : null}
      </Box>
    </Box>
  )
  const closedTitleColor = closedTitleTint({ look, pal, now, ui })
  const settledRow = ({ settled: r, state }: Extract<Entry, { settled: RowView }>, pos: TreePos) => {
    const undo = r.actions.find(a => a.press.action === 'undo')?.press ?? null
    const mark = settledMark(state)
    if (look === 'desktop')
      return (
        <Box key={`settled-${r.id}`} flexDirection="column">
          {desktopRow(r, state, undo, mark, closedTitleColor(r.id, state))}
          {undo && hasClient ? heldClients(elements, desktopFrame, r.id) : null}
        </Box>
      )
    return (
      <Box key={`settled-${r.id}`} flexDirection="column" paddingY={space.settledPad}>
        {treeRow(
          pos,
          r.type === 'finding' ? null : <Text> </Text>,
          settledContent(
            terminalSettledTitle(rowTitle(r, look), listColumns, r.type !== 'finding'),
            state,
            undo,
            mark,
            terminalSettledCells(listColumns, r.type !== 'finding'),
            closedTitleColor(r.id, state),
          ),
        )}
      </Box>
    )
  }
  const desktopRow = (
    r: RowView,
    state: SettledState,
    undo: RowPress | null,
    mark: ResultMark,
    titleColor?: string,
  ) => {
    const { title, after } = desktopSettledLine(r.title, state, listColumns)
    const label = <Text color={pal.muted}>{after.text}</Text>

    return desktopFrame({
      key: `settled-frame-${r.id}`,
      markCells: DESKTOP_MARK_CELLS,
      mark: markGlyph(mark, `settled-${r.id}`, titleColor ?? pal.muted),
      side: undoPlace(r.id, undo, state.at, state.offersUndo),
      padY: space.settledPad,
      isSideCentered: true,
      children: [
        <Text key="title" wrap="wrap">
          {titleColor ? <Text color={titleColor}>{title}</Text> : title}
          {after.isUnder ? null : label}
        </Text>,
        after.isUnder ? (
          <Text key="label" wrap="wrap">
            {label}
          </Text>
        ) : null,
      ],
    })
  }

  return {
    groupEmpty,
    groupTitle,
    section,
    sections,
    terminalSectionGap,
    titleGap,
    foldButton,
    foldRow,
    desktopFoldLines,
    desktopFoldLinesOf,
    closedFold,
    undoPlace,
    settledContent,
    settledRow,
  }
}

export type PaneRowParts = ReturnType<typeof paneRowParts>
