import {
  GOAL_FIELD,
  GOAL_KEYS_ID,
  goalKeyPlan,
  milestoneKeyPlan,
  PROPOSAL_KEYS_ID,
  proposalKeyPlan,
} from '../../hooks/status-keys'
import type { GoalBlock, MilestoneRow, ProposalBlock } from '../../hooks/status-goal-page'
import { STATUS_TEXT_LINES, WAS_PREFIX } from '../../hooks/status-page'
import type { StatusPage } from '../../hooks/status-page'
import { feedbackPaint, paintMark } from './panel-draw'
import type { Draw } from './panel-draw'
import type { Entry } from './panel-lines'
import { PAGE_MARK_AT, PAGE_TEXT_AT } from './panel-entries'
import { pageButtonLines, pageLine } from './panel-page'
import { indented, wrapText } from './panel-text'

/** A part of the goal on the Status page: the proposal, the goal's lines, a milestone, its button, its field, or Now. */
export type GoalPart =
  | { is: 'proposal'; proposal: ProposalBlock; page: StatusPage }
  | { is: 'title'; goal: GoalBlock; isTyping: boolean }
  | { is: 'milestone'; row: MilestoneRow }
  | { is: 'keys'; page: StatusPage }
  | { is: 'field' }
  | { is: 'now'; text: string }

/** The id of the Status target a part draws the buttons of, or null for a part with none. */
export function goalPartId(part: GoalPart): string | null {
  if (part.is === 'proposal') return PROPOSAL_KEYS_ID
  if (part.is === 'milestone') return part.row.id
  return part.is === 'keys' ? GOAL_KEYS_ID : null
}

const goalEntry = (part: GoalPart): Entry => ({ kind: 'goal', part })
const blank: Entry = { kind: 'note', text: '' }

/**
 * What the page draws above the head: a proposal, then the goal, its milestones and its button. While the person
 * types a goal, the field takes the goal text's place and the button leaves.
 */
export function goalAbove(page: StatusPage, typing: string | null): Entry[] {
  const isTyping = typing === GOAL_KEYS_ID
  const proposal = page.proposal ? [goalEntry({ is: 'proposal', proposal: page.proposal, page })] : []
  const g = page.goal
  if (g === null) return proposal

  return [
    ...proposal,
    ...(proposal.length > 0 ? [blank] : []),
    goalEntry({ is: 'title', goal: g, isTyping }),
    ...g.milestones.map(row => goalEntry({ is: 'milestone', row })),
    ...(isTyping ? [] : [goalEntry({ is: 'keys', page })]),
  ]
}

/** Under the head, or under the empty state, while no goal is set: Set a goal, or the field it opened. */
export function setGoal(page: StatusPage, typing: string | null): Entry[] {
  if (page.goal !== null) return []

  return [goalEntry(typing === GOAL_KEYS_ID ? { is: 'field' } : { is: 'keys', page })]
}

/** While a goal is set, the head draws as one dim line. */
export const nowEntry = (text: string): Entry => goalEntry({ is: 'now', text })

/** The goal's text field with the draft in it and the cursor after it, under its placeholder. */
function fieldLines(d: Draw): string[] {
  const { ui, width, style: s } = d
  const text = ui.drafts[GOAL_KEYS_ID]?.text ?? ''
  const field = wrapText(`${text}\u0000`, Math.max(10, width - PAGE_MARK_AT - 1))

  return [
    ' '.repeat(PAGE_MARK_AT) + s.dim(`${GOAL_FIELD.placeholder}:`),
    ...field.map(l => ' '.repeat(PAGE_MARK_AT) + l.replace('\u0000', s.inverse(' '))),
  ]
}

export function drawGoalPart(part: GoalPart, d: Draw, isSelected: boolean): string[] {
  const { width, now, style: s } = d
  const at = (text: string, paint: (t: string) => string, lines = STATUS_TEXT_LINES) =>
    indented(text, PAGE_MARK_AT, width, lines, paint)
  if (part.is === 'proposal') {
    const p = part.proposal
    const marks = p.milestones.map(m => `${feedbackPaint(m.tone, s)(m.mark)} ${m.name}`).join('   ')

    return [
      ...at(p.label, s.dim),
      ...at(p.text, s.bold, Infinity),
      ...(marks ? [' '.repeat(PAGE_MARK_AT) + marks] : []),
      ...pageButtonLines({ id: PROPOSAL_KEYS_ID, keys: proposalKeyPlan(part.page) }, d, isSelected, PAGE_MARK_AT),
    ]
  }
  if (part.is === 'title') {
    const g = part.goal

    return [
      ...at(g.label, s.dim),
      ...(part.isTyping ? fieldLines(d) : at(g.text, s.bold, Infinity)),
      ...(g.was ? at(`${WAS_PREFIX}${g.was}`, s.dim) : []),
      ...(g.awaiting ? at(g.awaiting, s.dim) : []),
    ]
  }
  if (part.is === 'milestone') {
    const m = part.row
    const mark = paintMark({ ...m, isRunning: false }, now, s)
    const out = pageLine(d, PAGE_MARK_AT, mark, m.name, m.isChanged ? s.bold : t => t, { stall: m.stall, text: m.text })
    if (m.was) out.push(...indented(`${WAS_PREFIX}${m.was}`, PAGE_TEXT_AT, width, STATUS_TEXT_LINES, s.dim))

    return [...out, ...pageButtonLines({ id: m.id, keys: milestoneKeyPlan(m) }, d, isSelected)]
  }
  if (part.is === 'keys')
    return pageButtonLines({ id: GOAL_KEYS_ID, keys: goalKeyPlan(part.page) }, d, isSelected, PAGE_MARK_AT)
  if (part.is === 'field') return fieldLines(d)

  return at(part.text, s.dim)
}
