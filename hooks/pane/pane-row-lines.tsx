import type { UiPressArgument } from 'claude-code'
import { DESKTOP_CHARS_PER_CELL, DESKTOP_CLIP_CHARS_PER_CELL, desktopTextPt } from './desktop-metrics'
import { MUTED_MARK, mutedMarkSvg, RUNNING_SVG_CELLS, runningSvg, toneSvg, WORKING_MARK } from './desktop-svg'
import { textMark } from '../../core/view/marks'
import { WORKING } from './palettes'
import {
  feedbackOf,
  feedbackText,
  feedbackTone,
  type FeedbackTone,
  hasAge,
  isAfterTitle,
  markedFeedbackText,
  rowFeedbackText,
} from '../../core/view/feedback'
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
import { COLLAPSED_TITLE_LINES } from '../../core/view/row-parts'
import { DOT, type ResultMark, rowMark, rowResultMark, type RowView, shortAgo } from '../../core/view/rows'
import { desktopSpanLines, LEADING_DOT, partedLines, statusAfterTitle, type TreePos, treeText } from './terminal-text'
import { ago, cellWidth, clipLabel } from '../../core/domain/text'
import { resultGlyph, runningMark } from '../../core/view/timing'

const holdsUpLineOf = (r: RowView | undefined) => r?.holdsUpLine ?? null

export const childPos = (n: number, count: number): TreePos => (n === count - 1 ? 'last' : 'mid')

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
  >) {
  const feedbackLabel = (id: string, row?: Row) => {
    const f = row?.view ? row.view.feedback : feedbackOf(id, lastActions[id], notes[id], turns, now)
    if (!f) return null
    const mark = look === 'terminal' && row?.view ? rowResultMark(row.view) : null
    const lead = mark === null ? '' : `${resultGlyph(mark, now)} `
    const label = row?.view
      ? rowFeedbackText(row.view, look)!
      : hasAge(f)
        ? markedFeedbackText(f, row?.isMarkDone ?? false, look)
        : feedbackText(f, look)
    const text = `${lead}${label}`
    const tone = feedbackTone(f)
    const doneText = tone === 'done' ? text : null

    return hasAge(f)
      ? { text, age: ago(now - f.at), isAfterTitle: true, tone, doneText, feedback: f }
      : { text, age: '', isAfterTitle: isAfterTitle(f), tone, doneText, feedback: f }
  }
  const lastActionText = (id: string) => {
    const f = feedbackLabel(id)

    return f ? { text: [f.text, f.age].filter(Boolean).join(DOT), tone: f.tone, doneText: f.doneText } : null
  }
  /** A press result's color: the error color, the done color of the ✓ it carries, or muted. */
  const feedbackColor = (tone: FeedbackTone) =>
    tone === 'error' ? pal.tone.error : tone === 'done' ? pal.mark.done : pal.muted
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
  /** A 1 pt line on desktop, `across` the pane or `down` it: a rule in the divider color, unless given the tree line's. */
  const desktopHairline = (
    key: string,
    direction: 'across' | 'down',
    box: { marginTop?: number; marginBottom?: number; marginLeft?: number; width?: number } = {},
    color: string = pal.divider,
  ) => (
    <Box
      key={key}
      {...(direction === 'across' ? { height: DESKTOP_HAIR_LINES } : { width: DESKTOP_HAIR_CELLS })}
      backgroundColor={color}
      {...box}
    />
  )
  const columnsFor = (row: Pick<Row, 'view' | 'handle'>) => {
    const base = look === 'desktop' ? ROW_COLUMNS.desktop : ROW_COLUMNS.tree
    return row.view && look === 'terminal' && !row.handle ? { ...base, textAt: base.handleAt } : base
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
        afterTone: f.tone === 'error' ? ('error' as const) : undefined,
        afterDoneText: f.doneText,
      }

    return {
      ...plain,
      after: [plain.after, isAgeDropped ? '' : plain.age].filter(Boolean).join('') || undefined,
      afterDoneText: null,
    }
  }
  /**
   * A line with its done press result in the done mark's color, which every palette defines. The line may glue its
   * words with no-break spaces, so the result is found with plain spaces.
   */
  const withDoneText = (text: string, doneText: string | null | undefined) => {
    const at = doneText ? text.replaceAll('\u00a0', ' ').indexOf(doneText) : -1
    if (!doneText || at < 0) return text

    return [
      text.slice(0, at),
      <Text key="done" color={pal.mark.done}>
        {text.slice(at, at + doneText.length)}
      </Text>,
      text.slice(at + doneText.length),
    ]
  }
  const unselectedLine = (row: Row, onPress: (press: UiPressArgument) => void, inset: number, titleColor?: string) => {
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
    const isWrapped = look === 'terminal' && text.length > room && space > 0
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
    const titleButton = (key: string, label: string) =>
      titleColor ? (
        <Button plain key={key} {...hover} onPress={onPress}>
          <Text color={titleColor}>{label}</Text>
        </Button>
      ) : (
        <Button plain key={key} label={label} {...hover} onPress={onPress} />
      )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {line.before ? (
            <Box flexShrink={0}>
              <Text color={pal.muted}>{line.before}</Text>
            </Box>
          ) : null}
          <Box flexShrink={0}>{titleButton(`title-${row.id}`, first)}</Box>
          {after ? (
            <Text wrap="truncate-end" color={line.afterTone ? pal.tone[line.afterTone] : pal.muted}>
              {withDoneText(after, line.afterDoneText)}
            </Text>
          ) : null}
        </Box>
        {second ? <Box paddingLeft={line.before?.length ?? 0}>{titleButton(`title-${row.id}-2`, second)}</Box> : null}
        {meta ? (
          <Text wrap="wrap" color={line.afterTone ? pal.tone[line.afterTone] : pal.muted}>
            {withDoneText(partedLines(meta.split(DOT), s => cellWidth(s) <= width).join('\n'), line.afterDoneText)}
          </Text>
        ) : null}
        {holdsUpLine ? (
          <Box paddingLeft={line.before?.length ?? 0}>
            <Text color={pal.muted}>{clipLabel(holdsUpLine, Math.max(12, width))}</Text>
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
  const toneCell = (svg: { source: string; cells: number }, alt: string) =>
    svgCell(svg.source, alt, undefined, svg.cells)
  /** An Asks or Finds row's result mark in the desktop mark column, or null when it has none. */
  const gutterMark = (row: Row) => {
    const mark = look === 'desktop' && row.view ? rowMark(row.view) : null
    if (mark?.tone && ToneSvg) return toneCell(toneSvg(mark.tone, mark.text), mark.text)
    return mark ? markGlyph(mark, `gutter-${row.id}`, mark.tone ? pal.mark[mark.tone] : pal.muted) : null
  }
  const svgColorsOf = (color: string) =>
    color.startsWith('#') ? { light: color, dark: color } : color === WORKING ? WORKING_MARK : MUTED_MARK
  const runningDot = (id: string, glyph: string, color: string) =>
    svgCell(runningSvg(now, svgColorsOf(color)), glyph, `${id}-mark`, RUNNING_SVG_CELLS) ?? (
      <Text color={color}>{look === 'terminal' ? runningMark(now) : glyph}</Text>
    )
  const toned = (row: Row, tint?: string) => {
    if (look === 'desktop' && row.isHandleRunning) return runningDot(`handle-${row.id}`, row.handle, pal.muted)
    const isMutedHandle = !!row.handle && !row.handleTone && !row.isHandleRunning
    if (isMutedHandle) return markGlyph({ text: row.handle, isRunning: false }, `handle-${row.id}`, tint ?? pal.muted)
    if (ToneSvg === null || !row.handle || !row.handleTone) return null
    return toneCell(toneSvg(row.handleTone, row.handle, tint), row.handle)
  }
  const sideAge = (row: Row) => {
    const f = row.view ? row.view.feedback : feedbackOf(row.id, lastActions[row.id], notes[row.id], turns, now)
    const at = f && hasAge(f) ? f.at : row.at
    return at === undefined ? '' : shortAgo(now - at)
  }
  const rowClientProps = (row: Row, textColumnPt: number, titleColor?: string): RowProps => {
    const f = feedbackLabel(row.id, row)
    const before = row.line?.before ?? ''
    const text = (row.line?.text ?? row.title).trim()
    const status = f?.isAfterTitle ? f.text : (row.line?.after ?? '').replace(LEADING_DOT, '').trim()
    const [, ...titleSpans] = desktopSpanLines([{ text: before }, { text }], textColumnPt, COLLAPSED_TITLE_LINES, {
      isCutAtWord: true,
    })
    const after = status
      ? statusAfterTitle(`${DOT}${status}`, before + text, s => desktopTextPt(s) <= textColumnPt)
      : null

    return {
      markCells: DESKTOP_MARK_CELLS,
      sideCells: DESKTOP_SIDE_CELLS,
      before,
      title: titleSpans.map(s => s.text).join(''),
      titleColor: titleColor ?? null,
      after: after?.text ?? '',
      isAfterUnder: after?.isUnder ?? false,
      note: holdsUpLineOf(row.view) ?? '',
      side: sideAge(row),
      padY: DESKTOP_ROW_PAD,
      charsPerCell: DESKTOP_CLIP_CHARS_PER_CELL,
      fallbackColumns: e.props.bodyColumns - 2,
      colors: {
        muted: pal.muted,
        after: f ? (feedbackColor(f.tone) ?? null) : pal.muted,
        afterHover: f ? (feedbackColor(f.tone) ?? null) : pal.muted,
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
        <Box width={TERMINAL_SIDE_CELLS} flexShrink={0} justifyContent="flex-end">
          <Text color={pal.age}>{sideAge(row)}</Text>
        </Box>
      </Box>
    ) : (
      line
    )
  const markGlyph = (mark: ResultMark, key: string, color: string) => {
    if (mark.isRunning) return runningDot(key, mark.text, color)
    // An Svg cannot read a theme key, so one takes the muted mark's colors, or the working mark's for the text key.
    const { light, dark } = svgColorsOf(color)
    const drawn = ToneSvg ? mutedMarkSvg(mark.text, light, dark) : null
    if (drawn) return svgCell(drawn.source, mark.text, `${key}-mark`, drawn.cells)
    return <Text color={color}>{textMark(mark.text) || ' '}</Text>
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
    divided,
    withDoneText,
    feedbackColor,
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
