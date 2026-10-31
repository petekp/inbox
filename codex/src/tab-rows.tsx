import { ledgerActions } from './row-actions'
import { clipLabel } from '../../hooks/text'
import { allRows, DOT, replyHint, ROW_COPY, shortAgo, shownOptionDescriptions } from '../../hooks/rows'
import { drawnLists, rowAfterClose } from '../../hooks/action-plan'
import { isRowTab } from '../../hooks/tabs'
import { feedbackOf } from '../../hooks/feedback'
import { isDrawnInPlace, SETTLED_MS } from '../../hooks/timing'
import type { Feedback, PressState } from '../../hooks/feedback'
import type { RowView } from '../../hooks/rows'
import { actionId } from '../../hooks/press-labels'
import { stepEffects } from '../../hooks/help-steps'
import { isPressConfirmed, noteText } from '../../hooks/press-reducer'
import type { Effect } from '../../hooks/press-reducer'
import { pendingResult } from '../../hooks/pressed'
import type { RowPress } from '../../hooks/presses'
import { checkActions, threadActions } from '../../hooks/pr-tab'
import {
  checkRowText,
  PR_QUOTE_CHARS,
  splitFollowUps,
  prCheckId,
  prMarkId,
  prThreadId,
  threadRowText,
} from '../../hooks/pr-rows'
import { prPressEffect } from '../../hooks/pr-press'
import type { DrawnPr } from '../../hooks/pr-views'
import type { PrAction, PrPress } from '../../hooks/pr-press'
import { commentParts, failingChecks, readableComment, threadWhere, waitingThreads } from '../../hooks/prs'
import type { Finding, PrCheck, PrThread, PrView, Tab } from '../../types'
import type { TabView as View } from './core'
import type { PressReply } from './server'
import { PRESS_TIMEOUT_MS } from '../../hooks/session-view'
import { tabState, selection, drafts, optionsShown, sending, errors, notes, copies, undoing } from './tab-state'
import type { Key, Row, Lists } from './tab-state'
import { later, callTool } from './tab-host'
import { revealSelected, drawIn } from './tab-motion'
import { drawnTab, tabWaits, shownSettled, open, keepPressedOpen } from './tab-selection'
import { applyView, replies, holds } from './tab-read'
import { isNotSent, copy, startTyping, discardReply } from './tab-press'
import { resultHandle, inlineHtml } from './tab-parts'

function isListed(v: View, id: string): boolean {
  return (
    allRows(v).some(r => r.id === id && r.state.is !== 'settled') ||
    prRows(v).some(r => r.id === id) ||
    v.prs.drawn.some(d => prMarkId(d.pr.ref) === id)
  )
}

export async function act(
  rowId: string,
  press: RowPress | PrPress,
  onSent?: () => void,
  pending: Feedback | null = null,
) {
  if (tabState.isDisposed) return
  const generation = tabState.viewGeneration
  const seq = ++tabState.requested
  const isLatest = () => sending.get(rowId)?.seq === seq
  if (press.action !== 'undo' && !rowId.startsWith('pr:')) keepPressedOpen(rowId)
  const t = drawnTab()
  const wasWaiting =
    !!tabState.view && isRowTab(t) && tabWaits(tabState.view, t).some(r => r.id === rowId && r.isWaiting)
  sending.set(rowId, { seq, pending, action: press.action === 'type' ? null : actionId(press) })
  errors.delete(rowId)
  notes.delete(rowId)
  copies.delete(rowId)
  tabState.draw()
  tabState.activePresses++
  try {
    const r = await callTool<PressReply>(
      'inbox_press',
      { press, thread: tabState.view?.thread, demo: tabState.isDemo, ...holds() },
      PRESS_TIMEOUT_MS,
    )
    if (tabState.isDisposed || generation !== tabState.viewGeneration) return
    if (r.copy) await copy(rowId, r.copy, isLatest)
    if (tabState.isDisposed || generation !== tabState.viewGeneration || !isLatest()) return
    if (r.view) applyView(r.view, seq)
    if (r.error && !(tabState.view && isNotSent(tabState.view, rowId))) errors.set(rowId, r.error)
    const isConfirmed = isPressConfirmed({ error: r.error, note: r.note, isUnconfirmed: r.delivery === 'unconfirmed' })
    // After the view, so `onSent` reads the rows as they are after the press.
    if (isConfirmed) onSent?.()
    if (isConfirmed && r.view && wasWaiting && tabState.typing !== rowId) openAfterClose(r.view, rowId)
    const { note } = r
    if (note && tabState.view && isListed(tabState.view, rowId)) {
      notes.set(rowId, { text: noteText(), at: Date.now() })
      drawIn(SETTLED_MS)
      if (note === 'stale' && press.action === 'type') tabState.typing = rowId
    } else if (note) {
      tabState.lineNote = { text: noteText(), at: Date.now() }
      drawIn(SETTLED_MS)
    }
  } catch {
    if (tabState.isDisposed || generation !== tabState.viewGeneration || !isLatest()) return
    errors.set(rowId, 'Not confirmed: the inbox did not answer.')
  } finally {
    tabState.activePresses--
    if (isLatest()) {
      sending.delete(rowId)
      tabState.draw()
    }
  }
}

function openAfterClose(v: View, id: string) {
  const t = drawnTab()
  if (!isRowTab(t) || selection[t]?.id !== id) return
  const rows = tabWaits(v, t)
  if (rows.find(r => r.id === id)?.isWaiting) return
  const next = rowAfterClose(rows, id)
  const index = next === null ? -1 : tabRows(v, t).findIndex(r => r.id === next)
  if (next === null || index < 0) {
    selection[t] = null
    return
  }
  open(t, next, index)
  // After the press's own draw, which draws the row open.
  later(revealSelected, 0)
}

function sendReply(id: string, text: string) {
  const draft = drafts.get(id)
  void act(id, { action: 'type', id, text }, () => {
    if (drafts.get(id) === draft) drafts.delete(id)
  })
}

function rowKeys(r: RowView): { keys: Key[]; more: Key[] } {
  const actions = ledgerActions(r, optionsShown.has(r.id), sending.get(r.id)?.action ?? null, {
    press: p => {
      const step = p.action === 'step' ? r.steps[p.step] : undefined
      const action = r.actions.find(a => a.press.action === 'step' && p.action === 'step' && a.press.step === p.step)
      const pending: Feedback | null =
        action?.kind === 'local' && r.item && step
          ? { is: 'local', result: pendingResult(stepEffects(r.item, step), Date.now()) }
          : null
      void act(r.id, p, undefined, pending)
    },
    reply: () => startTyping(r.id),
    discard: () => discardReply(r.id),
    showOptions: () => {
      optionsShown.add(r.id)
      tabState.draw()
    },
  })
  return actions
}

function itemRow(v: View, r: RowView): Row {
  const isHandedOff = r.state.is === 'handedOff'
  const id = r.id
  const described = shownOptionDescriptions(r, optionsShown.has(id))

  return {
    id,
    view: r,
    ...resultHandle(r),
    ...(isHandedOff ? { fold: {} } : {}),
    title: r.title,
    // A next build draws the Status, so only it names the subject an ask holds up.
    ...(v.isNextBuild === true && r.holdsUpLine ? { holdsUp: r.holdsUpLine } : {}),
    age: r.at === null ? undefined : shortAgo(v.at - r.at),
    ...(described.length > 0
      ? {
          body: (
            <div>
              {described.map(o => (
                <p class="option-description" title={`${o.label}: ${o.description}`}>
                  {o.label}
                  <span class="muted">: {o.description}</span>
                </p>
              ))}
            </div>
          ),
        }
      : {}),
    ...rowKeys(r),
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
    body: (
      <div>
        <p style={{ whiteSpace: 'pre-line' }}>{inlineHtml(r.detail ?? '')}</p>
        {f.path ? (
          <p>
            <span class="muted">{ROW_COPY.relevantFile}</span>
            <code title={f.path}>{r.fileName}</code>
          </p>
        ) : null}
      </div>
    ),
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
    ...(a.isOut || sending.get(rowId)?.action === a.press.action ? { isOut: true } : {}),
    run: () => void act(rowId, a.press, undefined, pending),
  }
}

function pendingLocal(effect: Effect): Feedback {
  return { is: 'local', result: pendingResult([effect], Date.now()) }
}

function prThreadRow(v: View, pr: PrView, t: PrThread): Row {
  const id = prThreadId(pr, t)
  const text = threadRowText(pr, t, v.lastActions)
  const press =
    (action: 'thread-address' | 'thread-draft' | 'thread-discuss' | 'thread-open', pending: Feedback | null = null) =>
    () =>
      void act(id, { action, ref: pr.ref, thread: t.id }, undefined, pending)
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
    body: (
      <div>
        {rest ? <p class="quote">{inlineHtml(clipLabel(rest, PR_QUOTE_CHARS))}</p> : null}
        <p class="muted">
          <button type="button" class="link" onClick={press('thread-open', openEffect && pendingLocal(openEffect))}>
            {where}
          </button>
          {`${DOT}@${t.author}`}
        </p>
        {t.reply ? (
          <p class="quote">
            <b>@{t.reply.author}:</b> {inlineHtml(clipLabel(readableComment(t.reply.body), PR_QUOTE_CHARS))}
          </p>
        ) : null}
      </div>
    ),
    keys: actions.keys.map(a => prKey(id, pr, a)),
    more: actions.more.map(a => prKey(id, pr, a)),
    feedback: feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at),
  }
}

function prCheckRow(v: View, pr: PrView, c: PrCheck): Row {
  const id = prCheckId(pr, c)
  const text = checkRowText(c)
  const ran = text.meta

  return {
    id,
    handle: text.mark.text,
    handleTone: text.mark.tone ?? undefined,
    isMarkDone: text.mark.isDone,
    ...(text.lead ? { lead: `${text.lead} /` } : {}),
    title: text.title,
    meta: ran,
    age: c.finishedAt === undefined ? undefined : shortAgo(v.at - c.finishedAt),
    body: <div class="muted">{ran}</div>,
    keys: checkActions(pr, c, pressesOf(v)).map(a => prKey(id, pr, a)),
    more: [],
    feedback: feedbackOf(id, v.lastActions[id], undefined, v.turns, v.at),
  }
}

export type PrBlockPlan = DrawnPr & { threads: Row[]; checks: Row[] }

export function prPlan(v: View): { blocks: PrBlockPlan[]; rows: Row[] } {
  const blocks: PrBlockPlan[] = []
  for (const d of v.prs.drawn) {
    if (!isDrawnInPlace(d, tabState.shownSince) && !undoing.has(prMarkId(d.pr.ref))) continue
    blocks.push(
      d.state.is === 'settled'
        ? { ...d, threads: [], checks: [] }
        : {
            ...d,
            threads: waitingThreads(d.pr).map(t => prThreadRow(v, d.pr, t)),
            checks: failingChecks(d.pr).map(c => prCheckRow(v, d.pr, c)),
          },
    )
  }

  return { blocks, rows: blocks.flatMap(b => [...b.threads, ...b.checks]) }
}

function prRows(v: View): Row[] {
  return prPlan(v).rows
}

export function tabRows(v: View, t: Tab): Row[] {
  return t === 'prs' ? prRows(v) : listsOf(v, shownSettled(v)).byTab[t]
}

export function listsOf(v: View, drawn: ReadonlySet<string>): Lists {
  const held = replies()

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
