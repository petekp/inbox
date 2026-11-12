import { prMarkId } from '../../hooks/pr-rows'
import type { PrAction } from '../../hooks/pr-press'
import type { TabView as View } from './core'
import { stepRow } from '../../hooks/row-motion'
import type { RowTarget, RowTrack } from '../../hooks/row-motion'
import { tabState, drawnRows, undoing } from './tab-state'
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
 * shows its last text while it leaves. `wasOpen` is the block as the last draw drew it open, which a settling or
 * leaving block still draws, inert, while its height shrinks over it.
 */
export type DrawnPrBlock = PrBlockPlan & {
  drawn: Record<PrGroup, Row[] | null>
  line: PressLine | null
  wasOpen: OpenPrBlock | null
}

/**
 * An open block's drawing, with the track each of its rows had, so it can be drawn again once its rows are not
 * stepped. A row still moving keeps that move's form, and its element finishes the move.
 */
export type OpenPrBlock = { block: DrawnPrBlock; tracks: Map<string, RowTrack> }

/**
 * The PRs tab as the tab draws it: its blocks, the rows the view lists, the open row, and Clear merged and closed,
 * which keeps its last actions while it leaves.
 */
export type DrawnPrs = {
  blocks: DrawnPrBlock[]
  rows: Row[]
  openId: string | undefined
  clear: PrAction[] | null
}

export const prBlockMotion = (blockId: string) => `block-${blockId}`
export const prGroupMotion = (blockId: string, group: PrGroup) => `group-${blockId}-${group}`
export const prLineMotion = (blockId: string) => `line-${blockId}`
export const PR_CLEAR_MOTION = 'pr-clear'

/**
 * Steps every PR block, row, group and press line the PRs tab draws through the row states, as `stepLists` does for
 * the rows of the other tabs. A block moves as a row does: open while the view lists it open, settling to its settled
 * line when it is dismissed, opening again on Undo, and leaving from its place once the view no longer lists it. A
 * row the view no longer lists leaves from its place, and its group, title and all, leaves with its last row. A
 * block's press line and the tab's own buttons grow in when they show after the last draw drew the tab.
 */
export function stepPrs(v: View, now: number, changed: Set<string>, kept: Set<string>): DrawnPrs {
  const { blocks, rows } = prPlan(v)
  const openId = rows[selectedIndex(rows, 'prs', v)]?.id
  const listed = new Set(rows.map(r => r.id))
  const last = tabState.lastPrs
  const step = (id: string, target: RowTarget, isNew = false): RowTrack | null => {
    const before = drawnRows.get(id)
    const track = stepRow(before?.track, target, now, isNew, reducedMotion.matches)
    if (!track) return null
    if (track !== before?.track) changed.add(id)
    drawnRows.set(id, { track })
    kept.add(id)
    return track
  }
  const stepOpen = (b: PrBlockPlan, id: string): DrawnPrBlock => {
    const lastBlock = last?.blocks.find(x => prMarkId(x.pr.ref) === id)
    const drawn: Record<PrGroup, Row[] | null> = { threads: null, checks: null, cancelled: null }
    for (const group of PR_GROUPS) {
      const entries = [...b[group]]
      for (const [n, row] of (lastBlock?.drawn[group] ?? []).entries())
        if (!listed.has(row.id) && drawnRows.has(row.id)) entries.splice(Math.min(n, entries.length), 0, row)
      const shown = entries.filter(r => step(r.id, !listed.has(r.id) ? 'gone' : r.id === openId ? 'open' : 'closed'))
      drawn[group] = step(prGroupMotion(id, group), b[group].length > 0 ? 'closed' : 'gone') ? shown : null
    }
    const line = prLastLine(v, b.pr)
    const isLineShown = step(prLineMotion(id), line ? 'closed' : 'gone', lastBlock !== undefined) !== null

    return { ...b, drawn, line: isLineShown ? (line ?? lastBlock?.line ?? null) : null, wasOpen: null }
  }
  const listedBlocks = new Set(blocks.map(b => prMarkId(b.pr.ref)))
  const entries: PrBlockPlan[] = [...blocks]
  for (const [n, b] of (last?.blocks ?? []).entries()) {
    const id = prMarkId(b.pr.ref)
    if (!listedBlocks.has(id) && drawnRows.has(prBlockMotion(id))) entries.splice(Math.min(n, entries.length), 0, b)
  }
  const drawnBlocks = entries.flatMap((b): DrawnPrBlock[] => {
    const id = prMarkId(b.pr.ref)
    const motion = prBlockMotion(id)
    const wasOpen = drawnRows.get(motion)?.openBlock
    const target: RowTarget = !listedBlocks.has(id)
      ? 'gone'
      : b.state.is === 'open'
        ? 'open'
        : undoing.has(id)
          ? 'undoing'
          : 'settled'
    const track = step(motion, target)
    if (!track) return []
    if (target === 'open') {
      const block = stepOpen(b, id)
      const tracks = new Map(PR_GROUPS.flatMap(g => block.drawn[g] ?? []).map(r => [r.id, drawnRows.get(r.id)!.track]))
      drawnRows.set(motion, { track, openBlock: { block, tracks } })
      return [block]
    }
    if (track.hasPanel && wasOpen) drawnRows.set(motion, { track, openBlock: wasOpen })
    const empty = { threads: null, checks: null, cancelled: null }

    return [{ ...b, drawn: empty, line: null, wasOpen: track.hasPanel ? (wasOpen ?? null) : null }]
  })
  const clear = v.prs.clear.length > 0 ? v.prs.clear : (last?.clear ?? [])
  const isClearShown = step(PR_CLEAR_MOTION, v.prs.clear.length > 0 ? 'closed' : 'gone', last !== null)

  return { blocks: drawnBlocks, rows, openId, clear: isClearShown ? clear : null }
}
