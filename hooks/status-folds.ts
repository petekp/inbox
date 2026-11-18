import type { Ledger } from '../types'
import { foldGlyph } from './fold-chevron'
import type { MilestoneRow } from './status-goal-page'
import { STALL_GAP } from './status-page'
import type { StatusCount, StatusPage, StatusRow } from './status-page'

/**
 * Status parents and what waits on the person under each, by parent id. A parent is a subject with a delegate under it,
 * or a milestone of the goal that a subject serves, which the person can fold by its name. Under a subject, what waits
 * is each running delegate of it that Herdr shows blocked. Under a milestone, it is each open ask that holds up a subject
 * serving it, and each blocked delegate of such a subject. An ask that holds up the parent itself shows on the parent's
 * own line, so it waits on no fold.
 */
export function waitingUnderParents(ledger: Pick<Ledger, 'overview' | 'items'>): Map<string, string[]> {
  const o = ledger.overview
  if (!o) return new Map()
  const blockedOf = (subjectId: string) =>
    o.children
      .filter(c => c.subjectId === subjectId && c.endedAt === null && c.delegateState === 'blocked')
      .map(c => c.id)
  const asksOf = (subjectId: string) =>
    ledger.items.filter(i => o.askSubjects[i.id]?.includes(subjectId)).map(i => i.id)
  const subjects = o.subjects.filter(x => x.into === null)
  const delegating = subjects.filter(x => o.children.some(c => c.subjectId === x.id))
  const milestones = o.goal ? o.milestones.filter(m => subjects.some(x => o.serves[x.id] === m.id)) : []

  return new Map<string, string[]>([
    ...delegating.map((x): [string, string[]] => [x.id, blockedOf(x.id)]),
    ...milestones.map((m): [string, string[]] => {
      const serving = subjects.filter(x => o.serves[x.id] === m.id)
      return [m.id, [...new Set(serving.flatMap(x => [...asksOf(x.id), ...blockedOf(x.id)]))]]
    }),
  ])
}

/** What the closed counts fold says before its counts. */
export const COUNTS_LABEL = 'Also open: '

/** The closed counts fold's line as one string, as "Also open: ● 3 working · ◌ 3 waiting", for a look that draws a fold as plain text. */
export const countsText = (counts: StatusCount[]) =>
  `${COUNTS_LABEL}${counts.map(c => `${c.mark} ${c.text}`).join(STALL_GAP)}`

/** `STALL_GAP` with a no-break space before its dot, so a wrapped line ends with the dot and never starts with it. */
export const COUNTS_GAP = STALL_GAP.replace(' ', '\u00a0')

/** A count's words after its mark, joined with no-break spaces so a wrapped line never splits a count. */
export const countWords = (c: StatusCount) => `\u00a0${c.text.replaceAll(' ', '\u00a0')}`

/** The closed counts fold's line as units that wrap whole: the label, then each count with its mark and, but for the last, the gap after it. A mark has its tone. */
export const countsUnits = (counts: StatusCount[]): { text: string; tone: StatusCount['tone'] | 'plain' }[][] => [
  [{ text: COUNTS_LABEL, tone: 'plain' }],
  ...counts.map((c, n) => [
    { text: c.mark, tone: c.tone },
    { text: `${countWords(c)}${n < counts.length - 1 ? COUNTS_GAP : ''}`, tone: 'plain' as const },
  ]),
]

/** The units `countsUnits` gives. */
export type CountsUnits = ReturnType<typeof countsUnits>

/** What follows a parent's name: v while its rows show, else › and how many rows of work its fold hides. */
export const parentChevron = (isCollapsed: boolean, foldCount: number) =>
  isCollapsed ? `${foldGlyph(false)} ${foldCount}` : foldGlyph(true)

/** Whether `id` names a parent the person folded, as a look reads its view's `collapsed`. */
export type IsCollapsed = (id: string) => boolean

const NONE_COLLAPSED: IsCollapsed = () => false

/** `rows` without the rows under each subject `isCollapsed` names, which sit deeper than it until the next row at its depth. */
function withoutCollapsed(rows: StatusRow[], isCollapsed: IsCollapsed): StatusRow[] {
  let hiddenBelow: number | null = null

  return rows.filter(r => {
    if (hiddenBelow !== null && r.depth > hiddenBelow) return false
    hiddenBelow = r.kind === 'subject' && isParentCollapsed(r, isCollapsed) ? r.depth : null
    return true
  })
}

/**
 * `rows` as a look draws them: each done fold and counts fold that `isUnfolded` names by id followed by the rows it
 * holds, which are finished work for a done fold and open work for a counts fold, and none of the rows under a subject
 * `isCollapsed` names.
 */
export function unfoldedRows(
  rows: StatusRow[],
  isUnfolded: (id: string) => boolean,
  isCollapsed: IsCollapsed = NONE_COLLAPSED,
): StatusRow[] {
  return withoutCollapsed(rows, isCollapsed).flatMap(r =>
    (r.kind === 'done-fold' || r.kind === 'counts') && isUnfolded(r.id) ? [r, ...r.rows] : [r],
  )
}

/** Whether a subject's or milestone's rows are folded behind its name. */
export const isParentCollapsed = (p: { id: string; foldCount: number }, isCollapsed: IsCollapsed) =>
  p.foldCount > 0 && isCollapsed(p.id)

/**
 * The rows a look draws under a milestone: none while it is a done milestone folded to its name, or folded by the
 * person, else its rows with each unfolded done fold opened.
 */
export function milestoneRows(
  m: Pick<MilestoneRow, 'id' | 'foldId' | 'foldCount' | 'rows'>,
  isUnfolded: (id: string) => boolean,
  isCollapsed: IsCollapsed = NONE_COLLAPSED,
): StatusRow[] {
  const isShut = (m.foldId !== null && !isUnfolded(m.foldId)) || isParentCollapsed(m, isCollapsed)

  return isShut ? [] : unfoldedRows(m.rows, isUnfolded, isCollapsed)
}

const listRows = (milestones: MilestoneRow[], rows: StatusRow[]) => [
  ...milestones.flatMap(m => (m.foldId === null ? m.rows : [])),
  ...rows,
]

/**
 * Every row of the Status's list in the order the looks draw them: each milestone's rows, then the list after the goal.
 * A milestone folded to its name holds none. The rows of milestones behind a met goal's shut fold, and of parents the
 * person folded, are included, which `drawnStatusRows` leaves out.
 */
export function statusListRows(page: StatusPage): StatusRow[] {
  return listRows(page.goal?.milestones ?? [], page.rows)
}

/**
 * The rows of the Status's list a look draws while `isUnfolded` and `isCollapsed` say which folds are open, with each
 * done fold shut, as a look reports what it shows.
 */
export function drawnStatusRows(
  page: StatusPage,
  isUnfolded: (id: string) => boolean,
  isCollapsed: IsCollapsed = NONE_COLLAPSED,
): StatusRow[] {
  const fold = page.goal?.milestonesFold ?? null
  const milestones = fold !== null && !isUnfolded(fold.id) ? [] : (page.goal?.milestones ?? [])
  const shown = milestones.filter(m => !isParentCollapsed(m, isCollapsed))

  return withoutCollapsed(listRows(shown, page.rows), isCollapsed)
}
