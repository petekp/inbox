import type { Closed, LastAction, Ledger, LocalResult } from '../types'
import { stepEffects, stepsOf } from './help-steps'
import type { HelpStep } from './help-steps'
import { closeFinding, closeItem, reopenFinding, reopenItem } from './ledger-close'
import { actionId, pressText } from './press-labels'
import { messages } from './press-messages'
import type { AnswerMessage, PressTexts } from './press-messages'
import type { Effect, PressResult } from './press-reducer'
import type { RowPress } from './presses'
import { goalPressed } from './goal-press'
import { GOAL_KEYS_ID } from './status-keys'

export function offersUndo(c: Pick<Closed, 'how'>): boolean {
  return c.how === 'done' || c.how === 'dismissed'
}

export function isUndoable(c: Pick<Closed, 'how' | 'isSentToAgent'>): boolean {
  return offersUndo(c) && !c.isSentToAgent
}

export function pendingResult(effects: Effect[], at: number, pressId?: string): LocalResult {
  return {
    state: 'pending',
    parts: effects.flatMap(e =>
      e.kind === 'send'
        ? []
        : [{ kind: e.kind, name: e.name, isCommand: e.kind === 'copy' && e.isCommand, error: null }],
    ),
    at,
    ...(pressId ? { pressId } : {}),
  }
}

export function localLast(
  last: LastAction | undefined,
  pressed: Pick<LastAction, 'action' | 'text'>,
  pending: LocalResult,
): LastAction {
  const result = { ...pending, action: pressed.action }

  return last && last.kind !== 'local' ? { ...last, result } : { kind: 'local', ...pressed, at: result.at, result }
}

export function retryOf(id: string, last: LastAction): RowPress | null {
  if (!/^[if]\d+$/.test(id)) return null
  const step = /^step-(\d+)$/.exec(last.action)
  if (step) return { action: 'step', id, step: Number(step[1]), label: last.text }
  switch (last.action) {
    case 'answer':
      return { action: 'answer', id, option: last.text }
    case 'explain':
    case 'compare':
    case 'address':
    case 'issue':
    case 'discuss':
      return { action: last.action, id }
    default:
      return null
  }
}

export function withLasts(
  lastActions: Record<string, LastAction>,
  lasts: Record<string, LastAction>,
  drop: string[],
  pressOrder?: number,
): Record<string, LastAction> {
  const merged = { ...lastActions }
  for (const [id, last] of Object.entries(lasts)) {
    const current = merged[id]
    if (pressOrder !== undefined && current?.pressOrder !== undefined && current.pressOrder > pressOrder) continue
    merged[id] = last
  }
  for (const id of drop) {
    const current = merged[id]
    if (pressOrder !== undefined && current?.pressOrder !== undefined && current.pressOrder > pressOrder) continue
    delete merged[id]
  }
  return merged
}

/** Whether `last` pressed this action and did not fail, so a press of it now repeats it. */
export function isRepeatOf(last: LastAction | undefined, action: string): boolean {
  return last?.action === action && last.kind !== 'local' && last.delivery?.state !== 'failed'
}

/** `previous` is the row's last press before this one. */
export function recordPress(
  kind: LastAction['kind'],
  action: string,
  text: string,
  ctx: { now: number; turnsStarted: number },
  previous?: LastAction,
): LastAction {
  return {
    kind,
    action,
    text,
    at: ctx.now,
    turnsStarted: ctx.turnsStarted,
    ...(isRepeatOf(previous, action) ? { isRepeat: true as const } : {}),
  }
}

export function pressed(
  ledger: Ledger,
  last: LastAction | undefined,
  p: RowPress,
  ctx: PressTexts & {
    now: number
    turnsStarted: number
    extraSteps: HelpStep[]
    localPressId?: string
  },
): PressResult {
  const stale = { stale: true as const }
  const answerMessage = ctx.answerMessage ?? messages.answer
  const record = (kind: LastAction['kind']) => recordPress(kind, actionId(p), pressText(p), ctx, last)
  const unchanged = { ledger, last: null, effects: [] }
  if (p.id === GOAL_KEYS_ID) return goalPressed(ledger, p, record, ctx.now)

  if (p.action === 'undo') {
    if (ledger.findings.some(f => f.id === p.id) && last?.action === 'address' && !last.isKept)
      return { ...unchanged, last: { ...last, isKept: true } }
    if (ledger.items.some(i => i.id === p.id) || ledger.findings.some(f => f.id === p.id)) return stale
    const closed = ledger.closed.findLast(c => c.id === p.id)
    if (closed?.item && isUndoable(closed)) return { ...unchanged, ledger: reopenItem(ledger, p.id), reopenedId: p.id }
    const closedFinding = ledger.closedFindings.findLast(f => f.id === p.id)
    if (closedFinding && isUndoable(closedFinding))
      return { ...unchanged, ledger: reopenFinding(ledger, p.id), reopenedId: p.id }
    return stale
  }

  const finding = ledger.findings.find(f => f.id === p.id)
  if (finding) {
    const sendFinding = (kind: 'talk' | 'handoff', text: string) => ({
      ledger,
      last: record(kind),
      effects: [{ kind: 'send' as const, text, by: null }],
    })
    switch (p.action) {
      case 'address': {
        const sent = sendFinding('handoff', messages.finding(finding, 'address'))
        const asker = ledger.items.find(i => i.id === finding.askedAs)

        return asker
          ? {
              ...sent,
              ledger: closeItem(ledger, asker.id, { how: 'update', outcome: `fix sent for ${finding.id}` }, ctx.now),
            }
          : sent
      }
      case 'issue':
        return sendFinding('handoff', messages.finding(finding, 'issue'))
      case 'explain':
        return sendFinding('talk', messages.finding(finding, 'explain'))
      case 'discuss':
        return sendFinding('talk', messages.finding(finding, 'discuss'))
      case 'type': {
        const words = p.text.trim()
        return words ? sendFinding('handoff', messages.finding(finding, 'typed', words)) : unchanged
      }
      case 'dismiss':
        return {
          ledger: closeFinding(ledger, p.id, { how: 'dismissed', outcome: 'dismissed' }, ctx.now),
          last: null,
          effects: [],
        }
      default:
        return stale
    }
  }

  const item = ledger.items.find(i => i.id === p.id)
  if (!item) return p.action === 'type' ? replyToClosed(ledger, p, record('handoff'), answerMessage) : stale
  const answered = (answer: string): PressResult => ({
    ledger: closeItem(ledger, item.id, { how: 'answered', outcome: answer }, ctx.now),
    last: record('mark'),
    effects: [{ kind: 'send', text: answerMessage(item, answer), by: { id: item.id, action: 'answer' } }],
  })
  switch (p.action) {
    case 'answer':
      return item.options.includes(p.option) ? answered(p.option) : stale
    case 'type': {
      const words = p.text.trim()
      if (!words) return unchanged
      const text = item.kind === 'question' ? answerMessage(item, words) : messages.taskReply(item, words)
      return { ledger, last: record('handoff'), effects: [{ kind: 'send', text, by: null }] }
    }
    case 'explain':
      return {
        ledger,
        last: record('talk'),
        effects: [{ kind: 'send', text: messages.explain(item), by: { id: item.id, action: 'explain' } }],
      }
    case 'compare':
      return {
        ledger,
        last: record('talk'),
        effects: [
          { kind: 'send', text: messages.compare(item, ctx.comparePage), by: { id: item.id, action: 'compare' } },
        ],
      }
    case 'done':
      return { ledger: closeItem(ledger, item.id, { how: 'done', outcome: 'done' }, ctx.now), last: null, effects: [] }
    case 'dismiss':
      return {
        ledger: closeItem(ledger, item.id, { how: 'dismissed', outcome: 'dismissed' }, ctx.now),
        last: null,
        effects: [],
      }
    case 'step': {
      const step = stepsOf(item, ctx.extraSteps)[p.step]
      if (!step || step.label !== p.label) return stale
      const effects = stepEffects(item, step)
      if (effects.some(e => e.kind === 'send')) return { ledger, last: record('handoff'), effects }
      return {
        ledger,
        last: localLast(
          last,
          { action: actionId(p), text: pressText(p) },
          pendingResult(effects, ctx.now, ctx.localPressId),
        ),
        effects,
      }
    }
    default:
      return stale
  }
}

/** Only a held row's field sends a typed reply to a closed row. The ledger stays as it is. */
function replyToClosed(
  ledger: Ledger,
  p: Extract<RowPress, { action: 'type' }>,
  last: LastAction,
  answerMessage: AnswerMessage,
): PressResult {
  const words = p.text.trim()
  const closed = ledger.closed.findLast(c => c.id === p.id)?.item
  const record = ledger.closedFindings.findLast(f => f.id === p.id)
  const text = closed
    ? closed.kind === 'question'
      ? answerMessage(closed, words)
      : messages.taskReply(closed, words)
    : record
      ? messages.finding(record, 'typed', words)
      : null
  if (text === null) return { stale: true }
  if (!words) return { ledger, last: null, effects: [] }

  return { ledger, last, effects: [{ kind: 'send', text, by: null }] }
}
