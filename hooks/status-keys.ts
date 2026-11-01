import type { Item, PressKind } from '../types'
import type { ActionEmphasis } from './rows'
import type { MilestoneRow } from './status-goal-page'
import type { StatusPage, StatusRow } from './status-page'

/**
 * A press on the Status page. `show-ask` opens Asks with that ask selected. `type-goal` opens Reply's field for the
 * goal, prefilled with `text`. `use-goal` and `decline-goal` answer the proposal. None sends a message.
 */
export type StatusPress =
  | { action: 'show-ask'; askId: string }
  | { action: 'type-goal'; text: string }
  | { action: 'use-goal' }
  | { action: 'decline-goal' }

export type StatusKey = { press: StatusPress; label: string; hotkey: string; kind: PressKind; emphasis: ActionEmphasis }

/** What on the Status page has buttons: the proposal, the goal, a milestone or a row. Its id is the selection's. */
export type StatusKeyTarget = { id: string; keys: StatusKey[] }

/** The id of the proposal's buttons and of the goal's, apart from row and milestone ids. */
export const PROPOSAL_KEYS_ID = 'proposal'
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

/** A Status row's buttons, in the order every look draws them. A row with none takes no press. */
export function statusKeyPlan(row: StatusRow): StatusKey[] {
  return row.kind === 'subject' && row.ask !== null ? [viewAsk(row.ask)] : []
}

/** A milestone's buttons: View question or View task while an open ask holds it up. */
export function milestoneKeyPlan(m: MilestoneRow): StatusKey[] {
  return m.ask === null ? [] : [viewAsk(m.ask)]
}

/** The proposal's buttons, in the order every look draws them. Edit opens the field with the proposal in it. */
export function proposalKeyPlan(page: StatusPage): StatusKey[] {
  if (page.proposal === null) return []

  return [
    { press: { action: 'use-goal' }, label: 'Set as goal', hotkey: 's', kind: 'mark', emphasis: 'primary' },
    {
      press: { action: 'type-goal', text: page.proposal.text },
      label: 'Edit',
      hotkey: 'e',
      kind: 'view',
      emphasis: 'normal',
    },
    { press: { action: 'decline-goal' }, label: 'Not now', hotkey: 'x', kind: 'mark', emphasis: 'normal' },
  ]
}

/**
 * The goal's button: Set a goal before one is set, Change goal while one is, and Set next goal once it is met. Set a
 * goal is quiet, since a missing goal holds up no work. While a proposal shows there is none: its Edit types a goal.
 */
export function goalKeyPlan(page: StatusPage): StatusKey[] {
  if (page.proposal !== null) return []
  const g = page.goal
  const label = g === null ? 'Set a goal' : g.isMet ? 'Set next goal' : 'Change goal'

  return [
    {
      press: { action: 'type-goal', text: g?.isMet ? '' : (g?.text ?? '') },
      label,
      hotkey: g ? 'g' : 's',
      kind: 'view',
      emphasis: g ? 'normal' : 'quiet',
    },
  ]
}

/** Everything on the Status page with buttons, in the order the looks draw them: the targets j and k move between. */
export function statusKeyRows(page: StatusPage): StatusKeyTarget[] {
  const proposal = { id: PROPOSAL_KEYS_ID, keys: proposalKeyPlan(page) }
  const isProposalBelowGoal = page.proposal?.isBelowGoal ?? false

  return [
    ...(isProposalBelowGoal ? [] : [proposal]),
    ...(page.goal?.milestones ?? []).map(m => ({ id: m.id, keys: milestoneKeyPlan(m) })),
    { id: GOAL_KEYS_ID, keys: goalKeyPlan(page) },
    ...(isProposalBelowGoal ? [proposal] : []),
    ...page.rows.map(r => ({ id: r.id, keys: statusKeyPlan(r) })),
  ].filter(t => t.keys.length > 0)
}

/**
 * The target whose keys work: the selected one while it still has buttons, else the first that opens an ask, else the
 * first that has buttons. An ask holds up work and a missing goal does not, so View wins over Set a goal.
 */
export function statusSelected(page: StatusPage, selectedId: string | null): StatusKeyTarget | null {
  const targets = statusKeyRows(page)
  const opensAsk = (t: StatusKeyTarget) => t.keys.some(k => k.press.action === 'show-ask')

  return targets.find(t => t.id === selectedId) ?? targets.find(opensAsk) ?? targets[0] ?? null
}

/** The goal's text field: its placeholder, and the label of the button that sets what it holds. */
export const GOAL_FIELD = { placeholder: 'An outcome to work toward', submit: 'Set goal' } as const
