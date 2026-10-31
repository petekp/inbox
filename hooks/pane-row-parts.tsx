import type { UiPressArgument } from 'claude-code'
import type { FoldKind } from '../types'
import { groupEmptyText } from './banners'
import { chevronSvg, RESULT_MARK_CELLS, toneSvg, undoSvg } from './desktop-svg'
import type { FoldProps } from './fold-client'
import { ROW_PAD_PT } from './layout'
import type { Tone } from './palettes'
import type { Entry, PaneBase, PaneClient, PaneHandlers } from './pane-context'
import { followUpPresses } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import { childPos, type PaneRowLines } from './pane-row-lines'
import { type ClosedLine, settledScrollKey } from './pane-selection'
import {
  DESKTOP_CELL_PT,
  DESKTOP_LINE_PT,
  DESKTOP_MARK_CELLS,
  DESKTOP_ROW_PAD,
  FRAME_INSET_PT,
  TERMINAL_SIDE_CELLS,
  TREE_LINE_AT,
  UNDO_CELLS,
  UNDO_HEIGHT_PT,
} from './pane-sizes'
import { pressRowId, type PrPress } from './pr-press'
import type { RowPress } from './presses'
import {
  canUndoRefused,
  DOT,
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
} from './rows'
import type { TreePos } from './terminal-text'
import { SETTLED_MS } from './timing'
import type { UndoProps } from './undo-client'

export function paneRowParts(
  {
    hasClient,
    elements,
    look,
    Text,
    pal,
    Box,
    blankLine,
    isInline,
    space,
    now,
    foldHover,
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
      | 'Text'
      | 'pal'
      | 'Box'
      | 'blankLine'
      | 'isInline'
      | 'space'
      | 'now'
      | 'foldHover'
      | 'Button'
      | 'settledLayout'
    > &
    Pick<PaneRowFrame, 'desktopFrame'> &
    Pick<PaneRowLines, 'treeRow' | 'ToneSvg' | 'desktopHairline' | 'markGlyph' | 'markWidth'>,
  { updateUnfolded, runPress }: Pick<PaneHandlers, 'updateUnfolded' | 'runPress'>,
) {
  const groupEmpty = (title: string) =>
    look === 'desktop'
      ? desktopFrame({
          key: `empty-${title}`,
          children: <Text color={pal.muted}>{groupEmptyText(title)}</Text>,
        })
      : treeRow('last', null, <Text color={pal.muted}>{`  ${groupEmptyText(title)}`}</Text>, `empty-${title}`)
  /** A Finds group's title leads with its kind's mark, since its rows draw none. */
  const groupTitle = (title: string, count: number, mark?: { mark: string; tone: Tone }) => {
    const words = (
      <Text>
        <Text bold>{title}</Text>
        {count > 0 ? <Text color={pal.muted}>{`${DOT}${count}`}</Text> : null}
      </Text>
    )
    const lead = mark ? (
      <Box width={RESULT_MARK_CELLS} flexShrink={0}>
        {ToneSvg ? (
          <ToneSvg
            source={toneSvg(mark.tone, mark.mark)}
            alt={mark.mark}
            width={DESKTOP_CELL_PT}
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
      desktopFrame({ padY: 0, mark: lead, children: words })
    ) : (
      <Box paddingLeft={TREE_LINE_AT}>{line}</Box>
    )
  }
  const section = (children: JSX.Element | JSX.Element[]) =>
    look === 'desktop' ? (
      <Box flexDirection="column" paddingTop={blankLine}>
        {children}
      </Box>
    ) : (
      <Box flexDirection="column">{children}</Box>
    )
  const sections = (list: JSX.Element[], space = 1) => (
    <Box flexDirection="column" flexGrow={1} gap={look === 'desktop' ? 0 : isInline ? 1 : 2}>
      {look === 'desktop'
        ? list.flatMap((el, n) =>
            n === 0
              ? [el]
              : [
                  desktopHairline(`rule-${n}`, 'across', {
                    marginTop: space,
                    marginBottom: space - blankLine,
                    marginLeft: FRAME_INSET_PT / DESKTOP_CELL_PT + DESKTOP_MARK_CELLS,
                  }),
                  el,
                ],
          )
        : list}
    </Box>
  )
  const titleGap = (hasChildren = true) =>
    isInline
      ? []
      : look === 'desktop'
        ? [<Box paddingTop={(2 * ROW_PAD_PT) / DESKTOP_LINE_PT} />]
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
  const refusedUndo = (d: ClosedLine) =>
    canUndoRefused(d.delivery) ? undoButton({ id: d.id, action: 'undo' }, null) : null
  const closedRow = (d: ClosedLine, pos: TreePos) =>
    look === 'desktop'
      ? desktopFrame({
          key: `closed-${d.id}`,
          indent: DESKTOP_MARK_CELLS,
          isMarkHung: false,
          padY: space.rowPad / 2,
          mark: markGlyph(d.mark, `closed-${d.id}`, pal.age),
          side: <Text color={pal.age}>{shortAgo(now - d.at)}</Text>,
          children: [
            <Text wrap="wrap" color={pal.muted}>
              {d.ask}
            </Text>,
            <Text wrap="wrap" color={pal.age}>
              {settledLabel(d.outcomeLabel, d.delivery)}
            </Text>,
            refusedUndo(d),
          ],
        })
      : treeRow(
          pos,
          null,
          <Box flexDirection="row">
            <Box flexDirection="column" flexGrow={1} flexShrink={1}>
              <Text wrap="wrap" color={pal.muted}>
                {d.ask}
              </Text>
              {resultLine(
                d.mark,
                `closed-${d.id}`,
                pal.muted,
                <Text wrap="wrap" color={pal.age}>
                  {settledLabel(d.outcomeLabel, d.delivery)}
                </Text>,
              )}
              {refusedUndo(d)}
            </Box>
            <Box width={TERMINAL_SIDE_CELLS - 1} flexShrink={0} justifyContent="flex-end">
              <Text color={pal.age}>{shortAgo(now - d.at)}</Text>
            </Box>
          </Box>,
          `closed-${d.id}`,
          1,
        )
  // On desktop a Client takes a click on every cell of the line, where a Button takes one only on its label.
  const foldRow = (kind: FoldKind, count: number, isUnfolded: boolean) =>
    hasClient ? (
      <Box key={`fold-row-${kind}`} flexDirection="row" overflow="hidden">
        {'Svg' in elements ? (
          <elements.Svg
            source={chevronSvg(isUnfolded, foldHover === kind)}
            alt={isUnfolded ? 'Unfolded' : 'Folded'}
            width={FRAME_INSET_PT + DESKTOP_MARK_CELLS * DESKTOP_CELL_PT}
            height={2 * ROW_PAD_PT + DESKTOP_LINE_PT}
          />
        ) : null}
        <Box position="absolute" top={0} left={0} width="100%">
          <elements.Client
            key={`fold-${kind}`}
            module="./fold-client.tsx"
            width="100%"
            props={
              {
                markCells: DESKTOP_MARK_CELLS,
                label: foldLabel(count),
                isUnfolded,
                padY: DESKTOP_ROW_PAD,
                colors: {
                  rest: isInline ? null : (pal.card ?? null),
                  text: pal.age,
                  hoverText: 'text',
                },
              } satisfies FoldProps
            }
          />
        </Box>
      </Box>
    ) : (
      treeRow(
        null,
        null,
        <Box flexDirection="row">
          <Button
            plain
            dimColor
            key={`fold-${kind}`}
            label={`${isUnfolded ? '▾' : '▸'} ${foldLabel(count)}`}
            onPress={() => void updateUnfolded(u => (u.includes(kind) ? u.filter(k => k !== kind) : [...u, kind]))}
          />
        </Box>,
        `fold-row-${kind}`,
      )
    )
  const closedFold = (kind: FoldKind, closed: ClosedLine[], total: number, isUnfolded: boolean) => {
    const earlier = earlierLabel(total, closed.length)
    return closed.length === 0
      ? []
      : [
          ...(space.isFoldGapped ? titleGap(false) : []),
          foldRow(kind, total, isUnfolded),
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
                      children: <Text color={pal.age}>{earlier}</Text>,
                    })
                  : treeRow(
                      childPos(closed.length, closed.length + 1),
                      null,
                      <Text color={pal.age}>{earlier}</Text>,
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
    const label = ' ↺ Undo '
    const onPress = (press: { surface: UiPressArgument['surface'] }) => runPress(undo, press.surface)
    if (svgClientElements) {
      followUpPresses.set(key, onPress)
      const leftMs = at === null ? 0 : Math.max(0, SETTLED_MS - (now - at))
      return (
        <Box key={`${key}-${at}`} width={UNDO_CELLS} height={UNDO_HEIGHT_PT / DESKTOP_LINE_PT}>
          <svgClientElements.Svg
            source={undoSvg(leftMs / SETTLED_MS, leftMs)}
            alt="Undo"
            width={UNDO_CELLS * DESKTOP_CELL_PT}
            height={UNDO_HEIGHT_PT}
          />
          <Box position="absolute" top={0} left={0}>
            <svgClientElements.Client
              key={key}
              module="./undo-client.tsx"
              width={UNDO_CELLS}
              height={UNDO_HEIGHT_PT / DESKTOP_LINE_PT}
              props={{ pressKey: key, hover: 'rgba(128, 128, 128, 0.12)' } satisfies UndoProps}
            />
          </Box>
        </Box>
      )
    }
    if (look !== 'terminal' || at === null) return <Button key={key} label="↺ Undo" onPress={onPress} />
    const cells = [...label]
    const filled = Math.ceil((Math.max(0, SETTLED_MS - (now - at)) / SETTLED_MS) * cells.length)

    return (
      <Button key={key} onPress={onPress}>
        <Text backgroundColor={pal.divider}>{cells.slice(0, filled).join('')}</Text>
        <Text>{cells.slice(filled).join('')}</Text>
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
    { label, at, delivery, closedAs }: SettledState,
    undo: RowPress | PrPress | null,
    mark: ResultMark | null,
  ) => (
    <Box flexDirection="column">
      <Text wrap="truncate-end" color={pal.muted}>
        {what}
      </Text>
      <Box position="relative" flexDirection="row" columnGap={2}>
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
          pal.muted,
          <Text wrap="wrap" color={settledTone({ delivery, closedAs }) === 'done' ? pal.tone.done : pal.muted}>
            {settledLabel(label, delivery)}
          </Text>,
        )}
        {undo ? undoButton(undo, at) : null}
      </Box>
    </Box>
  )
  const settledRow = ({ settled: r, state }: Extract<Entry, { settled: RowView }>, pos: TreePos) => {
    const undo = r.actions.find(a => a.press.action === 'undo')?.press ?? null
    const mark = settledMark(state)
    if (look === 'desktop')
      return desktopFrame({
        key: `settled-${r.id}`,
        markCells: DESKTOP_MARK_CELLS,
        mark: markGlyph(mark, `settled-${r.id}`, pal.muted),
        side: undoPlace(r.id, undo, state.at, state.offersUndo),
        padY: space.settledPad,
        isSideCentered: true,
        children: [
          <Text wrap="wrap">
            {r.title}
            <Text color={pal.muted}>{`${DOT}${settledLabel(state.label, state.delivery)}`}</Text>
          </Text>,
        ],
      })
    return (
      <Box key={`settled-${r.id}`} flexDirection="column" paddingY={space.settledPad}>
        {treeRow(pos, null, settledContent(rowTitle(r, look), state, undo, mark))}
      </Box>
    )
  }

  return { groupEmpty, groupTitle, section, sections, titleGap, closedFold, undoPlace, settledContent, settledRow }
}

export type PaneRowParts = ReturnType<typeof paneRowParts>
