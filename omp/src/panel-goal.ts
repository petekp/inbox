import { GOAL_FIELD, GOAL_KEYS_ID, goalKeyPlan, milestoneKeyPlan, type StatusKey } from '../../hooks/status-keys'
import type { GoalBlock, MilestoneRow } from '../../hooks/status-goal-page'
import { GOAL_HEADING, NO_GOAL_TEXT } from '../../hooks/status-goal-page'
import { STATUS_TEXT_LINES, WAS_PREFIX } from '../../hooks/status-page'
import type { StatusPage } from '../../hooks/status-page'
import { isSpacedAbove, LATER_TEXT, milestoneRows } from '../../hooks/status-path'
import type { PathLine } from '../../hooks/status-path'
import { paintMark } from './panel-draw'
import type { Draw } from './panel-draw'
import type { Entry } from './panel-lines'
import { PAGE_MARK_AT, PAGE_TEXT_AT } from './panel-entries'
import { pageButtonLines, pageLine, partHeading } from './panel-page'
import { indented, visibleLength, wrapText } from './panel-text'
import type { Style } from './panel'
import { cellWidth } from '../../hooks/text'

/**
 * A part of the goal's section on the Status page: its heading row with the goal's buttons, the goal's text with its
 * was, Now and awaiting lines, a blank line before a milestone with the path's line through it, the Later
 * label, a milestone, or on the empty page New or its field.
 */
export type GoalPart =
  | { is: 'heading'; text: string; page: StatusPage | null }
  | { is: 'title'; goal: GoalBlock | null; isTyping: boolean }
  | { is: 'milestone'; row: MilestoneRow }
  | { is: 'keys'; keys: StatusKey[] }
  | { is: 'gap'; line: PathLine }
  | { is: 'later' }
  | { is: 'field' }

/** The id of the Status target a part draws the buttons of, or null for a part with none. */
export function goalPartId(part: GoalPart): string | null {
  if (part.is === 'milestone') return part.row.id
  if (part.is === 'heading') return part.page ? GOAL_KEYS_ID : null
  return part.is === 'keys' ? GOAL_KEYS_ID : null
}

const goalEntry = (part: GoalPart): Entry => ({ kind: 'goal', part })

/**
 * The goal's section, first on every page that is not empty: its heading row with the goal's buttons at the right
 * edge, then the goal's text, or the line that says no goal is set, then the milestones as a path. A milestone's work
 * starts on the line after its name or its text. A blank line comes before each milestone unless the one above draws
 * only its name, and before the Later label above the first that waits under it. The path's line runs in the mark
 * column from each milestone to the next. While the person types a goal, the field takes the text's place, and the
 * buttons leave.
 */
export function goalSection(page: StatusPage, typing: string | null, isUnfolded: (id: string) => boolean): Entry[] {
  const isTyping = typing === GOAL_KEYS_ID
  const g = page.goal
  const milestones = g?.milestones ?? []

  return [
    goalEntry({ is: 'heading', text: g?.label ?? GOAL_HEADING, page: isTyping ? null : page }),
    goalEntry({ is: 'title', goal: g, isTyping }),
    ...milestones.flatMap((row, n) => {
      const rows = milestoneRows(row, isUnfolded)

      return [
        ...(isSpacedAbove(milestones, n, isUnfolded)
          ? [goalEntry({ is: 'gap', line: milestones[n - 1]?.line ?? null })]
          : []),
        ...(row.startsLater ? [goalEntry({ is: 'later' })] : []),
        goalEntry({ is: 'milestone', row }),
        ...rows.map((r): Entry => ({ kind: 'page', row: r, path: row.line })),
      ]
    }),
  ]
}

/** `lines` with the path's line in the milestones' mark column, `┆` into the milestone that reads next. */
export function withPathLine(lines: string[], line: PathLine, s: Style): string[] {
  if (line === null) return lines
  const glyph = s.dim(line === 'to-next' ? '┆' : '│')

  return lines.map(l => l.slice(0, PAGE_MARK_AT).padEnd(PAGE_MARK_AT) + glyph + l.slice(PAGE_MARK_AT + 1))
}

/** Under the empty state: New, or the field it opened. */
export function setGoal(setGoal: { keys: StatusKey[]; isFieldOpen: boolean }): Entry[] {
  return [goalEntry(setGoal.isFieldOpen ? { is: 'field' } : { is: 'keys', keys: setGoal.keys })]
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

/** The cells between the end of a name's first line and its word. */
const WORD_GAP = 2

/**
 * A milestone's lines: its mark and name, its word dim at the right edge of the name's first line where it fits, then
 * where it stands, its was line and its buttons. A done milestone folded to its name draws the name dim with the fold's
 * chevron after it, and takes Enter as its fold.
 */
function milestoneLines(m: MilestoneRow, d: Draw, isSelected: boolean): string[] {
  const { width, now, style: s } = d
  const mark = paintMark({ ...m, isRunning: false }, now, s)
  if (m.foldId !== null) {
    const chevron = d.ui.statusUnfolded.includes(m.foldId) ? '▾' : '▸'
    const [namePaint, chevronPaint] = isSelected ? [s.bold, (t: string) => s.tone('accent', t)] : [s.dim, s.dim]

    return pageLine(d, PAGE_MARK_AT, mark, `${m.name} ${chevron}`, t =>
      t.endsWith(chevron) ? namePaint(t.slice(0, -chevron.length)) + chevronPaint(chevron) : namePaint(t),
    )
  }
  const namePaint = (t: string) => (m.isMuted ? s.dim : (u: string) => u)(m.isChanged ? s.bold(t) : t)
  const [first = '', ...rest] = pageLine(d, PAGE_MARK_AT, mark, m.name, namePaint, { stall: m.stall, text: m.text })
  const room = width - 1 - visibleLength(first) - cellWidth(m.word ?? '')
  const word = m.word !== null && room >= WORD_GAP ? `${' '.repeat(room)}${s.dim(m.word)}` : ''
  const was = m.was ? indented(`${WAS_PREFIX}${m.was}`, PAGE_TEXT_AT, width, STATUS_TEXT_LINES, s.dim) : []
  const after = [...rest, ...was, ...pageButtonLines({ id: m.id, keys: milestoneKeyPlan(m) }, d, isSelected)]

  return [`${first}${word}`, ...withPathLine(after, m.line, s)]
}

/**
 * The goal's heading row: its title, a rule, then the goal's buttons at the right edge. When the buttons do not fit
 * beside the title with a short rule, the rule runs to the edge and the buttons wrap under it, still at the right.
 */
function headingLines(part: GoalPart & { is: 'heading' }, d: Draw, isSelected: boolean): string[] {
  const { width, style: s } = d
  const keys = part.page
    ? pageButtonLines({ id: GOAL_KEYS_ID, keys: goalKeyPlan(part.page) }, d, isSelected, 1, s.dim('·'))
    : []
  const right = width - 1
  const label = `${part.text} `
  const keysCells = keys.length === 1 ? visibleLength(keys[0]!) : Infinity
  const rule = right - PAGE_MARK_AT - cellWidth(label) - keysCells
  if (keys.length === 0 || rule < 4) {
    const atRight = (l: string) => ' '.repeat(Math.max(0, right - visibleLength(l))) + l

    return [partHeading(part.text, width, s, PAGE_MARK_AT), ...keys.map(atRight)]
  }

  return [`${' '.repeat(PAGE_MARK_AT)}${s.dim(label + '─'.repeat(rule))}${keys[0]}`]
}

export function drawGoalPart(part: GoalPart, d: Draw, isSelected: boolean): string[] {
  const { width, style: s } = d
  const at = (text: string, paint: (t: string) => string, lines = STATUS_TEXT_LINES) =>
    indented(text, PAGE_MARK_AT, width, lines, paint)
  if (part.is === 'heading') return headingLines(part, d, isSelected)
  if (part.is === 'gap') return withPathLine([''], part.line, s)
  if (part.is === 'later') return [partHeading(LATER_TEXT, width, s)]
  if (part.is === 'title') {
    const g = part.goal
    const text = part.isTyping ? fieldLines(d) : at(g ? g.text : NO_GOAL_TEXT, g ? s.bold : s.dim, Infinity)

    return [
      ...text,
      ...(g?.was ? at(`${WAS_PREFIX}${g.was}`, s.dim) : []),
      ...(g?.now ? at(g.now, s.dim) : []),
      ...(g?.awaiting ? at(g.awaiting, s.dim) : []),
    ]
  }
  if (part.is === 'milestone') return milestoneLines(part.row, d, isSelected)
  if (part.is === 'keys') return pageButtonLines({ id: GOAL_KEYS_ID, keys: part.keys }, d, isSelected, PAGE_MARK_AT)
  return fieldLines(d)
}
