import { checkActions, prBlockActions, threadActions } from '../../hooks/pr-tab'
import {
  ghNoticeOf,
  prsEmptyText,
  prRefreshFailedText,
  PR_GROUP_TITLES,
  PR_TONES,
  checkRowText,
  DISMISS_MERGED_ID,
  RANK_AGAIN_ID,
  prCheckId,
  prMarkId,
  prRowWaits,
  prThreadId,
  threadRowText,
  threadSentIn,
} from '../../hooks/pr-rows'
import { isDismissed, openPrViews } from '../../hooks/pr-views'
import { prRankText } from '../../hooks/pr-order'
import type { PrRowMark } from '../../hooks/pr-rows'
import type { PrOrderView } from '../../hooks/pr-order'
import { failingChecks, readiness, waitingThreads } from '../../hooks/prs'
import { capitalized } from '../../hooks/press-labels'
import { cellWidth } from '../../hooks/text'
import { settledTone, NEEDS_YOU_GROUPS, settledMark, settledLabel } from '../../hooks/rows'
import { bannerOf, emptyText, isResumable, stopFix, stopText } from '../../hooks/banners'
import { FINDING_GROUPS, HELP_COPY, helpKeys, MARK_LEGEND } from '../../hooks/help'
import { isDrawnInPlace, runningMark } from '../../hooks/timing'
import { isRowTab } from '../../hooks/tabs'
import { statusKeyRows } from '../../hooks/status-keys'
import { goalAbove, setGoal } from './panel-goal'
import type { StatusPage } from '../../hooks/status-page'
import type { ShownTab } from '../../hooks/tabs'
import { AGENT, STOP_ID, blankLine, doneAt, groupEntries, isGroupEmpty, prButtons, pressFeedback } from './panel-lines'
import type { Button, Entry, Group, Lead } from './panel-lines'
import type { PanelScreen, PanelUi } from './panel'

function stopEntries(screen: PanelScreen, ui: PanelUi): Entry[] {
  const { stop } = screen
  if (!stop) return []
  const canResume = isResumable(stop)
  const resuming = ui.resuming?.stopAt === stop.at ? ui.resuming : null
  const resume: Button = {
    label: resuming?.is === 'sending' ? 'Resuming…' : 'Resume',
    key: null,
    press: { action: 'resume' },
    isRecommended: true,
    isFollowUp: false,
  }

  return [
    {
      kind: 'row',
      line: {
        ...blankLine(STOP_ID),
        lead: { text: '!', tone: 'error' },
        title: 'Stopped',
        status: { text: `${capitalized(stopText(stop))}.`, tone: 'error', rest: '' },
        age: stop.at,
        detail: canResume ? null : stopFix(stop),
        feedback:
          resuming?.is === 'refused' ? { text: `Not sent: ${resuming.why}`, tone: 'error', source: null } : null,
        buttons: canResume ? [resume] : [],
        isStatic: !canResume,
        isWaiting: canResume,
        isDetailShown: true,
      },
    },
  ]
}

function rowEntries(screen: PanelScreen, ui: PanelUi, tab: 'needsYou' | 'findings'): Entry[] {
  const { view } = screen
  const groups: Group[] =
    tab === 'needsYou'
      ? NEEDS_YOU_GROUPS.map(g => ({
          kind: g.kind,
          title: g.title,
          rows: view.needsYou[g.list].filter(r => isDrawnInPlace(r, ui.shownSince)),
          closed: view.needsYou.closed[g.list].map(d => ({ ...d, title: d.ask })),
        }))
      : (Object.keys(FINDING_GROUPS) as (keyof typeof FINDING_GROUPS)[]).map(kind => ({
          kind,
          title: FINDING_GROUPS[kind].title,
          mark: { text: FINDING_GROUPS[kind].mark, tone: FINDING_GROUPS[kind].tone },
          rows: view.findings.rows.filter(r => r.finding?.kind === kind && isDrawnInPlace(r, ui.shownSince)),
          closed: view.findings.closed.filter(f => f.kind === kind).map(f => ({ ...f, at: f.closedAt })),
        }))
  const stops = tab === 'needsYou' ? stopEntries(screen, ui) : []
  if (groups.every(isGroupEmpty)) {
    const empty = emptyText(tab, AGENT)

    return stops.length > 0
      ? stops
      : [
          { kind: 'note', text: empty.title, isStrong: true },
          { kind: 'note', text: empty.hint, isWhole: true },
        ]
  }

  return [...stops, ...groups.flatMap(g => groupEntries(g, ui.unfolded))]
}

function prEntries(screen: PanelScreen, ui: PanelUi, now: number): Entry[] {
  const { prs, lastActions, turns } = screen.view
  const isSent = threadSentIn(lastActions)
  const presses = { lastActions, turns, now }
  const waits = prRowWaits(openPrViews(prs.drawn), lastActions)
  const isWaiting = (id: string) => waits.some(w => w.id === id && w.isWaiting)
  const markLead = (mark: PrRowMark): Lead => ({
    text: mark.isRunning ? runningMark(now) : mark.text,
    tone: mark.tone ?? 'sep',
  })
  const out: Entry[] = []
  const ghState = { isGhMissing: screen.isGhMissing, isGhSignedOut: prs.isGhSignedOut }
  if (prs.drawn.length === 0) {
    const empty = prsEmptyText({ isFetching: screen.isFetchingPrs, ...ghState }, 'session')
    return [
      { kind: 'note', text: empty.title, isStrong: true },
      { kind: 'note', text: empty.hint, isWhole: true },
    ]
  }
  const ghNotice = ghNoticeOf(ghState)
  if (ghNotice) out.push({ kind: 'banner', banner: bannerOf(ghNotice.kind, ghNotice.text) })
  if (prs.order) out.push(...orderEntries(screen, prs.order, now))
  for (const d of prs.drawn) {
    const { pr, state } = d
    const markId = prMarkId(pr.ref)
    const lead: Lead = { text: `#${pr.number}`, tone: 'prs' }
    if (!isDrawnInPlace(d, ui.shownSince)) continue
    if (state.is === 'settled') {
      out.push({
        kind: 'row',
        line: {
          ...blankLine(markId),
          lead,
          mark: settledMark(state),
          title: pr.title,
          isDim: true,
          settled: {
            label: settledLabel(state.label, state.delivery),
            tone: settledTone(state),
            undo: state.canUndo ? { action: 'pr-undo', ref: pr.ref } : null,
          },
        },
      })
      continue
    }
    const { status, head, unlisted } = readiness(pr, isSent)
    const f = isDismissed(lastActions, pr.ref) ? null : pressFeedback(screen, markId, now)
    out.push({
      kind: 'row',
      line: {
        ...blankLine(markId),
        lead,
        rank: d.rank === null ? null : prRankText(d.rank),
        title: pr.title,
        status: { text: head, tone: PR_TONES[status], rest: unlisted.map(r => ` · ${r}`).join('') },
        age: doneAt(f),
        feedback: f,
        detail: pr.error ? prRefreshFailedText(pr.error) : null,
        buttons: prButtons(prBlockActions(pr, isSent, prs.branchRef, presses)),
        isWaiting: false,
      },
    })
    const threads = waitingThreads(pr)
    if (threads.length > 0) out.push({ kind: 'heading', text: PR_GROUP_TITLES.threads, count: threads.length })
    for (const t of threads) {
      const id = prThreadId(pr, t)
      const text = threadRowText(pr, t, lastActions)
      const feedback = pressFeedback(screen, id, now, text.mark.isDone)
      out.push({
        kind: 'row',
        line: {
          ...blankLine(id),
          depth: 1,
          lead: markLead(text.mark),
          title: text.title,
          isDim: text.fold !== null,
          detail: [text.meta, text.fold?.note].filter(Boolean).join(' · ') || null,
          age: doneAt(feedback),
          feedback,
          buttons: prButtons(threadActions(pr, t, presses)),
          isWaiting: isWaiting(id),
          isFolded: text.fold !== null,
        },
      })
    }
    const checks = failingChecks(pr)
    if (checks.length > 0) out.push({ kind: 'heading', text: PR_GROUP_TITLES.checks, count: checks.length })
    for (const c of checks) {
      const id = prCheckId(pr, c)
      const text = checkRowText(c)
      const feedback = pressFeedback(screen, id, now, text.mark.isDone)
      out.push({
        kind: 'row',
        line: {
          ...blankLine(id),
          depth: 1,
          lead: markLead(text.mark),
          title: text.lead ? `${text.lead} / ${text.title}` : text.title,
          detail: text.meta,
          age: doneAt(feedback),
          feedback,
          buttons: prButtons(checkActions(pr, c, presses)),
          isWaiting: isWaiting(id),
        },
      })
    }
  }
  const tabButtons = prButtons(prs.tabActions)
  if (tabButtons.length > 0)
    out.push({
      kind: 'row',
      line: { ...blankLine(DISMISS_MERGED_ID), buttons: tabButtons, isWaiting: false, isTabButtons: true },
    })
  if (prs.olderText) out.push({ kind: 'note', text: prs.olderText })

  return out
}

/** The order's title, the agent's reason under it, and the changed line with Rank again and its press status. */
function orderEntries(screen: PanelScreen, order: PrOrderView, now: number): Entry[] {
  const out: Entry[] = [{ kind: 'note', text: order.title, isPlain: true }]
  if (order.why) out.push({ kind: 'note', text: order.why })
  const changed = order.changed
  if (!changed) return out
  const buttons = prButtons(changed.actions)
  out.push({
    kind: 'row',
    line: {
      ...blankLine(RANK_AGAIN_ID),
      lead: null,
      title: changed.text ?? '',
      feedback: changed.showsPress ? pressFeedback(screen, RANK_AGAIN_ID, now) : null,
      buttons,
      isStatic: buttons.length === 0,
      isWaiting: false,
      isTabButtons: buttons.length > 0,
    },
  })

  return out
}

/** Where a Status row's mark sits: in the head's column, so the list lines up with it. A subject's text starts at `PAGE_TEXT_AT`. */
export const PAGE_MARK_AT = 1
export const PAGE_TEXT_AT = PAGE_MARK_AT + 2
/** Where the mark of a child under a subject sits: after the tree's arm, which starts under the subject's mark. */
export const PAGE_CHILD_AT = PAGE_MARK_AT + 3

function pageEntries(page: StatusPage, typing: string | null): Entry[] {
  const blank: Entry = { kind: 'note', text: '' }
  if (page.isEmpty)
    return [
      { kind: 'note', text: page.empty.title, isStrong: true },
      { kind: 'note', text: page.empty.hint, isWhole: true },
      ...setGoal(page, typing),
    ]
  const description = page.head?.description
  const head: Entry[] =
    page.goal === null && page.head
      ? [
          { kind: 'note', text: page.head.title, isStrong: true, indent: PAGE_MARK_AT },
          ...(description ? [{ kind: 'note' as const, text: description, indent: PAGE_MARK_AT }] : []),
        ]
      : []
  const above = goalAbove(page, typing)
  const under = [...head, ...setGoal(page, typing)]
  const top = above.length > 0 && under.length > 0 ? [...above, blank, ...under] : [...above, ...under]
  const rows = page.rows.map((row): Entry => ({ kind: 'page', row }))

  return top.length > 0 && rows.length > 0 ? [...top, blank, ...rows] : [...top, ...rows]
}

/** Help in place of the tab's lines: the keys the panel takes, then what each mark means. */
function helpEntries(screen: PanelScreen, tab: ShownTab): Entry[] {
  const keys = helpKeys('omp', screen.isNextBuild === true, tab, statusKeyRows(screen.view.statusPage).length > 0)
  const column = Math.max(...keys.map(k => cellWidth(k.keys))) + 2

  return [
    { kind: 'heading', text: HELP_COPY.keys },
    ...keys.map((key): Entry => ({ kind: 'key', key, column })),
    { kind: 'note', text: '' },
    { kind: 'heading', text: HELP_COPY.marks },
    ...MARK_LEGEND.map((entry): Entry => ({ kind: 'legend', entry })),
  ]
}

export function entriesOf(screen: PanelScreen, ui: PanelUi, tab: ShownTab, now: number): Entry[] {
  if (ui.isHelpShown && tab === ui.tab) return helpEntries(screen, tab)
  if (!isRowTab(tab)) return pageEntries(screen.view.statusPage, ui.typing)

  return tab === 'prs' ? prEntries(screen, ui, now) : rowEntries(screen, ui, tab)
}
