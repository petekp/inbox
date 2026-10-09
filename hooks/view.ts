// The inbox as every host draws it: the Needs you order and count, question
// handles, which rows are handed off, and the item status. The band, the pane,
// the sidebar line, row navigation and the Codex tab all read this, so they agree.
// Pure: it reads only its arguments, and imports nothing from the engine.

import type { Finding, Item, LastAction, Ledger, LocalResult, PressKind, RowNote } from '../types'
import { latestBatch, questionNumbers } from './ledger'
import { actionId, clipLabel, isHandedOff, noteText, stepsOf } from './presses'
import type { HelpStep, RowPress } from './presses'

/** A question with more options than this shows the first 4 and [All N options]. */
export const OPTIONS_FOLD_AT = 5
/** How long a row that just closed stays in its place, and a row's note shows. */
export const SETTLED_MS = 5120

/** The turn counts a handed-off row folds by. */
export type Turns = { turnsStarted: number; turnsApplied: number }

/** When the item list last changed, whether its source is working, and its error, if any. */
export type ItemStatus = { changedAt: number | null; isUpdating: boolean; error: string | null }

export type ViewInput = {
  ledger: Ledger
  /** Each row's last press, by row id. */
  lastActions: Record<string, LastAction>
  /** Each row's latest note, by row id. Codex keeps its notes in the tab and passes {}. */
  notes: Record<string, RowNote>
  turns: Turns
  /** Per item id, steps a host adds beyond the item's own helps: the mod's "Open PR #N". */
  extraSteps: Record<string, HelpStep[]>
  status: ItemStatus
  now: number
}

/** A handed-off row stays in its place, folded, and leaves the count. */
export type RowState = { is: 'open' } | { is: 'handedOff' }

/**
 * What a row says about its last press: "✓ Explain · 1m ago". A Talk or Hand-off ✓
 * stays. A Local press's result shows while pending, for SETTLED_MS once done,
 * and until the next press once failed. A newer note shows in their place for SETTLED_MS.
 */
export type Feedback =
  | { is: 'done'; label: string; at: number }
  | { is: 'local'; result: LocalResult }
  | { is: 'note'; note: RowNote['note']; at: number }

/** Where a row is drawn, which decides some of its words: the mod in a terminal or the desktop app, or an HTML view. */
export type Look = 'terminal' | 'desktop' | 'html'

export type ActionView = {
  press: RowPress
  /** "Explain", or "Explain again" when the row's last action was this one. */
  label: string
  kind: PressKind
  /** The option Claude recommended. */
  isPrimary: boolean
  /** An option behind [All N options]. */
  isFolded: boolean
}

export type RowView = {
  id: string
  type: 'question' | 'task' | 'finding'
  /** "1)" for a question a typed number answers now, "?" for any other question, "•" for a task or finding. */
  handle: string
  title: string
  at: number | null
  item: Item | null
  finding: Finding | null
  /** The item's own steps, then the host's extra ones. */
  steps: HelpStep[]
  state: RowState
  feedback: Feedback | null
  /** Every action the row offers, every option included, in UI 2.4's order. Key letters are each renderer's. */
  actions: ActionView[]
}

export type InboxView = {
  needsYou: {
    /** Open questions, and open tasks that are not handed off. */
    count: number
    /** The first row that counts. */
    topId: string | null
    questions: RowView[]
    tasks: RowView[]
  }
  /** Newest first. The count leaves out handed-off findings. */
  findings: { count: number; rows: RowView[] }
  status: ItemStatus
}

const UPDATE_FAILED = 'Last update failed. Items from that reply may be missing.'
const UPDATE_RETRIES = ' It retries after your next message.'

/**
 * The open items in the order Needs you lists them. Questions: the latest
 * batch's in the order Claude asked them, then the rest newest first. Tasks:
 * oldest first.
 */
export function needsYouOrder(ledger: Ledger): { questions: Item[]; tasks: Item[] } {
  const latest = new Set(latestBatch(ledger).map(i => i.id))
  const questions = ledger.items.filter(i => i.kind === 'question')

  return {
    questions: [
      ...questions.filter(i => latest.has(i.id)),
      ...questions.filter(i => !latest.has(i.id)).sort((a, b) => b.turn - a.turn),
    ],
    tasks: ledger.items.filter(i => i.kind === 'task').sort((a, b) => a.turn - b.turn),
  }
}

/**
 * A row's feedback: its note while the note is newer than its last press and
 * younger than SETTLED_MS; else its Local result while that shows; else its
 * last Talk, Hand-off or Mark press.
 */
export function feedbackOf(last: LastAction | undefined, note: RowNote | undefined, now: number): Feedback | null {
  const result = last?.result
  if (note && now - note.at < SETTLED_MS && note.at >= Math.max(last?.at ?? 0, result?.at ?? 0))
    return { is: 'note', note: note.note, at: note.at }
  if (result && (result.state !== 'done' || now - result.at < SETTLED_MS)) return { is: 'local', result }

  return last && last.kind !== 'local' ? { is: 'done', label: last.text, at: last.at } : null
}

/** Feedback that reports a failure, which a row draws in red. */
export function isFailure(f: Feedback | null): boolean {
  return f?.is === 'local' && f.result.state === 'failed'
}

// Where a copied command runs. The desktop app's composer is not known to take "!" for shell mode.
const RUN_IT: Record<Look, string> = {
  terminal: 'Run it in a terminal, or type ! and paste.',
  desktop: 'Run it in Terminal.',
  html: 'Run it in Terminal.',
}
const VERBS = {
  open: { pending: 'Opening', done: 'Opened', failed: 'open' },
  copy: { pending: 'Copying', done: 'Copied', failed: 'copy' },
}

/**
 * A Local result as its row reads it: "Opening .env…", "✓ Copied the key ·
 * Opened .env", or "Could not open .env: it no longer exists". Several PRs
 * one step opens read as one count, "✓ Opened 3 PRs".
 */
function localText(r: LocalResult, look: Look): string {
  const isPrs =
    r.parts.length > 1 && r.parts.every(p => p.kind === 'open' && p.error === null && /^PR #\d+$/.test(p.name))
  const parts = isPrs ? [{ ...r.parts[0]!, name: `${r.parts.length} PRs` }] : r.parts
  if (r.state === 'pending') return `${parts.map(p => `${VERBS[p.kind].pending} ${p.name}`).join(' · ')}…`
  const text = parts
    .map(p =>
      p.error === null ? `${VERBS[p.kind].done} ${p.name}` : `Could not ${VERBS[p.kind].failed} ${p.name}: ${p.error}`,
    )
    .join(' · ')
  if (r.state === 'failed') return text
  const isCommand = parts.some(p => p.kind === 'copy' && p.isCommand)

  return `✓ ${text}${isCommand ? `. ${RUN_IT[look]}` : ''}`
}

/** Feedback as a row reads it, before any age. */
export function feedbackText(f: Feedback, look: Look): string {
  if (f.is === 'note') return noteText(f.note)
  if (f.is === 'local') return localText(f.result, look)

  return `✓ ${f.label}`
}

/** A step's kind: one that asks Claude to run a command hands the row off; the rest open or copy. */
function stepKind(step: HelpStep): PressKind {
  return step.step.some(h => h.kind === 'run') ? 'handoff' : 'local'
}

/**
 * A row's actions in UI 2.4's order, each labeled "… again" when the row's
 * last press, other than an open or copy, was that action.
 */
function actionsOf(
  row: { id: string; item: Item | null; steps: HelpStep[] },
  last: LastAction | undefined,
): ActionView[] {
  const { id, item, steps } = row
  const action = (
    press: RowPress,
    label: string,
    kind: PressKind,
    flags: Partial<Pick<ActionView, 'isPrimary' | 'isFolded'>> = {},
  ): ActionView => ({
    press,
    // The type action opens a field for new words each time, and an open or copy
    // only shows its result, so neither reads "again".
    label:
      press.action !== 'type' && last?.kind !== 'local' && last?.action === actionId(press) ? `${label} again` : label,
    kind,
    isPrimary: flags.isPrimary ?? false,
    isFolded: flags.isFolded ?? false,
  })
  const stepActions = steps.map((s, n) => action({ action: 'step', id, step: n, label: s.label }, s.label, stepKind(s)))
  if (!item)
    return [
      action({ action: 'address', id }, 'Address', 'handoff'),
      action({ action: 'discuss', id }, 'Discuss', 'talk'),
      action({ action: 'type', id, text: '' }, 'Type a reply', 'handoff'),
      action({ action: 'dismiss', id }, 'Dismiss', 'mark'),
    ]
  if (item.kind === 'task')
    return [
      ...stepActions,
      action({ action: 'done', id }, 'Done', 'mark'),
      action({ action: 'type', id, text: '' }, 'Type a reply', 'handoff'),
      action({ action: 'explain', id }, 'Explain', 'talk'),
    ]
  const isFolding = item.options.length > OPTIONS_FOLD_AT

  return [
    ...item.options.map((option, n) =>
      action({ action: 'answer', id, option }, clipLabel(option, 32), 'mark', {
        isPrimary: option === item.rec,
        isFolded: isFolding && n >= OPTIONS_FOLD_AT - 1,
      }),
    ),
    ...stepActions,
    action({ action: 'type', id, text: '' }, 'Type an answer', 'mark'),
    action({ action: 'explain', id }, 'Explain', 'talk'),
    action({ action: 'dismiss', id }, 'Dismiss', 'mark'),
  ]
}

export function inboxView({ ledger, lastActions, notes, turns, extraSteps, status, now }: ViewInput): InboxView {
  const { questions, tasks } = needsYouOrder(ledger)
  // The number the person's next prompt answers each question by.
  const numbers = questionNumbers(ledger, ledger.turn + 1)
  const stateOf = (id: string): RowState => (isHandedOff(lastActions[id], turns) ? { is: 'handedOff' } : { is: 'open' })
  const itemRow = (item: Item): RowView => {
    const n = numbers.get(item.id)
    const steps = stepsOf(item, extraSteps[item.id] ?? [])

    return {
      id: item.id,
      type: item.kind,
      handle: item.kind === 'task' ? '•' : n === undefined ? '?' : `${n})`,
      title: item.ask,
      at: item.at,
      item,
      finding: null,
      steps,
      // Questions never fold.
      state: item.kind === 'task' ? stateOf(item.id) : { is: 'open' },
      feedback: feedbackOf(lastActions[item.id], notes[item.id], now),
      actions: actionsOf({ id: item.id, item, steps }, lastActions[item.id]),
    }
  }
  const questionRows = questions.map(itemRow)
  const taskRows = tasks.map(itemRow)
  const counted = [...questionRows, ...taskRows].filter(r => r.state.is === 'open')
  const findingRows = [...ledger.findings].reverse().map((finding): RowView => ({
    id: finding.id,
    type: 'finding',
    handle: '•',
    title: finding.title,
    at: finding.at,
    item: null,
    finding,
    steps: [],
    state: stateOf(finding.id),
    feedback: feedbackOf(lastActions[finding.id], notes[finding.id], now),
    actions: actionsOf({ id: finding.id, item: null, steps: [] }, lastActions[finding.id]),
  }))

  return {
    needsYou: { count: counted.length, topId: counted[0]?.id ?? null, questions: questionRows, tasks: taskRows },
    findings: { count: findingRows.filter(r => r.state.is === 'open').length, rows: findingRows },
    status,
  }
}

/**
 * The per-turn update's status. The list changed last when the card or any
 * item or finding did, so tool calls that write the list count too. A failure
 * shows only once no update runs, since a running one may repair it. Its text
 * promises a retry only when the source retries a failed update.
 */
export function perTurnStatus(
  ledger: Ledger,
  update: { isUpdating: boolean; isFailed: boolean; retries: boolean },
): ItemStatus {
  const times = [
    ledger.card?.updatedAt,
    ...ledger.items.map(i => i.at),
    ...ledger.closed.map(d => d.at),
    ...ledger.findings.map(f => f.at),
    ...ledger.closedFindings.map(f => f.closedAt),
  ].filter((t): t is number => typeof t === 'number')

  return {
    changedAt: times.length === 0 ? null : Math.max(...times),
    isUpdating: update.isUpdating,
    error: update.isFailed && !update.isUpdating ? UPDATE_FAILED + (update.retries ? UPDATE_RETRIES : '') : null,
  }
}
