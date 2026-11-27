import { CUT_OPACITY } from '../core/view/row-motion'
import { allOf } from '../herdr/tests/gpui-stand-in'
import type { Painted } from '../herdr/tests/gpui-stand-in'
import type { Failure } from './failure'
import type { HerdrRun } from './look-herdr'
import { isInputDrawOf } from './rules-herdr-vanish'

type At = (t: number) => Pick<Failure, 'look' | 'at' | 'after'>

/** A tab's count as a draw sets it: its text, the opacity it moves to, and how long the move takes. */
type Count = { text: string; opacity: number; ms: number }

/** Each tab's count in a draw, by the tab's id. A tab draws its label first and its count after it. */
function countsOf(root: Painted): Map<string, Count> {
  const out = new Map<string, Count>()
  for (const tab of allOf(root)) {
    const id = tab.id?.match(/^tab (.+)$/)?.[1]
    if (id === undefined) continue
    const count = allOf(tab).filter(n => n.text !== null)[1]
    if (!count?.text) continue
    let opacity = 1
    let ms = 0
    for (let up: Painted | null = count; up && up !== tab.parent; up = up.parent) {
      opacity *= up.style.opacity ?? 1
      ms = Math.max(ms, up.transitions.get('opacity') ?? 0)
    }
    out.set(id, { text: count.text, opacity, ms })
  }

  return out
}

/**
 * The `vanish` rule on the tab bar's counts: a count that shows does not go in one draw that does not follow the
 * person's input, while its tab still shows. A count that turns into another changed rather than went. A count shows
 * until a draw sets it under `CUT_OPACITY` and that draw's fade has run its course.
 */
export function tabCountFailures(run: HerdrRun, at: At): Failure[] {
  const out: Failure[] = []
  const isInputDraw = isInputDrawOf(run)
  const fadingSince = new Map<string, number>()
  let last: Map<string, Count> | null = null
  for (const d of run.draws) {
    const counts = countsOf(d.root)
    const hasTabs = allOf(d.root).some(n => n.id?.startsWith('tab ') === true)
    if (last && hasTabs && !isInputDraw(d.at))
      for (const [tab, c] of last) {
        if (counts.has(tab)) continue
        const isFadedOut = c.opacity < CUT_OPACITY && d.at >= (fadingSince.get(tab) ?? Infinity) + c.ms
        if (!isFadedOut)
          out.push({
            ...at(d.at),
            rule: 'vanish',
            detail: `the count "${c.text}" of tab ${tab} went from ${c.opacity.toFixed(2)} to gone in one draw, with no input then`,
            seen: c,
          })
      }
    for (const [tab, c] of counts)
      if (c.opacity >= CUT_OPACITY) fadingSince.delete(tab)
      else if (!fadingSince.has(tab)) fadingSince.set(tab, d.at)
    for (const tab of fadingSince.keys()) if (!counts.has(tab)) fadingSince.delete(tab)
    last = hasTabs ? counts : null
  }

  return out
}
