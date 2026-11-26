import { inputOf, ledgerActions } from './row-actions'
import { clipLabel } from '../../core/domain/text'
import { replyHint, ROW_COPY, shortAgo } from '../../core/view/rows'
import { Sep } from './tab-parted'
import { drawnLists } from '../../core/view/action-plan'
import type { AnswerRow } from '../../core/view/action-plan'
import { isRowTab } from '../../core/view/tabs'
import { feedbackOf } from '../../core/view/feedback'
import { earliestOf, heldReplies, isDrawnInPlace } from '../../core/view/timing'
import type { Feedback, PressState } from '../../core/view/feedback'
import type { RowView } from '../../core/view/rows'
import { localEffects } from '../../core/domain/help-steps'
import type { Effect } from '../../core/view/press-reducer'
import { pendingResult } from '../../core/view/pressed'
import { checkActions, threadActions } from '../../core/view/pr-tab'
import {
  checkRowText,
  prBlockRows,
  PR_QUOTE_CHARS,
  splitFollowUps,
  prCheckId,
  prMarkId,
  prThreadId,
  threadRowText,
} from '../../core/view/pr-rows'
import { prPressEffect } from '../../core/view/pr-press'
import type { DrawnPr } from '../../core/view/pr-views'
import type { PrAction } from '../../core/view/pr-press'
import { commentParts, readableComment, threadWhere } from '../../core/domain/prs'
import type { Finding, PrCheck, PrThread, PrView, Tab } from '../../types'
import type { InputKind } from '../../core/view/ui-controller-types'
import type { TabView as View } from './core'
import { tabState } from './tab-state'
import type { Key, Row, Lists } from './tab-state'
import { drawnSettled, isTabInPlace } from './settle'
import { dispatch, drawnTab, isGuarded, openRowId, pressRow } from './tab-ui'
import { isUndoing, outOn, sendingSince, undoingIds } from './tab-press'
import { foldAllHere } from './tab-fold-all'
import { askTree } from './tab-ask-tree'
import { partAttrs } from './tab-part-gap'
import { resultHandle, inlineHtml } from './tab-parts'

/** The settled rows the tab draws in place, by its own clock: from when it first read each one. */
export function shownSettled(v: View): Set<string> {
  const ui = tabState.ui
  const now = Date.now()

  return drawnSettled(v, ui.shownSince ?? now, undoingIds(), {
    seen: new Map(Object.entries(ui.undoSeen)),
    input: ui.listInput,
    now,
    localPressSince: sendingSince(),
  })
}

/**
 * A press on a row's title: it opens a closed row, and collapses or expands the open one, by the shared title press.
 * With Option held on the open row or a collapsed one, it folds every row of the tab or opens them all instead.
 */
export function pressTitle(id: string, isAll: boolean, by: InputKind) {
  const t = drawnTab()
  const isOpen = isRowTab(t) && openRowId(t) === id
  const isCollapsed = tabState.view?.collapsed.includes(id) === true
  const isGuardedFold = isOpen && isGuarded(id, by)
  if (isAll && isGuardedFold) return
  if (isAll && (isOpen || isCollapsed)) foldAllHere(!isOpen)
  else dispatch([{ type: 'title-press', id, by }])
}

/** The collapse key: collapses or expands the row the cursor is on. */
export function pressCollapseKey(id: string | null) {
  if (id === null) return
  dispatch([{ type: 'collapse', id, isCollapsed: tabState.view?.collapsed.includes(id) !== true }])
}

const sendReply = (id: string, text: string) => pressRow({ action: 'type', id, text }, 'key')

function rowKeys(r: RowView): { options: Key[]; keys: Key[]; more: Key[]; answerRow: AnswerRow | null } {
  const actions = ledgerActions(r, tabState.ui.optionsShown.includes(r.id), outOn(r.id)?.action ?? null, {
    press: (p, kind, by) => {
      const effects = kind === 'local' ? localEffects(r, p) : []
      const pending: Feedback | null =
        effects.length > 0 ? { is: 'local', result: pendingResult(effects, Date.now()) } : null
      pressRow(p, by, { pending, kind })
    },
    reply: () => dispatch([{ type: 'open-field', id: r.id }]),
    discard: () => dispatch([{ type: 'close-field', id: r.id, isDiscard: true }]),
    showOptions: () => dispatch([{ type: 'show-options', id: r.id }]),
  })
  return actions
}

function itemRow(v: View, r: RowView): Row {
  const isHandedOff = r.state.is === 'handedOff'
  const id = r.id
  const { answerRow, ...actions } = rowKeys(r)

  return {
    id,
    view: r,
    ...resultHandle(r),
    ...(isHandedOff ? { fold: {} } : {}),
    title: r.title,
    ...(r.holdsUpLine ? { holdsUp: r.holdsUpLine } : {}),
    age: r.at === null ? undefined : shortAgo(v.at - r.at),
    ...askTree(r, actions.options, answerRow, () => isGuarded(id, 'click')),
    ...actions,
    typing: {
      hint: replyHint(r, 'Codex'),
      send: text => sendReply(id, text),
    },
    feedback: r.feedback,
  }
}

function findingRow(v: View, r: RowView, f: Finding): Row {
  const isHandedOff = r.state.is === 'handedOff'
  const id = r.id

  return {
    id,
    view: r,
    ...resultHandle(r),
    kind: f.kind,
    ...(isHandedOff ? { fold: {} } : {}),
    title: r.title,
    age: r.at === null ? undefined : shortAgo(v.at - r.at),
    body: () => (
      <div>
        <p class="pre-line" {...partAttrs('title', 'detail')}>
          {inlineHtml(r.detail ?? '')}
        </p>
        {f.path ? (
          <p {...partAttrs('detail', 'file')}>
            <span class="muted">{ROW_COPY.relevantFile}</span>
            <code title={f.path}>{r.fileName}</code>
          </p>
        ) : null}
      </div>
    ),
    bodyEnd: () => (f.path ? 'file' : 'detail'),
    ...rowKeys(r),
    typing: {
      hint: replyHint(r, 'Codex'),
      send: text => sendReply(id, text),
    },
    feedback: r.feedback,
  }
}

export const pressesOf = (v: View): PressState => ({ lastActions: v.lastActions, turns: v.turns, now: v.at })

export function prKey(rowId: string, pr: PrView, a: PrAction): Key {
  const effect = prPressEffect(pr, a.press)
  const pending = effect ? pendingLocal(effect) : null

  return {
    ...(a.hotkey ? { hotkey: a.hotkey } : {}),
    label: a.label,
    emphasis: a.emphasis,
    ...(a.icon ? { icon: a.icon } : {}),
    ...(a.press.action === 'pr-dismiss' ? { isDismiss: true } : {}),
    ...(a.isOut || outOn(rowId)?.action === a.press.action ? { isOut: true } : {}),
    run: by => pressRow(a.press, by, { pending, kind: a.kind }),
  }
}

export function pendingLocal(effect: Effect): Feedback {
  return { is: 'local', result: pendingResult([effect], Date.now()) }
}

function prThreadRow(v: View, pr: PrView, t: PrThread): Row {
  const id = prThreadId(pr, t)
  const text = threadRowText(pr, t, v.lastActions)
  const press =
    (action: 'thread-address' | 'thread-draft' | 'thread-discuss' | 'thread-open', pending: Feedback | null = null) =>
    (e: MouseEvent) =>
      pressRow({ action, ref: pr.ref, thread: t.id }, inputOf(e), { pending, kind: null })
  const where = threadWhere(t)
  const { rest } = commentParts(t.body)
  const actions = splitFollowUps(threadActions(pr, t, pressesOf(v)))
  const openEffect = prPressEffect(pr, { action: 'thread-open', ref: pr.ref, thread: t.id })

  return {
    id,
    handle: text.mark.text,
    handleTone: text.mark.tone ?? undefined,
    ...(text.mark.isRunning ? { isHandleRunning: true } : {}),
    isMarkDone: text.mark.isDone,
    ...(text.fold ? { fold: text.fold } : {}),
    title: text.title,
    meta: text.meta,
    age: t.at === null ? undefined : shortAgo(v.at - t.at),
    body: () => (
      <div>
        {rest ? <p class="quote">{inlineHtml(clipLabel(rest, PR_QUOTE_CHARS))}</p> : null}
        <p class="muted parted">
          <span class="part">
            <button type="button" class="link" onClick={press('thread-open', openEffect && pendingLocal(openEffect))}>
              {where}
            </button>
          </span>
          <span class="part">
            <Sep />@{t.author}
          </span>
        </p>
        {t.reply ? (
          <p class="quote">
            <b>@{t.reply.author}:</b> {inlineHtml(clipLabel(readableComment(t.reply.body), PR_QUOTE_CHARS))}
          </p>
        ) : null}
      </div>
    ),
    options: [],
    keys: actions.keys.map(a => prKey(id, pr, a)),
    more: actions.more.map(a => prKey(id, pr, a)),
    feedback: feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at),
  }
}

function prCheckRow(v: View, pr: PrView, c: PrCheck): Row {
  const id = prCheckId(pr, c)
  const text = checkRowText(pr, c)
  const ran = text.meta

  return {
    id,
    ...(text.fold ? { fold: text.fold } : {}),
    handle: text.mark.text,
    handleTone: text.mark.tone ?? undefined,
    isMarkDone: text.mark.isDone,
    ...(text.lead ? { lead: `${text.lead} /` } : {}),
    title: text.title,
    meta: ran,
    age: c.finishedAt === undefined ? undefined : shortAgo(v.at - c.finishedAt),
    body: () => <div class="muted">{ran}</div>,
    options: [],
    keys: checkActions(pr, c, pressesOf(v)).map(a => prKey(id, pr, a)),
    more: [],
    feedback: feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at),
  }
}

export type PrBlockPlan = DrawnPr & ReturnType<typeof prBlockRows<Row>>

export function prPlan(v: View): { blocks: PrBlockPlan[]; rows: Row[] } {
  const blocks: PrBlockPlan[] = []
  const now = Date.now()
  const ui = tabState.ui
  const shownSince = ui.shownSince ?? now
  const placing = {
    shownSince,
    seen: new Map(Object.entries(ui.undoSeen)),
    input: ui.listInput,
    now,
    pressOutSince: earliestOf([v.prs.pressOutSince, sendingSince()]),
  }
  for (const d of v.prs.drawn) {
    const id = prMarkId(d.pr.ref)
    const isShown = d.state.is === 'settled' ? isTabInPlace(id, d.state, placing) : isDrawnInPlace(d, shownSince)
    if (!isShown && !isUndoing(id)) continue
    blocks.push({
      ...d,
      ...prBlockRows(d.pr, d.state.is === 'settled', {
        thread: t => prThreadRow(v, d.pr, t),
        check: c => prCheckRow(v, d.pr, c),
      }),
    })
  }

  return { blocks, rows: blocks.flatMap(b => b.rows) }
}

function prRows(v: View): Row[] {
  return prPlan(v).rows
}

export function tabRows(v: View, t: Tab): Row[] {
  return t === 'prs' ? prRows(v) : listsOf(v, shownSettled(v)).byTab[t]
}

export function listsOf(v: View, drawn: ReadonlySet<string>): Lists {
  const held = heldReplies(tabState.ui.typing, tabState.ui.drafts)

  return drawnLists(
    v,
    id => drawn.has(id),
    r =>
      r.state.is === 'held' && !(r.id in held)
        ? null
        : r.item
          ? itemRow(v, r)
          : r.finding
            ? findingRow(v, r, r.finding)
            : null,
  )
}
