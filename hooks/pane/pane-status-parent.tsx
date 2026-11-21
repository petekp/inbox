import { desktopTextPt } from './desktop-metrics'
import type { ParentProps } from './parent-client'
import type { PaneBase, PaneClient, PaneHandlers } from './pane-context'
import type { PaneStatusLines } from './pane-status-lines'
import { desktopTextLines, exactly } from './pane-status-tops'
import type { Drawn } from './pane-status-tops'
import { parentChevron } from '../../core/view/status-folds'
import { type StatusStall, STATUS_TEXT_LINES } from '../../core/view/status-page'
import { type TerminalSpan, terminalSpanLines } from './terminal-text'
import { cellWidth } from '../../core/domain/text'

/** The element name a parent's name line and its chevron press under. */
export const PARENT_PREFIX = 'parent-'

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
  const chevronButton = (id: string, chevron: string) => (
    <Button plain dimColor key={`${PARENT_PREFIX}${id}`} label={chevron} onPress={() => void toggleParent(id)} />
  )
  const desktopName = (
    id: string,
    name: TerminalSpan,
    stall: StatusStall | null,
    depth: number,
    chevron: string,
  ): Drawn => {
    const nbsp = (text: string) => text.replaceAll(' ', ' ')
    const after = nbsp(`${CHEVRON_GAP}${chevron}`)
    const { spans } = nameLineSpans(name, stall, depth, desktopTextPt(after))
    const parts: ParentProps['parts'] = [
      ...spans.map((s): ParentProps['parts'][number] => ({
        text: s.text,
        tone: s.isNeedsYou ? 'needsYou' : s.isMuted ? 'muted' : 'plain',
        bold: s.bold === true,
      })),
      { text: after, tone: 'muted', bold: false },
    ]
    const text = parts.map(p => p.text).join('')
    const lines = desktopTextLines(text, statusTextWidth(depth))
    if (!hasClient)
      return {
        el: (
          <Box key={`status-${id}-name`} flexDirection="row">
            {statusNameLine(`status-${id}-name-text`, name, stall, depth).el}
            <Box marginLeft={1} flexShrink={0}>
              {chevronButton(id, chevron)}
            </Box>
          </Box>
        ),
        lines,
      }
    const props: ParentProps = {
      parts,
      colors: {
        muted: pal.muted ?? null,
        needsYou: pal.tone.needsYou ?? pal.mark.needsYou ?? null,
        hoverText: 'text',
      },
    }

    return {
      el: <elements.Client key={`${PARENT_PREFIX}${id}`} module="./parent-client.tsx" width="100%" props={props} />,
      lines,
    }
  }
  const terminalName = (
    id: string,
    name: TerminalSpan,
    stall: StatusStall | null,
    depth: number,
    chevron: string,
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
              {chevronButton(id, chevron)}
            </Box>
          </Box>
        </Box>
      ),
      lines: exactly(Math.max(1, lines.length)),
    }
  }
  /** `name`'s line, with the chevron of a parent folded or open over `foldCount` rows. */
  const parentName = (
    id: string,
    name: TerminalSpan,
    stall: StatusStall | null,
    depth: number,
    fold: { isCollapsed: boolean; count: number },
  ): Drawn => {
    const chevron = parentChevron(fold.isCollapsed, fold.count)

    return look === 'desktop'
      ? desktopName(id, name, stall, depth, chevron)
      : terminalName(id, name, stall, depth, chevron)
  }

  return { parentName }
}

export type PaneStatusParent = ReturnType<typeof paneStatusParent>
