import type { AskEntry } from './pane-ask-tree'
import type { PaneBase, Row } from './pane-context'
import type { paneDesktopTree } from './pane-desktop-tree'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowLines } from './pane-row-lines'
import { CHILD_GAP_PT } from './layout'
import { DESKTOP_ARM_GAP, DESKTOP_MARK_CELLS, DESKTOP_TREE_AT, desktopPad } from './pane-sizes'

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
}: Pick<PaneBase, 'Box' | 'Text' | 'pal' | 'space' | 'blankLine'> &
  Pick<PaneRowFrame, 'desktopFrame'> &
  Pick<ReturnType<typeof paneDesktopTree>, 'desktopTreeLine'> &
  Pick<PaneRowLines, 'gutterMark' | 'sideAge'>) {
  const hungMarkCenter = DESKTOP_TREE_AT - 1
  const line = (en: AskEntry) => (
    <Text key={en.key} wrap="wrap">
      {en.lead ? <Text color={pal.muted}>{en.lead}</Text> : null}
      {en.label ? <Text bold={en.lead !== undefined}>{en.label}</Text> : null}
      <Text color={pal.muted}>{en.rest}</Text>
    </Text>
  )
  /** The frames inside the card draw no border, so nothing lies between one frame's line and the next. */
  const treeBox = (key: string, shape: 'down' | 'pass' | 'mid' | 'last', edge: number, edgeBelow = edge) =>
    desktopTreeLine(key, shape, {
      at: hungMarkCenter,
      arm: DESKTOP_MARK_CELLS - DESKTOP_ARM_GAP - hungMarkCenter,
      edge,
      edgeBelow,
      seam: 0,
    })
  /** The padding that puts `CHILD_GAP_PT` between two entries: half under the one above and half above the one below. */
  const halfGap = desktopPad(CHILD_GAP_PT / 2)

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
            const padY = n > 0 ? halfGap : 0
            const padBelow = n < groups.length - 1 ? halfGap : 0
            const { pos } = group[0]!
            const shape = pos === 'mid' || pos === 'last' || pos === 'pass' ? pos : null

            return desktopFrame({
              key: `row-${row.id}-${group[0]!.key}`,
              markCells: DESKTOP_MARK_CELLS,
              isBordered: false,
              padY,
              padBelow,
              tree: shape ? treeBox(`row-${row.id}-${group[0]!.key}-tree`, shape, padY, padBelow) : null,
              children: group.map(line),
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
