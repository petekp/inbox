import { ENTER_FADE_MS, LEAVE_FADE_MS, enterDelayMs } from '../../core/view/row-motion'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import { NEXT_FRAME_MS } from './block-glide'
import type { Block, StatusLine } from './blocks'

/** The parts of a Status line that fade on their own as they change. */
export type StatusPart = 'mark' | 'waitsOn' | 'under' | 'buttons'

const PART_KEYS: Record<StatusPart, (s: StatusLine) => string> = {
  mark: s => s.mark?.text ?? '',
  waitsOn: s => s.waitsOn?.text ?? '',
  under: s => s.under.map(l => l.text).join('\n'),
  buttons: s => s.buttons.map(b => b.label).join('\n'),
}
const STATUS_PARTS = Object.keys(PART_KEYS) as StatusPart[]

const changedParts = (was: StatusLine, b: StatusLine): StatusPart[] =>
  STATUS_PARTS.filter(part => PART_KEYS[part](was) !== PART_KEYS[part](b))

/**
 * A block that changes form and has no motion of its own for it. A block that keeps its id and changes kind, as a PR's
 * block does when a fetch finds the PR closed and it becomes a settled row, fades whole, and `parts` is null. A Status
 * line fades only the `parts` that change, as its question's line and button when the question is answered. What
 * changes fades out from `since`, then the new form draws from `inAt`, null until then, and what is new fades in once
 * the block's box is nearly at its new height, from `fromHeight`. `isBack` says the change turned back to the former
 * form while it faded out, so that form fades back in at once.
 */
export type BlockSwap = {
  from: Block
  parts: StatusPart[] | null
  since: number
  inAt: number | null
  isBack: boolean
  fromHeight: number | undefined
}

/**
 * How a block that changes form draws in this draw: what changes fades out while `isOut`, and `inDelayMs` is how long
 * a Status line's new parts wait before they fade in, null while they wait for the line to measure them.
 */
export type BlockSwapMotion = {
  from: Block
  parts: StatusPart[] | null
  isOut: boolean
  isFirst: boolean
  inDelayMs: number | null
}

const outEndsAt = (s: BlockSwap): number => s.since + NEXT_FRAME_MS + LEAVE_FADE_MS
const endsAt = (s: BlockSwap): number => (s.inAt ?? Infinity) + NEXT_FRAME_MS + HEIGHT_SETTLE_MS + ENTER_FADE_MS

const isFormOf = (s: BlockSwap, b: Block): boolean =>
  s.parts === null
    ? s.from.kind === b.kind
    : s.from.kind === 'status' && b.kind === 'status' && changedParts(s.from, b).length === 0

const partsOf = (was: Block, b: Block): StatusPart[] | null =>
  was.kind !== b.kind ? null : was.kind === 'status' && b.kind === 'status' ? changedParts(was, b) : []

/**
 * The change of form in this draw, from the last one, the block last drawn, `was`, the block the view gives, `b`, and
 * the height `was` measured. A change starts only for a block whose box neither enters nor leaves, `isBoxAtRest`. A
 * Status line whose changed parts were all empty has nothing to fade out, so its new parts come at once.
 */
export function stepBlockSwap(
  last: BlockSwap | null,
  was: Block | undefined,
  b: Block,
  now: number,
  isBoxAtRest: boolean,
  height: number | undefined,
): BlockSwap | null {
  const live = last !== null && now < endsAt(last) ? last : null
  if (live?.inAt === null) {
    if (isFormOf(live, b)) return { ...live, inAt: now, isBack: true }
    const more = live.from.kind === 'status' && b.kind === 'status' ? changedParts(live.from, b) : null
    const parts = live.parts && more && [...new Set([...live.parts, ...more])]
    return { ...live, parts, inAt: now >= outEndsAt(live) ? now : null }
  }
  const parts = was === undefined ? [] : partsOf(was, b)
  if (was === undefined || !isBoxAtRest || parts?.length === 0) return live
  const isAdded = was.kind === 'status' && parts !== null && parts.every(part => PART_KEYS[part](was) === '')

  return { from: was, parts, since: now, inAt: isAdded ? now : null, isBack: false, fromHeight: height }
}

/** `b` with the parts of `from` that fade out in place of its own. */
function withPartsOf(b: StatusLine, from: StatusLine, parts: StatusPart[]): StatusLine {
  const { waitsOn, ...rest } = b
  const held = (part: StatusPart) => parts.includes(part)
  const shownWaitsOn = held('waitsOn') ? from.waitsOn : waitsOn
  return {
    ...rest,
    ...(shownWaitsOn ? { waitsOn: shownWaitsOn } : {}),
    mark: held('mark') ? from.mark : b.mark,
    under: held('under') ? from.under : b.under,
    buttons: held('buttons') ? from.buttons : b.buttons,
  }
}

/** The block drawn for `b` while its form changes: until its new form's first draw, its former form, or a Status line's former parts. */
export function swapDrawn(s: BlockSwap | null, b: Block): Block {
  if (s === null || s.inAt !== null) return b
  return s.parts !== null && s.from.kind === 'status' && b.kind === 'status' ? withPartsOf(b, s.from, s.parts) : s.from
}

export const blockSwapMotion = (s: BlockSwap | null, now: number, height: number | undefined): BlockSwapMotion | null =>
  s && {
    from: s.from,
    parts: s.parts,
    isOut: s.inAt === null,
    isFirst: s.since === now,
    inDelayMs:
      s.inAt === null || (!s.isBack && now === s.inAt)
        ? null
        : s.isBack
          ? 0
          : enterDelayMs(height ?? 0, { x: s.fromHeight ?? height ?? 0, v: 0 }),
  }

export const blockSwapTimes = (s: BlockSwap | null): number[] =>
  s === null ? [] : s.inAt === null ? [s.since + NEXT_FRAME_MS, outEndsAt(s)] : [s.inAt + NEXT_FRAME_MS, endsAt(s)]

/** The fade of what changes in a block that changes form, with `inDelayMs` the wait before what is new fades in, or null. */
export const swapPartFade = (m: BlockSwapMotion, inDelayMs: number | null) =>
  m.isOut
    ? { opacity: m.isFirst ? 1 : 0, duration: LEAVE_FADE_MS, delay: 0 }
    : inDelayMs === null
      ? { opacity: 0, duration: 0, delay: 0 }
      : { opacity: 1, duration: ENTER_FADE_MS, delay: inDelayMs }
