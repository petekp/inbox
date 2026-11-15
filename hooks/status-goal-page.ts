import type { Item, SessionStatus, StatusGoal } from '../types'
import { HELD_MARK, SUBJECT_MARKS } from './help'
import type { StatusTone } from './help'
import type { StatusRow } from './status-page'
import { namedList } from './status-page-parts'
import { milestonePath, namesOnlyMilestoneUnderWay } from './status-path'
import type { PathLine, PathPlace, PathStep } from './status-path'

/** A milestone under the goal, in the goal's path. A change draws its name in bold until the person looks. */
export type MilestoneRow = {
  id: string
  mark: string
  tone: StatusTone
  name: string
  place: PathPlace
  /** "now", "now · 3h" or "next", drawn muted at the right of the name's first line. */
  word: string | null
  line: PathLine
  /** Whether the "Later" label and its rule draw above it. */
  startsLater: boolean
  /** Whether it changed since the person last looked, so its name draws bold. */
  isChanged: boolean
  /** Whether its name draws muted: it waits under Later, was dropped, or is done and folded to its name. */
  isMuted: boolean
  /** The fold a done milestone holds its work in once the person has seen it, so a look draws its rows only unfolded. */
  foldId: string | null
  /** Where it stands. Null when it says nothing. */
  text: string | null
  /** "waiting" while an open ask holds it up. */
  stall: { text: string; tone: 'needsYou' } | null
  /** The plan a change replaced, while the person has not seen it. */
  was: string | null
  /** The oldest open ask that holds it up, which its View button opens. */
  ask: { id: string; kind: Item['kind'] } | null
  /** The work that serves it, drawn under it one step in. `statusPage` fills it. */
  rows: StatusRow[]
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
   * Null when it only names the milestone that reads "now".
   */
  now: string | null
  /** The line drawn in place of the milestones until the Status call writes them for this goal. */
  awaiting: string | null
  /**
   * Once the goal is met, the line its milestones fold into, naming the done ones, as "Release pass run, PRs merged". It
   * starts folded, and `shownMilestones` gives the milestones a look draws under it. `statusPage` fills it.
   */
  milestonesFold: { id: string; text: string } | null
  milestones: MilestoneRow[]
}

/** The goal's parts of the Status page. */
export type GoalParts = {
  goal: GoalBlock | null
  /** Whether Undo can bring back the goal the person removed. */
  canRestoreGoal: boolean
}

const AWAITING_TEXT = 'Milestones after the next reply'
/** The heading of the goal's section while no goal is met: the same with a goal or without one. */
export const GOAL_HEADING = 'Goal'
/** The dim line under the goal's heading while no goal is set. */
export const NO_GOAL_TEXT = "No goal yet. The inbox sets one when the work shows where it's headed."
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

/** The oldest open ask linked to `id`, a subject or a milestone. */
export function oldestAsk(
  items: readonly Item[],
  links: Readonly<Record<string, readonly string[]>>,
  id: string,
): { id: string; kind: Item['kind'] } | null {
  const oldest = items
    .filter(i => links[i.id]?.includes(id))
    .sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0]

  return oldest ? { id: oldest.id, kind: oldest.kind } : null
}

function milestoneRow(step: PathStep, o: SessionStatus, items: readonly Item[]): MilestoneRow {
  const m = step.milestone
  const isOpen = m.status !== 'done' && m.status !== 'dropped'
  const servingIds = new Set(Object.entries(o.serves).flatMap(([id, to]) => (to === m.id ? [id] : [])))
  const holds = items.filter(i => {
    const to = o.askSubjects[i.id] ?? []
    return to.some(id => id === m.id || servingIds.has(id))
  })
  const isHeld = isOpen && holds.length > 0
  const lastChangeAt = Math.max(m.changedAt, m.madeNextAt ?? -Infinity)
  const isChanged = o.lastLookAt !== null && lastChangeAt > o.lastLookAt && lastChangeAt > (o.goal?.setAt ?? 0)
  const direct = oldestAsk(items, o.askSubjects, m.id)
  const viaSubject = holds.sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0]

  return {
    id: m.id,
    ...(isHeld ? HELD_MARK : SUBJECT_MARKS[m.status]),
    name: m.name,
    place: step.place,
    word: step.word,
    line: step.line,
    startsLater: step.startsLater,
    isChanged,
    isMuted: step.place === 'later' || step.place === 'dropped',
    foldId: null,
    text: m.text || null,
    stall: isHeld ? { text: 'waiting', tone: 'needsYou' } : null,
    was: isChanged ? m.was : null,
    ask: !isHeld ? null : (direct ?? (viaSubject ? { id: viaSubject.id, kind: viaSubject.kind } : null)),
    rows: [],
  }
}

/** The goal block with its Now line and its milestones in path order, from the saved Status and the open asks at `now`. */
export function goalPage(o: SessionStatus | null, items: readonly Item[], now: number): GoalParts {
  const g = o?.goal ?? null
  if (o === null || g === null) return { goal: null, canRestoreGoal: o?.goalRemoved != null }
  const isWasShown = g.was !== null && (o.lastLookAt === null || g.setAt > o.lastLookAt)
  const kept = o.milestones.filter(m => m.status !== 'dropped')
  const shown = o.milestones.filter(
    m => m.status !== 'dropped' || (o.lastLookAt !== null && m.changedAt > o.lastLookAt),
  )
  const isMet = g.metAt !== null
  const isAwaiting = g.isAwaitingMilestones || kept.length === 0
  const head = o.head
  const nowText = head ? head.description || head.title : null
  const isNowSaid = nowText !== null && namesOnlyMilestoneUnderWay(nowText, g.isAwaitingMilestones ? [] : kept)
  const milestones = g.isAwaitingMilestones ? [] : milestonePath(shown, now).map(step => milestoneRow(step, o, items))

  return {
    goal: {
      label: isMet ? MET_LABEL : GOAL_HEADING,
      mark: isMet ? SUBJECT_MARKS.done : null,
      text: g.text,
      isMet,
      was: isWasShown ? g.was : null,
      // A met goal's head draws in its own section, since the work no longer serves the goal.
      now: nowText !== null && !isNowSaid && !isMet ? `Now: ${nowText}` : null,
      awaiting: isAwaiting ? AWAITING_TEXT : null,
      milestonesFold: null,
      milestones,
    },
    canRestoreGoal: false,
  }
}
