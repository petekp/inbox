import { GOAL_FIELD, GOAL_KEYS_ID, goalKeyPlan, milestoneKeyPlan } from '../../hooks/status-keys'
import type { GoalBlock, MilestoneRow } from '../../hooks/status-goal-page'
import { GOAL_HEADING, NO_GOAL_TEXT } from '../../hooks/status-goal-page'
import { STALL_GAP, STATUS_TEXT_LINES, WAS_PREFIX } from '../../hooks/status-page'
import { unfoldedRows } from '../../hooks/status-page-parts'
import type { StatusPage } from '../../hooks/status-page'
import { paintMark } from './panel-draw'
import type { Draw } from './panel-draw'
import type { Entry } from './panel-lines'
import { PAGE_MARK_AT, PAGE_TEXT_AT } from './panel-entries'
import { GLUE, pageButtonLines, pageLine, partHeading } from './panel-page'
import { indented, wrapText } from './panel-text'

/**
 * A part of the goal's section on the Status page: its heading, the goal's text with its was, Now and awaiting lines,
 * its buttons, the blank line before the milestones, a milestone, or the field on the empty page.
 */
export type GoalPart =
  | { is: 'heading'; text: string }
  | { is: 'title'; goal: GoalBlock | null; isTyping: boolean }
  | { is: 'milestone'; row: MilestoneRow }
  | { is: 'keys'; page: StatusPage }
  | { is: 'gap' }
  | { is: 'field' }

/** The id of the Status target a part draws the buttons of, or null for a part with none. */
export function goalPartId(part: GoalPart): string | null {
  if (part.is === 'milestone') return part.row.id
  return part.is === 'keys' ? GOAL_KEYS_ID : null
}

const goalEntry = (part: GoalPart): Entry => ({ kind: 'goal', part })

/**
 * The goal's section, first on every page that is not empty: its heading, drawn as Other work's is, then the goal's
 * text, or the line that says no goal is set, then its buttons as a row's, then a blank line and the milestones, each
 * with the rows of its work. While the person types a goal, the field takes the text's place, and the buttons leave.
 */
export function goalSection(page: StatusPage, typing: string | null, isUnfolded: (id: string) => boolean): Entry[] {
  const isTyping = typing === GOAL_KEYS_ID
  const g = page.goal
  const milestones = g?.milestones ?? []

  return [
    goalEntry({ is: 'heading', text: g?.label ?? GOAL_HEADING }),
    goalEntry({ is: 'title', goal: g, isTyping }),
    ...(isTyping ? [] : [goalEntry({ is: 'keys', page })]),
    ...(milestones.length > 0 ? [goalEntry({ is: 'gap' })] : []),
    ...milestones.flatMap(row => [
      goalEntry({ is: 'milestone', row }),
      ...unfoldedRows(row.rows, isUnfolded).map((r): Entry => ({ kind: 'page', row: r })),
    ]),
  ]
}

/** Under the empty state: Set goal, or the field it opened. */
export function setGoal(page: StatusPage, typing: string | null): Entry[] {
  return [goalEntry(typing === GOAL_KEYS_ID ? { is: 'field' } : { is: 'keys', page })]
}

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

/** The goal's text in bold, its count after it, dim and kept whole on the line with the text's last word. */
function textWithCount(g: GoalBlock, d: Draw): string[] {
  const { width, style: s } = d
  if (g.count === null) return indented(g.text, PAGE_MARK_AT, width, Infinity, s.bold)
  const tail = `${STALL_GAP}${g.count}`.replaceAll(' ', GLUE)
  const lines = wrapText(`${g.text}${tail}`, Math.max(10, width - PAGE_MARK_AT - 1))

  return lines.map(
    l =>
      ' '.repeat(PAGE_MARK_AT) +
      (l.endsWith(tail) ? s.bold(l.slice(0, -tail.length)) + s.dim(tail.replaceAll(GLUE, ' ')) : s.bold(l)),
  )
}

export function drawGoalPart(part: GoalPart, d: Draw, isSelected: boolean): string[] {
  const { width, now, style: s } = d
  const at = (text: string, paint: (t: string) => string, lines = STATUS_TEXT_LINES) =>
    indented(text, PAGE_MARK_AT, width, lines, paint)
  if (part.is === 'heading') return [partHeading(part.text, width, s, PAGE_MARK_AT)]
  if (part.is === 'gap') return ['']
  if (part.is === 'title') {
    const g = part.goal
    const text = part.isTyping ? fieldLines(d) : g ? textWithCount(g, d) : at(NO_GOAL_TEXT, s.dim)

    return [
      ...text,
      ...(g?.was ? at(`${WAS_PREFIX}${g.was}`, s.dim) : []),
      ...(g?.now ? at(g.now, s.dim) : []),
      ...(g?.awaiting ? at(g.awaiting, s.dim) : []),
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
  return fieldLines(d)
}
