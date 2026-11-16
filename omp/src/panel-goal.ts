import { foldGlyph } from '../../hooks/fold-chevron'
import { GOAL_FIELD, GOAL_KEYS_ID, goalKeyGroups, milestoneKeyPlan, type StatusKey } from '../../hooks/status-keys'
import type { GoalBlock, MilestoneRow } from '../../hooks/status-goal-page'
import { GOAL_HEADING, NO_GOAL_TEXT, shownMilestones, suggestedGoalOffer } from '../../hooks/status-goal-page'
import { STATUS_TEXT_LINES, WAS_PREFIX } from '../../hooks/status-page'
import type { StatusPage } from '../../hooks/status-page'
import { milestoneRows } from '../../hooks/status-folds'
import type { IsCollapsed } from '../../hooks/status-folds'
import { isSpacedAbove, LATER_TEXT, workJoints } from '../../hooks/status-path'
import type { PathLine, WorkJoint } from '../../hooks/status-path'
import { faceLines, feedbackPaint, paintMark } from './panel-draw'
import type { Draw } from './panel-draw'
import type { ButtonFace, Entry } from './panel-lines'
import { PAGE_MARK_AT, PAGE_TEXT_AT } from './panel-entries'
import { pageFocus } from './panel-keys'
import { foldChevron, pageButtonLines, pageLine, pageRuleCells, partHeading } from './panel-page'
import { collapsedIn, indented, visibleLength, wrapText } from './panel-text'
import type { Style } from './panel'
import { cellWidth } from '../../hooks/text'

/**
 * A part of the goal's section on the Status page: its heading row with the goal's buttons, the goal's text with its
 * was, Now and awaiting lines, the line a met goal's milestones fold into, a blank line before a milestone with the
 * path's line through it, the Later label, a milestone, or on the empty page New or its field.
 */
export type GoalPart =
  | { is: 'heading'; text: string; mark: GoalBlock['mark']; page: StatusPage | null }
  | { is: 'title'; goal: GoalBlock | null; isTyping: boolean; suggestion: Offer | null }
  | { is: 'fold'; fold: NonNullable<GoalBlock['milestonesFold']> }
  | { is: 'milestone'; row: MilestoneRow }
  | { is: 'keys'; keys: StatusKey[] }
  | { is: 'suggestion'; offer: Offer }
  | { is: 'gap'; line: PathLine }
  | { is: 'later' }
  | { is: 'field' }

/** The suggested goal's offer: its words, its buttons, and the goal target's buttons that come before them. */
type Offer = { text: string; keys: StatusKey[]; before: StatusKey[] }

/** The id of the Status target a part draws the buttons of, or null for a part with none. */
export function goalPartId(part: GoalPart): string | null {
  if (part.is === 'milestone') return part.row.id
  if (part.is === 'fold') return part.fold.id
  if (part.is === 'heading') return part.page ? GOAL_KEYS_ID : null
  if (part.is === 'title') return part.suggestion ? GOAL_KEYS_ID : null
  return part.is === 'keys' || part.is === 'suggestion' ? GOAL_KEYS_ID : null
}

const goalEntry = (part: GoalPart): Entry => ({ kind: 'goal', part })

/**
 * The goal's section, first on every page that is not empty: its heading row with the goal's buttons at the right
 * edge, then the goal's text, or the line that says no goal is set, then the milestones as a path. A milestone's work
 * starts on the line after its name or its text. A met goal's milestones fold into one line under its text, and draw
 * only while the person has it unfolded. A blank line comes before each milestone unless the one above draws
 * only its name, and before the Later label above the first that waits under it. The path's line runs in the mark
 * column from each milestone to the next. While the person types a goal, the field takes the text's place, and the
 * buttons leave. While the page has a suggested goal, its offer takes the text's place with Set this goal and Edit
 * after it, and the heading keeps only Undo.
 */
export function goalSection(
  page: StatusPage,
  typing: string | null,
  isUnfolded: (id: string) => boolean,
  isCollapsed: IsCollapsed,
): Entry[] {
  const isTyping = typing === GOAL_KEYS_ID
  const groups = goalKeyGroups(page)
  const suggestion =
    isTyping || page.suggestedGoal === null
      ? null
      : { text: page.suggestedGoal, keys: groups.offer, before: groups.heading }
  const g = page.goal
  const milestones = shownMilestones(g, isUnfolded)
  const fold = g?.milestonesFold ?? null

  return [
    goalEntry({
      is: 'heading',
      text: g?.label ?? GOAL_HEADING,
      mark: g?.mark ?? null,
      page: isTyping ? null : page,
    }),
    goalEntry({ is: 'title', goal: g, isTyping, suggestion }),
    ...(fold === null ? [] : [goalEntry({ is: 'fold', fold })]),
    ...milestones.flatMap((row, n) => {
      const rows = milestoneRows(row, isUnfolded, isCollapsed)
      const joints = workJoints(rows, row.line)

      return [
        ...(isSpacedAbove(milestones, n, isUnfolded, isCollapsed)
          ? [goalEntry({ is: 'gap', line: milestones[n - 1]?.line ?? null })]
          : []),
        ...(row.startsLater ? [goalEntry({ is: 'later' })] : []),
        goalEntry({ is: 'milestone', row }),
        ...rows.map((r, n): Entry => ({ kind: 'page', row: r, joint: joints[n] ?? { arm: null, beside: null } })),
      ]
    }),
  ]
}

/** `lines` with the path's line in the milestones' mark column, `┆` into the milestone that reads next. */
function withPathLine(lines: string[], line: PathLine, s: Style): string[] {
  return withJoint(lines, { arm: null, beside: line }, s)
}

const ARMS = { tee: '├─', elbow: '└─' } as const

/**
 * A milestone's work row, drawn one cell narrower so it can sit a cell further in, where a subject's child sits after
 * its arm. Its joint then draws its arm and a space before its mark.
 */
export function workRowLines(draw: (width: number) => string[], joint: WorkJoint, d: Draw): string[] {
  const shifted = draw(d.width - 1).map(l => `${l.slice(0, PAGE_TEXT_AT - 1)} ${l.slice(PAGE_TEXT_AT - 1)}`)

  return withJoint(shifted, joint, d.style)
}

/**
 * Lines with a joint in the milestones' mark column: an arm on the first line, and the nesting connector, `│`, or the
 * path's line, `│` or `┆` into next, beside the lines.
 */
function withJoint(lines: string[], joint: WorkJoint, s: Style): string[] {
  const glyph = joint.beside === null ? null : joint.beside === 'to-next' ? '┆' : '│'
  const drawn = (l: string, g: string) =>
    l.slice(0, PAGE_MARK_AT).padEnd(PAGE_MARK_AT) + s.dim(g) + l.slice(PAGE_MARK_AT + g.length)

  return lines.map((l, n) => {
    const g = n === 0 && joint.arm !== null ? ARMS[joint.arm] : glyph

    return g === null ? l : drawn(l, g)
  })
}

/** Under the empty state: New, the suggested goal's offer, or the field New opened. */
export function setGoal(under: {
  keys: StatusKey[]
  offerKeys: StatusKey[]
  isFieldOpen: boolean
  suggestion: string | null
}): Entry[] {
  if (under.isFieldOpen) return [goalEntry({ is: 'field' })]

  return [
    ...(under.keys.length === 0 ? [] : [goalEntry({ is: 'keys', keys: under.keys })]),
    ...(under.suggestion === null
      ? []
      : [
          goalEntry({ is: 'suggestion', offer: { text: under.suggestion, keys: under.offerKeys, before: under.keys } }),
        ]),
  ]
}

/** The offer's buttons as faces, with the one the goal target's focus is on, or -1 while none of them is. */
function offerFaces(offer: Offer, d: Draw, isSelected: boolean): { faces: ButtonFace[]; focused: number } {
  const before = offer.before.length
  const target = { id: GOAL_KEYS_ID, keys: [...offer.before, ...offer.keys] }
  const focus = isSelected ? pageFocus(target, d.ui) - before : -1
  const faces = offer.keys.map((k): ButtonFace => ({
    label: k.label,
    key: isSelected ? k.hotkey : null,
    isRecommended: false,
    isFollowUp: false,
    ...(k.emphasis === 'quiet' ? { isQuiet: true } : {}),
  }))

  return { faces, focused: focus >= 0 && focus < faces.length ? focus : -1 }
}

/**
 * The suggested goal's offer at column `at`, dim like the line that says no goal is set, with its buttons after it. When
 * they do not fit on the offer's last line, they sit on a line under it.
 */
function offerLines(offer: Offer, d: Draw, at: number, isSelected: boolean): string[] {
  const { width, style: s } = d
  const text = indented(suggestedGoalOffer(offer.text), at, width, Infinity, s.dim)
  const { faces, focused } = offerFaces(offer, d, isSelected)
  if (faces.length === 0) return text
  const keys = faceLines(faces, focused, 0, width, s, s.dim('·'))
  const last = text[text.length - 1] ?? ''
  const first = keys[0] ?? ''
  if (keys.length === 1 && visibleLength(last) + visibleLength(first) + 1 <= width - 1)
    return [...text.slice(0, -1), `${last} ${first}`]

  return [...text, ...faceLines(faces, focused, at - 1, width, s, s.dim('·'))]
}

/** The goal's text field at column `at`, with the draft in it and the cursor after it, under its placeholder. */
function fieldLines(d: Draw, at: number): string[] {
  const { ui, width, style: s } = d
  const text = ui.drafts[GOAL_KEYS_ID]?.text ?? ''
  const field = wrapText(`${text}\u0000`, Math.max(10, width - at - 1))

  return [
    ' '.repeat(at) + s.dim(`${GOAL_FIELD.placeholder}:`),
    ...field.map(l => ' '.repeat(at) + l.replace('\u0000', s.inverse(' '))),
  ]
}

/**
 * A name dim with its fold's chevron after it, as a done milestone folded to its name and a met goal's folded
 * milestones draw. Selected, the name draws bold and the chevron in the accent.
 */
function foldedNameLines(d: Draw, mark: string, name: string, foldId: string, isSelected: boolean): string[] {
  const s = d.style
  const chevron = foldGlyph(d.ui.statusUnfolded.includes(foldId))
  const [namePaint, chevronPaint] = isSelected ? [s.bold, (t: string) => s.tone('accent', t)] : [s.dim, s.dim]

  return pageLine(d, PAGE_MARK_AT, mark, `${name} ${chevron}`, t =>
    t.endsWith(chevron) ? namePaint(t.slice(0, -chevron.length)) + chevronPaint(chevron) : namePaint(t),
  )
}

/**
 * A milestone's lines: its mark and name, then
 * where it stands, its was line and its buttons. A done milestone folded to its name draws the name dim with the fold's
 * chevron after it, and takes Enter as its fold.
 */
function milestoneLines(m: MilestoneRow, d: Draw, isSelected: boolean): string[] {
  const { width, now, style: s } = d
  const mark = paintMark({ ...m, isRunning: false }, now, s)
  const isCollapsed = collapsedIn(d.screen.view)
  const hasWork = milestoneRows(m, id => d.ui.statusUnfolded.includes(id), isCollapsed).length > 0
  const column: PathLine = m.line ?? (hasWork ? 'continues' : null)
  if (m.foldId !== null) {
    const [name = '', ...wrapped] = foldedNameLines(d, mark, m.name, m.foldId, isSelected)

    return [name, ...withPathLine(wrapped, column, s)]
  }
  const chevron = foldChevron(m, d, isSelected)
  const namePaint = (t: string) =>
    (m.isMuted ? s.dim : (u: string) => u)(m.isChanged || (chevron && isSelected) ? s.bold(t) : t)
  const [first = '', ...rest] = pageLine(d, PAGE_MARK_AT, mark, m.name, namePaint, { text: m.text, chevron })
  const was = m.was ? indented(`${WAS_PREFIX}${m.was}`, PAGE_TEXT_AT, width, STATUS_TEXT_LINES, s.dim) : []
  const after = [...rest, ...was, ...pageButtonLines({ id: m.id, keys: milestoneKeyPlan(m) }, d, isSelected)]

  return [first, ...withPathLine(after, column, s)]
}

/**
 * The goal's heading row: its mark, if any, in the mark column, its title, a rule, then the goal's buttons at the right
 * edge. A marked title takes its mark's tone. When the buttons do not fit beside the title with a short rule, the rule
 * runs to the edge and the buttons wrap under it, still at the right.
 */
function headingLines(part: GoalPart & { is: 'heading' }, d: Draw, isSelected: boolean): string[] {
  const { width, now, style: s } = d
  const keys = part.page
    ? pageButtonLines({ id: GOAL_KEYS_ID, keys: goalKeyGroups(part.page).heading }, d, isSelected, 1, s.dim('·'))
    : []
  const right = width - 1
  const { mark } = part
  const at = mark === null ? PAGE_MARK_AT : PAGE_TEXT_AT
  const lead =
    mark === null ? ' '.repeat(at) : `${' '.repeat(PAGE_MARK_AT)}${paintMark({ ...mark, isRunning: false }, now, s)} `
  const labelPaint = mark === null ? s.dim : feedbackPaint(mark.tone, s)
  const ruled = (cells: number) => `${lead}${labelPaint(part.text)}${s.dim(` ${'─'.repeat(cells)}`)}`
  const label = `${part.text} `
  const keysCells = keys.length === 1 ? visibleLength(keys[0]!) : Infinity
  const rule = right - at - cellWidth(label) - keysCells
  if (keys.length === 0 || rule < 4) {
    const atRight = (l: string) => ' '.repeat(Math.max(0, right - visibleLength(l))) + l

    return [ruled(Math.max(4, pageRuleCells(width, at) - cellWidth(label))), ...keys.map(atRight)]
  }

  return [`${ruled(rule)}${keys[0]}`]
}

export function drawGoalPart(part: GoalPart, d: Draw, isSelected: boolean): string[] {
  const { width, style: s } = d
  if (part.is === 'heading') return headingLines(part, d, isSelected)
  if (part.is === 'fold') return foldedNameLines(d, ' ', part.fold.text, part.fold.id, isSelected)
  /** A marked goal's lines start at the text column, under its title. */
  const textAt = part.is === 'title' && part.goal?.mark ? PAGE_TEXT_AT : PAGE_MARK_AT
  const at = (text: string, paint: (t: string) => string, lines = STATUS_TEXT_LINES) =>
    indented(text, textAt, width, lines, paint)
  if (part.is === 'gap') return withPathLine([''], part.line, s)
  if (part.is === 'later') return [partHeading(LATER_TEXT, width, s)]
  if (part.is === 'title') {
    const g = part.suggestion === null ? part.goal : null
    const text = part.isTyping
      ? fieldLines(d, textAt)
      : part.suggestion !== null
        ? offerLines(part.suggestion, d, textAt, isSelected)
        : at(g ? g.text : NO_GOAL_TEXT, g ? s.bold : s.dim, Infinity)

    return [
      ...text,
      ...(g?.was ? at(`${WAS_PREFIX}${g.was}`, s.dim) : []),
      ...(g?.now ? at(g.now, s.dim) : []),
      ...(g?.awaiting ? at(g.awaiting, s.dim) : []),
    ]
  }
  if (part.is === 'milestone') return milestoneLines(part.row, d, isSelected)
  if (part.is === 'suggestion') return offerLines(part.offer, d, PAGE_MARK_AT, isSelected)
  if (part.is === 'keys') return pageButtonLines({ id: GOAL_KEYS_ID, keys: part.keys }, d, isSelected, PAGE_MARK_AT)
  return fieldLines(d, PAGE_MARK_AT)
}
