import type { AskEntry } from './pane-ask-tree'
import type { PaneBase, Row } from './pane-context'
import type { paneDesktopTree } from './pane-desktop-tree'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import { CHILD_GAP_PT, ITEM_GAP_PT, LIST_GAP_PT } from './layout'
import {
  DESKTOP_ANSWER_BUTTON_PT,
  DESKTOP_ANSWER_LABEL_CELLS,
  DESKTOP_ARM_GAP,
  DESKTOP_HAIR_PT,
  DESKTOP_MARK_CELLS,
  DESKTOP_ROW_PT,
  DESKTOP_TREE_AT,
  desktopPad,
} from './pane-sizes'

/** An answer's arm meets its button's middle, which sits lower than a line of text's middle. */
const ANSWER_ARM_AT = (DESKTOP_ANSWER_BUTTON_PT - DESKTOP_HAIR_PT) / 2 / DESKTOP_ROW_PT

const isAnswer = (en: AskEntry | undefined) => en?.option !== undefined || en?.options !== undefined

/**
 * A selected row's card on desktop when its lines hang from the row's ◆ on a tree: the title, each branch, and the
 * answer buttons. The card's border, fill and top and bottom padding sit on one Box around the frames, so the app
 * rounds the whole card once. The app rounds each filled Box, so the frames inside draw no fill or border.
 */
export function paneDesktopCard({
  Box,
  Text,
  pal,
  space,
  blankLine,
  desktopFrame,
  desktopTreeLine,
  gutterMark,
  sideAge,
  keyedButton,
}: Pick<PaneBase, 'Box' | 'Text' | 'pal' | 'space' | 'blankLine'> &
  Pick<PaneRowKeys, 'keyedButton'> &
  Pick<PaneRowFrame, 'desktopFrame'> &
  Pick<ReturnType<typeof paneDesktopTree>, 'desktopTreeLine'> &
  Pick<PaneRowLines, 'gutterMark' | 'sideAge'>) {
  const hungMarkCenter = DESKTOP_TREE_AT - 1
  const text = (en: AskEntry) => (
    <Text key={en.key} wrap="wrap">
      {en.lead ? <Text color={pal.muted}>{en.lead}</Text> : null}
      {en.label ? <Text bold={en.lead !== undefined}>{en.label}</Text> : null}
      <Text color={pal.muted}>{en.rest}</Text>
    </Text>
  )
  const line = (rowId: string, en: AskEntry) =>
    en.options ? (
      <Box key={en.key} flexDirection="row" columnGap={space.buttonGap}>
        {en.options.map(keyedButton(rowId))}
      </Box>
    ) : en.option ? (
      <Box key={en.key} flexDirection="row">
        {keyedButton(rowId)(en.option)}
      </Box>
    ) : en.noteOf ? (
      <Box key={en.key} marginTop={desktopPad(LIST_GAP_PT)} paddingLeft={DESKTOP_ANSWER_LABEL_CELLS}>
        {text(en)}
      </Box>
    ) : (
      text(en)
    )
  /** The frames inside the card draw no border, so nothing lies between one frame's line and the next. */
  const treeBox = (
    key: string,
    shape: 'down' | 'pass' | 'mid' | 'last',
    edge: number,
    edgeBelow = edge,
    armAt?: number,
  ) =>
    desktopTreeLine(key, shape, {
      at: hungMarkCenter,
      arm: DESKTOP_MARK_CELLS - DESKTOP_ARM_GAP - hungMarkCenter,
      edge,
      edgeBelow,
      seam: 0,
      ...(armAt === undefined ? {} : { armAt }),
    })
  /**
   * The padding that puts a gap between two groups: half under the one above and half above the one below. Two answers
   * sit `ITEM_GAP_PT` apart, more than the `LIST_GAP_PT` between an answer's button and its note, and the other
   * lines `CHILD_GAP_PT`.
   */
  const halfGapBetween = (above: AskEntry[] | undefined, below: AskEntry[] | undefined) =>
    isAnswer(above?.[0]) && isAnswer(below?.[0]) ? desktopPad(ITEM_GAP_PT / 2) : desktopPad(CHILD_GAP_PT / 2)

  return ({
    row,
    entries,
    title,
    status,
    keys,
    gapY,
  }: {
    row: Row
    entries: AskEntry[]
    title: JSX.Element
    status: { text: string; color: string | undefined }[]
    keys: JSX.Element
    gapY: number
  }) => {
    const groups = entries.reduce<AskEntry[][]>(
      (all, en) => (en.key.startsWith('reason-') ? [...all.slice(0, -1), [...all.at(-1)!, en]] : [...all, [en]]),
      [],
    )

    return (
      <Box
        key={`row-${row.id}`}
        flexDirection="row"
        marginY={gapY}
        borderStyle="single"
        borderColor="#0000"
        paddingTop={space.rowPad}
        paddingBottom={space.rowPad}
        {...(pal.selection ? { backgroundColor: pal.selection } : {})}
      >
        <Box flexDirection="column" flexGrow={1} position="relative">
          <Box key={`view-${row.id}`} position="absolute" top={0} bottom={0} left={0} width={1} />
          {desktopFrame({
            key: `row-${row.id}-title`,
            markCells: DESKTOP_MARK_CELLS,
            isBordered: false,
            padY: 0,
            padBelow: 0,
            mark: gutterMark(row),
            side: <Text color={pal.age}>{sideAge(row)}</Text>,
            tree: treeBox(`row-${row.id}-trunk`, 'down', 0),
            children: [title, row.subtitle ?? null, row.body ? <Box marginTop={blankLine}>{row.body}</Box> : null],
          })}
          {groups.map((group, n) => {
            const padY = n > 0 ? halfGapBetween(groups[n - 1], group) : 0
            const padBelow = n < groups.length - 1 ? halfGapBetween(group, groups[n + 1]) : 0
            const { pos } = group[0]!
            const shape = pos === 'mid' || pos === 'last' || pos === 'pass' ? pos : null

            return desktopFrame({
              key: `row-${row.id}-${group[0]!.key}`,
              markCells: DESKTOP_MARK_CELLS,
              isBordered: false,
              padY,
              padBelow,
              tree: shape
                ? treeBox(
                    `row-${row.id}-${group[0]!.key}-tree`,
                    shape,
                    padY,
                    padBelow,
                    isAnswer(group[0]) ? ANSWER_ARM_AT : undefined,
                  )
                : null,
              children: group.map(en => line(row.id, en)),
            })
          })}
          {desktopFrame({
            key: `row-${row.id}-keys`,
            markCells: DESKTOP_MARK_CELLS,
            isBordered: false,
            padBelow: 0,
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
              keys,
            ],
          })}
        </Box>
      </Box>
    )
  }
}
