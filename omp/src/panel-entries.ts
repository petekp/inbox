import { checkActions, prBlockActions, threadActions } from '../../core/view/pr-tab'
import {
  ghNoticeOf,
  prRefreshFailedText,
  PR_GROUP_TITLES,
  PR_TONES,
  checkRowText,
  RANK_AGAIN_ID,
  PR_REFRESH_ID,
  CLEAR_FINISHED_ID,
  prCheckId,
  isBlockPressShown,
  prBlockRows,
  prMarkId,
  PR_QUOTE_CHARS,
  prRowWaits,
  prThreadId,
  threadRowText,
  threadSentIn,
  prSyncOf,
  shownReadiness,
} from '../../core/view/pr-rows'
import { isDismissed, openPrViews } from '../../core/view/pr-views'
import { OTHER_PRS_TEXT, otherPrsStart } from '../../core/view/pr-order'
import type { PrRowMark } from '../../core/view/pr-rows'
import type { PrCheck, PrThread } from '../../types'
import type { PrOrderView } from '../../core/view/pr-order'
import type { PrRefreshView } from '../../core/view/pr-refresh'
import { commentParts } from '../../core/domain/prs'
import { nothingMark } from '../../core/view/band'
import { capitalized } from '../../core/domain/press-labels'
import { cellWidth, clipLabel } from '../../core/domain/text'
import { settledTone, NEEDS_YOU_GROUPS, settledMark, settledLabel, resumeLabel } from '../../core/view/rows'
import { bannerOf, isResumable, stopFix, stopText } from '../../core/view/banners'
import { emptyTab, type EmptyTab } from '../../core/view/empty-tab'
import { FINDING_GROUPS, HELP_COPY, helpKeys, helpVersionText, MARK_LEGEND } from '../../core/view/help'
import { isDrawnInPlace, runningMark } from '../../core/view/timing'
import { isRowTab } from '../../core/view/tabs'
import { GOAL_KEYS_ID } from '../../core/view/status-keys'
import type { SessionView } from '../../core/view/session-view'
import { goalSection, setGoal } from './panel-goal'
import { PAGE_TEXT_AT } from './panel-page'
import { collapsedIn } from './panel-text'
import { unfoldedRows } from '../../core/view/status-folds'
import type { ShownTab } from '../../core/view/tabs'
import { HERDR_ASK_BUTTONS, herdrAskBanner } from '../../core/remote/herdr-ask'
import {
  AGENT,
  HERDR_ASK_ID,
  STOP_ID,
  blankLine,
  doneAt,
  groupEntries,
  onTree,
  isGroupEmpty,
  prButtons,
  pressFeedback,
} from './panel-lines'
import type { Button, Entry, Group, Lead, Line } from './panel-lines'
import { rowErrorOf } from '../../core/view/ui-controller'
import type { PanelScreen, PanelUi } from './panel'

/** The question before omp installs the inbox's Herdr mod, as a row its buttons can focus, while it shows. */
function herdrAskEntries(screen: PanelScreen): Entry[] {
  const banner = herdrAskBanner(screen.herdrAsk ?? null)
  if (!banner) return []
  const isAsking = screen.herdrAsk?.is === 'asking'
  const buttons: Button[] = HERDR_ASK_BUTTONS.map(a => ({
    label: a.label,
    key: a.hotkey,
    press: { action: 'herdr-ask', isYes: a.isYes },
    isRecommended: a.isYes,
    isFollowUp: false,
  }))

  return [
    {
      kind: 'row',
      line: {
        ...blankLine(HERDR_ASK_ID),
        lead: null,
        title: banner.lead,
        titleTone: 'key',
        detail: banner.body,
        isDetailShown: true,
        buttons: isAsking ? buttons : [],
        isStatic: !isAsking,
        isWaiting: isAsking,
      },
    },
  ]
}

function stopEntries(screen: PanelScreen, ui: PanelUi): Entry[] {
  const { stop } = screen
  if (!stop) return []
  const canResume = isResumable(stop)
  const resuming = ui.resuming?.stopAt === stop.at ? ui.resuming : null
  const resume: Button = {
    label: resumeLabel(resuming?.is === 'sending'),
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

/** A tab's empty state from `emptyTab`: its title, its hint, and `under`, the drawn parts its `under` names. */
function emptyEntries(empty: EmptyTab, now: number, under: Entry[] = []): Entry[] {
  const mark = empty.titleMark ? nothingMark(empty.titleMark.isRunning, now) : ''

  return [
    { kind: 'note', text: empty.title + mark, isStrong: true },
    ...(empty.hint ? [{ kind: 'note' as const, text: empty.hint, isWhole: true }] : []),
    ...under,
  ]
}

function rowEntries(screen: PanelScreen, ui: PanelUi, tab: 'needsYou' | 'findings', now: number): Entry[] {
  const { view } = screen
  const groups: Group[] =
    tab === 'needsYou'
      ? NEEDS_YOU_GROUPS.map(g => ({
          kind: g.kind,
          title: g.title,
          mark: { text: g.mark.mark, tone: g.mark.tone },
          isRowLed: true,
          rows: view.needsYou[g.list].filter(r => isDrawnInPlace(r, ui.shownSince)),
          closed: view.needsYou.closed[g.list].map(d => ({ ...d, title: d.ask })),
        }))
      : (Object.keys(FINDING_GROUPS) as (keyof typeof FINDING_GROUPS)[]).map(kind => ({
          kind,
          title: FINDING_GROUPS[kind].title,
          mark: { text: FINDING_GROUPS[kind].mark, tone: FINDING_GROUPS[kind].tone },
          isRowLed: false,
          rows: view.findings.rows.filter(r => r.finding?.kind === kind && isDrawnInPlace(r, ui.shownSince)),
          closed: view.findings.closed.filter(f => f.kind === kind).map(f => ({ ...f, at: f.closedAt })),
        }))
  const stops = tab === 'needsYou' ? [...herdrAskEntries(screen), ...stopEntries(screen, ui)] : []
  const empty = emptyTab(view, {
    tab,
    agent: AGENT,
    drawn: groups.filter(g => !isGroupEmpty(g)).length,
    hasBlocker: stops.length > 0,
  })
  if (empty) return emptyEntries(empty, now)
  const hasRows = !groups.every(isGroupEmpty)

  return [...stops, ...(hasRows ? groups.flatMap(g => groupEntries(g, ui)) : [])]
}

function prEntries(screen: PanelScreen, ui: PanelUi, now: number): Entry[] {
  const { prs, lastActions, turns } = screen.view
  const isSent = threadSentIn(lastActions)
  const presses = { lastActions, turns, now }
  const waits = prRowWaits(openPrViews(prs.drawn), lastActions)
  const isWaiting = (id: string) => waits.some(w => w.id === id && w.isWaiting)
  const markLead = (mark: PrRowMark): Lead => ({
    text: mark.isRunning ? runningMark(now) : mark.text,
    tone: mark.tone ?? (mark.isRunning || !mark.text ? 'sep' : 'dim'),
  })
  const out: Entry[] = []
  const empty = emptyTab(screen.view, {
    tab: 'prs',
    place: 'session',
    drawn: prs.drawn.length,
    isFetchingPrs: screen.isFetchingPrs,
  })
  if (empty)
    return emptyEntries(
      empty,
      now,
      empty.under?.is === 'pr-refresh' ? refreshEntries(screen, empty.under.refresh, now) : [],
    )
  const ghNotice = ghNoticeOf(prs.gh)
  if (ghNotice) out.push({ kind: 'banner', banner: bannerOf(ghNotice.kind, ghNotice.text) })
  if (prs.refresh) out.push(...refreshEntries(screen, prs.refresh, now))
  const clearButtons = prButtons(prs.clear)
  if (clearButtons.length > 0)
    out.push({
      kind: 'row',
      line: {
        ...blankLine(CLEAR_FINISHED_ID),
        lead: null,
        buttons: clearButtons,
        isWaiting: false,
        isTabButtons: true,
      },
    })
  if (prs.order) out.push(...orderEntries(screen, prs.order, now))
  const shown = prs.drawn.filter(d => isDrawnInPlace(d, ui.shownSince))
  const othersStart = otherPrsStart(shown)
  for (const d of shown) {
    const { pr, state } = d
    const markId = prMarkId(pr.ref)
    const lead: Lead = { text: `#${pr.number}`, tone: 'prs' }
    if (d === othersStart) out.push({ kind: 'note', text: '' }, { kind: 'note', text: OTHER_PRS_TEXT })
    if (state.is === 'settled') {
      out.push({
        kind: 'row',
        line: {
          ...blankLine(markId),
          lead,
          isPrHead: true,
          mark: settledMark(state),
          title: pr.title,
          isDim: true,
          settled: {
            label: settledLabel(state.label, state.delivery, state.reply),
            tone: settledTone(state),
            tint: null,
            undo: state.canUndo ? { action: 'pr-undo', ref: pr.ref } : null,
            at: state.at,
          },
        },
      })
      continue
    }
    const sync = prSyncOf(screen.view.sync, pr.ref)
    const shown = shownReadiness(pr, sync, isSent, AGENT)
    const isPrLastShown = !isDismissed(lastActions, pr.ref) && isBlockPressShown(pr, lastActions)
    const f = isPrLastShown ? pressFeedback(screen, markId, now) : null
    out.push({
      kind: 'row',
      line: {
        ...blankLine(markId),
        lead,
        isPrHead: true,
        title: pr.title,
        status: shown && {
          text: shown.head,
          tone: PR_TONES[shown.status],
          rest: shown.unlisted.map(r => ` · ${r}`).join(''),
        },
        age: doneAt(f),
        feedback: f,
        detail: pr.error ? prRefreshFailedText(pr.error) : null,
        buttons: prButtons(prBlockActions(pr, isSent, prs.branchRef, presses, sync).actions),
        isWaiting: false,
      },
    })
    const threadEntry = (t: PrThread): Entry => {
      const id = prThreadId(pr, t)
      const text = threadRowText(pr, t, lastActions)
      const feedback = pressFeedback(screen, id, now, text.mark.isDone)
      return {
        kind: 'row',
        line: {
          ...blankLine(id),
          depth: 1,
          lead: markLead(text.mark),
          title: text.title,
          isDim: text.fold !== null,
          body: clipLabel(commentParts(t.body).rest, PR_QUOTE_CHARS) || null,
          detail: [text.meta, text.fold?.note].filter(Boolean).join(' · ') || null,
          age: doneAt(feedback) ?? t.at,
          feedback,
          buttons: prButtons(threadActions(pr, t, presses).actions),
          isWaiting: isWaiting(id),
          isFolded: text.fold !== null,
        },
      }
    }
    const checkEntry = (c: PrCheck): Entry => {
      const id = prCheckId(pr, c)
      const text = checkRowText(pr, c)
      const feedback = pressFeedback(screen, id, now, text.mark.isDone)
      return {
        kind: 'row',
        line: {
          ...blankLine(id),
          depth: 1,
          lead: markLead(text.mark),
          title: text.lead ? `${text.lead} / ${text.title}` : text.title,
          isDim: text.fold !== null,
          isFolded: text.fold !== null,
          detail: [text.meta, text.fold?.note].filter(Boolean).join(' · '),
          age: doneAt(feedback) ?? c.finishedAt ?? null,
          feedback,
          buttons: prButtons(checkActions(pr, c, presses).actions),
          isWaiting: isWaiting(id),
        },
      }
    }
    const rows = prBlockRows(pr, false, { thread: threadEntry, check: checkEntry })
    const groups = [
      { title: PR_GROUP_TITLES.threads, entries: rows.threads },
      { title: PR_GROUP_TITLES.checks, entries: rows.checks },
      { title: PR_GROUP_TITLES.cancelled, entries: rows.cancelled },
    ]
    for (const { title, entries } of groups) {
      if (entries.length > 0) out.push({ kind: 'heading', text: title, count: entries.length })
      out.push(...onTree(entries))
    }
  }
  if (prs.olderText) out.push({ kind: 'note', text: prs.olderText })

  return out
}

/** The line under the notices while a PR could not be read: which ones, Refresh PRs, and its press status. */
function refreshEntries(screen: PanelScreen, refresh: PrRefreshView, now: number): Entry[] {
  const buttons = prButtons(refresh.actions)
  const refreshFeedback = refresh.showsPress ? pressFeedback(screen, PR_REFRESH_ID, now) : null

  return [
    {
      kind: 'row',
      line: {
        ...blankLine(PR_REFRESH_ID),
        lead: null,
        title: refresh.text ?? '',
        feedback: refreshFeedback,
        age: doneAt(refreshFeedback),
        buttons,
        isStatic: buttons.length === 0,
        isWaiting: false,
        isTabButtons: buttons.length > 0,
      },
    },
  ]
}

/** The order's title, the agent's reason under it, and the changed line with Rank again and its press status. */
function orderEntries(screen: PanelScreen, order: PrOrderView, now: number): Entry[] {
  const out: Entry[] = [{ kind: 'note', text: order.title, isPlain: true }]
  if (order.why) out.push({ kind: 'note', text: order.why })
  const changed = order.changed
  if (!changed) return out
  const buttons = prButtons(changed.actions)
  const rankFeedback = changed.showsPress ? pressFeedback(screen, RANK_AGAIN_ID, now) : null
  out.push({
    kind: 'row',
    line: {
      ...blankLine(RANK_AGAIN_ID),
      lead: null,
      title: changed.text ?? '',
      feedback: rankFeedback,
      age: doneAt(rankFeedback),
      buttons,
      isStatic: buttons.length === 0,
      isWaiting: false,
      isTabButtons: buttons.length > 0,
    },
  })

  return out
}

function pageEntries(
  view: SessionView,
  typing: string | null,
  isUnfolded: (id: string) => boolean,
  now: number,
): Entry[] {
  const isCollapsed = collapsedIn(view)
  const page = view.statusPage
  const blank: Entry = { kind: 'note', text: '' }
  const empty = emptyTab(view, { tab: 'overview', isGoalFieldOpen: typing === GOAL_KEYS_ID })
  if (empty) return emptyEntries(empty, now, empty.under?.is === 'set-goal' ? setGoal(empty.under) : [])
  const top = goalSection(page, typing, isUnfolded, isCollapsed)
  const rows = unfoldedRows(page.rows, isUnfolded, isCollapsed).map((row): Entry => ({ kind: 'page', row }))
  const isGapNeeded = top.length > 0 && rows.length > 0 && page.rows[0]?.kind !== 'part'

  return isGapNeeded ? [...top, blank, ...rows] : [...top, ...rows]
}

/** Help in place of the tab's lines: the keys the panel takes, what each mark means, then each tab's symbol. Which inbox build this is sits at the right end of the Keys title. */
function helpEntries(screen: PanelScreen): Entry[] {
  const keys = helpKeys('omp')
  const column = Math.max(...keys.map(k => cellWidth(k.keys))) + 2
  const at = PAGE_TEXT_AT
  const textAt = at + column

  return [
    {
      kind: 'heading',
      text: HELP_COPY.keys,
      ...(screen.version ? { aside: helpVersionText(screen.version, screen.isNextBuild === true) } : {}),
    },
    ...keys.map((key): Entry => ({ kind: 'key', key, at, column })),
    { kind: 'note', text: '' },
    { kind: 'heading', text: HELP_COPY.indicators },
    ...MARK_LEGEND.map((entry): Entry => ({ kind: 'legend', entry, at, textAt })),
  ]
}

export function entriesOf(screen: PanelScreen, ui: PanelUi, tab: ShownTab, now: number): Entry[] {
  if (ui.isHelpShown && tab === ui.tab) return helpEntries(screen)
  if (!isRowTab(tab)) return pageEntries(screen.view, ui.typing, id => ui.statusUnfolded.includes(id), now)

  const collapsed = new Set(screen.view.collapsed)
  const entries = tab === 'prs' ? prEntries(screen, ui, now) : rowEntries(screen, ui, tab, now)
  // A refused press's text shows on its row in place of the row's status, as long as the controller keeps it.
  const shown = (line: Line): Line => {
    const error = rowErrorOf(ui, line.id, now)
    const feedback = error === null ? line.feedback : { text: error, tone: 'error' as const, source: null }

    return { ...line, feedback, ...(collapsed.has(line.id) ? { isCollapsed: true } : {}) }
  }

  return entries.map(e => (e.kind === 'row' ? { ...e, line: shown(e.line) } : e))
}
