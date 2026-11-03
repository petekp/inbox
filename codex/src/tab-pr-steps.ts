import { prMarkId } from '../../hooks/pr-rows'
import type { TabView as View } from './core'
import { stepRow } from './rows'
import type { RowTarget } from './rows'
import { tabState, drawnRows } from './tab-state'
import type { Row } from './tab-state'
import { reducedMotion } from './tab-motion'
import { selectedIndex } from './tab-selection'
import { prPlan } from './tab-rows'
import type { PrBlockPlan } from './tab-rows'
import { prLastLine } from './tab-pr-lines'
import type { PressLine } from './tab-pr-lines'

export const PR_GROUPS = ['threads', 'checks', 'cancelled'] as const
export type PrGroup = (typeof PR_GROUPS)[number]

/**
 * A PR block as the tab draws it. `drawn` holds each group's rows, with the rows still leaving in the places they
 * had, or null once the group and its title are gone. `line` is the press line under the block's buttons, which
 * shows its last text while it leaves.
 */
export type DrawnPrBlock = PrBlockPlan & { drawn: Record<PrGroup, Row[] | null>; line: PressLine | null }

/** The PRs tab as the tab draws it: its blocks, the rows the view lists, and the open row. */
export type DrawnPrs = { blocks: DrawnPrBlock[]; rows: Row[]; openId: string | undefined }

export const prGroupMotion = (blockId: string, group: PrGroup) => `group-${blockId}-${group}`
export const prLineMotion = (blockId: string) => `line-${blockId}`

/**
 * Steps every PR row, group and press line the PRs tab draws through the row states, as `stepLists` does for the
 * rows of the other tabs. A row the view no longer lists leaves from its place, and its group, title and all, leaves
 * with its last row. A block's press line grows in when it shows on a block the last draw drew.
 */
export function stepPrs(v: View, now: number, changed: Set<string>, kept: Set<string>): DrawnPrs {
  const { blocks, rows } = prPlan(v)
  const openId = rows[selectedIndex(rows, 'prs', v)]?.id
  const listed = new Set(rows.map(r => r.id))
  const step = (id: string, target: RowTarget, isNew = false): boolean => {
    const before = drawnRows.get(id)
    const track = stepRow(before?.track, target, now, isNew, reducedMotion.matches)
    if (!track) return false
    if (track !== before?.track) changed.add(id)
    drawnRows.set(id, { track })
    kept.add(id)
    return true
  }
  const drawnBlocks = blocks.map((b): DrawnPrBlock => {
    const id = prMarkId(b.pr.ref)
    const drawn: Record<PrGroup, Row[] | null> = { threads: null, checks: null, cancelled: null }
    if (b.state.is === 'settled') return { ...b, drawn, line: null }
    const last = tabState.lastPrs?.blocks.find(x => prMarkId(x.pr.ref) === id)
    for (const group of PR_GROUPS) {
      const entries = [...b[group]]
      for (const [n, row] of (last?.drawn[group] ?? []).entries())
        if (!listed.has(row.id) && drawnRows.has(row.id)) entries.splice(Math.min(n, entries.length), 0, row)
      const shown = entries.filter(r => step(r.id, !listed.has(r.id) ? 'gone' : r.id === openId ? 'open' : 'closed'))
      drawn[group] = step(prGroupMotion(id, group), b[group].length > 0 ? 'closed' : 'gone') ? shown : null
    }
    const line = prLastLine(v, b.pr)
    const isLineShown = step(prLineMotion(id), line ? 'closed' : 'gone', last !== undefined)

    return { ...b, drawn, line: isLineShown ? (line ?? last?.line ?? null) : null }
  })

  return { blocks: drawnBlocks, rows, openId }
}
