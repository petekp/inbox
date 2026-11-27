import { rowsIn, settledIn } from '../../core/view/action-plan'
import { bannerOf, isResumable, READING_TEXT, stopBanner } from '../../core/view/banners'
import { DESKTOP_CHARS_PER_CELL } from './desktop-metrics'
import { EMPTY_STATE_MAX_WIDTH_PT } from '../../core/view/layout'
import { emptyTab, type EmptyTab } from '../../core/view/empty-tab'
import { FINDING_GROUPS, RUNNING_MARK } from '../../core/view/help'
import { RUNNING_SVG_CELLS } from './desktop-svg'
import { READ_FAILED_TEXT } from '../mod/mod-sessions'
import { sessionState } from '../mod/mod-state'
import type { Entry, PaneBase, PaneHandlers, Row } from './pane-context'
import type { PaneFrame } from './pane-frame'
import { partSpace } from './pane-part-space'
import { childPos, type PaneRowLines } from './pane-row-lines'
import type { PaneRowParts } from './pane-row-parts'
import type { PaneRows } from './pane-rows'
import { DESKTOP_CELL_PT, ROW_COLUMNS } from './pane-sizes'
import {
  closedShown,
  closedTotal,
  DOT,
  openMark,
  replyHint,
  resumeLabel,
  ROW_COPY,
  rowTitle,
  type RowView,
  waitingCount,
} from '../../core/view/rows'
import { closedLineView } from '../../core/view/closed-line'
import { type TerminalSpan, terminalTextLines } from './terminal-text'
import { ago } from '../../core/domain/text'

export function paneAskRows(
  {
    now,
    look,
    isInline,
    Text,
    pal,
    optionsShown,
    Box,
    terminalText,
    inlineText,
  }: Pick<
    PaneBase,
    'now' | 'look' | 'isInline' | 'Text' | 'pal' | 'optionsShown' | 'Box' | 'terminalText' | 'inlineText'
  >,
  { rowKeyActions }: Pick<PaneHandlers, 'rowKeyActions'>,
) {
  const itemRow = (r: RowView): Row => {
    const asked = r.at === null ? undefined : `${DOT}${ago(now - r.at)}`
    const isHandedOff = r.state.is === 'handedOff'
    const isAsk = r.state.is === 'open'
    const mark = look === 'terminal' && isAsk ? openMark(r) : null

    return {
      id: r.id,
      view: r,
      handle: look === 'terminal' && r.type !== 'finding' ? (mark?.text ?? ' ') : '',
      ...(mark?.tone ? { handleTone: mark.tone } : {}),
      ...(isHandedOff ? { fold: {} } : {}),
      title: rowTitle(r, look),
      titleAfter: asked,
      ...(r.at === null ? {} : { at: r.at }),
      body: null,
      optionKeys: () => rowKeyActions(r, optionsShown.includes(r.id)).options,
      answerRow: () => rowKeyActions(r, optionsShown.includes(r.id)).answerRow,
      keys: () => rowKeyActions(r, optionsShown.includes(r.id)).keys,
      moreKeys: () => rowKeyActions(r, optionsShown.includes(r.id)).more,
      typeHint: replyHint(r, 'Claude'),
    }
  }
  const findingBody = (detail: string, path: string | null, fitted?: TerminalSpan[][]) => (
    <Box flexDirection="column" rowGap={partSpace(look, isInline)('detail', 'file')}>
      <Box key="detail">
        <Text wrap="wrap">{fitted ? terminalText(fitted) : inlineText(detail)}</Text>
      </Box>
      {path ? (
        <Box key="file">
          <Text wrap="wrap">
            <Text color={pal.muted}>{ROW_COPY.relevantFile}</Text>
            <Text color="permission">{path}</Text>
          </Text>
        </Box>
      ) : null}
    </Box>
  )
  const findingRow = (r: RowView): Row => ({
    id: r.id,
    view: r,
    at: r.at ?? undefined,
    handle: '',
    ...(r.state.is === 'handedOff' ? { fold: {} } : {}),
    title: r.title,
    titleAfter: `${DOT}${ago(now - (r.at ?? now))}`,
    line: { text: r.title },
    body: findingBody(r.detail ?? '', r.fileName),
    bodyEnd: r.fileName ? 'file' : 'detail',
    clippedBody: (lines, width) =>
      lines < 1
        ? null
        : findingBody(
            r.detail ?? '',
            lines > 1 ? r.fileName : null,
            terminalTextLines(r.detail ?? '', width, Math.max(1, lines - (r.fileName && lines > 1 ? 1 : 0))),
          ),
    typeHint: replyHint(r, 'Claude'),
    keys: () => rowKeyActions(r, true).keys,
    moreKeys: () => rowKeyActions(r, true).more,
  })

  return { itemRow, findingRow }
}

export function paneAskTabs(
  {
    listColumns,
    look,
    isInline,
    Box,
    Text,
    blankLine,
    pal,
    needsYouGroups,
    view,
    isUnread,
    unfolded,
    closedAll,
    Button,
    stop,
    glued,
    now,
    findingEntries,
    lists,
    divided,
    listRow,
    isRowOpen,
    settledRow,
    closedFold,
    section,
    groupTitle,
    titleGap,
    groupEmpty,
    sections,
    banner,
    runningDot,
  }: Pick<
    PaneBase,
    | 'listColumns'
    | 'look'
    | 'isInline'
    | 'Box'
    | 'Text'
    | 'blankLine'
    | 'pal'
    | 'needsYouGroups'
    | 'view'
    | 'isUnread'
    | 'unfolded'
    | 'closedAll'
    | 'Button'
    | 'stop'
    | 'glued'
    | 'now'
    | 'findingEntries'
    | 'lists'
  > &
    Pick<PaneRowLines, 'divided' | 'runningDot'> &
    Pick<PaneRows, 'listRow' | 'isRowOpen'> &
    Pick<
      PaneRowParts,
      'settledRow' | 'closedFold' | 'section' | 'groupTitle' | 'titleGap' | 'groupEmpty' | 'sections'
    > &
    Pick<PaneFrame, 'banner'>,
  { readAgain, resume }: Pick<PaneHandlers, 'readAgain' | 'resume'>,
) {
  /** A tab's empty state from `emptyTab`, centred in the docked pane, with `below`, its drawn `under`, under it. */
  const emptyState = ({ title, hint, titleMark }: EmptyTab, below: JSX.Element[] = []) => {
    const text = hint ?? ''
    const wrap = (width: number) => {
      const lines: string[] = []
      for (const word of text.split(' ').filter(Boolean)) {
        const last = lines.at(-1)
        if (last !== undefined && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`
        else lines.push(word)
      }

      return lines
    }
    const room = listColumns - 4
    const desktopMost = Math.floor((EMPTY_STATE_MAX_WIDTH_PT / DESKTOP_CELL_PT) * DESKTOP_CHARS_PER_CELL)
    const most =
      look === 'desktop' ? Math.min(desktopMost, Math.floor(room * DESKTOP_CHARS_PER_CELL)) : Math.min(46, room)
    const count = wrap(most).length
    let width = Math.ceil(text.length / Math.max(count, 1))
    while (width < most && wrap(width).length > count) width++
    const lines = wrap(width)
    const mostCells = look === 'desktop' ? Math.floor(most / DESKTOP_CHARS_PER_CELL) : most
    const align = isInline ? 'flex-start' : 'center'

    return (
      <Box flexDirection="column" flexGrow={1} justifyContent={align} alignItems={align}>
        <Box flexDirection="column" alignItems={align} paddingLeft={isInline ? 1 : 0}>
          {titleMark ? (
            <Box flexDirection="row" gap={1}>
              <Text bold>{title}</Text>
              {emptyTitleMark(titleMark.isRunning)}
            </Box>
          ) : (
            <Text bold>{title}</Text>
          )}
          {lines.length > 0 ? (
            <Box flexDirection="column" alignItems={align} marginTop={blankLine}>
              {lines.map(line => (
                <Text color={pal.muted}>{line}</Text>
              ))}
            </Box>
          ) : null}
          {below.length > 0 ? (
            <Box flexDirection="column" alignItems={align} width={mostCells} marginTop={blankLine}>
              {below}
            </Box>
          ) : null}
        </Box>
      </Box>
    )
  }
  /** The running mark after an empty tab's title while the inbox checks the asks, or its place while it does not. */
  const emptyTitleMark = (isRunning: boolean) =>
    isRunning ? (
      runningDot('empty-title', RUNNING_MARK, pal.muted)
    ) : (
      <Box width={look === 'desktop' ? RUNNING_SVG_CELLS : 1} height={1} flexShrink={0} />
    )
  /** Whether a list's last entry is a row that draws open, so the Closed fold under it takes no blank row of its own. */
  const isLastRowOpen = (entries: Entry[]) => {
    const last = entries.at(-1)
    return last !== undefined && 'row' in last && isRowOpen(last.row.id)
  }
  const needsYouView = () => {
    const groups = needsYouGroups.flatMap(g => {
      const { entries } = g
      const closed = closedShown(view.needsYou.closed[g.list], settledIn(entries), closedAll.includes(g.kind)).map(d =>
        closedLineView(d),
      )
      if (isUnread) return []
      const isUnfolded = unfolded.includes(g.kind)
      const open = divided(
        entries.map((x, n) =>
          'row' in x ? listRow(x.row, childPos(n, entries.length)) : settledRow(x, childPos(n, entries.length)),
        ),
        g.kind,
        ROW_COLUMNS.tree.handleAt,
      )
      const tail = closedFold(
        g.kind,
        closed,
        closedTotal(view.needsYou.closed[g.list], settledIn(entries)),
        isUnfolded,
        isLastRowOpen(entries),
      )

      return [
        section([
          groupTitle(g.title, waitingCount(g.rows.map(r => r.view)), g.mark),
          ...titleGap(),
          ...(open.length > 0 ? open : [groupEmpty(g.title)]),
          ...tail,
        ]),
      ]
    })
    const drawn = needsYouGroups.reduce(
      (sum, g) => sum + g.entries.length + closedTotal(view.needsYou.closed[g.list], settledIn(g.entries)),
      0,
    )
    const unread = isUnread
      ? [
          section(
            banner(bannerOf('read-failed', READ_FAILED_TEXT), {
              ...(sessionState.isReadingAgain ? { lead: <Text color={pal.muted}>{READING_TEXT}</Text> } : {}),
              action: <Button key="read-again" label="Try again" onPress={() => void readAgain()} />,
            }),
          ),
        ]
      : []
    const hasBlocker = stop !== null || isUnread
    const empty = emptyTab(view, { tab: 'needsYou', agent: 'Claude', drawn, hasBlocker })
    if (empty) return emptyState(empty)
    const outside = stop
      ? [
          section(
            banner(stopBanner(stop), {
              after: <Text color={pal.muted}>{glued(`${DOT}${ago(now - stop.at)}`)}</Text>,
              isBodyBelow: true,
              extra:
                sessionState.resuming?.is === 'refused' ? (
                  <Text color={pal.tone.error} wrap="wrap">
                    Not sent: {sessionState.resuming.why}
                  </Text>
                ) : null,
              action: isResumable(stop) ? (
                <Button
                  key="resume"
                  label={resumeLabel(sessionState.resuming?.is === 'sending')}
                  onPress={() => void resume()}
                />
              ) : null,
            }),
          ),
        ]
      : []

    return sections([...outside, ...unread, ...(drawn > 0 ? groups : [])])
  }
  const findingsView = () => {
    const settled = settledIn(findingEntries)
    const drawn = findingEntries.length + closedTotal(view.findings.closed, settled)
    const empty = emptyTab(view, { tab: 'findings', agent: 'Claude', drawn, hasBlocker: false })
    if (empty) return emptyState(empty)
    const groups = lists.findingGroups.map(g => {
      const closedOf = view.findings.closed.filter(f => f.kind === g.kind)
      const closed = closedShown(closedOf, settled, closedAll.includes(g.kind)).map(f => closedLineView(f))
      return section([
        groupTitle(g.title, waitingCount(rowsIn(g.entries).map(r => r.view)), FINDING_GROUPS[g.kind]),
        ...titleGap(),
        ...(g.entries.length === 0 ? [groupEmpty(g.title)] : []),
        ...divided(
          g.entries.map((x, n) =>
            'row' in x ? listRow(x.row, childPos(n, g.entries.length)) : settledRow(x, childPos(n, g.entries.length)),
          ),
          g.kind,
          ROW_COLUMNS.tree.handleAt,
        ),
        ...closedFold(
          g.kind,
          closed,
          closedTotal(closedOf, settled),
          unfolded.includes(g.kind),
          isLastRowOpen(g.entries),
          ROW_COLUMNS.tree.handleAt,
        ),
      ])
    })

    return sections(groups)
  }

  return { emptyState, needsYouView, findingsView }
}

export type PaneAskTabs = ReturnType<typeof paneAskTabs>
