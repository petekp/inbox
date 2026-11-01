import type { Item, Milestone, SessionStatus } from '../types'
import { HELD_MARK, SUBJECT_MARKS } from './help'
import type { StatusTone } from './help'

/** A milestone under the goal. Its place never changes, so a change draws its name in bold until the person looks. */
export type MilestoneRow = {
  id: string
  mark: string
  tone: StatusTone
  name: string
  /** Where it stands. Null when it says nothing. */
  text: string | null
  /** "waiting" while an open ask holds it up. */
  stall: { text: string; tone: 'needsYou' } | null
  /** The plan a change replaced, while the person has not seen it. */
  was: string | null
  /** Whether it changed since the person last looked. */
  isChanged: boolean
  /** The oldest open ask that holds it up, which its View button opens. */
  ask: { id: string; kind: Item['kind'] } | null
}

/** The goal and where the work stands against it. */
export type GoalBlock = {
  /** "Goal · 1 of 5 done", "Goal" while the milestones are not written yet, or "Goal met". */
  label: string
  text: string
  isMet: boolean
  /** The goal this one replaced, while the person has not seen it. */
  was: string | null
  /** The line drawn in place of the milestones until the Status call writes them for this goal. */
  awaiting: string | null
  milestones: MilestoneRow[]
}

/** A goal the Status call proposed from the person's words, for the person to use, edit or decline. */
export type ProposalBlock = {
  label: string
  text: string
  milestones: { mark: string; tone: StatusTone; name: string }[]
}

/** The goal's parts of the Status page. */
export type GoalParts = {
  goal: GoalBlock | null
  proposal: ProposalBlock | null
  /** While a goal is set, the head draws as this one line, its description after "Now: ". */
  nowLine: string | null
}

export const AWAITING_TEXT = 'Milestones after the next reply'
const PROPOSAL_LABEL = 'Proposed goal · from your message'

/** The oldest open ask linked to `id`, a subject or a milestone. */
export function oldestAsk(
  items: readonly Item[],
  links: Readonly<Record<string, string>>,
  id: string,
): { id: string; kind: Item['kind'] } | null {
  const oldest = items.filter(i => links[i.id] === id).sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0]

  return oldest ? { id: oldest.id, kind: oldest.kind } : null
}

function milestoneRow(m: Milestone, o: SessionStatus, items: readonly Item[]): MilestoneRow {
  const isOpen = m.status !== 'done' && m.status !== 'dropped'
  const servingIds = new Set(Object.entries(o.serves).flatMap(([id, to]) => (to === m.id ? [id] : [])))
  const holds = items.filter(i => {
    const to = o.askSubjects[i.id]
    return to === m.id || (to !== undefined && servingIds.has(to))
  })
  const isHeld = isOpen && holds.length > 0
  const isChanged = o.lastLookAt !== null && m.changedAt > o.lastLookAt
  const direct = oldestAsk(items, o.askSubjects, m.id)
  const viaSubject = holds.sort((i, j) => (i.at ?? -Infinity) - (j.at ?? -Infinity))[0]

  return {
    id: m.id,
    ...(isHeld ? HELD_MARK : SUBJECT_MARKS[m.status]),
    name: m.name,
    text: m.text || null,
    stall: isHeld ? { text: 'waiting', tone: 'needsYou' } : null,
    was: isChanged ? m.was : null,
    isChanged,
    ask: !isHeld ? null : (direct ?? (viaSubject ? { id: viaSubject.id, kind: viaSubject.kind } : null)),
  }
}

/** The goal block, the proposal and the "Now" line, from the saved Status and the open asks. */
export function goalPage(o: SessionStatus | null, items: readonly Item[]): GoalParts {
  const proposal: ProposalBlock | null = o?.proposedGoal
    ? {
        label: PROPOSAL_LABEL,
        text: o.proposedGoal.text,
        milestones: o.proposedGoal.milestones.map(m => ({ ...SUBJECT_MARKS[m.status], name: m.name })),
      }
    : null
  const g = o?.goal ?? null
  if (o === null || g === null) return { goal: null, proposal, nowLine: null }
  const isWasShown = g.was !== null && (o.lastLookAt === null || g.setAt > o.lastLookAt)
  const kept = o.milestones.filter(m => m.status !== 'dropped')
  const shown = o.milestones.filter(
    m => m.status !== 'dropped' || (o.lastLookAt !== null && m.changedAt > o.lastLookAt),
  )
  const done = kept.filter(m => m.status === 'done').length
  const isMet = g.metAt !== null
  const label = isMet
    ? 'Goal met'
    : g.isAwaitingMilestones || kept.length === 0
      ? 'Goal'
      : `Goal · ${done} of ${kept.length} done`
  const head = o.head

  return {
    goal: {
      label,
      text: g.text,
      isMet,
      was: isWasShown ? g.was : null,
      awaiting: g.isAwaitingMilestones || kept.length === 0 ? AWAITING_TEXT : null,
      milestones: g.isAwaitingMilestones ? [] : shown.map(m => milestoneRow(m, o, items)),
    },
    proposal,
    nowLine: head ? `Now: ${head.description || head.title}` : null,
  }
}
