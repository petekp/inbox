import type { Item, PressKind } from '../types'
import { UNDO_KEY } from './help'
import type { ActionEmphasis } from './rows'
import type { MilestoneRow } from './status-goal-page'
import type { StatusPage, StatusRow } from './status-page'

/**
 * A press on the Status page. `show-ask` opens Asks with that ask selected. `type-goal` opens Reply's field for the
 * goal, prefilled with `text`. `remove-goal` removes the goal, and `restore-goal` is its Undo. `toggle-fold` unfolds a done fold, or
 * folds it again, in the look that drew it. None sends a message.
 */
type StatusPress =
  | { action: 'show-ask'; askId: string }
  | { action: 'type-goal'; text: string }
  | { action: 'remove-goal' }
  | { action: 'restore-goal' }
  | { action: 'toggle-fold'; foldId: string }

export type StatusKey = { press: StatusPress; label: string; hotkey: string; kind: PressKind; emphasis: ActionEmphasis }

/** What on the Status page has buttons: the goal, a milestone or a row. Its id is the selection's. */
export type StatusKeyTarget = { id: string; keys: StatusKey[] }

/** The id of the goal's buttons, apart from row and milestone ids. */
export const GOAL_KEYS_ID = 'goal'

/** The View button's label, by the kind of ask it opens. */
const VIEW_ASK_LABELS: Record<Item['kind'], string> = { question: 'View question', task: 'View task' }

function viewAsk(ask: { id: string; kind: Item['kind'] }): StatusKey {
  return {
    press: { action: 'show-ask', askId: ask.id },
    label: VIEW_ASK_LABELS[ask.kind],
    hotkey: 'v',
    kind: 'view',
    emphasis: 'normal',
  }
}

/**
 * A Status row's buttons, in the order every look draws them. A row with none takes no press. A done fold's one key is
 * the fold itself, which each look draws as its fold line rather than as a button.
 */
export function statusKeyPlan(row: StatusRow): StatusKey[] {
  if (row.kind === 'done-fold')
    return [
      {
        press: { action: 'toggle-fold', foldId: row.id },
        label: row.text,
        hotkey: 'f',
        kind: 'view',
        emphasis: 'quiet',
      },
    ]

  return row.kind === 'subject' && row.ask !== null ? [viewAsk(row.ask)] : []
}

/** A milestone's buttons: View question or View task while an open ask holds it up. */
export function milestoneKeyPlan(m: MilestoneRow): StatusKey[] {
  return m.ask === null ? [] : [viewAsk(m.ask)]
}

const REMOVE_GOAL: StatusKey = {
  press: { action: 'remove-goal' },
  label: 'Remove',
  hotkey: 'r',
  kind: 'mark',
  emphasis: 'quiet',
}

const RESTORE_GOAL: StatusKey = {
  press: { action: 'restore-goal' },
  label: 'Undo',
  hotkey: UNDO_KEY,
  kind: 'mark',
  emphasis: 'normal',
}

/** New: opens an empty goal field. Its words leave out "goal", since the buttons sit on the Goal heading. */
const newGoal = (emphasis: StatusKey['emphasis']): StatusKey => ({
  press: { action: 'type-goal', text: '' },
  label: 'New',
  hotkey: 'n',
  kind: 'view',
  emphasis,
})

/**
 * The goal's buttons, drawn on the goal's heading row: New before a goal is set, after Undo while a removed goal can
 * come back, then Edit while one is set, or New once it is met, then Remove. New with no goal, Edit and Remove are
 * quiet, since a missing goal holds up no work and a set one needs no change.
 */
export function goalKeyPlan(page: StatusPage): StatusKey[] {
  const g = page.goal
  if (g === null) return [...(page.canRestoreGoal ? [RESTORE_GOAL] : []), newGoal('quiet')]
  if (g.isMet) return [newGoal('normal'), REMOVE_GOAL]

  return [
    { press: { action: 'type-goal', text: g.text }, label: 'Edit', hotkey: 'e', kind: 'view', emphasis: 'quiet' },
    REMOVE_GOAL,
  ]
}

const rowTarget = (r: StatusRow): StatusKeyTarget => ({ id: r.id, keys: statusKeyPlan(r) })

/**
 * Everything on the Status page with buttons, in the order the looks draw them: the targets j and k move between. The
 * goal's buttons come first, as its section does, and a milestone's rows follow it.
 */
export function statusKeyRows(page: StatusPage): StatusKeyTarget[] {
  return [
    { id: GOAL_KEYS_ID, keys: goalKeyPlan(page) },
    ...(page.goal?.milestones ?? []).flatMap(m => [{ id: m.id, keys: milestoneKeyPlan(m) }, ...m.rows.map(rowTarget)]),
    ...page.rows.map(rowTarget),
  ].filter(t => t.keys.length > 0)
}

/**
 * The target whose keys work: the selected one while it still has buttons, else the first that opens an ask, else the
 * first that is not a done fold, else the first. An ask holds up work and a missing goal does not, so View wins over
 * New.
 */
export function statusSelected(page: StatusPage, selectedId: string | null): StatusKeyTarget | null {
  const targets = statusKeyRows(page)
  const opensAsk = (t: StatusKeyTarget) => t.keys.some(k => k.press.action === 'show-ask')
  const isFold = (t: StatusKeyTarget) => t.keys.some(k => k.press.action === 'toggle-fold')

  return (
    targets.find(t => t.id === selectedId) ??
    targets.find(opensAsk) ??
    targets.find(t => !isFold(t)) ??
    targets[0] ??
    null
  )
}

/** The goal's text field: its placeholder, and the label of the button that sets what it holds. */
export const GOAL_FIELD = { placeholder: 'An outcome to work toward', submit: 'Save' } as const
