import { ROW_STATE_MS, isMoving, stepRow } from '../../hooks/row-motion'
import type { RowState, RowTarget, RowTrack } from '../../hooks/row-motion'
import type { Block } from './blocks'

type Tracked = { track: RowTrack; block: Block }

/** Each moving block's track and the block as last drawn, and the ids of every block the last draw showed, in order. */
export type Tracks = { rows: ReadonlyMap<string, Tracked>; order: readonly string[] }
export const NO_TRACKS: Tracks = { rows: new Map(), order: [] }

/**
 * How a block moves in this draw. `isStart` marks the draw a move began. A block that enters or leaves draws in a box
 * whose height and opacity glide: `box` is `open` at the block's full height and opacity, `shut` at none, and null
 * while it neither enters nor leaves.
 */
export type RowMotion = { state: RowState; isStart: boolean; box: 'open' | 'shut' | null }

const targetOf = (b: Block): RowTarget =>
  b.kind !== 'row' ? 'closed' : b.settled ? 'settled' : b.isSelected ? 'open' : 'closed'

const isBoxed = (state: RowState | undefined): boolean => state === 'entering' || state === 'leaving'

/**
 * The box a block draws in. gpui-kit's transition animates only a later change of its target, so a move's first draw
 * sets the height and opacity it moves from, and the next draw sets the ones it moves to. A block that turns back
 * mid-move was already in its box, so it moves to its new end at once, from where it is.
 */
function boxOf(state: RowState, isStart: boolean, was: RowState | undefined): RowMotion['box'] {
  if (!isBoxed(state)) return null
  const isFrom = isStart && !isBoxed(was)
  if (state === 'entering') return isFrom ? 'shut' : 'open'

  return isFrom ? 'open' : 'shut'
}

/** The blocks that move as they come and go: every row, and every block an open fold shows, one step in after it. */
function movingIds(blocks: Block[]): Set<string> {
  const ids = new Set<string>()
  let foldDepth: number | null = null
  for (const b of blocks) {
    const depth = 'depth' in b ? b.depth : 0
    if (foldDepth !== null && depth <= foldDepth) foldDepth = null
    if (foldDepth !== null || b.kind === 'row') ids.add(b.id)
    if (b.kind === 'fold' && b.isOpen && foldDepth === null) foldDepth = depth
  }

  return ids
}

/**
 * Steps every moving block through the shared row states. A block the publish dropped stays drawn while it leaves,
 * after the nearest block that was above it and is still drawn. A block that takes a moving block's id is that block
 * in another form, so it does not leave and the new one does not enter. `isFirst` forgets the tracks and draws every
 * block at rest, as a newly shown tab does. `nextAt` is when a move ends, so the look draws again then.
 */
export function moveRows(
  blocks: Block[],
  last: Tracks,
  now: number,
  isFirst: boolean,
): { blocks: Block[]; tracks: Tracks; motion: ReadonlyMap<string, RowMotion>; nextAt: number | null } {
  const was = isFirst ? NO_TRACKS : last
  const wasDrawn = new Set(was.order)
  const rows = new Map<string, Tracked>()
  const motion = new Map<string, RowMotion>()
  const add = (block: Block, track: RowTrack) => {
    rows.set(block.id, { track, block })
    const isStart = track.since === now && isMoving(track.state)
    motion.set(block.id, {
      state: track.state,
      isStart,
      box: boxOf(track.state, isStart, was.rows.get(block.id)?.track.state),
    })
  }
  const moving = movingIds(blocks)
  for (const b of blocks) {
    if (!moving.has(b.id)) continue
    const track = stepRow(was.rows.get(b.id)?.track, targetOf(b), now, !isFirst && !wasDrawn.has(b.id))
    if (track) add(b, track)
  }
  const shown = [...blocks]
  const isDrawn = new Set(blocks.map(b => b.id))
  was.order.forEach((id, i) => {
    const old = was.rows.get(id)
    if (!old || isDrawn.has(id) || rows.has(id)) return
    const track = stepRow(old.track, 'gone', now)
    if (!track) return
    add(old.block, track)
    shown.splice(placeAfter(shown, was.order.slice(0, i)), 0, old.block)
  })
  const ends = [...rows.values()].flatMap(t =>
    isMoving(t.track.state) ? [t.track.since + ROW_STATE_MS[t.track.state]] : [],
  )

  return {
    blocks: shown,
    tracks: { rows, order: shown.map(b => b.id) },
    motion,
    nextAt: ends.length ? Math.min(...ends) : null,
  }
}

/** Where a leaving block goes: just after the last of the blocks that were above it that is still shown, else first. */
function placeAfter(shown: Block[], above: readonly string[]): number {
  for (let i = above.length - 1; i >= 0; i--) {
    const at = shown.findIndex(b => b.id === above[i])
    if (at >= 0) return at + 1
  }
  return 0
}
