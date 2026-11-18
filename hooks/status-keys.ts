import type { Item, PressKind } from '../types'
import { UNDO_KEY } from './help'
import type { ActionEmphasis } from './rows'
import { countsText, isParentCollapsed, milestoneRows, unfoldedRows } from './status-folds'
import type { IsCollapsed } from './status-folds'
import { shownMilestones } from './status-goal-page'
import type { GoalBlock, MilestoneRow } from './status-goal-page'
import type { StatusPage, StatusRow } from './status-page'

/**
 * A press on the Status page. `show-ask` opens Asks with that ask selected. `type-goal` opens Reply's field for the
 * goal, prefilled with `text`. `take-goal` makes the suggested goal the goal. `remove-goal` removes the goal, and `restore-goal` is its Undo. `toggle-fold` unfolds a done fold, a
 * done milestone folded to its name or a met goal's milestones, or folds it again, in the look that drew it.
 * `toggle-collapse` folds a subject or milestone by its name, or opens it, and the session saves it as a collapse. None
 * sends a message.
 */
type StatusPress =
  | { action: 'show-ask'; askId: string }
  | { action: 'type-goal'; text: string }
  | { action: 'remove-goal' }
  | { action: 'restore-goal' }
  | { action: 'take-goal' }
  | { action: 'toggle-fold'; foldId: string }
  | { action: 'toggle-collapse'; id: string }

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
  if (row.kind === 'done-fold') return [toggleFold(row.id, row.text)]
  if (row.kind === 'counts') return [toggleFold(row.id, countsText(row.counts))]

  return row.kind === 'subject' && row.ask !== null ? [viewAsk(row.ask)] : []
}

const toggleFold = (foldId: string, label: string): StatusKey => ({
  press: { action: 'toggle-fold', foldId },
  label,
  hotkey: 'f',
  kind: 'view',
  emphasis: 'quiet',
})

/**
 * A milestone's buttons: View question or View task while an open ask holds it up, or the fold of a done milestone
 * folded to its name, which each look draws as the milestone's row.
 */
export function milestoneKeyPlan(m: MilestoneRow): StatusKey[] {
  if (m.foldId !== null) return [toggleFold(m.foldId, m.name)]

  return m.ask === null ? [] : [viewAsk(m.ask)]
}

/** The fold a met goal's milestones start in, which each look draws as its fold line. */
function milestonesFoldKeyPlan(g: GoalBlock | null): StatusKey[] {
  const fold = g?.milestonesFold ?? null

  return fold === null ? [] : [toggleFold(fold.id, fold.text)]
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

/**
 * The suggested goal's buttons, drawn inline after its offer: Set goal makes it the goal, and Edit opens the goal's
 * field with its words. The field's own Cancel shows the suggestion again.
 */
function suggestionKeyPlan(suggested: string): StatusKey[] {
  return [
    { press: { action: 'take-goal' }, label: 'Set goal', hotkey: 's', kind: 'mark', emphasis: 'quiet' },
    { press: { action: 'type-goal', text: suggested }, label: 'Edit', hotkey: 'e', kind: 'view', emphasis: 'quiet' },
  ]
}

/**
 * The goal target's buttons in two places: `heading` on the goal's heading row, and `offer` after the suggested goal's
 * offer while the page has one. With a suggestion, the heading keeps only Undo while a removed goal can come back.
 */
export function goalKeyGroups(page: StatusPage): { heading: StatusKey[]; offer: StatusKey[] } {
  if (page.suggestedGoal === null) return { heading: goalKeyPlan(page), offer: [] }

  return { heading: page.canRestoreGoal ? [RESTORE_GOAL] : [], offer: suggestionKeyPlan(page.suggestedGoal) }
}

/** The goal target's buttons in reading order: the heading's, then the offer's. */
export function goalKeys(page: StatusPage): StatusKey[] {
  const { heading, offer } = goalKeyGroups(page)

  return [...heading, ...offer]
}

/**
 * A parent's fold, which each look draws as the parent's name line rather than as a button: "Fold" while its rows
 * show, "Unfold" while the person has it folded. A parent with nothing under it has none.
 */
function parentFoldKeys(p: { id: string; foldCount: number }, isCollapsed: IsCollapsed): StatusKey[] {
  if (p.foldCount === 0) return []

  return [
    {
      press: { action: 'toggle-collapse', id: p.id },
      label: isParentCollapsed(p, isCollapsed) ? 'Unfold' : 'Fold',
      hotkey: 'f',
      kind: 'view',
      emphasis: 'quiet',
    },
  ]
}

const rowTarget =
  (isCollapsed: IsCollapsed) =>
  (r: StatusRow): StatusKeyTarget => ({
    id: r.id,
    keys: [...statusKeyPlan(r), ...(r.kind === 'subject' ? parentFoldKeys(r, isCollapsed) : [])],
  })

/**
 * Everything on the Status page with buttons, in the order the looks draw them: the targets j and k move between. The
 * goal's buttons come first, as its section does, then a met goal's milestones fold, then the milestones a look draws,
 * each with the rows it draws after it. A parent's own target holds its buttons, then its fold. `isUnfolded` says which
 * done folds the look has open, and `isCollapsed` which parents the person folded.
 */
export function statusKeyRows(
  page: StatusPage,
  isUnfolded: (id: string) => boolean = () => false,
  isCollapsed: IsCollapsed = () => false,
): StatusKeyTarget[] {
  const fold = page.goal?.milestonesFold ?? null
  const toTarget = rowTarget(isCollapsed)

  return [
    { id: GOAL_KEYS_ID, keys: goalKeys(page) },
    ...(fold === null ? [] : [{ id: fold.id, keys: milestonesFoldKeyPlan(page.goal) }]),
    ...shownMilestones(page.goal, isUnfolded).flatMap(m => [
      { id: m.id, keys: [...milestoneKeyPlan(m), ...parentFoldKeys(m, isCollapsed)] },
      ...milestoneRows(m, isUnfolded, isCollapsed).map(toTarget),
    ]),
    ...unfoldedRows(page.rows, isUnfolded, isCollapsed).map(toTarget),
  ].filter(t => t.keys.length > 0)
}

/**
 * The target whose keys work: the selected one while it still has buttons, else the first that opens an ask, else the
 * first that is not only a fold, else the first. An ask holds up work and a missing goal does not, so View wins over
 * New.
 */
export function statusSelected(
  page: StatusPage,
  selectedId: string | null,
  isUnfolded: (id: string) => boolean = () => false,
  isCollapsed: IsCollapsed = () => false,
): StatusKeyTarget | null {
  const targets = statusKeyRows(page, isUnfolded, isCollapsed)
  const opensAsk = (t: StatusKeyTarget) => t.keys.some(k => k.press.action === 'show-ask')
  const isFold = (t: StatusKeyTarget) =>
    t.keys.every(k => k.press.action === 'toggle-fold' || k.press.action === 'toggle-collapse')

  return (
    targets.find(t => t.id === selectedId) ??
    targets.find(opensAsk) ??
    targets.find(t => !isFold(t)) ??
    targets[0] ??
    null
  )
}

/** The goal's text field's placeholder. */
export const GOAL_FIELD = { placeholder: 'An outcome to work toward' } as const

/** The label of the goal field's submit button: Set for a new goal, while none runs, and Save for an edit of the goal. */
export const goalSubmitLabel = (page: StatusPage): string => (page.goal === null || page.goal.isMet ? 'Set' : 'Save')
