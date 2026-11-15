import { ROW_FADE_MS, ROW_STATE_MS, isMoving, stepRow } from '../../hooks/row-motion'
import type { RowState, RowTarget, RowTrack } from '../../hooks/row-motion'
import type { Block, RowBlock } from './blocks'
import { HEIGHT_SETTLE_MS } from '../../hooks/springs'

/**
 * A block's track, the block as last drawn, the open form a row last drew while it keeps its panel, and the box glide
 * its last enter or leave set, which runs on until `endsAt` even if the block's state moves on.
 */
type Tracked = { track: RowTrack; block: Block; opened: RowBlock | null; glide: Glide | null }

/** Each block's track and the block as last drawn, and the ids of every block the last draw showed, in order. */
export type Tracks = { rows: ReadonlyMap<string, Tracked>; order: readonly string[] }
export const NO_TRACKS: Tracks = { rows: new Map(), order: [] }

/**
 * Where a block's box glides to as it enters or leaves, the length of its fade, and when both its fade and its height
 * spring have come to rest.
 */
type Glide = { box: 'open' | 'shut'; fadeMs: number; endsAt: number }

/**
 * How a block moves in this draw. `isStart` marks the draw a move began. A block that enters or leaves draws in a box
 * whose height springs and whose opacity fades over `fadeMs`: `box` is `open` at the block's measured height and full
 * opacity, `shut` at none, and null at rest. `panel` is the opacity of a row's panel, its body and buttons, as it opens or closes, and
 * `closing` the open form whose panel a closing row keeps drawn. `isPanelLeftOut` says the row's content box moves to
 * its measured height less its panel's: through a close after its first draw, through all of a close that turns an
 * open back, and in the draw after a close, before the row measures without the panel. A close's first draw keeps the
 * panel's height, so the row the selection moves to measures its new height in that draw and both start together.
 */
export type RowMotion = {
  state: RowState
  isStart: boolean
  box: Glide['box'] | null
  fadeMs: number
  panel: 0 | 1 | null
  closing: RowBlock | null
  isPanelLeftOut: boolean
}

/** The draw after a move's first frame, which starts its transition or spring. */
export const NEXT_FRAME_MS = 16

const targetOf = (b: Block): RowTarget =>
  b.kind !== 'row' ? 'closed' : b.settled ? 'settled' : b.isSelected ? 'open' : 'closed'

const isFolding = (state: RowState | undefined): boolean => state === 'opening' || state === 'closing'

/** When a glide that starts or changes its target `now` has come to rest, its height a frame behind its fade. */
const restAt = (now: number, fadeMs: number): number => now + Math.max(fadeMs, HEIGHT_SETTLE_MS) + NEXT_FRAME_MS

/**
 * The glide of a block's box as it enters or leaves. gpui-kit animates only a later change of a target, so a move's
 * first draw sets the height and opacity it moves from, and the next draw sets the ones it moves to. A block that
 * turns back mid-glide was already in its box, so it moves to its new end at once, from where it is, and keeps the fade
 * length its box already declares. A block that leaves stays drawn until its glide comes to rest. A row selected as it
 * enters keeps its box: the box springs on to the row's new height, which arrives in the draw after the open starts,
 * and lets go once that comes to rest.
 */
function glideOf(track: RowTrack, isStart: boolean, last: Glide | null, now: number): Glide | null {
  const { state } = track
  const isLive = last !== null && now < last.endsAt
  if (state === 'entering' || state === 'leaving') {
    const to = state === 'entering' ? 'open' : 'shut'
    if (!isStart && last !== null) return { ...last, box: to }
    if (isLive) return { box: to, fadeMs: last.fadeMs, endsAt: restAt(now, last.fadeMs) }
    const fadeMs = ROW_FADE_MS[state]

    return { box: to === 'open' ? 'shut' : 'open', fadeMs, endsAt: restAt(now, fadeMs) }
  }
  if (!isLive || last.box !== 'open') return null

  return isStart ? { ...last, endsAt: restAt(now, last.fadeMs) } : last
}

/** A row's panel fades in as it opens and out as it closes, from where it is when the move turns back. */
function panelOf(state: RowState, isStart: boolean, was: RowState | undefined, closing: RowBlock | null) {
  const isFrom = isStart && !isFolding(was)
  if (state === 'opening') return isFrom ? 0 : 1
  if (state === 'closing' && closing) return isFrom ? 1 : 0

  return null
}

/**
 * Steps every block through the shared row states. A block the publish dropped stays drawn while it leaves, after the
 * nearest block that was above it and is still drawn. A block that takes a leaving block's id is that block in another
 * form, so it does not leave and the new one does not enter. `isFirst` forgets the tracks and draws every block at
 * rest, as a newly shown tab does. `nextAt` is when a move ends or a box's glide comes to rest, so the look draws again then.
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
    const last = was.rows.get(block.id)
    const isOpen = block.kind === 'row' && block.isSelected
    const opened = isOpen ? block : track.hasPanel && isMoving(track.state) ? (last?.opened ?? null) : null
    const isStart = track.since === now && isMoving(track.state)
    const glide = glideOf(track, isStart, last?.glide ?? null, now)
    rows.set(block.id, { track, block, opened, glide })
    const closing = track.state === 'closing' && block.kind === 'row' ? opened : null
    const wasClosing = last?.track.state === 'closing' && last.opened !== null && track.state === 'closed'
    motion.set(block.id, {
      state: track.state,
      isStart,
      box: glide?.box ?? null,
      fadeMs: glide?.fadeMs ?? 0,
      panel: panelOf(track.state, isStart, last?.track.state, closing),
      closing,
      isPanelLeftOut:
        (closing !== null && (!isStart || isFolding(last?.track.state))) || (wasClosing && block.kind === 'row'),
    })
  }
  for (const b of blocks) {
    const track = stepRow(was.rows.get(b.id)?.track, targetOf(b), now, !isFirst && !wasDrawn.has(b.id))
    if (track) add(b, track)
  }
  const shown = [...blocks]
  const isDrawn = new Set(blocks.map(b => b.id))
  was.order.forEach((id, i) => {
    const old = was.rows.get(id)
    if (!old || isDrawn.has(id) || rows.has(id)) return
    const isGliding = old.glide !== null && now < old.glide.endsAt
    const track = stepRow(old.track, 'gone', now) ?? (isGliding ? old.track : null)
    if (!track) return
    add(old.block, track)
    shown.splice(placeAfter(shown, was.order.slice(0, i)), 0, old.block)
  })
  const ends = [...rows.values()]
    .flatMap(t => [
      ...(isMoving(t.track.state) ? [t.track.since + ROW_STATE_MS[t.track.state]] : []),
      ...(t.glide ? [t.glide.endsAt] : []),
    ])
    .filter(at => at > now)

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
