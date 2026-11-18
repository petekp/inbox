import type { AskEntry } from './pane-ask-tree'
import type { PaneBase, Row } from './pane-context'
import type { paneDesktopTree } from './pane-desktop-tree'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import type { PaneRowLines } from './pane-row-lines'
import type { RowPart } from './row-parts'
import {
  DESKTOP_ANSWER_BUTTON_PT,
  DESKTOP_ANSWER_LABEL_CELLS,
  DESKTOP_ARM_GAP,
  DESKTOP_HAIR_PT,
  DESKTOP_MARK_CELLS,
  DESKTOP_ROW_PT,
  DESKTOP_TREE_AT,
} from './pane-sizes'

/** An answer's arm meets its button's middle, which sits lower than a line of text's middle. */
const ANSWER_ARM_AT = (DESKTOP_ANSWER_BUTTON_PT - DESKTOP_HAIR_PT) / 2 / DESKTOP_ROW_PT

const isAnswer = (en: AskEntry | undefined) => en?.option !== undefined || en?.options !== undefined

/** An answer's note or reason joins the answer above it, so one frame and one piece of the tree hold both. */
const isJoined = (en: AskEntry) => en.noteOf !== undefined

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
  desktopFrame,
  desktopTreeLine,
  gutterMark,
  sideAge,
  keyedButton,
  partSpace,
}: Pick<PaneBase, 'Box' | 'Text' | 'pal' | 'space'> & {
  /** The space between two parts of the card, from `partSpace` in its `desktopCard` form. */
  partSpace: (above: RowPart, below: Exclude<RowPart, 'title'>) => number
} & Pick<PaneRowKeys, 'keyedButton'> &
  Pick<PaneRowFrame, 'desktopFrame'> &
  Pick<ReturnType<typeof paneDesktopTree>, 'desktopTreeLine'> &
  Pick<PaneRowLines, 'gutterMark' | 'sideAge'>) {
  const hungMarkCenter = DESKTOP_TREE_AT - 1
  const text = (en: AskEntry) => (
    <Text wrap="wrap">
      {en.lead ? <Text color={pal.muted}>{en.lead}</Text> : null}
      {en.label ? <Text bold={en.lead !== undefined}>{en.label}</Text> : null}
      <Text color={pal.muted}>{en.rest}</Text>
    </Text>
  )
  const line = (rowId: string, en: AskEntry, above: AskEntry | undefined) =>
    en.options ? (
      <Box key={en.key} flexDirection="row" columnGap={space.buttonGap}>
        {en.options.map(keyedButton(rowId))}
      </Box>
    ) : en.option ? (
      <Box key={en.key} flexDirection="row">
        {keyedButton(rowId)(en.option)}
      </Box>
    ) : en.noteOf ? (
      <Box key={en.key} marginTop={partSpace(above?.part ?? 'title', en.part)} paddingLeft={DESKTOP_ANSWER_LABEL_CELLS}>
        {text(en)}
      </Box>
    ) : (
      <Box key={en.key}>{text(en)}</Box>
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
  /** The space above a frame's first part, under the title or the frame above it. */
  const spaceAbove = (above: AskEntry[] | undefined, below: AskEntry[], top: RowPart) =>
    partSpace(above?.at(-1)?.part ?? top, below[0]!.part)

  return ({
    row,
    entries,
    title,
    body,
    status,
    keys,
    gapY,
  }: {
    row: Row
    entries: AskEntry[]
    title: JSX.Element
    /** The row's body under its title, and the part it ends with. */
    body: { node: JSX.Element; end: RowPart } | null
    status: { text: string; color: string | undefined }[]
    keys: JSX.Element
    gapY: number
  }) => {
    const top = body?.end ?? 'title'
    const groups = entries.reduce<AskEntry[][]>(
      (all, en) => (isJoined(en) ? [...all.slice(0, -1), [...all.at(-1)!, en]] : [...all, [en]]),
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
            children: [
              title,
              row.subtitle ?? null,
              body ? (
                <Box key="detail" marginTop={partSpace('title', 'detail')}>
                  {body.node}
                </Box>
              ) : null,
            ],
          })}
          {groups.map((group, n) => {
            // Two frames split the space between them, so the tree's piece in each reaches the other's.
            const above = spaceAbove(groups[n - 1], group, top)
            const padY = n > 0 ? above / 2 : above
            const padBelow = n < groups.length - 1 ? spaceAbove(group, groups[n + 1]!, top) / 2 : 0
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
              children: group.map((en, k) => line(row.id, en, group[k - 1])),
            })
          })}
          {desktopFrame({
            key: `row-${row.id}-keys`,
            markCells: DESKTOP_MARK_CELLS,
            isBordered: false,
            padY: 0,
            padBelow: 0,
            children: [
              status.length > 0 ? (
                <Box
                  key="status"
                  flexDirection="column"
                  marginTop={partSpace(entries.at(-1)?.part ?? top, 'status')}
                >
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
