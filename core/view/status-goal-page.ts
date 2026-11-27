import type { Item, Milestone, SessionStatus, StatusGoal } from '../../types'
import { isOpen as isOpenStatus } from '../domain/status-limits'
import { heldToneOf, SUBJECT_MARKS } from './help'
import type { StatusTone } from './help'
import type { StatusRow } from './status-page'
import { askRows, namedList, textBeyondName } from './status-page-parts'
import { milestonePath, namesOnlyMilestoneUnderWay } from './status-path'
import { hasRunningGoal } from '../domain/status-suggest'
import type { PathLine, PathPlace, PathStep } from './status-path'

/** A milestone under the goal, in the goal's path. Its name draws bold until the milestone is done or dropped. */
export type MilestoneRow = {
  /** The milestone's id, or the subject's id when `subject` is drawn in its place. */
  id: string
  mark: string
  tone: StatusTone
  name: string
  place: PathPlace
  line: PathLine
  /** Whether the "Later" label and its rule draw above it. */
  startsLater: boolean
  /** Whether its name draws bold: it is under way or still to come, and not done or dropped. */
  isBold: boolean
  /** Whether its name draws muted: it waits under Later, or is done or dropped. */
  isMuted: boolean
  /** The fold a done milestone holds its work in once the person has seen it, so a look draws its rows only unfolded. */
  foldId: string | null
  /**
   * The work under it, which a fold on its name hides: its subjects, folded ones too, and running work linked to none.
   * 0 while it has a done fold or draws no rows, and its name then folds nothing. `statusPage` fills it.
   */
  foldCount: number
  /** Where it stands. Null when it says nothing. */
  text: string | null
  /** The plan a change replaced, while the person has not seen it. */
  was: string | null
  /**
   * The work that serves it, drawn under it one step in. `goalPage` puts the `ask` row of the open ask linked to the
   * milestone itself first, a question before a task, and `statusPage` adds the work after it. An ask that holds it up
   * through an open subject, linked to the milestone too or not, hangs under that subject's row instead, so each ask
   * draws once.
   */
  rows: StatusRow[]
  /**
   * The subject drawn in its place, as `subjectInPlaceOf` finds it, or null. Its id, mark, name, text and was are then
   * the subject's, its rows are the subject's ask row and children, and a look draws the rest of the subject's row on it and
   * counts the subject seen while it shows. `statusPage` fills it.
   */
  subject: (StatusRow & { kind: 'subject' }) | null
}

/** The goal and where the work stands against it. */
export type GoalBlock = {
  /** The section's heading: `GOAL_HEADING`, or "Goal met". */
  label: string
  /** The heading's mark, in the mark column with the label in its tone: ✓ in the done tone once the goal is met. */
  mark: { mark: string; tone: StatusTone } | null
  text: string
  isMet: boolean
  /** The goal this one replaced, while the person has not seen it. */
  was: string | null
  /**
   * What the session works on now, as "Now: " and the head's description, drawn under the goal's text and its was line.
   * Null when it only names the milestone that reads "now", or holds every key word of a working subject's name.
   */
  now: string | null
  /**
   * Once the goal is met, the line its milestones fold into, naming the done ones, as "Release pass run, PRs merged". It
   * starts folded, and `shownMilestones` gives the milestones a look draws under it. `statusPage` fills it.
   */
  milestonesFold: { id: string; text: string } | null
  milestones: MilestoneRow[]
}

/** A line under the goal's text: where the work stands now, or the goal this one replaced. */
type GoalNote = { kind: 'now' | 'was'; text: string }

/** The lines under the goal's text, in the order every look draws them: the Now line, then the goal before it, last. */
export const goalNotes = (g: GoalBlock | null): GoalNote[] => [
  ...(g?.now ? [{ kind: 'now' as const, text: g.now }] : []),
  ...(g?.was ? [{ kind: 'was' as const, text: g.was }] : []),
]

/** The goal's parts of the Status page. */
export type GoalParts = {
  goal: GoalBlock | null
  /** Whether Undo can bring back the goal the person removed. */
  canRestoreGoal: boolean
  /** The goal the Status call offers while no goal is set or the goal is met, which the goal's place shows with Set goal and Edit. Null when none is. */
  suggestedGoal: string | null
}

/** The heading of the goal's section while no goal is met: the same with a goal or without one. */
export const GOAL_HEADING = 'Goal'
/** The dim line under the goal's heading while no goal is set. */
export const NO_GOAL_TEXT = "No goal yet. The inbox sets one when the work shows where it's headed."
/** The suggested goal as an offer in the goal text's style, in the line where "No goal yet" would draw, with its buttons after it. */
export const suggestedGoalOffer = (text: string): string => `Next goal: “${text}”?`
/** What starts the id of the fold a met goal's milestones start in, apart from row and milestone ids. */
const MILESTONES_FOLD_PREFIX = 'goal-milestones'

export const isMilestonesFold = (id: string) => id.startsWith(`${MILESTONES_FOLD_PREFIX}-`)

const MET_LABEL = 'Goal met'

/** The milestones a look draws: none while the met goal's milestones fold is shut. */
export function shownMilestones(g: GoalBlock | null, isUnfolded: (id: string) => boolean): MilestoneRow[] {
  if (g === null) return []

  return g.milestonesFold !== null && !isUnfolded(g.milestonesFold.id) ? [] : g.milestones
}

/**
 * The line a met goal's milestones fold into, naming them, or null while one is not done or `isWorkClosed` says work
 * under it is open or running. So the fold never hides an ask, running work or a milestone dropped since the last look.
 * Its id names the goal and when it was met, so a fold opened for one goal starts shut for the next.
 */
export function metMilestonesFold(
  g: StatusGoal,
  milestones: readonly MilestoneRow[],
  isWorkClosed: (m: MilestoneRow) => boolean,
): GoalBlock['milestonesFold'] {
  const isFolded =
    g.metAt !== null && milestones.length > 0 && milestones.every(m => m.place === 'done' && isWorkClosed(m))

  return isFolded
    ? { id: `${MILESTONES_FOLD_PREFIX}-${g.setAt}-${g.metAt}`, text: namedList(milestones.map(m => m.name)) }
    : null
}

/**
 * The open ask that hangs under work that `holds` hold up: the oldest question while one is open, else the oldest task.
 * Its kind matches the tone of the work's mark.
 */
export function askSettingMark(holds: readonly Item[]): { id: string; kind: Item['kind'] } | null {
  const oldestFirst = [...holds].sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))
  const setter = oldestFirst.find(i => i.kind === 'question') ?? oldestFirst[0]

  return setter ? { id: setter.id, kind: setter.kind } : null
}

/** The open asks linked to `id`, a subject or a milestone. */
export const asksLinkedTo = (
  items: readonly Item[],
  links: Readonly<Record<string, readonly string[]>>,
  id: string,
): Item[] => items.filter(i => links[i.id]?.includes(id))

/**
 * Where an open milestone stands when the Status call has not said, while open work serves it: how many of the subjects
 * that serve it are done, as "1 of 3 done". Null otherwise.
 */
function workCountText(m: Milestone, o: SessionStatus): string | null {
  const work = o.subjects.filter(s => s.status !== 'dropped' && o.serves[s.id] === m.id)
  const done = work.filter(s => s.status === 'done').length
  const isUnsaid = isOpenStatus(m) && m.text.trim() === '' && done < work.length

  return isUnsaid ? `${done} of ${work.length} done` : null
}

function milestoneRow(step: PathStep, o: SessionStatus, items: readonly Item[]): MilestoneRow {
  const m = step.milestone
  const isOpen = isOpenStatus(m)
  const servingIds = new Set(Object.entries(o.serves).flatMap(([id, to]) => (to === m.id ? [id] : [])))
  const holds = items.filter(i => {
    const to = o.askSubjects[i.id] ?? []
    return to.some(id => id === m.id || servingIds.has(id))
  })
  const isHeld = isOpen && holds.length > 0
  const openServing = new Set(o.subjects.filter(s => servingIds.has(s.id) && isOpenStatus(s)).map(s => s.id))
  const ownHolds = holds.filter(i => {
    const to = o.askSubjects[i.id] ?? []
    return to.includes(m.id) && !to.some(id => openServing.has(id))
  })
  const lastChangeAt = Math.max(m.changedAt, m.madeNextAt ?? -Infinity)
  const isChanged = o.lastLookAt !== null && lastChangeAt > o.lastLookAt && lastChangeAt > (o.goal?.setAt ?? 0)

  return {
    id: m.id,
    ...SUBJECT_MARKS[m.status],
    ...(isHeld ? { tone: heldToneOf(holds.map(i => i.kind)) } : {}),
    name: m.name,
    place: step.place,
    line: step.line,
    startsLater: step.startsLater,
    isBold: isOpen,
    isMuted: step.place === 'later' || step.place === 'dropped' || step.place === 'done',
    foldId: null,
    foldCount: 0,
    text: textBeyondName(m.name, m.text) ?? workCountText(m, o),
    was: isChanged ? m.was : null,
    rows: isHeld ? askRows(m.id, askSettingMark(ownHolds), items, 1, null) : [],
    subject: null,
  }
}

/** The goal block with its Now line and its milestones in path order, from the saved Status and the open asks. */
export function goalPage(o: SessionStatus | null, items: readonly Item[]): GoalParts {
  const g = o?.goal ?? null
  const suggestedGoal = o === null || hasRunningGoal(o) ? null : o.suggestedGoal
  if (o === null || g === null) return { goal: null, canRestoreGoal: o?.goalRemoved != null, suggestedGoal }
  const isWasShown = g.was !== null && (o.lastLookAt === null || g.setAt > o.lastLookAt)
  const kept = o.milestones.filter(m => m.status !== 'dropped')
  const shown = o.milestones.filter(
    m => m.status !== 'dropped' || (o.lastLookAt !== null && m.changedAt > o.lastLookAt),
  )
  const isMet = g.metAt !== null
  const head = o.head
  const nowText = head ? head.description || head.title : null
  const isNowSaid = nowText !== null && namesOnlyMilestoneUnderWay(nowText, g.isAwaitingMilestones ? [] : kept)
  const milestones = g.isAwaitingMilestones ? [] : milestonePath(shown).map(step => milestoneRow(step, o, items))

  return {
    goal: {
      label: isMet ? MET_LABEL : GOAL_HEADING,
      mark: isMet ? { mark: SUBJECT_MARKS.done.mark, tone: 'success' } : null,
      text: g.text,
      isMet,
      was: isWasShown ? g.was : null,
      // A met goal's head draws in its own section, since the work no longer serves the goal.
      now: nowText !== null && !isNowSaid && !isMet ? `Now: ${nowText}` : null,
      milestonesFold: null,
      milestones,
    },
    canRestoreGoal: false,
    suggestedGoal,
  }
}
