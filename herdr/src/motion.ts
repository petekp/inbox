import { ROW_STATE_MS, isMoving, stepRow } from '../../hooks/row-motion'
import type { RowState, RowTarget, RowTrack } from '../../hooks/row-motion'
import type { Block, RowBlock } from './blocks'

type Tracked = { track: RowTrack; row: RowBlock }

/** Each drawn row's track and the row as last drawn, and the ids of every block the last draw showed, in order. */
export type Tracks = { rows: ReadonlyMap<string, Tracked>; order: readonly string[] }
export const NO_TRACKS: Tracks = { rows: new Map(), order: [] }

/** How a row moves in this draw. `isStart` marks the draw a move began, which draws the move's first frame. */
export type RowMotion = { state: RowState; isStart: boolean }

const targetOf = (r: RowBlock): RowTarget => (r.settled ? 'settled' : r.isSelected ? 'open' : 'closed')

/**
 * Steps every row through the shared row states. A row the publish dropped stays drawn while it leaves, after the
 * nearest block that was above it and is still drawn. A block that takes a row's id is that row in another form, so the
 * row does not leave and the block does not enter. `isFirst` forgets the tracks and draws every row at rest, as a newly
 * shown tab does. `nextAt` is when a move ends, so the look draws again then.
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
  const add = (row: RowBlock, track: RowTrack) => {
    rows.set(row.id, { track, row })
    motion.set(row.id, { state: track.state, isStart: track.since === now && isMoving(track.state) })
  }
  for (const b of blocks) {
    if (b.kind !== 'row') continue
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
    add(old.row, track)
    shown.splice(placeAfter(shown, was.order.slice(0, i)), 0, old.row)
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

/** Where a leaving row goes: just after the last of the blocks that were above it that is still shown, else first. */
function placeAfter(shown: Block[], above: readonly string[]): number {
  for (let i = above.length - 1; i >= 0; i--) {
    const at = shown.findIndex(b => b.id === above[i])
    if (at >= 0) return at + 1
  }
  return 0
}
