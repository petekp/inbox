// The inbox as every host draws it: the Needs you order and count, question
// handles, which rows are handed off or just closed, and the item status. The band, the pane,
// the sidebar line, row navigation and the Codex tab all read this, so they agree.
// Pure: it reads only its arguments, and imports nothing from the engine.

import type {
  Closed,
  ClosedFinding,
  Finding,
  Item,
  LastAction,
  Ledger,
  LocalResult,
  PressKind,
  RowNote,
  Turns,
} from '../types'
import { isLapsed, latestBatch, questionNumbers, reopenFinding, reopenItem } from './ledger'
import { actionId, capitalized, clipLabel, isHandedOff, isUndoable, noteText, retryOf, stepsOf } from './presses'
import type { HelpStep, RowPress } from './presses'

/** A question with more options than this shows the first 4 and [All N options]. */
const OPTIONS_FOLD_AT = 5
// The keys of a question's options and a row's steps, lettered as a multiple-choice
// question letters them. The digits switch tabs, and the letters left out are the
// keys of a Needs you row's other actions and of moving the selection.
export const CHOICE_KEYS = [...'abcfghilm']

/** A finding's kind as the Findings tab draws it: a mark before its name, both in the kind's tone. */
export const FINDING_BADGES: Record<Finding['kind'], { label: string; mark: string; tone: 'needsYou' | 'done' }> = {
  issue: { label: 'Issue', mark: '▲', tone: 'needsYou' },
  opportunity: { label: 'Opportunity', mark: '✦', tone: 'done' },
}

/** How many closed items each Closed fold lists. */
export const CLOSED_SHOWN = 3
/** How long a row that just closed stays in its place, and a row's note shows. */
export const SETTLED_MS = 5120
/** How long a new row's bar shows. */
export const NEW_ROW_MS = 1500
/** How long a row's buttons ignore clicks after it opens, so a double-click cannot land on one that just drew. */
export const PRESS_GUARD_MS = 400

/** Whether a row opened at `openedAt` still ignores clicks. 0 means no click opened it, so nothing is guarded. */
export function isGuarded(openedAt: number, now: number): boolean {
  return openedAt > 0 && now - openedAt < PRESS_GUARD_MS
}

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
  /** How long after a close the view still lists the row as settled. The mod passes SETTLED_MS; Codex adds two polls. */
  settleWindowMs: number
  status: ItemStatus
  now: number
}

/**
 * A handed-off row stays in its place, folded, and leaves the count. A settled
 * row just closed: it stays in its place with its outcome, `label`, and leaves
 * the count. `canUndo` when the person's own Done or Dismiss closed it.
 * `isQueued` while the answer that closed it has not reached the agent yet.
 */
export type RowState =
  | { is: 'open' }
  | { is: 'handedOff' }
  | { is: 'settled'; label: string; at: number; canUndo: boolean; isQueued: boolean; isLapsed: boolean }

/**
 * What a row says about its last press: "✓ Explain · 1m ago". A Talk or Hand-off ✓
 * stays. Until its message arrives it reads "Queued: Explain · 1m ago", and once
 * it failed, "Not sent: <reason>" with the press [Try again] repeats, if any.
 * A Local press's result shows while pending, for SETTLED_MS once done,
 * and until the next press once failed. A newer note shows in their place for SETTLED_MS.
 */
export type Feedback =
  | { is: 'done'; label: string; at: number }
  | { is: 'queued'; label: string; at: number }
  | { is: 'notSent'; reason: string; retry: RowPress | null }
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
  /** Every action the row offers, every option included, in the order `actionsOf` sets. Key letters are each renderer's. */
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
    /** Every close the ledger keeps, newest first, settled rows included. */
    closed: { questions: Closed[]; tasks: Closed[] }
  }
  /** Newest first. The count leaves out handed-off findings. `closed` is every close the ledger keeps, newest first. */
  findings: { count: number; rows: RowView[]; closed: ClosedFinding[] }
  status: ItemStatus
}

/** Every row a view lists: questions, tasks, then findings. */
export function allRows(v: InboxView): RowView[] {
  return [...v.needsYou.questions, ...v.needsYou.tasks, ...v.findings.rows]
}

/** The ids of the rows among `rows` that just closed. */
export function settledRowIds(rows: RowView[]): string[] {
  return rows.filter(r => r.state.is === 'settled').map(r => r.id)
}

/** What a Closed fold lists: its closes, without the rows drawn as settled right now, up to CLOSED_SHOWN. */
export function closedShown<T extends { id: string }>(closed: T[], drawnSettled: ReadonlySet<string>): T[] {
  return closed.filter(d => !drawnSettled.has(d.id)).slice(0, CLOSED_SHOWN)
}

const UPDATE_FAILED = 'Last update failed. Items from that reply may be missing.'
const UPDATE_RETRIES = ' It retries after your next message.'

/**
 * The open items in the order Needs you lists them. Questions: the latest
 * batch's in the order Claude asked them, then the rest newest first. Tasks:
 * oldest first.
 */
function needsYouOrder(ledger: Ledger): { questions: Item[]; tasks: Item[] } {
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
 * Row `id`'s feedback: its note while the note is newer than its last press and
 * younger than SETTLED_MS; else its Local result while that shows; else its
 * last Talk, Hand-off or Mark press, by where its message is.
 */
export function feedbackOf(
  id: string,
  last: LastAction | undefined,
  note: RowNote | undefined,
  now: number,
): Feedback | null {
  const result = last?.result
  if (note && now - note.at < SETTLED_MS && note.at >= Math.max(last?.at ?? 0, result?.at ?? 0))
    return { is: 'note', note: note.note, at: note.at }
  if (result && (result.state !== 'done' || now - result.at < SETTLED_MS)) return { is: 'local', result }
  if (!last || last.kind === 'local') return null
  const delivery = last.delivery
  if (delivery?.state === 'queued') return { is: 'queued', label: last.text, at: last.at }
  if (delivery?.state === 'failed') return { is: 'notSent', reason: delivery.reason, retry: retryOf(id, last) }

  return { is: 'done', label: last.text, at: last.at }
}

/** Feedback that reports a failure, which a row draws in red. */
export function isFailure(f: Feedback | null): boolean {
  return f?.is === 'notSent' || (f?.is === 'local' && f.result.state === 'failed')
}

/** Feedback that reads with its age: a press's ✓, or its message still queued. */
export function hasAge(f: Feedback): f is Extract<Feedback, { is: 'done' | 'queued' }> {
  return f.is === 'done' || f.is === 'queued'
}

// Where a copied command runs. The desktop app's composer is not known to take "!" for shell mode.
const runIt = (look: Look) =>
  look === 'terminal' ? 'Run it in a terminal, or type ! and paste.' : 'Run it in Terminal.'
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

  return `✓ ${text}${isCommand ? `. ${runIt(look)}` : ''}`
}

/** Feedback as a row reads it, before any age. */
export function feedbackText(f: Feedback, look: Look): string {
  if (f.is === 'note') return noteText(f.note)
  if (f.is === 'local') return localText(f.result, look)
  if (f.is === 'queued') return `Queued: ${f.label}`
  if (f.is === 'notSent') return `Not sent: ${f.reason}`

  return `✓ ${f.label}`
}

/** A step's kind: one that asks Claude to run a command hands the row off; the rest open or copy. */
function stepKind(step: HelpStep): PressKind {
  return step.step.some(h => h.kind === 'run') ? 'handoff' : 'local'
}

/**
 * A row's actions in the order the pane and the tab draw them, each labeled
 * "… again" when the row's last press, other than an open or copy, was that action.
 * A settled row offers only Undo, and only after the person's own Done or Dismiss.
 */
function actionsOf(
  row: { id: string; item: Item | null; steps: HelpStep[] },
  last: LastAction | undefined,
  state: RowState,
): ActionView[] {
  const { id, item, steps } = row
  const action = (
    press: RowPress,
    label: string,
    kind: PressKind,
    flags: Partial<Pick<ActionView, 'isPrimary' | 'isFolded'>> = {},
  ): ActionView => ({
    press,
    // The type action opens a field for new words each time, an open or copy
    // only shows its result, and a press whose message failed did nothing, so none reads "again".
    label:
      press.action !== 'type' &&
      last?.kind !== 'local' &&
      last?.delivery?.state !== 'failed' &&
      last?.action === actionId(press)
        ? `${label} again`
        : label,
    kind,
    isPrimary: flags.isPrimary ?? false,
    isFolded: flags.isFolded ?? false,
  })
  if (state.is === 'settled') return state.canUndo ? [action({ action: 'undo', id }, 'Undo', 'view')] : []
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

export function inboxView({
  ledger,
  lastActions,
  notes,
  turns,
  extraSteps,
  settleWindowMs,
  status,
  now,
}: ViewInput): InboxView {
  const isSettling = (at: number) => now - at < settleWindowMs
  const isOpen = (id: string) => ledger.items.some(i => i.id === id) || ledger.findings.some(f => f.id === id)
  // A row that just closed is put back among the open ones, so it is ordered where it stood.
  const settledItems = new Map(
    ledger.closed.filter(d => d.item && isSettling(d.at) && !isOpen(d.id)).map(d => [d.id, d] as const),
  )
  const settledFindings = new Map(
    ledger.closedFindings.filter(f => isSettling(f.closedAt) && !isOpen(f.id)).map(f => [f.id, f] as const),
  )
  const placed = [...settledFindings.keys()].reduce(reopenFinding, [...settledItems.keys()].reduce(reopenItem, ledger))
  const { questions, tasks } = needsYouOrder(placed)
  // The number the person's next prompt answers each question by, which only open questions have.
  const numbers = questionNumbers(ledger, ledger.turn + 1)
  const stateOf = (id: string): RowState => {
    const closed = settledItems.get(id) ?? settledFindings.get(id)
    if (closed) {
      const at = 'closedAt' in closed ? closed.closedAt : closed.at
      const last = lastActions[id]

      return {
        is: 'settled',
        label: capitalized(closed.outcome),
        at,
        canUndo: isUndoable(closed.how),
        // Dismissed, expired or closed by the agent: drawn muted, as the Closed fold draws it.
        isLapsed: isLapsed(closed),
        // Queued only while the answer press that closed the row waits to reach Claude. Claude's own close sends nothing.
        isQueued:
          closed.how === 'answered' && last?.kind === 'mark' && last.at === at && last.delivery?.state === 'queued',
      }
    }

    return isHandedOff(lastActions[id], turns) ? { is: 'handedOff' } : { is: 'open' }
  }
  const rowOf = (row: Omit<RowView, 'state' | 'feedback' | 'actions'>): RowView => {
    const state = stateOf(row.id)

    return {
      ...row,
      state,
      feedback: state.is === 'settled' ? null : feedbackOf(row.id, lastActions[row.id], notes[row.id], now),
      actions: actionsOf(row, lastActions[row.id], state),
    }
  }
  const itemRow = (item: Item): RowView => {
    const n = numbers.get(item.id)
    const row = rowOf({
      id: item.id,
      type: item.kind,
      handle: item.kind === 'task' ? '•' : n === undefined ? '?' : `${n})`,
      title: item.ask,
      at: item.at,
      item,
      finding: null,
      steps: stepsOf(item, extraSteps[item.id] ?? []),
    })

    // Questions never fold.
    return item.kind === 'question' && row.state.is === 'handedOff' ? { ...row, state: { is: 'open' } } : row
  }
  const questionRows = questions.map(itemRow)
  const taskRows = tasks.map(itemRow)
  const counted = [...questionRows, ...taskRows].filter(r => r.state.is === 'open')
  const findingRows = [...placed.findings].reverse().map(finding =>
    rowOf({
      id: finding.id,
      type: 'finding',
      handle: '•',
      title: finding.title,
      at: finding.at,
      item: null,
      finding,
      steps: [],
    }),
  )
  const closed = [...ledger.closed].reverse()

  return {
    needsYou: {
      count: counted.length,
      topId: counted[0]?.id ?? null,
      questions: questionRows,
      tasks: taskRows,
      closed: { questions: closed.filter(d => d.kind === 'question'), tasks: closed.filter(d => d.kind === 'task') },
    },
    findings: {
      count: findingRows.filter(r => r.state.is === 'open').length,
      rows: findingRows,
      closed: [...ledger.closedFindings].reverse(),
    },
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
  let changedAt: number | null = ledger.card?.updatedAt ?? null
  for (const t of [
    ...ledger.items.map(i => i.at),
    ...ledger.closed.map(d => d.at),
    ...ledger.findings.map(f => f.at),
    ...ledger.closedFindings.map(f => f.closedAt),
  ])
    if (typeof t === 'number' && (changedAt === null || t > changedAt)) changedAt = t

  return {
    changedAt,
    isUpdating: update.isUpdating,
    error: update.isFailed && !update.isUpdating ? UPDATE_FAILED + (update.retries ? UPDATE_RETRIES : '') : null,
  }
}
