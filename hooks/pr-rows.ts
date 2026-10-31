import type { Delivery, LastAction, PrCheck, PrThread, PrView } from '../types'
import { baseName, isFoldingPress } from './presses'
import { clipLabel } from './text'
import { commentLine, commentParts, failingChecks, THREAD_TITLE_CHARS, threadWhere, took, waitingThreads } from './prs'
import type { IsThreadSent, PrStatus } from './prs'
import { DOT, PR_MARKS, RUNNING_MARK } from './view'
import type { BannerKind, RowWait } from './view'

export function prThreadId(pr: PrView, t: PrThread): string {
  return threadRowId(pr.ref, t.id)
}

export function prCheckId(pr: PrView, check: PrCheck): string {
  return checkRowId(pr.ref, check.name)
}

export function threadRowId(ref: string, thread: string): string {
  return `${ref} thread ${thread}`
}

export function checkRowId(ref: string, check: string): string {
  return `${ref} check ${check}`
}

export function prMarkId(ref: string): string {
  return `pr:${ref}`
}

export const GH_MISSING_TEXT = 'The inbox could not find gh. It needs gh to read your PRs.'

export const GH_SIGNED_OUT_TEXT = 'gh is not signed in to GitHub. Run gh auth login so the inbox can read your PRs.'

/** Why gh cannot read the PRs, as the PRs tab says it, or null when nothing stops it. A missing gh comes first. */
export function ghNoticeOf(gh: {
  isGhMissing: boolean
  isGhSignedOut: boolean
}): { kind: Extract<BannerKind, 'gh-missing' | 'gh-signed-out'>; text: string } | null {
  if (gh.isGhMissing) return { kind: 'gh-missing', text: GH_MISSING_TEXT }
  if (gh.isGhSignedOut) return { kind: 'gh-signed-out', text: GH_SIGNED_OUT_TEXT }

  return null
}

/** The hint under an empty PRs tab. `place` is the host's word for a conversation with the agent. */
export function prsEmptyHint(place: string): string {
  return `Your PRs show here when this ${place} opens or links one, or when your branch has one.`
}

/** What an empty PRs tab says. When gh cannot read the PRs, its hint is the `ghNoticeOf` text. */
export function prsEmptyText(
  prs: { isFetching: boolean; isGhMissing: boolean; isGhSignedOut: boolean },
  place: string,
) {
  return {
    title: prs.isFetching ? 'Checking for PRs…' : 'No PRs',
    hint: ghNoticeOf(prs)?.text ?? prsEmptyHint(place),
  }
}

/** The line a PR block shows when its last refresh failed. */
export function prRefreshFailedText(error: string): string {
  return `Last refresh failed: ${error}`
}

/** The row id of Rank again's press. It starts with `pr:`, as a PR's mark id does, so no host takes it for an Asks row. */
export const RANK_AGAIN_ID = 'pr:order'

/** The row id of the PRs tab's Dismiss merged press. It starts with `pr:`, as a PR's mark id does, so no host takes it for an Asks row. */
export const DISMISS_MERGED_ID = 'pr:merged'

export const PR_GROUP_TITLES = { threads: 'Review threads', checks: 'Failing checks' }

/**
 * The mark before a PR row's title, its tone, and whether it says the row's work is done. `isRunning` says the look
 * draws its running mark in place of `text`, while what the row sent is on its way.
 */
export type PrRowMark = {
  text: string
  tone: 'done' | 'error' | 'needsYou' | null
  isDone: boolean
  isRunning: boolean
}

/** What a review thread's row says, for each look to draw in its own controls. */
type ThreadRowText = {
  /** ◆ while the thread waits on the person, running while its message is on its way, then ✓. Blank while unconfirmed. */
  mark: PrRowMark
  /** Set when the row folds to one line: the agent has the thread, or its lines changed since the comment. */
  fold: { note?: string } | null
  title: string
  meta: string
}

export function threadRowText(pr: PrView, t: PrThread, lastActions: Record<string, LastAction>): ThreadRowText {
  const isSent = threadSentIn(lastActions)(pr, t)
  const isChanged = !isSent && t.isLinesChanged

  return {
    mark: threadMark(isSent ? lastActions[prThreadId(pr, t)]?.delivery : null),
    fold:
      isSent || isChanged
        ? t.isLinesChanged
          ? { note: `Lines changed since this comment${DOT}still open on GitHub` }
          : {}
        : null,
    title: clipLabel(commentParts(t.body).head, THREAD_TITLE_CHARS),
    meta: [
      threadWhere(t, baseName(t.path)),
      isChanged ? 'Lines changed' : '',
      t.reply ? `@${t.reply.author}: ${commentLine(t.reply.body)}` : `@${t.author}`,
    ]
      .filter(Boolean)
      .join(DOT),
  }
}

/** A thread's mark from the delivery of its hand-off, or null while it waits on the person. */
function threadMark(delivery: Delivery | null | undefined): PrRowMark {
  if (delivery === null) return { ...PR_MARKS.waiting, isDone: false, isRunning: false }
  if (delivery?.state === 'queued') return { text: RUNNING_MARK, tone: null, isDone: false, isRunning: true }
  if (delivery?.state === 'unconfirmed') return { text: '', tone: null, isDone: false, isRunning: false }
  return { ...PR_MARKS.sent, isDone: true, isRunning: false }
}

/** What a failing check's row says. `lead` names its workflow, drawn before the check's name. */
export function checkRowText(c: PrCheck): { mark: PrRowMark; lead: string | null; title: string; meta: string } {
  return {
    mark: { ...PR_MARKS.failing, isDone: false, isRunning: false },
    lead: c.workflow || null,
    title: c.name,
    meta: checkRunText(c),
  }
}

/** How many characters of a review comment, or of its latest reply, an open thread row shows. */
export const PR_QUOTE_CHARS = 1200

/** A row's actions split into the buttons it draws and the follow-ups drawn after them, as Discuss is. */
export function splitFollowUps<A extends { isFollowUp?: boolean }>(actions: A[]): { keys: A[]; more: A[] } {
  return { keys: actions.filter(a => !a.isFollowUp), more: actions.filter(a => a.isFollowUp) }
}

function checkRunText(c: PrCheck): string {
  return c.startedAt !== undefined && c.finishedAt !== undefined
    ? `Failed after ${took(c.finishedAt - c.startedAt)}`
    : 'Failed'
}

/**
 * Which PR rows the person handed to Claude. A thread stays sent until a
 * comment newer than the press, and one whose message failed to send never was.
 */
export function threadSentIn(lastActions: Record<string, LastAction>): IsThreadSent {
  return (pr, t) => {
    const last = lastActions[prThreadId(pr, t)]

    return last?.kind === 'handoff' && last.delivery?.state !== 'failed' && last.at > ((t.reply ?? t).at ?? 0)
  }
}

/** Whether a PR block draws a running mark, so the terminal and omp keep their frame timer going. */
export function isPrTabRunning(prs: PrView[], lastActions: Record<string, LastAction>): boolean {
  return prs.some(pr => waitingThreads(pr).some(t => threadRowText(pr, t, lastActions).mark.isRunning))
}

/**
 * The rows of the PR blocks `prs` in drawn order, each block's review threads then its failing checks, and whether
 * each still waits on the person: a thread not sent to the agent, a check whose Fix was not handed off.
 */
export function prRowWaits(prs: PrView[], lastActions: Record<string, LastAction>): RowWait[] {
  const isSent = threadSentIn(lastActions)

  return prs.flatMap(pr => [
    ...waitingThreads(pr).map(t => ({ id: prThreadId(pr, t), isWaiting: !isSent(pr, t) })),
    ...failingChecks(pr).map(c => {
      const id = prCheckId(pr, c)
      const last = lastActions[id]

      return { id, isWaiting: !isFoldingPress(id, last) || last?.delivery?.state === 'failed' }
    }),
  ])
}

export const PR_TONES: Record<PrStatus, 'needsYou' | 'done' | 'findings' | 'error' | null> = {
  ready: 'done',
  blocked: 'needsYou',
  waiting: null,
  draft: null,
  merged: 'findings',
  closed: 'error',
}
