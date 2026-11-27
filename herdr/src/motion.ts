import {
  LEAVE_FADE_MS,
  ROW_STATE_MS,
  drawsPanel,
  enterDelayMs,
  isMoving,
  placeAfter,
  stepRow,
} from '../../core/view/row-motion'
import type { RowState, RowTarget, RowTrack } from '../../core/view/row-motion'
import { isOpenRow } from './blocks'
import type { Block, RowBlock } from './blocks'
import { MOVED_TO, NO_SIZES, copyIdOf, panelId, restId, titleId } from './heights'
import type { Sizes } from './heights'
import { titleRestOf } from './title-cut'
import { HOLD_MS, NEXT_FRAME_MS, glideOf, isShownAtOnce } from './block-glide'
import { aimSpace, faintCloseSteps, opacityAt, panelOf, stepsFrom } from './panel-steps'
import type { Glide } from './block-glide'
import { stepTitle, titleMotion, titleTimes } from './title-motion'
import type { TitleMotion } from './title-motion'
import { pushUnder, stepUnder, underId, underMotion, underPushMs, underTimes } from './under-line'
import { movedOf } from './moved-blocks'
import type { UnderMotion } from './under-line'
import { prTailMotion, prTailTimes, stepPrStatus, stepPrTail } from './pr-status'
import type { PrLine, PrTailMotion } from './pr-status'
import { panelShownOf, stepSwap, swapHoldsUntil, swapMotion, swapTimes, swapWaitsUntil } from './form-swap'
import { takeSwap, waitSwap } from './form-swap'
import type { SwapMotion } from './form-swap'
import { heldForm } from './held-form'
import { stepWarning, warningId } from './warning-line'
import { fieldOpening, fieldTimes, stepFieldWait } from './field-wait'
import type { FieldOpening } from './field-wait'
import { NO_TRACKS } from './tracks'
import { blockSwapMotion, blockSwapTimes, stepBlockSwap, swapDrawn } from './block-swap'
import type { BlockSwap, BlockSwapMotion } from './block-swap'
import { countLeftTimes, stepCountLeft } from './heading-count'
import type { CountLeft } from './heading-count'
import type { Tracked, Tracks } from './tracks'

const NO_IDS: ReadonlySet<string> = new Set()

/**
 * How a block moves in this draw. `isStart` marks the draw a move began. A block that enters or leaves draws in a box
 * whose height springs and whose content fades over `fadeMs`, once the box is nearly open if `waitsForSpace`: `box` is `open` at the block's
 * measured height, `shut` at none, and null at rest, and `isShown` says whether the content fades to full opacity. `panel` is the opacity of a row's panel, its body and buttons, as it opens or closes, and
 * `closing` the open form whose panel a closing row keeps drawn. `isPanelWaiting` says an opening row's panel fades in
 * once its space is nearly open, as an entering block's content does, the person's own move included. A row that turns
 * back from a close fades its panel in at once instead, in the steps of `turnBackFades`, and `panelFadeMs` is the
 * length of the step it is in. `isPanelLeftOut` says the row's content box moves to
 * its measured height less its panel's: through a close once its panel has faded, through all of a close whose panel
 * showed nothing yet, as one that turns an open back before its panel faded in, and in the draw after a close, before
 * the row measures without the panel.
 * `title` is how a row's title draws while it moves between its one-line and wrapped forms, null when it draws one.
 * `isHeightHeld` says a closing row keeps its open height, its title's and its panel's, while its panel fades, and
 * while a leaving block holds its space if the close starts in the draw that block starts to leave. `shutForMs` is how long the box of a block that turned
 * back had been springing shut. `springId` is what names the block's boxes in place of its id, for a block that moved: the boxes it left behind are
 * still drawn, and a new box starts from the height it is drawn at. `under` is how the status under a row's buttons
 * draws as it comes and goes, `status` and `prTail` how a PR block's lines do, and `warning` the stopped warning. `former` is the block's last form in the draw it changes kind, as a PR's block does when it
 * is dismissed, so its box keeps that form's height until the new form measures, and `blockSwap` how its content fades from
 * the one form to the other, as a Status line's parts do as they change. `field` is how the buttons of a row's reply field draw
 * while the field comes, null at rest, and `countLeft` a group heading's count that went.
 */
export type RowMotion = {
  state: RowState
  isStart: boolean
  box: Glide['box'] | null
  isShown: boolean
  fadeMs: number
  waitsForSpace: boolean
  shutForMs: number | null
  panel: number | null
  isPanelWaiting: boolean
  panelFadeMs: number | null
  closing: RowBlock | null
  isPanelLeftOut: boolean
  title: TitleMotion | null
  isHeightHeld: boolean
  springId: string | null
  under: UnderMotion | null
  status: UnderMotion<PrLine> | null
  prTail: PrTailMotion | null
  warning: UnderMotion<string> | null
  former: Block | null
  blockSwap: BlockSwapMotion | null
  swap: SwapMotion | null
  field: FieldOpening | null
  countLeft: CountLeft | null
}

const targetOf = (b: Block): RowTarget =>
  b.kind !== 'row' ? 'closed' : b.settled ? 'settled' : isOpenRow(b) ? 'open' : 'closed'

/** Whether a Status line's place in the tree changes: its depth, its connectors or its path. */
const isReshaped = (was: Block, b: Block): boolean =>
  was.kind === 'status' &&
  b.kind === 'status' &&
  (was.depth !== b.depth || JSON.stringify([was.tree, was.path]) !== JSON.stringify([b.tree, b.path]))

const isFolding = (state: RowState | undefined): boolean => state === 'opening' || state === 'closing'

/**
 * Steps every block through the shared row states. A block the publish dropped stays drawn while it leaves, after the
 * nearest block that was above it and is still drawn. A block that takes a leaving block's id is that block in another
 * form, so it does not leave and the new one does not enter. A block that changes place leaves its old place as a copy
 * under its own id, which is drawn as it was and leaves, and enters at its new place, so both glide on the height
 * spring. While a block that leaves holds its space, nothing that moves in a draw that did not follow the person's
 * input grows: a block that enters waits to open, a row that would open keeps its last form, and a row whose close
 * starts with or after the leave keeps its height while its panel fades. So the closing and the opening row start
 * together, as the leaving block's space starts to close. A Status line whose place in the tree changes keeps its last
 * form during the hold, so its connectors move once the leaving lines fade. A closing row whose panel shows keeps its
 * height while the panel fades, and until then a block that enters waits to open and a row that opens keeps its closed
 * form, drawn selected, the person's own moves included. That row opens a draw before the hold ends, since its first
 * draw only measures its open form, so the two rows start together. A row whose close is turned back drops its hold and
 * opens at once. The person's own moves do not wait for a leave. In a draw that follows their input (`isInput`), a
 * block a read changed in the same frame (`fetched`) still moves as a publish does. A row the selection opens waits
 * only for the panel of the row it closes to fade, and a field a press brings in shows at once. The opened row's panel
 * still fades in once its space is nearly open. When their input opens a row, a row whose close a publish began lets go
 * of its height, so both move together. A block that leaves in the draw a press's field enters, or comes back as it
 * leaves, is what the field replaces: it hides at once and shuts without holding anything. `isFirst` forgets the tracks
 * and draws every block at rest, as a newly shown tab does. `sizes` gives the sizes the look measured, by key. `nextAt`
 * is when a move ends, a box opens or shuts, or a box's glide comes to rest, so the look draws again then.
 */
export function moveRows(
  blocks: Block[],
  last: Tracks,
  now: number,
  isFirst: boolean,
  isInput = false,
  sizes: Sizes = NO_SIZES,
  fetched: ReadonlySet<string> = NO_IDS,
): { blocks: Block[]; tracks: Tracks; motion: ReadonlyMap<string, RowMotion>; nextAt: number | null } {
  const heightOf = (key: string) => sizes.get(key)
  const isInputTo = (id: string) => isInput && !fetched.has(id)
  const was = isFirst ? NO_TRACKS : last
  const wasDrawn = new Set(was.order)
  const moved = movedOf(blocks, was)
  const copies = new Map([...moved].map(id => [id, copyIdOf(id, now)]))
  const isDrawn = new Set(blocks.map(b => b.id))
  const isFieldBack = (id: string) => !wasDrawn.has(id) || was.rows.get(id)?.track.state === 'leaving'
  const isFieldPressed = !isFirst && isInput && blocks.some(b => b.kind === 'field' && isFieldBack(b.id))
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
  const isPanelShown = (t: Tracked, id: string): boolean => {
    const height = heightOf(panelId(id)) ?? 0
    if (height <= 0 || (t.track.state !== 'open' && t.track.state !== 'opening')) return false
    const fadesAt = t.panelSteps ? t.track.since : t.track.since + NEXT_FRAME_MS + enterDelayMs(height)

    return t.track.state === 'open' || (now >= fadesAt && !isPanelFaint(t))
  }
  const isPanelFaint = (t: Tracked): boolean =>
    t.track.state === 'opening' && t.panelSteps !== null && now < (t.panelSteps.at(-1)?.at ?? now)
  const panelFadeWaitMs = (t: Tracked): number => (t.track.state === 'open' ? NEXT_FRAME_MS : 0)
  const panelHolds = new Map(
    blocks.flatMap(b => {
      const old = was.rows.get(b.id)
      const isClosing = b.kind === 'row' && !moved.has(b.id) && targetOf(b) === 'closed'
      return old && isClosing && isPanelShown(old, b.id) ? [[b.id, now + panelFadeWaitMs(old) + LEAVE_FADE_MS]] : []
    }),
  )
  const swaps = new Map(
    blocks.map(b => {
      const old = moved.has(b.id) ? undefined : was.rows.get(b.id)
      const shown = old ? panelShownOf(old.track, old.panelSteps, heightOf(panelId(b.id)) ?? 0, now) : 1
      return [b.id, stepSwap(old?.swap ?? null, old?.block, b, now, shown)] as const
    }),
  )
  const closeHoldsUntil = Math.max(
    0,
    ...[...swaps.values()].map(swapWaitsUntil),
    ...blocks.map(b => {
      const old = was.rows.get(b.id)
      const isStillClosing = old !== undefined && targetOf(b) === 'closed'
      return panelHolds.get(b.id) ?? (isStillClosing ? old.panelHeldUntil : 0)
    }),
  )
  const opensAfterClose = closeHoldsUntil - NEXT_FRAME_MS
  const opensRow = blocks.some(b => {
    const old = was.rows.get(b.id)
    return old !== undefined && targetOf(b) === 'open' && targetOf(old.block) !== 'open'
  })
  const waiting = new Map<string, Block>()
  const blockSwaps = new Map<string, BlockSwap>()
  const rows = new Map<string, Tracked>()
  const motion = new Map<string, RowMotion>()
  const add = (block: Block, track: RowTrack, last: Tracked | undefined, springId: string | null = null) => {
    const isOpen = block.kind === 'row' && isOpenRow(block)
    const opened = isOpen ? block : drawsPanel(track) && isMoving(track.state) ? (last?.opened ?? null) : null
    const isStart = track.since === now && isMoving(track.state)
    const isPressed = block.kind === 'field' && isInput
    const glide = glideOf(
      track,
      isStart,
      last?.glide ?? null,
      now,
      Math.max(holdsUntil, closeHoldsUntil),
      isPressed,
      isFieldPressed,
      heightOf(block.id),
    )
    const isReleased = isInputTo(block.id) && opensRow && track.state === 'closing'
    const isInputMove = isStart ? isInputTo(block.id) : (last?.isInputMove ?? false) || isReleased
    const status = stepPrStatus(last?.status ?? null, block, now, isFirst)
    const prTail =
      block.kind === 'pr' ? stepPrTail(last?.prTail ?? null, block, now, isFirst, isInputTo(block.id)) : null
    const warning = stepWarning(last?.warning ?? null, last?.block, block, now, isFirst, isInputTo(block.id))
    const isTurnedBack = isStart && track.state === 'opening' && last?.track.state === 'closing' && last.opened !== null
    const panelHeight = heightOf(panelId(block.id))
    const lastSteps = last?.panelSteps ?? null
    const isFaintClose = isStart && track.state === 'closing' && last !== undefined && isPanelFaint(last)
    const panelSteps =
      track.state !== 'opening' && track.state !== 'closing'
        ? null
        : isTurnedBack
          ? stepsFrom(now, last?.panelSpace ?? null, panelHeight ?? 0, lastSteps ? opacityAt(lastSteps, now) : 0)
          : isFaintClose && lastSteps
            ? faintCloseSteps(now, lastSteps)
            : isStart
              ? null
              : lastSteps
    const panelStep = panelSteps?.findLast(step => step.at <= now) ?? null
    const panelHeldUntil =
      track.state !== 'closing' ? 0 : isStart ? (panelHolds.get(block.id) ?? now) : (last?.panelHeldUntil ?? 0)
    const closing = track.state === 'closing' && block.kind === 'row' ? opened : null
    const wasClosing = last?.track.state === 'closing' && last.opened !== null && track.state === 'closed'
    const isHeldForLeave = isHolding && track.since >= holdsUntil - HOLD_MS && !isInputMove
    const rest = heightOf(restId(block.id))
    const swap = takeSwap(
      swaps.has(block.id) ? (swaps.get(block.id) ?? null) : stepSwap(last?.swap ?? null, last?.block, block, now),
      block,
      now,
      rest,
    )
    const closeHeldUntil = closing === null ? 0 : Math.max(isHeldForLeave ? holdsUntil : 0, panelHeldUntil)
    const heldUntil = Math.max(closeHeldUntil, swapHoldsUntil(swap, now))
    const isHeld = heldUntil > now
    const isLeftOut = closing !== null && !isHeld && (!isStart || isFolding(last?.track.state))
    const holdsPanel = drawsPanel(track) && !isLeftOut
    const isPanelLeftOut = isLeftOut || (wasClosing && block.kind === 'row')
    const leftOut = isPanelLeftOut ? (panelHeight ?? 0) : 0
    const restSpace = aimSpace(last?.restSpace ?? null, (rest ?? 0) - leftOut, now)
    const under = pushUnder(
      stepUnder(last?.under ?? null, block, now, isInputTo(block.id), heightOf(underId(block.id))),
      underPushMs(last, block, restSpace),
      now,
    )
    const waited = waitSwap(swap, restSpace, rest, now)
    const fieldWait = stepFieldWait(last, block, restSpace, now)
    const panelSpace = aimSpace(
      last?.panelSpace ?? null,
      holdsPanel ? (panelHeight ?? last?.panelSpace?.to ?? 0) : 0,
      now,
    )
    const title =
      block.kind === 'row' && last
        ? stepTitle(
            last.title,
            titleRestOf(last.block, last.swap, sizes),
            titleRestOf(block, swap, sizes),
            now,
            heightOf(titleId(block.id)),
            Math.max(0, heldUntil - now),
          )
        : null
    const countLeft = stepCountLeft(last?.countLeft ?? null, last?.block, block, now)
    rows.set(block.id, {
      track,
      block,
      opened,
      glide,
      title,
      springId,
      isInputMove,
      under,
      status,
      prTail,
      warning,
      panelSpace,
      panelSteps,
      panelHeldUntil,
      swap: waited,
      restSpace,
      fieldWait,
      blockSwap: blockSwaps.get(block.id) ?? null,
      countLeft,
    })
    motion.set(block.id, {
      state: track.state,
      isStart,
      box: glide?.box ?? null,
      isShown: glide?.isShown ?? true,
      fadeMs: glide?.fadeMs ?? 0,
      waitsForSpace: glide?.waitsForSpace ?? false,
      shutForMs: glide?.shutForMs ?? null,
      panel: panelStep?.to ?? panelOf(track.state, isStart, last, closing),
      isPanelWaiting: track.state === 'opening',
      panelFadeMs: panelStep?.ms ?? null,
      closing,
      isPanelLeftOut,
      title: titleMotion(title, now),
      isHeightHeld: isHeld,
      springId,
      under: underMotion(under, now, heightOf(underId(block.id))),
      status: underMotion(status, now, heightOf(underId(block.id))),
      prTail: prTail && prTailMotion(prTail, block.id, now, heightOf),
      warning: underMotion(warning, now, heightOf(warningId(block.id))),
      former: last && last.block.kind !== block.kind ? last.block : null,
      blockSwap: blockSwapMotion(blockSwaps.get(block.id) ?? null, now, heightOf(block.id)),
      swap: swapMotion(waited, now),
      field: fieldOpening(fieldWait, now),
      countLeft,
    })
  }
  for (const b of blocks) {
    const prior = was.rows.get(b.id)
    const isMovedOn = prior?.track.state === 'entering' && prior.springId?.includes(MOVED_TO) === true
    const isMoved = moved.has(b.id) && !isMovedOn
    const old = isMoved ? undefined : prior
    const isBoxAtRest = old !== undefined && (old.glide === null || now >= old.glide.endsAt)
    const blockSwap = isFirst
      ? null
      : stepBlockSwap(old?.blockSwap ?? null, old?.block, b, now, isBoxAtRest, isInputTo(b.id), heightOf(b.id))
    if (blockSwap) blockSwaps.set(b.id, blockSwap)
    const given = swapDrawn(blockSwap, b)
    const opens = old !== undefined && targetOf(b) === 'open' && targetOf(old.block) !== 'open'
    const waitsForLeave = opens && !isInputTo(b.id) && isHolding
    const isTurningBack = old?.track.state === 'closing' && old.swap?.inAt !== null
    const waitsForClose = opens && old.block.kind === 'row' && opensAfterClose > now && !isTurningBack
    const waitsToReshape = old !== undefined && isHolding && isReshaped(old.block, b)
    const drawn =
      waitsForLeave || waitsToReshape
        ? old.block
        : waitsForClose
          ? { ...old.block, isSelected: true, isCollapsed: true as const }
          : given
    if (waitsForLeave || waitsToReshape || waitsForClose || given !== b) waiting.set(b.id, drawn)
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
        shown.map(b => b.id),
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
      ...underTimes(t.status),
      ...prTailTimes(t.prTail),
      ...underTimes(t.warning),
      ...swapTimes(t.swap),
      ...fieldTimes(t.fieldWait),
      ...blockSwapTimes(t.blockSwap),
      ...countLeftTimes(t.countLeft),
      holdsUntil,
      closeHoldsUntil,
      opensAfterClose,
      t.panelHeldUntil,
      ...(t.panelSteps ?? []).map(step => step.at),
    ])
    .filter(at => at > now)

  return {
    blocks: drawn,
    tracks: { rows, order: shown.map(b => b.id), holdsUntil, drawnAt: now },
    motion,
    nextAt: ends.length ? Math.min(...ends) : null,
  }
}
