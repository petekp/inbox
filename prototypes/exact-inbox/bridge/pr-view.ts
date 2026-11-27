import { pendingResult } from '../../../core/view/pressed'
import { openPrViews } from '../../../core/view/pr-views'
import { latestUndo, steppedIndex } from '../../../core/view/action-plan'
import { createHash } from 'node:crypto'
import { pressRowId } from '../../../core/view/pr-press'
import { toneColor } from './row-view'
import type { AllowedAction, ViewIdentity } from './row-view'
import { prBlockActions, threadActions, checkActions } from '../../../core/view/pr-tab'
import type { PrAction } from '../../../core/view/pr-press'
import type { Effect } from '../../../core/view/press-reducer'
import { commentEffect, logEffect, prPageEffect } from '../../../core/view/pr-press'
import {
  prBlockRows,
  prRowWaits,
  prMarkId,
  prThreadId,
  prCheckId,
  threadRowText,
  checkRowText,
  threadSentIn,
  ghNoticeOf,
  prSyncOf,
  shownReadiness,
  PR_GROUP_TITLES,
  PR_TONES,
  isBlockPressShown,
  PR_QUOTE_CHARS,
} from '../../../core/view/pr-rows'
import { readiness, commentParts, readableComment, threadWhere } from '../../../core/domain/prs'
import { otherPrsStart, OTHER_PRS_TEXT } from '../../../core/view/pr-order'
import { feedbackOf, feedbackText, hasAge, isFailure } from '../../../core/view/feedback'
import { settledLabel } from '../../../core/view/rows'
import { ago, clipLabel } from '../../../core/domain/text'
import { parseInline } from '../../../core/view/inline'
import { emptyTab } from '../../../core/view/empty-tab'
import type { SessionView } from '../../../core/view/session-view'
import type { PrViews } from '../../../types'
import type { Result } from '../app.contract'

type Line = Result<'loadInbox'>['prLines'][number]
const safeLink = (text: string) => {
  try {
    const url = new URL(text)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''
  } catch {
    return ''
  }
}
const effectLink = (effect: Effect) => (effect.kind === 'open' ? safeLink(effect.target) : '')
const parts = (text: string): Line['quote'] =>
  parseInline(text).map((s, n) => ({
    id: String(n),
    text: s.text,
    bold: !!s.bold,
    italic: !!s.italic,
    code: !!s.code,
    strike: !!s.strike,
    href: safeLink(s.link ?? ''),
  }))

export function projectPrs(
  view: SessionView,
  source: PrViews,
  agent: string,
  now = Date.now(),
  collapse: (id: string) => string = () => '',
  command?: {
    binding: ViewIdentity
    version: string
    versions: Map<string, string>
    allowed: Map<string, AllowedAction>
    actions: readonly string[]
  },
) {
  const controls = (actions: PrAction[], effect: Effect | null = null): Line['controls'] =>
    actions.map(a => {
      const row = pressRowId(a.press)
      const local = ['pr-open', 'thread-open', 'log'].includes(a.press.action)
      const opening = effect?.kind === 'open' ? effect : null
      const href = local && opening ? safeLink(opening.target) : ''
      const key = command
        ? createHash('sha256')
            .update(JSON.stringify([command.binding, command.version, a.press]))
            .digest('hex')
        : ''
      const disabled = a.isOut || !command || (local ? href === '' : !command.actions.includes(a.press.action))
      const localEffects = local && href && opening ? [{ ...opening, target: href }] : undefined
      if (command && key) {
        command.versions.set(row, command.version)
        command.allowed.set(key, { press: a.press, disabled, ...(localEffects ? { localEffects } : {}) })
      }
      return {
        command: local ? 'local' : a.press.action === 'pr-undo' ? 'undo' : 'press',
        label: a.label,
        href,
        key,
        row,
        emphasis: a.emphasis,
        out: a.isOut,
        disabled,
        primary: a.emphasis === 'primary',
        version: command?.version ?? '',
        scope: !('ref' in a.press) ? 'tab' : 'thread' in a.press || 'check' in a.press ? 'row' : 'block',
        hotkey: a.hotkey ?? '',
        icon: a.icon ?? '',
        pendingText: localEffects ? feedbackText({ is: 'local', result: pendingResult(localEffects, 0) }, 'codex') : '',
      }
    })
  const presses = { lastActions: view.lastActions, turns: view.turns, now: now }
  const line = (id: string, title: string, values: Partial<Line> = {}): Line => ({
    id,
    latestUndo: false,
    version: command?.version ?? '',
    waiting: false,
    next: '',
    previous: '',
    openDetail: '',
    collapse: collapse(id),
    title,
    kind: 'text',
    number: '',
    isFirstBlock: false,
    detail: '',
    quote: [],
    reply: [],
    mark: '',
    color: toneColor(null),
    running: false,
    folded: false,
    href: '',
    feedback: '',
    failed: false,
    controls: [],
    ...values,
  })
  const feedback = (id: string, shown = true): Pick<Line, 'feedback' | 'failed'> => {
    const value = shown ? feedbackOf(id, view.lastActions[id], undefined, view.turns, now) : null
    return {
      feedback: value ? feedbackText(value, 'codex') + (hasAge(value) ? ` · ${ago(now - value.at)}` : '') : '',
      failed: isFailure(value),
    }
  }
  const undo = latestUndo(
    view.prs.drawn.flatMap(drawn =>
      drawn.state.is === 'settled' && drawn.state.canUndo ? [{ ref: drawn.pr.ref, at: drawn.state.at }] : [],
    ),
  )
  const rows: Line[] = []
  if (view.prs.refresh)
    rows.push(
      line('pr:refresh', view.prs.refresh.text ?? '', {
        controls: controls(view.prs.refresh.actions),
        ...feedback('pr:refresh', view.prs.refresh.showsPress),
      }),
    )
  if (view.prs.clear.length) rows.push(line('pr:finished', '', { controls: controls(view.prs.clear) }))
  if (view.prs.order)
    rows.push(
      line('pr:order', view.prs.order.title, {
        kind: 'heading',
        detail: [view.prs.order.why, view.prs.order.changed?.text].filter(Boolean).join(' · '),
        controls: controls(view.prs.order.changed?.actions ?? []),
        ...feedback('pr:order', !!view.prs.order.changed?.showsPress),
      }),
    )
  const other = otherPrsStart(view.prs.drawn)
  const sent = threadSentIn(view.lastActions)
  for (const drawn of view.prs.drawn) {
    const { pr, state } = drawn
    if (drawn === other) rows.push(line('other-prs', OTHER_PRS_TEXT, { kind: 'heading' }))
    const sync = prSyncOf(view.sync, pr.ref)
    const ready = shownReadiness(pr, sync, sent, agent) ?? readiness(pr, sent, agent)
    const settled = state.is !== 'open'
    rows.push(
      line(prMarkId(pr.ref), pr.title, {
        kind: 'block',
        number: `#${pr.number}`,
        isFirstBlock: drawn === view.prs.drawn[0],
        latestUndo: undo?.ref === pr.ref,
        href: safeLink(pr.url),
        color: toneColor(PR_TONES[ready.status]),
        detail: settled
          ? settledLabel(state.label, state.delivery, state.reply)
          : (shownReadiness(pr, sync, sent, agent)?.text ?? ''),
        controls: settled
          ? state.offersUndo
            ? controls([
                {
                  label: 'Undo',
                  press: { action: 'pr-undo', ref: pr.ref },
                  kind: 'mark',
                  emphasis: 'normal',
                  isOut: !state.canUndo,
                },
              ])
            : []
          : controls(prBlockActions(pr, sent, view.prs.branchRef, presses, sync), prPageEffect(pr)),
        ...feedback(prMarkId(pr.ref), isBlockPressShown(pr, view.lastActions)),
      }),
    )
    if (pr.error) rows.push(line(`${pr.ref}-error`, `Last refresh failed: ${pr.error}`, { failed: true }))
    const grouped = prBlockRows(pr, settled, {
      thread: t => {
        const text = threadRowText(pr, t, view.lastActions)
        return line(prThreadId(pr, t), text.title, {
          kind: 'thread',
          detail: [text.meta, text.fold?.note].filter(Boolean).join(' · '),
          folded: !!text.fold,
          quote: parts(clipLabel(commentParts(t.body).rest, PR_QUOTE_CHARS)),
          openDetail: `${threadWhere(t)} · @${t.author}`,
          reply: parts(
            t.reply ? `**@${t.reply.author}:** ${clipLabel(readableComment(t.reply.body), PR_QUOTE_CHARS)}` : '',
          ),
          mark: text.mark.text,
          color: toneColor(text.mark.tone),
          running: text.mark.isRunning,
          href: effectLink(commentEffect(pr, t)),
          controls: controls(threadActions(pr, t, presses), commentEffect(pr, t)),
          ...feedback(prThreadId(pr, t)),
        })
      },
      check: c => {
        const text = checkRowText(pr, c)
        return line(prCheckId(pr, c), [text.lead, text.title].filter(Boolean).join(' · '), {
          kind: 'check',
          openDetail: text.meta,
          detail: [text.meta, text.fold?.note].filter(Boolean).join(' · '),
          folded: !!text.fold,
          mark: text.mark.text,
          color: toneColor(text.mark.tone),
          running: text.mark.isRunning,
          href: effectLink(logEffect(pr, c)),
          controls: controls(checkActions(pr, c, presses), logEffect(pr, c)),
          ...feedback(prCheckId(pr, c)),
        })
      },
    })
    for (const name of ['threads', 'checks', 'cancelled'] as const) {
      if (!grouped[name].length) continue
      rows.push(line(`${pr.ref}-${name}`, PR_GROUP_TITLES[name], { kind: 'group' }), ...grouped[name])
    }
  }
  if (view.prs.olderText) rows.push(line('older-prs', view.prs.olderText))
  const waiting = new Map(prRowWaits(openPrViews(view.prs.drawn), view.lastActions).map(row => [row.id, row.isWaiting]))
  const selectable = rows.filter(row => row.kind === 'thread' || row.kind === 'check')
  for (const [index, row] of selectable.entries()) {
    row.waiting = waiting.get(row.id) ?? false
    row.next = selectable[steppedIndex(index, 1, selectable.length)]!.id
    row.previous = selectable[steppedIndex(index, -1, selectable.length)]!.id
  }
  const empty = emptyTab(view, {
    tab: 'prs',
    place: 'session',
    drawn: view.prs.drawn.length,
    isFetchingPrs: source.isFetching === true,
  })
  const notice = ghNoticeOf(view.prs.gh)
  return {
    prLines: rows,
    prNotice: notice?.text ?? '',
    prEmptyTitle: empty?.title ?? '',
    prEmptyHint: empty?.hint ?? '',
  }
}
