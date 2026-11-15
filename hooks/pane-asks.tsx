import { rowsIn, settledIn } from './action-plan'
import { bannerOf, emptyText, isResumable, READING_TEXT, stopBanner } from './banners'
import { isMaybeStale } from './band'
import { DESKTOP_CHARS_PER_CELL } from './desktop-metrics'
import { FINDING_GROUPS, HELD_MARK } from './help'
import { linkLabel } from './inline'
import { safeDocumentMarkdown } from './pane-document'
import { READ_FAILED_TEXT } from './mod-sessions'
import { sessionState } from './mod-state'
import type { PaneBase, PaneHandlers, Row } from './pane-context'
import type { PaneFrame } from './pane-frame'
import { childPos, holdsUpLineOf, type PaneRowLines } from './pane-row-lines'
import type { PaneRowParts } from './pane-row-parts'
import type { PaneRows } from './pane-rows'
import { ROW_COLUMNS } from './pane-sizes'
import {
  closedShown,
  closedTotal,
  closedHistoryPlan,
  documentPreviewLine,
  DOT,
  replyHint,
  resumeLabel,
  ROW_COPY,
  rowTitle,
  type RowView,
  waitingCount,
} from './rows'
import { type TerminalSpan, terminalTextLines } from './terminal-text'
import { ago } from './text'

export function clippedDocumentPreview(preview: string | null, width: number, lines: number) {
  const spans = preview ? terminalTextLines(preview, width, lines) : []
  return { spans, bodyLines: Math.max(0, lines - spans.length) }
}

export function paneAskRows(
  {
    now,
    look,
    Text,
    pal,
    optionsShown,
    Box,
    blankLine,
    terminalText,
    inlineText,
  }: Pick<
    PaneBase,
    'now' | 'look' | 'Text' | 'pal' | 'optionsShown' | 'Box' | 'blankLine' | 'terminalText' | 'inlineText'
  >,
  { rowKeyActions }: Pick<PaneHandlers, 'rowKeyActions'>,
) {
  const itemRow = (r: RowView): Row => {
    const asked = r.at === null ? undefined : `${DOT}${ago(now - r.at)}`
    const isHandedOff = r.state.is === 'handedOff'
    const holdsUpLine = holdsUpLineOf(r)
    const holdsUp = holdsUpLine ? (
      <Text key="holds-up" color={pal.muted} wrap="wrap">
        <Text color={pal.mark[HELD_MARK.tone]}>{`${HELD_MARK.mark} `}</Text>
        {inlineText(holdsUpLine)}
      </Text>
    ) : null
    const recLine = r.recLine ? (
      <Text key="rec" color={pal.muted} wrap="wrap">
        {inlineText(r.recLine)}
      </Text>
    ) : null
    const contextLine = r.contextLine ? (
      <Text key="context" color={pal.muted} wrap="wrap">
        {inlineText(r.contextLine)}
      </Text>
    ) : null
    const subtitleLines = [contextLine, holdsUp, recLine].filter(line => line !== null)
    const preview = documentPreviewLine(r)

    return {
      id: r.id,
      view: r,
      handle: '',
      ...(isHandedOff ? { fold: {} } : {}),
      title: linkLabel(rowTitle(r, look)),
      titleContent: inlineText(rowTitle(r, look)),
      titleAfter: asked,
      ...(r.at === null ? {} : { at: r.at }),
      ...(subtitleLines.length > 1
        ? { subtitle: <Box flexDirection="column">{subtitleLines}</Box> }
        : subtitleLines.length === 1
          ? { subtitle: subtitleLines[0] }
          : {}),
      hasSecondLine: r.replyKind === 'answer',
      body:
        r.detail || preview ? (
          <Box flexDirection="column" rowGap={blankLine}>
            {r.detail ? <Text wrap="wrap">{inlineText(r.detail)}</Text> : null}
            {preview ? (
              <Text wrap="wrap" color={pal.muted}>
                {preview}
              </Text>
            ) : null}
          </Box>
        ) : null,
      clippedBody: (lines, width) => {
        if (lines < 1 || (!r.detail && !preview)) return null
        const { spans: previewLines, bodyLines: detailLines } = clippedDocumentPreview(preview, width, lines)

        return (
          <Box flexDirection="column" rowGap={blankLine}>
            {r.detail && detailLines > 0 ? (
              <Text wrap="wrap">{terminalText(terminalTextLines(r.detail, width, detailLines))}</Text>
            ) : null}
            {previewLines.length > 0 ? (
              <Text wrap="wrap" color={pal.muted}>
                {terminalText(previewLines)}
              </Text>
            ) : null}
          </Box>
        )
      },
      keys: () => rowKeyActions(r, optionsShown.includes(r.id)).keys,
      moreKeys: () => rowKeyActions(r, optionsShown.includes(r.id)).more,
      typeHint: replyHint(r, 'Claude'),
    }
  }
  const findingBody = (
    detail: string,
    path: string | null,
    preview: string | TerminalSpan[][] | null,
    fitted?: TerminalSpan[][],
  ) => (
    <Box flexDirection="column" rowGap={blankLine}>
      <Text wrap="wrap">{fitted ? terminalText(fitted) : inlineText(detail)}</Text>
      {path ? (
        <Text wrap="wrap">
          <Text color={pal.muted}>{ROW_COPY.relevantFile}</Text>
          <Text color="permission">{path}</Text>
        </Text>
      ) : null}
      {preview ? (
        <Text wrap="wrap" color={pal.muted}>
          {Array.isArray(preview) ? terminalText(preview) : preview}
        </Text>
      ) : null}
    </Box>
  )
  const findingRow = (r: RowView): Row => ({
    id: r.id,
    view: r,
    at: r.at ?? undefined,
    handle: '',
    ...(r.state.is === 'handedOff' ? { fold: {} } : {}),
    title: linkLabel(r.title),
    titleContent: inlineText(r.title),
    titleAfter: `${DOT}${ago(now - (r.at ?? now))}`,
    line: { text: linkLabel(r.title) },
    body: findingBody(r.detail ?? '', r.fileName, documentPreviewLine(r)),
    clippedBody: (lines, width) => {
      if (lines < 1) return null
      const path = r.fileName && lines > 1 ? r.fileName : null
      const { spans: previewLines, bodyLines: detailLines } = clippedDocumentPreview(
        lines > 2 ? documentPreviewLine(r) : null,
        width,
        lines - (path ? 1 : 0),
      )

      return findingBody(
        r.detail ?? '',
        path,
        previewLines.length > 0 ? previewLines : null,
        terminalTextLines(r.detail ?? '', width, detailLines),
      )
    },
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
    Button,
    Markdown,
    Text,
    blankLine,
    pal,
    needsYouGroups,
    view,
    isUnread,
    unfolded,
    closedAll,
    stop,
    glued,
    now,
    findingEntries,
    lists,
    divided,
    listRow,
    settledRow,
    closedFold,
    section,
    groupTitle,
    titleGap,
    groupEmpty,
    sections,
    banner,
  }: Pick<
    PaneBase,
    | 'listColumns'
    | 'look'
    | 'isInline'
    | 'Box'
    | 'Markdown'
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
    Pick<PaneRowLines, 'divided'> &
    Pick<PaneRows, 'listRow'> &
    Pick<
      PaneRowParts,
      'settledRow' | 'closedFold' | 'section' | 'groupTitle' | 'titleGap' | 'groupEmpty' | 'sections'
    > &
    Pick<PaneFrame, 'banner'>,
  {
    readAgain,
    resume,
    closeDocument,
    document,
  }: Pick<PaneHandlers, 'readAgain' | 'resume'> & {
    closeDocument: () => void
    document: { title: string; text: string | null; error: string | null } | null
  },
) {
  const documentView = () =>
    document ? (
      <Box flexDirection="column" flexGrow={1} rowGap={blankLine}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text bold>{document.title}</Text>
          <Button key="document-back" label="Back to inbox" onPress={closeDocument} />
        </Box>
        {document.error ? (
          <Text color={pal.tone.error ?? pal.mark.error} wrap="wrap">
            {document.error}
          </Text>
        ) : document.text === null ? (
          <Text dimColor>Opening report…</Text>
        ) : document.text ? (
          <Markdown key="document-report" text={safeDocumentMarkdown(document.text, true)} />
        ) : null}
      </Box>
    ) : null
  /** A tab's empty text, centred in the pane, with `below` under it. */
  const emptyState = ({ title, hint: text = '' }: { title: string; hint?: string }, below: JSX.Element[] = []) => {
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
    const most = Math.min(46, look === 'desktop' ? Math.floor(room * DESKTOP_CHARS_PER_CELL) : room)
    const count = wrap(most).length
    let width = Math.ceil(text.length / Math.max(count, 1))
    while (width < most && wrap(width).length > count) width++
    const lines = wrap(width)
    const mostCells = look === 'desktop' ? Math.floor(most / DESKTOP_CHARS_PER_CELL) : most
    const align = isInline ? 'flex-start' : 'center'

    return (
      <Box flexDirection="column" flexGrow={1} justifyContent={align} alignItems={align}>
        <Box flexDirection="column" alignItems={align} paddingLeft={isInline ? 1 : 0}>
          <Text bold>{title}</Text>
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
  const needsYouView = () => {
    const groups = needsYouGroups.flatMap(g => {
      const { entries } = g
      const closed = closedShown(view.needsYou.closed[g.list], settledIn(entries), closedAll.includes(g.kind))
      const history = closedHistoryPlan(view.needsYou.closed[g.list], settledIn(entries))
      if (isUnread) return []
      const isUnfolded = unfolded.includes(g.kind)
      const open = divided(
        entries.map((x, n) =>
          'row' in x ? listRow(x.row, childPos(n, entries.length)) : settledRow(x, childPos(n, entries.length)),
        ),
        g.kind,
        ROW_COLUMNS.tree.handleAt,
      )
      const tail = closedFold(g.kind, closed, history.total, isUnfolded)

      return [
        section([
          groupTitle(g.title, waitingCount(g.rows.map(r => r.view))),
          ...titleGap(),
          ...(open.length > 0 ? open : [groupEmpty(g.title)]),
          ...tail,
        ]),
      ]
    })
    const isNothing = needsYouGroups.every(
      g => g.entries.length === 0 && closedTotal(view.needsYou.closed[g.list], settledIn(g.entries)) === 0,
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
    if (isNothing && !stop && unread.length === 0)
      return emptyState(emptyText('needsYou', 'Claude', isMaybeStale(view, isUnread)))
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

    return sections([...outside, ...unread, ...groups])
  }
  const findingsView = () => {
    const settled = settledIn(findingEntries)
    if (findingEntries.length === 0 && closedTotal(view.findings.closed, settled) === 0)
      return emptyState(emptyText('findings', 'Claude', isMaybeStale(view, isUnread)))
    const groups = lists.findingGroups.map(g => {
      const closedOf = view.findings.closed.filter(f => f.kind === g.kind)
      const history = closedHistoryPlan(closedOf, settled)
      const closed = closedShown(closedOf, settled, closedAll.includes(g.kind)).map(f => ({
        id: f.id,
        how: f.how,
        ask: f.title,
        at: f.closedAt,
        outcomeLabel: f.outcomeLabel,
        delivery: f.delivery,
        mark: f.mark,
      }))
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
        ...closedFold(g.kind, closed, history.total, unfolded.includes(g.kind)),
      ])
    })

    return sections(groups)
  }

  return { emptyState, needsYouView, findingsView, documentView }
}

export type PaneAskTabs = ReturnType<typeof paneAskTabs>
