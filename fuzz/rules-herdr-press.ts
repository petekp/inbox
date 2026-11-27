import { CUT_OPACITY } from '../core/view/row-motion'
import { NEXT_FRAME_MS } from '../herdr/src/block-glide'
import type { Block } from '../herdr/src/blocks'
import type { Failure } from './failure'
import type { HerdrRun, Press } from './look-herdr'
import { baseOf } from './rules-herdr-vanish'

type ShownText = { at: number; block: string; text: string; opacity: number; share: number }
type At = (t: number) => Pick<Failure, 'look' | 'at' | 'after'>

const FRAME_MS = 16
/**
 * How long after the answer's first frame what a press brought may start to show. Herdr measures a new line in the draw
 * after the one that brings it, and a growing box holds its height for a draw before it glides, so a line may first
 * show a draw and a frame later.
 */
const SHOWS_WITHIN_MS = NEXT_FRAME_MS + FRAME_MS
/** How long after a press the rule looks for what it brought, unless the next input or press comes first. */
const WINDOW_MS = 1000
/** The opacity at which a text has started to show. */
const STARTED = 0.01
/** The fields of a block that hold words it draws. */
const WORD_KEYS = new Set([
  'text',
  'label',
  'title',
  'age',
  'name',
  'number',
  'lead',
  'error',
  'warning',
  'under',
  'unlisted',
  'hint',
  'aside',
  'does',
])
/** The fields whose objects hold no drawn words, such as a mark, which turns every frame while it runs. */
const SKIPPED = new Set(['id', 'mark', 'does', 'press', 'effects'])

/** How the frame stand-in names a text field's text. */
const FIELD_TEXT = 'text field: '

/** The words a block draws, from its fields that hold them. A text field it opens counts as the field's text. */
function wordsOf(v: unknown, key = ''): string[] {
  if (key === 'field' && v !== null && typeof v === 'object') return [FIELD_TEXT, ...wordsOf(v)]
  if (typeof v === 'string') return WORD_KEYS.has(key) && v.trim() !== '' ? [v] : []
  if (Array.isArray(v)) return v.flatMap(x => wordsOf(x, key))
  if (v === null || typeof v !== 'object') return []
  return Object.entries(v).flatMap(([k, x]) =>
    SKIPPED.has(k) && typeof x !== 'string' ? [] : k === 'id' ? [] : wordsOf(x, k),
  )
}

/** Whether a drawn text draws part of a word: the word whole, a line it wraps to, or a text that holds it. */
const draws = (text: string, word: string) =>
  text === word || (text.trim().length >= 3 && word.includes(text.replace(/…$/, ''))) || text.includes(word)

/**
 * The `press-shows` rule: the draw that answers a press shows what the press brought to its block. A press answers in
 * the person's own draw and again in the draw after the host applies its press file. What it brought is the words the
 * view gives the pressed block in that draw that it did not give it in the draw before, which the block then draws at
 * `CUT_OPACITY` or more within `WINDOW_MS`. One of them must start to show within `SHOWS_WITHIN_MS` of the answer's
 * first frame, or the pressed button's label must go.
 */
export function pressShowsFailures(run: HerdrRun, shown: ShownText[], at: At): Failure[] {
  const out: Failure[] = []
  const blockOf = (i: number, id: string): Block | undefined => run.draws[i]?.blocks.find(b => b.id === id)
  for (const p of run.presses) {
    const i = run.draws.findLastIndex(d => d.at <= p.at)
    const before = run.draws.slice(0, i).findLast(d => d.at < p.at)
    const now = blockOf(i, p.block)
    if (!now || !before) continue
    const was = before.blocks.find(b => b.id === p.block)
    if (p.by === 'host' && isRowFormSwap(was, now)) continue
    const had = new Set(wordsOf(was ?? null))
    const brought = [...new Set(wordsOf(now))].filter(w => !had.has(w))
    if (brought.length === 0) continue
    const next = Math.min(p.at + WINDOW_MS, ...nextInputs(run, p))
    const first = shown.find(s => s.at >= p.at)?.at
    if (first === undefined) continue
    const lastFrame = shown.findLast(s => s.at < first)?.at
    const drewBefore =
      lastFrame === undefined
        ? had
        : new Set(
            shown.filter(s => s.at === lastFrame && baseOf(s.block) === p.block && s.opacity > 0).map(s => s.text),
          )
    const sawButton = shown.some(
      s =>
        s.at === lastFrame && baseOf(s.block) === p.block && s.text === p.label && s.opacity * s.share >= CUT_OPACITY,
    )
    if (had.has(p.label) && !sawButton) continue
    const ofPress = (s: ShownText) =>
      baseOf(s.block) === p.block && !drewBefore.has(s.text) && brought.some(w => draws(s.text, w))
    const later = shown.find(s => s.at >= first && s.at < next && ofPress(s) && s.opacity * s.share >= CUT_OPACITY)
    if (!later) continue
    const isEarly = (s: ShownText) => s.at >= first && s.at <= first + SHOWS_WITHIN_MS
    const isShown = shown.some(s => isEarly(s) && ofPress(s) && s.opacity >= STARTED && s.share > 0)
    const isButtonGone =
      drewBefore.has(p.label) &&
      !shown.some(s => s.at === first && baseOf(s.block) === p.block && s.text === p.label && s.opacity > 0)
    if (isShown || isButtonGone) continue
    const answer = p.by === 'person' ? 'its own draw' : "the draw after the host's answer"
    out.push({
      ...at(first),
      rule: 'press-shows',
      detail: `the press "${p.label}" on ${p.block} showed nothing it brought in ${answer}: "${later.text}" first showed ${later.at - first} ms later`,
      seen: { press: p, brought, later },
    })
  }

  return out
}

/**
 * Whether a row settles or comes back, as Done or Undo makes it in the host's answer. Its lines fade out before its new
 * form fades in, as `docs/looks/differences-herdr-motion.md` says, and the row closing shows the press.
 */
const isRowFormSwap = (was: Block | undefined, now: Block) =>
  was?.kind === 'row' && now.kind === 'row' && (was.settled === null) !== (now.settled === null)

/** The times of the input and presses after a press, which can bring words of their own. */
const nextInputs = (run: HerdrRun, p: Press) => [...run.inputAt, ...run.presses.map(x => x.at)].filter(t => t > p.at)
