import type { PaneBase } from './pane-context'
import { ITEM_GAP_PT } from '../../core/view/layout'
import { DESKTOP_LINE_PT } from './pane-sizes'
import { exactly } from './pane-status-tops'
import type { Drawn } from './pane-status-tops'
import type { MilestoneRow } from '../../core/view/status-goal-page'
import { milestoneRows } from '../../core/view/status-folds'
import type { IsCollapsed } from '../../core/view/status-folds'
import { laterSpacePt, milestoneGroupPadBelow, milestoneSpacePt, underLaterPt } from '../../core/view/status-gaps'
import { isSpacedAbove, LATER_TEXT } from '../../core/view/status-path'

/** The space between the goal's milestones in the terminal and desktop looks, and the Later label above the ones that wait. */
export function paneMilestoneSpace({
  look,
  Box,
  statusPartLine,
  isUnfolded,
  isCollapsed,
}: Pick<PaneBase, 'look' | 'Box'> & {
  statusPartLine: (id: string, text: string, isFirst: boolean) => Drawn
  isUnfolded: (id: string) => boolean
  isCollapsed: IsCollapsed
}) {
  /**
   * A blank line in the terminal. On desktop, the space Codex leaves there: half of `ITEM_GAP_PT` under the goal's text,
   * and above milestone `n` the rest of `ITEM_GAP_PT` past the padding of the row above and its own, so a milestone's
   * work sits closer to its own name than to the next.
   */
  const gap = (milestones: MilestoneRow[], n: number): Drawn => {
    const m = milestones[n]
    const above = milestones[n - 1]
    const pt = m === undefined || above === undefined ? ITEM_GAP_PT / 2 : milestoneSpacePt(padUnder(above), m)

    return space(`goal-${m?.id}-gap`, look === 'terminal' ? 1 : pt / DESKTOP_LINE_PT)
  }
  /** An empty line `lines` tall. */
  const space = (key: string, lines: number): Drawn => ({ el: <Box key={key} height={lines} />, lines: exactly(lines) })
  /** The padding under a milestone's group on desktop, in points. */
  const padUnder = (m: MilestoneRow) => milestoneGroupPadBelow(m, milestoneRows(m, isUnfolded, isCollapsed))
  /**
   * The Later label above milestone `n`. On desktop it sits half of `SECTION_GAP_PT` under the row above, as around a
   * rule, and `HEAD_GAP_PT` over the milestone, as a heading does. The terminal keeps a blank line above it.
   */
  const laterLines = (milestones: MilestoneRow[], n: number, hasLineAbove: boolean): Drawn[] => {
    const m = milestones[n]
    const above = milestones[n - 1]
    const label = statusPartLine('goal-later', LATER_TEXT, true)
    if (look === 'terminal' || m === undefined) return [...(hasLineAbove ? [] : spaceAboveOf(milestones, n)), label]
    const before = above ? [space('goal-later-above', laterSpacePt(padUnder(above)) / DESKTOP_LINE_PT)] : []

    return [...before, label, space('goal-later-under', underLaterPt(m) / DESKTOP_LINE_PT)]
  }
  /** The space above milestone `n` when it stands apart from the milestone above. */
  const spaceAboveOf = (milestones: MilestoneRow[], n: number) =>
    isSpacedAbove(milestones, n, isUnfolded, isCollapsed) ? [gap(milestones, n)] : []

  return { spaceAboveOf, laterLines }
}
