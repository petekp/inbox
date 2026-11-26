import type { UiPressArgument } from 'claude-code'
import type { PrCheck, PrThread, PrView } from '../../types'
import { bannerOf } from '../../core/view/banners'
import { emptyTab } from '../../core/view/empty-tab'
import type { PaneAskTabs } from './pane-asks'
import type { PaneBase, PaneHandlers, Row } from './pane-context'
import type { PaneFrame } from './pane-frame'
import { ACTION_GLYPHS, type KeyAction, PR_KEYS } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import { childPos, type PaneRowLines } from './pane-row-lines'
import type { PaneRowParts } from './pane-row-parts'
import type { PaneRows } from './pane-rows'
import { OTHER_PRS_TEXT, otherPrsStart } from '../../core/view/pr-order'
import type { PrAction, PrPress } from '../../core/view/pr-press'
import {
  checkRowText,
  ghNoticeOf,
  PR_GROUP_TITLES,
  PR_QUOTE_CHARS,
  PR_TONES,
  prCheckId,
  prMarkId,
  prRefreshFailedText,
  prSyncOf,
  prThreadId,
  shownReadiness,
  PR_REFRESH_ID,
  RANK_AGAIN_ID,
  CLEAR_FINISHED_ID,
  splitFollowUps,
  threadRowText,
  isBlockPressShown,
} from '../../core/view/pr-rows'
import { checkActions, prBlockActions, threadActions } from '../../core/view/pr-tab'
import { type DrawnPr, isDismissed } from '../../core/view/pr-views'
import { checkKey, commentLine, commentParts, readableComment, threadWhere } from '../../core/domain/prs'
import { DOT, settledLabel, settledMark, type SettledState } from '../../core/view/rows'
import { desktopTextPt } from './desktop-metrics'
import { glued, lineCount, partedLines, statusAfterTitle, terminalTextLines } from './terminal-text'
import { cellWidth, clipLabel } from '../../core/domain/text'
import { runningMark } from '../../core/view/timing'
import { prStoppedWarningOf } from '../../core/view/feedback'
import { partSpace } from './pane-part-space'

export function panePrRows(
  {
    Text,
    pal,
    presses,
    Link,
    Box,
    Markdown,
    terminalText,
    lastActions,
    look,
    now,
  }: Pick<
    PaneBase,
    'Text' | 'pal' | 'presses' | 'Link' | 'Box' | 'Markdown' | 'terminalText' | 'lastActions' | 'look' | 'now'
  >,
  { runPress }: Pick<PaneHandlers, 'runPress'>,
) {
  const prPress = (p: PrPress) => (press: UiPressArgument) => runPress(p, press)
  const prKeyAction = (a: PrAction, row: string): KeyAction => {
    // A failed send's Try again repeats its button's press, so it needs a key of its own.
    const isResend = a.isRetry === true

    return {
      key: `${isResend ? 'retry' : PR_KEYS[a.press.action]}-${row}`,
      label: a.label,
      emphasis: a.emphasis,
      kind: a.kind,
      ...(a.icon ? { icon: ACTION_GLYPHS[a.icon] } : {}),
      ...(a.hotkey ? { hotkey: a.hotkey } : {}),
      isOut: a.isOut,
      onPress: prPress(a.press),
    }
  }
  const checkRow = (pr: PrView, c: PrCheck): Row => {
    const { mark, lead, title, meta, fold } = checkRowText(pr, c)
    return {
      id: prCheckId(pr, c),
      ...(fold ? { fold } : {}),
      handle: mark.text,
      handleTone: mark.tone ?? undefined,
      isMarkDone: mark.isDone,
      title,
      ...(c.finishedAt !== undefined ? { at: c.finishedAt } : {}),
      line: { ...(lead ? { before: `${lead} / ` } : {}), text: title, after: meta },
      subtitle: <Text color={pal.muted}>{lead ? `${lead}${DOT}${meta}` : meta}</Text>,
      body: null,
      keys: () => checkActions(pr, c, presses).actions.map(a => prKeyAction(a, `${pr.ref}-${checkKey(c)}`)),
    }
  }
  const threadRow = (pr: PrView, t: PrThread): Row => {
    const id = prThreadId(pr, t)
    const { rest } = commentParts(t.body)
    /** The thread's file and line, then its author, on the same line when both `fits` one line. */
    const where = (fits: ((text: string) => boolean) | null) => {
      const link = (
        <Link href={t.reply?.url || t.url}>
          <Text underline>{threadWhere(t)}</Text>
        </Link>
      )
      const author = `${DOT}@${t.author}`
      const by = fits === null ? null : statusAfterTitle(author, threadWhere(t), fits)

      return by?.isUnder ? (
        <Box flexDirection="column">
          <Text color={pal.muted} wrap="wrap">
            {link}
          </Text>
          <Text color={pal.muted}>{by.text}</Text>
        </Box>
      ) : (
        <Text color={pal.muted} wrap="wrap">
          {link}
          {by ? by.text : author}
        </Text>
      )
    }
    const commentAt = (fits: ((text: string) => boolean) | null) => (
      <Box flexDirection="column">
        {rest ? <Markdown text={clipLabel(rest, PR_QUOTE_CHARS)} /> : null}
        {where(fits)}
        {t.reply ? (
          <Markdown text={`**@${t.reply.author}:** ${clipLabel(readableComment(t.reply.body), PR_QUOTE_CHARS)}`} />
        ) : null}
      </Box>
    )
    const replyText = t.reply ? `@${t.reply.author}: ${readableComment(t.reply.body)}` : ''
    const clippedComment = (lines: number, width: number) => {
      if (lines < 1) return null
      const restLines = terminalTextLines(rest, width).length
      const replyLines = terminalTextLines(replyText, width).length
      const rawTextLines = lineCount(rest, width) + 1 + lineCount(replyText, width)
      const fits = (text: string) => cellWidth(text) <= width
      if (rawTextLines <= lines && restLines + 1 + replyLines <= lines) return commentAt(fits)
      const restShown = Math.min(restLines, lines - 1)
      const replyShown = Math.min(replyLines, lines - 1 - restShown)

      return (
        <Box flexDirection="column">
          {rest && restShown > 0 ? (
            <Text wrap="wrap">{terminalText(terminalTextLines(rest, width, restShown))}</Text>
          ) : null}
          {where(fits)}
          {replyShown > 0 ? (
            <Text wrap="wrap">{terminalText(terminalTextLines(replyText, width, replyShown))}</Text>
          ) : null}
        </Box>
      )
    }
    const text = threadRowText(pr, t, lastActions)
    const actions = splitFollowUps(threadActions(pr, t, presses).actions)

    return {
      id,
      handle: text.mark.isRunning && look !== 'desktop' ? runningMark(now) : text.mark.text,
      handleTone: text.mark.tone ?? undefined,
      ...(text.mark.isRunning ? { isHandleRunning: true } : {}),
      isMarkDone: text.mark.isDone,
      ...(text.fold ? { fold: text.fold } : {}),
      title: text.title,
      ...(t.at === null ? {} : { at: t.at }),
      line: {
        before: '',
        text: commentLine(t.body),
        after: text.meta,
      },
      body: commentAt(null),
      bodyAt: commentAt,
      clippedBody: clippedComment,
      keys: () => actions.keys.map(a => prKeyAction(a, t.id)),
      moreKeys: () => actions.more.map(a => prKeyAction(a, t.id)),
    }
  }

  return { prKeyAction, checkRow, threadRow }
}

type PanePrRows = ReturnType<typeof panePrRows>

export function panePrBlocks({
  look,
  isInline,
  pal,
  Text,
  Box,
  blankLine,
  isThreadSent,
  isSendHeld,
  lastActions,
  prState,
  presses,
  space,
  Button,
  view,
  prOrderKeys,
  prRefreshKeys,
  prClearKeys,
  prGroups,
  section,
  undoPlace,
  settledContent,
  groupTitle,
  titleGap,
  sections,
  desktopFrame,
  markGlyph,
  divided,
  pressLine,
  feedbackLabel,
  listRow,
  prKeyAction,
  desktopLabel,
  desktopRowTextPt,
  listColumns,
  keyRow,
  emptyState,
  banner,
}: Pick<
  PaneBase,
  | 'listColumns'
  | 'look'
  | 'isInline'
  | 'pal'
  | 'Text'
  | 'Box'
  | 'blankLine'
  | 'isThreadSent'
  | 'isSendHeld'
  | 'lastActions'
  | 'prState'
  | 'presses'
  | 'space'
  | 'Button'
  | 'view'
  | 'prOrderKeys'
  | 'prRefreshKeys'
  | 'prClearKeys'
  | 'prGroups'
> &
  Pick<PaneRowParts, 'section' | 'undoPlace' | 'settledContent' | 'groupTitle' | 'titleGap' | 'sections'> &
  Pick<PaneRowFrame, 'desktopFrame'> &
  Pick<PaneRowLines, 'markGlyph' | 'divided' | 'pressLine' | 'feedbackLabel'> &
  Pick<PaneRows, 'listRow'> &
  Pick<PanePrRows, 'prKeyAction'> &
  Pick<PaneRowKeys, 'desktopLabel' | 'desktopRowTextPt' | 'keyRow'> &
  Pick<PaneAskTabs, 'emptyState'> &
  Pick<PaneFrame, 'banner'>) {
  const settledPrBlock = (pr: PrView, state: SettledState) => {
    const what = `#${pr.number} ${pr.title}`
    const undo: PrPress | null = state.canUndo ? { action: 'pr-undo', ref: pr.ref } : null
    const key = `settled-pr:${pr.ref}`
    const mark = settledMark(state)
    if (look === 'desktop')
      return section(
        desktopFrame({
          key,
          mark: markGlyph(mark, key, pal.muted),
          side: undoPlace(prMarkId(pr.ref), undo, state.at, state.offersUndo),
          padY: 0,
          isSideCentered: true,
          children: [
            <Text wrap="wrap">
              {what}
              <Text color={pal.muted}>{`${DOT}${settledLabel(state.label, state.delivery, state.reply)}`}</Text>
            </Text>,
          ],
        }),
      )

    return section(
      <Box key={key} paddingLeft={1}>
        {settledContent(what, state, undo, mark, listColumns - 2)}
      </Box>,
    )
  }
  const prRowGroup = (title: string, group: Row[], key: string) =>
    group.length === 0
      ? []
      : [
          <Box key={`group-${key}`} marginTop={blankLine}>
            {groupTitle(title, group.length, undefined, true)}
          </Box>,
          ...titleGap(),
          ...divided(
            group.map((r, n) => listRow(r, childPos(n, group.length))),
            key,
          ),
        ]
  const prBlock = (b: DrawnPr & { rows: Row[]; checks: Row[]; cancelled: Row[]; threads: Row[] }) => {
    if (b.state.is === 'settled') return settledPrBlock(b.pr, b.state)
    const { pr, checks, cancelled, threads } = b
    const sync = prSyncOf(view.sync, pr.ref)
    const shown = shownReadiness(pr, sync, isThreadSent, 'Claude')
    const statusHead = shown?.head ?? ''
    const tone = shown ? PR_TONES[shown.status] : null
    const isPrLastShown = !isDismissed(lastActions, pr.ref) && isBlockPressShown(pr, lastActions)
    const prLast = isPrLastShown ? pressLine(prMarkId(pr.ref)) : null
    const prActions = prBlockActions(pr, isThreadSent, prState.branchRef, presses, sync).actions.map(a =>
      prKeyAction(a, pr.ref),
    )
    const shownPress = isPrLastShown ? (feedbackLabel(prMarkId(pr.ref))?.text ?? null) : null
    const warning = prStoppedWarningOf(isSendHeld, prActions, shownPress)

    const fits = (text: string) =>
      look === 'desktop' ? desktopTextPt(text) <= desktopRowTextPt : cellWidth(text) <= listColumns - 2
    const statusParts = shown ? [shown.head, ...shown.unlisted] : []
    const isStatusBeside =
      statusParts.length > 0 && fits(`#${pr.number}\u2002${pr.title}\u2002${statusParts.join(DOT)}`)
    const statusLines =
      statusParts.length === 0 ? [] : isStatusBeside ? [statusParts.join(glued(DOT))] : partedLines(statusParts, fits)
    const besideLine = isStatusBeside ? statusLines[0] : undefined
    const statusText = (line: string, n: number) => [
      <Text color={tone ? (pal.tone[tone] ?? pal.mark[tone]) : pal.muted}>
        {n === 0 ? line.slice(0, statusHead.length) : ''}
      </Text>,
      <Text color={pal.muted}>{n === 0 ? line.slice(statusHead.length) : line}</Text>,
    ]
    const titleLine = (
      <Box flexDirection="column">
        <Text wrap="wrap">
          <Text color={look === 'desktop' ? pal.mark.prs : pal.tone.prs}>{`#${pr.number}\u2002`}</Text>
          <Text bold>{pr.title}</Text>
          {besideLine === undefined ? null : ['\u2002', ...statusText(besideLine, 0)]}
        </Text>
        {isStatusBeside ? null : statusLines.map((line, n) => <Text wrap="wrap">{statusText(line, n)}</Text>)}
      </Box>
    )
    const statusBlock = (
      <Box flexDirection="column">
        {pr.error ? (
          <Box flexDirection="column">
            <Text color={pal.tone.error} wrap="wrap">
              {prRefreshFailedText(pr.error)}
            </Text>
          </Box>
        ) : null}
        {warning ? (
          <Box marginTop={blankLine}>
            <Text color={pal.tone.error} wrap="wrap">
              {warning}
            </Text>
          </Box>
        ) : null}
        <Box
          flexDirection="row"
          flexWrap="wrap"
          columnGap={space.buttonGap}
          rowGap={look === 'desktop' ? 1 : 0}
          marginTop={warning ? partSpace(look, isInline)('status', 'buttons') : blankLine}
        >
          {prActions.map(a =>
            a.emphasis === 'quiet' ? (
              <Button key={a.key} plain dimColor label={a.label} onPress={a.onPress} />
            ) : look === 'desktop' ? (
              <Button
                key={a.key}
                label={desktopLabel(a)}
                {...(a.emphasis === 'primary' ? { variant: 'primary' as const } : {})}
                {...(a.isOut ? { dimColor: true } : {})}
                onPress={a.onPress}
              />
            ) : (
              <Button key={a.key} label={a.label} {...(a.isOut ? { dimColor: true } : {})} onPress={a.onPress} />
            ),
          )}
        </Box>
        {prLast ? <Box marginTop={look === 'desktop' ? 1 : 0}>{prLast}</Box> : null}
      </Box>
    )

    return section([
      ...(look === 'desktop'
        ? [
            desktopFrame({ key: `pr-title-${pr.ref}`, padY: 0, hasSide: false, children: titleLine }),
            desktopFrame({ key: `pr-status-${pr.ref}`, padY: 0, hasSide: false, children: statusBlock }),
          ]
        : [<Box paddingLeft={1}>{titleLine}</Box>, <Box paddingLeft={1}>{statusBlock}</Box>]),
      ...prRowGroup(PR_GROUP_TITLES.threads, threads, `${pr.ref}-threads`),
      ...prRowGroup(PR_GROUP_TITLES.checks, checks, `${pr.ref}-checks`),
      ...prRowGroup(PR_GROUP_TITLES.cancelled, cancelled, `${pr.ref}-cancelled`),
    ])
  }
  const ghNotice = ghNoticeOf(view.prs.gh)
  const prTabLine = (key: string, content: JSX.Element) => [
    section(
      look === 'desktop' ? desktopFrame({ key, padY: 0, children: content }) : <Box paddingLeft={1}>{content}</Box>,
    ),
  ]
  const mutedLine = (text: string) => (
    <Text color={pal.muted} wrap="wrap">
      {text}
    </Text>
  )
  const olderPrs = () => (view.prs.olderText ? prTabLine('older-prs', mutedLine(view.prs.olderText)) : [])
  /** The muted line above the first PR the agent's order does not rank, in that PR's section. */
  const otherPrsLine = () =>
    look === 'desktop' ? (
      desktopFrame({ key: 'other-prs', padY: 0, children: mutedLine(OTHER_PRS_TEXT) })
    ) : (
      <Box key="other-prs" paddingLeft={1} marginBottom={blankLine}>
        {mutedLine(OTHER_PRS_TEXT)}
      </Box>
    )
  const othersStart = otherPrsStart(prGroups)
  const prBlockIn = (g: (typeof prGroups)[number]) =>
    g === othersStart ? (
      <Box flexDirection="column" paddingTop={look === 'desktop' ? blankLine : 0}>
        {otherPrsLine()}
        {prBlock(g)}
      </Box>
    ) : (
      prBlock(g)
    )
  /** The order's title, the agent's reason under it, and the changed line with Rank again and its press status. */
  const prOrderLines = () => {
    const order = view.prs.order
    if (!order) return []
    const changed = order.changed
    const pressed = changed?.showsPress ? pressLine(RANK_AGAIN_ID) : null
    const lines = (
      <Box flexDirection="column">
        <Text wrap="wrap">{order.title}</Text>
        {order.why ? mutedLine(order.why) : null}
        {changed ? (
          <Box flexDirection="column" marginTop={look === 'desktop' ? 1 : 0}>
            <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={space.buttonGap}>
              {changed.text ? <Text wrap="wrap">{changed.text}</Text> : null}
              {prOrderKeys.length > 0 ? keyRow(RANK_AGAIN_ID, prOrderKeys) : null}
            </Box>
            {pressed}
          </Box>
        ) : null}
      </Box>
    )

    return prTabLine('pr-order', lines)
  }
  const refresh = view.prs.refresh
  const isRefreshInBanner = ghNotice !== null && refresh !== null && refresh.text === null
  const prRefreshButtons = () => (prRefreshKeys.length > 0 ? keyRow(PR_REFRESH_ID, prRefreshKeys) : null)
  const prRefreshStatus = () => {
    return refresh?.showsPress ? pressLine(PR_REFRESH_ID) : null
  }
  /**
   * The line under the notices while a PR could not be read: which ones, Refresh PRs, and its press status. While a
   * notice names the cause, the notice holds Refresh PRs and its status instead.
   */
  const prRefreshLines = () => {
    if (!refresh) return []
    const lines = (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={space.buttonGap}>
          {refresh.text ? <Text wrap="wrap">{refresh.text}</Text> : null}
          {prRefreshButtons()}
        </Box>
        {prRefreshStatus()}
      </Box>
    )

    return prTabLine('pr-refresh', lines)
  }
  const prClearLines = () =>
    prClearKeys.length === 0 ? [] : prTabLine('pr-clear', keyRow(CLEAR_FINISHED_ID, prClearKeys))
  const emptyPrs = emptyTab(view, {
    tab: 'prs',
    place: 'session',
    drawn: prGroups.length,
    isFetchingPrs: prState.isFetching,
  })
  const prsView = () =>
    emptyPrs ? (
      <Box flexDirection="column" flexGrow={1}>
        {emptyState(emptyPrs, emptyPrs.under?.is === 'pr-refresh' ? prRefreshLines() : [])}
      </Box>
    ) : (
      sections(
        [
          ...(ghNotice
            ? [
                section(
                  banner(
                    bannerOf(ghNotice.kind, ghNotice.text),
                    isRefreshInBanner ? { action: prRefreshButtons(), extra: prRefreshStatus() } : {},
                  ),
                ),
              ]
            : []),
          ...(isRefreshInBanner ? [] : prRefreshLines()),
          ...prClearLines(),
          ...prOrderLines(),
          ...prGroups.map(prBlockIn),
          ...olderPrs(),
        ],
        2,
      )
    )

  return { prsView }
}
