import type { UiPressArgument } from 'claude-code'
import { DESKTOP_CHARS_PER_CELL, DESKTOP_CLIP_CHARS_PER_CELL } from './desktop-metrics'
import { MUTED_MARK, mutedMarkSvg, RUNNING_SVG_CELLS, runningSvg, toneSvg } from './desktop-svg'
import {
  feedbackOf,
  feedbackText,
  hasAge,
  isAfterTitle,
  isFailure,
  markedFeedbackText,
  rowFeedbackText,
} from './feedback'
import { HELD_MARK } from './help'
import type { PaneAskRows } from './pane-asks'
import type { PaneBase, PaneClient, Row } from './pane-context'
import {
  DESKTOP_CELL_PT,
  DESKTOP_HAIR_CELLS,
  DESKTOP_HAIR_LINES,
  DESKTOP_LINE_PT,
  DESKTOP_MARK_CELLS,
  DESKTOP_ROW_PAD,
  DESKTOP_SIDE_CELLS,
  ROW_COLUMNS,
  TERMINAL_SIDE_CELLS,
  TREE_LINE_AT,
} from './pane-sizes'
import type { RowProps } from './row-client'
import { DOT, type ResultMark, rowResultMark, shortAgo } from './rows'
import { LEADING_DOT, type TreePos, treeText } from './terminal-text'
import { ago, clipLabel } from './text'
import { resultGlyph, runningMark } from './timing'

export function paneRowLines({
  elements,
  lastActions,
  notes,
  turns,
  now,
  look,
  isAgeDropped,
  pal,
  Box,
  Text,
  e,
  isInline,
  isAgeInSide,
  listColumns,
  Button,
  holdsUpLineOf,
}: Pick<PaneClient, 'elements'> &
  Pick<
    PaneBase,
    | 'lastActions'
    | 'notes'
    | 'turns'
    | 'now'
    | 'look'
    | 'isAgeDropped'
    | 'pal'
    | 'Box'
    | 'Text'
    | 'e'
    | 'isInline'
    | 'isAgeInSide'
    | 'listColumns'
    | 'Button'
  > &
  Pick<PaneAskRows, 'holdsUpLineOf'>) {
  const feedbackLabel = (id: string, row?: Row) => {
    const f = row?.view ? row.view.feedback : feedbackOf(id, lastActions[id], notes[id], turns, now)
    if (!f) return null
    const mark = look === 'terminal' && row?.view ? rowResultMark(row.view) : null
    const lead = mark === null ? '' : `${resultGlyph(mark, now)} `

    return hasAge(f)
      ? {
          text: `${lead}${row?.view ? rowFeedbackText(row.view, look)! : markedFeedbackText(f, row?.isMarkDone ?? false, look)}`,
          age: ago(now - f.at),
          isAfterTitle: true,
          isFailure: false,
          doneMark: mark?.tone === 'done' ? mark.text : null,
          feedback: f,
        }
      : {
          text: `${lead}${row?.view ? rowFeedbackText(row.view, look)! : feedbackText(f, look)}`,
          age: '',
          isAfterTitle: isAfterTitle(f),
          isFailure: isFailure(f),
          doneMark: null,
          feedback: f,
        }
  }
  const lastActionText = (id: string) => {
    const f = feedbackLabel(id)

    return f ? { text: [f.text, f.age].filter(Boolean).join(DOT), isFailure: f.isFailure } : null
  }
  const pressedAge = (row: Row) => {
    const f = feedbackLabel(row.id, row)

    return f?.isAfterTitle ? `${DOT}${[f.text, isAgeDropped ? '' : f.age].filter(Boolean).join(' ')}` : null
  }
  // The row clips, not this Box: once its row scrolled out of view,
  // Claude Code drew lines this Box clipped elsewhere in the pane (anthropics/claude-code#100030).
  // Desktop draws no tree: its lines differ in height, so stacked glyphs break into separate bars.
  const branch = (pos: TreePos, lead = 0, left = TREE_LINE_AT, color = pal.line, top = 0, key?: string) =>
    look === 'desktop' ? null : (
      <Box key={key} position="absolute" top={top} bottom={0} left={left} width={2}>
        <Text color={color}>{treeText(pos, lead)}</Text>
      </Box>
    )
  /** A 1 pt line in the divider color on desktop, `across` the pane or `down` it. */
  const desktopHairline = (
    key: string,
    direction: 'across' | 'down',
    box: { marginTop?: number; marginBottom?: number; marginLeft?: number; width?: number } = {},
  ) => (
    <Box
      key={key}
      {...(direction === 'across' ? { height: DESKTOP_HAIR_LINES } : { width: DESKTOP_HAIR_CELLS })}
      backgroundColor={pal.divider}
      {...box}
    />
  )
  const columnsFor = (row: Pick<Row, 'view'>) => {
    const base = look === 'desktop' ? ROW_COLUMNS.desktop : ROW_COLUMNS.tree
    return row.view && look === 'terminal' ? { ...base, textAt: base.handleAt } : base
  }
  const markColumns = look === 'desktop' ? ROW_COLUMNS.desktop : ROW_COLUMNS.tree
  const markWidth = markColumns.textAt - markColumns.handleAt
  const treeRow = (
    pos: TreePos | null,
    marker: JSX.Element | null,
    content: JSX.Element,
    key?: string,
    depth = 0,
    lead = markColumns.handleAt + markWidth * depth,
  ) => (
    <Box key={key} flexDirection="row" alignItems="flex-start" overflow="hidden">
      <Box width={lead} flexShrink={0} />
      {marker ? (
        <Box width={markWidth} flexShrink={0}>
          {marker}
        </Box>
      ) : null}
      <Box flexDirection="column" flexShrink={1} flexGrow={1} paddingRight={1}>
        {content}
      </Box>
      {pos ? branch(pos, 0, TREE_LINE_AT + markWidth * depth) : null}
    </Box>
  )
  const childPos = (n: number, count: number): TreePos => (n === count - 1 ? 'last' : 'mid')
  const rule = (inset: number) => (
    <Text color={pal.divider}>{'─'.repeat(Math.max(0, e.props.bodyColumns - inset))}</Text>
  )
  // Desktop draws text in a proportional font, where a run of ─ sized in cells overflows the
  // row and wraps into a second line, so there the rows sit flush and each pads itself.
  const divided = (rowEls: JSX.Element[], group: string, textAt: number = ROW_COLUMNS.tree.textAt) =>
    rowEls.flatMap((el, n) =>
      n === 0 || isInline || look === 'desktop'
        ? [el]
        : [
            <Box key={`divider-${group}-${n}`} flexDirection="row">
              <Box width={TREE_LINE_AT} flexShrink={0} />
              <Box width={textAt - TREE_LINE_AT} flexShrink={0}>
                <Text color={pal.line}>│</Text>
              </Box>
              {rule(textAt + 2)}
            </Box>,
            el,
          ],
    )
  const buttonFrame = look === 'desktop' ? 2 : 0
  const closedLine = (row: Row) => {
    const plain = row.line ?? { text: row.title, age: row.titleAfter }
    const f = feedbackLabel(row.id, row)
    if (f)
      return {
        ...plain,
        after: `${DOT}${[f.text, isAgeDropped ? '' : f.age].filter(Boolean).join(' ')}`,
        afterTone: f.isFailure ? ('error' as const) : undefined,
        afterDoneMark: f.doneMark,
      }

    return {
      ...plain,
      after: [plain.after, isAgeDropped ? '' : plain.age].filter(Boolean).join('') || undefined,
      afterDoneMark: null,
    }
  }
  /** A feedback text with its done mark in the done mark's color, which every palette defines. */
  const withDoneMark = (text: string, doneMark: string | null | undefined) => {
    const at = doneMark ? text.indexOf(doneMark) : -1
    if (!doneMark || at < 0) return text

    return [
      text.slice(0, at),
      <Text key="done" color={pal.mark.done}>
        {doneMark}
      </Text>,
      text.slice(at + doneMark.length),
    ]
  }
  const unselectedLine = (row: Row, onPress: (press: UiPressArgument) => void, inset: number) => {
    const line = closedLine(row)
    const before = line.before?.length ?? 0
    const side = isAgeInSide ? TERMINAL_SIDE_CELLS : 0
    const width = listColumns - 1 - inset - side - before
    const perCell = look === 'desktop' ? DESKTOP_CHARS_PER_CELL : 1
    const budget = Math.floor((listColumns - 1 - inset - side - buttonFrame) * perCell) - before
    const isAfterCutting = line.after !== undefined && line.text.trim().length > budget - line.after.length
    const meta =
      look === 'terminal' && line.after && (!LEADING_DOT.test(line.after) || isAfterCutting)
        ? line.after.replace(LEADING_DOT, '')
        : null
    const room = Math.max(12, budget - (meta ? 0 : (line.after?.length ?? 0)))
    const text = line.text.trim()
    const space = text.lastIndexOf(' ', room)
    const isWrapped = look === 'terminal' && row.hasSecondLine === true && text.length > room && space > 0
    const first = isWrapped ? text.slice(0, space) : clipLabel(text, room)
    const second = isWrapped ? clipLabel(text.slice(space + 1), Math.max(12, width)) : null
    const afterRoom = budget - first.length
    const after = meta
      ? undefined
      : look === 'desktop' && line.after && line.after.length > afterRoom
        ? afterRoom >= 2
          ? clipLabel(line.after, afterRoom)
          : undefined
        : line.after
    const hover = second ? { hover: { scope: `title-${row.id}`.slice(0, 64), inverse: true } } : {}
    const holdsUpLine = holdsUpLineOf(row.view)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {line.before ? (
            <Box flexShrink={0}>
              <Text color={pal.muted}>{line.before}</Text>
            </Box>
          ) : null}
          <Box flexShrink={0}>
            <Button plain key={`title-${row.id}`} label={first} {...hover} onPress={onPress} />
          </Box>
          {after ? (
            <Text wrap="truncate-end" color={line.afterTone ? pal.tone[line.afterTone] : pal.muted}>
              {withDoneMark(after, line.afterDoneMark)}
            </Text>
          ) : null}
        </Box>
        {second ? (
          <Box paddingLeft={line.before?.length ?? 0}>
            <Button plain key={`title-${row.id}-2`} label={second} {...hover} onPress={onPress} />
          </Box>
        ) : null}
        {meta ? (
          <Text wrap="truncate-end" color={line.afterTone ? pal.tone[line.afterTone] : pal.muted}>
            {withDoneMark(meta, line.afterDoneMark)}
          </Text>
        ) : null}
        {holdsUpLine ? (
          <Box paddingLeft={line.before?.length ?? 0}>
            <Text color={pal.muted}>
              <Text color={pal.mark[HELD_MARK.tone]}>{`${HELD_MARK.mark} `}</Text>
              {clipLabel(holdsUpLine, Math.max(12, width - 2))}
            </Text>
          </Box>
        ) : null}
      </Box>
    )
  }
  const ToneSvg = look === 'desktop' && 'Svg' in elements ? elements.Svg : null
  /** A desktop mark drawn as an Svg `cells` wide, or null outside desktop. */
  const svgCell = (source: string, alt: string, key?: string, cells = 1) =>
    ToneSvg ? (
      <Box key={key} width={cells} height={1} flexShrink={0}>
        <ToneSvg source={source} alt={alt} width={cells * DESKTOP_CELL_PT} height={DESKTOP_LINE_PT} />
      </Box>
    ) : null
  /** An Asks or Finds row's result mark in the desktop mark column, or null when it has none. */
  const gutterMark = (row: Row) => {
    const mark = look === 'desktop' && row.view ? rowResultMark(row.view) : null
    if (mark?.tone && ToneSvg) return svgCell(toneSvg(mark.tone, mark.text), mark.text)
    return mark ? markGlyph(mark, `gutter-${row.id}`, mark.tone ? pal.mark[mark.tone] : pal.muted) : null
  }
  const runningDot = (id: string, glyph: string, color: string) =>
    svgCell(runningSvg(now), glyph, `${id}-mark`, RUNNING_SVG_CELLS) ?? (
      <Text color={color}>{look === 'terminal' ? runningMark(now) : glyph}</Text>
    )
  const toned = (row: Row) => {
    if (look === 'desktop' && row.isHandleRunning) return runningDot(`handle-${row.id}`, row.handle, pal.muted)
    if (ToneSvg === null || !row.handle || !row.handleTone) return null
    return svgCell(toneSvg(row.handleTone, row.handle), row.handle)
  }
  const sideAge = (row: Row) => {
    const f = row.view ? row.view.feedback : feedbackOf(row.id, lastActions[row.id], notes[row.id], turns, now)
    const at = f && hasAge(f) ? f.at : row.at
    return at === undefined ? '' : shortAgo(now - at)
  }
  const rowClientProps = (row: Row): RowProps => {
    const f = feedbackLabel(row.id, row)
    const text = row.line?.text ?? row.title

    return {
      markCells: DESKTOP_MARK_CELLS,
      sideCells: DESKTOP_SIDE_CELLS,
      before: row.line?.before ?? '',
      title: text.trim(),
      after: f?.isAfterTitle ? f.text : (row.line?.after ?? '').replace(LEADING_DOT, '').trim(),
      note: holdsUpLineOf(row.view) ?? '',
      noteMark: holdsUpLineOf(row.view) ? { text: HELD_MARK.mark, color: pal.mark[HELD_MARK.tone] } : null,
      side: sideAge(row),
      padY: DESKTOP_ROW_PAD,
      maxLines: row.hasSecondLine ? 4 : 2,
      charsPerCell: DESKTOP_CLIP_CHARS_PER_CELL,
      fallbackColumns: e.props.bodyColumns - 2,
      colors: {
        muted: pal.muted,
        after: f?.isFailure ? (pal.tone.error ?? null) : pal.muted,
        afterHover: f?.isFailure ? (pal.tone.error ?? null) : pal.muted,
        side: pal.age,
        hover: pal.raised,
        hoverText: pal.raisedText ?? null,
        pressed: pal.selection ?? pal.raised,
      },
    }
  }
  const withSideAge = (row: Row, line: JSX.Element) =>
    isAgeInSide ? (
      <Box flexDirection="row">
        <Box flexGrow={1} flexShrink={1}>
          {line}
        </Box>
        <Box width={TERMINAL_SIDE_CELLS - 1} flexShrink={0} justifyContent="flex-end">
          <Text color={pal.age}>{sideAge(row)}</Text>
        </Box>
      </Box>
    ) : (
      line
    )
  const markGlyph = (mark: ResultMark, key: string, color: string) => {
    if (mark.isRunning) return runningDot(key, mark.text, color)
    // An Svg cannot read a theme key, so one takes the muted mark's colors.
    const { light, dark } = color.startsWith('#') ? { light: color, dark: color } : MUTED_MARK
    const drawn = ToneSvg ? mutedMarkSvg(mark.text, light, dark) : null
    if (drawn) return svgCell(drawn.source, mark.text, `${key}-mark`, drawn.cells)
    return <Text color={color}>{mark.text || ' '}</Text>
  }

  return {
    feedbackLabel,
    lastActionText,
    pressedAge,
    branch,
    desktopHairline,
    columnsFor,
    markWidth,
    treeRow,
    childPos,
    divided,
    withDoneMark,
    unselectedLine,
    ToneSvg,
    svgCell,
    gutterMark,
    toned,
    sideAge,
    rowClientProps,
    withSideAge,
    markGlyph,
  }
}

export type PaneRowLines = ReturnType<typeof paneRowLines>
