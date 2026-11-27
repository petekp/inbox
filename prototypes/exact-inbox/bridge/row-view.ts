import { UNDO_KEY } from '../../../core/view/help'
import type { PlannedKey, PlannedOption } from '../../../core/view/action-plan'
import type { PrPress } from '../../../core/view/pr-press'
import { latestUndo, steppedIndex } from '../../../core/view/action-plan'
import { createHash } from 'node:crypto'
import { rowKeyPlan } from '../../../core/view/action-plan'
import { rowFeedbackText, feedbackTone } from '../../../core/view/feedback'
import { toneColors } from '../../../core/view/tones'
import type { ToneName } from '../../../core/view/tones'
import { parseInline } from '../../../core/view/inline'
import { earlierLineText } from '../../../core/domain/earlier-answers'
import { groupEmptyText } from '../../../core/view/banners'
import { FINDING_GROUPS, NEEDS_YOU_MARKS } from '../../../core/view/help'
import { LEGACY_REMOTE_ACTIONS } from '../../../core/remote/remote-commands'
import {
  ROW_COPY,
  closedLinePlan,
  closedShown,
  closedTotal,
  earlierLabel,
  foldLabel,
  isWaitingRow,
  actionLabel,
  replyHint,
  rowMark,
  settledLabel,
  settledTone,
  closedTitleTone,
  shortAgo,
  waitingCount,
} from '../../../core/view/rows'
import type { RowView } from '../../../core/view/rows'
import type { SessionView } from '../../../core/view/session-view'
import type { Effect } from '../../../core/view/press-reducer'
import { stepEffects } from '../../../core/domain/help-steps'
import { previewEffects } from '../../../core/domain/option-previews'
import { pendingResult } from '../../../core/view/pressed'
import { feedbackText } from '../../../core/view/feedback'
import type { RowPress } from '../../../core/domain/presses'
import type { SessionBinding } from './binding'
import type { Result } from '../app.contract'

export type ViewIdentity = SessionBinding | string

type Inbox = Result<'loadInbox'>
type Row = Inbox['asks'][number]
type Button = Row['actions'][number]
type Group = Inbox['askGroups'][number]
export type AllowedAction = {
  press: RowPress | PrPress
  disabled: boolean
  localEffects?: Exclude<Effect, { kind: 'send' }>[]
}
type Allowed = Map<string, AllowedAction>
type Target = Pick<RowView, 'id' | 'title' | 'at' | 'item' | 'finding' | 'state' | 'feedback'>

function isDeviceLink(target: string): boolean {
  try {
    const url = new URL(target)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

export function toneColor(tone: ToneName | null | undefined): string {
  if (tone == null) return '-exact-secondary-label'
  const colors = toneColors(tone)
  return `light-dark(${colors.light}, ${colors.dark})`
}

function inlineParts(text: string): Row['titleParts'] {
  return parseInline(text).map((span, index) => ({
    id: String(index),
    text: span.text,
    bold: !!span.bold,
    italic: !!span.italic,
    code: !!span.code,
    strike: !!span.strike,
    href: span.link ?? '',
  }))
}

function keyFor(binding: ViewIdentity, generation: string, row: Target, press: RowPress, position: string): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        ...(typeof binding === 'string'
          ? [binding]
          : [
              binding.source,
              binding.socket,
              binding.appHome,
              binding.session,
              binding.terminal,
              binding.machineId ?? null,
            ]),
        generation,
        row.id,
        row.title,
        row.at,
        row.item,
        row.finding,
        row.state,
        row.feedback,
        press,
        position,
      ]),
    )
    .digest('hex')
}

function actionPlan(
  binding: ViewIdentity,
  version: string,
  row: RowView,
  all: boolean,
  allowed: Allowed,
  remoteActions: readonly string[],
): Button[] {
  const plan = rowKeyPlan(row, all)
  type Key = PlannedKey | ({ slot: 'answer' } & PlannedOption)
  const keys: Key[] =
    row.state.is === 'settled'
      ? row.actions.map(action => ({ slot: 'action', action, hotkey: UNDO_KEY }))
      : [...plan.options.map(option => ({ slot: 'answer' as const, ...option })), ...plan.keys, ...plan.more]
  return keys.map((p, index) => {
    if (p.slot === 'allOptions')
      return {
        key: `options:${row.id}`,
        label: p.label,
        emphasis: p.emphasis,
        primary: false,
        out: false,
        disabled: false,
        input: false,
        reason: '',
        command: 'options',
        icon: '',
        hotkey: '',
        pendingText: '',
      }
    const a = p.slot === 'retry' ? { ...p, isOut: false, isPrimary: false } : p.action
    const isLocal = a.kind === 'local'
    const effects = !isLocal
      ? []
      : a.press.action === 'step' && row.item && row.steps[a.press.step]
        ? stepEffects(row.item, row.steps[a.press.step]!)
        : a.press.action === 'previews' && row.item
          ? previewEffects(row.item)
          : []
    const localEffects = effects.filter((effect): effect is Exclude<Effect, { kind: 'send' }> => effect.kind !== 'send')
    const canRunLocally =
      isLocal &&
      localEffects.length > 0 &&
      localEffects.length === effects.length &&
      localEffects.every(
        effect =>
          effect.kind === 'copy' ||
          (effect.kind === 'open' && (isDeviceLink(effect.target) || !/^[a-z][a-z0-9+.-]*:/i.test(effect.target))),
      )
    const unsupported = !isLocal && !remoteActions.includes(a.press.action)
    const key = keyFor(binding, version, row, a.press, `${all ? 'all' : 'folded'}-${p.slot}-${index}`)
    const disabled = a.isOut || (isLocal && !canRunLocally) || unsupported
    allowed.set(key, { press: a.press, disabled, ...(canRunLocally ? { localEffects } : {}) })
    return {
      key,
      label: actionLabel(a),
      emphasis: a.emphasis,
      primary: a.emphasis === 'primary',
      out: a.isOut,
      disabled,
      input: a.press.action === 'type',
      reason:
        isLocal && !canRunLocally
          ? 'Open this on the agent’s computer.'
          : unsupported
            ? 'Unavailable on this connection.'
            : '',
      command: canRunLocally
        ? 'local'
        : a.press.action === 'type'
          ? 'reply'
          : a.press.action === 'undo'
            ? 'undo'
            : 'press',
      pendingText: canRunLocally ? feedbackText({ is: 'local', result: pendingResult(effects, 0) }, 'codex') : '',
      icon: a.icon ?? '',
      hotkey: 'hotkey' in p ? (p.hotkey ?? '') : '',
    }
  })
}

function projectRow(
  binding: ViewIdentity,
  version: string,
  row: RowView,
  allowed: Allowed,
  now: number,
  remoteActions: readonly string[],
  agent: string,
): Row {
  const shownActions = actionPlan(binding, version, row, false, allowed, remoteActions)
  const allActions = actionPlan(binding, version, row, true, allowed, remoteActions)
  const options = (all: boolean): Row['options'] =>
    rowKeyPlan(row, all).options.map((option, index) => ({
      id: `${index}:${option.action.press.option}`,
      label: option.action.label,
      button: (all ? allActions : shownActions)[index]!,
      body: inlineParts(option.note ?? ''),
      reason: [],
    }))
  const settled = row.state.is === 'settled' ? row.state : null
  const mark = rowMark(row)
  const tone: ToneName | null = settled
    ? closedTitleTone(settled) === 'error'
      ? 'errorMark'
      : (mark?.tone ?? null)
    : (mark?.tone ?? null)
  const hasOptions = rowKeyPlan(row, false).options.length > 0
  const hasTree =
    row.type === 'question' && !settled && Boolean(row.holdsUpLine || row.contextLine || row.earlierLine || hasOptions)
  return {
    latestUndo: false,
    next: '',
    previous: '',
    collapse: '',
    id: row.id,
    version,
    kind: row.type,
    title: row.title,
    detail: row.detail ?? '',
    context: row.contextLine ?? '',
    recommendation: rowKeyPlan(row, false)
      .options.flatMap(option => (option.note ? [`${option.action.label}: ${option.note}`] : []))
      .join('\n'),
    feedback: settled
      ? settledLabel(settled.label, settled.delivery, settled.reply)
      : (rowFeedbackText(row, 'codex') ?? ''),
    feedbackTone: settled
      ? closedTitleTone(settled) === 'error'
        ? 'error'
        : settledTone(settled)
      : feedbackTone(row.feedback),
    hasTree,
    state: row.state.is,
    mark: mark?.text ?? '',
    actions: allActions.map(action =>
      action.command === 'local'
        ? { ...action, disabled: true, reason: 'Open this from the agent’s computer.' }
        : action,
    ),
    shownActions,
    allActions,
    titleParts: inlineParts(row.title),
    detailParts: inlineParts(row.detail ?? ''),
    contextParts: inlineParts(row.contextLine ?? ''),
    holdsUpParts: inlineParts(row.holdsUpLine ?? ''),
    earlierParts: inlineParts(row.earlierLine ? earlierLineText(row.earlierLine) : ''),
    options: options(false),
    allOptions: options(true),
    replyHint: replyHint(row, agent),
    fileLabel: ROW_COPY.relevantFile,
    fileName: row.fileName ?? '',
    age: row.at === null ? '' : shortAgo(now - row.at),
    markTone: tone ?? '',
    markColor: toneColor(tone),
    waiting: isWaitingRow(row),
    running: mark?.isRunning ?? false,
  }
}

export function projectRowGroups(
  binding: ViewIdentity,
  view: SessionView,
  versions: Map<string, string>,
  allowed: Allowed,
  remoteActions: readonly string[] = LEGACY_REMOTE_ACTIONS,
  now = Date.now(),
  collapseFor: (id: string) => string = () => '',
  agent = 'the agent',
): Pick<Inbox, 'askGroups' | 'findingGroups'> {
  const group = (
    id: string,
    title: string,
    mark: string,
    tone: ToneName,
    rows: RowView[],
    closed: (SessionView['needsYou']['closed']['questions'][number] | SessionView['findings']['closed'][number])[],
  ): Group => {
    const drawn = new Set(rows.filter(row => row.state.is === 'settled').map(row => row.id))
    const total = closedTotal(closed, drawn)
    const closedRows = closedShown(closed, drawn, true).map(d => {
      const action = closedLinePlan(d).action
      const title = 'ask' in d ? d.ask : d.title
      const at = 'closedAt' in d ? d.closedAt : d.at
      const actions: Button[] = []
      if (action) {
        const target: Target = {
          id: d.id,
          title,
          at,
          item: 'item' in d ? (d.item ?? null) : null,
          finding: null,
          state: { is: 'open' },
          feedback: null,
        }
        const key = keyFor(binding, versions.get(d.id) ?? '', target, action.press, 'closed')
        allowed.set(key, { press: action.press, disabled: false })
        actions.push({
          key,
          label: action.label,
          emphasis: 'quiet',
          primary: false,
          out: false,
          disabled: false,
          input: false,
          reason: '',
          command: 'press',
          icon: '',
          hotkey: '',
          pendingText: '',
        })
      }
      return {
        id: d.id,
        version: versions.get(d.id) ?? '',
        title: inlineParts(title),
        outcome: settledLabel(d.outcomeLabel, d.delivery),
        mark: d.mark.text,
        tone: d.mark.tone ?? '',
        color: toneColor(d.mark.tone),
        age: shortAgo(now - at),
        actions,
      }
    })
    const shownIds = new Set(closedShown(closed, drawn).map(d => d.id))
    const shown = closedRows.filter(row => shownIds.has(row.id))
    return {
      id,
      title,
      mark,
      tone,
      color: toneColor(tone),
      count: waitingCount(rows),
      empty: rows.length === 0 ? groupEmptyText(title) : '',
      rows: rows.map(row => ({
        ...projectRow(binding, versions.get(row.id) ?? '', row, allowed, now, remoteActions, agent),
        collapse: collapseFor(row.id),
      })),
      closed: shown,
      closedAll: closedRows,
      closedLabel: total ? foldLabel(total) : '',
      earlierLabel: earlierLabel(total, shown.length) ?? '',
    }
  }
  const groups = {
    askGroups: [
      group(
        'questions',
        'Questions',
        NEEDS_YOU_MARKS.question.mark,
        NEEDS_YOU_MARKS.question.tone,
        view.needsYou.questions,
        view.needsYou.closed.questions,
      ),
      group(
        'tasks',
        'Tasks',
        NEEDS_YOU_MARKS.task.mark,
        NEEDS_YOU_MARKS.task.tone,
        view.needsYou.tasks,
        view.needsYou.closed.tasks,
      ),
    ],
    findingGroups: Object.entries(FINDING_GROUPS).map(([kind, info]) =>
      group(
        kind,
        info.title,
        info.mark,
        info.tone,
        view.findings.rows.filter(row => row.finding?.kind === kind),
        view.findings.closed.filter(row => row.kind === kind),
      ),
    ),
  }
  const sourceRows = [...view.needsYou.questions, ...view.needsYou.tasks, ...view.findings.rows]
  for (const listed of [groups.askGroups, groups.findingGroups]) {
    const rows = listed.flatMap(group => group.rows)
    const undo = latestUndo(
      rows.flatMap(row => {
        const source = sourceRows.find(value => value.id === row.id)
        const offered = row.shownActions.some(action => action.command === 'undo' && !action.disabled)
        return offered && source?.state.is === 'settled' ? [{ id: row.id, at: source.state.at }] : []
      }),
    )
    for (const [index, row] of rows.entries()) {
      row.latestUndo = row.id === undo?.id
      row.next = rows[steppedIndex(index, 1, rows.length)]!.id
      row.previous = rows[steppedIndex(index, -1, rows.length)]!.id
    }
  }
  return groups
}
