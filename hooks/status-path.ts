import type { Milestone } from '../types'
import { stems } from './status-limits'
import { unfoldedRows } from './status-page-parts'
import type { StatusRow } from './status-page'

/**
 * Where a milestone sits on the goal's path: finished, under way, the one the work takes up next, queued after that
 * with no order claimed, or dropped since the person last looked.
 */
export type PathPlace = 'done' | 'now' | 'next' | 'later' | 'dropped'

/**
 * The path's line below a milestone: `continues` down to the next milestone on the path, `to-next` down to the next
 * milestone, dashed in the space just above it, where the path ends. Null where the path ends or does not reach.
 */
export type PathLine = 'continues' | 'to-next' | null

/** A milestone's place on the path and what its row draws for it. */
export type PathStep = {
  milestone: Milestone
  place: PathPlace
  /** "now", "now · 3h" or "next", drawn muted at the right of the name's first line. */
  word: string | null
  line: PathLine
  /** Whether the "Later" label and rule draw above it. */
  startsLater: boolean
}

export const NOW_WORD = 'now'
export const NEXT_WORD = 'next'
export const LATER_TEXT = 'Later'
/** How long a milestone runs before its row says for how long: a step under an hour is the normal pace of the work. */
export const UNDER_WAY_TIME_AFTER_MS = 60 * 60_000
const HOUR_MS = 60 * 60_000
const DAY_HOURS = 24
/** Hours past this read as days, as `idle 2d` does. */
const HOURS_SHOWN = 48

/** How long a milestone has been under way, in whole hours, then whole days past two. */
function underWayTime(ms: number): string {
  const hours = Math.floor(ms / HOUR_MS)

  return hours < HOURS_SHOWN ? `${hours}h` : `${Math.floor(hours / DAY_HOURS)}d`
}

function nowWord(m: Milestone, now: number): string {
  const ran = m.startedAt === null ? 0 : now - m.startedAt

  return ran >= UNDER_WAY_TIME_AFTER_MS ? `${NOW_WORD} · ${underWayTime(ran)}` : NOW_WORD
}

/**
 * The milestones the goal shows, in path order. Done ones come in the order they closed. Then the ones under way, in
 * the plan's order: working ones read "now", and one that waits on someone else reads no word, since its mark says so.
 * The first queued one in the plan's order reads "next", and the rest sit under Later, then the dropped ones.
 */
export function milestonePath(shown: readonly Milestone[], now: number): PathStep[] {
  const done = shown
    .filter(m => m.status === 'done')
    .sort((x, y) => (x.closedAt ?? x.changedAt) - (y.closedAt ?? y.changedAt))
  const underWay = shown.filter(m => m.status === 'working' || m.status === 'waits-on-other')
  const [next, ...later] = shown.filter(m => m.status === 'queued')
  const dropped = shown.filter(m => m.status === 'dropped')
  const onPath = [...done, ...underWay, ...(next ? [next] : [])]
  const lineBelow = (n: number): PathLine =>
    n >= onPath.length - 1 ? null : onPath[n + 1] === next ? 'to-next' : 'continues'
  const pathSteps = onPath.map((m, n): PathStep => ({
    milestone: m,
    place: m === next ? 'next' : m.status === 'done' ? 'done' : 'now',
    word: m === next ? NEXT_WORD : m.status === 'working' ? nowWord(m, now) : null,
    line: lineBelow(n),
    startsLater: false,
  }))
  const afterPath = [...later, ...dropped].map((m, n): PathStep => ({
    milestone: m,
    place: m.status === 'dropped' ? 'dropped' : 'later',
    word: null,
    line: null,
    startsLater: n === 0,
  }))

  return [...pathSteps, ...afterPath]
}

/**
 * Whether the head's Now line only names a milestone that reads "now": every content word of it is in that milestone's
 * name or where it stands, so the row already says it.
 */
export function namesOnlyMilestoneUnderWay(nowText: string, milestones: readonly Milestone[]): boolean {
  const said = stems(nowText)

  return (
    said.size > 0 &&
    milestones
      .filter(m => m.status === 'working')
      .some(m => {
        const row = stems(`${m.name} ${m.text}`)
        return [...said].every(w => row.has(w))
      })
  )
}

/**
 * The rows a look draws under a milestone: none while it is a done milestone folded to its name, else its rows with
 * each unfolded done fold opened.
 */
export function milestoneRows(
  m: { foldId: string | null; rows: StatusRow[] },
  isUnfolded: (id: string) => boolean,
): StatusRow[] {
  return m.foldId !== null && !isUnfolded(m.foldId) ? [] : unfoldedRows(m.rows, isUnfolded)
}
