import type { PrCheck, PrThread, PrView } from '../../types'
import { feedbackOf, feedbackText, hasAge, isFailure, markedFeedbackText } from '../../hooks/feedback'
import type { PressState } from '../../hooks/feedback'
import { prPressEffect } from '../../hooks/pr-press'
import type { PrAction } from '../../hooks/pr-press'
import { OTHER_PRS_TEXT, otherPrsStart } from '../../hooks/pr-order'
import {
  PR_GROUP_TITLES,
  PR_QUOTE_CHARS,
  PR_REFRESH_ID,
  PR_TONES,
  RANK_AGAIN_ID,
  CLEAR_FINISHED_ID,
  checkRowText,
  ghNoticeOf,
  isBlockPressShown,
  prBlockRows,
  prCheckId,
  prMarkId,
  prRefreshFailedText,
  prThreadId,
  prsEmptyText,
  splitFollowUps,
  threadRowText,
  threadSentIn,
} from '../../hooks/pr-rows'
import type { PrRowMark } from '../../hooks/pr-rows'
import { checkActions, prBlockActions, threadActions } from '../../hooks/pr-tab'
import { isDismissed } from '../../hooks/pr-views'
import type { DrawnPr } from '../../hooks/pr-views'
import { checkKey, commentParts, readableComment, readiness, threadWhere } from '../../hooks/prs'
import { bannerOf } from '../../hooks/banners'
import { DOT, ROW_COPY, settledLabel, settledMark, shortAgo } from '../../hooks/rows'
import { SETTLED_MS } from '../../hooks/timing'
import { clipLabel } from '../../hooks/text'
import { button } from './blocks'
import type { Block, Button, LineBlock, Mark, RowBlock, Tone } from './blocks'
import type { LookScreen } from './draw'

const LOOK = 'herdr'

/** The place an empty PRs tab names, as the desktop look's. */
const PLACE = 'session'

const PR_TONE: Record<Exclude<(typeof PR_TONES)[keyof typeof PR_TONES], null>, Tone> = {
  needsYou: 'needsYou',
  done: 'done',
  findings: 'findings',
  error: 'error',
}

/** A PR plan's button, which runs its open or refresh first. */
function prButton(pr: PrView | null, a: PrAction, id: string): Button {
  const effect = pr ? prPressEffect(pr, a.press) : null
  const b = button(id, a.label, a.emphasis, { is: 'press', press: a.press, effects: effect ? [effect] : [] }, a.hotkey)

  return { ...b, isOut: a.isOut }
}

/** The press status of a PR row, block or tab line, with its age when it has one. */
function prFeedback(screen: LookScreen, id: string): RowBlock['feedback'] {
  const { view, now } = screen
  const f = feedbackOf(id, view.lastActions[id], undefined, view.turns, now)
  if (!f) return null
  const text = hasAge(f) ? `${markedFeedbackText(f, false, LOOK)}${DOT}${shortAgo(now - f.at)}` : feedbackText(f, LOOK)

  return { text, tone: isFailure(f) ? 'error' : 'muted' }
}

const markOf = (m: PrRowMark): Mark => ({
  text: m.text,
  tone: m.tone,
  isRunning: m.isRunning,
})

type PrRow = Omit<RowBlock, 'isSelected' | 'body' | 'buttons'> & {
  body: RowBlock['body']
  buttons: Button[]
}

function threadRow(screen: LookScreen, pr: PrView, t: PrThread, presses: PressState): PrRow {
  const id = prThreadId(pr, t)
  const text = threadRowText(pr, t, screen.view.lastActions)
  const { rest } = commentParts(t.body)
  const { keys, more } = splitFollowUps(threadActions(pr, t, presses))
  const reply = t.reply ? `@${t.reply.author}: ${clipLabel(readableComment(t.reply.body), PR_QUOTE_CHARS)}` : null

  return {
    kind: 'row',
    id,
    depth: 0,
    mark: markOf(text.mark),
    title: text.title,
    age: t.at === null ? null : shortAgo(screen.now - t.at),
    feedback: prFeedback(screen, id) ?? (text.fold?.note ? { text: text.fold.note, tone: 'muted' } : null),
    settled: null,
    isDim: text.mark.isDone,
    isSelectable: text.fold === null,
    body: [
      ...(rest ? [{ text: clipLabel(rest, PR_QUOTE_CHARS), tone: null }] : []),
      { text: `${threadWhere(t)}${DOT}@${t.author}`, tone: 'muted' as const },
      ...(reply ? [{ text: reply, tone: null }] : []),
    ],
    buttons: [...keys, ...more].map((a, n) => prButton(pr, a, `${id} ${n}`)),
    field: null,
  }
}

function checkRow(screen: LookScreen, pr: PrView, c: PrCheck, presses: PressState): PrRow {
  const id = prCheckId(pr, c)
  const text = checkRowText(pr, c)

  return {
    kind: 'row',
    id,
    depth: 0,
    mark: markOf(text.mark),
    title: text.lead ? `${text.lead} / ${text.title}` : text.title,
    age: c.finishedAt === undefined ? null : shortAgo(screen.now - c.finishedAt),
    feedback: prFeedback(screen, id) ?? (text.fold ? { text: text.fold.note, tone: 'muted' } : null),
    settled: null,
    isDim: false,
    isSelectable: text.fold === null,
    body: [{ text: text.meta, tone: 'muted' }],
    buttons: checkActions(pr, c, presses).map((a, n) => prButton(pr, a, `${pr.ref} ${checkKey(c)} ${n}`)),
    field: null,
  }
}

function settledPr(d: DrawnPr & { state: { is: 'settled' } }): RowBlock {
  const { pr, state } = d
  const id = prMarkId(pr.ref)
  const undo = state.canUndo
    ? [
        {
          ...button(`${id} undo`, ROW_COPY.undo, 'quiet', {
            is: 'press',
            press: { action: 'pr-undo', ref: pr.ref },
            effects: [],
          }),
          runsOutAt: state.at + SETTLED_MS,
        },
      ]
    : []
  const mark = settledMark(state)

  return {
    kind: 'row',
    id,
    depth: 0,
    mark: { text: mark.text, tone: mark.tone ?? 'muted', isRunning: mark.isRunning },
    title: pr.title,
    age: `#${pr.number}`,
    feedback: null,
    settled: { label: settledLabel(state.label, state.delivery, state.reply), tone: 'muted' },
    isDim: true,
    isSelectable: false,
    isSelected: false,
    body: [],
    buttons: undo,
    field: null,
  }
}

/** A PR's blocks: its title and status line with its buttons, then its threads, failing and cancelled checks. */
function prBlocks(screen: LookScreen, d: DrawnPr, presses: PressState, selected: string | null): Block[] {
  if (d.state.is === 'settled') return [settledPr({ ...d, state: d.state })]
  const { pr } = d
  const { lastActions } = screen.view
  const isSent = threadSentIn(lastActions)
  const { status, head, unlisted } = readiness(pr, isSent, screen.agent)
  const tone = PR_TONES[status]
  const isLastShown = !isDismissed(lastActions, pr.ref) && isBlockPressShown(pr, lastActions)
  const groups = prBlockRows(pr, false, {
    thread: t => threadRow(screen, pr, t, presses),
    check: c => checkRow(screen, pr, c, presses),
  })
  const rowsOf = (title: string, rows: PrRow[], key: string): Block[] =>
    rows.length === 0
      ? []
      : [
          {
            kind: 'heading',
            id: `${pr.ref} ${key}`,
            text: title,
            count: rows.length,
            mark: null,
            buttons: [],
            isLabel: false,
          },
          ...rows.map((r): RowBlock => {
            const isSelected = r.isSelectable && r.id === selected
            return { ...r, isSelected, body: isSelected ? r.body : [], buttons: isSelected ? r.buttons : [] }
          }),
        ]

  return [
    {
      kind: 'pr',
      id: prMarkId(pr.ref),
      number: `#${pr.number}`,
      title: pr.title,
      status: { text: head, tone: tone ? PR_TONE[tone] : 'muted' },
      unlisted,
      error: pr.error ? prRefreshFailedText(pr.error) : null,
      buttons: prBlockActions(pr, isSent, screen.view.prs.branchRef, presses).map((a, n) =>
        prButton(pr, a, `${pr.ref} ${n}`),
      ),
      feedback: isLastShown ? prFeedback(screen, prMarkId(pr.ref)) : null,
    },
    ...rowsOf(PR_GROUP_TITLES.threads, groups.threads, 'threads'),
    ...rowsOf(PR_GROUP_TITLES.checks, groups.checks, 'checks'),
    ...rowsOf(PR_GROUP_TITLES.cancelled, groups.cancelled, 'cancelled'),
  ]
}

const note = (id: string, text: string, tone: Tone): Block => ({
  kind: 'note',
  id,
  text,
  count: null,
  tone,
  isHead: true,
  isStrong: false,
  depth: 0,
})

/** Refresh PRs and its press's result, while a PR could not be read. */
function refreshParts(screen: LookScreen): Pick<LineBlock, 'text' | 'buttons' | 'feedback'> | null {
  const refresh = screen.view.prs.refresh
  if (!refresh) return null
  const buttons = refresh.actions.map((a, n) => prButton(null, a, `refresh ${n}`))
  const feedback = refresh.showsPress ? prFeedback(screen, PR_REFRESH_ID) : null

  return { text: refresh.text, buttons, feedback }
}

const refreshLine = (screen: LookScreen): Block[] => {
  const refresh = refreshParts(screen)
  return refresh ? [{ kind: 'line', id: PR_REFRESH_ID, under: null, ...refresh }] : []
}

/**
 * The GitHub notice, and Refresh PRs. While the notice gives the problem Refresh PRs acts on, the button draws at the
 * notice's end, and the notice takes the refresh's id so the press's result shows there.
 */
function noticeBlocks(screen: LookScreen, notice: ReturnType<typeof ghNoticeOf>): Block[] {
  if (!notice) return refreshLine(screen)
  const banner = bannerOf(notice.kind, notice.text)
  const refresh = refreshParts(screen)
  if (!refresh || refresh.text !== null)
    return [{ kind: 'banner', id: 'gh notice', banner, buttons: [], feedback: null }, ...refreshLine(screen)]

  return [{ kind: 'banner', id: PR_REFRESH_ID, banner, buttons: refresh.buttons, feedback: refresh.feedback }]
}

/** The agent's order: its title and reason, then the changed line with Rank again. */
function orderLines(screen: LookScreen): Block[] {
  const order = screen.view.prs.order
  if (!order) return []
  const changed = order.changed
  const lines: Block[] = [
    { kind: 'line', id: 'pr order', text: order.title, under: order.why, buttons: [], feedback: null },
  ]
  if (!changed) return lines
  const buttons = changed.actions.map((a, n) => prButton(null, a, `order ${n}`))
  const feedback = changed.showsPress ? prFeedback(screen, RANK_AGAIN_ID) : null

  return [...lines, { kind: 'line', id: RANK_AGAIN_ID, text: changed.text, under: null, buttons, feedback }]
}

/** Clear merged and closed, on its own line under the notice and Refresh PRs, with its button at the line's end. */
function clearLine(screen: LookScreen): Block[] {
  const buttons = screen.view.prs.clear.map((a, n) => prButton(null, a, `clear ${n}`))

  return buttons.length === 0
    ? []
    : [{ kind: 'line', id: CLEAR_FINISHED_ID, text: null, under: null, buttons, feedback: null }]
}

/** The rule that separates two PRs, in the middle of a section's space. */
const ruleBetween = (ref: string): Block => ({ kind: 'rule', id: `rule ${ref}`, text: null })

/** The first row the PRs tab can open, which it opens while the person has opened none of its rows. */
function firstSelectable(blocks: Block[]): string | null {
  return blocks.find((b): b is RowBlock => b.kind === 'row' && b.isSelectable)?.id ?? null
}

/** The PRs tab as the look draws it, from the shared PR plans in the desktop look's order. */
export function prTabBlocks(screen: LookScreen, selected: string | null): Block[] {
  const { view } = screen
  const prs = view.prs
  const gh = { isGhMissing: screen.isGhMissing, isGhSignedOut: prs.isGhSignedOut, failure: prs.failure }
  if (prs.drawn.length === 0) {
    const empty = prsEmptyText({ isFetching: false, ...gh }, PLACE)
    return [
      { kind: 'empty', id: 'empty prs', title: empty.title, hint: empty.hint, buttons: [] },
      ...refreshLine(screen),
    ]
  }
  const presses: PressState = { lastActions: view.lastActions, turns: view.turns, now: screen.now }
  const notice = ghNoticeOf(gh)
  const othersStart = otherPrsStart(prs.drawn)
  const caption: Block = { kind: 'caption', id: 'other prs', text: OTHER_PRS_TEXT }
  const above = (d: DrawnPr, n: number): Block[] => [
    ...(n > 0 ? [ruleBetween(d.pr.ref)] : []),
    ...(d === othersStart ? [caption] : []),
  ]
  const draw = (open: string | null) => [
    ...noticeBlocks(screen, notice),
    ...clearLine(screen),
    ...orderLines(screen),
    ...prs.drawn.flatMap((d, n) => [...above(d, n), ...prBlocks(screen, d, presses, open)]),
    ...(prs.olderText ? [ruleBetween('older prs'), note('older prs', prs.olderText, 'muted')] : []),
  ]
  const blocks = draw(selected)
  const isShown = blocks.some(b => b.kind === 'row' && b.isSelected)

  return isShown ? blocks : draw(firstSelectable(blocks))
}
