import type { Item, Milestone, SessionStatus, Subject } from '../../types'
import { isOpen, stems } from '../domain/status-limits'
import { statusListRows } from './status-folds'
import type { MilestoneRow } from './status-goal-page'
import type { StatusPage, StatusRow } from './status-page'

/** Whether `text` holds every key word of `name`, as `stems` gives them. */
function holdsEveryWordOf(text: string, name: string): boolean {
  const said = stems(text)
  const words = stems(name)

  return words.size > 0 && [...words].every(w => said.has(w))
}

/** Whether two names are named alike: every key word of the one with fewer key words is in the other. */
function isNamedAlike(a: string, b: string): boolean {
  const [x, y] = [stems(a), stems(b)]
  const [short, long] = x.size <= y.size ? [x, y] : [y, x]

  return short.size > 0 && [...short].every(w => long.has(w))
}

/**
 * The page with the goal's Now line left out when the line holds every key word of a working subject the page draws as
 * a row. A subject behind a fold does not count, so the Now line still says what is under way.
 */
export function withoutRepeatedNow(page: StatusPage, o: SessionStatus | null): StatusPage {
  const g = page.goal
  const nowText = o?.head ? o.head.description || o.head.title : null
  if (g === null || g.now === null || o === null || nowText === null) return page
  const drawnIds = new Set(statusListRows(page).flatMap(r => (r.kind === 'subject' ? [r.id] : [])))
  const isRepeated = o.subjects.some(
    x => drawnIds.has(x.id) && x.status === 'working' && holdsEveryWordOf(nowText, x.name),
  )

  return isRepeated ? { ...page, goal: { ...g, now: null } } : page
}

/**
 * The subject the page draws in a milestone's place: the only subject that serves it, dropped ones counted, when that
 * subject was not dropped, the two are named alike and no open ask names the milestone. Null for a dropped milestone.
 */
export function subjectInPlaceOf(o: SessionStatus, m: Milestone, items: readonly Item[]): Subject | null {
  if (m.status === 'dropped') return null
  const work = o.subjects.filter(x => x.into === null && o.serves[x.id] === m.id)
  const only = work.length === 1 && work[0]?.status !== 'dropped' ? work[0] : undefined
  const isAskedDirectly = items.some(i => o.askSubjects[i.id]?.includes(m.id))

  return only !== undefined && !isAskedDirectly && isNamedAlike(m.name, only.name) ? only : null
}

/**
 * Whether the head's title repeats a subject, while no goal is set, so its part draws no title: with at most one open
 * subject, the title is named alike with that subject or with a closed one `rows` draws. Beside a second open subject
 * the title stays.
 */
export function isTitleRepeated(title: string, subjects: readonly Subject[], rows: readonly StatusRow[]): boolean {
  const drawnIds = new Set(rows.flatMap(r => (r.kind === 'subject' ? [r.id] : [])))
  const work = subjects.filter(x => x.into === null)
  if (work.filter(isOpen).length > 1) return false

  return work.some(x => (isOpen(x) || drawnIds.has(x.id)) && isNamedAlike(title, x.name))
}

/**
 * A milestone drawn as the subject in its place, from the rows `partRows` gives that subject at depth 0: the
 * subject's row takes the milestone's place on the path, and its children sit one step in, joined to the milestone's
 * column as loose work is.
 */
export function milestoneAsSubject(m: MilestoneRow, subjectRows: StatusRow[]): MilestoneRow {
  const [row, ...under] = subjectRows
  if (row?.kind !== 'subject') return m
  const work = under.map(r => (r.kind === 'child' || r.kind === 'more' ? { ...r, branch: null } : r))

  return {
    ...m,
    id: row.id,
    mark: row.mark,
    tone: row.tone,
    name: row.name,
    foldId: null,
    foldCount: work.length === 0 ? 0 : row.foldCount,
    text: row.text,
    was: row.was,
    ask: row.ask,
    rows: work,
    subject: row,
  }
}
