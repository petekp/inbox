import { RUNNING_FRAMES } from '../core/view/help'
import { CUT_OPACITY } from '../core/view/row-motion'
import type { Failure } from './failure'
import type { HerdrRun } from './look-herdr'
import type { Block } from '../herdr/src/blocks'
import { isStatusUnder } from '../herdr/src/held-line'

const FRAME_MS = 16
/** How the frame stand-in names a text field's text. */
const FIELD_TEXT = 'text field: '

type ShownText = { at: number; block: string; text: string; opacity: number; share: number }
type At = (t: number) => Pick<Failure, 'look' | 'at' | 'after'>

const keyOf = (s: ShownText) => `${s.block}|${s.text}`
const isShown = (s: ShownText) => s.opacity * s.share >= CUT_OPACITY && s.text.trim() !== ''
const stem = (t: string) => t.replace(/…$/, '')
const isRunningMark = (text: string) => (RUNNING_FRAMES as readonly string[]).includes(text)

/** The part of a Status line a text is: its mark, what it waits on, a button, or another line. */
function statusPartOf(b: Extract<Block, { kind: 'status' }>, text: string): string {
  if (b.mark?.text === text) return 'the mark'
  if (b.waitsOn?.text === text) return 'what it waits on'
  if (b.buttons.some(x => x.label === text)) return 'the button'
  return 'the line'
}

/**
 * What part of a block drew `text` in a draw: a row's mark, title, age, status, settled label or button, or a line. A
 * status goes under the buttons only while they show, `shown` being the texts the block showed then.
 */
function partOf(b: Block | undefined, text: string, shown: Set<string>): string {
  if (b?.kind === 'status') return statusPartOf(b, text)
  if (b?.kind !== 'row') return 'the line'
  if (b.mark?.text === text || (b.mark?.isRunning === true && isRunningMark(text))) return 'the mark'
  if (b.age === text) return 'the age'
  const isUnder = isStatusUnder(b) && b.buttons.some(x => shown.has(x.label))
  if (b.feedback?.text === text && isUnder) return 'the status under the buttons'
  if (b.feedback?.text === text || b.heldLine?.text === text) return 'the status'
  if (b.settled?.label === text) return 'the settled label'
  if (b.buttons.some(x => x.label === text)) return 'the button'
  return b.title.startsWith(stem(text)) ? 'the title' : 'the line'
}

/** How many draws after one that follows input still belong to it, each within a frame of the one before. */
const MOVE_DRAWS = 2

/**
 * The draws that follow the person's input: each draw after their key, click or typing, each draw the view moves as
 * theirs, as the one that answers their press, and up to `MOVE_DRAWS` draws after either, each within a frame of the
 * one before, which set its move going and change a group's title and count and the tab bar's counts. A new page draws
 * at rest, so its first draw counts too.
 */
function inputDraws(run: HerdrRun): number[] {
  const viewInput = run.steps.filter(s => s[2] === 'input').map(s => s[0])
  const moves = [...new Set([...run.inputAt, ...viewInput])].flatMap(at => {
    const draws = [at]
    for (let i = 0; i < MOVE_DRAWS; i++) {
      const last = draws.at(-1) ?? at
      const next = run.steps.find(s => s[0] > last)?.[0]
      if (next === undefined || next - last > FRAME_MS) break
      draws.push(next)
    }
    return draws
  })

  return [...moves, ...run.pageAt]
}

/**
 * The `vanish` rule: a text that shows at `CUT_OPACITY` or more of opacity times share does not go in one frame of a
 * draw that does not follow the person's input, while its block still shows. A text changed rather than went when a
 * text new in that frame goes on from it, longer, shorter or after a prefix, when its block shows as many new texts as
 * went, or when a row's mark took another form, as a running mark that turns into a task's drawn checkbox. A text
 * field that opens hides the lines it takes the place of at once.
 */
export function vanishFailures(run: HerdrRun, shown: ShownText[], at: At): Failure[] {
  const out: Failure[] = []
  const frames = new Map<number, ShownText[]>()
  for (const s of shown) frames.set(s.at, [...(frames.get(s.at) ?? []), s])
  const times = [...frames.keys()].sort((a, b) => a - b)
  const inputs = inputDraws(run)
  const isInputDraw = (t: number) => inputs.some(s => s > t - FRAME_MS && s <= t)
  const blockAt = (t: number, block: string) => run.draws.findLast(d => d.at <= t)?.blocks.find(x => x.id === block)
  const markAt = (t: number, block: string) => {
    const b = blockAt(t, block)
    return b?.kind === 'row' ? b.mark : null
  }
  for (let i = 1; i < times.length; i++) {
    const t = times[i] ?? 0
    const was = times[i - 1] ?? 0
    if (isInputDraw(t)) continue
    const before = frames.get(was) ?? []
    const now = new Map((frames.get(t) ?? []).filter(s => s.opacity > 0).map(s => [keyOf(s), s]))
    const wasShown = new Set(before.filter(isShown).map(keyOf))
    const blocksNow = new Set([...now.values()].map(s => s.block))
    const comes = [...now.values()].filter(n => !wasShown.has(keyOf(n)))
    const goesOn = (s: ShownText) =>
      comes.some(
        n =>
          n.block === s.block &&
          (n.text.startsWith(stem(s.text)) || n.text.endsWith(s.text) || s.text.startsWith(stem(n.text))),
      )
    const isMarkSwap = (s: ShownText) => {
      const last = markAt(was, s.block)
      const isLastMark = last !== null && (last.text === s.text || (last.isRunning && isRunningMark(s.text)))
      return isLastMark && markAt(t, s.block) !== null
    }
    const shownIn = (block: string) => new Set(before.filter(s => s.block === block && isShown(s)).map(s => s.text))
    const opensField = (block: string) => comes.some(n => n.block === block && n.text.startsWith(FIELD_TEXT))
    const gone = before.filter(
      s => isShown(s) && !now.has(keyOf(s)) && blocksNow.has(s.block) && !goesOn(s) && !isMarkSwap(s),
    )
    for (const block of new Set(gone.map(s => s.block))) {
      const went = gone.filter(s => s.block === block)
      const came = comes.filter(n => n.block === block && isShown(n) && !isMarkSwap(n)).length
      if (opensField(block) || came >= went.length) continue
      const faint = comes.find(n => n.block === block && n.text.trim() !== '' && !isShown(n))
      const instead = faint ? `"${faint.text}" came at ${faint.opacity.toFixed(2)}` : 'nothing came in its place'
      for (const s of went)
        out.push({
          ...at(t),
          rule: 'vanish',
          detail: `${partOf(blockAt(was, block), s.text, shownIn(block))} "${s.text}" in ${block} went from ${s.opacity.toFixed(2)} to gone in one frame, with no input then, and ${instead}`,
          seen: s,
        })
    }
  }

  return out
}
