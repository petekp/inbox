import { ENTER_FADE_MS, FAINT_OPACITY, LEAVE_FADE_MS, enterDelayMs } from '../../core/view/row-motion'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import { NEXT_FRAME_MS } from './block-glide'
import type { Block, StatusLine } from './blocks'

/** The parts of a Status line that fade on their own as they change. */
export type StatusPart = 'mark' | 'name' | 'under' | 'buttons'

const PART_KEYS: Record<StatusPart, (s: StatusLine) => string> = {
  mark: s => (s.mark ? `${s.mark.text} ${s.mark.tone}` : ''),
  name: s => `${s.name} ${s.nameTone ?? ''}`,
  under: s => s.under.map(l => l.text).join('\n'),
  buttons: s => s.buttons.map(b => b.label).join('\n'),
}
const STATUS_PARTS = Object.keys(PART_KEYS) as StatusPart[]

const changedParts = (was: StatusLine, b: StatusLine): StatusPart[] =>
  STATUS_PARTS.filter(part => PART_KEYS[part](was) !== PART_KEYS[part](b))

/**
 * A block that changes form and has no motion of its own for it. A block that keeps its id and changes kind, as a PR's
 * block does when a fetch finds the PR closed and it becomes a settled row, fades whole, and `parts` is null. So does a
 * note or a line whose text changes, as a PR's order line when the agent orders the PRs again. A Status
 * line fades only the `parts` that change, as its mark when the ask that held it up closes, or an ask line's words when
 * another ask takes its place. What
 * changes fades out from `since` until `outUntil`, which a part that starts to change meanwhile puts off until it has
 * faded out too. The new form, `to`, draws from `inAt`, null until then, and what is new fades in once the block's box
 * is nearly at its new height, from `fromHeight`. `isBack` says the change turned back to the former form while it
 * faded out, so that form fades back in at once. `isInput` says the change came in a draw that follows the person's
 * input, so the new form shows faint at once instead of hidden.
 */
export type BlockSwap = {
  from: Block
  to: Block
  parts: StatusPart[] | null
  outUntil: number
  since: number
  inAt: number | null
  isBack: boolean
  isInput: boolean
  fromHeight: number | undefined
}

/**
 * How a block that changes form draws in this draw: what changes fades out while `isOut`, and `inDelayMs` is how long
 * a Status line's new parts wait before they fade in, null while they wait for the line to measure them.
 */
export type BlockSwapMotion = {
  from: Block
  /** The key the new form of a block that keeps its kind measures under, as `formKeyOf` says, or null. */
  formKey: string | null
  parts: StatusPart[] | null
  isOut: boolean
  isFirst: boolean
  isInput: boolean
  inDelayMs: number | null
  fromHeight: number | undefined
}

const endsAt = (s: BlockSwap): number => (s.inAt ?? Infinity) + NEXT_FRAME_MS + HEIGHT_SETTLE_MS + ENTER_FADE_MS

/** A note's or a line's text, which changes the whole block, or null for a block whose text has motion of its own. */
const wordsOf = (b: Block): string | null =>
  b.kind === 'note' ? b.text : b.kind === 'line' ? `${b.text ?? ''}\n${b.under ?? ''}` : null

/**
 * The parts of `was` that change in `b`: null when the whole block changes, as when it changes kind or a note's or a
 * line's text changes.
 */
function partsOf(was: Block, b: Block): StatusPart[] | null {
  if (was.kind !== b.kind) return null
  if (was.kind === 'status' && b.kind === 'status') return changedParts(was, b)
  return wordsOf(was) !== wordsOf(b) ? null : []
}

const isFormOf = (s: BlockSwap, b: Block): boolean => partsOf(s.from, b)?.length === 0

const isOtherForm = (was: Block, b: Block): boolean => partsOf(was, b)?.length !== 0

/** A change that keeps the block's kind and changes it whole, as a note's or a line's text does. */
const isWholeInPlace = (was: Block, b: Block): boolean => was.kind === b.kind && partsOf(was, b) === null

function startSwap(
  was: Block,
  b: Block,
  parts: StatusPart[] | null,
  now: number,
  isInput: boolean,
  height: number | undefined,
): BlockSwap {
  const isAdded = was.kind === 'status' && parts !== null && parts.every(part => PART_KEYS[part](was) === '')

  return {
    from: was,
    to: b,
    parts,
    since: now,
    outUntil: now + NEXT_FRAME_MS + LEAVE_FADE_MS,
    inAt: isAdded || isInput ? now : null,
    isBack: false,
    isInput,
    fromHeight: height,
  }
}

/**
 * The change of form in this draw, from the last one, the block last drawn, `was`, the block the view gives, `b`, and
 * the height `was` measured. A change starts only for a block whose box neither enters nor leaves, `isBoxAtRest`. A
 * Status line whose changed parts were all empty has nothing to fade out, so its new parts come at once. In a draw that
 * follows the person's input, `isInput`, the change shows at once, as a press's answer does: a block that changes
 * kind or a Status part takes its new form, and a note or a line skips its fade out and shows its new text faint until
 * its box is nearly at the new height, so the box cuts it only while it is that faint.
 */
export function stepBlockSwap(
  last: BlockSwap | null,
  was: Block | undefined,
  b: Block,
  now: number,
  isBoxAtRest: boolean,
  isInput: boolean,
  height: number | undefined,
): BlockSwap | null {
  const live = last !== null && now < endsAt(last) ? last : null
  if (live?.inAt === null) {
    if (isFormOf(live, b)) return { ...live, to: b, inAt: now, isBack: true }
    if (isInput && isOtherForm(live.to, b)) {
      return isWholeInPlace(live.from, b) ? startSwap(live.from, b, null, now, true, live.fromHeight) : null
    }
    const more = live.from.kind === 'status' && b.kind === 'status' ? changedParts(live.from, b) : null
    const added = live.parts && more ? more.filter(part => !live.parts?.includes(part)) : []
    const parts = live.parts && more && [...live.parts, ...added]
    const outUntil = added.length > 0 ? Math.max(live.outUntil, now + LEAVE_FADE_MS) : live.outUntil
    return { ...live, to: b, parts, outUntil, inAt: now >= outUntil ? now : null }
  }
  const parts = was === undefined ? [] : partsOf(was, b)
  if (was === undefined || !isBoxAtRest || parts?.length === 0) return live
  if (isInput && !isWholeInPlace(was, b)) return live

  return startSwap(was, b, parts, now, isInput, height)
}

/** `b` with the parts of `from` that fade out in place of its own. */
function withPartsOf(b: StatusLine, from: StatusLine, parts: StatusPart[]): StatusLine {
  const held = (part: StatusPart) => parts.includes(part)
  return {
    ...b,
    mark: held('mark') ? from.mark : b.mark,
    name: held('name') ? from.name : b.name,
    nameTone: held('name') ? from.nameTone : b.nameTone,
    under: held('under') ? from.under : b.under,
    buttons: held('buttons') ? from.buttons : b.buttons,
  }
}

/** The block drawn for `b` while its form changes: until its new form's first draw, its former form, or a Status line's former parts. */
export function swapDrawn(s: BlockSwap | null, b: Block): Block {
  if (s === null || s.inAt !== null) return b
  return s.parts !== null && s.from.kind === 'status' && b.kind === 'status' ? withPartsOf(b, s.from, s.parts) : s.from
}

/**
 * The key the new form of a block that changes whole and keeps its kind measures under while it fades in. The block's
 * own key keeps its former form's height until Herdr reports the new one a draw later, so the new form would fade in
 * as if its box held still.
 */
const formKeyOf = (s: BlockSwap): string | null =>
  s.inAt !== null && s.parts === null && s.from.kind === s.to.kind ? `swapped ${s.to.id} ${s.since}` : null

export const blockSwapMotion = (s: BlockSwap | null, now: number, height: number | undefined): BlockSwapMotion | null =>
  s && {
    from: s.from,
    formKey: formKeyOf(s),
    parts: s.parts,
    isOut: s.inAt === null,
    isFirst: s.since === now,
    isInput: s.isInput,
    fromHeight: s.fromHeight,
    inDelayMs:
      s.inAt === null || (!s.isBack && now === s.inAt)
        ? null
        : s.isBack
          ? 0
          : enterDelayMs(height ?? 0, { x: s.fromHeight ?? height ?? 0, v: 0 }),
  }

export const blockSwapTimes = (s: BlockSwap | null): number[] =>
  s === null ? [] : s.inAt === null ? [s.since + NEXT_FRAME_MS, s.outUntil] : [s.inAt + NEXT_FRAME_MS, endsAt(s)]

/** The fade of what changes in a block that changes form, with `inDelayMs` the wait before what is new fades in, or null. */
export const swapPartFade = (m: BlockSwapMotion, inDelayMs: number | null) =>
  m.isOut
    ? { opacity: m.isFirst ? 1 : 0, duration: LEAVE_FADE_MS, delay: 0 }
    : inDelayMs === null
      ? { opacity: m.isInput ? FAINT_OPACITY : 0, duration: 0, delay: 0 }
      : { opacity: 1, duration: ENTER_FADE_MS, delay: inDelayMs }
