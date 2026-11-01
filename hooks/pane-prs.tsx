import type { UiPressArgument } from 'claude-code'
import type { PrCheck, PrThread, PrView } from '../types'
import { bannerOf } from './banners'
import type { PaneAskTabs } from './pane-asks'
import type { PaneBase, PaneHandlers, Row } from './pane-context'
import type { PaneFrame } from './pane-frame'
import { ACTION_GLYPHS, type KeyAction, PR_KEYS } from './pane-keys'
import type { PaneRowFrame } from './pane-row-frame'
import type { PaneRowKeys } from './pane-row-keys'
import { childPos, type PaneRowLines } from './pane-row-lines'
import type { PaneRowParts } from './pane-row-parts'
import type { PaneRows } from './pane-rows'
import { prRankText } from './pr-order'
import type { PrAction, PrPress } from './pr-press'
import {
  checkRowText,
  DISMISS_MERGED_ID,
  ghNoticeOf,
  PR_GROUP_TITLES,
  PR_QUOTE_CHARS,
  PR_TONES,
  prCheckId,
  prMarkId,
  prRefreshFailedText,
  prsEmptyText,
  prThreadId,
  RANK_AGAIN_ID,
  splitFollowUps,
  threadRowText,
} from './pr-rows'
import { checkActions, prBlockActions, threadActions } from './pr-tab'
import { type DrawnPr, isDismissed } from './pr-views'
import { commentLine, commentParts, readableComment, readiness, threadWhere } from './prs'
import { DOT, settledLabel, settledMark, type SettledState } from './rows'
import { lineCount, terminalTextLines } from './terminal-text'
import { clipLabel } from './text'
import { runningMark } from './timing'

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
  const prPress = (p: PrPress) => (press: UiPressArgument) => runPress(p, press.surface)
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
    const { mark, lead, title, meta } = checkRowText(c)
    return {
      id: prCheckId(pr, c),
      handle: mark.text,
      handleTone: mark.tone ?? undefined,
      isMarkDone: mark.isDone,
      title,
      ...(c.finishedAt !== undefined ? { at: c.finishedAt } : {}),
      line: { ...(lead ? { before: `${lead} / ` } : {}), text: title, after: meta },
      subtitle: <Text color={pal.muted}>{lead ? `${lead}${DOT}${meta}` : meta}</Text>,
      body: null,
      keys: () => checkActions(pr, c, presses).map(a => prKeyAction(a, `${pr.ref}-${c.name}`)),
    }
  }
  const threadRow = (pr: PrView, t: PrThread): Row => {
    const id = prThreadId(pr, t)
    const { rest } = commentParts(t.body)
    const where = (
      <Text color={pal.muted} wrap="wrap">
        <Link href={t.reply?.url || t.url}>
          <Text underline>{threadWhere(t)}</Text>
        </Link>
        {DOT}@{t.author}
      </Text>
    )
    const comment = (
      <Box flexDirection="column">
        {rest ? <Markdown text={clipLabel(rest, PR_QUOTE_CHARS)} /> : null}
        {where}
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
      if (rawTextLines <= lines && restLines + 1 + replyLines <= lines) return comment
      const restShown = Math.min(restLines, lines - 1)
      const replyShown = Math.min(replyLines, lines - 1 - restShown)

      return (
        <Box flexDirection="column">
          {rest && restShown > 0 ? (
            <Text wrap="wrap">{terminalText(terminalTextLines(rest, width, restShown))}</Text>
          ) : null}
          {where}
          {replyShown > 0 ? (
            <Text wrap="wrap">{terminalText(terminalTextLines(replyText, width, replyShown))}</Text>
          ) : null}
        </Box>
      )
    }
    const text = threadRowText(pr, t, lastActions)
    const actions = splitFollowUps(threadActions(pr, t, presses))

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
      body: comment,
      clippedBody: clippedComment,
      keys: () => actions.keys.map(a => prKeyAction(a, t.id)),
      moreKeys: () => actions.more.map(a => prKeyAction(a, t.id)),
    }
  }

  return { prKeyAction, checkRow, threadRow }
}

export type PanePrRows = ReturnType<typeof panePrRows>

export function panePrBlocks({
  look,
  pal,
  Text,
  Box,
  blankLine,
  isThreadSent,
  lastActions,
  prState,
  presses,
  space,
  Button,
  view,
  prOrderKeys,
  prTabKeys,
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
  lastActionText,
  listRow,
  prKeyAction,
  desktopLabel,
  keyRow,
  emptyState,
  banner,
}: Pick<
  PaneBase,
  | 'look'
  | 'pal'
  | 'Text'
  | 'Box'
  | 'blankLine'
  | 'isThreadSent'
  | 'lastActions'
  | 'prState'
  | 'presses'
  | 'space'
  | 'Button'
  | 'view'
  | 'prOrderKeys'
  | 'prTabKeys'
  | 'prGroups'
> &
  Pick<PaneRowParts, 'section' | 'undoPlace' | 'settledContent' | 'groupTitle' | 'titleGap' | 'sections'> &
  Pick<PaneRowFrame, 'desktopFrame'> &
  Pick<PaneRowLines, 'markGlyph' | 'divided' | 'lastActionText'> &
  Pick<PaneRows, 'listRow'> &
  Pick<PanePrRows, 'prKeyAction'> &
  Pick<PaneRowKeys, 'desktopLabel' | 'keyRow'> &
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
              <Text color={pal.muted}>{`${DOT}${settledLabel(state.label, state.delivery)}`}</Text>
            </Text>,
          ],
        }),
      )

    return section(
      <Box key={key} paddingLeft={1}>
        {settledContent(what, state, undo, mark)}
      </Box>,
    )
  }
  const prRowGroup = (title: string, group: Row[], key: string) =>
    group.length === 0
      ? []
      : [
          <Box key={`group-${key}`} marginTop={blankLine}>
            {groupTitle(title, group.length)}
          </Box>,
          ...(look === 'desktop' ? [] : titleGap()),
          ...divided(
            group.map((r, n) => listRow(r, childPos(n, group.length))),
            key,
          ),
        ]
  const prBlock = (b: DrawnPr & { rows: Row[]; checks: Row[]; threads: Row[] }) => {
    if (b.state.is === 'settled') return settledPrBlock(b.pr, b.state)
    const { pr, checks, threads } = b
    const { status, head: statusHead, unlisted } = readiness(pr, isThreadSent)
    const tone = PR_TONES[status]
    const prLast = isDismissed(lastActions, pr.ref) ? null : lastActionText(prMarkId(pr.ref))
    const prActions = prBlockActions(pr, isThreadSent, prState.branchRef, presses).map(a => prKeyAction(a, pr.ref))

    const titleLine = (
      <Text wrap="wrap">
        {b.rank === null ? null : <Text color={pal.muted}>{prRankText(b.rank)}</Text>}
        <Text color={look === 'desktop' ? pal.mark.prs : pal.tone.prs}>{`#${pr.number}\u2002`}</Text>
        <Text bold>{pr.title}</Text>
        <Text color={tone ? (pal.tone[tone] ?? pal.mark[tone]) : pal.muted}>{`\u2002${statusHead}`}</Text>
        <Text color={pal.muted}>{unlisted.map(r => `${DOT}${r}`).join('')}</Text>
      </Text>
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
        <Box
          flexDirection="row"
          flexWrap="wrap"
          columnGap={space.buttonGap}
          rowGap={look === 'desktop' ? 1 : 0}
          marginTop={blankLine}
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
        {prLast ? (
          <Box marginTop={look === 'desktop' ? 1 : 0}>
            <Text color={prLast.isFailure ? pal.tone.error : pal.muted} wrap="wrap">
              {prLast.text}
            </Text>
          </Box>
        ) : null}
      </Box>
    )

    return section([
      ...(look === 'desktop'
        ? [
            desktopFrame({ key: `pr-title-${pr.ref}`, padY: 0, children: titleLine }),
            desktopFrame({ key: `pr-status-${pr.ref}`, padY: 0, children: statusBlock }),
          ]
        : [<Box paddingLeft={1}>{titleLine}</Box>, <Box paddingLeft={1}>{statusBlock}</Box>]),
      ...prRowGroup(PR_GROUP_TITLES.threads, threads, `${pr.ref}-threads`),
      ...prRowGroup(PR_GROUP_TITLES.checks, checks, `${pr.ref}-checks`),
    ])
  }
  const ghState = { isGhMissing: Boolean(prState.isGhMissing), isGhSignedOut: Boolean(prState.isGhSignedOut) }
  const ghNotice = ghNoticeOf(ghState)
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
  /** The order's title, the agent's reason under it, and the changed line with Rank again and its press status. */
  const prOrderLines = () => {
    const order = view.prs.order
    if (!order) return []
    const changed = order.changed
    const pressed = changed?.showsPress ? lastActionText(RANK_AGAIN_ID) : null
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
            {pressed ? (
              <Text color={pressed.isFailure ? pal.tone.error : pal.muted} wrap="wrap">
                {pressed.text}
              </Text>
            ) : null}
          </Box>
        ) : null}
      </Box>
    )

    return prTabLine('pr-order', lines)
  }
  const prTabButtons = () =>
    prTabKeys.length === 0 ? [] : prTabLine('pr-tab-actions', keyRow(DISMISS_MERGED_ID, prTabKeys))
  const prsView = () =>
    prGroups.length === 0 ? (
      <Box flexDirection="column" flexGrow={1}>
        {emptyState(prsEmptyText({ isFetching: prState.isFetching, ...ghState }, 'session'))}
      </Box>
    ) : (
      sections(
        [
          ...(ghNotice ? [section(banner(bannerOf(ghNotice.kind, ghNotice.text)))] : []),
          ...prOrderLines(),
          ...prGroups.map(prBlock),
          ...prTabButtons(),
          ...olderPrs(),
        ],
        2,
      )
    )

  return { prsView }
}
