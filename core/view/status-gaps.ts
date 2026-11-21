import { CHILD_GAP_PT, HEAD_GAP_PT, ITEM_GAP_PT, LIST_GAP_PT, SECTION_GAP_PT } from './layout'
import { milestoneKeyPlan, statusKeyPlan } from './status-keys'
import type { MilestoneRow } from './status-goal-page'
import type { StatusRow } from './status-page'

/** A Status row that shows its name line alone, with no line or button under it. */
function isOneLineStatusRow(r: StatusRow): boolean {
  if (r.kind !== 'subject') return true

  return !r.waitsOn && !r.text && !r.merged && !r.was && statusKeyPlan(r).length === 0
}

/** A milestone that shows its name line alone, or a done milestone folded to its name. */
export const isOneLineMilestone = (m: MilestoneRow): boolean =>
  m.foldId !== null ||
  (!m.text && !m.was && !m.subject?.merged && !m.subject?.waitsOn && milestoneKeyPlan(m).length === 0)

/**
 * The gap above each row of a Status list, in points, from the last line of the row above to this row's first line.
 * Null above the first row and on either side of a part, whose space each look draws.
 *
 * Two one-line rows sit `list` apart. A row under a parent sits `child` from the row above when either shows more than
 * its name. A top-level row sits `item` from the item above, a top-level row with the rows under it, when either takes
 * more than one line, so a parent's rows sit closer to each other than to the next item.
 */
export function statusGaps(rows: StatusRow[]): (number | null)[] {
  return rows.map((r, n) => {
    const prev = rows[n - 1]
    if (prev === undefined || prev.kind === 'part' || r.kind === 'part') return null
    const isPairOneLine = isOneLineStatusRow(prev) && isOneLineStatusRow(r)
    if (r.depth > 0) return isPairOneLine ? LIST_GAP_PT : CHILD_GAP_PT
    const itemStart = rows.findLastIndex((p, k) => k < n && p.depth === 0)

    return isPairOneLine && itemStart === n - 1 ? LIST_GAP_PT : ITEM_GAP_PT
  })
}

/** A row's own gap, used where it has no neighbor in its list: `list` for a one-line row, else `item`. */
const ownGap = (isOneLine: boolean): number => (isOneLine ? LIST_GAP_PT : ITEM_GAP_PT)

/**
 * The padding above and below each row, half the gap on each side, or half its own gap where it has no neighbor. With
 * `firstAbove`, the first row pads that much above it instead.
 */
export function statusRowPads(rows: StatusRow[], firstAbove?: number): { above: number; below: number }[] {
  const gaps = statusGaps(rows)

  return rows.map((r, n) => {
    const own = ownGap(isOneLineStatusRow(r))
    const above = n === 0 && firstAbove !== undefined ? firstAbove : (gaps[n] ?? own) / 2

    return { above, below: (gaps[n + 1] ?? own) / 2 }
  })
}

/** A milestone row's padding above and below: half of its own gap. */
export const milestonePadPt = (m: MilestoneRow): number => ownGap(isOneLineMilestone(m)) / 2

/** The padding of the work rows under a milestone. The first sits `head` under the milestone, as under a heading. */
export const milestoneRowPads = (m: MilestoneRow, rows: StatusRow[]) =>
  statusRowPads(rows, HEAD_GAP_PT - milestonePadPt(m))

/**
 * The space above a milestone that stands apart from the milestone above, past the padding of the row above it,
 * `padAbove`, and its own: `item` in all.
 */
export const milestoneSpacePt = (padAbove: number, m: MilestoneRow): number =>
  Math.max(0, ITEM_GAP_PT - padAbove - milestonePadPt(m))

/** The Later label's padding above and below, as a one-line row's. */
const LATER_PAD_PT = LIST_GAP_PT / 2

/** The space above the Later label, past the padding of the row above and its own: half of `section`, as around a rule. */
export const laterSpacePt = (padAbove: number): number => Math.max(0, SECTION_GAP_PT / 2 - padAbove - LATER_PAD_PT)

/** The space under the Later label, past its own padding and the milestone's under it: `head`, as under a heading. */
export const underLaterPt = (m: MilestoneRow): number => Math.max(0, HEAD_GAP_PT - LATER_PAD_PT - milestonePadPt(m))

/** The padding under a milestone's group: under its last work row, or under the milestone itself. */
export const milestoneGroupPadBelow = (m: MilestoneRow, rows: StatusRow[]): number =>
  milestoneRowPads(m, rows).at(-1)?.below ?? milestonePadPt(m)
