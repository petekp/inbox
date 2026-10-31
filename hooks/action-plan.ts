import type { Item, PressKind, Finding, LastAction } from '../types'
import { clipLabel } from './text'
import { actionId, ISSUE_LABEL } from './press-labels'
import { stepIconKind } from './help-steps'
import type { HelpStep } from './help-steps'
import type { RowPress } from './presses'
import { FINDING_GROUPS } from './help'
import { ROW_COPY, OPTIONS_FOLD_AT, OPTION_LABEL_CHARS, isWaitingRow } from './rows'
import type { RowState, ActionView, RowView, SettledState } from './rows'
import { pressOutAction, outAction, isAgain, fixLabel } from './feedback'
import type { Feedback } from './feedback'
import type { StatusRow, StatusPage } from './status-page'
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
  explain: 'e',
  compare: 'p',
  discuss: 'd',
  dismiss: 'x',
  discard: 'x',
}

export function actionsOf(
  row: { id: string; item: Item | null; finding: Finding | null; steps: HelpStep[] },
  last: LastAction | undefined,
  state: RowState,
  feedback: Feedback | null,
): ActionView[] {
  const { id, item, steps } = row
  const pressing = pressOutAction(last, feedback)
  const out = outAction(last, feedback)
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
        flags.isPrimary || press.action === 'done' || press.action === 'address'
          ? 'primary'
          : press.action === 'discuss' ||
              press.action === 'explain' ||
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
      isOut: out === pressAction,
    }
  }
  if (state.is === 'settled') return state.canUndo ? [action({ action: 'undo', id }, 'Undo', 'view')] : []
  if (state.is === 'held')
    return [
      action({ action: 'type', id, text: '' }, 'Reply', 'handoff'),
      action({ action: 'discard', id }, ROW_COPY.discard, 'view'),
    ]
  const stepActions = steps.map((s, n) => action({ action: 'step', id, step: n, label: s.label }, s.label, stepKind(s)))
  if (!item)
    return [
      action({ action: 'address', id }, row.finding ? fixLabel(row.finding) : 'Fix', 'handoff'),
      action({ action: 'issue', id }, ISSUE_LABEL, 'handoff'),
      action({ action: 'type', id, text: '' }, 'Reply', 'handoff'),
      action({ action: 'explain', id }, 'Explain', 'talk'),
      action({ action: 'discuss', id }, 'Discuss', 'talk'),
      action({ action: 'dismiss', id }, 'Dismiss', 'mark'),
    ]
  if (item.kind === 'task')
    return [
      ...stepActions,
      action({ action: 'done', id }, 'Done', 'mark'),
      action({ action: 'type', id, text: '' }, 'Reply', 'handoff'),
      action({ action: 'explain', id }, 'Explain', 'talk'),
      action({ action: 'dismiss', id }, 'Dismiss', 'mark'),
    ]
  const isFolding = item.options.length > OPTIONS_FOLD_AT
  const options =
    item.rec && item.options.includes(item.rec) ? [item.rec, ...item.options.filter(o => o !== item.rec)] : item.options

  return [
    ...options.map((option, n) =>
      action({ action: 'answer', id, option }, clipLabel(option, OPTION_LABEL_CHARS), 'mark', {
        isPrimary: option === item.rec,
        isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1,
      }),
    ),
    ...stepActions,
    action({ action: 'type', id, text: '' }, 'Reply', 'mark'),
    action({ action: 'explain', id }, 'Explain', 'talk'),
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

export type RowWait = { id: string; isWaiting: boolean }

export function listWaits(v: InboxView): { needsYou: RowWait[]; findings: RowWait[] } {
  const lists = drawnLists(
    v,
    () => true,
    r => r,
  )
  const waits = (entries: DrawnEntry<RowView>[]) =>
    entries.map(x =>
      'row' in x ? { id: x.row.id, isWaiting: isWaitingRow(x.row) } : { id: x.settled.id, isWaiting: false },
    )

  return { needsYou: waits([...lists.questions, ...lists.tasks]), findings: waits(lists.findings) }
}

export function firstWaiting(rows: RowWait[]): string | null {
  return rows.find(r => r.isWaiting)?.id ?? null
}

export function keptOpen(rows: RowWait[], added: readonly string[]): string | null {
  return firstWaiting(rows.filter(r => !added.includes(r.id)))
}

export function rowAfterClose(rows: RowWait[], closedId: string): string | null {
  const at = rows.findIndex(r => r.id === closedId)
  if (at < 0) return null

  return (
    (
      rows.slice(at + 1).find(r => r.isWaiting) ??
      rows
        .slice(0, at)
        .reverse()
        .find(r => r.isWaiting)
    )?.id ?? null
  )
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
  | {
      slot: 'choice'
      action: ActionView & { press: Extract<RowPress, { action: 'answer' | 'step' }> }
      hotkey?: string
    }
  | { slot: 'allOptions'; count: number; label: string; emphasis: 'quiet' }
  | ActionKey

export function rowKeyPlan(r: RowView, isAllShown: boolean): { keys: PlannedKey[]; more: ActionKey[] } {
  const shown = r.actions.filter(a => isAllShown || !a.isFolded)
  const folded = r.actions.length - shown.length
  const lastOption = shown.map(a => a.press.action).lastIndexOf('answer')
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
      keys.push({ slot: 'choice', action: { ...a, press }, ...hotkey })
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

  return { keys, more }
}

/** A press on a Status row. `show-ask` opens Asks with that ask selected, and sends nothing. */
type StatusPress = { action: 'show-ask'; askId: string }

type StatusKey = { press: StatusPress; label: string; hotkey: string; kind: PressKind }

/** The View button's label, by the kind of ask it opens. */
const VIEW_ASK_LABELS: Record<Item['kind'], string> = { question: 'View question', task: 'View task' }

/** A Status row's buttons, in the order every look draws them. A row with none takes no press. */
export function statusKeyPlan(row: StatusRow): StatusKey[] {
  if (row.kind !== 'subject' || row.ask === null) return []

  return [
    {
      press: { action: 'show-ask', askId: row.ask.id },
      label: VIEW_ASK_LABELS[row.ask.kind],
      hotkey: 'v',
      kind: 'view',
    },
  ]
}

/** The Status rows that have buttons, in page order: the rows j and k move between. */
export function statusKeyRows(page: StatusPage): StatusRow[] {
  return page.rows.filter(r => statusKeyPlan(r).length > 0)
}

/** The Status row whose keys work: the selected row while it still has buttons, else the first row that has. */
export function statusSelected(page: StatusPage, selectedId: string | null): StatusRow | null {
  const rows = statusKeyRows(page)

  return rows.find(r => r.id === selectedId) ?? rows[0] ?? null
}

/** Widths in a look's own unit. `separator` is the extra room a look draws between the buttons and the follow-ups when they share a line. */
type ActionSpacing = { width: number; gap: number; separator: number }

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
