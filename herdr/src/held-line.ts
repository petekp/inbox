import { isFailure, isStatusUnderActions } from '../../core/view/feedback'
import { HEIGHT_SETTLE_MS } from '../../core/view/springs'
import { heldLineEndsAt, isPressUnderWay, stepHeldLine } from '../../core/view/held-line'
import type { HeldLine } from '../../core/view/held-line'
import { agedText, isOpenRow } from './blocks'
import type { AddedLines, Aged, Block, BodyLine, RowBlock, Tone } from './blocks'
import { HOLD_MS, NEXT_FRAME_MS } from './block-glide'
import { aboveId, aboveLineId, addedId, addedLinesId } from './heights'
import type { Sizes } from './heights'

/**
 * A row's status line that the panel draws on its own line between the row's title and its buttons. `aged` keeps a
 * status's age counting while the line is held. `kind` is what the status says, as `statusKindOf` reads it. `isAgain`
 * marks a line that came in place of a line of another kind.
 */
type LineAbove = { text: string; tone: Tone; kind: string | undefined; aged?: Aged; cameAt?: number; isAgain?: true }

type Status = NonNullable<RowBlock['feedback']>

/** What a status says, as a press under way or its outcome: an open or refresh that runs, and how it ended, differ. */
export const statusKindOf = (l: Status): string | undefined =>
  l.source?.is === 'local' ? `local ${l.source.result.state}` : l.source?.is

/**
 * What each row holds above its buttons, by row id: the line it last drew there, or null for a row that drew none
 * there when its press went out, so its status stays under its buttons. `lineless` names the rows that last drew their
 * buttons with no line above them, and `bare` the rows that last drew no buttons and no line after their title.
 * `comes` gives when the status after the title of a row with no buttons came, while its box opens, and `kinds` the
 * kind of the status each such row drew there, as `statusKindOf` reads it. `bodies` gives
 * the keys of each open row's body lines as last drawn, and `added` the lines a row added while their box opens.
 */
/** When a status came after the title of a row with no buttons, and whether it came in place of one of another kind. */
type Coming = { at: number; isAgain: boolean }

export type LinesAbove = {
  held: ReadonlyMap<string, HeldLine<LineAbove> | null>
  lineless: ReadonlySet<string>
  bare: ReadonlySet<string>
  comes: ReadonlyMap<string, Coming>
  kinds: ReadonlyMap<string, string | undefined>
  bodies: ReadonlyMap<string, string[]>
  added: ReadonlyMap<string, AddedLines>
}

export const NO_LINES_ABOVE: LinesAbove = {
  held: new Map(),
  lineless: new Set(),
  bare: new Set(),
  comes: new Map(),
  kinds: new Map(),
  bodies: new Map(),
  added: new Map(),
}

/** How long a line whose hold let go stays drawn: its fade, then its space closing. */
const HELD_LEAVE_MS = HOLD_MS + HEIGHT_SETTLE_MS

/** How long a status that comes above a row's buttons takes to come: its box opening, then the line fading in. */
const LINE_COMES_MS = NEXT_FRAME_MS + HEIGHT_SETTLE_MS

/** Undo takes the place of a settled row's buttons, so a settled row holds nothing from its open form. */
const heldKey = (r: RowBlock): string => (r.settled ? `settled ${r.id}` : r.id)

const hasActions = (r: RowBlock): boolean => r.buttons.length > 0 || r.field !== null

/** Whether a row's status goes under its buttons: where `isStatusUnderActions` places it, or held there. */
export const isStatusUnder = (r: RowBlock): boolean =>
  r.feedback !== null && (r.isStatusHeldUnder === true || isStatusUnderActions(r.feedback.source, hasActions(r)))

const lineOf = (f: Status, cameAt: number | undefined, isAgain: boolean): LineAbove => ({
  text: f.text,
  tone: f.tone,
  kind: statusKindOf(f),
  ...(f.aged ? { aged: f.aged } : {}),
  ...(cameAt === undefined ? {} : { cameAt }),
  ...(isAgain ? { isAgain: true as const } : {}),
})

/** The block of a row whose status is still coming above its buttons, as `comingEl` draws it. */
const comingRow = (b: RowBlock, l: LineAbove & { cameAt: number }): RowBlock => ({
  ...b,
  lineCameAt: l.cameAt,
  ...(l.isAgain ? { isLineAgain: true as const } : {}),
})

const isComing = (l: LineAbove | undefined, now: number): l is LineAbove & { cameAt: number } =>
  l?.cameAt !== undefined && now < l.cameAt + LINE_COMES_MS

/** A body line as an open row's draws compare it: its part, and the option it draws or its words. */
export const bodyKey = (l: BodyLine): string => `${l.part} ${l.optionId ?? l.text}`

/** Where `run` starts in `keys`, as a run of lines in a row, or -1. */
export function runAt(keys: string[], run: string[]): number {
  if (run.length === 0) return -1
  for (let n = 0; n + run.length <= keys.length; n++) if (run.every((k, i) => keys[n + i] === k)) return n

  return -1
}

/**
 * The lines an open row added to its body at `now`, after `was`, given the keys of the body lines it drew last, `last`,
 * and now, `keys`: one run of new lines between the lines it kept, as the options "All N options" adds or the context
 * a question asked again adds, while their box opens. A draw that takes heights at once draws them at rest.
 */
function stepAdded(
  was: AddedLines | undefined,
  last: string[] | undefined,
  keys: string[],
  now: number,
  isAtOnce: boolean,
): AddedLines | null {
  if (isAtOnce) return null
  if (was && now < was.cameAt + LINE_COMES_MS && runAt(keys, was.keys) >= 0) return was
  if (last === undefined || keys.length <= last.length) return null
  let head = 0
  while (head < last.length && keys[head] === last[head]) head++
  let tail = 0
  while (tail < last.length - head && keys[keys.length - 1 - tail] === last[last.length - 1 - tail]) tail++

  return head + tail < last.length ? null : { keys: keys.slice(head, keys.length - tail), cameAt: now }
}

/**
 * The blocks with the lines each open row added, as `stepAdded` gives them. They open a box of their own, so the
 * buttons under them glide down as the row's box grows.
 */
function addLines(blocks: Block[], last: LinesAbove, now: number, isAtOnce: boolean) {
  const bodies = new Map<string, string[]>()
  const added = new Map<string, AddedLines>()
  const shown = blocks.map((b): Block => {
    if (b.kind !== 'row' || !isOpenRow(b) || !hasActions(b)) return b
    const keys = b.body.map(bodyKey)
    bodies.set(b.id, keys)
    const a = stepAdded(last.added.get(b.id), last.bodies.get(b.id), keys, now, isAtOnce)
    if (a) added.set(b.id, a)
    return a ? { ...b, addedLines: a } : b
  })
  const ends = [...added.values()].flatMap(a => [a.cameAt + NEXT_FRAME_MS, a.cameAt + LINE_COMES_MS])

  return { blocks: shown, bodies, added, ends: ends.filter(at => at > now) }
}

/**
 * The blocks with each row's held line, the lines to hold at the next draw, and when a held line next changes how it
 * draws. The panel draws a status that follows the title on its own line above the buttons, where the other looks put
 * it in the title's text. The line keeps its place while a press puts the row's status under the buttons, so they hold
 * their place, and lets go as `stepHeldLine` says. A line that lets go fades out while its space holds, then its space
 * closes.
 *
 * A row whose press went out with no line above keeps its status under its buttons, where the press under way read, as
 * with "✓ Explained". A row drawn without buttons during its press, such as one deselected, keeps what it holds for
 * when it shows them again. A row that settles or comes back from settled starts holding afresh.
 *
 * A status that comes above the buttons of a row that last drew them with no line above opens a box for itself, so the
 * buttons glide down (`lineCameAt`). So does a status that comes after the title of a row that last drew no buttons and
 * no line there, such as a folded row whose press is not applied, so the row's box grows with it. A row that shows its
 * buttons again, such as one selected, draws its line at rest, as does a draw that takes heights at once, `isAtOnce`.
 * A status that takes the place of a status of another kind above the buttons comes again from that draw, its box
 * moving from the old line's height (`isLineAgain`), as a status under the buttons comes again.
 */
export function holdLinesAbove(
  blocks: Block[],
  last: LinesAbove,
  now: number,
  isAtOnce = false,
): { blocks: Block[]; held: LinesAbove; nextAt: number | null } {
  const next = new Map<string, HeldLine<LineAbove> | null>()
  const lineless = new Set<string>()
  const bare = new Set<string>()
  const comes = new Map<string, Coming>()
  const kinds = new Map<string, string | undefined>()
  const bareRow = (b: RowBlock, key: string): Block => {
    if (b.feedback === null || isStatusUnder(b)) return (bare.add(key), b)
    const kind = statusKindOf(b.feedback)
    kinds.set(key, kind)
    const was = last.comes.get(key)
    const isNew = !isAtOnce && last.bare.has(key)
    const isNewKind = !isAtOnce && last.kinds.has(key) && last.kinds.get(key) !== kind
    const come = isNewKind
      ? { at: now, isAgain: true }
      : was !== undefined && now < was.at + LINE_COMES_MS
        ? was
        : isNew
          ? { at: now, isAgain: false }
          : undefined
    if (come === undefined) return b
    comes.set(key, come)
    return { ...b, lineCameAt: come.at, ...(come.isAgain ? { isLineAgain: true as const } : {}) }
  }
  const shown = blocks.map((b): Block => {
    if (b.kind !== 'row') return b
    const key = heldKey(b)
    const kept = last.held.get(key)
    const f = b.feedback
    const source = f?.source ?? null
    const isUnderWay = isPressUnderWay(source)
    if (!hasActions(b)) {
      if (kept !== undefined && isUnderWay) next.set(key, kept)
      return bareRow(b, key)
    }
    const isUnder = isStatusUnder(b)
    const isStarting = kept === undefined && f !== null && isUnder && (isUnderWay || source?.is === 'queued')
    if (kept === null || isStarting) {
      next.set(key, null)
      lineless.add(key)
      return kept === null && f !== null && !isUnder ? { ...b, isStatusHeldUnder: true } : b
    }
    const isNewLine = kept === undefined && !isAtOnce && last.lineless.has(key)
    const isDrawn = kept?.leftAt === null
    const isNewKind = !isAtOnce && isDrawn && f !== null && !isUnder && kept.line.kind !== statusKindOf(f)
    const cameAt = isNewLine || isNewKind ? now : isDrawn ? kept.line.cameAt : undefined
    const isAgain = isNewKind || (isDrawn && !isNewLine && kept.line.isAgain === true)
    const own = f !== null && !isUnder ? lineOf(f, cameAt, isAgain) : null
    const isOwnFailure = f !== null && isFailure(f.source)
    const step = stepHeldLine(
      kept,
      { own, isOwnFailure, isUnder: f !== null && isUnder, isPressUnderWay: isUnderWay },
      now,
      HELD_LEAVE_MS,
    )
    if (step.kept) next.set(key, step.kept)
    const d = step.drawn
    if (!d && !own) lineless.add(key)
    if (!d) return own && isComing(own, now) ? comingRow(b, own) : b
    const text = d.line.aged ? agedText(d.line.aged, now) : d.line.text

    return {
      ...b,
      heldLine: { text, tone: d.line.tone, isHidden: d.isHidden, ...(d.leftAt === null ? {} : { leftAt: d.leftAt }) },
    }
  })
  const withAdded = addLines(shown, last, now, isAtOnce)
  const ends = [...next.values()].flatMap(k => {
    if (isComing(k?.line, now))
      return [k.line.cameAt + NEXT_FRAME_MS, k.line.cameAt + LINE_COMES_MS].filter(at => at > now)
    const end = heldLineEndsAt(k, HELD_LEAVE_MS)
    return end === null || k?.leftAt == null
      ? []
      : [k.leftAt + NEXT_FRAME_MS, k.leftAt + HOLD_MS, end].filter(at => at > now)
  })

  for (const { at } of comes.values()) ends.push(...[at + NEXT_FRAME_MS, at + LINE_COMES_MS].filter(t => t > now))
  ends.push(...withAdded.ends)
  const held = { held: next, lineless, bare, comes, kinds, bodies: withAdded.bodies, added: withAdded.added }

  return { blocks: withAdded.blocks, held, nextAt: ends.length === 0 ? null : Math.min(...ends) }
}

/** Whether a row's held line that let go has faded, so its box shuts. */
const isHeldLineShutting = (r: RowBlock, now: number): boolean =>
  r.heldLine?.leftAt !== undefined && now >= r.heldLine.leftAt + HOLD_MS

/**
 * How far a row's measured rest is over the height it moves to while its held line's box shuts: the box's height as
 * last measured. The row's box then springs with the line's box, as one move.
 */
export const heldLineDrop = (r: RowBlock, now: number, heights: Sizes): number =>
  isHeldLineShutting(r, now) ? (heights.get(aboveId(r.id)) ?? 0) : 0

/**
 * How far a row's measured rest is under the height it moves to while the box of a status that came above its buttons
 * opens: the line's height less its box's, from the draw after it came. The row's box then springs with the line's box.
 * A line that came in place of a taller one shuts its box toward its own height, so the rise is then below none.
 */
export function lineRise(r: RowBlock, now: number, heights: Sizes): number {
  if (r.lineCameAt === undefined || now === r.lineCameAt) return 0
  const rise = (heights.get(aboveLineId(r.id)) ?? 0) - (heights.get(aboveId(r.id)) ?? 0)

  return r.isLineAgain ? rise : Math.max(0, rise)
}

/** As `lineRise`, for the box of the lines an open row added. */
export const addedRise = (r: RowBlock, now: number, heights: Sizes): number =>
  r.addedLines === undefined || now === r.addedLines.cameAt
    ? 0
    : Math.max(0, (heights.get(addedLinesId(r.id)) ?? 0) - (heights.get(addedId(r.id)) ?? 0))
