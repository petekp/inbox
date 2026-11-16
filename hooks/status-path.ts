import type { Milestone } from '../types'
import { stems } from './status-limits'
import { milestoneRows } from './status-folds'
import type { IsCollapsed } from './status-folds'
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

const NOW_WORD = 'now'
const NEXT_WORD = 'next'
export const LATER_TEXT = 'Later'
/** How long a milestone runs before its row says for how long: a step under an hour is the normal pace of the work. */
const UNDER_WAY_TIME_AFTER_MS = 60 * 60_000
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
 * The first queued one in the plan's order reads "next", and the rest sit under Later. The dropped ones follow them, with
 * no Later label of their own when Later is empty.
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
    startsLater: n === 0 && later.length > 0,
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
 * Where a line of a milestone's work meets the column under the milestone's mark. `arm` is the branch from the column
 * to the row's mark on its first line: a `tee` while the column goes on below the row, an `elbow` where it ends there.
 * `beside` is what runs in the column past the arm: the nesting connector, which ties the work to its milestone, the
 * path's line where the path goes on through the work to the next milestone, or nothing.
 */
export type WorkJoint = { arm: 'tee' | 'elbow' | null; beside: 'connector' | PathLine }

/**
 * Each work row's joint with its milestone's column, in the order `milestoneRows` gives them. Rows one step in from
 * the milestone take an arm, and rows nested deeper pass beside the column. Where the path's line goes on through the
 * work, it is the column, so every arm is a tee. Otherwise the connector ends at the last arm, an elbow.
 */
export function workJoints(rows: readonly StatusRow[], line: PathLine): WorkJoint[] {
  const top = Math.min(...rows.map(r => r.depth))
  const last = rows.findLastIndex(r => r.depth === top)

  return rows.map((r, n) => {
    const arm = r.depth !== top ? null : line === null && n === last ? 'elbow' : 'tee'
    if (line !== null) return { arm, beside: line }

    return { arm, beside: n < last ? 'connector' : null }
  })
}

type SpacedMilestone = {
  id: string
  foldId: string | null
  foldCount: number
  rows: StatusRow[]
  text: string | null
  was: string | null
  ask: unknown
}

/**
 * Whether a look leaves a step's space above the milestone at `n`: under a milestone that draws more than its name, so a
 * milestone's work sits closer to its own name than to the next milestone. Under a milestone that draws only its name,
 * such as a done one folded to its name, the next sits on the adjacent line. The Later label always has space above it.
 */
export function isSpacedAbove(
  milestones: readonly (SpacedMilestone & { startsLater: boolean })[],
  n: number,
  isUnfolded: (id: string) => boolean,
  isCollapsed: IsCollapsed = () => false,
): boolean {
  const drawsNameOnly = (m: SpacedMilestone) =>
    m.text === null && m.was === null && m.ask === null && milestoneRows(m, isUnfolded, isCollapsed).length === 0
  const above = milestones[n - 1]
  const m = milestones[n]

  return above === undefined || m === undefined || m.startsLater || !drawsNameOnly(above)
}
