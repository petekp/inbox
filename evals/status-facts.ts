import { IDLE_MARK, SUBJECT_MARKS } from '../core/view/help'
import type { SubjectStatus } from '../types'

/** What really happened to a piece of work at a step, as the case's author knows it. */
type PieceState = 'working' | 'queued' | 'set-aside' | 'waits-on-other' | 'done' | 'dropped' | 'filed'

/** One piece of the session's work. */
export type Piece = {
  id: string
  /** The name the person would use, then every other name the conversation used for it. */
  names: string[]
  /** A case-insensitive pattern that the name of the subject for this piece matches, and no other subject's. */
  match: string
  state: PieceState
  /** Where it stands, in plain words. */
  stands: string
  /** Parts whose states differ, by part. */
  parts?: Record<string, string>
  /**
   * A case-insensitive pattern for the step left in this session, which where it stands names while the piece is
   * working and every child row under it has finished. It holds only at the step that gives it.
   */
  left?: string
  /** The plan the piece's last change replaced, while the person has not seen it. */
  was?: string
  /** The ids of pieces merged into this one. */
  merged?: string[]
  /** Statuses that are also right, as `queued` and `working` are for work just set aside. */
  alsoRight?: SubjectStatus[]
  /** The id of the goal's milestone this piece serves, or `none` for work the goal does not need. */
  serves?: string
  /** A link that is also right, as `none` for a piece that a milestone's outcome covers only loosely. */
  servesAlso?: string
}

/** One milestone of the goal: an outcome the goal needs, by the fact's own id, not the call's. */
export type MilestoneFact = {
  id: string
  name: string
  /** A case-insensitive pattern that this milestone's name matches, and no other milestone's. */
  match: string
  state: PieceState
  alsoRight?: SubjectStatus[]
}

/** The note after a goal's text on what the page may show for it. */
function goalNote(g: GoalFact): string {
  if (g.isDropped) return ' (the person dropped its outcome: the page shows no goal)'
  if (g.isLeft) return ' (the work has left it: the page shows it met, or shows no goal)'

  return g.mayEnd ? ' (the work has paused on it: the page may keep it, or show it met or no goal)' : ''
}

/**
 * The goal as the session holds it, and its milestones. `isLeft` says the work has left it: the page shows it met or
 * shows no goal, and its milestones' states no longer matter.
 */
type GoalFact = {
  text: string
  match: string
  milestones: MilestoneFact[]
  /** The text of the goal this one replaced, which its was line may name. `factsAfter` sets it. */
  replaced?: string
  /** The work has left it: the page shows it met, or shows no goal. */
  isLeft?: true
  /** The person dropped its outcome: the page shows no goal, met or not. Needs `isLeft`. */
  isDropped?: true
  /** The work has paused on it: the page may keep it, or show it met or no goal. */
  mayEnd?: true
  /** The id of the queued milestone the plan takes up next, when the session made it clear. */
  next?: string
  /**
   * A new goal that is also right in this one's place at this step, as when the person changed the outcome. The page's
   * goal picks which one the step is graded on, in `factsForPage`.
   */
  or?: GoalFact
}

/** An outcome with a finish line that a step makes clear, from the person's words or the work, which a goal set there should match. */
type GoalClear = {
  text: string
  match: string
  /**
   * The step also passes while no goal runs and the suggested goal matches: the work names the outcome it leads to,
   * but not as the person's direction.
   */
  alsoSuggested?: boolean
}

/** An open ask, and the pieces it holds up. */
type AskFact = { match: string; text: string; holdsUp: string[] }

/** Something the session mentions that is not a piece of its work. */
type NotWork = { kind: 'ask' | 'finding' | 'task' | 'rule'; text: string; match: string }

/** Running work, by its host handle: what it does, and the piece it serves. */
type ChildFact = { ref: string; does: string; serves: string }

export type Facts = {
  /** What the session is focused on now. */
  focus: string
  /** A case-insensitive pattern the head matches while `focus` holds. */
  focusMatch: string
  /** A case-insensitive pattern for finished work the focus moved on from. The head's title no longer matches it. */
  pastMatch?: string
  /**
   * A case-insensitive pattern for a head title that names the whole focus. A title that matches it keeps matching
   * while the pattern stays, since the piece being worked on is not the focus.
   */
  titleMatch?: string
  pieces: Piece[]
  asks: AskFact[]
  notWork: NotWork[]
  children: ChildFact[]
  /** The goal as the session holds it. None when no goal is set. */
  goal?: GoalFact | null
  /** The next goal this step makes clear. Null at a step where none is clear. */
  goalClear?: GoalClear | null
  /**
   * The outcome the open work most likely leads to at a step that makes no goal clear, which the goal suggested there
   * should match. Null at a step where the facts name none.
   */
  goalSuggested?: GoalClear | null
  /** The ids of pieces and milestones whose state, place or plan changed at this step. Empty when nothing changed. */
  changed: string[]
}

/** What a step changes in the facts. A piece with a known id updates it, and any other is added. */
export type FactsChange = {
  focus?: string
  focusMatch?: string
  pastMatch?: string
  titleMatch?: string
  pieces?: (Partial<Piece> & { id: string })[]
  /** The open asks after the step, in place of the ones before. */
  asks?: AskFact[]
  notWork?: NotWork[]
  /** The running work after the step, in place of the work before. */
  children?: ChildFact[]
  /** The goal after the step, in place of the one before. */
  goal?: GoalFact | null
  /** Milestones of the goal whose facts change: a known id updates it. */
  milestones?: (Partial<MilestoneFact> & { id: string })[]
  /** The id of the queued milestone the plan now takes up next. */
  next?: string
  goalClear?: GoalClear
  goalSuggested?: GoalClear
}

const CHANGING_KEYS = ['state', 'stands', 'parts', 'was', 'merged', 'serves'] as const

/** The goal after `change`, adding to `changed` each milestone whose state changed or that the goal gained. */
function goalAfter(before: Facts['goal'], change: FactsChange | undefined, changed: string[]): GoalFact | null {
  const goal = change?.goal !== undefined ? change.goal : (before ?? null)
  if (goal === null) return null
  const replaced = before && goal.text !== before.text ? before.text : (goal.replaced ?? before?.replaced)
  const known = new Map((before?.milestones ?? []).map(m => [m.id, m]))
  const milestones = goal.milestones.map(m => {
    const update = change?.milestones?.find(x => x.id === m.id)
    const next = { ...m, ...update }
    if (known.get(m.id)?.state !== next.state) changed.push(m.id)
    return next
  })

  const nextMilestone = change?.next ?? goal.next
  return { ...goal, milestones, ...(nextMilestone ? { next: nextMilestone } : {}), ...(replaced ? { replaced } : {}) }
}

/** The facts after `change`, with `changed` naming each piece whose state, stand, parts, plan or merges changed. */
export function factsAfter(before: Facts, change: FactsChange | undefined): Facts {
  const pieces = [...before.pieces]
  const changed: string[] = []
  for (const p of change?.pieces ?? []) {
    const at = pieces.findIndex(x => x.id === p.id)
    const known = pieces[at]
    if (known === undefined) {
      pieces.push(p as Piece)
      changed.push(p.id)
      continue
    }
    const isChanged = CHANGING_KEYS.some(k => k in p && JSON.stringify(p[k]) !== JSON.stringify(known[k]))
    pieces[at] = { ...known, ...p }
    if (isChanged) changed.push(p.id)
  }

  const givesLeft = new Set((change?.pieces ?? []).filter(p => p.left !== undefined).map(p => p.id))

  return {
    focus: change?.focus ?? before.focus,
    focusMatch: change?.focusMatch ?? before.focusMatch,
    ...((change?.pastMatch ?? before.pastMatch) ? { pastMatch: change?.pastMatch ?? before.pastMatch } : {}),
    ...((change?.titleMatch ?? before.titleMatch) ? { titleMatch: change?.titleMatch ?? before.titleMatch } : {}),
    pieces: pieces.map(({ left, ...p }) => (left !== undefined && givesLeft.has(p.id) ? { ...p, left } : p)),
    asks: change?.asks ?? before.asks,
    notWork: [...before.notWork, ...(change?.notWork ?? [])],
    children: change?.children ?? before.children,
    goal: goalAfter(before.goal, change, changed),
    goalClear: change?.goalClear ?? null,
    goalSuggested: change?.goalSuggested ?? null,
    changed,
  }
}

/**
 * The facts for the goal the page shows, when they allow two. Once the page's goal matches the `or` goal's pattern,
 * that goal holds, replaces the facts' own goal, and is the next goal this step made clear. Otherwise the facts' own
 * goal holds. Either way later steps follow the goal this run chose.
 */
export function factsForPage(f: Facts, shown: string | null): Facts {
  if (!f.goal?.or) return f
  const { or, ...own } = f.goal
  const isOr = shown !== null && new RegExp(or.match, 'i').test(shown)

  return isOr
    ? { ...f, goal: { ...or, replaced: own.text }, goalClear: { text: or.text, match: or.match } }
    : { ...f, goal: own }
}

/** The statuses a subject for `p` may have. */
export function rightStatuses(p: Pick<Piece, 'state' | 'alsoRight'>): SubjectStatus[] {
  const main: Record<PieceState, SubjectStatus[]> = {
    working: ['working'],
    queued: ['queued'],
    'set-aside': ['queued'],
    'waits-on-other': ['waits-on-other'],
    done: ['done'],
    dropped: ['dropped'],
    filed: ['done'],
  }

  return [...main[p.state], ...(p.alsoRight ?? [])]
}

export function isOpenPiece(p: Pick<Piece, 'state'>): boolean {
  return !['done', 'dropped', 'filed'].includes(p.state)
}

const STATE_TEXT: Record<PieceState, string> = {
  working: 'being worked on now',
  queued: 'not started yet',
  'set-aside': 'set aside, not being worked on now',
  'waits-on-other': 'waits on something outside the session',
  done: 'delivered',
  dropped: 'dropped',
  filed: 'filed for later; the session will not do it',
}

/** The facts as the judge reads them. */
export function factsText(f: Facts): string {
  const nameOf = (id: string) => f.pieces.find(p => p.id === id)?.names[0] ?? id
  const piece = (p: Piece) => {
    const also = p.names.length > 1 ? ` (also called ${p.names.slice(1).join(', ')})` : ''
    const parts = p.parts
      ? ` Parts: ${Object.entries(p.parts)
          .map(([part, state]) => `${part}: ${state}`)
          .join('; ')}.`
      : ''
    const was = p.was ? ` Plan changed; it was ${p.was}.` : ''
    const merged = p.merged?.length ? ` Merged into it: ${p.merged.map(nameOf).join(', ')}.` : ''
    const isChanged = f.changed.includes(p.id) ? ' Changed at this step.' : ''
    const alsoMarks = (p.alsoRight ?? []).flatMap(s =>
      s === 'working' ? [SUBJECT_MARKS.working.mark, IDLE_MARK.mark] : [SUBJECT_MARKS[s].mark],
    )
    const alsoRight = alsoMarks.length > 0 ? ` Its row may also show ${alsoMarks.join(' or ')}.` : ''
    const link = (to: string) =>
      to === 'none' ? 'the goal does not need it' : `it serves the milestone ${milestoneName(to)}`
    const serves =
      p.serves === undefined
        ? ''
        : p.servesAlso === undefined
          ? ` ${link(p.serves)[0]!.toUpperCase()}${link(p.serves).slice(1)}.`
          : ` Either ${link(p.serves)}, or ${link(p.servesAlso)}.`

    return `- ${p.names[0]}${also}: ${STATE_TEXT[p.state]}. ${p.stands}.${parts}${was}${merged}${alsoRight}${serves}${isChanged}`
  }
  const milestoneName = (id: string) => f.goal?.milestones.find(m => m.id === id)?.name ?? id
  const list = (lines: string[]) => (lines.length > 0 ? lines.join('\n') : '- none')

  const goal = f.goal
    ? [
        `Goal: ${f.goal.text}${goalNote(f.goal)}`,
        ...(f.goal.replaced ? [`It replaced the goal: ${f.goal.replaced}`] : []),
        'Milestones:',
        list(
          f.goal.milestones.map(
            m =>
              `- ${m.name}: ${STATE_TEXT[m.state]}.${f.goal?.next === m.id ? ' The plan takes it up next.' : ''}${f.changed.includes(m.id) ? ' Changed at this step.' : ''}`,
          ),
        ),
      ]
    : ['Goal: none set']
  const stated = !f.goalClear
    ? []
    : f.goalClear.alsoSuggested
      ? [`This step makes the next goal likely: ${f.goalClear.text}. A goal or a suggested goal for it are both right.`]
      : [`This step makes the next goal clear: ${f.goalClear.text}`]

  return [
    ...goal,
    ...stated,
    `Focus now: ${f.focus}`,
    'Pieces of work:',
    list(f.pieces.map(piece)),
    'Open asks:',
    list(f.asks.map(a => `- "${a.text}" holds up ${a.holdsUp.map(nameOf).join(' and ') || 'no piece'}`)),
    'Not work:',
    list(f.notWork.map(n => `- ${n.kind}: ${n.text}`)),
    'Running work:',
    list(f.children.map(c => `- ${c.does}, for ${nameOf(c.serves)}`)),
  ].join('\n')
}
