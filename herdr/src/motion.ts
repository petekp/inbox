import { ROW_STATE_MS, isMoving, stepRow } from '../../hooks/row-motion'
import type { RowState, RowTarget, RowTrack } from '../../hooks/row-motion'
import type { Block, RowBlock } from './blocks'

/** A drawn row's track, the row as last drawn, and the block it followed, so a leaving row keeps its place. */
type Tracked = { track: RowTrack; row: RowBlock; after: string | null }
export type Tracks = ReadonlyMap<string, Tracked>

/** How a row moves in this draw. `isStart` marks the draw a move began, which draws the move's first frame. */
export type RowMotion = { state: RowState; isStart: boolean }

const targetOf = (r: RowBlock): RowTarget => (r.settled ? 'settled' : r.isSelected ? 'open' : 'closed')

/**
 * Steps every row through the shared row states. A row the publish dropped stays drawn while it leaves. `isFirst`
 * draws every row at rest, as a newly shown tab does. `nextAt` is when a move ends, so the look draws again then.
 */
export function moveRows(
  blocks: Block[],
  tracks: Tracks,
  now: number,
  isFirst: boolean,
): { blocks: Block[]; tracks: Tracks; motion: ReadonlyMap<string, RowMotion>; nextAt: number | null } {
  const next = new Map<string, Tracked>()
  const motion = new Map<string, RowMotion>()
  const add = (row: RowBlock, track: RowTrack, after: string | null) => {
    next.set(row.id, { track, row, after })
    motion.set(row.id, { state: track.state, isStart: track.since === now && isMoving(track.state) })
  }
  let after: string | null = null
  for (const b of blocks) {
    if (b.kind === 'row') {
      const track = stepRow(tracks.get(b.id)?.track, targetOf(b), now, !isFirst && !tracks.has(b.id))
      if (track) add(b, track, after)
    }
    after = b.id
  }
  const shown = [...blocks]
  for (const [id, was] of tracks) {
    if (next.has(id)) continue
    const track = stepRow(was.track, 'gone', now)
    if (!track) continue
    add(was.row, track, was.after)
    const at = was.after === null ? 0 : shown.findIndex(b => b.id === was.after) + 1
    shown.splice(at > 0 || was.after === null ? at : shown.length, 0, was.row)
  }
  const ends = [...next.values()].flatMap(t =>
    isMoving(t.track.state) ? [t.track.since + ROW_STATE_MS[t.track.state]] : [],
  )

  return { blocks: shown, tracks: next, motion, nextAt: ends.length ? Math.min(...ends) : null }
}
