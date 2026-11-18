import { ROW_STATE_MS, isMoving, stepRow } from '../../hooks/row-motion'
import type { RowState, RowTarget, RowTrack } from '../../hooks/row-motion'
import { isOpenRow } from './blocks'
import type { Block, RowBlock } from './blocks'
import type { TabCell } from './draw'
import { MOVED_TO, copyIdOf, titleId } from './heights'
import { HOLD_MS, glideOf, isShownAtOnce } from './block-glide'
import type { Glide } from './block-glide'
import { stepTitle, titleMotion, titleTimes } from './title-motion'
import type { TitleGlide, TitleMotion } from './title-motion'
import { stepUnder, underId, underMotion, underTimes } from './under-line'
import type { UnderLine, UnderMotion } from './under-line'

/**
 * A block's track, the block as last drawn, the open form a row last drew while it keeps its panel, and the box glide
 * its last enter or leave set, which runs on until `endsAt` even if the block's state moves on. `title` is the glide
 * of a row's title between its one-line and wrapped forms. `springId` names the boxes of a block that moved to another
 * place, which are new so that they start from no height, and is null for a block that never moved. `isInputMove` says
 * the block's move started in a draw that followed the person's input. `under` is the status under a row's buttons as
 * it comes and goes.
 */
type Tracked = {
  track: RowTrack
  block: Block
  opened: RowBlock | null
  glide: Glide | null
  title: TitleGlide | null
  springId: string | null
  isInputMove: boolean
  under: UnderLine | null
}

/**
 * Each block's track and the block as last drawn, the ids of every block the last draw showed, in order, until when
 * a block that leaves holds its space while its content fades, so nothing grows until that space starts to close, and
 * when the last draw was.
 */
export type Tracks = {
  rows: ReadonlyMap<string, Tracked>
  order: readonly string[]
  holdsUntil: number
  drawnAt: number
}
export const NO_TRACKS: Tracks = { rows: new Map(), order: [], holdsUntil: 0, drawnAt: 0 }

/**
 * How a block moves in this draw. `isStart` marks the draw a move began. A block that enters or leaves draws in a box
 * whose height springs and whose content fades over `fadeMs`, once the box is nearly open if `waitsForSpace`: `box` is `open` at the block's
 * measured height, `shut` at none, and null at rest, and `isShown` says whether the content fades to full opacity. `panel` is the opacity of a row's panel, its body and buttons, as it opens or closes, and
 * `closing` the open form whose panel a closing row keeps drawn. `isPanelWaiting` says an opening row's panel fades in
 * once its space is nearly open, as an entering block's content does, unless the person's input opened it. `isPanelLeftOut` says the row's content box moves to
 * its measured height less its panel's: through a close after its first draw, through all of a close that turns an
 * open back, and in the draw after a close, before the row measures without the panel. A close's first draw keeps the
 * panel's height, so the row the selection moves to measures its new height in that draw and both start together.
 * `title` is how a row's title draws while it moves between its one-line and wrapped forms, null when it draws one.
 * `isHeightHeld` says a row whose close starts in the draw a block starts to leave keeps its open height, its title's
 * and its panel's, while its panel fades and the leaving block holds its space. `shutForMs` is how long the box of a block that turned
 * back had been springing shut. `springId` is what names the block's boxes in place of its id, for a block that moved: the boxes it left behind are
 * still drawn, and a new box starts from the height it is drawn at. `under` is how the status under a row's buttons
 * draws as it comes and goes. `former` is the block's last form in the draw it changes kind, as a PR's block does when it
 * is dismissed, so its box keeps that form's height until the new form measures.
 */
export type RowMotion = {
  state: RowState
  isStart: boolean
  box: Glide['box'] | null
  isShown: boolean
  fadeMs: number
  waitsForSpace: boolean
  shutForMs: number | null
  panel: 0 | 1 | null
  isPanelWaiting: boolean
  closing: RowBlock | null
  isPanelLeftOut: boolean
  title: TitleMotion | null
  isHeightHeld: boolean
  springId: string | null
  under: UnderMotion | null
  former: Block | null
}

const targetOf = (b: Block): RowTarget =>
  b.kind !== 'row' ? 'closed' : b.settled ? 'settled' : isOpenRow(b) ? 'open' : 'closed'

const isFolding = (state: RowState | undefined): boolean => state === 'opening' || state === 'closing'

/** A row's panel fades in as it opens and out as it closes, from where it is when the move turns back. */
function panelOf(state: RowState, isStart: boolean, was: RowState | undefined, closing: RowBlock | null) {
  const isFrom = isStart && !isFolding(was)
  if (state === 'opening') return isFrom ? 0 : 1
  if (state === 'closing' && closing) return isFrom ? 1 : 0

  return null
}

/**
 * The positions in `at` of a longest run of values that increase, not necessarily next to each other: the blocks that
 * keep their order among those drawn before.
 */
function longestRun(at: number[]): Set<number> {
  const tails: number[] = []
  const before: number[] = []
  at.forEach((value, i) => {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((at[tails[mid]!] ?? 0) < value) lo = mid + 1
      else hi = mid
    }
    before[i] = lo > 0 ? (tails[lo - 1] ?? -1) : -1
    tails[lo] = i
  })
  const run = new Set<number>()
  for (let i = tails.at(-1) ?? -1; i >= 0; i = before[i] ?? -1) run.add(i)

  return run
}

/**
 * The ids of the blocks that stay on the page and change place: of the blocks drawn before and still listed, the fewest
 * whose removal leaves the rest in the order they were drawn in. A block that only moves because a block above it came
 * or went keeps its order, so it is not one of them.
 */
function movedOf(blocks: Block[], was: Tracks): Set<string> {
  const drawnAt = new Map(was.order.map((id, i) => [id, i]))
  const kept = blocks.filter(b => was.rows.get(b.id) !== undefined && was.rows.get(b.id)?.track.state !== 'leaving')
  const at = kept.map(b => drawnAt.get(b.id) ?? 0)
  if (at.every((x, i) => i === 0 || (at[i - 1] ?? 0) < x)) return new Set()
  const stays = longestRun(at)

  return new Set(kept.filter((_, i) => !stays.has(i)).map(b => b.id))
}

/**
 * Steps every block through the shared row states. A block the publish dropped stays drawn while it leaves, after the
 * nearest block that was above it and is still drawn. A block that takes a leaving block's id is that block in another
 * form, so it does not leave and the new one does not enter. A block that changes place leaves its old place as a copy
 * under its own id, which is drawn as it was and leaves, and enters at its new place, so both glide on the height
 * spring. While a block that leaves holds its space, nothing that moves in a draw that did not follow the person's
 * input grows: a block that enters waits to open, a row that would open keeps its last form, and a row whose close
 * starts with or after the leave keeps its height while its panel fades. So the closing and the opening row start
 * together, as the leaving block's space starts to close. The person's own moves do not wait: in a draw that follows
 * their input (`isInput`), the row the selection opens and the row it closes move at once, and a field a press brings
 * in shows at once. When their input opens a row, a row whose close a publish began lets go of its height, so both move
 * together. A block that leaves in the draw a press's field enters, or comes back as it leaves, is what the field
 * replaces: it hides at once and shuts without holding anything. `isFirst` forgets the tracks and draws every block at
 * rest, as a newly shown tab does. `heightOf` gives the height measured under a key, as the
 * look measures it. `nextAt` is when a move ends, a box opens or shuts, or a box's glide comes to rest, so the look draws again then.
 */
export function moveRows(
  blocks: Block[],
  last: Tracks,
  now: number,
  isFirst: boolean,
  isInput = false,
  heightOf: (key: string) => number | undefined = () => undefined,
): { blocks: Block[]; tracks: Tracks; motion: ReadonlyMap<string, RowMotion>; nextAt: number | null } {
  const was = isFirst ? NO_TRACKS : last
  const wasDrawn = new Set(was.order)
  const moved = movedOf(blocks, was)
  const copies = new Map([...moved].map(id => [id, copyIdOf(id, now)]))
  const isDrawn = new Set(blocks.map(b => b.id))
  const isFieldBack = (id: string) => !wasDrawn.has(id) || was.rows.get(id)?.track.state === 'leaving'
  const isFieldPressed = !isFirst && blocks.some(b => b.kind === 'field' && isFieldBack(b.id))
  const startsLeave = was.order.some(id => {
    const old = was.rows.get(id)
    const holdsSpace =
      old !== undefined &&
      old.track.state !== 'leaving' &&
      old.glide?.box !== 'shut' &&
      !isShownAtOnce(old.glide, now, heightOf(id))
    return holdsSpace && (copies.has(id) || !isDrawn.has(id))
  })
  const holdsUntil = startsLeave && !isFieldPressed ? now + HOLD_MS : was.holdsUntil
  const isHolding = holdsUntil > now
  const opensRow = blocks.some(b => {
    const old = was.rows.get(b.id)
    return old !== undefined && targetOf(b) === 'open' && targetOf(old.block) !== 'open'
  })
  const waiting = new Map<string, Block>()
  const rows = new Map<string, Tracked>()
  const motion = new Map<string, RowMotion>()
  const add = (block: Block, track: RowTrack, last: Tracked | undefined, springId: string | null = null) => {
    const isOpen = block.kind === 'row' && isOpenRow(block)
    const wasOpen = last?.block.kind === 'row' && isOpenRow(last.block)
    const title =
      block.kind === 'row' && last
        ? stepTitle(last?.title ?? null, wasOpen, isOpen, now, heightOf(titleId(block.id)))
        : null
    const opened = isOpen ? block : track.hasPanel && isMoving(track.state) ? (last?.opened ?? null) : null
    const isStart = track.since === now && isMoving(track.state)
    const isPressed = block.kind === 'field'
    const glide = glideOf(
      track,
      isStart,
      last?.glide ?? null,
      now,
      holdsUntil,
      isPressed,
      isFieldPressed,
      heightOf(block.id),
    )
    const isReleased = isInput && opensRow && track.state === 'closing'
    const isInputMove = isStart ? isInput : (last?.isInputMove ?? false) || isReleased
    const under = stepUnder(last?.under ?? null, block, now)
    rows.set(block.id, { track, block, opened, glide, title, springId, isInputMove, under })
    const closing = track.state === 'closing' && block.kind === 'row' ? opened : null
    const wasClosing = last?.track.state === 'closing' && last.opened !== null && track.state === 'closed'
    const isHeld = closing !== null && isHolding && track.since >= holdsUntil - HOLD_MS && !isInputMove
    motion.set(block.id, {
      state: track.state,
      isStart,
      box: glide?.box ?? null,
      isShown: glide?.isShown ?? true,
      fadeMs: glide?.fadeMs ?? 0,
      waitsForSpace: glide?.waitsForSpace ?? false,
      shutForMs: glide?.shutForMs ?? null,
      panel: panelOf(track.state, isStart, last?.track.state, closing),
      isPanelWaiting: track.state === 'opening' && !isInputMove,
      closing,
      isPanelLeftOut:
        (closing !== null && !isHeld && (!isStart || isFolding(last?.track.state))) ||
        (wasClosing && block.kind === 'row'),
      title: titleMotion(title, now),
      isHeightHeld: isHeld,
      springId,
      under: underMotion(under, now, heightOf(underId(block.id))),
      former: last && last.block.kind !== block.kind ? last.block : null,
    })
  }
  for (const b of blocks) {
    const isMoved = moved.has(b.id)
    const old = isMoved ? undefined : was.rows.get(b.id)
    const waits = !isInput && isHolding && old !== undefined && targetOf(b) === 'open' && targetOf(old.block) !== 'open'
    if (waits) waiting.set(b.id, old.block)
    const drawn = waits ? old.block : b
    const track = stepRow(old?.track, targetOf(drawn), now, isMoved || (!isFirst && !wasDrawn.has(b.id)))
    if (track) add(drawn, track, old, isMoved ? `${b.id}${MOVED_TO}${now}` : (old?.springId ?? null))
  }
  const shown = blocks.map(b => waiting.get(b.id) ?? b)
  was.order.forEach((id, i) => {
    const old = was.rows.get(id)
    const copyId = copies.get(id)
    if (!old || (copyId === undefined && (isDrawn.has(id) || rows.has(id)))) return
    const isGliding = old.glide !== null && now < old.glide.endsAt
    const track = stepRow(old.track, 'gone', now) ?? (isGliding ? old.track : null)
    if (!track) return
    const block = copyId === undefined ? old.block : { ...old.block, id: copyId }
    add(block, track, old, copyId === undefined ? old.springId : null)
    shown.splice(
      placeAfter(
        shown,
        was.order.slice(0, i).map(above => copies.get(above) ?? above),
      ),
      0,
      block,
    )
  })
  const isStarting = [...motion.values()].some(m => m.isStart)
  const drawn = isStarting ? shown.map(b => heldForm(b, was, motion)) : shown
  const ends = [...rows.values()]
    .flatMap(t => [
      ...(isMoving(t.track.state) ? [t.track.since + ROW_STATE_MS[t.track.state]] : []),
      ...(t.glide ? [t.glide.endsAt, t.glide.opensAt ?? 0, t.glide.shutAt ?? 0] : []),
      ...titleTimes(t.title),
      ...underTimes(t.under),
      holdsUntil,
    ])
    .filter(at => at > now)

  return {
    blocks: drawn,
    tracks: { rows, order: shown.map(b => b.id), holdsUntil, drawnAt: now },
    motion,
    nextAt: ends.length ? Math.min(...ends) : null,
  }
}

/**
 * A block at rest that changed in a draw that starts a move, such as a group's title as its count changes, keeps its
 * last form for that draw. The move's first draw only sets where its boxes move from, so the change lands in the draw
 * that sets them moving. Rows and an empty tab's text take their new form at once, since a press or a field on a row
 * must show at once.
 */
function heldForm(b: Block, was: Tracks, motion: ReadonlyMap<string, RowMotion>): Block {
  const last = was.rows.get(b.id)?.block
  const state = motion.get(b.id)?.state
  const isHeld = last !== undefined && b.kind !== 'row' && b.kind !== 'empty' && state !== undefined && !isMoving(state)

  return isHeld && JSON.stringify(last) !== JSON.stringify(b) ? last : b
}

/**
 * The tab bar a draw shows. In a draw that starts a move, each tab keeps the count it last drew, or no count if it drew
 * none, so the count changes with the group titles, in the draw that sets the rows moving.
 */
export function heldTabs(tabs: TabCell[], last: readonly TabCell[], motion: ReadonlyMap<string, RowMotion>): TabCell[] {
  if (![...motion.values()].some(m => m.isStart)) return tabs

  return tabs.map(t => {
    const was = last.find(l => l.id === t.id)

    return was ? { ...t, badge: was.badge } : t
  })
}

/** Where a leaving block goes: just after the last of the blocks that were above it that is still shown, else first. */
function placeAfter(shown: Block[], above: readonly string[]): number {
  for (let i = above.length - 1; i >= 0; i--) {
    const at = shown.findIndex(b => b.id === above[i])
    if (at >= 0) return at + 1
  }
  return 0
}
