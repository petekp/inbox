import type { Item, PressKind, Finding, LastAction, Tab } from '../../types'
import { actionId, ISSUE_LABEL, SHOW_EXPLANATION_LABEL } from '../domain/press-labels'
import { stepIconKind } from '../domain/help-steps'
import { OPEN_PREVIEWS_LABEL } from '../domain/option-previews'
import type { HelpStep } from '../domain/help-steps'
import type { RowPress } from '../domain/presses'
import type { PrPress } from './pr-press'
import type { DrawnPr } from './pr-views'
import { FINDING_GROUPS } from './help'
import { ROW_COPY, OPTIONS_FOLD_AT, isWaitingRow, optionNote, optionReasonLine } from './rows'
import type { RowState, ActionView, RowView, SettledState } from './rows'
import { pressOutAction, outAction, isAgain, fixLabel, isStoppedSession } from './feedback'
import type { Feedback } from './feedback'
import type { InboxView } from './view'

// The digits switch tabs, and the letters left out are the
// keys of an Asks row's other actions and of moving the selection.
const CHOICE_KEYS = [...'abcfghilm']

function showsCompare(item: Pick<Item, 'kind' | 'options' | 'isDesignChoice'>): boolean {
  return item.kind === 'question' && item.isDesignChoice === true && item.options.length >= 2
}

function stepKind(step: HelpStep): PressKind {
  return step.step.some(h => h.kind === 'run') ? 'handoff' : 'local'
}

const FOLLOW_UPS: ReadonlySet<RowPress['action']> = new Set([
  'type',
  'show-explanation',
  'explain',
  'compare',
  'discuss',
  'dismiss',
  'discard',
])
const ACTION_KEYS: Partial<Record<RowPress['action'], string>> = {
  done: 'd',
  address: 'a',
  issue: 'i',
  type: 't',
  'show-explanation': 's',
  explain: 'e',
  compare: 'p',
  previews: 'o',
  discuss: 'd',
  dismiss: 'x',
  discard: 'x',
}

export type ShownUndo = { press: RowPress | PrPress; at: number }

/** The Undo the undo key presses: the one of the shown tab's Undos whose row closed last. */
export function latestUndo<U extends { at: number }>(undos: readonly U[]): U | null {
  return undos.reduce<U | null>((latest, u) => (latest === null || u.at >= latest.at ? u : latest), null)
}

/** The Undos a row tab draws: one on each settled row or PR that still offers it. */
export function tabUndos(tab: Tab, lists: DrawnLists<unknown>, prs: readonly DrawnPr[]): ShownUndo[] {
  return tab === 'prs'
    ? prUndos(prs)
    : listUndos(tab === 'needsYou' ? [...lists.questions, ...lists.tasks] : lists.findings)
}

function listUndos(entries: readonly DrawnEntry<unknown>[]): ShownUndo[] {
  return entries.flatMap(x => {
    const undo = 'settled' in x ? x.settled.actions.find(a => a.press.action === 'undo') : undefined
    return undo && 'settled' in x ? [{ press: undo.press, at: x.state.at }] : []
  })
}

function prUndos(prs: readonly DrawnPr[]): ShownUndo[] {
  return prs.flatMap(d =>
    d.state.is === 'settled' && d.state.canUndo
      ? [{ press: { action: 'pr-undo', ref: d.pr.ref }, at: d.state.at }]
      : [],
  )
}

export function actionsOf(
  row: { id: string; item: Item | null; finding: Finding | null; steps: HelpStep[] },
  last: LastAction | undefined,
  state: RowState,
  feedback: Feedback | null,
  isUndoOut = false,
  canScrollConversation = false,
): ActionView[] {
  const { id, item, steps } = row
  const pressing = pressOutAction(last, feedback)
  const out = outAction(last, feedback)
  const isFirstExplanationOut = last?.explanation?.isFirstReply === true && pressing === 'explain'
  const isExplanationShown = canScrollConversation && last?.explanation?.replyId !== undefined && !isFirstExplanationOut
  const action = (
    press: RowPress,
    label: string,
    kind: PressKind,
    flags: Partial<Pick<ActionView, 'isPrimary' | 'isFolded'>> = {},
  ): ActionView => {
    const pressAction = actionId(press)

    return {
      press,
      label: press.action !== 'type' && isAgain(last, pressAction, pressing === pressAction) ? `${label} again` : label,
      kind,
      emphasis:
        flags.isPrimary || press.action === 'address'
          ? 'primary'
          : press.action === 'type' ||
              press.action === 'discuss' ||
              press.action === 'explain' ||
              press.action === 'show-explanation' ||
              press.action === 'compare' ||
              press.action === 'dismiss' ||
              press.action === 'discard'
            ? 'quiet'
            : 'normal',
      ...(press.action === 'done'
        ? { icon: 'done' as const }
        : press.action === 'step' && stepIconKind(steps[press.step])
          ? { icon: stepIconKind(steps[press.step])! }
          : {}),
      isPrimary: flags.isPrimary ?? false,
      isFolded: flags.isFolded ?? false,
      isFollowUp: FOLLOW_UPS.has(press.action),
      ...(ACTION_KEYS[press.action] ? { hotkey: ACTION_KEYS[press.action] } : {}),
      isOut: out === pressAction || (press.action === 'undo' && isUndoOut),
    }
  }
  if (state.is === 'settled')
    return state.canUndo || (state.offersUndo && isUndoOut)
      ? [action({ action: 'undo', id }, ROW_COPY.undo, 'view')]
      : []
  if (state.is === 'held')
    return [
      action({ action: 'type', id, text: '' }, 'Reply', 'handoff'),
      action({ action: 'discard', id }, ROW_COPY.discard, 'view'),
    ]
  const stepActions = steps.map((s, n) => action({ action: 'step', id, step: n, label: s.label }, s.label, stepKind(s)))
  const explainActions = [
    ...(isExplanationShown ? [action({ action: 'show-explanation', id }, SHOW_EXPLANATION_LABEL, 'local')] : []),
    action({ action: 'explain', id }, 'Explain', 'talk'),
  ]
  if (!item)
    return [
      action({ action: 'address', id }, row.finding ? fixLabel(row.finding) : 'Fix', 'handoff'),
      action({ action: 'issue', id }, ISSUE_LABEL, 'handoff'),
      action({ action: 'type', id, text: '' }, 'Reply', 'handoff'),
      ...explainActions,
      action({ action: 'discuss', id }, 'Discuss', 'talk'),
      action({ action: 'dismiss', id }, 'Dismiss', 'mark'),
    ]
  const isFolding = item.options.length > OPTIONS_FOLD_AT
  if (item.kind === 'task')
    return [
      ...stepActions,
      ...(item.options.length > 0
        ? item.options.map((option, n) =>
            action({ action: 'answer', id, option }, option, 'mark', {
              isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1,
            }),
          )
        : [action({ action: 'done', id }, 'Done', 'mark')]),
      action({ action: 'type', id, text: '' }, 'Reply', 'handoff'),
      ...explainActions,
      action({ action: 'dismiss', id }, 'Dismiss', 'mark'),
    ]
  const options =
    item.rec && item.options.includes(item.rec) ? [item.rec, ...item.options.filter(o => o !== item.rec)] : item.options

  return [
    ...options.map((option, n) =>
      action({ action: 'answer', id, option }, option, 'mark', {
        isPrimary: option === item.rec,
        isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1,
      }),
    ),
    ...(item.previewPage ? [action({ action: 'previews', id }, OPEN_PREVIEWS_LABEL, 'local')] : []),
    ...stepActions,
    action({ action: 'type', id, text: '' }, 'Reply', 'mark'),
    ...explainActions,
    ...(showsCompare(item) ? [action({ action: 'compare', id }, 'Compare', 'talk')] : []),
    action({ action: 'dismiss', id }, 'Dismiss', 'mark'),
  ]
}

export type DrawnEntry<R> = { row: R } | { settled: RowView; state: SettledState }

export type DrawnLists<R> = {
  questions: DrawnEntry<R>[]
  tasks: DrawnEntry<R>[]
  findings: DrawnEntry<R>[]
  findingGroups: { kind: Finding['kind']; title: string; entries: DrawnEntry<R>[] }[]
  byTab: { needsYou: R[]; findings: R[] }
}

export function drawnLists<R>(
  v: InboxView,
  isSettledDrawn: (id: string) => boolean,
  toRow: (r: RowView) => R | null,
): DrawnLists<R> {
  const entries = (rows: RowView[]) =>
    rows.flatMap((r): DrawnEntry<R>[] => {
      if (r.state.is === 'settled') return isSettledDrawn(r.id) ? [{ settled: r, state: r.state }] : []
      const row = toRow(r)
      return row === null ? [] : [{ row }]
    })
  const questions = entries(v.needsYou.questions)
  const tasks = entries(v.needsYou.tasks)
  const findingGroups = (Object.keys(FINDING_GROUPS) as Finding['kind'][]).map(kind => ({
    kind,
    title: FINDING_GROUPS[kind].title,
    entries: entries(v.findings.rows.filter(r => r.finding?.kind === kind)),
  }))
  const findings = findingGroups.flatMap(g => g.entries)

  return {
    questions,
    tasks,
    findings,
    findingGroups,
    byTab: { needsYou: [...rowsIn(questions), ...rowsIn(tasks)], findings: rowsIn(findings) },
  }
}

export function entryId(x: DrawnEntry<{ id: string }>): string {
  return 'row' in x ? x.row.id : x.settled.id
}

/** A listed row, whether it waits on the person, and whether they collapsed it, so no rule opens it for them. */
export type RowWait = { id: string; isWaiting: boolean; isCollapsed?: boolean }

const opensFor = (r: RowWait) => r.isWaiting && !r.isCollapsed

export function listWaits(v: InboxView): { needsYou: RowWait[]; findings: RowWait[] } {
  const lists = drawnLists(
    v,
    () => true,
    r => r,
  )
  const collapsed = new Set(v.collapsed)
  const waits = (entries: DrawnEntry<RowView>[]) =>
    entries.map(x =>
      'row' in x
        ? { id: x.row.id, isWaiting: isWaitingRow(x.row), isCollapsed: collapsed.has(x.row.id) }
        : { id: x.settled.id, isWaiting: false },
    )

  return { needsYou: waits([...lists.questions, ...lists.tasks]), findings: waits(lists.findings) }
}

export function firstWaiting(rows: RowWait[]): string | null {
  return rows.find(opensFor)?.id ?? null
}

/**
 * The row to hold open once `added` arrive, or null to leave the cursor as it is. With no row picked, `picked` null,
 * it is the row open before they came (`keptOpen`). With the picked row collapsed, it is the first new row that waits.
 */
export function openOnArrival(rows: RowWait[], picked: string | null, added: readonly string[]): string | null {
  if (added.length === 0) return null
  if (picked === null) return keptOpen(rows, added)

  return drawsOpen(rows, picked) ? null : firstWaiting(rows.filter(r => added.includes(r.id)))
}

/** Whether the selected row `id` draws open: a collapsed row stays closed while it is selected. */
function drawsOpen(rows: RowWait[], id: string | null): boolean {
  return id !== null && !rows.find(r => r.id === id)?.isCollapsed
}

/**
 * The index `step` places from `at` in a list of `count`, wrapping past either end. With nothing selected, as `at` -1,
 * a step forward selects the first and a step back the last. -1 for an empty list.
 */
export function steppedIndex(at: number, step: number, count: number): number {
  if (count === 0) return -1
  const from = at < 0 ? (step > 0 ? -1 : 0) : at

  return (((from + step) % count) + count) % count
}

export function keptOpen(rows: RowWait[], added: readonly string[]): string | null {
  return firstWaiting(rows.filter(r => !added.includes(r.id)))
}

export function rowAfterClose(rows: RowWait[], closedId: string): string | null {
  const at = rows.findIndex(r => r.id === closedId)
  if (at < 0) return null

  return (rows.slice(at + 1).find(opensFor) ?? rows.slice(0, at).reverse().find(opensFor))?.id ?? null
}

export function rowsIn<R>(entries: DrawnEntry<R>[]): R[] {
  return entries.flatMap(x => ('row' in x ? [x.row] : []))
}

export function settledIn(entries: DrawnEntry<unknown>[]): Set<string> {
  return new Set(entries.flatMap(x => ('settled' in x ? [x.settled.id] : [])))
}

type ActionKey = { slot: 'action'; action: ActionView; hotkey: string }

export type PlannedKey =
  | { slot: 'retry'; press: RowPress; kind: PressKind; label: string; emphasis: 'normal'; icon: 'retry' }
  /** A step, or a task's result, which takes the place of Done. */
  | {
      slot: 'choice'
      action: ActionView & { press: Extract<RowPress, { action: 'step' | 'answer' }> }
      hotkey?: string
    }
  | { slot: 'allOptions'; count: number; label: string; emphasis: 'quiet' }
  | ActionKey

/** An answer option: its button, drawn where the option sits in a question's tree, and the note drawn under it. */
export type PlannedOption = {
  action: ActionView & { press: Extract<RowPress, { action: 'answer' }> }
  note: string | null
  hotkey?: string
}

/** The button that shows the session a message was not sent to, so the person can type there. */
type SessionKey = { label: string; emphasis: 'normal' }

/**
 * A row's options, then its keys, then its follow-ups. A look draws each option as its button in the question's tree
 * with its note under it, in this order. Then it draws the keys, and the follow-ups in one group after them. A task's
 * results are keys after its steps, since a task has no tree of answers. A look that shows a session from outside it,
 * as the Herdr look does, passes `canShowSession`. On a row whose message did not send because the person stopped the
 * session, it then draws `sessionKey` first among the keys.
 */
export function rowKeyPlan(
  r: RowView,
  isAllShown: boolean,
  canShowSession = false,
): {
  options: PlannedOption[]
  keys: PlannedKey[]
  more: ActionKey[]
  answerRow: AnswerRow | null
  sessionKey: SessionKey | null
} {
  const shown = r.actions.filter(a => isAllShown || !a.isFolded)
  const folded = r.actions.length - shown.length
  const lastOption = shown.map(a => a.press.action).lastIndexOf('answer')
  const options: PlannedOption[] = []
  const keys: PlannedKey[] = []
  const more: ActionKey[] = []
  const retry = r.feedback?.is === 'notSent' ? r.feedback.retry : null
  if (retry) {
    const kind = r.actions.find(a => actionId(a.press) === actionId(retry))?.kind ?? 'talk'
    keys.push({ slot: 'retry', press: retry, kind, label: ROW_COPY.retry, emphasis: 'normal', icon: 'retry' })
  }
  let letters = 0
  for (const [n, a] of shown.entries()) {
    const { press } = a
    if (press.action === 'answer' || press.action === 'step') {
      const hotkey = letters < CHOICE_KEYS.length ? { hotkey: CHOICE_KEYS[letters++]! } : {}
      if (press.action === 'answer' && r.type !== 'task') {
        const note = optionNote(r.optionDescriptions.find(d => d.option === press.option))
        options.push({ action: { ...a, press }, note, ...hotkey })
      } else keys.push({ slot: 'choice', action: { ...a, press }, ...hotkey })
      if (n === lastOption && folded > 0)
        keys.push({
          slot: 'allOptions',
          count: r.actions.filter(x => x.press.action === 'answer').length,
          label: ROW_COPY.allOptions(r.actions.filter(x => x.press.action === 'answer').length),
          emphasis: 'quiet',
        })
    } else if (a.hotkey)
      (a.isFollowUp ? more : keys).push({
        slot: 'action',
        action: a,
        hotkey: a.hotkey,
      })
  }

  const sessionKey: SessionKey | null =
    canShowSession && isStoppedSession(r.feedback) ? { label: ROW_COPY.goToSession, emphasis: 'normal' } : null

  return { options, keys, more, answerRow: answerRowOf(r, options), sessionKey }
}

/** Widths in a look's own unit. `separator` is the extra room a look draws between the buttons and the follow-ups when they share a line. */
type ActionSpacing = { width: number; gap: number; separator: number }

/**
 * A question's answers drawn side by side on one line, under one arm of its tree, with `recLine`, the recommendation's
 * reason, on one line under them. A plan offers it when two or more answers show and none has a description of its own.
 * A look draws it only when `answersFitLine` says the answers fit its text column, and else stacks each answer on its
 * own arm with its note under it.
 */
export type AnswerRow = { recLine: string | null }

function answerRowOf(r: RowView, options: PlannedOption[]): AnswerRow | null {
  const described = options.map(o => r.optionDescriptions.find(d => d.option === o.action.press.option))
  const hasDescription = described.some(d => d !== undefined && d.description !== null)
  if (options.length < 2 || hasDescription) return null

  return { recLine: described.map(d => (d ? optionReasonLine(d) : null)).find(l => l !== null) ?? null }
}

/** Whether buttons `widths` wide fit side by side on a line `room` wide, `gap` apart, in one unit a look picks. */
export function answersFitLine(widths: readonly number[], gap: number, room: number): boolean {
  return widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, widths.length - 1) <= room
}

/**
 * Lays out a row's buttons, then its follow-ups, filling each line before the next. The follow-ups stay on the
 * buttons' last line only when all of them fit there. Otherwise they start the next line together, and wrap among
 * themselves. Each line lists indexes into the buttons followed by the follow-ups.
 */
export function actionLines(
  keys: readonly number[],
  more: readonly number[],
  { width, gap, separator }: ActionSpacing,
): { lines: number[][]; isFollowUpLineNew: boolean } {
  const lines: number[][] = []
  let used = 0
  const place = (at: number, size: number, before: number) => {
    const line = lines.at(-1)
    if (line && used + before + size <= width) {
      line.push(at)
      used += before + size
    } else {
      lines.push([at])
      used = size
    }
  }
  keys.forEach((size, i) => place(i, size, gap))
  const followUpsWidth = more.reduce((sum, size) => sum + size, gap * Math.max(0, more.length - 1))
  const isFollowUpLineNew = keys.length > 0 && more.length > 0 && used + gap + separator + followUpsWidth > width
  more.forEach((size, i) => {
    if (i === 0 && isFollowUpLineNew) {
      lines.push([keys.length])
      used = size
    } else place(keys.length + i, size, i === 0 ? gap + separator : gap)
  })

  return { lines, isFollowUpLineNew }
}
