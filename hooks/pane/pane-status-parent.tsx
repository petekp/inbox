import { desktopTextPt } from './desktop-metrics'
import type { ParentProps } from './parent-client'
import { parentClient } from './pane-row-clients'
import type { PaneBase, PaneClient, PaneHandlers } from './pane-context'
import type { PaneStatusLines } from './pane-status-lines'
import { desktopTextLines, exactly } from './pane-status-tops'
import type { Drawn } from './pane-status-tops'
import { parentChevron } from '../../core/view/status-folds'
import { foldLevelOf } from '../../core/view/status-page-parts'
import type { TextLevel } from '../../core/view/status-page-parts'
import type { StatusTone } from '../../core/view/help'
import { type StatusStall, STATUS_TEXT_LINES } from '../../core/view/status-page'
import { levelSpan, type TerminalSpan, terminalSpanLines } from './terminal-text'
import { cellWidth } from '../../core/domain/text'

/** The element name a parent's name line and its chevron press under. */
export const PARENT_PREFIX = 'parent-'

/** How a parent's chevron and count draw: at the level `foldLevelOf` gives, and whether on the selected row. */
type ChevronPaint = { level: TextLevel; isOnSelection: boolean }

/** The space between the end of a parent's name and stall word and its chevron. */
const CHEVRON_GAP = ' '

/**
 * A Status parent's name line, with the fold's chevron after the name and stall word, and the press that folds the
 * parent's rows or opens them. The terminal draws the chevron as a plain button after the last line of the name. Desktop
 * draws the whole line as a `Client`, so a click anywhere on it presses, and hover brightens the chevron and count.
 */
export function paneStatusParent(
  {
    look,
    Box,
    Text,
    Button,
    pal,
    hasClient,
    elements,
    terminalText,
    statusNameLine,
    nameLineSpans,
    statusTextWidth,
  }: PaneClient &
    Pick<PaneBase, 'look' | 'Box' | 'Text' | 'Button' | 'pal' | 'terminalText'> &
    Pick<PaneStatusLines, 'statusNameLine' | 'nameLineSpans' | 'statusTextWidth'>,
  { toggleParent }: Pick<PaneHandlers, 'toggleParent'>,
) {
  /** The chevron as a plain button. A faint one carries its color in its text, since a Button takes no color. */
  const chevronButton = (id: string, chevron: string, paint: ChevronPaint) => (
    <Button plain dimColor key={`${PARENT_PREFIX}${id}`} label={chevron} onPress={() => void toggleParent(id)}>
      {paint.level === 'faint' ? terminalText([[levelSpan(chevron, 'faint', paint.isOnSelection)]]) : undefined}
    </Button>
  )
  const desktopName = (
    id: string,
    name: TerminalSpan,
    stall: StatusStall | null,
    depth: number,
    chevron: string,
    paint: ChevronPaint,
  ): Drawn => {
    const nbsp = (text: string) => text.replaceAll(' ', ' ')
    const after = nbsp(`${CHEVRON_GAP}${chevron}`)
    const { spans } = nameLineSpans(name, stall, depth, desktopTextPt(after))
    const parts: ParentProps['parts'] = [
      ...spans.map((s): ParentProps['parts'][number] => ({
        text: s.text,
        tone: s.isNeedsYou ? 'needsYou' : s.isMuted ? 'muted' : s.isFaint ? 'faint' : 'plain',
        bold: s.bold === true,
      })),
      { text: after, tone: paint.level, bold: false },
    ]
    const text = parts.map(p => p.text).join('')
    const lines = desktopTextLines(text, statusTextWidth(depth))
    if (!hasClient)
      return {
        el: (
          <Box key={`status-${id}-name`} flexDirection="row">
            {statusNameLine(`status-${id}-name-text`, name, stall, depth).el}
            <Box marginLeft={1} flexShrink={0}>
              {chevronButton(id, chevron, paint)}
            </Box>
          </Box>
        ),
        lines,
      }
    const props: ParentProps = {
      parts,
      colors: {
        muted: pal.muted ?? null,
        faint: pal.faint ?? null,
        needsYou: pal.tone.needsYou ?? pal.mark.needsYou ?? null,
        hoverText: 'text',
      },
    }

    return {
      el: parentClient(elements, `${PARENT_PREFIX}${id}`, props),
      lines,
    }
  }
  const terminalName = (
    id: string,
    name: TerminalSpan,
    stall: StatusStall | null,
    depth: number,
    chevron: string,
    paint: ChevronPaint,
  ): Drawn => {
    const { spans, width } = nameLineSpans(name, stall, depth, CHEVRON_GAP.length + cellWidth(chevron))
    const lines = terminalSpanLines(spans, width, STATUS_TEXT_LINES)
    const last = lines.at(-1) ?? []
    const before = lines.slice(0, -1)

    return {
      el: (
        <Box key={`status-${id}-name`} flexDirection="column">
          {before.length > 0 ? <Text key="before">{terminalText(before)}</Text> : null}
          <Box key="last" flexDirection="row">
            <Text>{terminalText([last])}</Text>
            <Box marginLeft={CHEVRON_GAP.length} flexShrink={0}>
              {chevronButton(id, chevron, paint)}
            </Box>
          </Box>
        </Box>
      ),
      lines: exactly(Math.max(1, lines.length)),
    }
  }
  /** `p`'s name line, with the chevron of its fold, folded or open over its `foldCount` rows, at `foldLevelOf`'s level. */
  const parentName = (
    p: { id: string; tone: StatusTone; foldCount: number },
    name: TerminalSpan,
    stall: StatusStall | null,
    depth: number,
    isCollapsed: boolean,
  ): Drawn => {
    const { id } = p
    const chevron = parentChevron(isCollapsed, p.foldCount)
    const paint = { level: foldLevelOf(p), isOnSelection: name.isOnSelection === true }

    return look === 'desktop'
      ? desktopName(id, name, stall, depth, chevron, paint)
      : terminalName(id, name, stall, depth, chevron, paint)
  }

  return { parentName }
}

export type PaneStatusParent = ReturnType<typeof paneStatusParent>
